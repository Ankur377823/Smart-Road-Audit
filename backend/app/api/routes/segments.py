from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.repositories.segment_repository import SegmentRepository
from app.schemas.segment import SegmentResponse


router = APIRouter(
    prefix="/segments",
    tags=["Segments"],
)


@router.get(
    "/{segment_id}",
    response_model=SegmentResponse,
)
def get_segment(
    segment_id: int,
    db: Session = Depends(get_db),
):
    """
    Get a single road segment by ID.
    """

    repository = SegmentRepository(db)

    segment = repository.get_by_id(segment_id)

    if segment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Segment not found.",
        )

    return segment


@router.get(
    "/audit/{audit_id}",
    response_model=list[SegmentResponse],
)
def get_audit_segments(
    audit_id: int,
    db: Session = Depends(get_db),
):
    """
    Get all road segments belonging to an audit.
    """

    repository = SegmentRepository(db)

    return repository.get_by_audit_id(audit_id)