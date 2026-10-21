/**
 * Browser port of backend/app/services/pothole_depth_estimator.py.
 * Same heuristics (shadow depression inside the cavity vs the surrounding asphalt ring,
 * Laplacian texture roughness, area) computed on RGBA frame pixels without OpenCV.
 */

const CHAMFER_STRAIGHT = 3
const CHAMFER_DIAGONAL = 4

/** cv2.COLOR_RGB2GRAY fixed-point conversion */
function toGray(rgba, width, x0, y0, w, h) {
  const gray = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = ((y + y0) * width + (x + x0)) * 4
      gray[y * w + x] = (rgba[i] * 4899 + rgba[i + 1] * 9617 + rgba[i + 2] * 1868 + 8192) >> 14
    }
  }
  return gray
}

/** Even-odd scanline fill of a polygon (image coords) into a w*h mask offset by (x0, y0). */
function fillPolygon(polygon, x0, y0, w, h) {
  const mask = new Uint8Array(w * h)
  const n = polygon.length
  const xs = []
  for (let y = 0; y < h; y++) {
    const py = y + y0 + 0.5
    xs.length = 0
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const [xi, yi] = polygon[i]
      const [xj, yj] = polygon[j]
      if ((yi > py) !== (yj > py)) xs.push(xi + ((py - yi) / (yj - yi)) * (xj - xi))
    }
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - x0 - 0.5))
      const to = Math.min(w - 1, Math.floor(xs[k + 1] - x0 - 0.5))
      for (let x = from; x <= to; x++) mask[y * w + x] = 1
    }
  }
  return mask
}

/** Two-pass 3-4 chamfer distance (in pixels) from each cell to the nearest cell where target(cell) is false. */
function chamferDistance(w, h, isTarget) {
  const INF = 1e9
  const d = new Float32Array(w * h)
  for (let i = 0; i < d.length; i++) d[i] = isTarget(i) ? INF : 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (!d[i]) continue
      let v = d[i]
      if (x > 0) v = Math.min(v, d[i - 1] + CHAMFER_STRAIGHT)
      if (y > 0) {
        v = Math.min(v, d[i - w] + CHAMFER_STRAIGHT)
        if (x > 0) v = Math.min(v, d[i - w - 1] + CHAMFER_DIAGONAL)
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + CHAMFER_DIAGONAL)
      }
      d[i] = v
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x
      if (!d[i]) continue
      let v = d[i]
      if (x < w - 1) v = Math.min(v, d[i + 1] + CHAMFER_STRAIGHT)
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + CHAMFER_STRAIGHT)
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + CHAMFER_DIAGONAL)
        if (x > 0) v = Math.min(v, d[i + w - 1] + CHAMFER_DIAGONAL)
      }
      d[i] = v
    }
  }
  for (let i = 0; i < d.length; i++) d[i] /= CHAMFER_STRAIGHT
  return d
}

export function estimatePotholeDepth(rgba, width, height, polygon, box) {
  let [x1, y1, x2, y2] = box.map((v) => Math.trunc(v))
  x1 = Math.max(0, x1)
  y1 = Math.max(0, y1)
  x2 = Math.min(width, x2)
  y2 = Math.min(height, y2)

  const boxW = Math.max(1, x2 - x1)
  const boxH = Math.max(1, y2 - y1)

  // Without a segmentation outline there is nothing to analyse: depth is unknown, not guessed
  if (!polygon || polygon.length < 3) {
    return { depth_cm: null, is_valid_cavity: true }
  }

  // Elliptical kernel of diameter k: erode once (radius r), dilate twice (radius 2r)
  const kernelSize = Math.max(3, Math.trunc(Math.min(boxW, boxH) * 0.15))
  const r = (kernelSize - 1) / 2
  const margin = kernelSize + 2

  // Work region: box plus room for the dilated ring
  const rx0 = Math.max(0, x1 - margin)
  const ry0 = Math.max(0, y1 - margin)
  const rx1 = Math.min(width, x2 + margin)
  const ry1 = Math.min(height, y2 + margin)
  const w = rx1 - rx0
  const h = ry1 - ry0
  if (w <= 0 || h <= 0) return estimatePotholeDepth(rgba, width, height, [], box)

  const gray = toGray(rgba, width, rx0, ry0, w, h)
  const mask = fillPolygon(polygon, rx0, ry0, w, h)

  const distToBackground = chamferDistance(w, h, (i) => mask[i] === 1)
  const distToForeground = chamferDistance(w, h, (i) => mask[i] === 0)

  // 1. Inner core (eroded) vs outer surrounding ring (dilated minus mask)
  let innerSum = 0
  let innerCount = 0
  let maskSum = 0
  let maskCount = 0
  let outerSum = 0
  let outerCount = 0
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) {
      maskSum += gray[i]
      maskCount++
      if (distToBackground[i] > r) {
        innerSum += gray[i]
        innerCount++
      }
    } else if (distToForeground[i] <= 2 * r) {
      outerSum += gray[i]
      outerCount++
    }
  }
  if (!innerCount) {
    innerSum = maskSum
    innerCount = maskCount
  }
  const innerMean = innerCount ? innerSum / innerCount : 0
  const outerMean = outerCount ? outerSum / outerCount : 0

  // Intensity depression index: cavity shadow vs asphalt surface
  const intensityDepression = outerMean > 5.0 ? Math.max(0.0, (outerMean - innerMean) / outerMean) : 0.2

  // 2. Texture & fracture roughness inside the cavity (Laplacian, reflect-101 border within the box)
  const reflect = (v, lo, hi) => (v < lo ? 2 * lo - v : v > hi ? 2 * hi - v : v)
  const bx0 = x1 - rx0
  const by0 = y1 - ry0
  const bx1 = bx0 + (x2 - x1) - 1
  const by1 = by0 + (y2 - y1) - 1
  let lapSum = 0
  let lapSqSum = 0
  let lapCount = 0
  for (let y = by0; y <= by1; y++) {
    for (let x = bx0; x <= bx1; x++) {
      const i = y * w + x
      if (!mask[i]) continue
      const left = gray[y * w + reflect(x - 1, bx0, bx1)]
      const right = gray[y * w + reflect(x + 1, bx0, bx1)]
      const up = gray[reflect(y - 1, by0, by1) * w + x]
      const down = gray[reflect(y + 1, by0, by1) * w + x]
      const lap = left + right + up + down - 4 * gray[i]
      lapSum += lap
      lapSqSum += lap * lap
      lapCount++
    }
  }
  const laplacianVar = lapCount ? lapSqSum / lapCount - (lapSum / lapCount) ** 2 : 100.0
  const normalizedRoughness = Math.min(1.0, Math.log1p(Math.max(0, laplacianVar)) / 8.0)

  // 3. Visual depth estimate (cm) from shadow falloff and texture roughness. Image area is deliberately
  // not used: it depends on distance from the camera, not on depth. Severity and priority are assigned
  // from IRC:82-2015 classes elsewhere (irc82.js), using this estimate together with the measured width.
  const computedDepth = intensityDepression * 8.0 + normalizedRoughness * 3.5
  const depthCm = Math.round(Math.min(15.0, Math.max(1.0, computedDepth)) * 10) / 10

  // A pothole must be a depression: a noticeably brighter interior is not a cavity
  // 1.25 rather than 1.15: wet or sunlit potholes are often slightly brighter than the road around them
  const isValidCavity = !(outerMean > 15.0 && innerMean > outerMean * 1.25)

  return {
    depth_cm: depthCm,
    roughness_index: Math.round(normalizedRoughness * 100) / 100,
    intensity_depression: Math.round(intensityDepression * 1000) / 1000,
    is_valid_cavity: isValidCavity,
  }
}
