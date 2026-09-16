from dataclasses import dataclass

from app.providers.google_maps import GoogleMapsProvider


@dataclass
class RouteStepResult:
    """
    Normalized information for an individual
    route step returned by Google Routes API.
    """

    distance_m: float
    static_duration_s: float
    geometry: str | None
    instruction: str | None
    start_latitude: float | None
    start_longitude: float | None
    end_latitude: float | None
    end_longitude: float | None


@dataclass
class RouteResult:
    """
    Normalized route information returned by
    Google Routes API.
    """

    distance_m: float
    duration_s: float
    static_duration_s: float
    traffic_delay_s: float
    traffic_delay_percent: float
    geometry: str | None
    steps: list[RouteStepResult]


class RouteService:
    """
    Service layer for Google Routes API.

    Responsible for converting Google's raw route
    response into application-friendly route data.

    Business logic such as risk scoring should remain
    outside this service.
    """

    def __init__(
        self,
        provider: GoogleMapsProvider | None = None,
    ):
        self.provider = (
            provider or GoogleMapsProvider()
        )

    # ==========================================================
    # CALCULATE ROUTE
    # ==========================================================

    async def calculate_route(
        self,
        origin_latitude: float,
        origin_longitude: float,
        destination_latitude: float,
        destination_longitude: float,
        traffic_aware: bool = True,
    ) -> RouteResult:
        """
        Calculate a route between two coordinates.

        Uses Google Routes API through
        GoogleMapsProvider.
        """

        response = await self.provider.compute_route(
            origin_latitude=origin_latitude,
            origin_longitude=origin_longitude,
            destination_latitude=destination_latitude,
            destination_longitude=destination_longitude,
            traffic_aware=traffic_aware,
        )

        routes = response.get(
            "routes",
            []
        )

        if not routes:
            raise RuntimeError(
                "Google Routes API returned no routes."
            )

        route = routes[0]

        # --------------------------------------------------
        # Route-level information
        # --------------------------------------------------

        distance_m = route.get(
            "distanceMeters"
        )

        duration_s = self._parse_duration(
            route.get("duration")
        )

        static_duration_s = self._parse_duration(
            route.get("staticDuration")
        )

        if distance_m is None:
            raise RuntimeError(
                "Route distance was not returned by Google."
            )

        if duration_s is None:
            raise RuntimeError(
                "Route duration was not returned by Google."
            )

        if static_duration_s is None:
            static_duration_s = duration_s

        traffic_delay_s = max(
            duration_s - static_duration_s,
            0.0,
        )

        if static_duration_s > 0:
            traffic_delay_percent = (
                traffic_delay_s
                / static_duration_s
                * 100
            )
        else:
            traffic_delay_percent = 0.0

        geometry = (
            route.get("polyline", {})
            .get("encodedPolyline")
        )

        # --------------------------------------------------
        # Route steps
        # --------------------------------------------------

        steps = self._extract_steps(
            route
        )

        return RouteResult(
            distance_m=float(distance_m),
            duration_s=float(duration_s),
            static_duration_s=float(
                static_duration_s
            ),
            traffic_delay_s=float(
                traffic_delay_s
            ),
            traffic_delay_percent=round(
                traffic_delay_percent,
                2,
            ),
            geometry=geometry,
            steps=steps,
        )

    # ==========================================================
    # EXTRACT STEPS
    # ==========================================================

    def _extract_steps(
        self,
        route: dict,
    ) -> list[RouteStepResult]:
        """
        Extract individual navigation steps from
        all legs of a Google route.
        """

        steps: list[RouteStepResult] = []

        for leg in route.get(
            "legs",
            []
        ):

            for step in leg.get(
                "steps",
                []
            ):

                distance_m = step.get(
                    "distanceMeters"
                )

                if distance_m is None:
                    continue

                static_duration_s = (
                    self._parse_duration(
                        step.get(
                            "staticDuration"
                        )
                    )
                )

                if static_duration_s is None:
                    static_duration_s = 0.0

                geometry = (
                    step.get(
                        "polyline",
                        {}
                    )
                    .get(
                        "encodedPolyline"
                    )
                )

                navigation_instruction = (
                    step.get(
                        "navigationInstruction",
                        {}
                    )
                )

                instruction = (
                    navigation_instruction.get(
                        "instructions"
                    )
                )

                start_location = (
                    step.get(
                        "startLocation",
                        {}
                    )
                    .get(
                        "latLng",
                        {}
                    )
                )

                end_location = (
                    step.get(
                        "endLocation",
                        {}
                    )
                    .get(
                        "latLng",
                        {}
                    )
                )

                steps.append(
                    RouteStepResult(
                        distance_m=float(
                            distance_m
                        ),
                        static_duration_s=float(
                            static_duration_s
                        ),
                        geometry=geometry,
                        instruction=instruction,
                        start_latitude=(
                            start_location.get(
                                "latitude"
                            )
                        ),
                        start_longitude=(
                            start_location.get(
                                "longitude"
                            )
                        ),
                        end_latitude=(
                            end_location.get(
                                "latitude"
                            )
                        ),
                        end_longitude=(
                            end_location.get(
                                "longitude"
                            )
                        ),
                    )
                )

        return steps

    # ==========================================================
    # DURATION PARSER
    # ==========================================================

    @staticmethod
    def _parse_duration(
        duration: str | None,
    ) -> float | None:
        """
        Convert Google's duration string into seconds.

        Example:

            "245s" -> 245.0
        """

        if not duration:
            return None

        if not duration.endswith("s"):
            raise ValueError(
                f"Unsupported Google duration format: "
                f"{duration}"
            )

        try:
            return float(
                duration[:-1]
            )

        except ValueError as exc:
            raise ValueError(
                f"Invalid Google duration value: "
                f"{duration}"
            ) from exc