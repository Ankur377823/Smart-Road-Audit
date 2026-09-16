from typing import Any

import httpx

from app.core.config import settings


class GoogleRoadsProvider:
    """
    Provider for Google Roads API.

    Responsibilities:
    - Snap a coordinate to a road
    - Snap multiple coordinates to roads
    - Find the nearest road

    Route calculation belongs to GoogleMapsProvider
    through the Google Routes API.
    """

    BASE_URL = (
        "https://roads.googleapis.com/v1"
    )

    def __init__(self):
        if not settings.GOOGLE_MAPS_API_KEY:
            raise ValueError(
                "GOOGLE_MAPS_API_KEY is not configured."
            )

        self.api_key = (
            settings.GOOGLE_MAPS_API_KEY
        )

    # ==========================================================
    # COMMON HTTP REQUEST
    # ==========================================================

    async def _get(
        self,
        endpoint: str,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Send a GET request to Google Roads API.
        """

        request_params = {
            **params,
            "key": self.api_key,
        }

        async with httpx.AsyncClient(
            timeout=20.0
        ) as client:

            response = await client.get(
                f"{self.BASE_URL}/{endpoint}",
                params=request_params,
            )

            response.raise_for_status()

            data = response.json()

        self._validate_response(data)

        return data

    # ==========================================================
    # RESPONSE VALIDATION
    # ==========================================================

    @staticmethod
    def _validate_response(
        data: dict[str, Any],
    ) -> None:
        """
        Validate a Google Roads API response.

        Roads API errors may be returned as an
        error object even when the HTTP request itself
        was successfully received.
        """

        if "error" not in data:
            return

        error = data.get(
            "error",
            {},
        )

        message = error.get(
            "message",
            "Google Roads API request failed.",
        )

        code = error.get(
            "code",
            "UNKNOWN",
        )

        raise RuntimeError(
            f"Google Roads API error "
            f"{code}: {message}"
        )

    # ==========================================================
    # SNAP ONE POINT TO ROAD
    # ==========================================================

    async def snap_to_road(
        self,
        latitude: float,
        longitude: float,
    ) -> dict[str, Any]:
        """
        Snap one coordinate to the nearest road.

        Google Roads API:
            snapToRoads

        Input:
            latitude
            longitude

        Returns:
            snappedPoints
        """

        self._validate_coordinates(
            latitude,
            longitude,
        )

        return await self._get(
            "snapToRoads",
            {
                "path": (
                    f"{latitude},{longitude}"
                ),
                "interpolate": "false",
            },
        )

    # ==========================================================
    # SNAP MULTIPLE POINTS TO ROAD
    # ==========================================================

    async def snap_points_to_road(
        self,
        points: list[tuple[float, float]],
        interpolate: bool = False,
    ) -> dict[str, Any]:
        """
        Snap multiple GPS coordinates to roads.

        Example:

            [
                (12.9716, 77.5946),
                (12.9720, 77.5950),
            ]
        """

        if not points:
            return {
                "snappedPoints": []
            }

        for latitude, longitude in points:
            self._validate_coordinates(
                latitude,
                longitude,
            )

        path = "|".join(
            f"{latitude},{longitude}"
            for latitude, longitude in points
        )

        return await self._get(
            "snapToRoads",
            {
                "path": path,
                "interpolate": str(
                    interpolate
                ).lower(),
            },
        )

    # ==========================================================
    # FIND NEAREST ROAD
    # ==========================================================

    async def nearest_road(
        self,
        latitude: float,
        longitude: float,
    ) -> dict[str, Any]:
        """
        Find the nearest road to a coordinate.

        Google Roads API:
            nearestRoads
        """

        self._validate_coordinates(
            latitude,
            longitude,
        )

        return await self._get(
            "nearestRoads",
            {
                "points": (
                    f"{latitude},{longitude}"
                ),
            },
        )

    # ==========================================================
    # COORDINATE VALIDATION
    # ==========================================================

    @staticmethod
    def _validate_coordinates(
        latitude: float,
        longitude: float,
    ) -> None:
        """
        Validate geographic coordinates.
        """

        if not -90 <= latitude <= 90:
            raise ValueError(
                "Latitude must be between -90 and 90."
            )

        if not -180 <= longitude <= 180:
            raise ValueError(
                "Longitude must be between -180 and 180."
            )