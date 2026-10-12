export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

/** Formats coordinates with hemisphere letters, e.g. 12.97160°N, 77.59460°E */
export function formatCoord(lat, lng, digits = 5) {
  if (lat == null || lng == null) return 'No location'
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lng >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(digits)}°${ns}, ${Math.abs(lng).toFixed(digits)}°${ew}`
}
