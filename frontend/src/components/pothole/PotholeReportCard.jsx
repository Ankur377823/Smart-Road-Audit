import { useEffect, useState } from 'react'
import { getAuditPotholes } from '../../services/potholeApi'
import './pothole.css'

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

  if (loading) {
    return (
      <div className="dashboard-panel mt-6 text-sm text-slate-400">
        Loading pavement pothole records...
      </div>
    )
  }

  const potholes = data?.detections || []

  return (
    <div className="dashboard-panel mt-6">
      {/* Header & Quick Action */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg">🕳️</span>
            <h3 className="text-xl font-bold text-white">Pothole & Surface Distress Report</h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            YOLO AI Computer Vision screening for Audit #{auditId}
          </p>
        </div>

        <button
          onClick={() => onOpenScanner(auditId)}
          className="scanner-ctrl-btn primary text-xs"
        >
          📷 Open Live Pothole Scanner
        </button>
      </div>

      {/* Breakdown Metrics */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
          <p className="text-xs text-slate-400">Total Recorded</p>
          <p className="mt-1 text-2xl font-bold text-white">{data?.total_potholes || 0}</p>
        </div>
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3">
          <p className="text-xs text-rose-300">Severe</p>
          <p className="mt-1 text-2xl font-bold text-rose-400">{data?.severe_count || 0}</p>
        </div>
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
          <p className="text-xs text-amber-300">Moderate</p>
          <p className="mt-1 text-2xl font-bold text-amber-400">{data?.moderate_count || 0}</p>
        </div>
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3">
          <p className="text-xs text-emerald-300">Minor</p>
          <p className="mt-1 text-2xl font-bold text-emerald-400">{data?.minor_count || 0}</p>
        </div>
      </div>

      {/* Snapshots Evidence Gallery */}
      {potholes.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-800 p-8 text-center">
          <p className="text-sm text-slate-400">No potholes currently logged for this audit.</p>
          <button
            onClick={() => onOpenScanner(auditId)}
            className="mt-4 text-xs font-semibold text-sky-400 hover:text-sky-300"
          >
            + Start a camera drive scan to detect potholes →
          </button>
        </div>
      ) : (
        <div className="pothole-report-grid">
          {potholes.map((item, index) => (
            <div key={item.id || index} className="pothole-evidence-card">
              <div
                className="pothole-thumb-wrap cursor-pointer"
                onClick={() => item.snapshot_image && setPreviewImage(item.snapshot_image)}
              >
                {item.snapshot_image ? (
                  <img
                    src={item.snapshot_image}
                    alt={`Pothole detection #${index + 1}`}
                    className="pothole-thumb"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-slate-900 text-xs text-slate-500">
                    No snapshot recorded
                  </div>
                )}
                <div className="absolute top-2 right-2">
                  <span className={`severity-pill ${item.severity}`}>{item.severity}</span>
                </div>
              </div>

              <div className="p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-200">Incident #{index + 1}</span>
                  <span className="text-slate-400 font-mono">
                    {(item.confidence * 100).toFixed(0)}% conf
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-amber-300">
                    Depth: {item.depth_cm ? `${item.depth_cm} cm` : '3.5 cm'}
                  </span>
                  <span className="font-mono text-sky-400">
                    Risk: {item.risk_score ? `${Math.round(item.risk_score)}/100` : '50/100'}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-slate-400 font-mono">
                  📍 {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
                </div>
                <div className="mt-1 text-[10px] text-slate-500">
                  {new Date(item.detected_at).toLocaleTimeString()} • Speed:{' '}
                  {item.speed_kmh ? `${item.speed_kmh} km/h` : 'N/A'}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox Modal for snapshot preview */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-3xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 p-2 shadow-2xl">
            <img src={previewImage} alt="Pothole Full Zoom" className="max-h-[80vh] w-auto rounded-xl" />
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-4 right-4 rounded-full bg-slate-900/80 px-3 py-1 text-xs font-bold text-white hover:bg-slate-800"
            >
              ✕ Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default PotholeReportCard
