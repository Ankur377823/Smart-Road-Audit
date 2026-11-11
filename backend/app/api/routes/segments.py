from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.repositories.segment_repository import SegmentRepository
from app.schemas.segment import SegmentResponse, SegmentSubsectionResponse
from app.services.segmentation import SegmentationService


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

    pieces = SegmentationService.subdivide_geometry(
        segment.geometry,
        segment.length_m,
        max_subsegments=10,
    )
    if not pieces:
        pieces = [(segment.geometry, segment.length_m)]

    # Current audit metrics are segment-level, so subsection scores inherit
    # the parent's score until subsection-specific measurements are available.
    subsections = [
        {
            "subsection_number": index,
            "length_m": length,
            "geometry": geometry,
            "risk_score": segment.risk_score,
            "risk_level": segment.risk_level,
        }
        for index, (geometry, length) in enumerate(pieces, start=1)
    ]
    result = SegmentResponse.model_validate(segment)
    result.subsection_count = len(subsections)
    result.subsegments = [SegmentSubsectionResponse(**item) for item in subsections]
    if segment.risk_score is not None:
        total_length = sum(item["length_m"] for item in subsections)
        if total_length > 0:
            result.risk_score = round(
                sum(
                    item["risk_score"] * item["length_m"]
                    for item in subsections
                ) / total_length,
                2,
            )
    return result


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
