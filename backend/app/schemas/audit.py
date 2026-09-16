from typing import Literal

from pydantic import BaseModel, Field


class AuditCreateRequest(BaseModel):
    center_lat: float = Field(..., ge=-90, le=90)
    center_lng: float = Field(..., ge=-180, le=180)
    radius_m: float = Field(1000, ge=100, le=10000)
    road_class: Literal["local", "collector", "arterial"] = "collector"


class AuditSummary(BaseModel):
    id: str
    status: str
    compliance_score: float
    segment_count: int
    checklist_count: int


class AuditResponse(BaseModel):
    id: str
    center_lat: float
    center_lng: float
    radius_m: float
    road_class: str
    status: str
    compliance_score: float
    created_at: str
    segments: list[dict]
    checklist: list[dict]
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AuditCreate(BaseModel):
    """
    Data required to create a new road safety audit.
    """

    location_name: str | None = Field(
        default=None,
        max_length=255,
    )

    location_address: str | None = Field(
        default=None,
        max_length=500,
    )

    center_lat: float = Field(
        ...,
        ge=-90,
        le=90,
    )

    center_lng: float = Field(
        ...,
        ge=-180,
        le=180,
    )

    radius_m: int = Field(
        ...,
        ge=100,
        le=10000,
    )

    road_class: str = Field(
        ...,
        pattern="^(local|collector|arterial)$",
    )


class AuditResponse(BaseModel):
    """
    Data returned when an audit is requested.
    """

    id: int

    location_name: str | None
    location_address: str | None

    center_lat: float
    center_lng: float

    radius_m: int
    road_class: str

    status: str
    compliance_score: float | None

    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )


class AuditSummary(BaseModel):
    """
    Lightweight audit information for audit history/dashboard.
    """

    id: int

    location_name: str | None
    road_class: str
    radius_m: int

    status: str
    compliance_score: float | None

    created_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )