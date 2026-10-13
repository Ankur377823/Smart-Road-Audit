/**
 * Risk assessment of a pothole as a road-safety concern per IRC:SP:88-2019 "Manual on Road Safety Audit".
 *
 * Section 4.6.2: risk = likelihood (frequency) x consequence (severity). Table 4.2 consequence levels:
 *   Very High - multiple deaths are likely (high speed, multi-vehicle crashes)
 *   High      - a death and/or serious injuries are likely (high/medium speed collisions)
 *   Medium    - minor injuries only are likely (low speed collisions)
 * Table 4.3 priority: Very High -> Essential, High -> Highly Desirable, Medium -> Desirable.
 *
 * SP:88 treats this as a qualitative judgement by the audit team. This module gives a transparent,
 * rule-based starting point: likelihood from the IRC:82-2015 size class (a larger, deeper pothole is
 * more likely to cause loss of control, especially for two-wheelers) and consequence from the
 * speed of traffic using the road. The surveyor's own speed is not the traffic speed (a walking or
 * slow-driving auditor would understate it), so the higher of the GPS speed and the typical speed
 * for the road class is used. Mirrored in backend/app/services/sp88.py; keep the two in sync.
 */

export const SP88_REFERENCE = 'IRC:SP:88-2019'

export const RISK_LEVELS = ['Medium', 'High', 'Very High']

export const PRIORITY_FOR_RISK = {
  'Very High': 'Essential',
  High: 'Highly Desirable',
  Medium: 'Desirable',
}

// Table 4.3 suggested treatment approach, quoted
export const PRIORITY_GUIDANCE = {
  Essential: 'Shall be implemented "at any cost".',
  'Highly Desirable': 'Shall be implemented unless cost of remedial treatment is prohibitive and risk can be reduced by an alternative measure.',
  Desirable: 'Shall be implemented if the safety concerns could not be mitigated by the essential and highly desirable recommendations and the risk needs to be reduced further.',
}

// Typical operating speeds when no GPS speed is available
const ROAD_CLASS_SPEED_KMH = { arterial: 60, collector: 40, local: 30 }

// Rows: IRC:82 size class (small, medium, large); columns: speed band (low < 30, medium 30-59, high >= 60 km/h)
const RISK_MATRIX = {
  minor: ['Medium', 'Medium', 'High'],
  moderate: ['Medium', 'High', 'High'],
  severe: ['High', 'High', 'Very High'],
}

function speedBand(speedKmh) {
  if (speedKmh >= 60) return 2
  if (speedKmh >= 30) return 1
  return 0
}

/**
 * @param severity   IRC:82 size class stored as 'minor' | 'moderate' | 'severe'
 * @param speedKmh   surveyor's speed when the pothole was recorded (GPS), if known
 * @param roadClass  audit road class, giving the typical traffic speed
 */
export function assessRisk({ severity, speedKmh, roadClass }) {
  const typical = ROAD_CLASS_SPEED_KMH[roadClass] ?? ROAD_CLASS_SPEED_KMH.collector
  const gpsFaster = speedKmh != null && speedKmh > typical
  const basisSpeed = gpsFaster ? speedKmh : typical
  const riskLevel = RISK_MATRIX[severity]?.[speedBand(basisSpeed)] ?? 'Medium'

  return {
    riskLevel,
    priority: PRIORITY_FOR_RISK[riskLevel],
    speedBasis: gpsFaster ? `${Math.round(basisSpeed)} km/h (GPS)` : `${typical} km/h (typical for ${roadClass || 'collector'} road)`,
  }
}

/** Recommended treatment per IRC:82-2015 cl. 7.5.3.5 */
export const POTHOLE_TREATMENT =
  'Fill with open graded or dense graded premix (IRC:82-2015 cl. 7.5.3.5): hot/cold mix for immediate use, storable cold mix (IRC:116 / IRC:100), readymade mix or patching machine. Cut the deteriorated edges and remove loose material before filling.'
