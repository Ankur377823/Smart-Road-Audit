from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

if TYPE_CHECKING:
    from app.models.audit import Audit


class PotholeDetection(Base):
    """
    Standalone database model for storing detected potholes associated with road audits.
    """
    __tablename__ = "pothole_detections"
    __table_args__ = (
        # Re-saving the same scanner session must not create duplicates
        UniqueConstraint("audit_id", "client_id", name="uq_pothole_audit_client"),
    )

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

    # Scanner-generated identifier (idempotent saves)
    client_id: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    # Geographic coordinates (null when no position was available)
    latitude: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    longitude: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    # Road-snapped coordinates (Google Roads nearestRoads), when available
    snapped_latitude: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    snapped_longitude: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    # Where the coordinates came from: "gps", "audit_center" or "none"
    location_source: Mapped[str] = mapped_column(
        String(20),
        default="gps",
        nullable=False,
    )

    # Reported horizontal GPS accuracy in metres
    gps_accuracy_m: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
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
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationship to audit
    audit: Mapped["Audit"] = relationship(
        "Audit",
        backref="pothole_detections",
    )
