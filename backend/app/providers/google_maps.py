from typing import Any

import httpx

from app.core.config import settings


class GoogleMapsProvider:
    """
    Adapter for Google Maps Platform APIs.

    This class is responsible only for communicating
    with Google Maps services. Business logic such as
    segmentation, metrics, and risk scoring belongs
    in the service layer.
    """

    BASE_URL = "https://maps.googleapis.com/maps/api"

    def __init__(self):
        if not settings.GOOGLE_MAPS_API_KEY:
            raise ValueError(
                "GOOGLE_MAPS_API_KEY is not configured."
            )

        self.api_key = settings.GOOGLE_MAPS_API_KEY

    async def _get(
        self,
        endpoint: str,
        params: dict[str, Any],
    ) -> dict[str, Any]:

        params["key"] = self.api_key

        async with httpx.AsyncClient(
            timeout=20.0
        ) as client:

            response = await client.get(
                f"{self.BASE_URL}/{endpoint}",
                params=params,
            )

            response.raise_for_status()

            return response.json()

    async def geocode(
        self,
        address: str,
    ) -> dict[str, Any]:

        return await self._get(
            "geocode/json",
            {
                "address": address,
            },
        )

    async def reverse_geocode(
        self,
        latitude: float,
        longitude: float,
    ) -> dict[str, Any]:

        return await self._get(
            "geocode/json",
            {
                "latlng": f"{latitude},{longitude}",
            },
        )

    async def directions(
        self,
        origin: str,
        destination: str,
        waypoints: list[str] | None = None,
        mode: str = "driving",
    ) -> dict[str, Any]:

        params: dict[str, Any] = {
            "origin": origin,
            "destination": destination,
            "mode": mode,
        }

        if waypoints:
            params["waypoints"] = "|".join(
                waypoints
            )

        return await self._get(
            "directions/json",
            params,
        )

    async def elevation(
        self,
        latitude: float,
        longitude: float,
    ) -> dict[str, Any]:

        return await self._get(
            "elevation/json",
            {
                "locations": f"{latitude},{longitude}",
            },
        )