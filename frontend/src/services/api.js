const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL !== undefined
    ? import.meta.env.VITE_API_BASE_URL
    : (typeof window !== "undefined" ? "" : "http://127.0.0.1:8000");

/**
 * Common API request helper.
 *
 * All frontend requests to the FastAPI backend
 * go through this function.
 */
async function request(endpoint, options = {}) {
  const response = await fetch(
    `${API_BASE_URL}${endpoint}`,
    {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    }
  );

  let data = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data?.detail ||
      data?.message ||
      `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return data;
}

/* ==========================================================
   HEALTH
========================================================== */

export async function getHealth() {
  return request("/health");
}

/* ==========================================================
   LOCATIONS
========================================================== */

export async function searchLocations(
  query,
  limit = 5
) {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
  });

  return request(
    `/locations/search?${params.toString()}`
  );
}

export async function reverseGeocode(
  latitude,
  longitude
) {
  const params = new URLSearchParams({
    lat: String(latitude),
    lng: String(longitude),
  });

  return request(
    `/locations/reverse?${params.toString()}`
  );
}

/* ==========================================================
   ROADS
========================================================== */

/**
 * Snap a selected coordinate to the nearest road.
 *
 * Backend endpoint:
 *
 * GET /roads/snap
 *
 * Required query parameters:
 * lat
 * lng
 */
export async function snapToRoad(
  latitude,
  longitude
) {
  const params = new URLSearchParams({
    lat: String(latitude),
    lng: String(longitude),
  });

  return request(
    `/roads/snap?${params.toString()}`
  );
}

/**
 * Find the nearest road to a coordinate.
 *
 * Backend endpoint:
 *
 * GET /roads/nearest
 *
 * Required query parameters:
 * lat
 * lng
 */
export async function findNearestRoad(
  latitude,
  longitude
) {
  const params = new URLSearchParams({
    lat: String(latitude),
    lng: String(longitude),
  });

  return request(
    `/roads/nearest?${params.toString()}`
  );
}

/* ==========================================================
   AUDITS
========================================================== */

/**
 * Create a new road safety audit.
 *
 * Backend endpoint:
 *
 * POST /audits
 */
export async function createAudit(
  auditData
) {
  return request(
    "/audits",
    {
      method: "POST",
      body: JSON.stringify(auditData),
    }
  );
}

/**
 * Get all audits.
 *
 * Backend endpoint:
 *
 * GET /audits
 */
export async function getAudits() {
  return request("/audits");
}

/**
 * Get a single audit.
 *
 * Backend endpoint:
 *
 * GET /audits/{audit_id}
 */
export async function getAudit(
  auditId
) {
  return request(
    `/audits/${auditId}`
  );
}

/**
 * Process an existing audit.
 *
 * Backend endpoint:
 *
 * POST /audits/{audit_id}/process
 *
 * The backend gets the audit coordinates,
 * radius and road class from the stored Audit.
 */
export async function processAudit(
  auditId
) {
  return request(
    `/audits/${auditId}/process`,
    {
      method: "POST",
    }
  );
}

/**
 * Update audit status.
 *
 * Backend endpoint:
 *
 * PATCH /audits/{audit_id}/status
 */
export async function updateAuditStatus(
  auditId,
  status
) {
  const params = new URLSearchParams({
    status_value: status,
  });

  return request(
    `/audits/${auditId}/status?${params.toString()}`,
    {
      method: "PATCH",
    }
  );
}

/**
 * Update compliance score.
 *
 * Backend endpoint:
 *
 * PATCH /audits/{audit_id}/score
 */
export async function updateComplianceScore(
  auditId,
  score
) {
  const params = new URLSearchParams({
    compliance_score: String(score),
  });

  return request(
    `/audits/${auditId}/score?${params.toString()}`,
    {
      method: "PATCH",
    }
  );
}

/**
 * Delete an audit.
 *
 * Backend endpoint:
 *
 * DELETE /audits/{audit_id}
 */
export async function deleteAudit(
  auditId
) {
  return request(
    `/audits/${auditId}`,
    {
      method: "DELETE",
    }
  );
}

/* ==========================================================
   SEGMENTS
========================================================== */

/**
 * Get a single segment.
 *
 * Backend endpoint:
 *
 * GET /segments/{segment_id}
 */
export async function getSegment(
  segmentId
) {
  return request(
    `/segments/${segmentId}`
  );
}

/**
 * Get all segments belonging to an audit.
 *
 * Backend endpoint:
 *
 * GET /segments/audit/{audit_id}
 */
export async function getAuditSegments(
  auditId
) {
  return request(
    `/segments/audit/${auditId}`
  );
}

/* ==========================================================
   CHECKLIST
========================================================== */

/**
 * Get a single checklist item.
 *
 * Backend endpoint:
 *
 * GET /checklist/{item_id}
 */
export async function getChecklistItem(
  itemId
) {
  return request(
    `/checklist/${itemId}`
  );
}

/**
 * Get all checklist items for an audit.
 *
 * Backend endpoint:
 *
 * GET /checklist/audit/{audit_id}
 */
export async function getAuditChecklist(
  auditId
) {
  return request(
    `/checklist/audit/${auditId}`
  );
}

/**
 * Get checklist items for a segment.
 *
 * Backend endpoint:
 *
 * GET /checklist/segment/{segment_id}
 */
export async function getSegmentChecklist(
  segmentId
) {
  return request(
    `/checklist/segment/${segmentId}`
  );
}