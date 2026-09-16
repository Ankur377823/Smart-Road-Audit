from dataclasses import dataclass

from app.providers.google_maps import GoogleMapsProvider
from app.services.metrics import MetricsService


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