import { estimatePotholeDepthAndRisk } from './depthEstimator'
import { decodeSegmentation } from './yoloSeg'

/**
 * Turns raw model outputs into scanner detections, applying the same non-road filters
 * and depth/risk analysis as the backend's PotholeDetector.
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

    const metrics = estimatePotholeDepthAndRisk(rgba, width, height, det.polygon, det.box)
    if (!metrics.is_valid_cavity) {
      filteredNonRoad++
      return
    }

    detections.push({
      id: `det-${stamp}-${i}`,
      box: det.box.map((v) => Math.round(v * 100) / 100),
      polygon: det.polygon,
      confidence: Math.round(det.confidence * 1000) / 1000,
      severity: metrics.severity,
      depth_cm: metrics.depth_cm,
      risk_score: metrics.risk_score,
      area_ratio: Math.round(((boxW * boxH) / (width * height)) * 10000) / 10000,
      label: 'pothole',
    })
  })

  return { detections, filteredNonRoad }
}
