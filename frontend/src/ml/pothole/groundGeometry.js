/**
 * Projects a detection from image pixels onto the road plane (flat-ground pinhole model) to estimate
 * its real width, length and area. Needs the camera height above the road, its downward tilt and its
 * horizontal field of view. Accuracy is roughly ±25% with a correct height and a sensor-measured tilt;
 * it degrades for points near the horizon.
 */

// Typical phone main camera (≈26 mm equivalent) in a 4:3 frame
export const DEFAULT_HFOV_DEG = 66
// Used when the device reports no orientation (e.g. desktop webcams)
export const DEFAULT_PITCH_DEG = 30

// Survey modes: phone height above the road (typical mounts)
export const CAMERA_HEIGHTS = [
  { value: 1.2, label: 'Car: dashboard mount (1.2 m)' },
  { value: 1.0, label: 'Two-wheeler: handlebar mount (1.0 m)' },
  { value: 1.4, label: 'Walking: handheld (1.4 m)' },
]

const toRad = (deg) => (deg * Math.PI) / 180

/**
 * Downward camera tilt in degrees from a DeviceOrientationEvent, accounting for screen rotation.
 * Upright phone facing the road ahead ≈ 0°, pointing straight down ≈ 90°.
 */
export function pitchFromOrientation({ beta, gamma }, screenAngle = 0) {
  if (beta == null || gamma == null) return null
  const landscape = Math.abs(screenAngle) === 90 || screenAngle === 270
  const tiltFromVertical = landscape ? 90 - Math.abs(gamma) : 90 - beta
  return Math.min(89, Math.max(0, tiltFromVertical))
}

function projector(frameW, frameH, { hfovDeg, heightM, pitchDeg }) {
  const f = frameW / 2 / Math.tan(toRad(hfovDeg) / 2)
  const cx = frameW / 2
  const cy = frameH / 2
  const sin = Math.sin(toRad(pitchDeg))
  const cos = Math.cos(toRad(pitchDeg))

  // Returns ground point {x: lateral m, z: forward m} or null above the horizon
  return (u, v) => {
    const x = (u - cx) / f
    const y = (v - cy) / f
    const down = y * cos + sin
    if (down <= 1e-3) return null
    const t = heightM / down
    return { x: x * t, z: (cos - y * sin) * t }
  }
}

/**
 * Returns { widthMm, lengthMm, areaM2, distanceM } or null when the pothole can't be placed on the road.
 * widthMm is the lateral extent (across the direction of view), the most reliable dimension.
 */
export function measureOnGround(det, frameW, frameH, camera) {
  if (!camera?.heightM || camera.pitchDeg == null) return null
  const project = projector(frameW, frameH, { hfovDeg: DEFAULT_HFOV_DEG, ...camera })

  const outline = det.polygon?.length >= 3
    ? det.polygon
    : [[det.box[0], det.box[1]], [det.box[2], det.box[1]], [det.box[2], det.box[3]], [det.box[0], det.box[3]]]

  const ground = outline.map(([u, v]) => project(u, v))
  if (ground.some((p) => p == null)) return null

  const xs = ground.map((p) => p.x)
  const zs = ground.map((p) => p.z)
  let area = 0
  for (let i = 0, j = ground.length - 1; i < ground.length; j = i++) {
    area += ground[j].x * ground[i].z - ground[i].x * ground[j].z
  }
  const distanceM = Math.min(...zs)
  // Beyond ~15 m a few pixels span tens of centimetres: too uncertain to report
  if (distanceM > 15) return null

  return {
    widthMm: Math.round((Math.max(...xs) - Math.min(...xs)) * 1000),
    lengthMm: Math.round((Math.max(...zs) - Math.min(...zs)) * 1000),
    areaM2: Math.round(Math.abs(area / 2) * 1000) / 1000,
    distanceM: Math.round(distanceM * 10) / 10,
  }
}
