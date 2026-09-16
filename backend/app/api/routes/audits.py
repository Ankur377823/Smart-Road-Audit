from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.audit import (
    AuditCreate,
    AuditResponse,
    AuditSummary,
)
from app.services.audit_processing_service import (
    AuditProcessingService,
)
from app.services.audit_service import AuditService


router = APIRouter(
    prefix="/audits",
    tags=["Audits"],
)


# ==========================================================
# CREATE AUDIT
# ==========================================================

@router.post(
    "",
    response_model=AuditResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_audit(
    data: AuditCreate,
    db: Session = Depends(get_db),
):
    """
    Create a new road safety audit.

    The audit is initially created with status='pending'.
    """

    try:
        audit = AuditService(
            db
        ).create_audit(data)

        return audit

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


# ==========================================================
# LIST AUDITS
# ==========================================================

@router.get(
    "",
    response_model=list[AuditSummary],
)
def get_audits(
    db: Session = Depends(get_db),
):
    """
    Return all previously created audits.
    """

    return AuditService(
        db
    ).get_all_audits()


# ==========================================================
# GET SINGLE AUDIT
# ==========================================================

@router.get(
    "/{audit_id}",
    response_model=AuditResponse,
)
def get_audit(
    audit_id: int,
    db: Session = Depends(get_db),
):
    """
    Return one audit by ID.
    """

    audit = AuditService(
        db
    ).get_audit(
        audit_id
    )

    if audit is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit not found.",
        )

    return audit


# ==========================================================
# PROCESS AUDIT
# ==========================================================

@router.post(
    "/{audit_id}/process",
)
async def process_audit(
    audit_id: int,
    db: Session = Depends(get_db),
):
    """
    Start processing an existing audit.

    Current processing pipeline:

        Audit
          ↓
        Road snapping
          ↓
        Google Routes API
          ↓
        Road sections
          ↓
        Segmentation
          ↓
        PostgreSQL
    """

    try:

        result = await AuditProcessingService(
            db
        ).process_audit(
            audit_id=audit_id,
        )

        return {
            "message": "Audit processing completed.",
            "audit_id": result.audit_id,
            "road_count": result.road_count,
            "segment_count": result.segment_count,
            "status": result.status,
        }

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    except Exception:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Audit processing failed.",
        )


# ==========================================================
# UPDATE AUDIT STATUS
# ==========================================================

@router.patch(
    "/{audit_id}/status",
    response_model=AuditResponse,
)
def update_audit_status(
    audit_id: int,
    status_value: str,
    db: Session = Depends(get_db),
):
    """
    Update the processing status of an audit.
    """

    audit = AuditService(
        db
    ).update_status(
        audit_id=audit_id,
        status=status_value,
    )

    if audit is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit not found.",
        )

    return audit


# ==========================================================
# UPDATE COMPLIANCE SCORE
# ==========================================================

@router.patch(
    "/{audit_id}/score",
    response_model=AuditResponse,
)
def update_compliance_score(
    audit_id: int,
    compliance_score: float,
    db: Session = Depends(get_db),
):
    """
    Update the final compliance score.

    Score must be between 0 and 100.
    """

    try:

        audit = AuditService(
            db
        ).update_compliance_score(
            audit_id=audit_id,
            compliance_score=compliance_score,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    if audit is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit not found.",
        )

    return audit


# ==========================================================
# DELETE AUDIT
# ==========================================================

@router.delete(
    "/{audit_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_audit(
    audit_id: int,
    db: Session = Depends(get_db),
):
    """
    Delete an audit and its related segments/checklist items.
    """

    deleted = AuditService(
        db
    ).delete_audit(
        audit_id
    )

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit not found.",
        )

    return None