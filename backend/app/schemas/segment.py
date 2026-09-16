from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SegmentResponse(BaseModel):
    """
    Data returned for a road segment.
    """

    id: int
    audit_id: int

    segment_code: str
    road_name: str | None
    road_class: str

    length_m: float
    geometry: str | None

    # Derived safety metrics
    gradient: float | None
    curve_radius: float | None
    operating_speed: float | None
    traffic_level: str | None
    pedestrian_activity: str | None

    # Risk information
    risk_score: float | None
    risk_level: str | None
    risk_flags: str | None

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

    length_m: float

    risk_score: float | None
    risk_level: str | None

    model_config = ConfigDict(
        from_attributes=True,
    )