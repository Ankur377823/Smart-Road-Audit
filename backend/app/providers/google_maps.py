from typing import Any

import httpx

from app.core.config import settings


class GoogleMapsProvider:
    """
    Adapter for Google Maps Platform APIs.

    This class is responsible only for communicating
    with Google Maps services.

    Business logic such as segmentation, metrics,
    risk scoring, and checklist generation belongs
    in the service layer.
    """

    MAPS_BASE_URL = (
        "https://maps.googleapis.com/maps/api"
    )

    ROUTES_BASE_URL = (
        "https://routes.googleapis.com"
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
    # COMMON GET REQUEST
    # ==========================================================

    async def _get(
        self,
        endpoint: str,
        params: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Send a GET request to Google Maps Platform.
        """

        request_params = {
            **params,
            "key": self.api_key,
        }

        async with httpx.AsyncClient(
            timeout=20.0
        ) as client:

            response = await client.get(
                f"{self.MAPS_BASE_URL}/{endpoint}",
                params=request_params,
            )

            response.raise_for_status()

            data = response.json()

        self._validate_google_response(
            data
        )

        return data

    # ==========================================================
    # COMMON POST REQUEST - ROUTES API
    # ==========================================================

    async def _post_routes(
        self,
        endpoint: str,
        payload: dict[str, Any],
        field_mask: str,
    ) -> dict[str, Any]:
        """
        Send a POST request to Google Routes API.

        Routes API requires:
        - X-Goog-Api-Key
        - X-Goog-FieldMask
        """

        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self.api_key,
            "X-Goog-FieldMask": field_mask,
        }

        async with httpx.AsyncClient(
            timeout=20.0
        ) as client:

            response = await client.post(
                f"{self.ROUTES_BASE_URL}/{endpoint}",
                json=payload,
                headers=headers,
            )

            response.raise_for_status()

            return response.json()

    # ==========================================================
    # GOOGLE RESPONSE VALIDATION
    # ==========================================================

    @staticmethod
    def _validate_google_response(
        data: dict[str, Any],
    ) -> None:
        """
        Check Google's legacy-style response status.

        Some Google Maps Platform APIs return a status
        field inside the JSON response.
        """

        api_status = data.get("status")

        if api_status in {
            None,
            "OK",
            "ZERO_RESULTS",
        }:
            return

        error_message = data.get(
            "error_message",
            "Google Maps API request failed.",
        )

        raise RuntimeError(
            f"Google Maps API error: "
            f"{api_status or 'UNKNOWN'} - "
            f"{error_message}"
        )

    # ==========================================================
    # GEOCODING
    # ==========================================================

    async def geocode(
        self,
        address: str,
    ) -> dict[str, Any]:
        """
        Convert an address into latitude/longitude.
        """

        return await self._get(
            "geocode/json",
            {
                "address": address,
            },
        )

    # ==========================================================
    # REVERSE GEOCODING
    # ==========================================================

    async def reverse_geocode(
        self,
        latitude: float,
        longitude: float,
    ) -> dict[str, Any]:
        """
        Convert latitude/longitude into a readable address.
        """

        self._validate_coordinates(
            latitude,
            longitude,
        )

        return await self._get(
            "geocode/json",
            {
                "latlng": (
                    f"{latitude},{longitude}"
                ),
            },
        )

    # ==========================================================
    # ROUTES API
    # ==========================================================

    async def compute_route(
        self,
        origin_latitude: float,
        origin_longitude: float,
        destination_latitude: float,
        destination_longitude: float,
        traffic_aware: bool = True,
    ) -> dict[str, Any]:
        """
        Calculate a driving route using Google's
        current Routes API.

        Returns route-level information as well as
        individual legs and navigation steps.

        Route-level data:
        - distance
        - duration
        - static duration
        - encoded route polyline

        Step-level data:
        - distance
        - static duration
        - encoded step polyline
        - navigation instruction
        - start location
        - end location
        """

        self._validate_coordinates(
            origin_latitude,
            origin_longitude,
        )

        self._validate_coordinates(
            destination_latitude,
            destination_longitude,
        )

        routing_preference = (
            "TRAFFIC_AWARE"
            if traffic_aware
            else "TRAFFIC_UNAWARE"
        )

        payload = {
            "origin": {
                "location": {
                    "latLng": {
                        "latitude": (
                            origin_latitude
                        ),
                        "longitude": (
                            origin_longitude
                        ),
                    }
                }
            },
            "destination": {
                "location": {
                    "latLng": {
                        "latitude": (
                            destination_latitude
                        ),
                        "longitude": (
                            destination_longitude
                        ),
                    }
                }
            },
            "travelMode": "DRIVE",
            "routingPreference": (
                routing_preference
            ),
            "computeAlternativeRoutes": False,
            "routeModifiers": {
                "avoidTolls": False,
                "avoidHighways": False,
                "avoidFerries": False,
            },
            "languageCode": "en-US",
            "units": "METRIC",
        }

        # --------------------------------------------------
        # Route + step field mask
        # --------------------------------------------------

        field_mask = (
            "routes.distanceMeters,"
            "routes.duration,"
            "routes.staticDuration,"
            "routes.polyline.encodedPolyline,"
            "routes.legs.steps.distanceMeters,"
            "routes.legs.steps.staticDuration,"
            "routes.legs.steps.polyline.encodedPolyline,"
            "routes.legs.steps.navigationInstruction.instructions,"
            "routes.legs.steps.startLocation,"
            "routes.legs.steps.endLocation"
        )

        return await self._post_routes(
            endpoint=(
                "directions/v2:computeRoutes"
            ),
            payload=payload,
            field_mask=field_mask,
        )

    # ==========================================================
    # ROUTE USING STRING LOCATIONS
    # ==========================================================

    async def directions(
        self,
        origin: str,
        destination: str,
        waypoints: list[str] | None = None,
        mode: str = "driving",
        departure_time: str | None = None,
    ) -> dict[str, Any]:
        """
        Backward-compatible route method.

        This method currently uses the legacy Directions API.

        New code should prefer compute_route() with
        latitude/longitude coordinates and the current
        Routes API.
        """

        params: dict[str, Any] = {
            "origin": origin,
            "destination": destination,
            "mode": mode,
        }

        if waypoints:
            params["waypoints"] = "|".join(
                waypoints
            )

        if departure_time:
            params["departure_time"] = (
                departure_time
            )

        return await self._get(
            "directions/json",
            params,
        )

    # ==========================================================
    # ELEVATION
    # ==========================================================

    async def elevation(
        self,
        latitude: float,
        longitude: float,
    ) -> dict[str, Any]:
        """
        Get elevation for a single coordinate.
        """

        self._validate_coordinates(
            latitude,
            longitude,
        )

        return await self._get(
            "elevation/json",
            {
                "locations": (
                    f"{latitude},{longitude}"
                ),
            },
        )

    # ==========================================================
    # MULTIPLE ELEVATION POINTS
    # ==========================================================

    async def elevation_for_points(
        self,
        points: list[tuple[float, float]],
    ) -> dict[str, Any]:
        """
        Get elevation for multiple coordinates.

        Useful for creating a terrain profile
        along a road segment.
        """

        if not points:
            return {
                "results": [],
                "status": "ZERO_RESULTS",
            }

        for latitude, longitude in points:
            self._validate_coordinates(
                latitude,
                longitude,
            )

        locations = "|".join(
            f"{latitude},{longitude}"
            for latitude, longitude in points
        )

        return await self._get(
            "elevation/json",
            {
                "locations": locations,
            },
        )

    # ==========================================================
    # PLACES - NEARBY SEARCH
    # ==========================================================

    async def places_nearby(
        self,
        latitude: float,
        longitude: float,
        radius_m: int,
        place_type: str,
    ) -> dict[str, Any]:
        """
        Find places around a selected location.

        Used by the land-use service to identify
        surrounding activity such as:

        - schools
        - hospitals
        - markets
        - shopping areas
        - transit facilities
        - other relevant places
        """

        self._validate_coordinates(
            latitude,
            longitude,
        )

        if radius_m <= 0:
            raise ValueError(
                "Place search radius must be greater than zero."
            )

        return await self._get(
            "place/nearbysearch/json",
            {
                "location": (
                    f"{latitude},{longitude}"
                ),
                "radius": radius_m,
                "type": place_type,
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