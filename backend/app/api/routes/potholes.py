import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.audit import Audit
from app.models.pothole_model import PotholeDetection
from app.models.pothole_scan_session import PotholeScanSession
from app.schemas.pothole_schema import (
    AuditPotholesSummary,
    PotholeBatchSaveRequest,
    PotholeDetectRequest,
    PotholeDetectResponse,
    PotholeRecordResponse,
    PotholeSaveItem,
    PotholeSaveResponse,
    ScanSessionAttachRequest,
    ScanSessionDetail,
    ScanSessionSaveRequest,
    ScanSessionSummary,
)
from app.services.irc82 import classify_pothole
from app.services.pothole_detector import PotholeDetector
from app.services.sp88 import assess_risk

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/potholes",
    tags=["Pothole Detection"],
)

detector = PotholeDetector()

SEVERITY_PENALTY = {"severe": 4.5, "moderate": 2.5, "minor": 1.0}
MIN_COMPLIANCE_SCORE = 20.0
NEAREST_ROADS_BATCH = 100
SNAP_TIMEOUT_S = 8.0


@router.post(
    "/detect",
    response_model=PotholeDetectResponse,
    summary="Run YOLO Segmentation on Camera Video Frame",
)
def detect_potholes_in_frame(payload: PotholeDetectRequest):
    """
    Accepts an image frame (Base64) with optional GPS coordinates,
    runs the YOLO segmentation model, and returns bounding boxes and polygon masks.
    """
    try:
        result = detector.detect_in_frame(
            image_base64=payload.image_base64,
            conf_threshold=payload.conf_threshold,
            latitude=payload.latitude,
            longitude=payload.longitude,
            speed_kmh=payload.speed_kmh,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid frame: {exc}",
        ) from exc
    except Exception as exc:
        logger.exception("Pothole inference failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Pothole detection failed on the server.",
        ) from exc
    return PotholeDetectResponse(**result)


async def _snap_to_roads(items: list[PotholeSaveItem]) -> dict[int, tuple[float, float]]:
    """
    Best-effort road snapping of GPS-sourced potholes. Returns {item_index: (lat, lng)}.
    Any failure (no API key, quota, timeout) just leaves potholes unsnapped.
    """
    candidates = [
        (idx, (item.latitude, item.longitude))
        for idx, item in enumerate(items)
        if item.location_source == "gps" and item.latitude is not None and item.longitude is not None
    ]
    if not candidates:
        return {}

    try:
        from app.providers.google_roads import GoogleRoadsProvider
        provider = GoogleRoadsProvider()
    except Exception:
        return {}

    snapped: dict[int, tuple[float, float]] = {}
    try:
        for start in range(0, len(candidates), NEAREST_ROADS_BATCH):
            batch = candidates[start:start + NEAREST_ROADS_BATCH]
            data = await asyncio.wait_for(
                provider.nearest_roads([point for _, point in batch]),
                timeout=SNAP_TIMEOUT_S,
            )
            for sp in data.get("snappedPoints", []):
                original = sp.get("originalIndex")
                loc = sp.get("location") or {}
                if original is None or original >= len(batch) or "latitude" not in loc:
                    continue
                item_idx = batch[original][0]
                # nearestRoads may return several roads per point; keep the first
                snapped.setdefault(item_idx, (float(loc["latitude"]), float(loc["longitude"])))
    except Exception as exc:
        logger.warning("Pothole road snapping skipped: %s", exc)
    return snapped


@router.post(
    "/save",
    response_model=PotholeSaveResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Save Pothole Detections to Road Audit Report",
)
async def save_potholes_to_audit(
    payload: PotholeBatchSaveRequest,
    db: Session = Depends(get_db),
):
    """
    Saves a batch of verified pothole detections to a specific audit.
    Saves are idempotent per client_id, and only newly saved potholes
    reduce the audit's compliance score.
    """
    audit = db.query(Audit).filter(Audit.id == payload.audit_id).first()
    if not audit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Audit with ID {payload.audit_id} not found.",
        )

    incoming_ids = {item.client_id for item in payload.detections if item.client_id}
    existing_ids: set[str] = set()
    if incoming_ids:
        existing_ids = {
            row[0]
            for row in db.query(PotholeDetection.client_id)
            .filter(
                PotholeDetection.audit_id == payload.audit_id,
                PotholeDetection.client_id.in_(incoming_ids),
            )
            .all()
        }

    new_items: list[PotholeSaveItem] = []
    seen: set[str] = set()
    for item in payload.detections:
        if item.client_id and (item.client_id in existing_ids or item.client_id in seen):
            continue
        if item.client_id:
            seen.add(item.client_id)
        new_items.append(item)

    snapped = await _snap_to_roads(new_items)

    records = []
    penalty = 0.0
    for idx, item in enumerate(new_items):
        snap_lat, snap_lng = snapped.get(idx, (None, None))
        # Single source of truth for class and priority: IRC:82-2015 from depth and width
        irc = classify_pothole(item.depth_cm * 10 if item.depth_cm is not None else None, item.width_mm)
        if item.depth_cm is None and item.width_mm is None:
            # Nothing measurable: keep the scanner's class rather than defaulting to "small"
            irc = {**irc, "severity": item.severity or "moderate"}
        risk = assess_risk(irc["severity"], item.speed_kmh, audit.road_class)
        rec = PotholeDetection(
            audit_id=payload.audit_id,
            client_id=item.client_id,
            latitude=item.latitude,
            longitude=item.longitude,
            snapped_latitude=snap_lat,
            snapped_longitude=snap_lng,
            location_source=item.location_source,
            gps_accuracy_m=item.gps_accuracy_m,
            confidence=item.confidence,
            severity=irc["severity"],
            depth_cm=item.depth_cm,
            depth_source=item.depth_source,
            width_mm=item.width_mm,
            area_m2=item.area_m2,
            risk_level=risk["risk_level"],
            action_priority=risk["priority"],
            risk_score=irc["size_index"],
            area_ratio=item.area_ratio,
            geometry_json=item.geometry_json,
            snapshot_image=item.snapshot_image,
            speed_kmh=item.speed_kmh,
            detected_at=item.detected_at,
        )
        db.add(rec)
        records.append(rec)
        penalty += SEVERITY_PENALTY[irc["severity"]]

    # Adjust compliance score based on newly recorded potholes only
    if audit.compliance_score is not None and penalty > 0:
        audit.compliance_score = max(MIN_COMPLIANCE_SCORE, round(audit.compliance_score - penalty, 1))

    db.commit()

    for rec in records:
        db.refresh(rec)

    return PotholeSaveResponse(
        saved=[PotholeRecordResponse.model_validate(r) for r in records],
        skipped_duplicates=len(payload.detections) - len(new_items),
        compliance_score=audit.compliance_score,
    )


@router.get(
    "/audit/{audit_id}",
    response_model=AuditPotholesSummary,
    summary="Get All Potholes for an Audit Report",
)
def get_potholes_for_audit(
    audit_id: int,
    include_snapshots: bool = Query(True, description="Set false to omit Base64 snapshot images"),
    db: Session = Depends(get_db),
):
    """
    Retrieves all detected potholes, severity breakdown, and snapshots for an audit report.
    """
    potholes = (
        db.query(PotholeDetection)
        .filter(PotholeDetection.audit_id == audit_id)
        .order_by(PotholeDetection.detected_at.desc())
        .all()
    )

    severe = sum(1 for p in potholes if p.severity == "severe")
    moderate = sum(1 for p in potholes if p.severity == "moderate")
    minor = sum(1 for p in potholes if p.severity == "minor")

    detections = [PotholeRecordResponse.model_validate(p) for p in potholes]
    if not include_snapshots:
        detections = [d.model_copy(update={"snapshot_image": None}) for d in detections]

    return AuditPotholesSummary(
        audit_id=audit_id,
        total_potholes=len(potholes),
        severe_count=severe,
        moderate_count=moderate,
        minor_count=minor,
        detections=detections,
    )


# ---------------------------------------------------------------------------
# Scan history: every scanner run is kept as a session, with or without an audit
# ---------------------------------------------------------------------------

def _classify_item(item: PotholeSaveItem, road_class: str | None) -> tuple[dict, dict]:
    irc = classify_pothole(item.depth_cm * 10 if item.depth_cm is not None else None, item.width_mm)
    if item.depth_cm is None and item.width_mm is None:
        irc = {**irc, "severity": item.severity or "moderate"}
    return irc, assess_risk(irc["severity"], item.speed_kmh, road_class)


def _session_summary(
    db: Session,
    session: PotholeScanSession,
    potholes: list | None = None,
    audit_name: str | None = None,
) -> dict:
    """potholes: rows with .severity and .action_priority (loaded when not given)."""
    if potholes is None:
        potholes = (
            db.query(PotholeDetection.severity, PotholeDetection.action_priority)
            .filter(PotholeDetection.scan_session_id == session.id)
            .all()
        )
    audit_id = session.audit_id
    if audit_id is not None and audit_name is None:
        audit = db.query(Audit).filter(Audit.id == audit_id).first()
        if audit is None:
            audit_id = None  # the audit was deleted (SQLite does not clear the link itself)
        else:
            audit_name = audit.location_name or f"Audit #{audit.id}"
    fields = ("id", "client_id", "title", "started_at", "ended_at", "distance_m", "created_at", "updated_at")
    return {
        **{name: getattr(session, name) for name in fields},
        "audit_id": audit_id,
        "audit_name": audit_name,
        "total_potholes": len(potholes),
        "severe_count": sum(1 for p in potholes if p.severity == "severe"),
        "moderate_count": sum(1 for p in potholes if p.severity == "moderate"),
        "minor_count": sum(1 for p in potholes if p.severity == "minor"),
        "essential_count": sum(1 for p in potholes if p.action_priority == "Essential"),
    }


def _link_session_to_audit(db: Session, session: PotholeScanSession, audit: Audit) -> None:
    """Add a scan's potholes to an audit; only potholes new to that audit lower its compliance score."""
    already_in_audit = {
        row[0]
        for row in db.query(PotholeDetection.client_id)
        .filter(PotholeDetection.audit_id == audit.id, PotholeDetection.client_id.isnot(None))
        .all()
    }
    penalty = 0.0
    for pothole in db.query(PotholeDetection).filter(PotholeDetection.scan_session_id == session.id).all():
        if pothole.audit_id == audit.id:
            continue
        if pothole.client_id and pothole.client_id in already_in_audit:
            continue  # saved to this audit earlier through the per-audit save
        pothole.audit_id = audit.id
        risk = assess_risk(pothole.severity, pothole.speed_kmh, audit.road_class)
        pothole.risk_level = risk["risk_level"]
        pothole.action_priority = risk["priority"]
        penalty += SEVERITY_PENALTY.get(pothole.severity, 0.0)
    if audit.compliance_score is not None and penalty > 0:
        audit.compliance_score = max(MIN_COMPLIANCE_SCORE, round(audit.compliance_score - penalty, 1))


def _get_session_or_404(db: Session, session_id: int) -> PotholeScanSession:
    session = db.query(PotholeScanSession).filter(PotholeScanSession.id == session_id).first()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found.")
    return session


def _get_audit_or_404(db: Session, audit_id: int) -> Audit:
    audit = db.query(Audit).filter(Audit.id == audit_id).first()
    if not audit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Audit with ID {audit_id} not found.")
    return audit


@router.post(
    "/sessions",
    response_model=ScanSessionSummary,
    status_code=status.HTTP_201_CREATED,
    summary="Save a Pothole Scan to History (optionally to an audit)",
)
async def save_scan_session(payload: ScanSessionSaveRequest, db: Session = Depends(get_db)):
    """
    Creates or updates one scan in History. Potholes are matched by client_id, so saving the same scan
    again updates it (for example after entering a measured depth) instead of duplicating it.
    """
    audit = _get_audit_or_404(db, payload.audit_id) if payload.audit_id is not None else None

    session = db.query(PotholeScanSession).filter(PotholeScanSession.client_id == payload.client_id).first()
    if session is None:
        session = PotholeScanSession(client_id=payload.client_id)
        db.add(session)
    session.title = payload.title or session.title
    session.started_at = payload.started_at or session.started_at
    session.ended_at = payload.ended_at or session.ended_at
    if payload.distance_m is not None:
        session.distance_m = payload.distance_m
    if audit is not None:
        session.audit_id = audit.id
    db.flush()

    road_class = audit.road_class if audit is not None else None
    existing = {
        p.client_id: p
        for p in db.query(PotholeDetection).filter(PotholeDetection.scan_session_id == session.id).all()
        if p.client_id
    }

    new_items: list[PotholeSaveItem] = []
    seen: set[str] = set()
    for item in payload.detections:
        if item.client_id and item.client_id in seen:
            continue
        if item.client_id:
            seen.add(item.client_id)
        current = existing.get(item.client_id) if item.client_id else None
        if current is None:
            new_items.append(item)
            continue
        # Update an already saved pothole (for example a measured depth entered after the first save)
        irc, risk = _classify_item(item, road_class)
        current.depth_cm = item.depth_cm
        current.depth_source = item.depth_source
        current.width_mm = item.width_mm
        current.area_m2 = item.area_m2
        current.severity = irc["severity"]
        current.risk_score = irc["size_index"]
        current.risk_level = risk["risk_level"]
        current.action_priority = risk["priority"]

    snapped = await _snap_to_roads(new_items)
    for idx, item in enumerate(new_items):
        snap_lat, snap_lng = snapped.get(idx, (None, None))
        irc, risk = _classify_item(item, road_class)
        db.add(PotholeDetection(
            scan_session_id=session.id,
            client_id=item.client_id,
            latitude=item.latitude,
            longitude=item.longitude,
            snapped_latitude=snap_lat,
            snapped_longitude=snap_lng,
            location_source=item.location_source,
            gps_accuracy_m=item.gps_accuracy_m,
            confidence=item.confidence,
            severity=irc["severity"],
            depth_cm=item.depth_cm,
            depth_source=item.depth_source,
            width_mm=item.width_mm,
            area_m2=item.area_m2,
            risk_level=risk["risk_level"],
            action_priority=risk["priority"],
            risk_score=irc["size_index"],
            area_ratio=item.area_ratio,
            geometry_json=item.geometry_json,
            snapshot_image=item.snapshot_image,
            speed_kmh=item.speed_kmh,
            detected_at=item.detected_at,
        ))
    db.flush()

    if audit is not None:
        _link_session_to_audit(db, session, audit)

    db.commit()
    db.refresh(session)
    return ScanSessionSummary(**_session_summary(db, session))


@router.get(
    "/sessions",
    response_model=list[ScanSessionSummary],
    summary="List Saved Pothole Scans (newest first)",
)
def list_scan_sessions(
    audit_id: int | None = Query(None, description="Only scans added to this audit"),
    db: Session = Depends(get_db),
):
    query = db.query(PotholeScanSession)
    if audit_id is not None:
        query = query.filter(PotholeScanSession.audit_id == audit_id)
    sessions = query.order_by(PotholeScanSession.created_at.desc()).all()
    if not sessions:
        return []

    rows_by_session: dict[int, list] = {s.id: [] for s in sessions}
    for row in (
        db.query(PotholeDetection.scan_session_id, PotholeDetection.severity, PotholeDetection.action_priority)
        .filter(PotholeDetection.scan_session_id.in_(list(rows_by_session)))
        .all()
    ):
        rows_by_session[row.scan_session_id].append(row)

    audit_ids = {s.audit_id for s in sessions if s.audit_id is not None}
    audit_names = (
        {a.id: a.location_name or f"Audit #{a.id}" for a in db.query(Audit).filter(Audit.id.in_(audit_ids)).all()} if audit_ids else {}
    )
    return [
        ScanSessionSummary(**_session_summary(db, s, rows_by_session[s.id], audit_names.get(s.audit_id)))
        for s in sessions
    ]


@router.get(
    "/sessions/{session_id}",
    response_model=ScanSessionDetail,
    summary="Get One Saved Scan with its Potholes (for the PDF report)",
)
def get_scan_session(session_id: int, db: Session = Depends(get_db)):
    session = _get_session_or_404(db, session_id)
    potholes = (
        db.query(PotholeDetection)
        .filter(PotholeDetection.scan_session_id == session_id)
        .order_by(PotholeDetection.detected_at.asc())
        .all()
    )
    return ScanSessionDetail(
        **_session_summary(db, session, potholes),
        detections=[PotholeRecordResponse.model_validate(p) for p in potholes],
    )


@router.patch(
    "/sessions/{session_id}",
    response_model=ScanSessionSummary,
    summary="Add a Saved Scan to an Audit, or Remove the Link",
)
def attach_scan_session(session_id: int, payload: ScanSessionAttachRequest, db: Session = Depends(get_db)):
    session = _get_session_or_404(db, session_id)
    if payload.audit_id is None:
        # The potholes leave that audit but stay in History
        for pothole in db.query(PotholeDetection).filter(PotholeDetection.scan_session_id == session.id).all():
            if session.audit_id is not None and pothole.audit_id == session.audit_id:
                pothole.audit_id = None
        session.audit_id = None
    else:
        audit = _get_audit_or_404(db, payload.audit_id)
        session.audit_id = audit.id
        _link_session_to_audit(db, session, audit)
    db.commit()
    db.refresh(session)
    return ScanSessionSummary(**_session_summary(db, session))


@router.delete(
    "/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a Saved Scan and its Potholes",
)
def delete_scan_session(session_id: int, db: Session = Depends(get_db)):
    session = _get_session_or_404(db, session_id)
    db.query(PotholeDetection).filter(PotholeDetection.scan_session_id == session_id).delete(
        synchronize_session=False
    )
    db.delete(session)
    db.commit()
