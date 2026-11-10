from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


if TYPE_CHECKING:
    from app.models.audit import Audit
    from app.models.checklist import ChecklistItem


class Segment(Base):
    __tablename__ = "segments"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    audit_id: Mapped[int] = mapped_column(
        ForeignKey("audits.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    segment_code: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    road_name: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    road_class: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    terrain_class: Mapped[str | None] = mapped_column(
        String(50), nullable=True,
    )

    length_m: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    geometry: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # -------------------------
    # Derived safety metrics
    # -------------------------

    gradient: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    curve_radius: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    curve_radius_status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="unavailable",
    )

    operating_speed: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    max_speed: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    traffic_level: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    traffic_delay_percent: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    traffic_source: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    pedestrian_activity: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    pedestrian_activity_source: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    pedestrian_place_count: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    # -------------------------
    # Risk information
    # -------------------------

    risk_score: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    risk_level: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    risk_flags: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # -------------------------
    # Relationships
    # -------------------------

    audit: Mapped["Audit"] = relationship(
        "Audit",
        back_populates="segments",
    )

    checklist_items: Mapped[list["ChecklistItem"]] = relationship(
        "ChecklistItem",
        back_populates="segment",
        cascade="all, delete-orphan",
    )

    # -------------------------
    # Timestamps
    # -------------------------

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )
