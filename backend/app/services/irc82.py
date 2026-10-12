"""
Pothole classification per IRC:82-2015 "Code of Practice for Maintenance of Bituminous Road Surfaces".

Clause 7.5.3.4 (Severity): small = 25 mm deep, 200 mm wide; medium = 25 to 50 mm deep, 500 mm wide;
large = greater than 50 mm deep and 500 mm width.

Mirrors frontend/src/ml/pothole/irc82.js; keep the two in sync.
"""

SEVERITIES = ("minor", "moderate", "severe")
IRC_CLASS_LABEL = {"minor": "Small", "moderate": "Medium", "severe": "Large"}

# Upper bounds of the small and medium classes; a value on a boundary stays in the lower class
DEPTH_BOUNDS_MM = (25.0, 50.0)
WIDTH_BOUNDS_MM = (200.0, 500.0)
# Beyond the medium/large boundary the size index saturates at twice the boundary value
DEPTH_CAP_MM = 100.0
WIDTH_CAP_MM = 1000.0


def _class_position(value: float | None, bounds: tuple[float, float], cap: float) -> float | None:
    """Position on a 0-3 scale: 0-1 small, 1-2 medium, 2-3 large (linear within each class)."""
    if value is None or value <= 0:
        return None
    small, medium = bounds
    if value <= small:
        return value / small
    if value <= medium:
        return 1 + (value - small) / (medium - small)
    return 2 + min(1.0, (value - medium) / (cap - medium))


def classify_pothole(depth_mm: float | None, width_mm: float | None) -> dict:
    """
    Classifies a pothole by depth and width. When they fall in different classes the higher one is
    used (conservative). size_index (0-100) is the position within the classes (small 0-33, medium
    33-67, large 67-100), used for sorting only; IRC:82 defines no numeric score. Road-safety risk is
    assessed separately per IRC:SP:88-2019 (sp88.py).
    """
    depth_pos = _class_position(depth_mm, DEPTH_BOUNDS_MM, DEPTH_CAP_MM)
    width_pos = _class_position(width_mm, WIDTH_BOUNDS_MM, WIDTH_CAP_MM)
    position = max(depth_pos or 0.0, width_pos or 0.0)
    class_index = 0 if position <= 1 else 1 if position <= 2 else 2
    severity = SEVERITIES[class_index]
    return {
        "severity": severity,
        "irc_class": IRC_CLASS_LABEL[severity],
        "size_index": round(position / 3 * 100, 1),
    }
