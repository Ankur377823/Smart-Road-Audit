from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.checklist import ChecklistItem


class ChecklistRepository:
    """
    Handles database operations related to ChecklistItem records.
    """

    def __init__(self, db: Session):
        self.db = db

    # -------------------------
    # Create
    # -------------------------

    def create(self, item: ChecklistItem) -> ChecklistItem:
        """
        Create and persist a new checklist item.
        """
        self.db.add(item)
        self.db.commit()
        self.db.refresh(item)

        return item

    def create_many(
        self,
        items: list[ChecklistItem],
    ) -> list[ChecklistItem]:
        """
        Create and persist multiple checklist items.
        """
        self.db.add_all(items)
        self.db.commit()

        for item in items:
            self.db.refresh(item)

        return items

    # -------------------------
    # Read
    # -------------------------

    def get_by_id(
        self,
        item_id: int,
    ) -> ChecklistItem | None:
        """
        Get a checklist item by its primary key.
        """
        statement = select(ChecklistItem).where(
            ChecklistItem.id == item_id
        )

        return self.db.scalar(statement)

    def get_by_audit_id(
        self,
        audit_id: int,
    ) -> list[ChecklistItem]:
        """
        Get all checklist items belonging to an audit.
        """
        statement = (
            select(ChecklistItem)
            .where(ChecklistItem.audit_id == audit_id)
            .order_by(ChecklistItem.id.asc())
        )

        return list(self.db.scalars(statement).all())

    def get_by_segment_id(
        self,
        segment_id: int,
    ) -> list[ChecklistItem]:
        """
        Get all checklist items associated with a segment.
        """
        statement = (
            select(ChecklistItem)
            .where(ChecklistItem.segment_id == segment_id)
            .order_by(ChecklistItem.id.asc())
        )

        return list(self.db.scalars(statement).all())

    # -------------------------
    # Update
    # -------------------------

    def update_status(
        self,
        item: ChecklistItem,
        status: str,
    ) -> ChecklistItem:
        """
        Update the status of a checklist item.
        """
        item.status = status

        self.db.commit()
        self.db.refresh(item)

        return item

    def update_result(
        self,
        item: ChecklistItem,
        status: str,
        reason: str | None = None,
        severity: str | None = None,
        field_verification_required: bool = False,
    ) -> ChecklistItem:
        """
        Update the result and verification information
        of a checklist item.
        """
        item.status = status
        item.reason = reason
        item.severity = severity
        item.field_verification_required = field_verification_required

        self.db.commit()
        self.db.refresh(item)

        return item

    # -------------------------
    # Delete
    # -------------------------

    def delete(self, item: ChecklistItem) -> None:
        """
        Delete a checklist item.
        """
        self.db.delete(item)
        self.db.commit()