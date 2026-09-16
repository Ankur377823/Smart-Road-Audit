import asyncio
import math
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.audit import Audit
from app.models.segment import Segment
from app.repositories.audit_repository import AuditRepository
from app.repositories.segment_repository import SegmentRepository
from app.services.google_road_service import (
    GoogleRoadService,
    RoadServiceResult,
)
from app.services.metrics import SegmentMetrics
from app.services.risk_scoring import RiskScoringService
from app.services.road_segmentation_service import (
    RoadSegmentationService,
)
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

    def __init__(self, db: Session):
        self.db = db

        self.audit_repository = AuditRepository(db)
        self.segment_repository = SegmentRepository(db)

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
            # 5. Get road data around audit area
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

            # --------------------------------------------------
            # 6. Segment roads
            # --------------------------------------------------

            segmented_roads = (
                self.segmentation_service.segment_roads(
                    roads
                )
            )

            # --------------------------------------------------
            # 7. Convert segments to database models
            # --------------------------------------------------

            segments: list[Segment] = []

            for index, road in enumerate(segmented_roads):
                metrics = self._build_demo_metrics(
                    road_class=road.road_class,
                    index=index,
                )
                risk = self.risk_scoring_service.calculate_risk(
                    metrics
                )

                segment = Segment(
                    audit_id=audit.id,
                    segment_code=road.segment_code,
                    road_name=road.road_name,
                    road_class=road.road_class,
                    length_m=road.length_m,
                    geometry=road.geometry,
                    gradient=metrics.gradient,
                    curve_radius=metrics.curve_radius,
                    operating_speed=metrics.operating_speed,
                    traffic_level=metrics.traffic_level,
                    pedestrian_activity=metrics.pedestrian_activity,
                    risk_score=risk.risk_score,
                    risk_level=risk.risk_level,
                    risk_flags=", ".join(risk.risk_flags),
                )

                segments.append(segment)

            # --------------------------------------------------
            # 8. Save segments
            # --------------------------------------------------

            self.segment_repository.delete_by_audit_id(
                audit.id
            )

            if segments:
                self.segment_repository.create_many(
                    segments
                )

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
    ) -> SegmentMetrics:
        """Provide clearly labeled deterministic metrics for demo audits."""
        traffic_by_class = {
            "local": "low",
            "collector": "medium",
            "arterial": "high",
        }
        pedestrian_by_class = {
            "local": "medium",
            "collector": "medium",
            "arterial": "high",
        }
        speed_by_class = {
            "local": 30.0,
            "collector": 45.0,
            "arterial": 65.0,
        }

        return SegmentMetrics(
            gradient=round(1.5 + (index % 3) * 1.25, 2),
            curve_radius=350.0 - (index % 3) * 60.0,
            operating_speed=speed_by_class.get(
                road_class,
                40.0,
            ),
            traffic_level=traffic_by_class.get(
                road_class,
                "medium",
            ),
            pedestrian_activity=pedestrian_by_class.get(
                road_class,
                "medium",
            ),
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
            geometry = (
                f"demo_polyline_{latitude}_{longitude}_{index}"
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
                )
            )

        return self._deduplicate_roads(roads)

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
            )

            if key in seen:
                continue

            seen.add(key)

            unique_roads.append(
                road
            )

        return unique_roads