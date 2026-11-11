import math
from dataclasses import dataclass


@dataclass
class RoadSegmentData:
    """
    Internal representation of a road segment before
    it is converted into a SQLAlchemy Segment model.
    """

    segment_code: str
    road_name: str | None
    road_class: str
    length_m: float
    geometry: str | None = None
    operating_speed_kmh: float | None = None
    max_speed_kmh: float | None = None
    traffic_level: str | None = None
    traffic_delay_percent: float | None = None
    pedestrian_activity: str | None = None


class SegmentationService:
    """
    Handles the division of audited roads into smaller
    road segments.

    Default segment length:
        250 metres

    Route geometry is sliced at the same distance boundaries
    as the reported road length, so each segment retains its
    own geometry.
    """

    DEFAULT_SEGMENT_LENGTH_M = 250.0

    ALLOWED_ROAD_CLASSES = {
        "local",
        "collector",
        "arterial",
    }

    MIN_SEGMENT_LENGTH_M = 10.0
    MAX_SEGMENT_LENGTH_M = 1000.0
    MAX_SUBSEGMENTS = 10

    def __init__(
        self,
        segment_length_m: float = DEFAULT_SEGMENT_LENGTH_M,
    ):
        self._validate_segment_length(
            segment_length_m
        )

        self.segment_length_m = float(
            segment_length_m
        )

    # ==========================================================
    # SEGMENT ONE ROAD
    # ==========================================================

    def segment_road(
        self,
        road_name: str | None,
        road_class: str,
        total_length_m: float,
        geometry: str | None = None,
        operating_speed_kmh: float | None = None,
        max_speed_kmh: float | None = None,
        traffic_level: str | None = None,
        traffic_delay_percent: float | None = None,
        pedestrian_activity: str | None = None,
    ) -> list[RoadSegmentData]:
        """
        Divide one road into smaller audit segments.
        """

        self._validate_road_class(
            road_class
        )

        if total_length_m <= 0:
            return []

        total_length_m = float(
            total_length_m
        )

        segment_count = (
            self.calculate_segment_count(
                total_length_m
            )
        )

        geometry_pieces = self._split_geometry(
            geometry,
            total_length_m,
            segment_count,
            self.segment_length_m,
        )

        segments: list[RoadSegmentData] = []

        for index in range(
            segment_count
        ):
            start_distance = (
                index
                * self.segment_length_m
            )

            remaining_length = (
                total_length_m
                - start_distance
            )

            current_length = min(
                self.segment_length_m,
                remaining_length,
            )

            if current_length <= 0:
                continue

            segments.append(
                RoadSegmentData(
                    segment_code=(
                        f"SEG-{index + 1:03d}"
                    ),
                    road_name=road_name,
                    road_class=road_class,
                    length_m=round(
                        current_length,
                        2,
                    ),
                    geometry=(
                        geometry_pieces[index]
                        if geometry_pieces is not None
                        else geometry
                    ),
                    operating_speed_kmh=operating_speed_kmh,
                    max_speed_kmh=max_speed_kmh,
                    traffic_level=traffic_level,
                    traffic_delay_percent=traffic_delay_percent,
                    pedestrian_activity=pedestrian_activity,
                )
            )

        return segments

    @classmethod
    def _split_geometry(
        cls,
        geometry: str | None,
        reported_length_m: float,
        segment_count: int,
        segment_length_m: float,
    ) -> list[str] | None:
        """Split route geometry proportionally into audit segment pieces."""
        points = cls._decode_polyline(geometry or "")
        if len(points) < 2 or segment_count < 1:
            return None
        cumulative = [0.0]
        for first, second in zip(points, points[1:]):
            cumulative.append(cumulative[-1] + cls._distance_m(first, second))
        geometry_length = cumulative[-1]
        if geometry_length <= 0:
            return None

        pieces = []
        for index in range(segment_count):
            reported_start = min(index * segment_length_m, reported_length_m)
            reported_end = min((index + 1) * segment_length_m, reported_length_m)
            start = geometry_length * reported_start / reported_length_m
            end = geometry_length * reported_end / reported_length_m
            sliced = cls._slice_polyline(points, cumulative, start, end)
            if len(sliced) < 2:
                return None
            pieces.append(cls._encode_polyline(sliced))
        return pieces

    # ==========================================================
    # SEGMENT MULTIPLE ROADS
    # ==========================================================

    def segment_roads(
        self,
        roads: list[dict],
    ) -> list[RoadSegmentData]:
        """
        Segment multiple roads.

        Expected input:

        [
            {
                "road_name": "Main Road",
                "road_class": "collector",
                "length_m": 850,
                "geometry": "..."
            }
        ]
        """

        if not roads:
            return []

        all_segments: list[
            RoadSegmentData
        ] = []

        for road in roads:

            if not road:
                continue

            road_class = road.get(
                "road_class"
            )

            if (
                road_class
                not in self.ALLOWED_ROAD_CLASSES
            ):
                continue

            length_m = road.get(
                "length_m"
            )

            if length_m is None:
                continue

            try:
                length_m = float(
                    length_m
                )
            except (
                TypeError,
                ValueError,
            ):
                continue

            if length_m <= 0:
                continue

            road_segments = (
                self.segment_road(
                    road_name=road.get(
                        "road_name"
                    ),
                    road_class=road_class,
                    total_length_m=length_m,
                    geometry=road.get(
                        "geometry"
                    ),
                    operating_speed_kmh=road.get(
                        "operating_speed_kmh"
                    ),
                    max_speed_kmh=road.get(
                        "max_speed_kmh"
                    ),
                    traffic_level=road.get(
                        "traffic_level"
                    ),
                    traffic_delay_percent=road.get(
                        "traffic_delay_percent"
                    ),
                    pedestrian_activity=road.get(
                        "pedestrian_activity"
                    ),
                )
            )

            all_segments.extend(
                road_segments
            )

        return self._renumber_segments(
            all_segments
        )

    # ==========================================================
    # RENUMBER SEGMENTS
    # ==========================================================

    @staticmethod
    def _renumber_segments(
        segments: list[RoadSegmentData],
    ) -> list[RoadSegmentData]:
        """
        Assign globally unique segment codes across
        the complete audit.
        """

        for index, segment in enumerate(
            segments,
            start=1,
        ):
            segment.segment_code = (
                f"SEG-{index:03d}"
            )

        return segments

    # ==========================================================
    # CALCULATE SEGMENT COUNT
    # ==========================================================

    def calculate_segment_count(
        self,
        total_length_m: float,
    ) -> int:
        """
        Calculate the number of segments required.

        Example:

            850 m / 250 m

            SEG-001 = 250 m
            SEG-002 = 250 m
            SEG-003 = 250 m
            SEG-004 = 100 m

            Total = 4 segments
        """

        if total_length_m <= 0:
            return 0

        total_length_m = float(
            total_length_m
        )

        return math.ceil(
            total_length_m
            / self.segment_length_m
        )

    @classmethod
    def subdivide_geometry(
        cls,
        geometry: str | None,
        total_length_m: float,
        max_subsegments: int = MAX_SUBSEGMENTS,
    ) -> list[tuple[str, float]]:
        """Split an encoded Google polyline into at most N sections.

        Distances are apportioned by the measured polyline length. Each returned
        geometry is separately encoded, so callers can display the real stretch.
        Invalid or unavailable geometry returns an empty list.
        """
        if not geometry or total_length_m <= 0 or max_subsegments < 1:
            return []

        points = cls._decode_polyline(geometry)
        if len(points) < 2:
            return []

        cumulative = [0.0]
        for first, second in zip(points, points[1:]):
            cumulative.append(cumulative[-1] + cls._distance_m(first, second))
        polyline_length = cumulative[-1]
        if polyline_length <= 0:
            return []

        count = min(max_subsegments, max(1, math.ceil(total_length_m / 50.0)))
        section_length = polyline_length / count
        output: list[tuple[str, float]] = []
        for index in range(count):
            start = polyline_length * index / count
            end = polyline_length * (index + 1) / count
            section_points = cls._slice_polyline(points, cumulative, start, end)
            if len(section_points) >= 2:
                output.append((cls._encode_polyline(section_points), round(total_length_m / count, 2)))
        if output:
            # Preserve the parent's exact length after rounding.
            preceding = sum(length for _, length in output[:-1])
            output[-1] = (output[-1][0], round(total_length_m - preceding, 2))
        return output

    @staticmethod
    def _decode_polyline(encoded: str) -> list[tuple[float, float]]:
        coordinates: list[tuple[float, float]] = []
        index = lat = lng = 0
        try:
            while index < len(encoded):
                values = []
                for _ in range(2):
                    result = shift = 0
                    while True:
                        byte = ord(encoded[index]) - 63
                        index += 1
                        result |= (byte & 0x1F) << shift
                        shift += 5
                        if byte < 0x20:
                            break
                    values.append(~(result >> 1) if result & 1 else result >> 1)
                lat += values[0]
                lng += values[1]
                coordinates.append((lat / 1e5, lng / 1e5))
        except (IndexError, ValueError):
            return []
        return coordinates

    @staticmethod
    def _encode_polyline(points: list[tuple[float, float]]) -> str:
        output: list[str] = []
        previous_lat = previous_lng = 0
        for latitude, longitude in points:
            lat = round(latitude * 1e5)
            lng = round(longitude * 1e5)
            for value in (lat - previous_lat, lng - previous_lng):
                value = ~(value << 1) if value < 0 else value << 1
                while value >= 0x20:
                    output.append(chr((0x20 | (value & 0x1F)) + 63))
                    value >>= 5
                output.append(chr(value + 63))
            previous_lat, previous_lng = lat, lng
        return "".join(output)

    @staticmethod
    def _distance_m(first: tuple[float, float], second: tuple[float, float]) -> float:
        radius = 6_371_000.0
        lat1, lat2 = math.radians(first[0]), math.radians(second[0])
        delta_lat = lat2 - lat1
        delta_lng = math.radians(second[1] - first[1])
        value = math.sin(delta_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lng / 2) ** 2
        return radius * 2 * math.atan2(math.sqrt(value), math.sqrt(max(0.0, 1 - value)))

    @classmethod
    def _slice_polyline(
        cls,
        points: list[tuple[float, float]],
        cumulative: list[float],
        start: float,
        end: float,
    ) -> list[tuple[float, float]]:
        def point_at(distance: float) -> tuple[float, float]:
            if distance <= 0:
                return points[0]
            if distance >= cumulative[-1]:
                return points[-1]
            for idx in range(1, len(cumulative)):
                if cumulative[idx] >= distance:
                    span = cumulative[idx] - cumulative[idx - 1]
                    ratio = (distance - cumulative[idx - 1]) / span if span else 0.0
                    a, b = points[idx - 1], points[idx]
                    return (a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio)
            return points[-1]

        result = [point_at(start)]
        result.extend(points[idx] for idx in range(1, len(points) - 1) if start < cumulative[idx] < end)
        result.append(point_at(end))
        return result

    # ==========================================================
    # VALIDATION
    # ==========================================================

    @classmethod
    def _validate_road_class(
        cls,
        road_class: str,
    ) -> None:
        """
        Validate the road classification.
        """

        if (
            road_class
            not in cls.ALLOWED_ROAD_CLASSES
        ):
            raise ValueError(
                "Invalid road class. "
                "Allowed values: "
                "local, collector, arterial."
            )

    @classmethod
    def _validate_segment_length(
        cls,
        segment_length_m: float,
    ) -> None:
        """
        Validate the configured segment length.
        """

        if not isinstance(
            segment_length_m,
            (int, float),
        ):
            raise TypeError(
                "Segment length must be a number."
            )

        if (
            segment_length_m
            < cls.MIN_SEGMENT_LENGTH_M
        ):
            raise ValueError(
                f"Segment length must be at least "
                f"{cls.MIN_SEGMENT_LENGTH_M} metres."
            )

        if (
            segment_length_m
            > cls.MAX_SEGMENT_LENGTH_M
        ):
            raise ValueError(
                f"Segment length must not exceed "
                f"{cls.MAX_SEGMENT_LENGTH_M} metres."
            )
