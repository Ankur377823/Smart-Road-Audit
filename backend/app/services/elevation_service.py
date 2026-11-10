from dataclasses import dataclass
import logging
import math

from app.providers.google_maps import GoogleMapsProvider
from app.services.metrics import MetricsService


logger = logging.getLogger(__name__)


@dataclass
class ElevationResult:
    """
    Elevation information calculated for a road segment.
    """

    start_elevation_m: float | None
    end_elevation_m: float | None
    elevation_difference_m: float | None
    gradient_percent: float | None


class ElevationService:
    """
    Retrieves elevation data from Google Maps and calculates
    the longitudinal gradient of a road segment.

    The service uses a single Google Elevation API request
    for the start and end points of a segment.
    """

    def __init__(
        self,
        google_maps: GoogleMapsProvider | None = None,
    ):
        self.google_maps = (
            google_maps or GoogleMapsProvider()
        )

        self.metrics_service = MetricsService()

    async def calculate_gradients_for_roads(
        self,
        roads,
    ) -> dict[str, float | None]:
        """Calculate longitudinal gradients for encoded road geometries.

        All unique road geometries are batched into one Elevation API request.
        Each value is the signed endpoint elevation change over the geometry's
        measured horizontal length.
        """
        geometries = {}
        for road in roads:
            geometry = getattr(road, "geometry", None)
            if not geometry or geometry in geometries:
                continue
            points = self._decode_polyline(geometry)
            if len(points) < 2:
                continue
            distance_m = sum(
                self._distance_m(first, second)
                for first, second in zip(points, points[1:])
            )
            if distance_m > 0:
                geometries[geometry] = (points, distance_m)

        gradients = {getattr(road, "geometry", None): None for road in roads}
        if not geometries:
            return gradients

        request_points = []
        geometry_keys = list(geometries)
        for geometry in geometry_keys:
            points, _ = geometries[geometry]
            request_points.extend((points[0], points[-1]))

        try:
            response = await self.google_maps.elevation_for_points(request_points)
        except Exception as exc:
            response = getattr(exc, "response", None)
            logger.warning(
                "Gradient Elevation API request failed (%s, HTTP %s).",
                type(exc).__name__,
                getattr(response, "status_code", None) or "unknown",
            )
            return gradients

        results = response.get("results", [])
        for index, geometry in enumerate(geometry_keys):
            result_index = index * 2
            if result_index + 1 >= len(results):
                continue
            start_elevation = results[result_index].get("elevation")
            end_elevation = results[result_index + 1].get("elevation")
            if start_elevation is None or end_elevation is None:
                continue
            _, distance_m = geometries[geometry]
            gradients[geometry] = self.metrics_service.calculate_gradient(
                float(end_elevation) - float(start_elevation),
                distance_m,
            )

        return gradients

    @staticmethod
    def _decode_polyline(encoded: str) -> list[tuple[float, float]]:
        points = []
        latitude = longitude = index = 0
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
                latitude += values[0]
                longitude += values[1]
                points.append((latitude / 1e5, longitude / 1e5))
        except (IndexError, ValueError):
            return []
        return points

    @staticmethod
    def _distance_m(first: tuple[float, float], second: tuple[float, float]) -> float:
        earth_radius_m = 6_371_000.0
        lat1, lat2 = math.radians(first[0]), math.radians(second[0])
        delta_lat = lat2 - lat1
        delta_lng = math.radians(second[1] - first[1])
        value = (
            math.sin(delta_lat / 2) ** 2
            + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lng / 2) ** 2
        )
        return 2 * earth_radius_m * math.asin(math.sqrt(value))

    async def calculate_segment_elevation(
        self,
        start_lat: float,
        start_lng: float,
        end_lat: float,
        end_lng: float,
        horizontal_distance_m: float,
    ) -> ElevationResult:
        """
        Calculate elevation difference and longitudinal
        gradient for a road segment.
        """

        self._validate_coordinates(
            start_lat,
            start_lng,
        )

        self._validate_coordinates(
            end_lat,
            end_lng,
        )

        if horizontal_distance_m <= 0:
            raise ValueError(
                "Horizontal distance must be greater than zero."
            )

        # --------------------------------------------------
        # Get both elevations in one Google API request
        # --------------------------------------------------

        response = await self.google_maps.elevation_for_points(
            points=[
                (start_lat, start_lng),
                (end_lat, end_lng),
            ]
        )

        elevations = self._extract_elevations(
            response
        )

        if len(elevations) < 2:
            return ElevationResult(
                start_elevation_m=(
                    elevations[0]
                    if len(elevations) > 0
                    else None
                ),
                end_elevation_m=None,
                elevation_difference_m=None,
                gradient_percent=None,
            )

        start_elevation = elevations[0]
        end_elevation = elevations[1]

        # --------------------------------------------------
        # Calculate elevation difference
        # --------------------------------------------------

        elevation_difference = (
            end_elevation - start_elevation
        )

        # --------------------------------------------------
        # Calculate gradient
        # --------------------------------------------------

        gradient = (
            self.metrics_service.calculate_gradient(
                elevation_difference_m=elevation_difference,
                horizontal_distance_m=horizontal_distance_m,
            )
        )

        return ElevationResult(
            start_elevation_m=round(
                start_elevation,
                2,
            ),
            end_elevation_m=round(
                end_elevation,
                2,
            ),
            elevation_difference_m=round(
                elevation_difference,
                2,
            ),
            gradient_percent=gradient,
        )

    @staticmethod
    def _extract_elevations(
        response: dict,
    ) -> list[float]:
        """
        Extract valid elevation values from Google's
        Elevation API response.
        """

        results = response.get(
            "results",
            [],
        )

        elevations: list[float] = []

        for result in results:

            elevation = result.get(
                "elevation"
            )

            if elevation is None:
                continue

            try:
                elevations.append(
                    float(elevation)
                )
            except (TypeError, ValueError):
                continue

        return elevations

    @staticmethod
    def _validate_coordinates(
        latitude: float,
        longitude: float,
    ) -> None:
        """
        Validate latitude and longitude values.
        """

        if not -90 <= latitude <= 90:
            raise ValueError(
                "Latitude must be between -90 and 90."
            )

        if not -180 <= longitude <= 180:
            raise ValueError(
                "Longitude must be between -180 and 180."
            )
