from dataclasses import dataclass
import math
from statistics import median


@dataclass
class SegmentMetrics:
    """
    Derived safety metrics for a road segment.
    """

    gradient: float | None = None
    curve_radius: float | None = None
    curve_radius_status: str = "unavailable"
    operating_speed: float | None = None
    traffic_level: str | None = None
    pedestrian_activity: str | None = None


class MetricsService:
    """
    Calculates derived safety metrics for road segments.

    The service is provider-independent. Raw data can later
    come from the Roads, Elevation, Routes, and Places APIs.
    """

    # Project screening thresholds for estimated route congestion, expressed
    # as extra travel time relative to the historical/static duration.
    CONGESTION_MEDIUM_DELAY_PERCENT = 100.0
    CONGESTION_HIGH_DELAY_PERCENT = 500.0

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

        theta = math.radians(
            deflection_angle_deg
        )

        radius = curve_length_m / theta

        return round(radius, 2)

    @classmethod
    def estimate_curve_radius_from_geometry(
        cls,
        encoded_polyline: str | None,
        minimum_turn_deg: float = 1.0,
    ) -> float | None:
        radius, _ = cls.analyze_curve_geometry(
            encoded_polyline,
            minimum_turn_deg,
        )
        return radius

    @classmethod
    def analyze_curve_geometry(
        cls,
        encoded_polyline: str | None,
        minimum_turn_deg: float = 1.0,
    ) -> tuple[float | None, str]:
        """Estimate representative horizontal radius from a segment polyline.

        Circumradii are calculated for consecutive coordinate triples in a
        local metre-based projection. Returns ``not_defined`` when usable
        geometry has no detectable turn, and ``unavailable`` when the geometry
        cannot support an estimate.
        """
        points = cls._decode_polyline(encoded_polyline)
        if len(points) < 3:
            return None, "unavailable"

        radii = []
        has_detectable_turn = False
        for first, middle, last in zip(points, points[1:], points[2:]):
            lat0 = math.radians(middle[0])
            p1 = cls._local_xy(first, middle, lat0)
            p2 = (0.0, 0.0)
            p3 = cls._local_xy(last, middle, lat0)
            side_a = math.dist(p2, p3)
            side_b = math.dist(p1, p3)
            side_c = math.dist(p1, p2)
            if min(side_a, side_b, side_c) < 0.5:
                continue

            turn = cls._turn_angle_deg(p1, p2, p3)
            if turn >= minimum_turn_deg:
                has_detectable_turn = True

            cross = abs(
                (p2[0] - p1[0]) * (p3[1] - p1[1])
                - (p2[1] - p1[1]) * (p3[0] - p1[0])
            )
            if cross <= 1e-6:
                continue
            radius = side_a * side_b * side_c / (2.0 * cross)
            # Reject almost-straight triples where coordinate quantization
            # makes the radius unstable or effectively unbounded.
            if turn >= minimum_turn_deg and math.isfinite(radius):
                radii.append(radius)

        if radii:
            return round(median(radii), 2), "estimated"
        if not has_detectable_turn:
            return None, "not_defined"
        return None, "unavailable"

    @staticmethod
    def _decode_polyline(encoded: str | None) -> list[tuple[float, float]]:
        if not encoded:
            return []
        points = []
        index = latitude = longitude = 0
        try:
            while index < len(encoded):
                deltas = []
                for _ in range(2):
                    result = shift = 0
                    while True:
                        byte = ord(encoded[index]) - 63
                        index += 1
                        result |= (byte & 0x1F) << shift
                        shift += 5
                        if byte < 0x20:
                            break
                    deltas.append(~(result >> 1) if result & 1 else result >> 1)
                latitude += deltas[0]
                longitude += deltas[1]
                points.append((latitude / 1e5, longitude / 1e5))
        except (IndexError, ValueError):
            return []
        return points

    @staticmethod
    def _local_xy(
        point: tuple[float, float],
        origin: tuple[float, float],
        origin_lat_rad: float,
    ) -> tuple[float, float]:
        earth_radius_m = 6_371_000.0
        x = math.radians(point[1] - origin[1]) * earth_radius_m * math.cos(origin_lat_rad)
        y = math.radians(point[0] - origin[0]) * earth_radius_m
        return x, y

    @staticmethod
    def _turn_angle_deg(
        first: tuple[float, float],
        middle: tuple[float, float],
        last: tuple[float, float],
    ) -> float:
        incoming = (middle[0] - first[0], middle[1] - first[1])
        outgoing = (last[0] - middle[0], last[1] - middle[1])
        dot = incoming[0] * outgoing[0] + incoming[1] * outgoing[1]
        cross = incoming[0] * outgoing[1] - incoming[1] * outgoing[0]
        return abs(math.degrees(math.atan2(cross, dot)))

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
        low_threshold: float = CONGESTION_MEDIUM_DELAY_PERCENT,
        high_threshold: float = CONGESTION_HIGH_DELAY_PERCENT,
    ) -> str | None:
        """
        Convert route delay percent into a congestion-proxy class.

        These project thresholds are not an IRC traffic-volume standard.
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
            curve_radius_status=(
                "estimated" if curve_radius is not None else "unavailable"
            ),
            operating_speed=operating_speed,
            traffic_level=traffic_level,
            pedestrian_activity=pedestrian_activity,
        )
