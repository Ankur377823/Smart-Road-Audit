import { useCallback, useEffect, useRef, useState } from 'react'
import PotholeCanvasOverlay from './PotholeCanvasOverlay'
import { detectPotholes, savePotholesToAudit } from '../../services/potholeApi'
import { distanceMeters, formatCoord } from './geo'
import { detectOnDevice, isOnDeviceSupported, loadOnDeviceDetector } from '../../ml/pothole/onDeviceDetector'
import './pothole.css'

// On-device inference is paced by the worker; server round-trips are throttled harder
const INFERENCE_INTERVAL_MS = { device: 120, server: 400 }
const SIMULATION_MODE = 'simulation_demo'
const ON_DEVICE_MODE = 'on_device_onnx'

// A GPS fix older than this is not used to geotag a pothole while moving...
const STALE_FIX_MS = 5000
// ...but a stationary device's last fix stays valid longer (phones often stop reporting when still)
const STATIONARY_FIX_MS = 30000
const STATIONARY_KMH = 5
// watchPosition only fires on movement on many phones; poll when it has been quiet this long
const GPS_HEARTBEAT_MS = 3000
// Fixes worse than this are flagged as low accuracy
const POOR_ACCURACY_M = 30
// A detection must be seen in this many frames before it is recorded (more frames at the higher on-device rate)
const CONFIRM_FRAMES = { device: 3, server: 2 }
// Tracks not seen for this long are dropped
const TRACK_TTL_MS = 1500
const TRACK_IOU_MATCH = 0.3
// Recorded potholes closer than this (metres) are treated as the same pothole
const DUPLICATE_RADIUS_M = 5

const SEVERITY_RANK = { minor: 0, moderate: 1, severe: 2 }

function iou(a, b) {
  const x1 = Math.max(a[0], b[0])
  const y1 = Math.max(a[1], b[1])
  const x2 = Math.min(a[2], b[2])
  const y2 = Math.min(a[3], b[3])
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
  return union > 0 ? inter / union : 0
}

function isFixFresh(fix, now = Date.now()) {
  if (fix.lat == null || !fix.timestamp) return false
  const maxAge = fix.speedKmh != null && fix.speedKmh < STATIONARY_KMH ? STATIONARY_FIX_MS : STALE_FIX_MS
  return now - fix.timestamp <= maxAge
}

function newId() {
  return `pothole-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Crops the detection region from the frame and draws its outline, producing a small evidence image.
 */
function cropSnapshot(source, det, color) {
  const [x1, y1, x2, y2] = det.box
  const padX = (x2 - x1) * 0.4
  const padY = (y2 - y1) * 0.4
  const sx = Math.max(0, x1 - padX)
  const sy = Math.max(0, y1 - padY)
  const sw = Math.min(source.width, x2 + padX) - sx
  const sh = Math.min(source.height, y2 + padY) - sy
  if (sw <= 0 || sh <= 0) return null

  const scale = Math.min(1, 320 / sw)
  const out = document.createElement('canvas')
  out.width = Math.round(sw * scale)
  out.height = Math.round(sh * scale)
  const ctx = out.getContext('2d')
  if (!ctx) return null

  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, out.width, out.height)
  ctx.lineWidth = 2
  ctx.strokeStyle = color
  const map = ([x, y]) => [(x - sx) * scale, (y - sy) * scale]
  if (det.polygon?.length > 2) {
    ctx.beginPath()
    det.polygon.forEach((pt, i) => {
      const [px, py] = map(pt)
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.closePath()
    ctx.stroke()
  } else {
    const [bx, by] = map([x1, y1])
    ctx.strokeRect(bx, by, (x2 - x1) * scale, (y2 - y1) * scale)
  }
  return out.toDataURL('image/jpeg', 0.75)
}

const SEVERITY_COLOR = {
  severe: 'rgb(239, 68, 68)',
  moderate: 'rgb(245, 158, 11)',
  minor: 'rgb(56, 189, 248)',
}

function PotholeScanner({ audits = [], currentAuditId = null, onSaved = () => {}, onBack = () => {} }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const processingRef = useRef(false)
  const frameCanvasRef = useRef(null)
  const watchIdRef = useRef(null)
  const heartbeatRef = useRef(null)
  const tracksRef = useRef([])
  const wakeLockRef = useRef(null)

  const isSecure = typeof window === 'undefined' || window.isSecureContext

  // Camera & Device State
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState(null)
  const [facingMode, setFacingMode] = useState('environment')

  // Detection engine: 'loading' while the on-device model downloads, then 'device' or 'server' (fallback)
  const [engine, setEngine] = useState(() => (isOnDeviceSupported() ? 'loading' : 'server'))
  const [modelProgress, setModelProgress] = useState(null)
  const [engineError, setEngineError] = useState(null)
  const [inferenceMs, setInferenceMs] = useState(null)

  // Detection Sensitivity / Confidence Filter
  const [confThreshold, setConfThreshold] = useState(0.35)

  // Live Telemetry & GPS (raw, unrounded values)
  const [gps, setGps] = useState({ lat: null, lng: null, speedKmh: null, accuracy: null, timestamp: null })
  // 'locating' | 'locked' | 'denied' | 'unavailable' | 'unsupported' | 'insecure'
  const [gpsStatus, setGpsStatus] = useState('locating')
  const [now, setNow] = useState(() => Date.now())
  const [fps, setFps] = useState(null)

  // Detections & Overlays
  const [currentDetections, setCurrentDetections] = useState([])
  const [modelMode, setModelMode] = useState('')
  const [humanWarning, setHumanWarning] = useState(null)
  const [detectError, setDetectError] = useState(null)
  const [videoDims, setVideoDims] = useState({ width: 640, height: 480 })

  // Session Recorded Potholes (with OpenCV Depth and Risk)
  const [sessionPotholes, setSessionPotholes] = useState([])
  const [selectedAuditId, setSelectedAuditId] = useState(() => {
    const match = audits.find((a) => String(a.id) === String(currentAuditId))
    if (match) return String(match.id)
    return audits[0] ? String(audits[0].id) : ''
  })
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(
    currentAuditId && !audits.some((a) => String(a.id) === String(currentAuditId))
      ? { type: 'warning', text: `Audit #${currentAuditId} was not found. Pick a target audit before saving.` }
      : null
  )

  const gpsRef = useRef(gps)
  gpsRef.current = gps

  const isSimulation = modelMode === SIMULATION_MODE
  const fixAgeMs = gps.timestamp ? now - gps.timestamp : null
  const fixIsStale = !isFixFresh(gps, now)
  const fixIsPoor = gps.accuracy != null && gps.accuracy > POOR_ACCURACY_M

  // Load the on-device model once (cached by the browser after the first visit)
  useEffect(() => {
    if (engine !== 'loading') return
    let cancelled = false
    loadOnDeviceDetector((loaded, total) => {
      if (!cancelled) setModelProgress(total ? Math.round((loaded / total) * 100) : null)
    })
      .then(() => !cancelled && setEngine('device'))
      .catch((err) => {
        console.warn('On-device detector unavailable, using server:', err.message)
        if (!cancelled) {
          setEngineError(err.message)
          setEngine('server')
        }
      })
    return () => {
      cancelled = true
    }
  }, [engine])

  // Re-render once a second so stale-fix indicators stay current
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

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

    tracksRef.current = []
    setCurrentDetections([])
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
  // 2. Real-time Device Geolocation & Movement Tracking
  // -------------------------------------------------------------
  // Fresh requests (maximumAge <= 1s) are timed on arrival: device GPS clocks can be skewed from system time.
  // Possibly-cached coarse fixes keep their own (older) timestamp so they read as stale.
  const acceptFix = useCallback((pos, mayBeCached = false) => {
    const { latitude, longitude, accuracy, speed } = pos.coords
    const timestamp = mayBeCached ? Math.min(pos.timestamp || 0, Date.now()) : Date.now()

    setGps((prev) => {
      // Don't let a coarse network fix replace a recent precise GPS fix
      const prevFresh = prev.timestamp && timestamp - prev.timestamp < STALE_FIX_MS
      if (prevFresh && prev.accuracy != null && accuracy > prev.accuracy * 1.5) {
        return prev
      }

      let speedKmh = speed != null && !Number.isNaN(speed) ? Math.round(speed * 3.6) : null
      // Many devices never report coords.speed; derive it from consecutive fixes
      if (speedKmh == null && prev.lat != null && prev.timestamp && timestamp > prev.timestamp) {
        const dt = (timestamp - prev.timestamp) / 1000
        const d = distanceMeters(prev.lat, prev.lng, latitude, longitude)
        if (dt >= 1 && d > accuracy) speedKmh = Math.round((d / dt) * 3.6)
        else if (dt >= 1) speedKmh = 0
      }

      return { lat: latitude, lng: longitude, accuracy: Math.round(accuracy), speedKmh, timestamp }
    })
    setGpsStatus('locked')
  }, [])

  const startLocationWatch = useCallback(() => {
    if (!isSecure) {
      setGpsStatus('insecure')
      return
    }
    if (!('geolocation' in navigator)) {
      setGpsStatus('unsupported')
      return
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }

    if (!gpsRef.current.timestamp) setGpsStatus('locating')

    let hasFix = false
    const onPos = (pos) => {
      hasFix = true
      acceptFix(pos)
    }

    const onErr = (err) => {
      console.warn('Geolocation notice:', err.code, err.message)
      if (err.code === 1) {
        setGpsStatus('denied')
        return
      }
      if (hasFix) return // keep last fix; staleness is shown in the UI
      if (err.code === 3) {
        // No precise fix yet: try one coarse network position so the user sees something
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            hasFix = true
            acceptFix(pos, true)
          },
          (err2) => setGpsStatus(err2.code === 1 ? 'denied' : 'unavailable'),
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
        )
      } else {
        setGpsStatus('unavailable')
      }
    }

    clearInterval(heartbeatRef.current)
    heartbeatRef.current = setInterval(() => {
      const last = gpsRef.current.timestamp
      if (last && Date.now() - last < GPS_HEARTBEAT_MS) return
      navigator.geolocation.getCurrentPosition(onPos, () => {}, {
        enableHighAccuracy: true,
        timeout: GPS_HEARTBEAT_MS,
        maximumAge: 1000,
      })
    }, GPS_HEARTBEAT_MS)

    try {
      watchIdRef.current = navigator.geolocation.watchPosition(onPos, onErr, {
        enableHighAccuracy: true,
        timeout: 20000,
        maximumAge: 0,
      })
    } catch (e) {
      console.warn('watchPosition setup failed:', e)
      setGpsStatus('unavailable')
    }
  }, [acceptFix, isSecure])

  useEffect(() => {
    startLocationWatch()
    return () => {
      clearInterval(heartbeatRef.current)
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [startLocationWatch])

  // -------------------------------------------------------------
  // 3. Live Webcam & Camera Launcher
  // -------------------------------------------------------------
  const startCamera = useCallback(async () => {
    setCameraError(null)
    stopCamera()

    if (!isSecure) {
      setCameraError('Camera and GPS require HTTPS. Open this app over https:// (or localhost) to scan.')
      return
    }

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
      }
    }
  }, [facingMode, stopCamera, isSecure])

  // Restart the stream when the camera is flipped while running
  const startCameraRef = useRef(startCamera)
  useEffect(() => {
    const changed = startCameraRef.current !== startCamera
    startCameraRef.current = startCamera
    if (changed && streamRef.current) startCamera()
  }, [startCamera])

  // Bind video element whenever stream is active
  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current
      }
      videoRef.current.play().catch((e) => console.warn('Play attempt:', e))
    }
  }, [cameraActive])

  // Keep the screen awake during a drive scan
  useEffect(() => {
    if (!cameraActive || !('wakeLock' in navigator)) return

    let released = false
    const acquire = async () => {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen')
      } catch (e) {
        console.warn('Wake lock unavailable:', e.message)
      }
    }
    const onVisibility = () => {
      if (!released && document.visibilityState === 'visible') acquire()
    }

    acquire()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      released = true
      document.removeEventListener('visibilitychange', onVisibility)
      wakeLockRef.current?.release().catch(() => {})
      wakeLockRef.current = null
    }
  }, [cameraActive])

  const confRef = useRef(confThreshold)
  confRef.current = confThreshold
  const selectedAuditIdRef = useRef(selectedAuditId)
  selectedAuditIdRef.current = selectedAuditId
  const auditsRef = useRef(audits)
  auditsRef.current = audits

  // -------------------------------------------------------------
  // 4. Real-Time Inference Loop with Temporal Confirmation
  // -------------------------------------------------------------
  useEffect(() => {
    if (!cameraActive || engine === 'loading') return

    let isMounted = true
    const confirmFrames = CONFIRM_FRAMES[engine]
    let frameCount = 0
    let lastFpsTime = performance.now()

    const resolveLocation = (fix, auditId) => {
      if (isFixFresh(fix)) {
        return { latitude: fix.lat, longitude: fix.lng, locationSource: 'gps', gpsAccuracy: fix.accuracy }
      }
      const audit = auditsRef.current.find((a) => String(a.id) === String(auditId))
      if (audit?.center_lat != null && audit?.center_lng != null) {
        return {
          latitude: Number(audit.center_lat),
          longitude: Number(audit.center_lng),
          locationSource: 'audit_center',
          gpsAccuracy: null,
        }
      }
      return { latitude: null, longitude: null, locationSource: 'none', gpsAccuracy: null }
    }

    const recordConfirmed = (confirmed, frameCanvas, fix, auditId, activeTrackIds) => {
      if (!confirmed.length) return
      // Build entries now: the shared frame canvas is overwritten by the next tick
      const loc = resolveLocation(fix, auditId)
      const candidates = confirmed.map(({ track, det }) => ({
        id: newId(),
        trackId: track.id,
        ...loc,
        speedKmh: fix.speedKmh ?? null,
        confidence: Number(det.confidence),
        severity: det.severity,
        depth_cm: Number(det.depth_cm),
        risk_score: Number(det.risk_score),
        area_ratio: Number(det.area_ratio || 0),
        box: det.box,
        polygon: Array.isArray(det.polygon) ? det.polygon : [],
        snapshot: cropSnapshot(frameCanvas, det, SEVERITY_COLOR[det.severity] || SEVERITY_COLOR.minor),
        timestamp: Date.now(),
      }))

      setSessionPotholes((prev) => {
        // Same pothole re-acquired after its track was lost: skip if a recorded GPS point is very close
        const isDuplicate = (entry) =>
          entry.locationSource === 'gps' &&
          prev.some(
            (p) =>
              p.locationSource === 'gps' &&
              !activeTrackIds.has(p.trackId) &&
              distanceMeters(p.latitude, p.longitude, entry.latitude, entry.longitude) < DUPLICATE_RADIUS_M
          )
        const additions = candidates.filter((entry) => !isDuplicate(entry))
        return additions.length ? [...prev, ...additions] : prev
      })
    }

    const intervalId = setInterval(async () => {
      if (document.hidden) return
      if (processingRef.current || !videoRef.current || videoRef.current.readyState < 2) return

      const video = videoRef.current
      const w = video.videoWidth || 640
      const h = video.videoHeight || 480
      const offscreenW = Math.min(640, w)
      const offscreenH = Math.round((offscreenW / w) * h)

      processingRef.current = true
      try {
        if (!frameCanvasRef.current) frameCanvasRef.current = document.createElement('canvas')
        const offscreen = frameCanvasRef.current
        if (offscreen.width !== offscreenW) offscreen.width = offscreenW
        if (offscreen.height !== offscreenH) offscreen.height = offscreenH
        const ctx = offscreen.getContext('2d', { willReadFrequently: engine === 'device' })
        if (!ctx) return

        ctx.drawImage(video, 0, 0, offscreenW, offscreenH)

        setVideoDims((prev) =>
          prev.width === offscreenW && prev.height === offscreenH ? prev : { width: offscreenW, height: offscreenH }
        )

        // Snapshot GPS at capture time, not when the response arrives
        const fix = gpsRef.current || {}
        const auditId = selectedAuditIdRef.current

        let response
        if (engine === 'device') {
          const result = await detectOnDevice(ctx.getImageData(0, 0, offscreenW, offscreenH), confRef.current)
          setInferenceMs(result.inferenceMs)
          response = {
            detections: result.detections,
            model_mode: ON_DEVICE_MODE,
            human_detected: result.filteredNonRoad > 0,
            warning_message: result.filteredNonRoad ? `${result.filteredNonRoad} non-road object(s) filtered` : null,
          }
        } else {
          response = await detectPotholes({
            imageBase64: offscreen.toDataURL('image/jpeg', 0.7),
            confThreshold: confRef.current,
            latitude: fix.lat,
            longitude: fix.lng,
            speedKmh: fix.speedKmh,
            auditId: auditId ? Number(auditId) : null,
          })
        }

        if (!isMounted) return

        const detections = Array.isArray(response?.detections) ? response.detections : []
        setCurrentDetections(detections)
        setModelMode(response?.model_mode || '')
        setDetectError(null)
        setHumanWarning(response?.human_detected ? response?.warning_message || 'Non-road object filtered' : null)

        // Calculate FPS
        frameCount++
        const nowPerf = performance.now()
        if (nowPerf - lastFpsTime >= 1000) {
          setFps(Math.round((frameCount * 1000) / (nowPerf - lastFpsTime)))
          frameCount = 0
          lastFpsTime = nowPerf
        }

        // Synthetic detections are never recorded
        if (response?.model_mode === SIMULATION_MODE) {
          tracksRef.current = []
          return
        }

        // Match detections to tracks across frames; record only once confirmed
        const t = Date.now()
        const tracks = tracksRef.current.filter((tr) => t - tr.lastSeen <= TRACK_TTL_MS)
        const confirmed = []
        detections.forEach((det) => {
          if (!Array.isArray(det?.box) || det.box.length !== 4) return
          let track = null
          let bestIou = TRACK_IOU_MATCH
          tracks.forEach((tr) => {
            if (tr.lastSeen === t) return // already matched in this frame
            const score = iou(tr.box, det.box)
            if (score >= bestIou) {
              track = tr
              bestIou = score
            }
          })
          if (!track) {
            track = { id: newId(), box: det.box, hits: 0, lastSeen: 0, recorded: false, bestDet: det }
            tracks.push(track)
          }
          track.box = det.box
          track.hits += 1
          track.lastSeen = t
          // Keep the most severe / most confident observation for the record
          if (
            SEVERITY_RANK[det.severity] > SEVERITY_RANK[track.bestDet.severity] ||
            (det.severity === track.bestDet.severity && det.confidence > track.bestDet.confidence)
          ) {
            track.bestDet = det
          }
          if (!track.recorded && track.hits >= confirmFrames) {
            track.recorded = true
            confirmed.push({ track, det: track.bestDet })
          }
        })
        tracksRef.current = tracks
        recordConfirmed(confirmed, offscreen, fix, auditId, new Set(tracks.map((tr) => tr.id)))
      } catch (err) {
        console.warn('Detection error:', err.message)
        if (isMounted) {
          setCurrentDetections([])
          setDetectError(err.message)
        }
      } finally {
        processingRef.current = false
      }
    }, INFERENCE_INTERVAL_MS[engine])

    return () => {
      isMounted = false
      clearInterval(intervalId)
    }
  }, [cameraActive, engine])

  // -------------------------------------------------------------
  // 5. Save Session Detections to Audit Report
  // -------------------------------------------------------------
  const handleSaveToAudit = async () => {
    if (!selectedAuditId) {
      setNotice({ type: 'error', text: 'Select a target audit to attach these detections to.' })
      return
    }
    if (isSimulation) {
      setNotice({ type: 'error', text: 'Simulation mode detections cannot be saved.' })
      return
    }
    if (sessionPotholes.length === 0) {
      setNotice({ type: 'error', text: 'No potholes recorded yet. Point the camera at the road surface.' })
      return
    }

    setSaving(true)
    setNotice(null)

    try {
      const result = await savePotholesToAudit(selectedAuditId, sessionPotholes)
      const savedCount = result?.saved?.length ?? sessionPotholes.length
      const skipped = result?.skipped_duplicates ?? 0
      setNotice({
        type: 'success',
        text: `Added ${savedCount} pothole detection${savedCount === 1 ? '' : 's'} to Audit #${selectedAuditId}` +
          (skipped ? ` (${skipped} already saved).` : '.'),
      })
      onSaved(selectedAuditId)
    } catch (err) {
      setNotice({ type: 'error', text: `Save error: ${err.message}` })
    } finally {
      setSaving(false)
    }
  }

  const handleClearSession = () => {
    setSessionPotholes([])
    setCurrentDetections([])
    tracksRef.current = []
    setNotice(null)
  }

  const severeCount = sessionPotholes.filter((p) => p.severity === 'severe').length
  const moderateCount = sessionPotholes.filter((p) => p.severity === 'moderate').length
  const minorCount = sessionPotholes.filter((p) => p.severity === 'minor').length
  const unlocatedCount = sessionPotholes.filter((p) => p.locationSource !== 'gps').length

  const gpsLabel = (() => {
    switch (gpsStatus) {
      case 'locked':
        if (fixIsStale) return { tone: 'amber', text: `GPS signal lost (${Math.round((fixAgeMs || 0) / 1000)}s ago)` }
        if (fixIsPoor) return { tone: 'amber', text: `${formatCoord(gps.lat, gps.lng)} (±${gps.accuracy}m, low accuracy)` }
        return { tone: 'emerald', text: `${formatCoord(gps.lat, gps.lng)} (±${gps.accuracy}m)` }
      case 'denied':
        return { tone: 'rose', text: 'Location denied — allow it in browser settings, then retry' }
      case 'unavailable':
        return { tone: 'rose', text: 'GPS unavailable — retry' }
      case 'unsupported':
        return { tone: 'rose', text: 'Geolocation not supported' }
      case 'insecure':
        return { tone: 'rose', text: 'GPS requires HTTPS' }
      default:
        return { tone: 'sky', text: 'Locating device…' }
    }
  })()

  const gpsToneClass = {
    emerald: 'border-emerald-500/40 text-emerald-300 bg-emerald-950/40',
    amber: 'border-amber-500/40 text-amber-300 bg-amber-950/40',
    rose: 'border-rose-500/40 text-rose-300 bg-rose-950/40',
    sky: 'border-sky-500/30 text-sky-300 bg-sky-950/40 animate-pulse',
  }[gpsLabel.tone]

  const noticeClass = {
    success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    error: 'border-rose-500/30 bg-rose-500/10 text-rose-300',
  }

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
          <h1 className="mt-1 text-2xl font-bold text-white flex flex-wrap items-center gap-3">
            <span>YOLO Live Road Scanner</span>
            {isSimulation ? (
              <span className="rounded-full bg-amber-500/10 px-3 py-0.5 text-xs font-semibold text-amber-300 border border-amber-500/30">
                Simulation Mode
              </span>
            ) : (
              <span className="rounded-full bg-emerald-500/10 px-3 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                Real-Time Pothole AI
              </span>
            )}
          </h1>
        </div>

        {/* Audit Association Selector, Sensitivity & Live Geotag Status */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Live Device GPS Indicator */}
          <button
            type="button"
            onClick={startLocationWatch}
            title="Click to restart GPS"
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-mono transition ${gpsToneClass}`}
          >
            <span className="size-2 rounded-full bg-current" />
            {gpsLabel.text}
          </button>

          <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs text-slate-300">
            <label htmlFor="pothole-conf">Confidence:</label>
            <input
              id="pothole-conf"
              type="range"
              min="0.15"
              max="0.85"
              step="0.05"
              value={confThreshold}
              onChange={(e) => setConfThreshold(Number(e.target.value))}
              className="w-20 accent-sky-400 cursor-pointer"
            />
            <strong className="text-sky-400 min-w-[32px] text-right font-mono">
              {Math.round(confThreshold * 100)}%
            </strong>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="pothole-audit" className="text-xs text-slate-400">Target Audit:</label>
            <select
              id="pothole-audit"
              value={selectedAuditId}
              onChange={(e) => setSelectedAuditId(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-sky-500 outline-none"
            >
              <option value="">{audits.length ? 'Select an audit…' : 'No audits available'}</option>
              {audits.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  Audit #{a.id} ({a.road_class || 'road'} - {a.status || 'saved'})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {engineError && (
        <div className="rounded-xl border border-slate-700 bg-slate-900/80 p-3 text-xs text-slate-300">
          On-device AI couldn't start ({engineError}). Falling back to server detection, which is slower.
        </div>
      )}

      {isSimulation && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
          ⚠️ <strong>Simulation mode:</strong> the YOLO model weights are not loaded on the server. Boxes shown are
          synthetic and are not recorded or saved.
        </div>
      )}

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
            <p className={`mt-2 text-sm leading-relaxed ${cameraError ? 'text-rose-300' : 'text-slate-400'}`}>
              {cameraError || 'Click below to launch your camera and start detecting road potholes in real time.'}
            </p>

            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                onClick={startCamera}
                disabled={!isSecure}
                className="scanner-ctrl-btn primary justify-center disabled:opacity-50 disabled:cursor-not-allowed"
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
                FPS: <strong className="text-sky-400">{fps ?? '–'}</strong>
              </span>
              {engine === 'loading' ? (
                <span className="hud-badge text-[11px] text-sky-300 animate-pulse">
                  Loading AI model{modelProgress != null ? ` ${modelProgress}%` : '…'}
                </span>
              ) : modelMode && (
                <span className="hud-badge text-[11px] text-slate-300">
                  Model:{' '}
                  <strong className={isSimulation ? 'text-amber-300' : 'text-emerald-400'}>
                    {isSimulation ? 'SIMULATION' : modelMode === ON_DEVICE_MODE ? 'On-device' : 'Server'}
                  </strong>
                  {modelMode === ON_DEVICE_MODE && inferenceMs != null && (
                    <span className="ml-1 text-slate-400">{inferenceMs}ms</span>
                  )}
                </span>
              )}
              {humanWarning && (
                <span className="hud-badge text-[11px] bg-amber-500/20 text-amber-300 border-amber-500/30">
                  🛡️ {humanWarning}
                </span>
              )}
              {detectError && (
                <span className="hud-badge text-[11px] bg-rose-500/20 text-rose-300 border-rose-500/30">
                  ⚠️ {detectError}
                </span>
              )}
            </div>

            {/* GPS Telemetry HUD */}
            <div className="flex flex-col items-end gap-1 text-right">
              <button
                type="button"
                onClick={startLocationWatch}
                className={`hud-badge font-mono text-xs cursor-pointer pointer-events-auto ${gpsToneClass}`}
                title="Click to restart GPS"
              >
                📍 {gpsLabel.text}
              </button>
              {gps.speedKmh != null && !fixIsStale && (
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">Live Detected Potholes</h2>
              <p className="text-xs text-slate-400">
                Recorded after {CONFIRM_FRAMES[engine === 'server' ? 'server' : 'device']} consecutive frames, with
                depth and risk estimates from cavity shading and texture.
              </p>
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
              {[...sessionPotholes].reverse().map((item, idx) => {
                const conf = (item.confidence * 100).toFixed(0)
                const sev = item.severity

                return (
                  <div key={item.id} className="detection-item-card">
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
                          Depth: {item.depth_cm.toFixed(1)} cm
                        </span>
                        <span className="text-sky-300 font-mono">
                          Risk: {Math.round(item.risk_score)}/100
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 font-mono">
                        📍 {formatCoord(item.latitude, item.longitude, 5)}
                        {item.locationSource === 'gps' && item.gpsAccuracy != null && ` ±${item.gpsAccuracy}m`}
                        {item.locationSource === 'audit_center' && (
                          <span className="text-amber-300"> (approx. — audit center)</span>
                        )}
                        {' '}• Conf: {conf}%
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
                {unlocatedCount > 0 && (
                  <p className="mt-1 text-[11px] text-amber-300">
                    {unlocatedCount} without a live GPS fix (approximate or no location)
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-3">
                <p className="text-xs text-slate-400">Destination</p>
                <p className="text-sm font-semibold text-white mt-1">
                  {selectedAuditId ? `Audit Record #${selectedAuditId}` : 'No Audit Selected'}
                </p>
              </div>
            </div>

            {notice && (
              <div role="status" className={`mt-4 p-3 rounded-xl border text-xs ${noticeClass[notice.type]}`}>
                {notice.text}
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800 flex items-center gap-3">
            <button
              onClick={handleSaveToAudit}
              disabled={saving || sessionPotholes.length === 0 || !selectedAuditId || isSimulation}
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
