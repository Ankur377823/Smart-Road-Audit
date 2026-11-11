from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class AuditCreate(BaseModel):
    """
    Data required to create a new road safety audit.
    """

    location_name: str | None = Field(
        default=None,
        max_length=255,
        description="Name of the selected location",
    )

    location_address: str | None = Field(
        default=None,
        max_length=500,
        description="Readable address of the selected location",
    )

    center_lat: float = Field(
        ...,
        ge=-90,
        le=90,
        description="Latitude of the audit center",
    )

    center_lng: float = Field(
        ...,
        ge=-180,
        le=180,
        description="Longitude of the audit center",
    )

    radius_m: int = Field(
        default=1000,
        ge=1000,
        le=5000,
        description="Audit radius in metres",
    )

    road_class: Literal[
        "local",
        "collector",
        "arterial",
    ] = Field(
        default="collector",
        description="Functional road class used to select design standards",
    )


class AuditResponse(BaseModel):
    """
    Complete audit information returned by the API.
    """

    id: int

    location_name: str | None
    location_address: str | None

    center_lat: float
    center_lng: float

    radius_m: int
    road_class: str
    terrain_class: str | None
    terrain_cross_slope_percent: float | None
    terrain_profile_length_m: float | None

    status: str
    compliance_score: float | None

    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )


class AuditSummary(BaseModel):
    """
    Lightweight audit information used by the
    audit history and dashboard.
    """

    id: int

    location_name: str | None

    road_class: str

    terrain_class: str | None
    terrain_cross_slope_percent: float | None
    terrain_profile_length_m: float | None

    radius_m: int

    status: str

    compliance_score: float | None

    created_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
    )
