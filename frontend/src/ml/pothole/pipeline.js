import { estimatePotholeDepth } from './depthEstimator'
import { decodeSegmentation } from './yoloSeg'

// Mean colour strength (max - min RGB channel, 0-255) of the ring around a detection above which it is
// treated as off-road. Tested on labelled road potholes and everyday non-road scenes: grey/brown road
// surroundings stay below ~24 for 90% of real potholes, while off-road false detections have a median of ~30.
// Kept loose so dusty or muddy road edges still pass.
const MAX_SURROUND_CHROMA = 30

/**
 * Turns raw model outputs into scanner detections, applying the same non-road filters
 * and visual depth estimate as the backend's PotholeDetector. IRC severity is assigned on the main
 * thread, where the camera height and tilt needed to measure width are known.
 */
export function buildDetections({ rgba, width, height, output0, dims0, output1, dims1, meta, confThreshold }) {
  const raw = decodeSegmentation(output0, dims0, output1, dims1, { ...meta, width, height }, { confThreshold })
  const detections = []
  let filteredNonRoad = 0
  const stamp = Date.now()

  raw.forEach((det, i) => {
    const [x1, y1, x2, y2] = det.box
    const boxW = Math.max(1, x2 - x1)
    const boxH = Math.max(1, y2 - y1)

    // Sky/ceiling boxes in the top 10%, and tall vertical objects (people, poles)
    if (y2 < height * 0.1 || boxH / boxW > 2.2) {
      filteredNonRoad++
      return
    }

    // Off-road objects the model mistakes for potholes (food, clocks, toys, sky) sit in colourful
    // surroundings; road around a pothole is grey asphalt or dull earth. No brightness check: water-filled,
    // dusty and sunlit potholes are often lighter inside than the road.
    const metrics = estimatePotholeDepth(rgba, width, height, det.polygon, det.box)
    if (metrics.surround_chroma > MAX_SURROUND_CHROMA) {
      filteredNonRoad++
      return
    }

    detections.push({
      id: `det-${stamp}-${i}`,
      box: det.box.map((v) => Math.round(v * 100) / 100),
      polygon: det.polygon,
      confidence: Math.round(det.confidence * 1000) / 1000,
      depth_cm: metrics.depth_cm,
      area_ratio: Math.round(((boxW * boxH) / (width * height)) * 10000) / 10000,
      label: 'pothole',
    })
  })

  return { detections, filteredNonRoad }
}
