from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.repositories.checklist_repository import ChecklistRepository
from app.schemas.checklist import ChecklistResponse


router = APIRouter(
    prefix="/checklist",
    tags=["Checklist"],
)


@router.get(
    "/{item_id}",
    response_model=ChecklistResponse,
)
def get_checklist_item(
    item_id: int,
    db: Session = Depends(get_db),
):
    """
    Get a single checklist item by ID.
    """

    repository = ChecklistRepository(db)

    item = repository.get_by_id(item_id)

    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Checklist item not found.",
        )

    return item


@router.get(
    "/audit/{audit_id}",
    response_model=list[ChecklistResponse],
)
def get_audit_checklist(
    audit_id: int,
    db: Session = Depends(get_db),
):
    """
    Get all checklist items belonging to an audit.
    """

    repository = ChecklistRepository(db)

    return repository.get_by_audit_id(audit_id)


@router.get(
    "/segment/{segment_id}",
    response_model=list[ChecklistResponse],
)
def get_segment_checklist(
    segment_id: int,
    db: Session = Depends(get_db),
):
    """
    Get all checklist items belonging to a road segment.
    """

    repository = ChecklistRepository(db)

    return repository.get_by_segment_id(segment_id)