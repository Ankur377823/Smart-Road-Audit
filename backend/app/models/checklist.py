from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


if TYPE_CHECKING:
    from app.models.audit import Audit
    from app.models.segment import Segment


class ChecklistItem(Base):
    __tablename__ = "checklist_items"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    # -------------------------
    # Foreign keys
    # -------------------------

    audit_id: Mapped[int] = mapped_column(
        ForeignKey("audits.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    segment_id: Mapped[int | None] = mapped_column(
        ForeignKey("segments.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    # -------------------------
    # Checklist information
    # -------------------------

    category: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    code: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    question: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(50),
        default="pending",
        nullable=False,
    )

    reason: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    severity: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )

    # -------------------------
    # Automation information
    # -------------------------

    automated: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    field_verification_required: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    # -------------------------
    # Relationships
    # -------------------------

    audit: Mapped["Audit"] = relationship(
        "Audit",
        back_populates="checklist_items",
    )

    segment: Mapped["Segment | None"] = relationship(
        "Segment",
        back_populates="checklist_items",
    )

    # -------------------------
    # Timestamp
    # -------------------------

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )