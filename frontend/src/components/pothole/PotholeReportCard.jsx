import { useEffect, useRef, useState } from 'react'
import { getAuditPotholes } from '../../services/potholeApi'
import { GOOGLE_MAP_ID, loadGoogleMaps } from '../../services/googleMaps'
import { formatCoord } from './geo'
import { SEVERITY_TONE } from './severity'
import { Badge, Section } from '../common/ui'
import { IconClose, IconFileText, IconScan } from '../common/Icons'
import { DEFAULT_CARRIAGEWAY_WIDTH_M, defaultCategoryForRoadClass, IRC_CLASS_LABEL, ROAD_CATEGORIES } from '../../ml/pothole/irc82'
import { computeSectionRating, openPotholeReport, openReportWindow } from '../../utils/potholeReport'
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

const RISK_TONE = { 'Very High': 'red', High: 'orange', Medium: 'amber' }

/** Normalises a saved pothole record for the PDF report and section rating. */
function recordToReport(item) {
  return {
    severity: item.severity,
    riskLevel: item.risk_level,
    actionPriority: item.action_priority,
    depthMm: item.depth_cm != null ? item.depth_cm * 10 : null,
    depthSource: item.depth_source,
    widthMm: item.width_mm,
    areaM2: item.area_m2,
    confidence: item.confidence,
    latitude: item.snapped_latitude ?? item.latitude,
    longitude: item.snapped_longitude ?? item.longitude,
    locationSource: item.location_source,
    gpsAccuracy: item.gps_accuracy_m,
    speedKmh: item.speed_kmh,
    detectedAt: item.detected_at,
    snapshot: item.snapshot_image,
  }
}

function PotholeReportCard({ auditId, auditTitle, roadClass, surveyLengthM, onOpenScanner = () => {} }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [previewImage, setPreviewImage] = useState(null)
  const [category, setCategory] = useState(() => defaultCategoryForRoadClass(roadClass))
  const [carriagewayWidthM, setCarriagewayWidthM] = useState(DEFAULT_CARRIAGEWAY_WIDTH_M)
  const [reportBusy, setReportBusy] = useState(false)
  const [reportError, setReportError] = useState('')

  useEffect(() => {
    if (!auditId) return

    setLoading(true)
    getAuditPotholes(auditId)
      .then((res) => setData(res))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [auditId])

  const potholes = data?.detections || []
  const reportPotholes = potholes.map(recordToReport)
  const survey = surveyLengthM ? { lengthM: surveyLengthM, widthM: carriagewayWidthM, category } : null
  const section = survey ? computeSectionRating(reportPotholes, survey) : null

  const handleReport = async () => {
    const target = openReportWindow()
    setReportBusy(true)
    setReportError('')
    try {
      await openPotholeReport({
        title: auditTitle || `Audit #${auditId}`,
        subtitle: survey
          ? `Surveyed length ${Math.round(surveyLengthM)} m (audited road segments) · ${carriagewayWidthM} m carriageway`
          : undefined,
        potholes: reportPotholes,
        survey,
        target,
      })
    } catch (err) {
      target?.close()
      setReportError(err.message || 'Could not create the report.')
    } finally {
      setReportBusy(false)
    }
  }

  return (
    <Section
      title="Potholes"
      description="Surface defects recorded with the pothole scanner."
      actions={
        <>
          {potholes.length > 0 && (
            <button type="button" onClick={handleReport} disabled={reportBusy} className="btn btn-primary">
              <IconFileText className="size-4" />
              {reportBusy ? 'Creating PDF…' : 'PDF report'}
            </button>
          )}
          <button type="button" onClick={() => onOpenScanner(auditId)} className="btn btn-secondary">
            <IconScan className="size-4" />
            Scan potholes
          </button>
        </>
      }
    >
      {loading ? (
        <p className="px-6 py-10 text-center text-sm text-slate-500">Loading pothole records…</p>
      ) : (
        <div className="p-4 sm:p-6">
          <div className="grid grid-cols-4 gap-2 text-center">
            {[
              ['Total', data?.total_potholes],
              ['Large', data?.severe_count],
              ['Medium', data?.moderate_count],
              ['Small', data?.minor_count],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-slate-50 p-3">
                <p className="text-xl font-bold tabular-nums text-slate-900">{value || 0}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            ))}
          </div>

          {reportError && <p className="mt-3 text-sm text-red-600">{reportError}</p>}

          {potholes.length > 0 && (
            <div className="mt-4 rounded-lg border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">IRC:82 pothole rating</p>
                  <p className="text-xs text-slate-500">Pothole area as % of the surveyed carriageway ({ROAD_CATEGORIES[category].table})</p>
                </div>
                {section ? (
                  <div className="text-right">
                    <p className="text-lg font-bold text-slate-900">
                      {section.rating} <span className="text-sm font-medium text-slate-500">– {section.condition}</span>
                    </p>
                    <p className="text-xs text-slate-500">{section.areaPercent.toFixed(3)}% of surface</p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Needs surveyed road length</p>
                )}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Road category</span>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className="input mt-1 py-2">
                    {Object.entries(ROAD_CATEGORIES).map(([key, cat]) => (
                      <option key={key} value={key}>{cat.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-slate-600">Carriageway width (m)</span>
                  <input
                    type="number"
                    min="2"
                    max="40"
                    step="0.5"
                    inputMode="decimal"
                    value={carriagewayWidthM}
                    onChange={(e) => setCarriagewayWidthM(Math.max(2, Number(e.target.value) || DEFAULT_CARRIAGEWAY_WIDTH_M))}
                    className="input mt-1 py-2"
                  />
                </label>
              </div>
              {section && (
                <p className="mt-2 text-xs text-slate-500">
                  {section.potholeArea.toFixed(2)} m² of potholes over {Math.round(surveyLengthM)} m of audited road.
                  {section.unmeasured > 0 && ` ${section.unmeasured} pothole(s) without a measured area are excluded.`}
                  {' '}Assumes the whole audited length was scanned.
                </p>
              )}
            </div>
          )}

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
                      <span className="absolute right-2 top-2 flex gap-1">
                        <Badge tone={SEVERITY_TONE[item.severity]}>{IRC_CLASS_LABEL[item.severity] || item.severity}</Badge>
                      </span>
                    </button>
                    <div className="p-3 text-xs text-slate-600">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-slate-900">Pothole {potholes.length - index}</span>
                        <span>{Math.round(item.confidence * 100)}% conf.</span>
                      </div>
                      {item.risk_level && (
                        <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <Badge tone={RISK_TONE[item.risk_level]}>{item.risk_level} risk</Badge>
                          <span className="font-medium text-slate-700">{item.action_priority}</span>
                        </p>
                      )}
                      <p className="mt-1">
                        Depth {item.depth_cm != null ? `${Math.round(item.depth_cm * 10)} mm` : 'N/A'}
                        {item.depth_cm != null && ` (${item.depth_source === 'measured' ? 'measured' : 'est.'})`}
                        {' · '}Width {item.width_mm != null ? `${Math.round(item.width_mm)} mm` : 'N/A'}
                        {item.area_m2 != null && ` · ${item.area_m2} m²`}
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
