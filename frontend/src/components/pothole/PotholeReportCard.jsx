import { useEffect, useRef, useState } from 'react'
import { getAuditPotholes } from '../../services/potholeApi'
import { GOOGLE_MAP_ID, loadGoogleMaps } from '../../services/googleMaps'
import { formatCoord } from './geo'
import { SEVERITY_TONE } from './severity'
import { Badge, Section } from '../common/ui'
import { IconClose, IconScan } from '../common/Icons'
import './pothole.css'

const SEVERITY_PIN = {
  severe: { background: '#ef4444', borderColor: '#991b1b' },
  moderate: { background: '#f59e0b', borderColor: '#92400e' },
  minor: { background: '#38bdf8', borderColor: '#075985' },
}

function potholePosition(item) {
  const lat = item.snapped_latitude ?? item.latitude
  const lng = item.snapped_longitude ?? item.longitude
  return lat != null && lng != null ? { lat, lng } : null
}

/**
 * Google Map with one severity-coloured marker per geotagged pothole.
 */
function PotholeMap({ potholes }) {
  const mapRef = useRef(null)
  const [error, setError] = useState('')

  const hasLocated = potholes.some((p) => potholePosition(p))

  useEffect(() => {
    const located = potholes.filter((p) => potholePosition(p))
    if (!located.length || !mapRef.current) return
    let cancelled = false
    const markers = []

    loadGoogleMaps()
      .then(async (maps) => {
        const { Map } = await maps.importLibrary('maps')
        const { AdvancedMarkerElement, PinElement } = await maps.importLibrary('marker')
        if (cancelled || !mapRef.current) return

        const map = new Map(mapRef.current, {
          mapId: GOOGLE_MAP_ID,
          center: potholePosition(located[0]),
          zoom: 16,
          streetViewControl: false,
          mapTypeControl: false,
        })
        const bounds = new window.google.maps.LatLngBounds()

        located.forEach((item, index) => {
          const position = potholePosition(item)
          bounds.extend(position)
          const pin = new PinElement({
            ...(SEVERITY_PIN[item.severity] || SEVERITY_PIN.minor),
            glyphColor: '#ffffff',
          })
          markers.push(new AdvancedMarkerElement({
            map,
            position,
            content: pin.element,
            title: `Pothole #${located.length - index}: ${item.severity}, ${item.depth_cm} cm` +
              (item.location_source === 'audit_center' ? ' (approximate location)' : ''),
          }))
        })
        if (located.length > 1) map.fitBounds(bounds, 48)
      })
      .catch((err) => !cancelled && setError(err.message || 'Unable to load map.'))

    return () => {
      cancelled = true
      markers.forEach((m) => { m.map = null })
    }
  }, [potholes])

  if (!hasLocated) {
    return (
      <p className="mt-5 rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
        No geotagged potholes to map.
      </p>
    )
  }

  return error ? (
    <p className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
      Map unavailable: {error}
    </p>
  ) : (
    <div ref={mapRef} className="pothole-map mt-5" role="region" aria-label="Map of detected potholes" />
  )
}

function PotholeReportCard({ auditId, onOpenScanner = () => {} }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [previewImage, setPreviewImage] = useState(null)

  useEffect(() => {
    if (!auditId) return

    setLoading(true)
    getAuditPotholes(auditId)
      .then((res) => setData(res))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [auditId])

  const potholes = data?.detections || []

  return (
    <Section
      title="Potholes"
      description="Surface defects recorded with the pothole scanner."
      actions={
        <button type="button" onClick={() => onOpenScanner(auditId)} className="btn btn-secondary">
          <IconScan className="size-4" />
          Scan potholes
        </button>
      }
    >
      {loading ? (
        <p className="px-6 py-10 text-center text-sm text-slate-500">Loading pothole records…</p>
      ) : (
        <div className="p-4 sm:p-6">
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              ['Total', data?.total_potholes],
              ['Severe', data?.severe_count],
              ['Moderate', data?.moderate_count],
              ['Minor', data?.minor_count],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-slate-50 p-3">
                <p className="text-xl font-bold tabular-nums text-slate-900">{value || 0}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            ))}
          </div>

          {potholes.length === 0 ? (
            <p className="mt-5 rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
              No potholes recorded for this audit yet. Use the scanner while driving or walking the route.
            </p>
          ) : (
            <>
              <PotholeMap potholes={potholes} />

              <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {potholes.map((item, index) => (
                  <li key={item.id || index} className="overflow-hidden rounded-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() => item.snapshot_image && setPreviewImage(item.snapshot_image)}
                      disabled={!item.snapshot_image}
                      className="relative block h-36 w-full bg-slate-100"
                      aria-label={item.snapshot_image ? `View photo of pothole ${potholes.length - index}` : undefined}
                    >
                      {item.snapshot_image ? (
                        <img src={item.snapshot_image} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs text-slate-400">No photo</span>
                      )}
                      <span className="absolute right-2 top-2">
                        <Badge tone={SEVERITY_TONE[item.severity]}>{item.severity}</Badge>
                      </span>
                    </button>
                    <div className="p-3 text-xs text-slate-600">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-900">Pothole {potholes.length - index}</span>
                        <span>{Math.round(item.confidence * 100)}% conf.</span>
                      </div>
                      <p className="mt-1">
                        Depth {item.depth_cm != null ? `${Number(item.depth_cm).toFixed(1)} cm` : 'N/A'} · Risk{' '}
                        {item.risk_score != null ? `${Math.round(item.risk_score)}/100` : 'N/A'}
                      </p>
                      <p className="mt-1 truncate font-mono text-slate-500">
                        {formatCoord(item.snapped_latitude ?? item.latitude, item.snapped_longitude ?? item.longitude)}
                        {item.location_source === 'gps' && item.gps_accuracy_m != null && ` ±${Math.round(item.gps_accuracy_m)} m`}
                        {item.location_source === 'audit_center' && <span className="font-sans text-amber-700"> (approx.)</span>}
                      </p>
                      <p className="mt-1 text-slate-500">
                        {new Date(item.detected_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                        {item.speed_kmh != null && ` · ${Math.round(item.speed_kmh)} km/h`}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4"
          onClick={() => setPreviewImage(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Pothole photo"
        >
          <div className="relative">
            <img src={previewImage} alt="Pothole" className="max-h-[80vh] w-auto rounded-lg" />
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute right-2 top-2 rounded-full bg-slate-900/80 p-2 text-white hover:bg-slate-900"
              aria-label="Close photo"
            >
              <IconClose className="size-4" />
            </button>
          </div>
        </div>
      )}
    </Section>
  )
}

export default PotholeReportCard
