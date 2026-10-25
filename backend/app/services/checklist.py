from dataclasses import dataclass

from app.models.checklist import ChecklistItem
from app.models.segment import Segment


@dataclass
class ChecklistResult:
    """
    Result generated for a checklist item before it is
    stored in the database.
    """

    category: str
    code: str
    question: str
    status: str
    reason: str | None
    severity: str | None
    automated: bool
    field_verification_required: bool


class ChecklistService:
    """
    Generates road-safety checklist items based on the
    available segment information and risk findings.

    These rules are application-level screening rules.
    They should be aligned with the project's final
    IRC checklist methodology before formal use.
    """

    # -------------------------
    # Generate checklist
    # -------------------------

    def generate_for_segment(
        self,
        segment: Segment,
    ) -> list[ChecklistResult]:
        """
        Generate checklist results for a single segment.
        """

        results: list[ChecklistResult] = []

        # Include each check even when its input is unavailable. Missing data
        # is reported as pending rather than silently omitting the check.
        results.extend(
            [
                self._gradient_check(segment),
                self._curve_check(segment),
                self._speed_check(segment),
                self._traffic_check(segment),
                self._pedestrian_check(segment),
            ]
        )

        # Physical field verification
        results.append(
            self._field_verification_check(segment)
        )

        return results

    # -------------------------
    # Gradient checklist
    # -------------------------

    @staticmethod
    def _gradient_check(
        segment: Segment,
    ) -> ChecklistResult:
        if segment.gradient is None:
            return ChecklistResult(
                category="Geometry",
                code="GEO-GRADIENT",
                question="Is the longitudinal gradient appropriate for the road segment?",
                status="pending",
                reason="Gradient data is unavailable; verify this condition in the field.",
                severity=None,
                automated=True,
                field_verification_required=True,
            )

        gradient = abs(segment.gradient or 0)

        if gradient < 3:
            status = "pass"
            severity = None
            reason = "No significant gradient concern detected."

        elif gradient < 5:
            status = "review"
            severity = "medium"
            reason = (
                "Moderate gradient detected; engineering review "
                "is recommended."
            )

        else:
            status = "flagged"
            severity = "high"
            reason = (
                "Higher gradient detected; field verification "
                "and engineering review are required."
            )

        return ChecklistResult(
            category="Geometry",
            code="GEO-GRADIENT",
            question=(
                "Is the longitudinal gradient appropriate for "
                "the road segment?"
            ),
            status=status,
            reason=reason,
            severity=severity,
            automated=True,
            field_verification_required=gradient >= 5,
        )

    # -------------------------
    # Curve checklist
    # -------------------------

    @staticmethod
    def _curve_check(
        segment: Segment,
    ) -> ChecklistResult:
        radius = segment.curve_radius

        if radius is None:
            status = "pending"
            severity = None
            reason = "Curve geometry data is unavailable; verify alignment in the field."
        elif radius >= 500:
            status = "pass"
            severity = None
            reason = "No significant sharp-curve concern detected."

        elif radius >= 250:
            status = "review"
            severity = "medium"
            reason = (
                "Moderate horizontal curvature detected."
            )

        else:
            status = "flagged"
            severity = "high"
            reason = (
                "Sharp horizontal curvature detected; "
                "field verification is recommended."
            )

        return ChecklistResult(
            category="Alignment",
            code="ALI-CURVE",
            question=(
                "Does the horizontal alignment provide adequate "
                "visibility and safety for road users?"
            ),
            status=status,
            reason=reason,
            severity=severity,
            automated=True,
            field_verification_required=(
                radius is None or radius < 250
            ),
        )

    # -------------------------
    # Operating speed checklist
    # -------------------------

    @staticmethod
    def _speed_check(
        segment: Segment,
    ) -> ChecklistResult:
        if segment.operating_speed is None:
            return ChecklistResult(
                category="Speed",
                code="SPD-OPERATING",
                question="Is the operating speed appropriate for the road environment and surrounding activity?",
                status="pending",
                reason="Operating-speed data is unavailable; verify speed conditions in the field.",
                severity=None,
                automated=True,
                field_verification_required=True,
            )

        speed = segment.operating_speed or 0

        if speed <= 30:
            status = "pass"
            severity = None
            reason = "No elevated operating-speed concern detected."

        elif speed <= 50:
            status = "review"
            severity = "medium"
            reason = "Moderate operating speed detected."

        else:
            status = "flagged"
            severity = "high"
            reason = (
                "Higher operating speed detected; roadside "
                "conditions and speed management should be "
                "verified in the field."
            )

        return ChecklistResult(
            category="Speed",
            code="SPD-OPERATING",
            question=(
                "Is the operating speed appropriate for the "
                "road environment and surrounding activity?"
            ),
            status=status,
            reason=reason,
            severity=severity,
            automated=True,
            field_verification_required=speed > 50,
        )

    # -------------------------
    # Traffic checklist
    # -------------------------

    @staticmethod
    def _traffic_check(
        segment: Segment,
    ) -> ChecklistResult:
        traffic = (
            segment.traffic_level.lower()
            if segment.traffic_level
            else None
        )

        if traffic == "low":
            status = "pass"
            severity = None
            reason = "Low traffic activity detected."

        elif traffic == "medium":
            status = "review"
            severity = "medium"
            reason = (
                "Moderate traffic activity detected."
            )

        elif traffic == "high":
            status = "flagged"
            severity = "high"
            reason = (
                "High traffic activity detected; roadside "
                "safety conditions should be verified."
            )

        else:
            status = "pending"
            severity = None
            reason = "Traffic information is unavailable."

        return ChecklistResult(
            category="Traffic",
            code="TRF-ACTIVITY",
            question=(
                "Are road features adequate for the observed "
                "level of traffic activity?"
            ),
            status=status,
            reason=reason,
            severity=severity,
            automated=True,
            field_verification_required=(
                traffic is None or traffic == "high"
            ),
        )

    # -------------------------
    # Pedestrian checklist
    # -------------------------

    @staticmethod
    def _pedestrian_check(
        segment: Segment,
    ) -> ChecklistResult:
        activity = (
            segment.pedestrian_activity.lower()
            if segment.pedestrian_activity
            else None
        )

        if activity == "low":
            status = "pass"
            severity = None
            reason = "Low pedestrian activity detected."

        elif activity == "medium":
            status = "review"
            severity = "medium"
            reason = (
                "Moderate pedestrian activity detected."
            )

        elif activity == "high":
            status = "flagged"
            severity = "high"
            reason = (
                "High pedestrian activity detected; pedestrian "
                "facilities and crossing conditions require "
                "field verification."
            )

        else:
            status = "pending"
            severity = None
            reason = "Pedestrian activity information is unavailable."

        return ChecklistResult(
            category="Pedestrian",
            code="PED-ACTIVITY",
            question=(
                "Are pedestrian facilities and crossing conditions "
                "adequate for the surrounding activity?"
            ),
            status=status,
            reason=reason,
            severity=severity,
            automated=True,
            field_verification_required=(
                activity is None or activity == "high"
            ),
        )

    # -------------------------
    # Field verification
    # -------------------------

    @staticmethod
    def _field_verification_check(
        segment: Segment,
    ) -> ChecklistResult:
        """
        Create a general field-verification item.

        Certain road-safety conditions cannot be reliably
        determined from remote data alone.
        """

        return ChecklistResult(
            category="Field Verification",
            code="FIELD-VISUAL",
            question=(
                "Verify pavement condition, signs, markings, "
                "barriers, vegetation obstruction, visibility, "
                "and other physical roadside conditions."
            ),
            status="pending",
            reason=(
                "Physical conditions require on-site verification."
            ),
            severity=None,
            automated=False,
            field_verification_required=True,
        )

    # -------------------------
    # Convert to database model
    # -------------------------

    @staticmethod
    def to_model(
        result: ChecklistResult,
        audit_id: int,
        segment_id: int | None = None,
    ) -> ChecklistItem:
        """
        Convert a generated checklist result into a
        SQLAlchemy ChecklistItem model.
        """

        return ChecklistItem(
            audit_id=audit_id,
            segment_id=segment_id,
            category=result.category,
            code=result.code,
            question=result.question,
            status=result.status,
            reason=result.reason,
            severity=result.severity,
            automated=result.automated,
            field_verification_required=(
                result.field_verification_required
            ),
        )
