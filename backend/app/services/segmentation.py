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


class SegmentationService:
    """
    Handles the division of audited roads into smaller
    road segments.

    Default segment length:
        250 metres

    Note:
        Geometry-based splitting is not performed here yet.
        The current implementation divides the reported
        road length while retaining the original geometry.
    """

    DEFAULT_SEGMENT_LENGTH_M = 250.0

    ALLOWED_ROAD_CLASSES = {
        "local",
        "collector",
        "arterial",
    }

    MIN_SEGMENT_LENGTH_M = 10.0
    MAX_SEGMENT_LENGTH_M = 1000.0

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
                    geometry=geometry,
                    operating_speed_kmh=operating_speed_kmh,
                    max_speed_kmh=max_speed_kmh,
                )
            )

        return segments

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