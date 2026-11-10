from dataclasses import dataclass
import logging
import math
from statistics import median

from app.providers.google_maps import GoogleMapsProvider


logger = logging.getLogger(__name__)


@dataclass
class TerrainClassification:
    terrain_class: str | None
    cross_slope_percent: float | None
    profile_length_m: float | None = None


class TerrainClassificationService:
    """Estimate IRC terrain class from terrain cross sections.

    IRC classifies terrain by cross slope approximately perpendicular to the
    road. The 1 km road context, 250 m station spacing, 1-5 km cross-slope
    widths, and 50 m elevation spacing are implementation choices; IRC does
    not prescribe an automated DEM sampling scheme.
    """

    CONTEXT_LENGTH_M = 1000.0
    STATION_SPACING_M = 250.0
    MIN_TRANSECT_WIDTH_M = 1000.0
    MAX_TRANSECT_WIDTH_M = 5000.0
    TRANSECT_SPACING_M = 50.0

    def __init__(
        self,
        maps_provider: GoogleMapsProvider | None = None,
    ):
        self.maps_provider = maps_provider or GoogleMapsProvider()

    async def classify(
        self,
        latitude: float,
        longitude: float,
        roads,
    ) -> TerrainClassification:
        # Reuse the route geometries gathered for the audit. Select a pair of
        # routes that start at the selected point and continue in opposite
        # directions along the same road, then join them at the audit center.
        # This avoids asking the routing service to choose a new fixed bearing.
        profile_result = self._road_profile(latitude, longitude, roads)
        if profile_result is None:
            return TerrainClassification(None, None)
        profile, profile_length_m = profile_result

        sample_points: list[tuple[float, float]] = []
        offsets = self._transect_offsets()
        for station_lat, station_lng, bearing in profile:
            perpendicular_bearing = (bearing + 90.0) % 360.0
            for offset in offsets:
                sample_points.append(
                    self._offset_coordinate(
                        station_lat,
                        station_lng,
                        perpendicular_bearing,
                        offset,
                    )
                )

        try:
            response = await self.maps_provider.elevation_for_points(sample_points)
        except Exception as exc:
            response = getattr(exc, "response", None)
            status_code = getattr(response, "status_code", None)
            logger.warning(
                "Terrain Elevation API request failed (%s, HTTP %s).",
                type(exc).__name__,
                status_code or "unknown",
            )
            return TerrainClassification(
                None,
                None,
                round(profile_length_m, 2),
            )
        elevations = [
            result.get("elevation")
            for result in response.get("results", [])
        ]
        expected = len(profile) * len(offsets)
        if len(elevations) != expected or any(value is None for value in elevations):
            logger.warning(
                "Terrain Elevation API returned an incomplete profile "
                "(status=%s, received=%s, expected=%s, missing=%s).",
                response.get("status", "unknown"),
                len(elevations),
                expected,
                sum(value is None for value in elevations),
            )
            return TerrainClassification(None, None, round(profile_length_m, 2))

        station_elevations = []
        for station_index in range(len(profile)):
            start = station_index * len(offsets)
            station_elevations.append([
                float(value) for value in elevations[start : start + len(offsets)]
            ])

        # 5 stations x 101 points = 505 locations, within the Elevation API's
        # 512-location request limit. Evaluate nested 1 km to 5 km widths from
        # this single response; use the first width whose class agrees with
        # the next wider estimate, or the full 5 km width if none agree.
        estimates = []
        for width_m in range(
            int(self.MIN_TRANSECT_WIDTH_M),
            int(self.MAX_TRANSECT_WIDTH_M) + 1,
            1000,
        ):
            selected_offsets = [
                offset for offset in offsets if abs(offset) <= width_m / 2
            ]
            station_slopes = []
            for values in station_elevations:
                selected_elevations = [
                    elevation
                    for offset, elevation in zip(offsets, values)
                    if abs(offset) <= width_m / 2
                ]
                station_slopes.append(
                    self._linear_slope_percent(
                        selected_offsets,
                        selected_elevations,
                    )
                )
            representative = round(median(station_slopes), 2)
            estimates.append(
                (
                    width_m,
                    representative,
                    self.classify_cross_slope(representative),
                )
            )

        selected_estimate = estimates[-1]
        for current, wider in zip(estimates, estimates[1:]):
            if current[2] == wider[2]:
                selected_estimate = current
                break

        _, representative_slope, terrain_class = selected_estimate
        return TerrainClassification(
            terrain_class=terrain_class,
            cross_slope_percent=representative_slope,
            profile_length_m=round(profile_length_m, 2),
        )

    @classmethod
    def classify_cross_slope(cls, slope_percent: float) -> str:
        value = abs(float(slope_percent))
        if value < 10.0:
            return "plain"
        if value < 25.0:
            return "rolling"
        if value <= 60.0:
            return "mountainous"
        return "steep"

    @classmethod
    def _road_profile(cls, latitude, longitude, roads):
        candidates = []
        for road in roads:
            encoded = getattr(road, "route_geometry", None)
            points = cls._decode_polyline(encoded)
            if len(points) < 2 or cls._distance_m(points[0], (latitude, longitude)) > 100:
                continue
            cumulative = cls._cumulative_distances(points)
            if cumulative[-1] <= 0:
                continue
            bearing = cls._bearing(points[0], points[1])
            candidates.append((points, cumulative, bearing))

        # Prefer a centered profile where both directions are available.
        # Use whatever length exists on each side, up to 500 m per side.
        pair = None
        pair_score = None
        for index, first in enumerate(candidates):
            for second in candidates[index + 1 :]:
                angular_difference = abs((first[2] - second[2] + 180) % 360 - 180)
                if angular_difference < 135:
                    continue
                score = (
                    min(cls.CONTEXT_LENGTH_M / 2, first[1][-1])
                    + min(cls.CONTEXT_LENGTH_M / 2, second[1][-1])
                    - abs(180 - angular_difference) * 2
                )
                if pair_score is None or score > pair_score:
                    pair, pair_score = (first, second), score

        best_single = max(
            candidates,
            key=lambda item: min(cls.CONTEXT_LENGTH_M, item[1][-1]),
            default=None,
        )
        pair_length = (
            min(cls.CONTEXT_LENGTH_M / 2, pair[0][1][-1])
            + min(cls.CONTEXT_LENGTH_M / 2, pair[1][1][-1])
            if pair is not None
            else 0.0
        )
        single_length = (
            min(cls.CONTEXT_LENGTH_M, best_single[1][-1])
            if best_single is not None
            else 0.0
        )

        if pair is not None and pair_length >= single_length:
            first, second = pair
            # Routes start at the selected point and extend outward. Reverse
            # one to create a continuous profile through the audit center.
            points = list(reversed(first[0])) + second[0][1:]
            cumulative = cls._cumulative_distances(points)
            center_distance = cumulative[len(first[0]) - 1]
            left_length = min(cls.CONTEXT_LENGTH_M / 2, first[1][-1])
            right_length = min(cls.CONTEXT_LENGTH_M / 2, second[1][-1])
            start_distance = center_distance - left_length
            end_distance = center_distance + right_length
            profile_length = left_length + right_length
        else:
            # At a junction or dead end there may be geometry on only one
            # side. Use the longest available route from the audit point,
            # capped at 1 km, rather than discard usable shorter samples.
            best = best_single
            if best is None:
                return None
            points, cumulative, _ = best
            start_distance = 0.0
            profile_length = min(cls.CONTEXT_LENGTH_M, cumulative[-1])
            end_distance = profile_length

        distances = {start_distance, end_distance}
        first_station = math.ceil(start_distance / cls.STATION_SPACING_M)
        last_station = math.floor(end_distance / cls.STATION_SPACING_M)
        distances.update(
            station * cls.STATION_SPACING_M
            for station in range(first_station, last_station + 1)
        )
        if pair is not None and start_distance <= center_distance <= end_distance:
            distances.add(center_distance)

        stations = []
        for distance in sorted(distances):
            coordinate = cls._coordinate_at_distance(points, cumulative, distance)
            before = cls._coordinate_at_distance(
                points,
                cumulative,
                max(start_distance, distance - 20.0),
            )
            after = cls._coordinate_at_distance(
                points,
                cumulative,
                min(end_distance, distance + 20.0),
            )
            if before == after:
                continue
            stations.append((*coordinate, cls._bearing(before, after)))

        if not stations:
            return None
        return stations, profile_length

    @classmethod
    def _cumulative_distances(cls, points):
        cumulative = [0.0]
        for first, second in zip(points, points[1:]):
            cumulative.append(cumulative[-1] + cls._distance_m(first, second))
        return cumulative

    @classmethod
    def _coordinate_at_distance(cls, points, cumulative, distance):
        for index in range(1, len(cumulative)):
            if cumulative[index] <= cumulative[index - 1]:
                continue
            if cumulative[index] >= distance:
                segment_length = cumulative[index] - cumulative[index - 1]
                ratio = (distance - cumulative[index - 1]) / segment_length
                first, second = points[index - 1], points[index]
                return (
                    first[0] + (second[0] - first[0]) * ratio,
                    first[1] + (second[1] - first[1]) * ratio,
                )
        return points[-1]

    @classmethod
    def _transect_offsets(cls):
        count = int(cls.MAX_TRANSECT_WIDTH_M / cls.TRANSECT_SPACING_M)
        return [
            -cls.MAX_TRANSECT_WIDTH_M / 2 + index * cls.TRANSECT_SPACING_M
            for index in range(count + 1)
        ]

    @staticmethod
    def _linear_slope_percent(offsets, elevations):
        mean_x = sum(offsets) / len(offsets)
        mean_y = sum(elevations) / len(elevations)
        numerator = sum(
            (x - mean_x) * (y - mean_y)
            for x, y in zip(offsets, elevations)
        )
        denominator = sum((x - mean_x) ** 2 for x in offsets)
        return abs(numerator / denominator) * 100.0 if denominator else 0.0

    @staticmethod
    def _offset_coordinate(latitude, longitude, bearing_deg, distance_m):
        earth_radius_m = 6_371_000.0
        bearing = math.radians(bearing_deg)
        lat1 = math.radians(latitude)
        lng1 = math.radians(longitude)
        angular_distance = distance_m / earth_radius_m
        lat2 = math.asin(
            math.sin(lat1) * math.cos(angular_distance)
            + math.cos(lat1) * math.sin(angular_distance) * math.cos(bearing)
        )
        lng2 = lng1 + math.atan2(
            math.sin(bearing) * math.sin(angular_distance) * math.cos(lat1),
            math.cos(angular_distance) - math.sin(lat1) * math.sin(lat2),
        )
        return math.degrees(lat2), math.degrees(lng2)

    @staticmethod
    def _distance_m(first, second):
        earth_radius_m = 6_371_000.0
        lat1, lat2 = math.radians(first[0]), math.radians(second[0])
        delta_lat = lat2 - lat1
        delta_lng = math.radians(second[1] - first[1])
        value = (
            math.sin(delta_lat / 2) ** 2
            + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lng / 2) ** 2
        )
        return 2 * earth_radius_m * math.asin(math.sqrt(value))

    @staticmethod
    def _bearing(first, second):
        lat1, lat2 = math.radians(first[0]), math.radians(second[0])
        delta_lng = math.radians(second[1] - first[1])
        y = math.sin(delta_lng) * math.cos(lat2)
        x = math.cos(lat1) * math.sin(lat2) - (
            math.sin(lat1) * math.cos(lat2) * math.cos(delta_lng)
        )
        return (math.degrees(math.atan2(y, x)) + 360.0) % 360.0

    @staticmethod
    def _decode_polyline(encoded):
        if not encoded:
            return []
        points = []
        latitude = longitude = index = 0
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
        return points
