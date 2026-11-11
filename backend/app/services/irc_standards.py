"""Screening lookups transcribed from IRC:86-2018 urban road tables."""


URBAN_DESIGN_SPEED_KMH = {
    "arterial": {
        "plain": 60.0,
        "rolling": 50.0,
        "mountainous": 40.0,
        "steep": 40.0,
    },
    "collector": {
        "plain": 40.0,
        "rolling": 40.0,
        "mountainous": 30.0,
        "steep": 30.0,
    },
    "local": {
        "plain": 30.0,
        "rolling": 30.0,
        "mountainous": 20.0,
        "steep": 20.0,
    },
}

# IRC:86-2018 Table 8.2, minimum horizontal curve radius with e limited to 7%.
MINIMUM_CURVE_RADIUS_M = {
    20: 15.0,
    30: 30.0,
    40: 60.0,
    50: 90.0,
    60: 130.0,
}

# IRC:86-2018 clause 9.2: general maximum gradient for urban roads.
URBAN_MAX_GRADIENT_PERCENT = 4.0


def urban_design_speed(road_class: str, terrain_class: str | None) -> float | None:
    if terrain_class is None:
        return None
    return URBAN_DESIGN_SPEED_KMH.get(road_class, {}).get(terrain_class)


def urban_minimum_curve_radius(
    road_class: str,
    terrain_class: str | None,
) -> float | None:
    speed = urban_design_speed(road_class, terrain_class)
    return MINIMUM_CURVE_RADIUS_M.get(int(speed)) if speed is not None else None
