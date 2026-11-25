// ----------------------------------------------------------------------------
// Road-safety screening logic (team feature, kept as written in team/main so
// the numbers match the backend's risk_scoring.py). Shared by the audit page
// and the audit PDF report.
// ----------------------------------------------------------------------------

export function getRiskContributions(segment) {
  const gradient = segment.gradient == null ? NaN : Number(segment.gradient);
  const curveRadius = segment.curve_radius == null ? NaN : Number(segment.curve_radius);
  const operatingSpeed = segment.operating_speed == null ? NaN : Number(segment.operating_speed);
  const traffic = segment.traffic_level?.toLowerCase();
  const pedestrian = segment.pedestrian_activity?.toLowerCase();
  const designSpeeds = {
    arterial: { plain: 60, rolling: 50, mountainous: 40, steep: 40 },
    collector: { plain: 40, rolling: 40, mountainous: 30, steep: 30 },
    local: { plain: 30, rolling: 30, mountainous: 20, steep: 20 },
  };
  const minimumRadii = { 20: 15, 30: 30, 40: 60, 50: 90, 60: 130 };
  const designSpeed = designSpeeds[segment.road_class]?.[segment.terrain_class];
  const minimumRadius = minimumRadii[designSpeed];

  let gradientContribution = 0;
  if (Number.isFinite(gradient) && segment.terrain_class) {
    const value = Math.abs(gradient);
    gradientContribution = value <= 4 ? 0 : 20;
  }

  let curveContribution = 0;
  if (Number.isFinite(curveRadius) && curveRadius > 0) {
    curveContribution = minimumRadius === undefined || curveRadius >= minimumRadius ? 0 : 20;
  }

  let speedContribution = 0;
  if (Number.isFinite(operatingSpeed) && operatingSpeed >= 0) {
    speedContribution =
      designSpeed === undefined
        ? 0
        : operatingSpeed <= designSpeed
          ? 0
          : operatingSpeed <= designSpeed * 1.15
            ? 8
            : operatingSpeed <= designSpeed * 1.3
              ? 14
              : 20;
  }

  return [
    {
      label: "Gradient",
      value: gradientContribution,
      maximum: 20,
      detail: Number.isFinite(gradient) ? `${gradient}%` : "Not available",
    },
    {
      label: "Curve sharpness",
      value: curveContribution,
      maximum: 20,
      detail: Number.isFinite(curveRadius)
        ? `${curveRadius} m radius`
        : segment.curve_radius_status === "not_defined"
          ? "Not defined (no curve detected)"
          : "Unavailable (insufficient geometry)",
    },
    {
      label: "Operating speed",
      value: speedContribution,
      maximum: 20,
      detail: Number.isFinite(operatingSpeed) ? `${operatingSpeed} km/h` : "Not available",
    },
    {
      label: "Estimated congestion",
      value: traffic === "medium" ? 10 : traffic === "high" ? 20 : 0,
      maximum: 20,
      detail: segment.traffic_level
        ? `${segment.traffic_level} · ${
            segment.traffic_delay_percent == null
              ? "delay % unavailable"
              : `+${Number(segment.traffic_delay_percent).toFixed(1)}% route delay`
          } · project threshold`
        : "Unknown; route traffic data unavailable (not scored)",
    },
    {
      label: "Pedestrian activity",
      value: pedestrian === "medium" ? 8 : pedestrian === "high" ? 20 : 0,
      maximum: 20,
      detail: segment.pedestrian_activity
        ? String(segment.pedestrian_activity) +
          " nearby-place proxy (" +
          String(segment.pedestrian_place_count ?? 0) +
          " activity places)"
        : "Unknown; no complete Places data (not scored)",
    },
  ];
}
