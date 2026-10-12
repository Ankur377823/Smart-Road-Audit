export function formatRadius(meters) {
  if (meters == null) return '-'
  return meters >= 1000 ? `${meters / 1000} km` : `${meters} m`
}

export function formatDate(date, { withTime = false } = {}) {
  if (!date) return '-'
  return new Date(date).toLocaleString(
    'en-IN',
    withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { day: '2-digit', month: 'short', year: 'numeric' }
  )
}

export function formatScore(score) {
  return typeof score === 'number' ? `${Math.round(score * 10) / 10}/100` : 'Pending'
}
