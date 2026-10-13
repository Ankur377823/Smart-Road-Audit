/**
 * Pre/post-processing for the YOLO26n-seg pothole model exported to ONNX with dynamic shapes (one-to-many head)
 * (input [1,3,H,W], output0 [1,37,N] = cx,cy,w,h,score,32 mask coeffs, output1 [1,32,H/4,W/4] protos).
 * Mirrors Ultralytics' letterbox -> NMS -> process_mask -> masks2segments pipeline.
 */

// The model was trained at 640 px; running at the training size detects noticeably more potholes
export const MODEL_SIZE = 640
const STRIDE = 32
const PAD_VALUE = 114 / 255
const NUM_MASK_COEFFS = 32

/**
 * Letterboxes RGBA pixels into a normalized NCHW RGB float tensor (bilinear, half-pixel centres like cv2.resize).
 * Like Ultralytics' rect inference, the long side becomes `size` and the short side is padded only up to a
 * multiple of the model stride, so 4:3 or 16:9 frames don't waste compute on padding.
 */
export function letterbox(rgba, width, height, size = MODEL_SIZE) {
  const ratio = Math.min(size / width, size / height)
  const newW = Math.round(width * ratio)
  const newH = Math.round(height * ratio)
  const inputW = newW + ((size - newW) % STRIDE)
  const inputH = newH + ((size - newH) % STRIDE)
  const padX = Math.round((inputW - newW) / 2 - 0.1)
  const padY = Math.round((inputH - newH) / 2 - 0.1)

  const plane = inputW * inputH
  const tensor = new Float32Array(3 * plane).fill(PAD_VALUE)
  const sx = width / newW
  const sy = height / newH

  for (let y = 0; y < newH; y++) {
    const fy = Math.min(Math.max((y + 0.5) * sy - 0.5, 0), height - 1)
    const y0 = Math.floor(fy)
    const y1 = Math.min(y0 + 1, height - 1)
    const wy = fy - y0
    for (let x = 0; x < newW; x++) {
      const fx = Math.min(Math.max((x + 0.5) * sx - 0.5, 0), width - 1)
      const x0 = Math.floor(fx)
      const x1 = Math.min(x0 + 1, width - 1)
      const wx = fx - x0
      const i00 = (y0 * width + x0) * 4
      const i01 = (y0 * width + x1) * 4
      const i10 = (y1 * width + x0) * 4
      const i11 = (y1 * width + x1) * 4
      const dst = (y + padY) * inputW + (x + padX)
      for (let c = 0; c < 3; c++) {
        const top = rgba[i00 + c] * (1 - wx) + rgba[i01 + c] * wx
        const bottom = rgba[i10 + c] * (1 - wx) + rgba[i11 + c] * wx
        tensor[c * plane + dst] = (top * (1 - wy) + bottom * wy) / 255
      }
    }
  }

  return { tensor, inputW, inputH, ratio, padX, padY }
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

/**
 * Traces the outer boundary of a binary grid region (Moore-neighbour tracing) starting at its top-left pixel.
 */
function traceBoundary(grid, w, h, start) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && grid[y * w + x] === 1
  // Clockwise neighbours starting west
  const dirs = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]]
  const sx = start % w
  const sy = Math.floor(start / w)
  const points = [[sx, sy]]
  let cx = sx
  let cy = sy
  let backtrack = 0 // entered the start pixel from the west (scan order guarantees it is empty)

  for (let steps = 0; steps < w * h * 4; steps++) {
    let found = false
    for (let k = 1; k <= 8; k++) {
      const d = (backtrack + k) % 8
      const nx = cx + dirs[d][0]
      const ny = cy + dirs[d][1]
      if (inside(nx, ny)) {
        // Radial sweep: resume the search just after the pixel we came from
        backtrack = (d + 4) % 8
        cx = nx
        cy = ny
        found = true
        break
      }
    }
    if (!found || (cx === sx && cy === sy)) break
    points.push([cx, cy])
  }
  return points
}

/**
 * Builds a pixel polygon for one detection from its mask coefficients and the prototype masks.
 */
function maskPolygon(coeffs, protos, protoH, protoW, modelBox, meta) {
  const scale = protoW / meta.inputW
  const bx1 = Math.max(0, Math.floor(modelBox[0] * scale))
  const by1 = Math.max(0, Math.floor(modelBox[1] * scale))
  const bx2 = Math.min(protoW, Math.ceil(modelBox[2] * scale))
  const by2 = Math.min(protoH, Math.ceil(modelBox[3] * scale))
  const cw = bx2 - bx1
  const ch = by2 - by1
  if (cw <= 0 || ch <= 0) return []

  // sigmoid(x) > 0.5  <=>  x > 0
  const plane = protoH * protoW
  const grid = new Uint8Array(cw * ch)
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const p = (y + by1) * protoW + (x + bx1)
      let v = 0
      for (let k = 0; k < NUM_MASK_COEFFS; k++) v += coeffs[k] * protos[k * plane + p]
      if (v > 0) grid[y * cw + x] = 1
    }
  }

  // Keep the largest connected component (4-connectivity)
  const labels = new Int32Array(cw * ch)
  let bestLabel = 0
  let bestSize = 0
  let bestStart = -1
  let label = 0
  const stack = []
  for (let i = 0; i < grid.length; i++) {
    if (!grid[i] || labels[i]) continue
    label++
    let size = 0
    labels[i] = label
    stack.push(i)
    while (stack.length) {
      const j = stack.pop()
      size++
      const x = j % cw
      const y = (j - x) / cw
      const neighbours = [x > 0 ? j - 1 : -1, x < cw - 1 ? j + 1 : -1, y > 0 ? j - cw : -1, y < ch - 1 ? j + cw : -1]
      for (const n of neighbours) {
        if (n >= 0 && grid[n] && !labels[n]) {
          labels[n] = label
          stack.push(n)
        }
      }
    }
    if (size > bestSize) {
      bestSize = size
      bestLabel = label
      bestStart = i
    }
  }
  if (bestStart < 0 || bestSize < 3) return []
  for (let i = 0; i < grid.length; i++) grid[i] = labels[i] === bestLabel ? 1 : 0

  const toImage = (px, py) => {
    const lx = (px + bx1 + 0.5) / scale
    const ly = (py + by1 + 0.5) / scale
    return [
      Math.round(Math.min(Math.max((lx - meta.padX) / meta.ratio, 0), meta.width) * 10) / 10,
      Math.round(Math.min(Math.max((ly - meta.padY) / meta.ratio, 0), meta.height) * 10) / 10,
    ]
  }
  return traceBoundary(grid, cw, ch, bestStart).map(([x, y]) => toImage(x, y))
}

/**
 * Decodes raw model outputs into detections in original-frame pixel coordinates.
 */
export function decodeSegmentation(output0, dims0, output1, dims1, meta, { confThreshold = 0.4, iouThreshold = 0.7, maxDet = 30 } = {}) {
  const numChannels = dims0[1]
  const numAnchors = dims0[2]
  const [, , protoH, protoW] = dims1

  const candidates = []
  for (let i = 0; i < numAnchors; i++) {
    const score = output0[4 * numAnchors + i]
    if (score < confThreshold) continue
    const cx = output0[i]
    const cy = output0[numAnchors + i]
    const w = output0[2 * numAnchors + i]
    const h = output0[3 * numAnchors + i]
    candidates.push({ i, score, box: [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2] })
  }
  candidates.sort((a, b) => b.score - a.score)

  const kept = []
  for (const c of candidates) {
    if (kept.length >= maxDet) break
    if (kept.every((k) => boxIou(k.box, c.box) <= iouThreshold)) kept.push(c)
  }

  const maskStart = numChannels - NUM_MASK_COEFFS
  return kept.map((c) => {
    const coeffs = new Float32Array(NUM_MASK_COEFFS)
    for (let k = 0; k < NUM_MASK_COEFFS; k++) coeffs[k] = output0[(maskStart + k) * numAnchors + c.i]

    const unpad = (v, pad, max) => Math.min(Math.max((v - pad) / meta.ratio, 0), max)
    const box = [
      unpad(c.box[0], meta.padX, meta.width),
      unpad(c.box[1], meta.padY, meta.height),
      unpad(c.box[2], meta.padX, meta.width),
      unpad(c.box[3], meta.padY, meta.height),
    ]
    return {
      box,
      confidence: c.score,
      polygon: maskPolygon(coeffs, output1, protoH, protoW, c.box, meta),
    }
  })
}
