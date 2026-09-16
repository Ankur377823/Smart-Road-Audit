import asyncio
import math
from dataclasses import dataclass

from app.providers.google_maps import GoogleMapsProvider


@dataclass
class PlaceResult:
    """
    Normalized place information used by SmartRoad Audit.
    """

    name: str
    category: str
    latitude: float
    longitude: float
    distance_m: float | None = None


@dataclass
class LandUseResult:
    """
    Aggregated land-use and surrounding activity
    information for an audit area.
    """

    places: list[PlaceResult]
    pedestrian_activity: str
    dominant_land_use: str | None


class LandUseService:
    """
    Handles surrounding land-use and activity information.

    Google Maps is used as the external data source.

    The service identifies nearby places and groups them
    into application-level land-use categories.

    Note:
        Google Places results are used as indicators of
        surrounding activity. They do not represent a
        complete land-use map or a measured pedestrian count.
    """

    PLACE_CATEGORIES = {
        "school": "education",
        "college": "education",
        "university": "education",
        "hospital": "healthcare",
        "market": "commercial",
        "shopping_mall": "commercial",
        "supermarket": "commercial",
        "bus_station": "transport",
        "transit_station": "transport",
        "train_station": "transport",
        "residential": "residential",
        "place_of_worship": "community",
    }

    HIGH_ACTIVITY_CATEGORIES = {
        "education",
        "transport",
        "commercial",
    }

    def __init__(
        self,
        google_maps: GoogleMapsProvider | None = None,
    ):
        self.google_maps = (
            google_maps or GoogleMapsProvider()
        )

    # --------------------------------------------------
    # Analyze audit area
    # --------------------------------------------------

    async def analyze_land_use(
        self,
        latitude: float,
        longitude: float,
        radius_m: int,
    ) -> LandUseResult:
        """
        Analyze nearby places around the audit center.

        Searches all configured Google Place types and
        aggregates the results into land-use categories.
        """

        self._validate_coordinates(
            latitude,
            longitude,
        )

        self._validate_radius(
            radius_m
        )

        place_types = list(
            self.PLACE_CATEGORIES.keys()
        )

        # Run independent Google Places searches
        # concurrently.
        tasks = [
            self._search_places(
                latitude=latitude,
                longitude=longitude,
                radius_m=radius_m,
                place_type=place_type,
            )
            for place_type in place_types
        ]

        responses = await asyncio.gather(
            *tasks,
            return_exceptions=True,
        )

        places: list[PlaceResult] = []

        for place_type, response in zip(
            place_types,
            responses,
        ):
            # One failed category search should not
            # invalidate the complete land-use analysis.
            if isinstance(
                response,
                Exception,
            ):
                continue

            places.extend(
                self._parse_places(
                    response=response,
                    place_type=place_type,
                    center_latitude=latitude,
                    center_longitude=longitude,
                )
            )

        # The same place can appear under more than one
        # Google place type.
        places = self._deduplicate_places(
            places
        )

        pedestrian_activity = (
            self._classify_pedestrian_activity(
                places
            )
        )

        dominant_land_use = (
            self._find_dominant_land_use(
                places
            )
        )

        return LandUseResult(
            places=places,
            pedestrian_activity=pedestrian_activity,
            dominant_land_use=dominant_land_use,
        )

    # --------------------------------------------------
    # Google Places search
    # --------------------------------------------------

    async def _search_places(
        self,
        latitude: float,
        longitude: float,
        radius_m: int,
        place_type: str,
    ) -> dict:
        """
        Search Google Places around the audit center.
        """

        return await self.google_maps.places_nearby(
            latitude=latitude,
            longitude=longitude,
            radius_m=radius_m,
            place_type=place_type,
        )

    # --------------------------------------------------
    # Parse Google Places
    # --------------------------------------------------

    def _parse_places(
        self,
        response: dict,
        place_type: str,
        center_latitude: float,
        center_longitude: float,
    ) -> list[PlaceResult]:
        """
        Convert Google Places results into normalized
        PlaceResult objects.
        """

        results: list[PlaceResult] = []

        category = self.PLACE_CATEGORIES.get(
            place_type,
            "other",
        )

        for place in response.get(
            "results",
            [],
        ):
            geometry = (
                place.get("geometry")
                or {}
            )

            location = (
                geometry.get("location")
                or {}
            )

            latitude = location.get(
                "lat"
            )

            longitude = location.get(
                "lng"
            )

            if (
                latitude is None
                or longitude is None
            ):
                continue

            try:
                latitude = float(latitude)
                longitude = float(longitude)
            except (
                TypeError,
                ValueError,
            ):
                continue

            name = place.get(
                "name"
            )

            if not name:
                name = "Unknown"

            distance_m = (
                self._calculate_distance(
                    center_latitude,
                    center_longitude,
                    latitude,
                    longitude,
                )
            )

            results.append(
                PlaceResult(
                    name=str(name).strip(),
                    category=category,
                    latitude=latitude,
                    longitude=longitude,
                    distance_m=round(
                        distance_m,
                        2,
                    ),
                )
            )

        return results

    # --------------------------------------------------
    # Remove duplicate places
    # --------------------------------------------------

    @staticmethod
    def _deduplicate_places(
        places: list[PlaceResult],
    ) -> list[PlaceResult]:
        """
        Remove duplicate places.

        Google may return the same place for multiple
        requested place types.
        """

        unique_places: list[PlaceResult] = []
        seen: set[tuple] = set()

        for place in places:

            key = (
                place.name.lower(),
                round(place.latitude, 5),
                round(place.longitude, 5),
            )

            if key in seen:
                continue

            seen.add(key)
            unique_places.append(place)

        return unique_places

    # --------------------------------------------------
    # Pedestrian activity
    # --------------------------------------------------

    @classmethod
    def _classify_pedestrian_activity(
        cls,
        places: list[PlaceResult],
    ) -> str:
        """
        Estimate surrounding pedestrian activity from
        nearby activity-generating places.

        This is an indirect indicator based on nearby
        place categories, not a measured pedestrian count.
        """

        if not places:
            return "low"

        high_activity_count = sum(
            1
            for place in places
            if place.category
            in cls.HIGH_ACTIVITY_CATEGORIES
        )

        if high_activity_count >= 10:
            return "high"

        if high_activity_count >= 4:
            return "medium"

        return "low"

    # --------------------------------------------------
    # Dominant land use
    # --------------------------------------------------

    @staticmethod
    def _find_dominant_land_use(
        places: list[PlaceResult],
    ) -> str | None:
        """
        Identify the most frequently represented
        land-use category.
        """

        if not places:
            return None

        counts: dict[str, int] = {}

        for place in places:
            counts[place.category] = (
                counts.get(
                    place.category,
                    0,
                )
                + 1
            )

        return max(
            counts,
            key=counts.get,
        )

    # --------------------------------------------------
    # Distance calculation
    # --------------------------------------------------

    @staticmethod
    def _calculate_distance(
        lat1: float,
        lng1: float,
        lat2: float,
        lng2: float,
    ) -> float:
        """
        Calculate approximate distance between two
        latitude/longitude points using the Haversine formula.

        Returns:
            Distance in metres.
        """

        earth_radius_m = 6_371_000.0

        lat1_rad = math.radians(
            lat1
        )
        lat2_rad = math.radians(
            lat2
        )

        delta_lat = math.radians(
            lat2 - lat1
        )

        delta_lng = math.radians(
            lng2 - lng1
        )

        a = (
            math.sin(delta_lat / 2) ** 2
            + math.cos(lat1_rad)
            * math.cos(lat2_rad)
            * math.sin(delta_lng / 2) ** 2
        )

        c = 2 * math.atan2(
            math.sqrt(a),
            math.sqrt(1 - a),
        )

        return earth_radius_m * c

    # --------------------------------------------------
    # Validation
    # --------------------------------------------------

    @staticmethod
    def _validate_coordinates(
        latitude: float,
        longitude: float,
    ) -> None:
        """
        Validate latitude and longitude.
        """

        if not -90 <= latitude <= 90:
            raise ValueError(
                "Latitude must be between -90 and 90."
            )

        if not -180 <= longitude <= 180:
            raise ValueError(
                "Longitude must be between -180 and 180."
            )

    @staticmethod
    def _validate_radius(
        radius_m: int,
    ) -> None:
        """
        Validate the requested audit radius.
        """

        if radius_m < 100:
            raise ValueError(
                "Radius must be at least 100 metres."
            )

        if radius_m > 10_000:
            raise ValueError(
                "Radius must not exceed 10,000 metres."
            )