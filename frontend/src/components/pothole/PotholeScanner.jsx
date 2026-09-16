import { useCallback, useEffect, useRef, useState } from 'react'
import PotholeCanvasOverlay from './PotholeCanvasOverlay'
import { detectPotholes, savePotholesToAudit } from '../../services/potholeApi'
import './pothole.css'

function PotholeScanner({ audits = [], currentAuditId = null, onSaved = () => {}, onBack = () => {} }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const processingRef = useRef(false)

  // Camera & Device State
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState(null)
  const [facingMode, setFacingMode] = useState('environment')

  // Detection Sensitivity / Confidence Filter
  const [confThreshold, setConfThreshold] = useState(0.70)

  // Live Telemetry & GPS
  const [gps, setGps] = useState({ lat: null, lng: null, speedKmh: null, accuracy: null })
  const [fps, setFps] = useState(0)

  // Detections & Overlays
  const [currentDetections, setCurrentDetections] = useState([])
  const [modelMode, setModelMode] = useState('')
  const [videoDims, setVideoDims] = useState({ width: 640, height: 480 })

  // Session Recorded Potholes (with OpenCV Depth and Risk)
  const [sessionPotholes, setSessionPotholes] = useState([])
  const [selectedAuditId, setSelectedAuditId] = useState(currentAuditId || (audits[0]?.id ?? ''))
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')

  // -------------------------------------------------------------
  // 1. Synchronous Camera & Stream Teardown
  // -------------------------------------------------------------
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((track) => {
          track.stop()
          track.enabled = false
        })
      } catch (e) {
        console.warn('Error stopping tracks:', e)
      }
      streamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setCameraActive(false)
  }, [])

  const handleExit = () => {
    stopCamera()
    onBack()
  }

  // Ensure camera shuts down when leaving component
  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [stopCamera])

  // -------------------------------------------------------------
  // 2. Geolocation Tracking
  // -------------------------------------------------------------
  useEffect(() => {
    if (!('geolocation' in navigator)) return

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGps({
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
          speedKmh: pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : null,
          accuracy: Math.round(pos.coords.accuracy),
        })
      },
      (err) => {
        console.warn('Geolocation notice:', err.message)
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  // -------------------------------------------------------------
  // 3. Live Webcam & Camera Launcher
  // -------------------------------------------------------------
  const startCamera = useCallback(async () => {
    setCameraError(null)
    stopCamera()

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera API is not supported in this browser. Please use Google Chrome or Edge.')
      return
    }

    let stream = null

    // Attempt 1: Try requested facing mode (ideal for mobile road cam)
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
        },
        audio: false,
      })
    } catch (e1) {
      console.warn('Attempt 1 with facingMode failed, falling back to standard webcam:', e1.message)

      // Attempt 2: Universal laptop webcam fallback
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        })
      } catch (e2) {
        console.error('All camera attempts failed:', e2)
        if (e2.name === 'NotAllowedError' || e2.name === 'PermissionDeniedError') {
          setCameraError('Camera access blocked. Click the lock icon next to the URL bar and set Camera to "Allow".')
        } else {
          setCameraError(`Camera error (${e2.name}): ${e2.message}`)
        }
        setCameraActive(false)
        return
      }
    }

    if (stream) {
      streamRef.current = stream
      setCameraActive(true)

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.play().catch((e) => console.warn('Play error:', e))
        setVideoDims({
          width: videoRef.current.videoWidth || 640,
          height: videoRef.current.videoHeight || 480,
        })
      }
    }
  }, [facingMode, stopCamera])

  // Bind video element whenever stream is active
  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current
      }
      videoRef.current.play().catch((e) => console.warn('Play attempt:', e))
    }
  }, [cameraActive])

  const gpsRef = useRef(gps)
  gpsRef.current = gps
  const confRef = useRef(confThreshold)
  confRef.current = confThreshold
  const selectedAuditIdRef = useRef(selectedAuditId)
  selectedAuditIdRef.current = selectedAuditId

  // -------------------------------------------------------------
  // 4. Real-Time Inference Loop with Confidence Threshold
  // -------------------------------------------------------------
  useEffect(() => {
    if (!cameraActive) return

    let isMounted = true
    let frameCount = 0
    let lastFpsTime = performance.now()

    const intervalId = setInterval(async () => {
      if (processingRef.current || !videoRef.current || videoRef.current.readyState < 2) return

      const video = videoRef.current
      if (!video) return

      const w = video.videoWidth || 640
      const h = video.videoHeight || 480
      const offscreenW = Math.min(640, w)
      const offscreenH = Math.round((offscreenW / w) * h)

      try {
        const offscreen = document.createElement('canvas')
        offscreen.width = offscreenW
        offscreen.height = offscreenH
        const ctx = offscreen.getContext('2d')
        if (!ctx) return

        ctx.drawImage(video, 0, 0, offscreen.width, offscreen.height)
        const frameBase64 = offscreen.toDataURL('image/jpeg', 0.7)

        if (!frameBase64) return

        if (videoDims.width !== offscreenW || videoDims.height !== offscreenH) {
          setVideoDims({ width: offscreenW, height: offscreenH })
        }

        processingRef.current = true

        const currentGps = gpsRef.current || {}
        const currentConf = confRef.current ?? 0.70
        const currentAudit = selectedAuditIdRef.current

        const response = await detectPotholes({
          imageBase64: frameBase64,
          confThreshold: currentConf,
          latitude: currentGps.lat,
          longitude: currentGps.lng,
          speedKmh: currentGps.speedKmh,
          auditId: currentAudit ? Number(currentAudit) : null,
        })

        if (!isMounted) return

        setCurrentDetections(Array.isArray(response?.detections) ? response.detections : [])
        setModelMode(response?.model_mode || '')

        // Calculate FPS
        frameCount++
        const now = performance.now()
        if (now - lastFpsTime >= 1000) {
          setFps(Math.round((frameCount * 1000) / (now - lastFpsTime)))
          frameCount = 0
          lastFpsTime = now
        }

        // Add verified potholes to session list
        if (response?.detections && Array.isArray(response.detections) && response.detections.length > 0) {
          setSessionPotholes((prev) => {
            const newEntries = []
            response.detections.forEach((det) => {
              if (!det) return
              const isRecent = (prev || []).some(
                (p) => Date.now() - (p.timestamp || 0) < 3000 && p.severity === det.severity
              )
              if (!isRecent) {
                newEntries.push({
                  id: `pothole-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                  latitude: Number(currentGps.lat || 12.9716),
                  longitude: Number(currentGps.lng || 77.5946),
                  speedKmh: currentGps.speedKmh ?? null,
                  confidence: Number(det.confidence || 0.85),
                  severity: String(det.severity || 'moderate'),
                  depth_cm: Number(det.depth_cm || 3.5),
                  risk_score: Number(det.risk_score || 50.0),
                  area_ratio: Number(det.area_ratio || 0.0),
                  polygon: Array.isArray(det.polygon) ? det.polygon : [],
                  snapshot: frameBase64,
                  timestamp: Date.now(),
                })
              }
            })
            return newEntries.length ? [...prev, ...newEntries] : prev
          })
        }
      } catch (err) {
        console.warn('Detection error:', err.message)
      } finally {
        processingRef.current = false
      }
    }, 400)

    return () => {
      isMounted = false
      clearInterval(intervalId)
    }
  }, [cameraActive])

  // -------------------------------------------------------------
  // 5. Save Session Detections to Audit Report
  // -------------------------------------------------------------
  const handleSaveToAudit = async () => {
    if (!selectedAuditId) {
      alert('Please select an Audit from the dropdown to attach these detections to.')
      return
    }

    if (sessionPotholes.length === 0) {
      alert('No potholes detected in this session yet. Point camera at road pavement to detect.')
      return
    }

    setSaving(true)
    setSaveMessage('')

    try {
      await savePotholesToAudit(selectedAuditId, sessionPotholes)
      setSaveMessage(`Successfully added ${sessionPotholes.length} pothole detections to Audit #${selectedAuditId}!`)
      onSaved(selectedAuditId)
    } catch (err) {
      alert(`Save error: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const handleClearSession = () => {
    setSessionPotholes([])
    setCurrentDetections([])
    setSaveMessage('')
  }

  const severeCount = sessionPotholes.filter((p) => p.severity === 'severe').length
  const moderateCount = sessionPotholes.filter((p) => p.severity === 'moderate').length
  const minorCount = sessionPotholes.filter((p) => p.severity === 'minor').length

  return (
    <div className="pothole-scanner-root">
      {/* Top Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <button
            onClick={handleExit}
            className="text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-white flex items-center gap-1.5 transition"
          >
            ← Back to workspace
          </button>
          <h1 className="mt-1 text-2xl font-bold text-white flex items-center gap-3">
            <span>YOLO Live Road Scanner</span>
            <span className="rounded-full bg-emerald-500/10 px-3 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
              OpenCV Depth & Risk Active
            </span>
          </h1>
        </div>

        {/* Audit Association Selector & Sensitivity */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-300">
            <span>Confidence Filter:</span>
            <input
              type="range"
              min="0.40"
              max="0.85"
              step="0.05"
              value={confThreshold}
              onChange={(e) => setConfThreshold(Number(e.target.value))}
              className="w-24 accent-sky-400 cursor-pointer"
            />
            <strong className="text-sky-400 min-w-[32px] text-right font-mono">
              {Math.round(confThreshold * 100)}%
            </strong>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">Target Audit:</label>
            <select
              value={selectedAuditId}
              onChange={(e) => setSelectedAuditId(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-sky-500 outline-none"
            >
              {(audits || []).map((a) => (
                <option key={a.id} value={a.id}>
                  Audit #{a.id} ({a.road_class || 'road'} - {a.status || 'saved'})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Viewfinder Card */}
      <div className="scanner-viewfinder-card">
        {/* Live Camera Video Feed (always mounted so ref is never null) */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`scanner-video-feed ${cameraActive ? 'block' : 'hidden'}`}
        />

        {/* Real-time Neon Polygon Overlay */}
        {cameraActive && (
          <>
            <PotholeCanvasOverlay
              detections={currentDetections}
              frameWidth={videoDims.width}
              frameHeight={videoDims.height}
            />
            <div className="scanner-reticle" />
          </>
        )}

        {/* Camera Off / Standby State */}
        {!cameraActive && (
          <div className="text-center p-8 max-w-md">
            <div className="mx-auto w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center text-2xl mb-4">
              📷
            </div>
            <h3 className="text-lg font-semibold text-white">Road Camera Standby</h3>
            <p className="mt-2 text-sm text-slate-400 leading-relaxed">
              {cameraError || 'Click below to launch your camera and start scanning road potholes with real-time OpenCV depth estimation.'}
            </p>

            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={startCamera}
                className="scanner-ctrl-btn primary justify-center"
              >
                Launch Webcam / Camera
              </button>
            </div>
          </div>
        )}

        {/* Scanner HUD Top */}
        {cameraActive && (
          <div className="scanner-hud-top">
            <div className="flex flex-wrap items-center gap-2">
              <span className="hud-badge live">
                <span className="pulse-dot" /> LIVE SCANNING
              </span>
              <span className="hud-badge">
                FPS: <strong className="text-sky-400">{fps || 2}</strong>
              </span>
              {modelMode && (
                <span className="hud-badge text-[11px] text-slate-300">
                  Model: <strong className="text-emerald-400">{modelMode.split(' ')[0]}</strong>
                </span>
              )}
            </div>

            {/* GPS Telemetry HUD */}
            <div className="flex flex-col items-end gap-1 text-right">
              <span className="hud-badge font-mono text-xs">
                📍 {gps.lat ? `${gps.lat}°N, ${gps.lng}°E` : '12.9716°N, 77.5946°E'}
              </span>
              {gps.speedKmh !== null && (
                <span className="hud-badge text-xs">
                  SPEED: <strong className="text-amber-400">{gps.speedKmh} km/h</strong>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Scanner HUD Bottom Controls */}
        {cameraActive && (
          <div className="scanner-hud-bottom">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
                className="scanner-ctrl-btn"
                title="Switch between front and rear camera"
              >
                🔄 Flip Cam
              </button>
              <button
                onClick={stopCamera}
                className="scanner-ctrl-btn text-rose-400 hover:text-rose-300"
              >
                ⏹ Stop Camera
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="hud-badge">
                Detections:{' '}
                <strong className="text-sky-300 ml-1">{sessionPotholes.length}</strong>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Session Potholes Summary & Save Bar */}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        {/* Left: Live Captured Evidence Gallery with Depth and Risk */}
        <div className="dashboard-panel">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Live Detected Potholes</h2>
              <p className="text-xs text-slate-400">Potholes detected with OpenCV depth and risk scores.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="severity-pill severe">{severeCount} Severe</span>
                <span className="severity-pill moderate">{moderateCount} Moderate</span>
                <span className="severity-pill minor">{minorCount} Minor</span>
              </div>
              {sessionPotholes.length > 0 && (
                <button
                  onClick={handleClearSession}
                  className="text-xs text-slate-500 hover:text-rose-400 transition"
                  title="Clear all recorded potholes in this session"
                >
                  Clear List
                </button>
              )}
            </div>
          </div>

          {sessionPotholes.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              Point camera at road surface to detect potholes. (Filter threshold: {Math.round(confThreshold * 100)}%)
            </div>
          ) : (
            <div className="mt-4 space-y-3 max-h-80 overflow-y-auto pr-1">
              {sessionPotholes.map((item, idx) => {
                if (!item) return null
                const lat = Number(item.latitude ?? 0).toFixed(4)
                const lng = Number(item.longitude ?? 0).toFixed(4)
                const conf = (Number(item.confidence ?? 0) * 100).toFixed(0)
                const depth = Number(item.depth_cm ?? 0).toFixed(1)
                const risk = Math.round(Number(item.risk_score ?? 0))
                const sev = String(item.severity || 'moderate').toLowerCase()

                return (
                  <div key={item.id || idx} className="detection-item-card">
                    {item.snapshot ? (
                      <img
                        src={item.snapshot}
                        alt="Pothole Snapshot"
                        className="w-20 h-14 object-cover rounded-lg border border-slate-700"
                      />
                    ) : (
                      <div className="w-20 h-14 rounded-lg bg-slate-800 flex items-center justify-center text-xs text-slate-500">
                        No img
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white text-sm">
                          Incident #{sessionPotholes.length - idx}
                        </span>
                        <span className={`severity-pill ${sev}`}>{sev}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-xs">
                        <span className="text-amber-300 font-semibold">
                          Depth: {depth} cm
                        </span>
                        <span className="text-sky-300 font-mono">
                          Risk: {risk}/100
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 font-mono">
                        📍 {lat}, {lng} • Conf: {conf}%
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right: Commit to Report Card */}
        <div className="dashboard-panel flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Audit Report Integration</h2>
            <p className="text-xs text-slate-400 mt-1">
              Commit these live detections and depth calculations directly into your audit report.
            </p>

            <div className="mt-6 space-y-3">
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <p className="text-xs text-slate-400">Total Incidents Ready</p>
                <p className="text-2xl font-bold text-sky-400 mt-1">{sessionPotholes.length}</p>
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <p className="text-xs text-slate-400">Destination</p>
                <p className="text-sm font-semibold text-white mt-1">
                  {selectedAuditId ? `Audit Record #${selectedAuditId}` : 'No Audit Selected'}
                </p>
              </div>
            </div>

            {saveMessage && (
              <div className="mt-4 p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-300">
                ✓ {saveMessage}
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800 flex items-center gap-3">
            <button
              onClick={handleSaveToAudit}
              disabled={saving || sessionPotholes.length === 0 || !selectedAuditId}
              className="scanner-ctrl-btn primary w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Adding to Report...' : 'Add Detections to Audit Report →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PotholeScanner
