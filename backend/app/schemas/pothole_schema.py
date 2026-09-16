from datetime import datetime
from pydantic import BaseModel, Field


class DetectionItem(BaseModel):
    id: str | None = None
    box: list[float] = Field(..., description="[x1, y1, x2, y2] normalized or pixel bounds")
    polygon: list[list[float]] = Field(default_factory=list, description="List of [x, y] polygon vertices for segmentation mask")
    confidence: float
    severity: str = "moderate"
    depth_cm: float = 3.5
    risk_score: float = 50.0
    area_ratio: float = 0.0
    label: str = "pothole"


class PotholeDetectRequest(BaseModel):
    image_base64: str = Field(..., description="Base64 encoded JPEG/PNG frame from camera")
    conf_threshold: float = Field(0.50, description="Confidence threshold filter (0.25 to 0.90)")
    latitude: float | None = None
    longitude: float | None = None
    speed_kmh: float | None = None
    audit_id: int | None = None


class PotholeDetectResponse(BaseModel):
    potholes_found: int
    detections: list[DetectionItem]
    model_mode: str = Field(..., description="'yolo_v26_seg' if weights loaded, else 'simulation_demo'")
    processed_at: datetime = Field(default_factory=datetime.utcnow)


class PotholeSaveItem(BaseModel):
    latitude: float
    longitude: float
    confidence: float
    severity: str
    depth_cm: float = 3.5
    risk_score: float = 50.0
    area_ratio: float = 0.0
    geometry_json: str | None = None
    snapshot_image: str | None = None
    speed_kmh: float | None = None
    detected_at: datetime = Field(default_factory=datetime.utcnow)


class PotholeBatchSaveRequest(BaseModel):
    audit_id: int
    detections: list[PotholeSaveItem]


class PotholeRecordResponse(BaseModel):
    id: int
    audit_id: int
    latitude: float
    longitude: float
    confidence: float
    severity: str
    depth_cm: float = 0.0
    risk_score: float = 0.0
    area_ratio: float
    geometry_json: str | None
    snapshot_image: str | None
    speed_kmh: float | None
    detected_at: datetime

    class Config:
        from_attributes = True


class AuditPotholesSummary(BaseModel):
    audit_id: int
    total_potholes: int
    severe_count: int
    moderate_count: int
    minor_count: int
    detections: list[PotholeRecordResponse]
