from dataclasses import dataclass

from app.models.checklist import ChecklistItem
from app.models.segment import Segment
from app.services.irc_standards import (
    URBAN_MAX_GRADIENT_PERCENT,
    urban_design_speed,
    urban_minimum_curve_radius,
)


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
        if segment.terrain_class is None:
            return ChecklistResult(
                category="Geometry",
                code="GEO-GRADIENT",
                question="Is the longitudinal gradient appropriate for the road segment?",
                status="pending",
                reason="Terrain class is unavailable; apply the relevant IRC gradient limit after field verification.",
                severity=None,
                automated=True,
                field_verification_required=True,
            )

        if gradient <= URBAN_MAX_GRADIENT_PERCENT:
            status = "pass"
            severity = None
            reason = "Gradient is within the IRC:86 general maximum for urban roads."

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
            field_verification_required=gradient > URBAN_MAX_GRADIENT_PERCENT,
        )

    # -------------------------
    # Curve checklist
    # -------------------------

    @staticmethod
    def _curve_check(
        segment: Segment,
    ) -> ChecklistResult:
        radius = segment.curve_radius

        if getattr(segment, "curve_radius_status", None) == "not_defined":
            return ChecklistResult(
                category="Alignment",
                code="ALI-CURVE",
                question="Does the horizontal alignment provide adequate visibility and safety for road users?",
                status="pass",
                reason="No horizontal curve was detected in the available segment geometry.",
                severity=None,
                automated=True,
                field_verification_required=False,
            )

        minimum_radius = urban_minimum_curve_radius(
            segment.road_class,
            segment.terrain_class,
        )
        if minimum_radius is None:
            return ChecklistResult(
                category="Alignment",
                code="ALI-CURVE",
                question="Does the horizontal alignment provide adequate visibility and safety for road users?",
                status="pending",
                reason="Terrain class is unavailable; the IRC design speed and minimum radius cannot be selected.",
                severity=None,
                automated=True,
                field_verification_required=True,
            )
        if radius is None:
            status = "pending"
            severity = None
            reason = "Curve geometry data is unavailable; verify alignment in the field."
        elif radius >= minimum_radius:
            status = "pass"
            severity = None
            reason = "No significant sharp-curve concern detected."

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
                radius is None or radius < minimum_radius
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
        design_speed = urban_design_speed(
            segment.road_class,
            segment.terrain_class,
        )
        if design_speed is None:
            return ChecklistResult(
                category="Speed",
                code="SPD-OPERATING",
                question="Is the operating speed appropriate for the road environment and surrounding activity?",
                status="pending",
                reason="Terrain class is unavailable; the IRC design speed cannot be selected.",
                severity=None,
                automated=True,
                field_verification_required=True,
            )

        if speed <= design_speed:
            status = "pass"
            severity = None
            reason = "No elevated operating-speed concern detected."

        elif speed <= design_speed * 1.15:
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
            field_verification_required=speed > design_speed * 1.15,
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
            reason = (
                "Low estimated route congestion under the project's "
                "delay-percentage screening thresholds; this is not a "
                "traffic-volume measurement."
            )

        elif traffic == "medium":
            status = "review"
            severity = "medium"
            reason = (
                "Medium estimated route congestion under project screening "
                "thresholds; verify against observed traffic conditions."
            )

        elif traffic == "high":
            status = "flagged"
            severity = "high"
            reason = (
                "High estimated route congestion under project screening "
                "thresholds; verify against observed traffic conditions."
            )

        else:
            status = "pending"
            severity = None
            reason = (
                "Estimated congestion data is unavailable; no traffic "
                "classification was assigned."
            )

        return ChecklistResult(
            category="Traffic",
            code="TRF-ACTIVITY",
            question=(
                "Does this road segment show elevated estimated "
                "congestion requiring review?"
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
            reason = (
                "Few nearby activity-generating places were found; this is "
                "a land-use proxy, not a pedestrian count."
            )

        elif activity == "medium":
            status = "review"
            severity = "medium"
            reason = (
                "Nearby activity places indicate possible pedestrian "
                "exposure; verify pedestrian volumes and facilities in the field."
            )

        elif activity == "high":
            status = "flagged"
            severity = "high"
            reason = (
                "Many nearby activity places indicate potentially high "
                "pedestrian exposure; verify pedestrian volumes, facilities, "
                "and crossing conditions in the field."
            )

        else:
            status = "pending"
            severity = None
            reason = "Pedestrian activity information is unavailable."

        return ChecklistResult(
            category="Pedestrian",
            code="PED-ACTIVITY",
            question=(
                "Is pedestrian exposure elevated, and do facilities need "
                "field review?"
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
