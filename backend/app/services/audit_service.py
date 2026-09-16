from sqlalchemy.orm import Session

from app.models.audit import Audit
from app.repositories.audit_repository import AuditRepository
from app.schemas.audit import AuditCreate


class AuditService:
    """
    Handles the business logic for road safety audits.
    """

    ALLOWED_ROAD_CLASSES = {
        "local",
        "collector",
        "arterial",
    }

    MIN_RADIUS_M = 100
    MAX_RADIUS_M = 10000

    def __init__(self, db: Session):
        self.repository = AuditRepository(db)

    # -------------------------
    # Create audit
    # -------------------------

    def create_audit(self, data: AuditCreate) -> Audit:
        """
        Validate audit configuration and create a new audit.
        """

        self._validate_road_class(data.road_class)
        self._validate_radius(data.radius_m)

        audit = Audit(
            location_name=data.location_name,
            location_address=data.location_address,
            center_lat=data.center_lat,
            center_lng=data.center_lng,
            radius_m=data.radius_m,
            road_class=data.road_class,
            status="pending",
        )

        return self.repository.create(audit)

    # -------------------------
    # Get audit
    # -------------------------

    def get_audit(self, audit_id: int) -> Audit | None:
        """
        Get an audit by ID.
        """

        return self.repository.get_by_id(audit_id)

    # -------------------------
    # Get audit history
    # -------------------------

    def get_all_audits(self) -> list[Audit]:
        """
        Get all audits.
        """

        return self.repository.get_all()

    # -------------------------
    # Update status
    # -------------------------

    def update_status(
        self,
        audit_id: int,
        status: str,
    ) -> Audit | None:
        """
        Update the status of an audit.
        """

        audit = self.repository.get_by_id(audit_id)

        if audit is None:
            return None

        return self.repository.update_status(
            audit,
            status,
        )

    # -------------------------
    # Update compliance score
    # -------------------------

    def update_compliance_score(
        self,
        audit_id: int,
        compliance_score: float,
    ) -> Audit | None:
        """
        Update the compliance score of an audit.
        """

        audit = self.repository.get_by_id(audit_id)

        if audit is None:
            return None

        if not 0 <= compliance_score <= 100:
            raise ValueError(
                "Compliance score must be between 0 and 100."
            )

        return self.repository.update_compliance_score(
            audit,
            compliance_score,
        )

    # -------------------------
    # Delete audit
    # -------------------------

    def delete_audit(self, audit_id: int) -> bool:
        """
        Delete an audit by ID.

        Returns:
            True if deleted.
            False if audit does not exist.
        """

        audit = self.repository.get_by_id(audit_id)

        if audit is None:
            return False

        self.repository.delete(audit)

        return True

    # -------------------------
    # Validation
    # -------------------------

    def _validate_road_class(
        self,
        road_class: str,
    ) -> None:
        """
        Validate the road classification.
        """

        if road_class not in self.ALLOWED_ROAD_CLASSES:
            raise ValueError(
                "Invalid road class. "
                "Allowed values: local, collector, arterial."
            )

    def _validate_radius(
        self,
        radius_m: int,
    ) -> None:
        """
        Validate the audit radius.
        """

        if not (
            self.MIN_RADIUS_M
            <= radius_m
            <= self.MAX_RADIUS_M
        ):
            raise ValueError(
                f"Radius must be between "
                f"{self.MIN_RADIUS_M} and "
                f"{self.MAX_RADIUS_M} meters."
            )