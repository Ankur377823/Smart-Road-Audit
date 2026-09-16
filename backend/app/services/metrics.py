from dataclasses import dataclass


@dataclass
class SegmentMetrics:
    """
    Derived safety metrics for a road segment.
    """

    gradient: float | None = None
    curve_radius: float | None = None
    operating_speed: float | None = None
    traffic_level: str | None = None
    pedestrian_activity: str | None = None


class MetricsService:
    """
    Calculates derived safety metrics for road segments.

    The service is provider-independent. Raw data can later
    come from the Roads, Elevation, Routes, and Places APIs.
    """

    # -------------------------
    # Gradient
    # -------------------------

    @staticmethod
    def calculate_gradient(
        elevation_difference_m: float,
        horizontal_distance_m: float,
    ) -> float | None:
        """
        Calculate road gradient as a percentage.

        Formula:

            gradient (%) =
                elevation difference / horizontal distance * 100
        """

        if horizontal_distance_m <= 0:
            return None

        gradient = (
            elevation_difference_m
            / horizontal_distance_m
        ) * 100

        return round(gradient, 2)

    # -------------------------
    # Curve radius
    # -------------------------

    @staticmethod
    def calculate_curve_radius(
        curve_length_m: float,
        deflection_angle_deg: float,
    ) -> float | None:
        """
        Estimate horizontal curve radius.

        Formula:

            R = L / theta

        where theta is converted from degrees to radians.
        """

        if curve_length_m <= 0:
            return None

        if deflection_angle_deg <= 0:
            return None

        import math

        theta = math.radians(
            deflection_angle_deg
        )

        radius = curve_length_m / theta

        return round(radius, 2)

    # -------------------------
    # Operating speed
    # -------------------------

    @staticmethod
    def estimate_operating_speed(
        speed_limit_kmh: float | None,
        traffic_level: str | None = None,
        pedestrian_activity: str | None = None,
    ) -> float | None:
        """
        Estimate operating speed from available road information.

        If a speed limit is available, it is used as the base value.
        Small adjustments can be applied based on traffic and
        pedestrian activity.
        """

        if speed_limit_kmh is None:
            return None

        speed = float(speed_limit_kmh)

        traffic_adjustments = {
            "low": 0.0,
            "medium": -5.0,
            "high": -10.0,
        }

        pedestrian_adjustments = {
            "low": 0.0,
            "medium": -5.0,
            "high": -10.0,
        }

        if traffic_level:
            speed += traffic_adjustments.get(
                traffic_level.lower(),
                0.0,
            )

        if pedestrian_activity:
            speed += pedestrian_adjustments.get(
                pedestrian_activity.lower(),
                0.0,
            )

        return round(max(speed, 0.0), 2)

    # -------------------------
    # Traffic classification
    # -------------------------

    @staticmethod
    def classify_traffic(
        traffic_value: float | None,
        low_threshold: float = 100.0,
        high_threshold: float = 500.0,
    ) -> str | None:
        """
        Convert a numerical traffic value into a
        simple traffic-level classification.

        The thresholds are configurable because the final
        classification should be calibrated with project data.
        """

        if traffic_value is None:
            return None

        if traffic_value < low_threshold:
            return "low"

        if traffic_value < high_threshold:
            return "medium"

        return "high"

    # -------------------------
    # Pedestrian activity
    # -------------------------

    @staticmethod
    def classify_pedestrian_activity(
        pedestrian_count: float | None,
        low_threshold: float = 20.0,
        high_threshold: float = 100.0,
    ) -> str | None:
        """
        Convert pedestrian activity into a simple
        low/medium/high classification.
        """

        if pedestrian_count is None:
            return None

        if pedestrian_count < low_threshold:
            return "low"

        if pedestrian_count < high_threshold:
            return "medium"

        return "high"

    # -------------------------
    # Calculate all metrics
    # -------------------------

    def calculate_segment_metrics(
        self,
        elevation_difference_m: float | None = None,
        horizontal_distance_m: float | None = None,
        curve_length_m: float | None = None,
        deflection_angle_deg: float | None = None,
        speed_limit_kmh: float | None = None,
        traffic_value: float | None = None,
        pedestrian_count: float | None = None,
    ) -> SegmentMetrics:
        """
        Calculate all available metrics for a road segment.
        """

        gradient = None

        if (
            elevation_difference_m is not None
            and horizontal_distance_m is not None
        ):
            gradient = self.calculate_gradient(
                elevation_difference_m,
                horizontal_distance_m,
            )

        curve_radius = None

        if (
            curve_length_m is not None
            and deflection_angle_deg is not None
        ):
            curve_radius = self.calculate_curve_radius(
                curve_length_m,
                deflection_angle_deg,
            )

        traffic_level = self.classify_traffic(
            traffic_value
        )

        pedestrian_activity = (
            self.classify_pedestrian_activity(
                pedestrian_count
            )
        )

        operating_speed = self.estimate_operating_speed(
            speed_limit_kmh=speed_limit_kmh,
            traffic_level=traffic_level,
            pedestrian_activity=pedestrian_activity,
        )

        return SegmentMetrics(
            gradient=gradient,
            curve_radius=curve_radius,
            operating_speed=operating_speed,
            traffic_level=traffic_level,
            pedestrian_activity=pedestrian_activity,
        )