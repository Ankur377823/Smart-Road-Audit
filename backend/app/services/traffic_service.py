from dataclasses import dataclass

from app.services.metrics import MetricsService
from app.services.route_service import RouteService


@dataclass
class TrafficResult:
    """
    Traffic information calculated for a road segment.
    """

    traffic_value: float | None
    traffic_level: str | None
    estimated_duration_seconds: int | None
    normal_duration_seconds: int | None


class TrafficService:
    """
    Handles traffic-related information for a road segment.

    Route calculation is handled by RouteService,
    while this service focuses only on interpreting
    route duration data as a traffic indicator.
    """

    def __init__(
        self,
        route_service: RouteService | None = None,
    ):
        self.route_service = (
            route_service or RouteService()
        )

        self.metrics_service = MetricsService()

    async def get_segment_traffic(
        self,
        origin_latitude: float,
        origin_longitude: float,
        destination_latitude: float,
        destination_longitude: float,
    ) -> TrafficResult:
        """
        Calculate traffic delay between two coordinates.

        The traffic indicator represents the percentage
        increase in travel time compared with the normal
       /static route duration.

        Example:

            Normal duration = 300 seconds
            Traffic duration = 420 seconds

            Traffic value =
                ((420 - 300) / 300) * 100

            = 40%
        """

        try:
            route = (
                await self.route_service.calculate_route(
                    origin_latitude=origin_latitude,
                    origin_longitude=origin_longitude,
                    destination_latitude=destination_latitude,
                    destination_longitude=destination_longitude,
                    traffic_aware=True,
                )
            )

        except (
            ValueError,
            RuntimeError,
        ):
            return self._empty_result()

        traffic_value = (
            route.traffic_delay_percent
        )

        traffic_level = None

        if traffic_value is not None:
            traffic_level = (
                self.metrics_service.classify_traffic(
                    traffic_value
                )
            )

        return TrafficResult(
            traffic_value=traffic_value,
            traffic_level=traffic_level,
            estimated_duration_seconds=(
                self._to_int(
                    route.duration_s
                )
            ),
            normal_duration_seconds=(
                self._to_int(
                    route.static_duration_s
                )
            ),
        )

    # ==========================================================
    # HELPERS
    # ==========================================================

    @staticmethod
    def _to_int(
        value: float | None,
    ) -> int | None:
        """
        Convert a duration value into seconds.
        """

        if value is None:
            return None

        if value <= 0:
            return None

        return int(round(value))

    # ==========================================================
    # EMPTY RESULT
    # ==========================================================

    @staticmethod
    def _empty_result() -> TrafficResult:
        """
        Return an empty traffic result when route
        information is unavailable.
        """

        return TrafficResult(
            traffic_value=None,
            traffic_level=None,
            estimated_duration_seconds=None,
            normal_duration_seconds=None,
        )