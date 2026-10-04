const RAW_API_BASE_URL = (import.meta.env.VITE_API_BASE_URL !== undefined ? import.meta.env.VITE_API_BASE_URL : (typeof window !== 'undefined' ? '' : 'http://127.0.0.1:8000')).replace(/\/$/, '')
const API_BASE_URL = RAW_API_BASE_URL ? (RAW_API_BASE_URL.endsWith('/api') ? RAW_API_BASE_URL : `${RAW_API_BASE_URL}/api`) : '/api'

export async function detectPotholes({ imageBase64, confThreshold = 0.70, latitude = null, longitude = null, speedKmh = null, auditId = null }) {
  const response = await fetch(`${API_BASE_URL}/potholes/detect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_base64: imageBase64,
      conf_threshold: confThreshold,
      latitude,
      longitude,
      speed_kmh: speedKmh,
      audit_id: auditId,
    }),
  })

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}))
    throw new Error(detail.detail || 'Pothole detection failed.')
  }

  return response.json()
}

export async function savePotholesToAudit(auditId, detections) {
  const payload = {
    audit_id: Number(auditId),
    detections: detections.map((item) => ({
      latitude: item.latitude || 0.0,
      longitude: item.longitude || 0.0,
      confidence: item.confidence || 0.85,
      severity: item.severity || 'moderate',
      depth_cm: item.depth_cm || 3.5,
      risk_score: item.risk_score || 50.0,
      area_ratio: item.area_ratio || 0.0,
      geometry_json: item.polygon ? JSON.stringify(item.polygon) : null,
      snapshot_image: item.snapshot || null,
      speed_kmh: item.speedKmh || null,
      detected_at: new Date().toISOString(),
    })),
  }

  const response = await fetch(`${API_BASE_URL}/potholes/save`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}))
    throw new Error(detail.detail || 'Failed to save pothole detections to audit.')
  }

  return response.json()
}

export async function getAuditPotholes(auditId) {
  const response = await fetch(`${API_BASE_URL}/potholes/audit/${auditId}`)
  if (!response.ok) {
    return {
      audit_id: auditId,
      total_potholes: 0,
      severe_count: 0,
      moderate_count: 0,
      minor_count: 0,
      detections: [],
    }
  }
  return response.json()
}
