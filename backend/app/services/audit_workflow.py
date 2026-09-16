from sqlalchemy.orm import Session

from app.models.audit import Audit
from app.models.segment import Segment
from app.repositories.audit_repository import AuditRepository
from app.repositories.segment_repository import SegmentRepository
from app.services.road_segmentation_service import (
    RoadSegmentationService,
)


class AuditWorkflowService:
    """
    Coordinates the processing stages of a SmartRoad Audit.

    Current workflow:

        Audit
          ↓
        Normalized road data
          ↓
        Road segmentation
          ↓
        Segment database records

    Future stages:

        Segment
          ↓
        Elevation
        Traffic
        Land use
          ↓
        Metrics
          ↓
        Risk scoring
          ↓
        Checklist
    """

    def __init__(self, db: Session):
        self.db = db

        self.audit_repository = AuditRepository(db)
        self.segment_repository = SegmentRepository(db)

        self.road_segmentation_service = (
            RoadSegmentationService()
        )

    # --------------------------------------------------
    # Audit
    # --------------------------------------------------

    def get_audit(
        self,
        audit_id: int,
    ) -> Audit | None:
        """
        Retrieve an audit from the database.
        """

        return self.audit_repository.get_by_id(
            audit_id
        )

    # --------------------------------------------------
    # Create segments
    # --------------------------------------------------

    def create_segments(
        self,
        audit_id: int,
        roads: list,
    ) -> list[Segment]:
        """
        Convert normalized road data into Segment
        database models and save them.

        The road segmentation logic is delegated to
        RoadSegmentationService.
        """

        # --------------------------------------------------
        # 1. Get audit
        # --------------------------------------------------

        audit = self.audit_repository.get_by_id(
            audit_id
        )

        if audit is None:
            raise ValueError(
                f"Audit with id {audit_id} not found."
            )

        if not roads:
            return []

        # --------------------------------------------------
        # 2. Segment roads
        # --------------------------------------------------

        segmented_roads = (
            self.road_segmentation_service.segment_roads(
                roads
            )
        )

        if not segmented_roads:
            return []

        # --------------------------------------------------
        # 3. Convert to database models
        # --------------------------------------------------

        segments: list[Segment] = []

        for data in segmented_roads:

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
        # 4. Save segments
        # --------------------------------------------------

        return self.segment_repository.create_many(
            segments
        )

    # --------------------------------------------------
    # Process roads
    # --------------------------------------------------

    def process_roads(
        self,
        audit_id: int,
        roads: list,
    ) -> list[Segment]:
        """
        Main workflow entry point for normalized road data.

        Current:

            Road data
                ↓
            Segmentation
                ↓
            PostgreSQL

        The additional analysis stages will be added
        without changing the road acquisition layer.
        """

        return self.create_segments(
            audit_id=audit_id,
            roads=roads,
        )