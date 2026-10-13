"""
Risk assessment of a pothole as a road-safety concern per IRC:SP:88-2019 "Manual on Road Safety Audit".

Section 4.6.2: risk = likelihood (frequency) x consequence (severity); Table 4.2 levels Very High
(multiple deaths likely), High (a death and/or serious injuries likely), Medium (minor injuries only
likely). Table 4.3 priority: Very High -> Essential, High -> Highly Desirable, Medium -> Desirable.

SP:88 treats this as qualitative audit-team judgement; this is a transparent rule-based starting point:
likelihood from the IRC:82-2015 size class, consequence from the speed of traffic using the road. The
surveyor's own speed understates it when walking or driving slowly, so the higher of the GPS speed and
the typical speed for the road class is used.
Mirrors frontend/src/ml/pothole/sp88.js; keep the two in sync.
"""

PRIORITY_FOR_RISK = {"Very High": "Essential", "High": "Highly Desirable", "Medium": "Desirable"}

# Typical operating speeds when no GPS speed is available
ROAD_CLASS_SPEED_KMH = {"arterial": 60, "collector": 40, "local": 30}

# Rows: IRC:82 size class; columns: speed band (low < 30, medium 30-59, high >= 60 km/h)
RISK_MATRIX = {
    "minor": ("Medium", "Medium", "High"),
    "moderate": ("Medium", "High", "High"),
    "severe": ("High", "High", "Very High"),
}


def _speed_band(speed_kmh: float) -> int:
    if speed_kmh >= 60:
        return 2
    if speed_kmh >= 30:
        return 1
    return 0


def assess_risk(severity: str, speed_kmh: float | None, road_class: str | None) -> dict:
    typical = ROAD_CLASS_SPEED_KMH.get(road_class or "", ROAD_CLASS_SPEED_KMH["collector"])
    basis = max(speed_kmh or 0.0, typical)
    risk_level = RISK_MATRIX.get(severity, RISK_MATRIX["minor"])[_speed_band(basis)]
    return {"risk_level": risk_level, "priority": PRIORITY_FOR_RISK[risk_level]}
