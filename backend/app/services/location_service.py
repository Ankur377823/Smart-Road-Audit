from typing import Any

import httpx


class LocationService:
    """
    Handles location search and location details.

    The service is kept separate from the API routes so that
    location-related logic can be reused by different parts
    of the application.
    """

    NOMINATIM_URL = "https://nominatim.openstreetmap.org"

    def __init__(self):
        self.headers = {
            "User-Agent": "SmartRoad-Audit/1.0"
        }

    async def search_locations(
        self,
        query: str,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        """
        Search for locations using OpenStreetMap Nominatim.

        Example:
            query = "NIT Calicut"
        """

        if not query or not query.strip():
            return []

        limit = max(1, min(limit, 10))

        params = {
            "q": query.strip(),
            "format": "json",
            "limit": limit,
            "addressdetails": 1,
        }

        async with httpx.AsyncClient(
            timeout=10.0,
            headers=self.headers,
        ) as client:
            response = await client.get(
                f"{self.NOMINATIM_URL}/search",
                params=params,
            )

            response.raise_for_status()

            results = response.json()

        return [
            self._normalize_result(result)
            for result in results
        ]

    async def reverse_geocode(
        self,
        latitude: float,
        longitude: float,
    ) -> dict[str, Any] | None:
        """
        Convert latitude and longitude into a readable address.
        """

        params = {
            "lat": latitude,
            "lon": longitude,
            "format": "json",
            "addressdetails": 1,
        }

        async with httpx.AsyncClient(
            timeout=10.0,
            headers=self.headers,
        ) as client:
            response = await client.get(
                f"{self.NOMINATIM_URL}/reverse",
                params=params,
            )

            response.raise_for_status()

            result = response.json()

        if not result:
            return None

        return self._normalize_result(result)

    def _normalize_result(
        self,
        result: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Convert the provider response into the format
        used by SmartRoad Audit.
        """

        address = result.get("address", {})

        return {
            "place_id": result.get("place_id"),
            "name": result.get("display_name"),
            "latitude": self._to_float(result.get("lat")),
            "longitude": self._to_float(result.get("lon")),
            "address": {
                "road": address.get("road"),
                "city": (
                    address.get("city")
                    or address.get("town")
                    or address.get("village")
                ),
                "state": address.get("state"),
                "country": address.get("country"),
                "postcode": address.get("postcode"),
            },
        }

    @staticmethod
    def _to_float(value: Any) -> float | None:
        """
        Safely convert a value to float.
        """

        if value is None:
            return None

        try:
            return float(value)
        except (TypeError, ValueError):
            return None