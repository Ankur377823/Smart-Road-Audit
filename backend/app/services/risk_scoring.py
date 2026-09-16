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

    The scoring rules are configurable and are intended to provide
    a transparent screening mechanism. They should be calibrated
    against the project's final engineering methodology before
    being treated as a formal road-safety assessment.
    """

    # Maximum contribution from each factor.
    GRADIENT_WEIGHT = 25.0
    CURVE_WEIGHT = 20.0
    SPEED_WEIGHT = 20.0
    TRAFFIC_WEIGHT = 20.0
    PEDESTRIAN_WEIGHT = 15.0

    # -------------------------
    # Gradient risk
    # -------------------------

    @staticmethod
    def gradient_risk(
        gradient: float | None,
    ) -> tuple[float, str | None]:
        """
        Calculate the risk contribution from gradient.
        """

        if gradient is None:
            return 0.0, None

        value = abs(gradient)

        if value < 3:
            return 0.0, None

        if value < 5:
            return 10.0, "moderate_gradient"

        if value < 8:
            return 18.0, "high_gradient"

        return 25.0, "very_high_gradient"

    # -------------------------
    # Curve risk
    # -------------------------

    @staticmethod
    def curve_risk(
        curve_radius: float | None,
    ) -> tuple[float, str | None]:
        """
        Calculate the risk contribution from horizontal curve radius.
        """

        if curve_radius is None:
            return 0.0, None

        if curve_radius >= 500:
            return 0.0, None

        if curve_radius >= 250:
            return 8.0, "moderate_curve"

        if curve_radius >= 100:
            return 15.0, "sharp_curve"

        return 20.0, "very_sharp_curve"

    # -------------------------
    # Speed risk
    # -------------------------

    @staticmethod
    def speed_risk(
        operating_speed: float | None,
    ) -> tuple[float, str | None]:
        """
        Calculate the risk contribution from operating speed.
        """

        if operating_speed is None:
            return 0.0, None

        if operating_speed <= 30:
            return 0.0, None

        if operating_speed <= 50:
            return 8.0, "moderate_operating_speed"

        if operating_speed <= 70:
            return 14.0, "high_operating_speed"

        return 20.0, "very_high_operating_speed"

    # -------------------------
    # Traffic risk
    # -------------------------

    @staticmethod
    def traffic_risk(
        traffic_level: str | None,
    ) -> tuple[float, str | None]:
        """
        Calculate the risk contribution from traffic level.
        """

        if traffic_level is None:
            return 0.0, None

        level = traffic_level.lower()

        if level == "low":
            return 0.0, None

        if level == "medium":
            return 10.0, "moderate_traffic"

        if level == "high":
            return 20.0, "high_traffic"

        return 0.0, None

    # -------------------------
    # Pedestrian risk
    # -------------------------

    @staticmethod
    def pedestrian_risk(
        pedestrian_activity: str | None,
    ) -> tuple[float, str | None]:
        """
        Calculate the risk contribution from pedestrian activity.
        """

        if pedestrian_activity is None:
            return 0.0, None

        activity = pedestrian_activity.lower()

        if activity == "low":
            return 0.0, None

        if activity == "medium":
            return 8.0, "moderate_pedestrian_activity"

        if activity == "high":
            return 15.0, "high_pedestrian_activity"

        return 0.0, None

    # -------------------------
    # Risk level
    # -------------------------

    @staticmethod
    def classify_risk(
        score: float,
    ) -> str:
        """
        Convert the numerical score into a risk level.
        """

        if score < 25:
            return "low"

        if score < 50:
            return "medium"

        if score < 75:
            return "high"

        return "critical"

    # -------------------------
    # Calculate risk
    # -------------------------

    def calculate_risk(
        self,
        metrics: SegmentMetrics,
    ) -> RiskResult:
        """
        Calculate the overall risk score for a segment.
        """

        score = 0.0
        risk_flags: list[str] = []

        # Gradient
        contribution, flag = self.gradient_risk(
            metrics.gradient
        )
        score += contribution

        if flag:
            risk_flags.append(flag)

        # Curve
        contribution, flag = self.curve_risk(
            metrics.curve_radius
        )
        score += contribution

        if flag:
            risk_flags.append(flag)

        # Operating speed
        contribution, flag = self.speed_risk(
            metrics.operating_speed
        )
        score += contribution

        if flag:
            risk_flags.append(flag)

        # Traffic
        contribution, flag = self.traffic_risk(
            metrics.traffic_level
        )
        score += contribution

        if flag:
            risk_flags.append(flag)

        # Pedestrian activity
        contribution, flag = self.pedestrian_risk(
            metrics.pedestrian_activity
        )
        score += contribution

        if flag:
            risk_flags.append(flag)

        score = min(round(score, 2), 100.0)

        risk_level = self.classify_risk(score)

        return RiskResult(
            risk_score=score,
            risk_level=risk_level,
            risk_flags=risk_flags,
        )