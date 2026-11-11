from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class PotholeScanSession(Base):
    """
    One pothole scanner run. Every scan with recorded potholes is kept here, with or without an audit,
    so the History page can list it and rebuild its PDF report at any time.
    """

    __tablename__ = "pothole_scan_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # Scanner-generated identifier: re-saving the same scan updates this row instead of adding a new one
    client_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)

    # Optional link to an audit; the scan stays in History if that audit is deleted
    audit_id: Mapped[int | None] = mapped_column(
        ForeignKey("audits.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    title: Mapped[str | None] = mapped_column(String(255), nullable=True)

    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # GPS distance driven or walked during the scan, in metres
    distance_m: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow, nullable=False
    )
