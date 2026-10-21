import { API_BASE_URL } from './apiBase'

const DETECT_TIMEOUT_MS = 8000

export async function detectPotholes({ imageBase64, confThreshold = 0.55, latitude = null, longitude = null, speedKmh = null, auditId = null }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DETECT_TIMEOUT_MS)

  try {
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
      signal: controller.signal,
    })

    if (!response.ok) {
      const detail = await response.json().catch(() => ({}))
      throw new Error(typeof detail.detail === 'string' ? detail.detail : 'Pothole detection failed.')
    }

    return response.json()
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Detection request timed out.')
    throw err
  } finally {
    clearTimeout(timer)
  }
}

// Potholes per request: keeps each upload small enough for weak mobile connections
const SAVE_BATCH_SIZE = 40

function toSaveItem(item) {
  return {
    client_id: item.id,
    latitude: item.latitude ?? null,
    longitude: item.longitude ?? null,
    location_source: item.locationSource ?? 'none',
    gps_accuracy_m: item.gpsAccuracy ?? null,
    confidence: item.confidence,
    // Class and risk are recomputed on the server from depth, width and speed (IRC:82 / IRC:SP:88)
    severity: item.severity,
    depth_cm: item.depth_cm ?? null,
    depth_source: item.depthSource ?? 'estimated',
    width_mm: item.width_mm ?? null,
    area_m2: item.area_m2 ?? null,
    area_ratio: item.area_ratio ?? 0,
    geometry_json: item.polygon?.length ? JSON.stringify({ box: item.box, polygon: item.polygon }) : null,
    snapshot_image: item.snapshot ?? null,
    speed_kmh: item.speedKmh ?? null,
    detected_at: new Date(item.timestamp).toISOString(),
  }
}

async function postSaveBatch(auditId, items) {
  const response = await fetch(`${API_BASE_URL}/potholes/save`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ audit_id: Number(auditId), detections: items.map(toSaveItem) }),
  })

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}))
    const error = new Error(typeof detail.detail === 'string' ? detail.detail : 'Failed to save pothole detections to audit.')
    error.status = response.status
    throw error
  }
  return response.json()
}

/**
 * Saves potholes in small batches, retrying each batch once on a network or server error. Saves are
 * idempotent (client_id), so a retried or repeated batch never creates duplicates.
 * onProgress(savedSoFar, total) reports progress.
 */
export async function savePotholesToAudit(auditId, detections, onProgress) {
  const result = { saved: [], skipped_duplicates: 0, compliance_score: null }

  for (let start = 0; start < detections.length; start += SAVE_BATCH_SIZE) {
    const batch = detections.slice(start, start + SAVE_BATCH_SIZE)
    let batchResult
    try {
      batchResult = await postSaveBatch(auditId, batch)
    } catch (err) {
      // Validation errors (4xx) won't succeed on retry; network drops and 5xx might
      if (err.status && err.status < 500) throw err
      await new Promise((resolve) => setTimeout(resolve, 2000))
      batchResult = await postSaveBatch(auditId, batch)
    }
    result.saved.push(...(batchResult.saved || []))
    result.skipped_duplicates += batchResult.skipped_duplicates || 0
    result.compliance_score = batchResult.compliance_score ?? result.compliance_score
    onProgress?.(Math.min(start + batch.length, detections.length), detections.length)
  }
  return result
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
