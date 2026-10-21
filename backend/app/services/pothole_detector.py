import os

# Optimize PyTorch and Ultralytics for cloud container memory and CPU limits
os.environ["YOLO_CONFIG_DIR"] = "/tmp"
os.environ["YOLO_VERBOSE"] = "False"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

try:
    import torch
    torch.set_num_threads(1)
except Exception:
    torch = None

import base64
import binascii
import io
import math
import threading
import time
from contextlib import nullcontext
from typing import Any

import numpy as np

try:
    from PIL import Image
except ImportError:
    Image = None

from app.services.irc82 import classify_pothole
from app.services.pothole_depth_estimator import estimate_pothole_depth

WEIGHTS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "weights")
MODEL_PATH = os.path.join(WEIGHTS_DIR, "best.pt")

MODEL_MODE_YOLO = "yolo_v26_seg"
MODEL_MODE_SIMULATION = "simulation_demo"

_yolo_model = None
_model_loaded = False
_ultralytics_missing = False

# Ultralytics predictors are not thread-safe; FastAPI runs sync routes in a threadpool.
_inference_lock = threading.Lock()


def _load_model_if_available():
    global _yolo_model, _model_loaded, _ultralytics_missing
    if _model_loaded:
        return _yolo_model

    if os.path.exists(MODEL_PATH) and not _ultralytics_missing:
        try:
            from ultralytics import YOLO
        except ImportError:
            # Optional dependency (requirements-ml.txt); the scanner normally runs the model in the browser
            _ultralytics_missing = True
            print("[PotholeDetector] ultralytics not installed; server detection runs in simulation mode")
            return None
        try:
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

    def decode_base64_image(self, image_base64: str) -> np.ndarray:
        """Decodes a Base64 / data-URI frame into an RGB numpy array. Raises ValueError on bad input."""
        if "," in image_base64:
            image_base64 = image_base64.split(",", 1)[1]
        try:
            image_bytes = base64.b64decode(image_base64, validate=False)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("Frame is not valid Base64.") from exc

        if Image is not None:
            try:
                return np.asarray(Image.open(io.BytesIO(image_bytes)).convert("RGB"))
            except Exception as exc:
                raise ValueError("Frame could not be decoded as an image.") from exc

        import cv2
        bgr = cv2.imdecode(np.frombuffer(image_bytes, np.uint8), cv2.IMREAD_COLOR)
        if bgr is None:
            raise ValueError("Frame could not be decoded as an image.")
        return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)

    def detect_in_frame(
        self,
        image_base64: str,
        conf_threshold: float = 0.5,
        latitude: float | None = None,
        longitude: float | None = None,
        speed_kmh: float | None = None,
    ) -> dict[str, Any]:
        """
        Processes a camera frame and returns detected potholes in real time.
        """
        image = self.decode_base64_image(image_base64)
        height, width = image.shape[:2]

        # Refresh model check if best.pt was placed recently
        if self.model is None:
            self.model = _load_model_if_available()

        if self.model is not None:
            return self._run_yolo_inference(image, width, height, conf_threshold=conf_threshold)
        return self._run_demo_inference(width, height)

    def _run_yolo_inference(self, image: np.ndarray, width: int, height: int, conf_threshold: float = 0.5) -> dict[str, Any]:
        # Fast, low-memory YOLO inference optimized for cloud containers & CPU
        grad_ctx = torch.inference_mode() if torch is not None else nullcontext()
        with _inference_lock, grad_ctx:
            # Ultralytics treats numpy input as BGR, so flip channels from RGB
            results = self.model(
                np.ascontiguousarray(image[:, :, ::-1]),
                conf=conf_threshold,
                imgsz=640,
                device="cpu",
                retina_masks=False,
                verbose=False,
            )

        detections = []
        filtered_non_road = 0

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

                # Filter out pure ceiling/sky boxes in the top 10%
                if y2 < (height * 0.10):
                    filtered_non_road += 1
                    continue

                # Filter extreme vertical objects (standing human aspect ratio: height > 2.2x width)
                if (box_h / box_w) > 2.2:
                    filtered_non_road += 1
                    continue

                # Extract segmentation polygon mask if available
                polygon = []
                if masks is not None and len(masks.xy) > i:
                    polygon = masks.xy[i].tolist()

                metrics = estimate_pothole_depth(image, polygon, box)
                if not metrics.get("is_valid_cavity", True):
                    filtered_non_road += 1
                    continue
                # Server frames carry no camera geometry, so width is unknown: classify by depth only.
                # The scanner reclassifies with measured width, and /save recomputes on the server.
                depth_cm = metrics["depth_cm"]
                irc = classify_pothole(depth_cm * 10 if depth_cm is not None else None, None)

                detections.append({
                    "id": f"det-{int(time.time() * 1000)}-{i}",
                    "box": [round(coord, 2) for coord in box],
                    "polygon": [[round(pt[0], 1), round(pt[1], 1)] for pt in polygon],
                    "confidence": round(conf, 3),
                    "severity": irc["severity"],
                    "depth_cm": depth_cm,
                    "risk_score": irc["size_index"],
                    "area_ratio": round((box_w * box_h) / float(width * height), 4),
                    "label": "pothole",
                })

        return {
            "potholes_found": len(detections),
            "detections": detections,
            "model_mode": MODEL_MODE_YOLO,
            "human_detected": filtered_non_road > 0,
            "warning_message": (
                f"{filtered_non_road} non-road object(s) filtered" if filtered_non_road else None
            ),
        }

    def _run_demo_inference(self, width: int, height: int) -> dict[str, Any]:
        """
        Simulation mode when model weights are not mounted. Results are synthetic and must never be saved.
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
            irc = classify_pothole(38.0, None)
            detections.append({
                "id": f"demo-pothole-{int(now)}",
                "box": [round(c, 1) for c in box],
                "polygon": polygon,
                "confidence": 0.88,
                "severity": irc["severity"],
                "depth_cm": 3.8,
                "risk_score": irc["size_index"],
                "area_ratio": area_ratio,
                "label": "pothole",
            })

        return {
            "potholes_found": len(detections),
            "detections": detections,
            "model_mode": MODEL_MODE_SIMULATION,
            "warning_message": "Simulation mode: model weights not loaded. Detections are synthetic.",
        }
