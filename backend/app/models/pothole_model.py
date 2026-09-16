from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

if TYPE_CHECKING:
    from app.models.audit import Audit


class PotholeDetection(Base):
    """
    Standalone database model for storing detected potholes associated with road audits.
    """
    __tablename__ = "pothole_detections"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    # Linked audit
    audit_id: Mapped[int] = mapped_column(
        ForeignKey("audits.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Geographic coordinates
    latitude: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    longitude: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    # Detection metrics
    confidence: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )

    # Severity classification: "minor", "moderate", "severe"
    severity: Mapped[str] = mapped_column(
        String(50),
        default="moderate",
        nullable=False,
    )

    # OpenCV Estimated Depth in Centimeters
    depth_cm: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )

    # OpenCV Engineering Risk Score (0 - 100)
    risk_score: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )

    # Estimated pothole surface area in square pixels or relative percentage
    area_ratio: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )

    # Bounding box & mask polygon points stored as JSON string for review
    geometry_json: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # Snapshot evidence (Base64 data URI or file reference)
    snapshot_image: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # Vehicle speed at detection in km/h if available
    speed_kmh: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    detected_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )

    # Relationship to audit
    audit: Mapped["Audit"] = relationship(
        "Audit",
        backref="pothole_detections",
    )
