from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Severity = Literal["minor", "moderate", "severe"]
LocationSource = Literal["gps", "audit_center", "none"]

# ~3 MB of Base64 text; a 640px JPEG frame from the scanner is ~50-150 KB
MAX_FRAME_BASE64_CHARS = 3_000_000
# Cropped evidence snapshot; keeps DB rows and report payloads small
MAX_SNAPSHOT_BASE64_CHARS = 400_000


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class DetectionItem(BaseModel):
    id: str | None = None
    box: list[float] = Field(..., description="[x1, y1, x2, y2] pixel bounds")
    polygon: list[list[float]] = Field(default_factory=list, description="List of [x, y] polygon vertices for segmentation mask")
    confidence: float
    severity: Severity
    depth_cm: float | None = None
    risk_score: float
    area_ratio: float = 0.0
    label: str = "pothole"


class PotholeDetectRequest(BaseModel):
    image_base64: str = Field(..., max_length=MAX_FRAME_BASE64_CHARS, description="Base64 encoded JPEG/PNG frame from camera")
    conf_threshold: float = Field(0.4, ge=0.1, le=0.95, description="Confidence threshold filter")
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    speed_kmh: float | None = None
    audit_id: int | None = None


class PotholeDetectResponse(BaseModel):
    potholes_found: int
    detections: list[DetectionItem]
    model_mode: str = Field(..., description="'yolo_v26_seg' if weights loaded, else 'simulation_demo'")
    human_detected: bool = Field(default=False, description="True if a person or other non-road object was filtered out")
    warning_message: str | None = Field(default=None, description="Informational message or non-road alert")
    processed_at: datetime = Field(default_factory=_utcnow)


class PotholeSaveItem(BaseModel):
    client_id: str | None = Field(None, max_length=64, description="Scanner-generated ID used to make saves idempotent")
    latitude: float | None = Field(None, ge=-90, le=90)
    longitude: float | None = Field(None, ge=-180, le=180)
    location_source: LocationSource = "gps"
    gps_accuracy_m: float | None = Field(None, ge=0)
    confidence: float = Field(..., ge=0, le=1)
    # Severity and risk_score are recomputed on the server from depth and width (IRC:82-2015)
    severity: Severity | None = None
    depth_cm: float | None = Field(None, ge=0, le=100)
    depth_source: Literal["estimated", "measured"] = "estimated"
    width_mm: float | None = Field(None, ge=0, le=20000)
    area_m2: float | None = Field(None, ge=0, le=100)
    risk_score: float | None = Field(None, ge=0, le=100)
    area_ratio: float = Field(0.0, ge=0, le=1)
    geometry_json: str | None = None
    snapshot_image: str | None = Field(None, max_length=MAX_SNAPSHOT_BASE64_CHARS)
    speed_kmh: float | None = Field(None, ge=0)
    detected_at: datetime = Field(default_factory=_utcnow)


class PotholeBatchSaveRequest(BaseModel):
    audit_id: int
    detections: list[PotholeSaveItem] = Field(..., max_length=500)


class PotholeRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    audit_id: int
    client_id: str | None = None
    latitude: float | None
    longitude: float | None
    snapped_latitude: float | None = None
    snapped_longitude: float | None = None
    location_source: str = "gps"
    gps_accuracy_m: float | None = None
    confidence: float
    severity: str
    depth_cm: float | None = None
    depth_source: str = "estimated"
    width_mm: float | None = None
    area_m2: float | None = None
    risk_level: str | None = None
    action_priority: str | None = None
    risk_score: float = 0.0
    area_ratio: float
    geometry_json: str | None
    snapshot_image: str | None
    speed_kmh: float | None
    detected_at: datetime

    @field_validator("detected_at")
    @classmethod
    def _assume_utc(cls, value: datetime) -> datetime:
        # Timestamps are stored in UTC; columns without time zone return naive values, which
        # browsers would otherwise read as local time
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


class AuditPotholesSummary(BaseModel):
    audit_id: int
    total_potholes: int
    severe_count: int
    moderate_count: int
    minor_count: int
    detections: list[PotholeRecordResponse]


class PotholeSaveResponse(BaseModel):
    saved: list[PotholeRecordResponse]
    skipped_duplicates: int
    compliance_score: float | None
