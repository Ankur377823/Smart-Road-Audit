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


class SegmentationService:
    """
    Handles the division of an audited road network into
    smaller road segments.
    """

    DEFAULT_SEGMENT_LENGTH_M = 250.0

    def __init__(
        self,
        segment_length_m: float = DEFAULT_SEGMENT_LENGTH_M,
    ):
        if segment_length_m <= 0:
            raise ValueError(
                "Segment length must be greater than zero."
            )

        self.segment_length_m = segment_length_m

    # -------------------------
    # Segment road
    # -------------------------

    def segment_road(
        self,
        road_name: str | None,
        road_class: str,
        total_length_m: float,
        geometry: str | None = None,
    ) -> list[RoadSegmentData]:
        """
        Divide a road into smaller segments.

        This method currently uses the total road length.
        Actual geometry-based splitting will be connected
        to the Roads API/provider later.
        """

        if total_length_m <= 0:
            return []

        segments: list[RoadSegmentData] = []

        remaining_length = total_length_m
        segment_number = 1

        while remaining_length > 0:
            current_length = min(
                self.segment_length_m,
                remaining_length,
            )

            segments.append(
                RoadSegmentData(
                    segment_code=f"SEG-{segment_number:03d}",
                    road_name=road_name,
                    road_class=road_class,
                    length_m=round(current_length, 2),
                    geometry=geometry,
                )
            )

            remaining_length -= current_length
            segment_number += 1

        return segments

    # -------------------------
    # Segment multiple roads
    # -------------------------

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

        all_segments: list[RoadSegmentData] = []

        for road in roads:
            road_segments = self.segment_road(
                road_name=road.get("road_name"),
                road_class=road["road_class"],
                total_length_m=road["length_m"],
                geometry=road.get("geometry"),
            )

            all_segments.extend(road_segments)

        return self._renumber_segments(all_segments)

    # -------------------------
    # Renumber segments
    # -------------------------

    @staticmethod
    def _renumber_segments(
        segments: list[RoadSegmentData],
    ) -> list[RoadSegmentData]:
        """
        Ensure segment codes are unique across the
        complete audit area.
        """

        for index, segment in enumerate(
            segments,
            start=1,
        ):
            segment.segment_code = f"SEG-{index:03d}"

        return segments

    # -------------------------
    # Calculate segment count
    # -------------------------

    def calculate_segment_count(
        self,
        total_length_m: float,
    ) -> int:
        """
        Calculate how many segments are required for
        a given road length.
        """

        if total_length_m <= 0:
            return 0

        full_segments = int(
            total_length_m // self.segment_length_m
        )

        has_remainder = (
            total_length_m % self.segment_length_m > 0
        )

        return full_segments + int(has_remainder)