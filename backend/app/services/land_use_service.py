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
    pedestrian_activity: str | None
    dominant_land_use: str | None
    data_complete: bool


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
        "educational_institution": "education",
        "university": "education",
        "hospital": "healthcare",
        "market": "commercial",
        "shopping_mall": "commercial",
        "supermarket": "commercial",
        "bus_station": "transport",
        "transit_station": "transport",
        "train_station": "transport",
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
        data_complete = all(
            not isinstance(response, Exception)
            and isinstance(response, dict)
            and response.get("status") in {None, "OK", "ZERO_RESULTS"}
            for response in responses
        )

        for place_type, response in zip(
            place_types,
            responses,
        ):
            # Keep any successful place records for display/analysis, but do
            # not classify pedestrian activity if even one requested category
            # failed: the resulting count would otherwise look complete when
            # it is only a partial sample.
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
            self._classify_pedestrian_activity(places)
            if data_complete
            else None
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
            data_complete=data_complete,
        )

    @classmethod
    def classify_segment_activity(
        cls,
        places: list[PlaceResult],
        encoded_geometry: str | None,
        data_complete: bool,
        buffer_m: float = 150.0,
    ) -> tuple[str | None, int | None]:
        """Classify the activity-place proxy near one segment's polyline."""
        if not data_complete or not encoded_geometry or buffer_m <= 0:
            return None, None

        points = cls._decode_polyline(encoded_geometry)
        if len(points) < 2:
            return None, None

        nearby_places = [
            place
            for place in places
            if place.category in cls.HIGH_ACTIVITY_CATEGORIES
            and cls._distance_to_polyline_m(
                place.latitude,
                place.longitude,
                points,
            ) <= buffer_m
        ]
        return (
            cls._classify_pedestrian_activity(nearby_places),
            len(nearby_places),
        )

    @staticmethod
    def _decode_polyline(encoded: str) -> list[tuple[float, float]]:
        points = []
        latitude = longitude = index = 0
        try:
            while index < len(encoded):
                deltas = []
                for _ in range(2):
                    result = shift = 0
                    while True:
                        byte = ord(encoded[index]) - 63
                        index += 1
                        result |= (byte & 0x1F) << shift
                        shift += 5
                        if byte < 0x20:
                            break
                    deltas.append(~(result >> 1) if result & 1 else result >> 1)
                latitude += deltas[0]
                longitude += deltas[1]
                points.append((latitude / 1e5, longitude / 1e5))
        except (IndexError, ValueError):
            return []
        return points

    @classmethod
    def _distance_to_polyline_m(
        cls,
        latitude: float,
        longitude: float,
        points: list[tuple[float, float]],
    ) -> float:
        """Return the shortest local-planar distance to a route polyline."""
        earth_radius_m = 6_371_000.0
        lat0 = math.radians(latitude)
        closest = float("inf")
        for first, second in zip(points, points[1:]):
            ax = math.radians(first[1] - longitude) * earth_radius_m * math.cos(lat0)
            ay = math.radians(first[0] - latitude) * earth_radius_m
            bx = math.radians(second[1] - longitude) * earth_radius_m * math.cos(lat0)
            by = math.radians(second[0] - latitude) * earth_radius_m
            dx, dy = bx - ax, by - ay
            length_squared = dx * dx + dy * dy
            if length_squared == 0:
                distance = math.hypot(ax, ay)
            else:
                ratio = max(0.0, min(1.0, -(ax * dx + ay * dy) / length_squared))
                distance = math.hypot(ax + ratio * dx, ay + ratio * dy)
            closest = min(closest, distance)
        return closest

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

        # Places API (New) returns `places` with `location.latitude` and
        # `location.longitude`. Accept the former legacy shape too so existing
        # provider adapters can still be used during local development.
        raw_places = response.get("places", response.get("results", []))
        for place in raw_places:
            location = place.get("location")
            if location is None:
                location = (place.get("geometry") or {}).get("location") or {}

            latitude = location.get("latitude", location.get("lat"))
            longitude = location.get("longitude", location.get("lng"))

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

            display_name = place.get("displayName") or {}
            name = display_name.get("text") or place.get("name")

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
