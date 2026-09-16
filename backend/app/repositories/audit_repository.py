from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit import Audit


class AuditRepository:
    """
    Handles database operations related to Audit records.
    """

    def __init__(self, db: Session):
        self.db = db

    # -------------------------
    # Create
    # -------------------------

    def create(self, audit: Audit) -> Audit:
        """
        Create and persist a new audit.
        """
        self.db.add(audit)
        self.db.commit()
        self.db.refresh(audit)

        return audit

    # -------------------------
    # Read
    # -------------------------

    def get_by_id(self, audit_id: int) -> Audit | None:
        """
        Get an audit by its primary key.
        """
        statement = select(Audit).where(
            Audit.id == audit_id
        )

        return self.db.scalar(statement)

    def get_all(self) -> list[Audit]:
        """
        Get all audits ordered by newest first.
        """
        statement = select(Audit).order_by(
            Audit.created_at.desc()
        )

        return list(self.db.scalars(statement).all())

    # -------------------------
    # Update
    # -------------------------

    def update_status(
        self,
        audit: Audit,
        status: str,
    ) -> Audit:
        """
        Update the status of an audit.
        """
        audit.status = status

        self.db.commit()
        self.db.refresh(audit)

        return audit

    def update_compliance_score(
        self,
        audit: Audit,
        compliance_score: float,
    ) -> Audit:
        """
        Update the final compliance score of an audit.
        """
        audit.compliance_score = compliance_score

        self.db.commit()
        self.db.refresh(audit)

        return audit

    # -------------------------
    # Delete
    # -------------------------

    def delete(self, audit: Audit) -> None:
        """
        Delete an audit.
        Related segments and checklist items are
        deleted through the SQLAlchemy cascade.
        """
        self.db.delete(audit)
        self.db.commit()