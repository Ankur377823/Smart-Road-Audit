/**
 * Pothole classification and rating per IRC:82-2015
 * "Code of Practice for Maintenance of Bituminous Road Surfaces".
 *
 * Clause 7.5.3.4 (Severity): small = 25 mm deep, 200 mm wide; medium = 25 to 50 mm deep, 500 mm wide;
 * large = greater than 50 mm deep and 500 mm width.
 * Tables 5.1-5.3: section rating from pothole area as a percentage of the surveyed surface.
 *
 * Mirrored in backend/app/services/irc82.py; keep the two in sync.
 */

export const IRC_REFERENCE = 'IRC:82-2015'

// Stored severity values map onto the IRC size classes
export const IRC_CLASS_LABEL = { minor: 'Small', moderate: 'Medium', severe: 'Large' }

const SEVERITIES = ['minor', 'moderate', 'severe']

// Class boundaries (upper bounds of small and medium). A value on a boundary stays in the lower class.
const DEPTH_BOUNDS_MM = [25, 50]
const WIDTH_BOUNDS_MM = [200, 500]
// Beyond the medium/large boundary, the size index saturates at twice the boundary value
const DEPTH_CAP_MM = 100
const WIDTH_CAP_MM = 1000

/** Position on a 0-3 scale: 0-1 small, 1-2 medium, 2-3 large (linear within each class). */
function classPosition(value, [small, medium], cap) {
  if (value == null || !Number.isFinite(value) || value <= 0) return null
  if (value <= small) return value / small
  if (value <= medium) return 1 + (value - small) / (medium - small)
  return 2 + Math.min(1, (value - medium) / (cap - medium))
}

/**
 * Classifies one pothole. Either dimension may be missing. When depth and width fall in different
 * classes, the higher class is used (conservative: IRC lists both criteria for each class).
 *
 * Returns { severity, ircClass, sizeIndex, governedBy }. sizeIndex (0-100) is the position within the
 * classes (small 0-33, medium 33-67, large 67-100), used only for sorting; IRC:82 defines no numeric score.
 * Road-safety risk and priority are assessed separately per IRC:SP:88-2019 (sp88.js).
 */
export function classifyPothole({ depthMm, widthMm }) {
  const depthPos = classPosition(depthMm, DEPTH_BOUNDS_MM, DEPTH_CAP_MM)
  const widthPos = classPosition(widthMm, WIDTH_BOUNDS_MM, WIDTH_CAP_MM)
  const position = Math.max(depthPos ?? 0, widthPos ?? 0)
  const classIndex = position <= 1 ? 0 : position <= 2 ? 1 : 2
  const severity = SEVERITIES[classIndex]

  return {
    severity,
    ircClass: IRC_CLASS_LABEL[severity],
    sizeIndex: Math.round((position / 3) * 1000) / 10,
    governedBy: depthPos == null && widthPos == null ? null : (depthPos ?? -1) >= (widthPos ?? -1) ? 'depth' : 'width',
  }
}

/**
 * Tables 5.1-5.3 pothole rows: [poorAbove, goodBelow] in percent of surveyed area.
 * Poor (rating 1) when area% > poorAbove; Good (2.1-3) when area% < goodBelow; Fair (1.1-2) between.
 */
export const ROAD_CATEGORIES = {
  highway: { label: 'Highways (NH/SH)', table: 'Table 5.1', poorAbove: 1, goodBelow: 0.1 },
  mdr_rural: { label: 'MDR and rural roads (ODR/VR)', table: 'Table 5.2', poorAbove: 1, goodBelow: 0.5 },
  urban: { label: 'Urban roads', table: 'Table 5.3', poorAbove: 0.5, goodBelow: 0 },
}

/**
 * Section rating from pothole area percentage. Within the Fair and Good bands the rating is
 * interpolated linearly (the code gives bands only; Appendix 4 assigns values within them).
 */
export function sectionRating(areaPercent, category) {
  const { poorAbove, goodBelow } = ROAD_CATEGORIES[category]
  const round1 = (v) => Math.round(v * 10) / 10

  if (areaPercent > poorAbove) return { rating: 1, condition: 'Poor' }
  // Urban roads: Good only when there are no potholes at all ("NIL")
  if (goodBelow === 0 ? areaPercent === 0 : areaPercent < goodBelow) {
    return { rating: goodBelow === 0 ? 3 : round1(3 - (areaPercent / goodBelow) * 0.9), condition: 'Good' }
  }
  const span = poorAbove - goodBelow
  return { rating: round1(2 - ((areaPercent - goodBelow) / span) * 0.9), condition: 'Fair' }
}

/** Default surveyed width: a standard two-lane carriageway (7.0 m). Users can change it per report. */
export const DEFAULT_CARRIAGEWAY_WIDTH_M = 7

export function defaultCategoryForRoadClass(roadClass) {
  return roadClass === 'arterial' ? 'highway' : 'urban'
}
