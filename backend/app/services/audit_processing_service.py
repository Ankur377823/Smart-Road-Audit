import asyncio
import math
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.audit import Audit
from app.models.segment import Segment
from app.repositories.audit_repository import AuditRepository
from app.repositories.checklist_repository import ChecklistRepository
from app.repositories.segment_repository import SegmentRepository
from app.services.google_road_service import (
    GoogleRoadService,
    RoadServiceResult,
)
from app.services.checklist import ChecklistService
from app.services.metrics import MetricsService, SegmentMetrics
from app.services.land_use_service import LandUseService
from app.services.risk_scoring import RiskScoringService
from app.services.terrain_classification import TerrainClassificationService
from app.services.elevation_service import ElevationService
from app.services.road_segmentation_service import (
    RoadSegmentationService,
)
from app.services.segmentation import SegmentationService
from app.services.road_snap_service import (
    RoadSnapService,
)


@dataclass
class AuditProcessingResult:
    """
    Result returned after processing an audit.
    """

    audit_id: int
    road_count: int
    segment_count: int
    status: str
    terrain_class: str | None = None


class AuditProcessingService:
    """
    Coordinates the SmartRoad Audit processing pipeline.

    Current pipeline:

        Audit
          ↓
        Selected road point
          ↓
        Road snapping
          ↓
        Google Routes API
          ↓
        Road normalization
          ↓
        Road segmentation
          ↓
        PostgreSQL

    Later this service will also run:

        Routes / Traffic
        Elevation
        Land use
        Metrics
        Risk scoring
        Checklist
    """

    # Number of route probes around the audit center.
    ROUTE_PROBES = 8

    # Maximum number of segments saved for one audit.
    MAX_SEGMENTS_PER_AUDIT = 10

    def __init__(self, db: Session):
        self.db = db

        self.audit_repository = AuditRepository(db)
        self.segment_repository = SegmentRepository(db)
        self.checklist_repository = ChecklistRepository(db)
        self.checklist_service = ChecklistService()

        try:
            self.google_road_service = GoogleRoadService()
        except Exception:
            if not settings.DEMO_MODE:
                raise
            self.google_road_service = None

        try:
            self.road_snap_service = RoadSnapService()
        except Exception:
            if not settings.DEMO_MODE:
                raise
            self.road_snap_service = None

        try:
            self.terrain_classification_service = TerrainClassificationService()
        except Exception:
            if not settings.DEMO_MODE:
                raise
            self.terrain_classification_service = None

        try:
            self.elevation_service = ElevationService()
        except Exception:
            if not settings.DEMO_MODE:
                raise
            self.elevation_service = None

        try:
            self.land_use_service = LandUseService()
        except Exception:
            if not settings.DEMO_MODE:
                raise
            self.land_use_service = None

        self.segmentation_service = (
            RoadSegmentationService()
        )

        self.risk_scoring_service = RiskScoringService()

    # ==========================================================
    # MAIN AUDIT PROCESSING
    # ==========================================================

    async def process_audit(
        self,
        audit_id: int,
    ) -> AuditProcessingResult:
        """
        Process an existing audit using the location,
        radius, and road class stored in the Audit record.
        """

        # --------------------------------------------------
        # 1. Get audit
        # --------------------------------------------------

        audit = (
            self.audit_repository.get_by_id(
                audit_id
            )
        )

        if audit is None:
            raise ValueError(
                f"Audit with id {audit_id} not found."
            )

        # --------------------------------------------------
        # 2. Mark audit as processing
        # --------------------------------------------------

        self.audit_repository.update_status(
            audit,
            "processing",
        )

        try:

            # --------------------------------------------------
            # 3. Verify selected point is on a road
            # --------------------------------------------------

            snapped_point = None

            if self.road_snap_service is not None:
                try:
                    snapped_point = (
                        await self.road_snap_service.snap_point(
                            latitude=audit.center_lat,
                            longitude=audit.center_lng,
                        )
                    )
                except Exception:
                    if not settings.DEMO_MODE:
                        raise

            if (
                snapped_point is not None
                and not snapped_point.found
                and not settings.DEMO_MODE
            ):
                raise ValueError(
                    "The selected audit point could not "
                    "be matched to a road."
                )

            # --------------------------------------------------
            # 4. Use snapped location as audit center
            # --------------------------------------------------

            center_lat = audit.center_lat
            center_lng = audit.center_lng

            if snapped_point is not None and snapped_point.found:
                center_lat = (
                    snapped_point.snapped_latitude
                    or audit.center_lat
                )
                center_lng = (
                    snapped_point.snapped_longitude
                    or audit.center_lng
                )

            # --------------------------------------------------
            # 4. Get road data around audit area
            # --------------------------------------------------

            roads = await self._get_roads(
                audit=audit,
                center_lat=center_lat,
                center_lng=center_lng,
            )

            if not roads:
                raise ValueError(
                    "No road data was returned for the "
                    "selected audit area."
                )

            # Nearby activity places are an exposure proxy, not a pedestrian
            # count. Fetch once for the audit area, then associate each place
            # with the nearest segment geometry.
            nearby_places = []
            places_data_complete = False
            if self.land_use_service is not None:
                try:
                    land_use = await self.land_use_service.analyze_land_use(
                        latitude=center_lat,
                        longitude=center_lng,
                        radius_m=min(audit.radius_m + 150, 10_000),
                    )
                    nearby_places = land_use.places
                    places_data_complete = land_use.data_complete
                except Exception:
                    nearby_places = []
                    places_data_complete = False

            # Classify from the road geometries already returned by the
            # audit route probes. Terrain lookup is optional: incomplete
            # geometry/elevation data leaves terrain unknown, but the audit
            # continues and dependent checks remain pending.
            terrain_class = None
            terrain_cross_slope = None
            terrain_profile_length = None
            if self.terrain_classification_service is not None:
                try:
                    terrain = await self.terrain_classification_service.classify(
                        latitude=center_lat,
                        longitude=center_lng,
                        roads=roads,
                    )
                    terrain_class = terrain.terrain_class
                    terrain_cross_slope = terrain.cross_slope_percent
                    terrain_profile_length = terrain.profile_length_m
                except Exception:
                    terrain_class = None
                    terrain_cross_slope = None
                    terrain_profile_length = None

            audit.terrain_class = terrain_class
            audit.terrain_cross_slope_percent = terrain_cross_slope
            audit.terrain_profile_length_m = terrain_profile_length
            self.db.commit()

            # --------------------------------------------------
            # 6. Segment roads
            # --------------------------------------------------

            segmented_roads = (
                self.segmentation_service.segment_roads(
                    roads
                )
            )[: self.MAX_SEGMENTS_PER_AUDIT]

            # Gradient is calculated from longitudinal elevations and road
            # geometry; it does not depend on terrain classification.
            gradients_by_geometry = {}
            if self.elevation_service is not None:
                try:
                    gradients_by_geometry = (
                        await self.elevation_service.calculate_gradients_for_roads(
                            segmented_roads
                        )
                    )
                except Exception:
                    gradients_by_geometry = {}

            # --------------------------------------------------
            # 7. Convert segments to database models
            # --------------------------------------------------

            segments: list[Segment] = []

            for index, road in enumerate(segmented_roads):
                pedestrian_activity, pedestrian_place_count = (
                    self.land_use_service.classify_segment_activity(
                        places=nearby_places,
                        encoded_geometry=road.geometry,
                        data_complete=places_data_complete,
                        buffer_m=150.0,
                    )
                    if self.land_use_service is not None
                    else (None, None)
                )
                curve_radius, curve_radius_status = (
                    MetricsService.analyze_curve_geometry(road.geometry)
                )
                metrics = self._build_demo_metrics(
                    road_class=road.road_class,
                    index=index,
                    gradient=gradients_by_geometry.get(road.geometry),
                    curve_radius=curve_radius,
                    curve_radius_status=curve_radius_status,
                    operating_speed_kmh=(
                        road.operating_speed_kmh
                    ),
                    traffic_level=road.traffic_level,
                    pedestrian_activity=pedestrian_activity,
                )
                risk = self.risk_scoring_service.calculate_risk(
                    metrics,
                    road.road_class,
                    terrain_class,
                )

                segment = Segment(
                    audit_id=audit.id,
                    segment_code=road.segment_code,
                    road_name=road.road_name,
                    road_class=road.road_class,
                    terrain_class=terrain_class,
                    length_m=road.length_m,
                    geometry=road.geometry,
                    gradient=metrics.gradient,
                    curve_radius=metrics.curve_radius,
                    curve_radius_status=metrics.curve_radius_status,
                    operating_speed=metrics.operating_speed,
                    max_speed=(
                        road.max_speed_kmh
                        if road.max_speed_kmh is not None
                        else None
                    ),
                    traffic_level=metrics.traffic_level,
                    traffic_delay_percent=road.traffic_delay_percent,
                    traffic_source=(
                        "google_routes_congestion_proxy"
                        if road.traffic_delay_percent is not None
                        else None
                    ),
                    pedestrian_activity=metrics.pedestrian_activity,
                    pedestrian_activity_source=(
                        "nearby_places_proxy"
                        if metrics.pedestrian_activity is not None
                        else None
                    ),
                    pedestrian_place_count=pedestrian_place_count,
                    risk_score=risk.risk_score,
                    risk_level=risk.risk_level,
                    risk_flags=", ".join(risk.risk_flags),
                )

                segments.append(segment)

            # --------------------------------------------------
            # 8. Save segments
            # --------------------------------------------------

            self.checklist_repository.delete_by_audit_id(audit.id)
            self.segment_repository.delete_by_audit_id(audit.id)

            if segments:
                saved_segments = self.segment_repository.create_many(
                    segments
                )
                checklist_items = [
                    self.checklist_service.to_model(
                        result,
                        audit_id=audit.id,
                        segment_id=segment.id,
                    )
                    for segment in saved_segments
                    for result in self.checklist_service.generate_for_segment(segment)
                ]
                if checklist_items:
                    self.checklist_repository.create_many(checklist_items)

            # --------------------------------------------------
            # 9. Mark audit as ready
            # --------------------------------------------------

            self.audit_repository.update_status(
                audit,
                "ready",
            )

            return AuditProcessingResult(
                audit_id=audit.id,
                road_count=len(roads),
                segment_count=len(segments),
                status="ready",
                terrain_class=terrain_class,
            )

        except Exception:

            # --------------------------------------------------
            # 10. Mark audit as failed
            # --------------------------------------------------

            self.audit_repository.update_status(
                audit,
                "failed",
            )

            raise

    @staticmethod
    def _build_demo_metrics(
        road_class: str,
        index: int,
        gradient: float | None = None,
        curve_radius: float | None = None,
        curve_radius_status: str = "unavailable",
        operating_speed_kmh: float | None = None,
        traffic_level: str | None = None,
        pedestrian_activity: str | None = None,
    ) -> SegmentMetrics:
        """Build metrics only from values supplied by providers."""
        return SegmentMetrics(
            gradient=gradient,
            curve_radius=curve_radius,
            curve_radius_status=curve_radius_status,
            operating_speed=(
                round(operating_speed_kmh, 2)
                if operating_speed_kmh is not None
                else None
            ),
            traffic_level=traffic_level,
            pedestrian_activity=pedestrian_activity,
        )

    # ==========================================================
    # ROAD DATA
    # ==========================================================

    async def _get_roads(
        self,
        audit: Audit,
        center_lat: float | None = None,
        center_lng: float | None = None,
    ) -> list[dict]:
        """
        Retrieve road information around the audit center.

        When Google APIs are unavailable or blocked,
        use a deterministic demo fallback so the app
        remains usable in local development.
        """

        if center_lat is None:
            center_lat = audit.center_lat

        if center_lng is None:
            center_lng = audit.center_lng

        radius_m = audit.radius_m

        destinations = (
            self._generate_probe_points(
                latitude=center_lat,
                longitude=center_lng,
                radius_m=radius_m,
            )
        )

        if self.google_road_service is None:
            return self._generate_demo_roads(
                latitude=center_lat,
                longitude=center_lng,
                road_class=audit.road_class,
                radius_m=radius_m,
            )

        tasks = [
            self.google_road_service.get_roads(
                origin_latitude=center_lat,
                origin_longitude=center_lng,
                destination_latitude=destination[0],
                destination_longitude=destination[1],
                road_class=audit.road_class,
            )
            for destination in destinations
        ]

        results = await asyncio.gather(
            *tasks,
            return_exceptions=True,
        )

        roads: list[RoadServiceResult] = []

        for result in results:
            if isinstance(result, Exception):
                continue

            for road in result:
                roads.append(
                    RoadServiceResult(
                        road_name=road.road_name,
                        road_class=road.road_class,
                        length_m=road.length_m,
                        geometry=road.geometry,
                        operating_speed_kmh=(
                            road.operating_speed_kmh
                        ),
                        max_speed_kmh=road.max_speed_kmh,
                        traffic_level=road.traffic_level,
                        traffic_delay_percent=road.traffic_delay_percent,
                        pedestrian_activity=road.pedestrian_activity,
                        route_geometry=road.route_geometry,
                    )
                )

        if roads:
            return self._deduplicate_roads(roads)

        return self._generate_demo_roads(
            latitude=center_lat,
            longitude=center_lng,
            road_class=audit.road_class,
            radius_m=radius_m,
        )

    def _generate_demo_roads(
        self,
        latitude: float,
        longitude: float,
        road_class: str,
        radius_m: int,
    ) -> list[RoadServiceResult]:
        """
        Generate deterministic fallback roads when Google APIs
        are unavailable. This preserves the demo workflow and
        keeps audit creation working locally.
        """

        road_names = [
            "Main Avenue",
            "Oak Street",
            "Civic Road",
            "North Connector",
        ]

        roads: list[RoadServiceResult] = []

        for index, road_name in enumerate(road_names):
            segment_length = 250.0 + (index * 60.0)
            geometry = self._generate_demo_geometry(
                latitude,
                longitude,
                index,
                min(max(radius_m * 0.35, segment_length), radius_m),
            )

            roads.append(
                RoadServiceResult(
                    road_name=road_name,
                    road_class=road_class,
                    length_m=min(
                        max(radius_m * 0.35, segment_length),
                        radius_m,
                    ),
                    geometry=geometry,
                    route_geometry=geometry,
                    operating_speed_kmh=None,
                    max_speed_kmh=None,
                )
            )

        return self._deduplicate_roads(roads)

    @staticmethod
    def _generate_demo_geometry(
        latitude: float,
        longitude: float,
        index: int,
        length_m: float,
    ) -> str:
        """Create a valid gently curved polyline for fallback demo roads."""
        radius_m = 700.0 + index * 250.0
        total_angle = min(length_m / radius_m, 0.8)
        orientation = math.radians(index * 45.0)
        earth_radius_m = 6_371_000.0
        origin_lat = math.radians(latitude)
        points = []
        for point_index in range(21):
            angle = -total_angle / 2 + total_angle * point_index / 20
            local_x = radius_m * math.sin(angle)
            local_y = radius_m * (1.0 - math.cos(angle))
            x = local_x * math.cos(orientation) - local_y * math.sin(orientation)
            y = local_x * math.sin(orientation) + local_y * math.cos(orientation)
            point_lat = latitude + math.degrees(y / earth_radius_m)
            point_lng = longitude + math.degrees(
                x / (earth_radius_m * math.cos(origin_lat))
            )
            points.append((point_lat, point_lng))
        return SegmentationService._encode_polyline(points)

    # ==========================================================
    # PROBE GENERATION
    # ==========================================================

    def _generate_probe_points(
        self,
        latitude: float,
        longitude: float,
        radius_m: int,
    ) -> list[tuple[float, float]]:
        """
        Generate destinations around the audit center.

        The points are distributed around a circle so
        route requests cover multiple directions.
        """

        probe_points: list[
            tuple[float, float]
        ] = []

        # Earth radius in metres.
        earth_radius_m = 6_371_000

        latitude_rad = math.radians(
            latitude
        )

        for index in range(
            self.ROUTE_PROBES
        ):

            angle = (
                2
                * math.pi
                * index
                / self.ROUTE_PROBES
            )

            delta_lat = (
                radius_m
                * math.cos(angle)
            ) / earth_radius_m

            delta_lng = (
                radius_m
                * math.sin(angle)
            ) / (
                earth_radius_m
                * math.cos(latitude_rad)
            )

            probe_lat = (
                latitude
                + math.degrees(
                    delta_lat
                )
            )

            probe_lng = (
                longitude
                + math.degrees(
                    delta_lng
                )
            )

            probe_points.append(
                (
                    round(probe_lat, 6),
                    round(probe_lng, 6),
                )
            )

        return probe_points

    # ==========================================================
    # DEDUPLICATION
    # ==========================================================

    @staticmethod
    def _deduplicate_roads(
        roads: list[RoadServiceResult],
    ) -> list[RoadServiceResult]:
        """
        Remove duplicate road sections returned by
        multiple route probes.
        """

        unique_roads: list[RoadServiceResult] = []

        seen: set[tuple] = set()

        for road in roads:

            key = (
                road.road_name,
                road.geometry,
                road.length_m,
                road.route_geometry,
            )

            if key in seen:
                continue

            seen.add(key)

            unique_roads.append(
                road
            )

        return unique_roads
