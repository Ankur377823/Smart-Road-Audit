from sqlalchemy.orm import Session

from app.models.audit import Audit
from app.models.segment import Segment
from app.repositories.audit_repository import AuditRepository
from app.repositories.segment_repository import SegmentRepository
from app.services.segmentation import SegmentationService


class AuditWorkflowService:
    """
    Coordinates the complete audit-processing workflow.

    This service connects:
        Audit
        ↓
        Road data
        ↓
        Segmentation
        ↓
        Database

    More processing stages such as metrics, risk scoring,
    and checklist generation will be added later.
    """

    def __init__(self, db: Session):
        self.db = db

        self.audit_repository = AuditRepository(db)
        self.segment_repository = SegmentRepository(db)

        self.segmentation_service = SegmentationService()

    def get_audit(self, audit_id: int) -> Audit | None:
        return self.audit_repository.get_by_id(audit_id)

    def create_segments(
        self,
        audit_id: int,
        roads: list[dict],
    ) -> list[Segment]:

        audit = self.audit_repository.get_by_id(audit_id)

        if audit is None:
            raise ValueError(
                f"Audit with id {audit_id} not found."
            )

        if not roads:
            return []

        # --------------------------------------------------
        # Convert road data into segments
        # --------------------------------------------------

        segment_data = (
            self.segmentation_service.segment_roads(
                roads
            )
        )

        # --------------------------------------------------
        # Convert segment data into database models
        # --------------------------------------------------

        segments: list[Segment] = []

        for data in segment_data:

            segment = Segment(
                audit_id=audit.id,
                segment_code=data.segment_code,
                road_name=data.road_name,
                road_class=data.road_class,
                length_m=data.length_m,
                geometry=data.geometry,
            )

            segments.append(segment)

        # --------------------------------------------------
        # Save segments
        # --------------------------------------------------

        return self.segment_repository.create_many(
            segments
        )

    def process_roads(
        self,
        audit_id: int,
        roads: list[dict],
    ) -> list[Segment]:

        """
        Main entry point for processing road data.

        Currently:
            Road data
                ↓
            Segmentation
                ↓
            PostgreSQL

        Later this method will also run:
            Metrics
            Risk scoring
            Checklist generation
        """

        return self.create_segments(
            audit_id=audit_id,
            roads=roads,
        )