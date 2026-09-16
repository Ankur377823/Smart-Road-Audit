from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.segment import Segment


class SegmentRepository:
    """
    Handles database operations related to Segment records.
    """

    def __init__(self, db: Session):
        self.db = db

    # -------------------------
    # Create
    # -------------------------

    def create(self, segment: Segment) -> Segment:
        """
        Create and persist a new segment.
        """
        self.db.add(segment)
        self.db.commit()
        self.db.refresh(segment)

        return segment

    def create_many(self, segments: list[Segment]) -> list[Segment]:
        """
        Create and persist multiple segments.
        """
        self.db.add_all(segments)
        self.db.commit()

        for segment in segments:
            self.db.refresh(segment)

        return segments

    # -------------------------
    # Read
    # -------------------------

    def get_by_id(self, segment_id: int) -> Segment | None:
        """
        Get a segment by its primary key.
        """
        statement = select(Segment).where(
            Segment.id == segment_id
        )

        return self.db.scalar(statement)

    def get_by_audit_id(self, audit_id: int) -> list[Segment]:
        """
        Get all segments belonging to an audit.
        """
        statement = (
            select(Segment)
            .where(Segment.audit_id == audit_id)
            .order_by(Segment.id.asc())
        )

        return list(self.db.scalars(statement).all())

    # -------------------------
    # Update
    # -------------------------

    def update_risk(
        self,
        segment: Segment,
        risk_score: float,
        risk_level: str,
        risk_flags: str | None = None,
    ) -> Segment:
        """
        Update the risk information of a segment.
        """
        segment.risk_score = risk_score
        segment.risk_level = risk_level
        segment.risk_flags = risk_flags

        self.db.commit()
        self.db.refresh(segment)

        return segment

    def update_metrics(
        self,
        segment: Segment,
        gradient: float | None = None,
        curve_radius: float | None = None,
        operating_speed: float | None = None,
        traffic_level: str | None = None,
        pedestrian_activity: str | None = None,
    ) -> Segment:
        """
        Update derived safety metrics for a segment.
        """
        segment.gradient = gradient
        segment.curve_radius = curve_radius
        segment.operating_speed = operating_speed
        segment.traffic_level = traffic_level
        segment.pedestrian_activity = pedestrian_activity

        self.db.commit()
        self.db.refresh(segment)

        return segment

    # -------------------------
    # Delete
    # -------------------------

    def delete(self, segment: Segment) -> None:
        """
        Delete a segment.
        """
        self.db.delete(segment)
        self.db.commit()