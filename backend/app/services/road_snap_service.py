from dataclasses import dataclass

from app.providers.google_roads import GoogleRoadsProvider


@dataclass
class SnappedRoadPoint:
    """
    Normalized road point returned by Google Roads API.
    """

    original_latitude: float
    original_longitude: float

    snapped_latitude: float | None
    snapped_longitude: float | None

    place_id: str | None
    found: bool


class RoadSnapService:
    """
    Service responsible for snapping user-selected
    coordinates to Google's road network.
    """

    def __init__(
        self,
        provider: GoogleRoadsProvider | None = None,
    ):
        self.provider = (
            provider or GoogleRoadsProvider()
        )

    async def snap_point(
        self,
        latitude: float,
        longitude: float,
    ) -> SnappedRoadPoint:

        self._validate_coordinates(
            latitude,
            longitude,
        )

        response = await self.provider.snap_to_road(
            latitude=latitude,
            longitude=longitude,
        )

        snapped_points = response.get(
            "snappedPoints",
            [],
        )

        if not snapped_points:
            return SnappedRoadPoint(
                original_latitude=latitude,
                original_longitude=longitude,
                snapped_latitude=None,
                snapped_longitude=None,
                place_id=None,
                found=False,
            )

        snapped_point = snapped_points[0]

        location = snapped_point.get(
            "location",
            {},
        )

        snapped_latitude = location.get(
            "latitude"
        )

        snapped_longitude = location.get(
            "longitude"
        )

        return SnappedRoadPoint(
            original_latitude=latitude,
            original_longitude=longitude,
            snapped_latitude=(
                float(snapped_latitude)
                if snapped_latitude is not None
                else None
            ),
            snapped_longitude=(
                float(snapped_longitude)
                if snapped_longitude is not None
                else None
            ),
            place_id=snapped_point.get(
                "placeId"
            ),
            found=(
                snapped_latitude is not None
                and snapped_longitude is not None
            ),
        )

    async def snap_points(
        self,
        points: list[tuple[float, float]],
        interpolate: bool = False,
    ) -> list[SnappedRoadPoint]:

        if not points:
            return []

        for latitude, longitude in points:
            self._validate_coordinates(
                latitude,
                longitude,
            )

        response = (
            await self.provider.snap_points_to_road(
                points=points,
                interpolate=interpolate,
            )
        )

        snapped_points = response.get(
            "snappedPoints",
            [],
        )

        results = []

        for index, (
            original_latitude,
            original_longitude,
        ) in enumerate(points):

            snapped_point = (
                snapped_points[index]
                if index < len(snapped_points)
                else None
            )

            if not snapped_point:
                results.append(
                    SnappedRoadPoint(
                        original_latitude=(
                            original_latitude
                        ),
                        original_longitude=(
                            original_longitude
                        ),
                        snapped_latitude=None,
                        snapped_longitude=None,
                        place_id=None,
                        found=False,
                    )
                )

                continue

            location = snapped_point.get(
                "location",
                {},
            )

            snapped_latitude = (
                location.get("latitude")
            )

            snapped_longitude = (
                location.get("longitude")
            )

            results.append(
                SnappedRoadPoint(
                    original_latitude=(
                        original_latitude
                    ),
                    original_longitude=(
                        original_longitude
                    ),
                    snapped_latitude=(
                        float(snapped_latitude)
                        if snapped_latitude is not None
                        else None
                    ),
                    snapped_longitude=(
                        float(snapped_longitude)
                        if snapped_longitude is not None
                        else None
                    ),
                    place_id=(
                        snapped_point.get(
                            "placeId"
                        )
                    ),
                    found=(
                        snapped_latitude is not None
                        and snapped_longitude is not None
                    ),
                )
            )

        return results

    async def find_nearest_road(
        self,
        latitude: float,
        longitude: float,
    ) -> SnappedRoadPoint:

        self._validate_coordinates(
            latitude,
            longitude,
        )

        response = (
            await self.provider.nearest_road(
                latitude=latitude,
                longitude=longitude,
            )
        )

        snapped_points = response.get(
            "snappedPoints",
            [],
        )

        if not snapped_points:
            return SnappedRoadPoint(
                original_latitude=latitude,
                original_longitude=longitude,
                snapped_latitude=None,
                snapped_longitude=None,
                place_id=None,
                found=False,
            )

        snapped_point = snapped_points[0]

        location = snapped_point.get(
            "location",
            {},
        )

        snapped_latitude = location.get(
            "latitude"
        )

        snapped_longitude = location.get(
            "longitude"
        )

        return SnappedRoadPoint(
            original_latitude=latitude,
            original_longitude=longitude,
            snapped_latitude=(
                float(snapped_latitude)
                if snapped_latitude is not None
                else None
            ),
            snapped_longitude=(
                float(snapped_longitude)
                if snapped_longitude is not None
                else None
            ),
            place_id=snapped_point.get(
                "placeId"
            ),
            found=(
                snapped_latitude is not None
                and snapped_longitude is not None
            ),
        )

    @staticmethod
    def _validate_coordinates(
        latitude: float,
        longitude: float,
    ) -> None:

        if not -90 <= latitude <= 90:
            raise ValueError(
                "Latitude must be between -90 and 90."
            )

        if not -180 <= longitude <= 180:
            raise ValueError(
                "Longitude must be between -180 and 180."
            )