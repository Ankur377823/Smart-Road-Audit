from dataclasses import dataclass

from app.services.route_service import RouteService, RouteStepResult


@dataclass
class RoadServiceResult:
    """
    Standard road information used by the audit pipeline.
    """

    road_name: str | None
    road_class: str
    length_m: float
    geometry: str | None


class GoogleRoadService:
    """
    Business/service layer for road information.

    Route information is obtained through RouteService,
    which communicates with Google's Routes API.

    Responsibilities:
    - Validate road class
    - Request route data
    - Extract route steps
    - Normalize road information
    - Prepare road data for segmentation
    """

    ALLOWED_ROAD_CLASSES = {
        "local",
        "collector",
        "arterial",
    }

    def __init__(
        self,
        route_service: RouteService | None = None,
    ):
        self.route_service = (
            route_service or RouteService()
        )

    # ==========================================================
    # GET ROADS
    # ==========================================================

    async def get_roads(
        self,
        origin_latitude: float,
        origin_longitude: float,
        destination_latitude: float,
        destination_longitude: float,
        road_class: str,
    ) -> list[RoadServiceResult]:
        """
        Get road sections between an origin and destination.

        Google Routes API returns a route containing
        individual navigation steps. Each valid step
        is converted into a normalized road section.
        """

        self._validate_road_class(
            road_class
        )

        route = (
            await self.route_service.calculate_route(
                origin_latitude=origin_latitude,
                origin_longitude=origin_longitude,
                destination_latitude=destination_latitude,
                destination_longitude=destination_longitude,
                traffic_aware=False,
            )
        )

        roads = self._extract_road_steps(
            route.steps,
            road_class,
        )

        return self._normalize_roads(
            roads
        )

    # ==========================================================
    # EXTRACT ROUTE STEPS
    # ==========================================================

    def _extract_road_steps(
        self,
        steps: list[RouteStepResult],
        road_class: str,
    ) -> list[RoadServiceResult]:
        """
        Convert normalized Google route steps into
        RoadServiceResult objects.

        Each Google route step becomes one road section
        before the later 250 m segmentation stage.
        """

        roads: list[RoadServiceResult] = []

        for step in steps:

            if step.distance_m <= 0:
                continue

            roads.append(
                RoadServiceResult(
                    road_name=self._extract_road_name(
                        step.instruction
                    ),
                    road_class=road_class,
                    length_m=step.distance_m,
                    geometry=step.geometry,
                )
            )

        return roads

    # ==========================================================
    # ROAD NAME
    # ==========================================================

    @staticmethod
    def _extract_road_name(
        instruction: str | None,
    ) -> str | None:
        """
        Extract a readable road reference from the
        navigation instruction when possible.

        Google does not guarantee that a navigation
        instruction contains a road name, so None is
        returned when no useful instruction is available.
        """

        if not instruction:
            return None

        instruction = instruction.strip()

        return instruction or None

    # ==========================================================
    # NORMALIZATION
    # ==========================================================

    def _normalize_roads(
        self,
        roads: list[RoadServiceResult],
    ) -> list[RoadServiceResult]:
        """
        Validate and normalize road sections.
        """

        normalized: list[
            RoadServiceResult
        ] = []

        for road in roads:

            if not self._is_valid_road(
                road
            ):
                continue

            normalized.append(
                RoadServiceResult(
                    road_name=self._clean_road_name(
                        road.road_name
                    ),
                    road_class=road.road_class,
                    length_m=round(
                        float(road.length_m),
                        2,
                    ),
                    geometry=self._clean_geometry(
                        road.geometry
                    ),
                )
            )

        return normalized

    # ==========================================================
    # ROAD VALIDATION
    # ==========================================================

    def _is_valid_road(
        self,
        road: RoadServiceResult,
    ) -> bool:
        """
        Validate a road section before it enters
        the audit pipeline.
        """

        if road.length_m <= 0:
            return False

        if (
            road.road_class
            not in self.ALLOWED_ROAD_CLASSES
        ):
            return False

        return True

    # ==========================================================
    # ROAD NAME CLEANING
    # ==========================================================

    @staticmethod
    def _clean_road_name(
        road_name: str | None,
    ) -> str | None:
        """
        Clean the road name.
        """

        if road_name is None:
            return None

        road_name = road_name.strip()

        return road_name or None

    # ==========================================================
    # GEOMETRY
    # ==========================================================

    @staticmethod
    def _clean_geometry(
        geometry: str | None,
    ) -> str | None:
        """
        Validate and clean encoded Google polyline
        geometry.
        """

        if geometry is None:
            return None

        geometry = geometry.strip()

        return geometry or None

    # ==========================================================
    # ROAD CLASS VALIDATION
    # ==========================================================

    @classmethod
    def _validate_road_class(
        cls,
        road_class: str,
    ) -> None:
        """
        Validate the road classification selected
        for the audit.
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