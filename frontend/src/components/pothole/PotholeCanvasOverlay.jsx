import { useEffect, useRef } from 'react'

/**
 * Renders real-time YOLO segmentation masks and bounding boxes onto an HTML5 canvas overlay.
 */
function PotholeCanvasOverlay({ detections = [], frameWidth = 640, frameHeight = 480 }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Set canvas internal resolution to match incoming processed frame
    canvas.width = frameWidth || 640
    canvas.height = frameHeight || 480

    // Clear previous frame
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    if (!detections || detections.length === 0) return

    detections.forEach((det) => {
      const { box, polygon, confidence, severity } = det

      // Color scheme based on severity
      let strokeColor = 'rgba(56, 189, 248, 0.9)' // sky/cyan (minor)
      let fillColor = 'rgba(56, 189, 248, 0.25)'
      if (severity === 'severe') {
        strokeColor = 'rgba(239, 68, 68, 0.95)' // red
        fillColor = 'rgba(239, 68, 68, 0.35)'
      } else if (severity === 'moderate') {
        strokeColor = 'rgba(245, 158, 11, 0.95)' // amber
        fillColor = 'rgba(245, 158, 11, 0.3)'
      }

      // 1. Draw Segmentation Polygon Mask if available
      if (polygon && polygon.length > 2) {
        ctx.save()
        ctx.beginPath()
        ctx.moveTo(polygon[0][0], polygon[0][1])
        for (let i = 1; i < polygon.length; i++) {
          ctx.lineTo(polygon[i][0], polygon[i][1])
        }
        ctx.closePath()
        ctx.fillStyle = fillColor
        ctx.fill()
        ctx.lineWidth = 2.5
        ctx.strokeStyle = strokeColor
        ctx.shadowColor = strokeColor
        ctx.shadowBlur = 8
        ctx.stroke()
        ctx.restore()
      }

      // 2. Draw Bounding Box & HUD Label
      if (box && Array.isArray(box) && box.length === 4) {
        const [x1, y1, x2, y2] = box
        const w = x2 - x1
        const h = y2 - y1

        ctx.save()
        ctx.lineWidth = 1.5
        ctx.strokeStyle = strokeColor
        ctx.strokeRect(x1, y1, w, h)

        // Draw corner brackets
        const cornerSize = Math.max(4, Math.min(12, Math.min(w, h) / 4))
        ctx.lineWidth = 3
        // Top-left
        ctx.beginPath()
        ctx.moveTo(x1, y1 + cornerSize)
        ctx.lineTo(x1, y1)
        ctx.lineTo(x1 + cornerSize, y1)
        ctx.stroke()
        // Bottom-right
        ctx.beginPath()
        ctx.moveTo(x2, y2 - cornerSize)
        ctx.lineTo(x2, y2)
        ctx.lineTo(x2 - cornerSize, y2)
        ctx.stroke()

        // Draw Label Chip with OpenCV Depth and Risk
        const depthText = det.depth_cm ? ` • ${det.depth_cm}cm` : ''
        const sevStr = (severity || 'moderate').toUpperCase()
        const riskText = det.risk_score ? ` [RISK ${det.risk_score}]` : ` [${sevStr}]`
        const labelText = `POTHOLE ${(Number(confidence || 0) * 100).toFixed(0)}%${depthText}${riskText}`
        ctx.font = 'bold 11px Inter, system-ui, sans-serif'
        const textWidth = ctx.measureText(labelText).width
        const padding = 6

        const labelY = Math.max(16, y1 - 6)
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'
        ctx.fillRect(x1, labelY - 14, textWidth + padding * 2, 18)

        ctx.fillStyle = strokeColor
        ctx.fillText(labelText, x1 + padding, labelY)
        ctx.restore()
      }
    })
  }, [detections, frameWidth, frameHeight])

  return (
    <canvas
      ref={canvasRef}
      className="scanner-canvas-overlay"
    />
  )
}

export default PotholeCanvasOverlay
