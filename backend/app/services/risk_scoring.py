from dataclasses import dataclass

from app.services.metrics import SegmentMetrics


@dataclass
class RiskResult:
    """
    Result of the risk assessment for a road segment.
    """

    risk_score: float
    risk_level: str
    risk_flags: list[str]


class RiskScoringService:
    """
    Calculates a deterministic risk score for a road segment.

    The maximum possible score is 100.

    Current factor weights:

        Gradient             25
        Curve                20
        Operating speed      20
        Traffic              20
        Pedestrian activity  15

    These rules are application-level screening rules.
    They should be calibrated and validated against the
    project's final engineering methodology before being
    used as a formal road-safety assessment.
    """

    # --------------------------------------------------
    # Factor weights
    # --------------------------------------------------

    GRADIENT_WEIGHT = 25.0
    CURVE_WEIGHT = 20.0
    SPEED_WEIGHT = 20.0
    TRAFFIC_WEIGHT = 20.0
    PEDESTRIAN_WEIGHT = 15.0

    # --------------------------------------------------
    # Risk-level thresholds
    # --------------------------------------------------

    LOW_RISK_THRESHOLD = 25.0
    MEDIUM_RISK_THRESHOLD = 50.0
    HIGH_RISK_THRESHOLD = 75.0

    # --------------------------------------------------
    # Gradient risk
    # --------------------------------------------------

    @classmethod
    def gradient_risk(
        cls,
        gradient: float | None,
    ) -> tuple[float, str | None]:
        """
        Calculate the risk contribution from road gradient.

        The absolute gradient is used because both steep
        uphill and downhill sections may require attention.
        """

        if gradient is None:
            return 0.0, None

        value = abs(float(gradient))

        if value < 3.0:
            return 0.0, None

        if value < 5.0:
            return 10.0, "moderate_gradient"

        if value < 8.0:
            return 18.0, "high_gradient"

        return cls.GRADIENT_WEIGHT, "very_high_gradient"

    # --------------------------------------------------
    # Curve risk
    # --------------------------------------------------

    @classmethod
    def curve_risk(
        cls,
        curve_radius: float | None,
    ) -> tuple[float, str | None]:
        """
        Calculate risk contribution from horizontal
        curve radius.

        Smaller radius indicates a sharper curve.
        """

        if curve_radius is None:
            return 0.0, None

        radius = float(curve_radius)

        if radius <= 0:
            return 0.0, None

        if radius >= 500.0:
            return 0.0, None

        if radius >= 250.0:
            return 8.0, "moderate_curve"

        if radius >= 100.0:
            return 15.0, "sharp_curve"

        return cls.CURVE_WEIGHT, "very_sharp_curve"

    # --------------------------------------------------
    # Operating-speed risk
    # --------------------------------------------------

    @classmethod
    def speed_risk(
        cls,
        operating_speed: float | None,
    ) -> tuple[float, str | None]:
        """
        Calculate risk contribution from indicative
        operating speed.
        """

        if operating_speed is None:
            return 0.0, None

        speed = float(operating_speed)

        if speed < 0:
            return 0.0, None

        if speed <= 30.0:
            return 0.0, None

        if speed <= 50.0:
            return 8.0, "moderate_operating_speed"

        if speed <= 70.0:
            return 14.0, "high_operating_speed"

        return cls.SPEED_WEIGHT, "very_high_operating_speed"

    # --------------------------------------------------
    # Traffic risk
    # --------------------------------------------------

    @classmethod
    def traffic_risk(
        cls,
        traffic_level: str | None,
    ) -> tuple[float, str | None]:
        """
        Calculate risk contribution from traffic level.
        """

        if traffic_level is None:
            return 0.0, None

        level = traffic_level.strip().lower()

        if level == "low":
            return 0.0, None

        if level == "medium":
            return 10.0, "moderate_traffic"

        if level == "high":
            return cls.TRAFFIC_WEIGHT, "high_traffic"

        return 0.0, None

    # --------------------------------------------------
    # Pedestrian risk
    # --------------------------------------------------

    @classmethod
    def pedestrian_risk(
        cls,
        pedestrian_activity: str | None,
    ) -> tuple[float, str | None]:
        """
        Calculate risk contribution from pedestrian activity.
        """

        if pedestrian_activity is None:
            return 0.0, None

        activity = (
            pedestrian_activity
            .strip()
            .lower()
        )

        if activity == "low":
            return 0.0, None

        if activity == "medium":
            return 8.0, "moderate_pedestrian_activity"

        if activity == "high":
            return (
                cls.PEDESTRIAN_WEIGHT,
                "high_pedestrian_activity",
            )

        return 0.0, None

    # --------------------------------------------------
    # Risk level
    # --------------------------------------------------

    @classmethod
    def classify_risk(
        cls,
        score: float,
    ) -> str:
        """
        Convert the numerical risk score into a
        risk level.

            0 - <25   → low
            25 - <50  → medium
            50 - <75  → high
            75 - 100  → critical
        """

        score = max(
            0.0,
            min(float(score), 100.0),
        )

        if score < cls.LOW_RISK_THRESHOLD:
            return "low"

        if score < cls.MEDIUM_RISK_THRESHOLD:
            return "medium"

        if score < cls.HIGH_RISK_THRESHOLD:
            return "high"

        return "critical"

    # --------------------------------------------------
    # Calculate overall risk
    # --------------------------------------------------

    def calculate_risk(
        self,
        metrics: SegmentMetrics,
    ) -> RiskResult:
        """
        Calculate the overall risk score for a segment.

        Each available metric contributes independently
        to the total score.
        """

        score = 0.0
        risk_flags: list[str] = []

        # --------------------------------------------------
        # Gradient
        # --------------------------------------------------

        contribution, flag = self.gradient_risk(
            metrics.gradient
        )

        score += contribution

        if flag:
            risk_flags.append(flag)

        # --------------------------------------------------
        # Curve
        # --------------------------------------------------

        contribution, flag = self.curve_risk(
            metrics.curve_radius
        )

        score += contribution

        if flag:
            risk_flags.append(flag)

        # --------------------------------------------------
        # Operating speed
        # --------------------------------------------------

        contribution, flag = self.speed_risk(
            metrics.operating_speed
        )

        score += contribution

        if flag:
            risk_flags.append(flag)

        # --------------------------------------------------
        # Traffic
        # --------------------------------------------------

        contribution, flag = self.traffic_risk(
            metrics.traffic_level
        )

        score += contribution

        if flag:
            risk_flags.append(flag)

        # --------------------------------------------------
        # Pedestrian activity
        # --------------------------------------------------

        contribution, flag = self.pedestrian_risk(
            metrics.pedestrian_activity
        )

        score += contribution

        if flag:
            risk_flags.append(flag)

        # --------------------------------------------------
        # Final score
        # --------------------------------------------------

        score = round(
            min(max(score, 0.0), 100.0),
            2,
        )

        risk_level = self.classify_risk(
            score
        )

        return RiskResult(
            risk_score=score,
            risk_level=risk_level,
            risk_flags=risk_flags,
        )