import math

import numpy as np

try:
    import cv2
except ImportError:
    cv2 = None


def estimate_pothole_depth(
    image_np: np.ndarray,
    polygon_points: list[list[float]],
    box: list[float],
) -> dict:
    """
    Visual depth estimate for a pothole from a single RGB frame (OpenCV).

    1. Cavity vs surrounding asphalt: compares mean intensity of the eroded cavity core with a
       dilated ring of road around it. Deeper holes block more daylight, so the core is darker.
    2. Texture roughness: Laplacian variance inside the cavity (fractured floor vs smooth surface).

    The image area of the pothole is deliberately not used: it depends on distance from the
    camera, not on depth. A single image cannot measure depth exactly, so this is an estimate;
    severity is assigned from IRC:82-2015 classes in irc82.py. Mirrors
    frontend/src/ml/pothole/depthEstimator.js.
    """
    h, w = image_np.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in box]
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    box_w = max(1, x2 - x1)
    box_h = max(1, y2 - y1)

    # Without a segmentation outline (or OpenCV) there is nothing to analyse: depth is unknown
    if cv2 is None or len(polygon_points) < 3:
        return {"depth_cm": None, "is_valid_cavity": True}

    try:
        gray = cv2.cvtColor(image_np, cv2.COLOR_RGB2GRAY) if image_np.ndim == 3 else image_np

        mask = np.zeros((h, w), dtype=np.uint8)
        pts = np.array(polygon_points, dtype=np.int32).reshape((-1, 1, 2))
        cv2.fillPoly(mask, [pts], 255)

        # Inner core (eroded) vs outer surrounding ring (dilated minus mask)
        kernel_size = max(3, int(min(box_w, box_h) * 0.15))
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
        inner_mask = cv2.erode(mask, kernel, iterations=1)
        if cv2.countNonZero(inner_mask) == 0:
            inner_mask = mask
        outer_ring_mask = cv2.subtract(cv2.dilate(mask, kernel, iterations=2), mask)

        inner_mean = cv2.mean(gray, mask=inner_mask)[0]
        outer_mean = cv2.mean(gray, mask=outer_ring_mask)[0]
        intensity_depression = max(0.0, (outer_mean - inner_mean) / outer_mean) if outer_mean > 5.0 else 0.2

        roi_gray = gray[y1:y2, x1:x2]
        roi_mask = mask[y1:y2, x1:x2]
        laplacian = cv2.Laplacian(roi_gray, cv2.CV_64F)
        laplacian_var = float(np.var(laplacian[roi_mask > 0])) if np.any(roi_mask > 0) else 100.0
        normalized_roughness = min(1.0, math.log1p(laplacian_var) / 8.0)

        depth_cm = round(min(15.0, max(1.0, intensity_depression * 8.0 + normalized_roughness * 3.5)), 1)

        # A pothole must be a depression: a noticeably brighter interior is not a cavity
        is_valid_cavity = not (outer_mean > 15.0 and inner_mean > outer_mean * 1.15)

        return {
            "depth_cm": depth_cm,
            "roughness_index": round(normalized_roughness, 2),
            "intensity_depression": round(intensity_depression, 3),
            "is_valid_cavity": is_valid_cavity,
        }
    except Exception as e:
        print(f"[DepthEstimator] analysis failed: {e}")
        return {"depth_cm": None, "is_valid_cavity": True}
