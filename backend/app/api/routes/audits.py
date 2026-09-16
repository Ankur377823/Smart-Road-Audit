from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.audit import AuditCreate, AuditResponse, AuditSummary
from app.services.audit_service import AuditService


router = APIRouter(
    prefix="/audits",
    tags=["Audits"],
)


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
    """

    service = AuditService(db)

    try:
        audit = service.create_audit(data)

        return audit

    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.get(
    "",
    response_model=list[AuditSummary],
)
def get_audits(
    db: Session = Depends(get_db),
):
    """
    Get all audits for the audit history.
    """

    service = AuditService(db)

    return service.get_all_audits()


@router.get(
    "/{audit_id}",
    response_model=AuditResponse,
)
def get_audit(
    audit_id: int,
    db: Session = Depends(get_db),
):
    """
    Get a single audit by ID.
    """

    service = AuditService(db)

    audit = service.get_audit(audit_id)

    if audit is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit not found.",
        )

    return audit


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
    Update the status of an audit.
    """

    service = AuditService(db)

    audit = service.update_status(
        audit_id=audit_id,
        status=status_value,
    )

    if audit is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit not found.",
        )

    return audit


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
    Update the compliance score of an audit.
    """

    service = AuditService(db)

    try:
        audit = service.update_compliance_score(
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


@router.delete(
    "/{audit_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_audit(
    audit_id: int,
    db: Session = Depends(get_db),
):
    """
    Delete an audit.
    """

    service = AuditService(db)

    deleted = service.delete_audit(audit_id)

    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit not found.",
        )

    return None