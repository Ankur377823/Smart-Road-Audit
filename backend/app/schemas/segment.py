from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SegmentSubsectionResponse(BaseModel):
    """A location-specific slice returned when viewing a segment."""

    subsection_number: int
    length_m: float
    geometry: str | None
    risk_score: float | None
    risk_level: str | None


class SegmentResponse(BaseModel):
    """
    Data returned for a road segment.
    """

    id: int
    audit_id: int

    segment_code: str
    road_name: str | None
    road_class: str
    terrain_class: str | None

    length_m: float
    geometry: str | None

    # Derived safety metrics
    gradient: float | None
    curve_radius: float | None
    curve_radius_status: str
    operating_speed: float | None
    max_speed: float | None
    traffic_level: str | None
    traffic_delay_percent: float | None
    traffic_source: str | None
    pedestrian_activity: str | None
    pedestrian_activity_source: str | None
    pedestrian_place_count: int | None

    # Risk information
    risk_score: float | None
    risk_level: str | None
    risk_flags: str | None

    subsection_count: int = 1
    subsegments: list[SegmentSubsectionResponse] = Field(default_factory=list)

    created_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )


class SegmentSummary(BaseModel):
    """
    Lightweight segment information for audit summaries.
    """

    id: int
    audit_id: int

    segment_code: str
    road_name: str | None
    road_class: str
    terrain_class: str | None

    length_m: float

    risk_score: float | None
    risk_level: str | None

    model_config = ConfigDict(
        from_attributes=True,
    )
