/**
 * Built-in check that a model runtime produces correct detections. Some GPU drivers run the model
 * fast but return wrong values, which would make detection silently fail; the worker runs this frame
 * on the GPU at start-up and falls back to the CPU if the known pothole is not found.
 *
 * The frame is generated (no image file): grey textured asphalt with a dark, rimmed elliptical hole.
 */

export const SELF_TEST_WIDTH = 640
export const SELF_TEST_HEIGHT = 480
// Where the generated pothole is; a correct runtime finds a box overlapping this
export const SELF_TEST_BOX = [180, 295, 320, 365]

export function makeSelfTestFrame() {
  const w = SELF_TEST_WIDTH
  const h = SELF_TEST_HEIGHT
  const rgba = new Uint8ClampedArray(w * h * 4)
  let seed = 12345
  const rand = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  const [cx, cy, rx, ry] = [250, 330, 70, 35]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      // Approximate Gaussian texture around asphalt grey
      let v = 115 + (rand() + rand() + rand() - 1.5) * 30
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
      if (d <= 1) v = 35 + (rand() - 0.5) * 10
      else if (d <= 1.12) v = 70
      rgba[i] = rgba[i + 1] = rgba[i + 2] = v
      rgba[i + 3] = 255
    }
  }
  return rgba
}

function boxIou(a, b) {
  const x1 = Math.max(a[0], b[0])
  const y1 = Math.max(a[1], b[1])
  const x2 = Math.min(a[2], b[2])
  const y2 = Math.min(a[3], b[3])
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
  return union > 0 ? inter / union : 0
}

/** True when the detections include the generated pothole. */
export function selfTestPassed(detections) {
  return detections.some((det) => boxIou(det.box, SELF_TEST_BOX) >= 0.5)
}
