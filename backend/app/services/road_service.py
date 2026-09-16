from dataclasses import dataclass

from app.providers.google_maps import GoogleMapsProvider


@dataclass
class RoadResult:
    """
    Normalized road information used by the SmartRoad system.
    """

    road_name: str | None
    road_class: str
    length_m: float
    geometry: str | None = None


class RoadService:
    """
    Handles road-related business logic.

    The service communicates with Google Maps through
    GoogleMapsProvider and converts the returned data
    into the format required by the rest of the application.
    """

    ALLOWED_ROAD_CLASSES = {
        "local",
        "collector",
        "arterial",
    }

    def __init__(
        self,
        google_maps: GoogleMapsProvider | None = None,
    ):
        self.google_maps = (
            google_maps
            or GoogleMapsProvider()
        )

    async def get_road_data(
        self,
        origin: str,
        destination: str,
        road_class: str,
    ) -> list[RoadResult]:

        self._validate_road_class(road_class)

        response = await self.google_maps.directions(
            origin=origin,
            destination=destination,
            mode="driving",
        )

        return self._normalize_directions(
            response=response,
            road_class=road_class,
        )

    def _normalize_directions(
        self,
        response: dict,
        road_class: str,
    ) -> list[RoadResult]:

        results: list[RoadResult] = []

        routes = response.get("routes", [])

        for route in routes:

            legs = route.get("legs", [])

            for leg in legs:

                distance = leg.get(
                    "distance",
                    {},
                )

                length_m = distance.get(
                    "value",
                    0,
                )

                if length_m <= 0:
                    continue

                steps = leg.get(
                    "steps",
                    [],
                )

                for step in steps:

                    road_name = (
                        step.get("html_instructions")
                    )

                    polyline = (
                        step.get("polyline", {})
                    )

                    geometry = polyline.get(
                        "points"
                    )

                    results.append(
                        RoadResult(
                            road_name=road_name,
                            road_class=road_class,
                            length_m=float(length_m),
                            geometry=geometry,
                        )
                    )

        return results

    @classmethod
    def _validate_road_class(
        cls,
        road_class: str,
    ) -> None:

        if road_class not in cls.ALLOWED_ROAD_CLASSES:
            raise ValueError(
                "Invalid road class. "
                "Allowed values: "
                "local, collector, arterial."
            )