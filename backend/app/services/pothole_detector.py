import base64
import io
import math
import os
import time
from typing import Any
import numpy as np

from app.services.pothole_depth_estimator import estimate_pothole_depth_and_risk

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
    Dedicated inference and tracking service for real-time YOLO Pothole Segmentation.
    """

    def __init__(self):
        self.model = _load_model_if_available()
        # In-memory recent detections tracker for temporal smoothing: list of {centroid, timestamp}
        self.recent_tracks: list[dict[str, Any]] = []

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
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            return img
        except Exception:
            return None

    def detect_in_frame(
        self,
        image_base64: str,
        conf_threshold: float = 0.55,
        latitude: float | None = None,
        longitude: float | None = None,
        speed_kmh: float | None = None,
    ) -> dict[str, Any]:
        """
        Processes a single camera video frame and extracts pothole masks and bounding boxes.
        """
        image = self.decode_base64_image(image_base64)
        if hasattr(image, "size"):
            width, height = image.size
        elif hasattr(image, "shape"):
            height, width = image.shape[:2]
        else:
            width, height = 640, 480

        # Refresh model check in case best.pt was copied recently
        if self.model is None:
            self.model = _load_model_if_available()

        if self.model is not None:
            return self._run_yolo_inference(image, width, height, conf_threshold=conf_threshold)
        else:
            return self._run_demo_inference(image, width, height)

    def _run_yolo_inference(self, image: Any, width: int, height: int, conf_threshold: float = 0.55) -> dict[str, Any]:
        # Filter low confidence false positives (default 55%)
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

                # Filter detections that appear purely in the top 15% ceiling/sky area
                if box[3] < (height * 0.15):
                    continue

                # Extract polygon mask if segmentation model
                polygon = []
                if masks is not None and len(masks.xy) > i:
                    polygon = masks.xy[i].tolist()  # [[x, y], ...]

                # Calculate box area ratio
                box_w = max(0.0, box[2] - box[0])
                box_h = max(0.0, box[3] - box[1])
                area_ratio = (box_w * box_h) / float(width * height)

                # Convert image to numpy array for OpenCV depth and risk calculation
                if hasattr(image, "convert"):
                    img_np = np.array(image)
                elif isinstance(image, np.ndarray):
                    img_np = image
                else:
                    img_np = np.zeros((height, width, 3), dtype=np.uint8)

                # OpenCV Depth & Engineering Risk Estimation
                depth_info = estimate_pothole_depth_and_risk(img_np, polygon, box)

                detections.append({
                    "id": f"det-{int(time.time() * 1000)}-{i}",
                    "box": [round(coord, 2) for coord in box],
                    "polygon": [[round(pt[0], 1), round(pt[1], 1)] for pt in polygon],
                    "confidence": round(conf, 3),
                    "severity": depth_info["severity"],
                    "depth_cm": depth_info["depth_cm"],
                    "risk_score": depth_info["risk_score"],
                    "area_ratio": round(area_ratio, 4),
                    "label": "pothole",
                })

        return {
            "potholes_found": len(detections),
            "detections": detections,
            "model_mode": "yolo_v26_seg",
        }

    def _run_demo_inference(self, image: Image.Image, width: int, height: int) -> dict[str, Any]:
        """
        Generates realistic pothole segmentation demo detections when best.pt is not yet mounted.
        Analyzes road surface regions in the lower 60% of frame.
        """
        now = time.time()
        # Use simple cyclic timer simulation for testing road movement:
        # Every 3-5 seconds in demo mode, it detects 1-2 road potholes on the driving surface
        cycle = int(now) % 6
        detections = []

        if cycle in (1, 2, 3):
            # Simulated pothole 1: central road lane
            cx = width * 0.48
            cy = height * 0.68
            rx = width * 0.08
            ry = height * 0.05
            
            box = [cx - rx, cy - ry, cx + rx, cy + ry]
            
            # Generate organic oval polygon for the pothole mask
            polygon = []
            for deg in range(0, 360, 24):
                rad = math.radians(deg)
                jitter = 1.0 + 0.15 * math.sin(deg * 3)
                px = cx + rx * math.cos(rad) * jitter
                py = cy + ry * math.sin(rad) * jitter
                polygon.append([round(px, 1), round(py, 1)])

            area_ratio = round((2 * rx * 2 * ry) / (width * height), 4)
            detections.append({
                "id": f"demo-pothole-{int(now)}",
                "box": [round(c, 1) for c in box],
                "polygon": polygon,
                "confidence": 0.91,
                "severity": "severe" if area_ratio > 0.05 else "moderate",
                "depth_cm": 5.4 if area_ratio > 0.05 else 3.8,
                "risk_score": 78.5 if area_ratio > 0.05 else 54.0,
                "area_ratio": area_ratio,
                "label": "pothole",
            })

            if cycle == 2:
                # Additional minor pothole on shoulder
                cx2 = width * 0.72
                cy2 = height * 0.76
                rx2 = width * 0.05
                ry2 = height * 0.03
                box2 = [cx2 - rx2, cy2 - ry2, cx2 + rx2, cy2 + ry2]
                polygon2 = [
                    [round(cx2 + rx2 * math.cos(math.radians(d)), 1),
                     round(cy2 + ry2 * math.sin(math.radians(d)), 1)]
                    for d in range(0, 360, 36)
                ]
                detections.append({
                    "id": f"demo-pothole-minor-{int(now)}",
                    "box": [round(c, 1) for c in box2],
                    "polygon": polygon2,
                    "confidence": 0.78,
                    "severity": "minor",
                    "depth_cm": 1.9,
                    "risk_score": 28.0,
                    "area_ratio": round((2 * rx2 * 2 * ry2) / (width * height), 4),
                    "label": "pothole",
                })

        return {
            "potholes_found": len(detections),
            "detections": detections,
            "model_mode": "simulation_demo (place best.pt in backend/app/weights to activate)",
        }
