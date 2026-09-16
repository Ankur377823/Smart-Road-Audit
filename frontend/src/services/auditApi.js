// const API_BASE_URL = 'http://127.0.0.1:8000'

// async function parseResponse(response, fallbackMessage) {
//   const data = await response.json()
//   if (!response.ok) {
//     throw new Error(data.detail || fallbackMessage)
//   }
//   return data
// }

// export async function listAudits() {
//   const response = await fetch(`${API_BASE_URL}/audits`)
//   return parseResponse(response, 'Could not load audits')
// }

// export async function createAudit(payload) {
//   const response = await fetch(`${API_BASE_URL}/audits`, {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify(payload),
//   })
//   return parseResponse(response, 'Audit request failed')
// }

// export async function getAudit(auditId) {
//   const response = await fetch(`${API_BASE_URL}/audits/${auditId}`)
//   return parseResponse(response, 'Could not load audit details')
// }
