from fastapi import APIRouter, Depends, HTTPException, status
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
)
from app.services.pothole_detector import PotholeDetector

router = APIRouter(
    prefix="/potholes",
    tags=["Pothole Detection"],
)

detector = PotholeDetector()


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
        return PotholeDetectResponse(**result)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Frame processing error: {str(exc)}",
        ) from exc


@router.post(
    "/save",
    response_model=list[PotholeRecordResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Save Pothole Detections to Road Audit Report",
)
def save_potholes_to_audit(
    payload: PotholeBatchSaveRequest,
    db: Session = Depends(get_db),
):
    """
    Saves a batch of verified pothole detections to a specific audit.
    Also updates the audit's compliance score to reflect pavement distress.
    """
    audit = db.query(Audit).filter(Audit.id == payload.audit_id).first()
    if not audit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Audit with ID {payload.audit_id} not found.",
        )

    records = []
    penalty = 0.0

    for item in payload.detections:
        rec = PotholeDetection(
            audit_id=payload.audit_id,
            latitude=item.latitude,
            longitude=item.longitude,
            confidence=item.confidence,
            severity=item.severity,
            depth_cm=item.depth_cm,
            risk_score=item.risk_score,
            area_ratio=item.area_ratio,
            geometry_json=item.geometry_json,
            snapshot_image=item.snapshot_image,
            speed_kmh=item.speed_kmh,
            detected_at=item.detected_at,
        )
        db.add(rec)
        records.append(rec)

        # Calculate penalty for compliance score
        if item.severity == "severe":
            penalty += 4.5
        elif item.severity == "moderate":
            penalty += 2.5
        else:
            penalty += 1.0

    # Adjust compliance score based on potholes found
    if audit.compliance_score is not None and penalty > 0:
        new_score = max(20.0, round(audit.compliance_score - penalty, 1))
        audit.compliance_score = new_score

    db.commit()

    for rec in records:
        db.refresh(rec)

    return records


@router.get(
    "/audit/{audit_id}",
    response_model=AuditPotholesSummary,
    summary="Get All Potholes for an Audit Report",
)
def get_potholes_for_audit(
    audit_id: int,
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

    return AuditPotholesSummary(
        audit_id=audit_id,
        total_potholes=len(potholes),
        severe_count=severe,
        moderate_count=moderate,
        minor_count=minor,
        detections=[PotholeRecordResponse.model_validate(p) for p in potholes],
    )
