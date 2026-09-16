from dataclasses import dataclass

from app.services.google_road_service import RoadServiceResult
from app.services.segmentation import SegmentationService


@dataclass
class SegmentedRoad:
    """
    A road segment prepared for the SmartRoad Audit pipeline.
    """

    segment_code: str
    road_name: str | None
    road_class: str
    length_m: float
    geometry: str | None = None
    operating_speed_kmh: float | None = None
    max_speed_kmh: float | None = None


class RoadSegmentationService:
    """
    Converts normalized Google road data into audit segments.

    The default segment length is 250 metres.
    """

    MIN_SEGMENT_LENGTH_M = 10.0
    MAX_SEGMENT_LENGTH_M = 1000.0

    def __init__(
        self,
        segment_length_m: float = 250.0,
    ):
        self._validate_segment_length(
            segment_length_m
        )

        self.segment_length_m = segment_length_m

        self.segmentation_service = SegmentationService(
            segment_length_m=segment_length_m
        )

    def segment_roads(
        self,
        roads: list[RoadServiceResult],
    ) -> list[SegmentedRoad]:
        """
        Convert normalized road data into fixed-length
        audit segments.
        """

        if not roads:
            return []

        valid_roads = self._filter_valid_roads(
            roads
        )

        if not valid_roads:
            return []

        road_data = [
            self._road_to_dict(road)
            for road in valid_roads
        ]

        segments = (
            self.segmentation_service.segment_roads(
                road_data
            )
        )

        return [
            self._convert_segment(segment)
            for segment in segments
        ]

    def _filter_valid_roads(
        self,
        roads: list[RoadServiceResult],
    ) -> list[RoadServiceResult]:
        """
        Remove invalid road records before segmentation.
        """

        valid_roads: list[RoadServiceResult] = []

        for road in roads:

            if road.length_m <= 0:
                continue

            if road.road_class not in {
                "local",
                "collector",
                "arterial",
            }:
                continue

            valid_roads.append(road)

        return valid_roads

    @staticmethod
    def _road_to_dict(
        road: RoadServiceResult,
    ) -> dict:
        """
        Convert RoadServiceResult into the format expected
        by SegmentationService.
        """

        return {
            "road_name": road.road_name,
            "road_class": road.road_class,
            "length_m": float(road.length_m),
            "geometry": road.geometry,
            "operating_speed_kmh": road.operating_speed_kmh,
            "max_speed_kmh": road.max_speed_kmh,
        }

    @staticmethod
    def _convert_segment(
        segment,
    ) -> SegmentedRoad:
        """
        Convert the lower-level segmentation result into
        the service-level SegmentedRoad model.
        """

        return SegmentedRoad(
            segment_code=segment.segment_code,
            road_name=segment.road_name,
            road_class=segment.road_class,
            length_m=round(
                float(segment.length_m),
                2,
            ),
            geometry=segment.geometry,
            operating_speed_kmh=segment.operating_speed_kmh,
            max_speed_kmh=segment.max_speed_kmh,
        )

    @classmethod
    def _validate_segment_length(
        cls,
        segment_length_m: float,
    ) -> None:
        """
        Validate the configured audit segment length.
        """

        if not isinstance(
            segment_length_m,
            (int, float),
        ):
            raise TypeError(
                "segment_length_m must be a number."
            )

        if segment_length_m < cls.MIN_SEGMENT_LENGTH_M:
            raise ValueError(
                f"segment_length_m must be at least "
                f"{cls.MIN_SEGMENT_LENGTH_M} metres."
            )

        if segment_length_m > cls.MAX_SEGMENT_LENGTH_M:
            raise ValueError(
                f"segment_length_m must not exceed "
                f"{cls.MAX_SEGMENT_LENGTH_M} metres."
            )