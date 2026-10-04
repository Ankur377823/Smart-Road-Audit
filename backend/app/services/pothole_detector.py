import base64
import io
import math
import os
import time
from typing import Any

try:
    from PIL import Image
except ImportError:
    Image = None

WEIGHTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "weights")
MODEL_PATH = os.path.join(WEIGHTS_DIR, "best.pt")

_yolo_model = None
_model_loaded = False


def _load_model_if_available():
    global _yolo_model, _model_loaded
    if _model_loaded:
        return _yolo_model

    if os.path.exists(MODEL_PATH):
        try:
            from ultralytics import YOLO
            _yolo_model = YOLO(MODEL_PATH)
            _model_loaded = True
            print(f"[PotholeDetector] Successfully loaded custom YOLO model from: {MODEL_PATH}")
            return _yolo_model
        except Exception as e:
            print(f"[PotholeDetector] Could not load model from {MODEL_PATH}: {e}")
            _model_loaded = False
            return None
    return None


class PotholeDetector:
    """
    Real-time YOLO Pothole Detection Service.
    Fast, direct inference that detects potholes in live video/camera frames.
    """

    def __init__(self):
        self.model = _load_model_if_available()

    def decode_base64_image(self, image_base64: str):
        if "," in image_base64:
            image_base64 = image_base64.split(",", 1)[1]
        image_bytes = base64.b64decode(image_base64)
        if Image is not None:
            return Image.open(io.BytesIO(image_bytes)).convert("RGB")
        try:
            import cv2
            import numpy as np
            nparr = np.frombuffer(image_bytes, np.uint8)
            return cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        except Exception:
            return None

    def detect_in_frame(
        self,
        image_base64: str,
        conf_threshold: float = 0.35,
        latitude: float | None = None,
        longitude: float | None = None,
        speed_kmh: float | None = None,
    ) -> dict[str, Any]:
        """
        Processes a camera frame and returns detected potholes in real time.
        """
        image = self.decode_base64_image(image_base64)
        if hasattr(image, "size"):
            width, height = image.size
        elif hasattr(image, "shape"):
            height, width = image.shape[:2]
        else:
            width, height = 640, 480

        # Refresh model check if best.pt was placed recently
        if self.model is None:
            self.model = _load_model_if_available()

        if self.model is not None:
            return self._run_yolo_inference(image, width, height, conf_threshold=conf_threshold)
        else:
            return self._run_demo_inference(image, width, height)

    def _run_yolo_inference(self, image: Any, width: int, height: int, conf_threshold: float = 0.35) -> dict[str, Any]:
        # Run YOLO inference
        results = self.model(image, conf=conf_threshold, verbose=False)
        detections = []

        for r in results:
            boxes = r.boxes
            masks = r.masks

            if boxes is None or len(boxes) == 0:
                continue

            for i in range(len(boxes)):
                box = boxes.xyxy[i].cpu().tolist()
                conf = float(boxes.conf[i].cpu().item())

                if conf < conf_threshold:
                    continue

                x1, y1, x2, y2 = box
                box_w = max(1.0, x2 - x1)
                box_h = max(1.0, y2 - y1)
                area_ratio = (box_w * box_h) / float(width * height)

                # Filter out pure ceiling/sky boxes in the top 10%
                if box[3] < (height * 0.10):
                    continue

                # Filter extreme vertical objects (standing human aspect ratio: height > 2.2x width)
                if box_w > 0 and (box_h / box_w) > 2.2:
                    continue

                # Extract segmentation polygon mask if available
                polygon = []
                if masks is not None and len(masks.xy) > i:
                    polygon = masks.xy[i].tolist()

                # Determine severity level
                if conf >= 0.70 or area_ratio >= 0.04:
                    severity = "severe"
                elif conf >= 0.50 or area_ratio >= 0.02:
                    severity = "moderate"
                else:
                    severity = "minor"

                detections.append({
                    "id": f"det-{int(time.time() * 1000)}-{i}",
                    "box": [round(coord, 2) for coord in box],
                    "polygon": [[round(pt[0], 1), round(pt[1], 1)] for pt in polygon],
                    "confidence": round(conf, 3),
                    "severity": severity,
                    "depth_cm": round(area_ratio * 100.0, 1),
                    "risk_score": round(conf * 100.0, 1),
                    "area_ratio": round(area_ratio, 4),
                    "label": "pothole",
                })

        return {
            "potholes_found": len(detections),
            "detections": detections,
            "model_mode": "yolo_v26_seg",
        }

    def _run_demo_inference(self, image: Any, width: int, height: int) -> dict[str, Any]:
        """
        Clean simulation mode when model weights are not mounted.
        """
        now = time.time()
        cycle = int(now) % 6
        detections = []

        if cycle in (1, 2, 3):
            cx = width * 0.50
            cy = height * 0.70
            rx = width * 0.09
            ry = height * 0.05
            box = [cx - rx, cy - ry, cx + rx, cy + ry]

            polygon = []
            for deg in range(0, 360, 24):
                rad = math.radians(deg)
                px = cx + rx * math.cos(rad)
                py = cy + ry * math.sin(rad)
                polygon.append([round(px, 1), round(py, 1)])

            area_ratio = round((2 * rx * 2 * ry) / (width * height), 4)
            detections.append({
                "id": f"demo-pothole-{int(now)}",
                "box": [round(c, 1) for c in box],
                "polygon": polygon,
                "confidence": 0.88,
                "severity": "moderate",
                "depth_cm": 3.8,
                "risk_score": 75.0,
                "area_ratio": area_ratio,
                "label": "pothole",
            })

        return {
            "potholes_found": len(detections),
            "detections": detections,
            "model_mode": "simulation_demo",
        }
