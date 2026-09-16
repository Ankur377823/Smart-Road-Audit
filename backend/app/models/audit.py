from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


if TYPE_CHECKING:
    from app.models.segment import Segment
    from app.models.checklist import ChecklistItem


class Audit(Base):
    __tablename__ = "audits"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    # -------------------------
    # Location information
    # -------------------------

    location_name: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    location_address: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
    )

    center_lat: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    center_lng: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    # -------------------------
    # Audit configuration
    # -------------------------

    radius_m: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    road_class: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    # -------------------------
    # Audit result
    # -------------------------

    status: Mapped[str] = mapped_column(
        String(50),
        default="pending",
        nullable=False,
    )

    compliance_score: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    # -------------------------
    # Relationships
    # -------------------------

    segments: Mapped[list["Segment"]] = relationship(
        "Segment",
        back_populates="audit",
        cascade="all, delete-orphan",
    )

    checklist_items: Mapped[list["ChecklistItem"]] = relationship(
        "ChecklistItem",
        back_populates="audit",
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

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False,
    )