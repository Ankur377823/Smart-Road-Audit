export function formatRadius(meters) {
  if (meters == null) return '-'
  return meters >= 1000 ? `${meters / 1000} km` : `${meters} m`
}

/**
 * Parses an API timestamp. The server stores times in UTC; some columns come back without a time zone
 * ("2026-11-11T06:14:01"), which browsers would otherwise read as local time.
 */
export function parseApiDate(date) {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+$/.test(date)) return new Date(`${date}Z`)
  return new Date(date)
}

export function formatDate(date, { withTime = false } = {}) {
  if (!date) return '-'
  return parseApiDate(date).toLocaleString(
    'en-IN',
    withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { day: '2-digit', month: 'short', year: 'numeric' }
  )
}

export function formatScore(score) {
  return typeof score === 'number' ? `${Math.round(score * 10) / 10}/100` : 'Pending'
}
