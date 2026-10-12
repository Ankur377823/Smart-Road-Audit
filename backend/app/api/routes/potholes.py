import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.audit import Audit
from app.models.pothole_model import PotholeDetection
from app.schemas.pothole_schema import (
    AuditPotholesSummary,
    PotholeBatchSaveRequest,
    PotholeDetectRequest,
    PotholeDetectResponse,
    PotholeRecordResponse,
    PotholeSaveItem,
    PotholeSaveResponse,
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
