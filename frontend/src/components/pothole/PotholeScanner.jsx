import { useCallback, useEffect, useRef, useState } from 'react'
import PotholeCanvasOverlay from './PotholeCanvasOverlay'
import { detectPotholes, savePotholesToAudit } from '../../services/potholeApi'
import { distanceMeters, formatCoord } from './geo'
import { SEVERITY_TONE } from './severity'
import { CAMERA_HEIGHTS, DEFAULT_PITCH_DEG, measureOnGround, pitchFromOrientation } from '../../ml/pothole/groundGeometry'
import { classifyPothole, defaultCategoryForRoadClass, DEFAULT_CARRIAGEWAY_WIDTH_M, IRC_CLASS_LABEL } from '../../ml/pothole/irc82'
import { assessRisk } from '../../ml/pothole/sp88'
import { openPotholeReport, openReportWindow } from '../../utils/potholeReport'
import { detectOnDevice, isOnDeviceSupported, loadOnDeviceDetector } from '../../ml/pothole/onDeviceDetector'
import { Badge, Notice, PageHeader } from '../common/ui'
import { IconAlert, IconCamera, IconCameraFlip, IconCrosshair, IconFileText, IconStop, IconTrash } from '../common/Icons'
import './pothole.css'

// On-device inference is paced by the worker; server round-trips are throttled harder
const INFERENCE_INTERVAL_MS = { device: 80, server: 400 }
const SIMULATION_MODE = 'simulation_demo'
const ON_DEVICE_MODE = 'on_device_onnx'

// A GPS fix older than this is not used to geotag a pothole while moving...
const STALE_FIX_MS = 5000
// ...but a stationary device's last fix stays valid longer (phones often stop reporting when still)
const STATIONARY_FIX_MS = 30000
const STATIONARY_KMH = 2
// watchPosition only fires on movement on many phones; poll when it has been quiet this long
const GPS_HEARTBEAT_MS = 3000
// Fixes worse than this are flagged as low accuracy
const POOR_ACCURACY_M = 30
// Tracks not seen for this long (or 3 frame intervals, if longer) are dropped
const TRACK_TTL_MS = 1500
const TRACK_IOU_MATCH = 0.2

/**
 * Frames a pothole must be seen in before it is recorded, adapted to the measured frame rate: at
 * 1-2 frames per second a pothole passes through the view in one or two frames while driving, so
 * demanding three would mean it is never recorded.
 */
// Stretch of road ahead in which the camera can see and confirm a pothole (about 2-11 m ahead)
const VISIBLE_ROAD_M = 9

function framesToConfirm(frameIntervalMs, speedKmh) {
  // Speed unknown (no GPS fix): be lenient on slow devices, which may be moving fast
  if (speedKmh == null) return frameIntervalMs < 350 ? 3 : frameIntervalMs < 800 ? 2 : 1
  // A pothole crosses the visible stretch quickly at speed (about 0.5 s at 60 km/h): ask for at most
  // half the frames it will be visible in, so it is confirmed before it passes; up to 3 when walking
  const metresPerSecond = Math.max(1, speedKmh / 3.6)
  const framesVisible = (VISIBLE_ROAD_M / metresPerSecond) * (1000 / frameIntervalMs)
  return Math.max(1, Math.min(3, Math.floor(framesVisible / 2)))
}

/** Point `meters` ahead of (lat, lng) along compass heading `headingDeg`. */
function projectAhead(lat, lng, headingDeg, meters) {
  const R = 6371000
  const bearing = (headingDeg * Math.PI) / 180
  const dLat = (meters * Math.cos(bearing)) / R
  const dLng = (meters * Math.sin(bearing)) / (R * Math.cos((lat * Math.PI) / 180))
  return [lat + (dLat * 180) / Math.PI, lng + (dLng * 180) / Math.PI]
}

function bearingDeg(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2))
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/**
 * How well a detection continues a track: box overlap, or (for slow frame rates, where a pothole
 * moves far between frames) a nearby centre. Returns 0 for no match.
 */
function trackMatchScore(trackBox, box) {
  const overlap = iou(trackBox, box)
  if (overlap >= TRACK_IOU_MATCH) return 1 + overlap
  const size = Math.max(trackBox[2] - trackBox[0], trackBox[3] - trackBox[1], 1)
  const dx = (trackBox[0] + trackBox[2]) / 2 - (box[0] + box[2]) / 2
  const dy = (trackBox[1] + trackBox[3]) / 2 - (box[1] + box[3]) / 2
  const distance = Math.hypot(dx, dy) / size
  return distance <= 1.5 ? 1 - distance / 1.5 : 0
}
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

/**
 * Adds real-world size (ground projection), the IRC:82-2015 size class and the IRC:SP:88-2019 risk
 * to a raw detection. Depth comes from the visual estimate unless the auditor entered a measurement.
 */
function classifyEntry({ depthCm, widthMm, speedKmh, roadClass }) {
  const irc = classifyPothole({ depthMm: depthCm != null ? depthCm * 10 : null, widthMm })
  const risk = assessRisk({ severity: irc.severity, speedKmh, roadClass })
  return { severity: irc.severity, sizeIndex: irc.sizeIndex, riskLevel: risk.riskLevel, actionPriority: risk.priority }
}

function enrichDetection(det, frameW, frameH, camera, speedKmh, roadClass) {
  if (!Array.isArray(det?.box) || det.box.length !== 4) return det
  const ground = measureOnGround(det, frameW, frameH, camera)
  const depthCm = det.depth_cm ?? null
  const cls = classifyEntry({ depthCm, widthMm: ground?.widthMm ?? null, speedKmh, roadClass })
  return {
    ...det,
    depth_cm: depthCm,
    width_mm: ground?.widthMm ?? null,
    distance_m: ground?.distanceM ?? null,
    area_m2: ground?.areaM2 ?? null,
    severity: cls.severity,
    risk_score: cls.sizeIndex,
    risk_level: cls.riskLevel,
    action_priority: cls.actionPriority,
  }
}

/** Normalises a scanner entry for the PDF report. */
function sessionEntryToReport(p) {
  return {
    severity: p.severity,
    riskLevel: p.riskLevel,
    actionPriority: p.actionPriority,
    depthMm: p.depth_cm != null ? p.depth_cm * 10 : null,
    depthSource: p.depthSource,
    widthMm: p.width_mm,
    areaM2: p.area_m2,
    confidence: p.confidence,
    latitude: p.latitude,
    longitude: p.longitude,
    locationSource: p.locationSource,
    gpsAccuracy: p.gpsAccuracy,
    speedKmh: p.speedKmh,
    detectedAt: p.timestamp,
    snapshot: p.snapshot,
  }
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

// Default detection confidence; lower values catch more potholes but also more false positives
const DEFAULT_CONFIDENCE = 0.55

function PotholeScanner({ audits = [], currentAuditId = null, onSaved = () => {} }) {
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

  // Camera geometry for measuring pothole width/area on the road plane
  const [cameraHeightM, setCameraHeightM] = useState(CAMERA_HEIGHTS[0].value)
  const cameraHeightRef = useRef(cameraHeightM)
  cameraHeightRef.current = cameraHeightM
  const pitchRef = useRef(null)
  const [pitchSource, setPitchSource] = useState('assumed')

  // Distance covered with the camera running (GPS), for the IRC:82 pothole area-% rating
  const surveyRef = useRef({ last: null, total: 0 })
  const [surveyDistanceM, setSurveyDistanceM] = useState(0)
  const cameraActiveRef = useRef(false)

  const listRef = useRef(null)
  const [scanEnded, setScanEnded] = useState(false)
  const [editingDepthId, setEditingDepthId] = useState(null)
  const [depthDraft, setDepthDraft] = useState('')
  const [reportBusy, setReportBusy] = useState(false)

  // Detection engine: 'loading' while the on-device model downloads, then 'device' or 'server' (fallback)
  const [engine, setEngine] = useState(() => (isOnDeviceSupported() ? 'loading' : 'server'))
  const [modelProgress, setModelProgress] = useState(null)
  const [engineError, setEngineError] = useState(null)
  const [inferenceMs, setInferenceMs] = useState(null)
  const [computeBackend, setComputeBackend] = useState(null)
  const frameIntervalRef = useRef(0)

  // Detection Sensitivity / Confidence Filter
  const [confThreshold, setConfThreshold] = useState(DEFAULT_CONFIDENCE)

  // Live Telemetry & GPS (raw, unrounded values)
  const [gps, setGps] = useState({ lat: null, lng: null, speedKmh: null, headingDeg: null, accuracy: null, timestamp: null })
  // 'locating' | 'locked' | 'denied' | 'unavailable' | 'unsupported' | 'insecure'
  const [gpsStatus, setGpsStatus] = useState('locating')
  const [now, setNow] = useState(() => Date.now())

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
    const { latitude, longitude, accuracy, speed, heading } = pos.coords
    const timestamp = mayBeCached ? Math.min(pos.timestamp || 0, Date.now()) : Date.now()

    setGps((prev) => {
      // Don't let a coarse network fix replace a recent precise GPS fix
      const prevFresh = prev.timestamp && timestamp - prev.timestamp < STALE_FIX_MS
      if (prevFresh && prev.accuracy != null && accuracy > prev.accuracy * 1.5) {
        return prev
      }

      let speedKmh = speed != null && !Number.isNaN(speed) ? Math.round(speed * 3.6) : null
      let headingDeg = heading != null && Number.isFinite(heading) ? heading : null
      // Many devices never report coords.speed/heading; derive them from consecutive fixes
      if (prev.lat != null && prev.timestamp && timestamp > prev.timestamp) {
        const dt = (timestamp - prev.timestamp) / 1000
        const d = distanceMeters(prev.lat, prev.lng, latitude, longitude)
        if (speedKmh == null && dt >= 1) speedKmh = d > accuracy ? Math.round((d / dt) * 3.6) : 0
        if (headingDeg == null && d > accuracy) headingDeg = bearingDeg(prev.lat, prev.lng, latitude, longitude)
        if (headingDeg == null && d <= accuracy) headingDeg = prev.headingDeg ?? null
      }

      return { lat: latitude, lng: longitude, accuracy: Math.round(accuracy), speedKmh, headingDeg, timestamp }
    })
    setGpsStatus('locked')

    // Accumulate surveyed distance while scanning; ignore jitter within the fix accuracy and GPS jumps
    if (cameraActiveRef.current && accuracy <= POOR_ACCURACY_M) {
      const survey = surveyRef.current
      if (!survey.last) {
        survey.last = { lat: latitude, lng: longitude }
      } else {
        const d = distanceMeters(survey.last.lat, survey.last.lng, latitude, longitude)
        if (d > Math.max(accuracy, 3) && d < 200) {
          survey.total += d
          survey.last = { lat: latitude, lng: longitude }
          setSurveyDistanceM(Math.round(survey.total))
        }
      }
    }
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
    // iOS only grants motion sensors from a user gesture: ask before the first await
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().catch(() => {})
    }
    setCameraError(null)
    setScanEnded(false)
    surveyRef.current.last = null
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

  // Track the phone's downward tilt for ground-plane measurement
  useEffect(() => {
    cameraActiveRef.current = cameraActive
    if (!cameraActive) return
    const onOrientation = (event) => {
      const angle = window.screen?.orientation?.angle ?? window.orientation ?? 0
      const pitch = pitchFromOrientation(event, angle)
      if (pitch != null) {
        pitchRef.current = pitch
        setPitchSource('sensor')
      }
    }
    window.addEventListener('deviceorientation', onOrientation)
    return () => window.removeEventListener('deviceorientation', onOrientation)
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
    let lastFrameAt = 0

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

    const locateAhead = (loc, fix, det) => {
      if (loc.locationSource !== 'gps' || fix.headingDeg == null || !(fix.speedKmh >= 5)) return loc
      const sinceFixM = (fix.speedKmh / 3.6) * Math.min(3, Math.max(0, (Date.now() - fix.timestamp) / 1000))
      const aheadM = sinceFixM + (det.distance_m ?? 0)
      const [latitude, longitude] = projectAhead(loc.latitude, loc.longitude, fix.headingDeg, aheadM)
      return { ...loc, latitude, longitude }
    }

    const recordConfirmed = (confirmed, frameCanvas, fix, auditId, seenThisFrame) => {
      if (!confirmed.length) return
      // Build entries now: the shared frame canvas is overwritten by the next tick
      const loc = resolveLocation(fix, auditId)
      const roadClass = auditsRef.current.find((a) => String(a.id) === String(auditId))?.road_class ?? null
      const candidates = confirmed.map(({ track, det }) => ({
        id: newId(),
        trackId: track.id,
        ...locateAhead(loc, fix, det),
        speedKmh: fix.speedKmh ?? null,
        confidence: Number(det.confidence),
        severity: det.severity,
        depth_cm: det.depth_cm,
        depthSource: 'estimated',
        width_mm: det.width_mm,
        area_m2: det.area_m2,
        risk_score: det.risk_score,
        riskLevel: det.risk_level,
        actionPriority: det.action_priority,
        measuredWith: pitchRef.current != null ? 'sensor' : 'assumed',
        roadClass,
        area_ratio: Number(det.area_ratio || 0),
        box: det.box,
        polygon: Array.isArray(det.polygon) ? det.polygon : [],
        snapshot: cropSnapshot(frameCanvas, det, SEVERITY_COLOR[det.severity] || SEVERITY_COLOR.minor),
        timestamp: Date.now(),
      }))

      setSessionPotholes((prev) => {
        // Same pothole seen again under a new track (lost and re-acquired, or a jump between frames at
        // speed): skip if a recorded pothole that is not in view right now is very close
        const isDuplicate = (entry) =>
          entry.locationSource === 'gps' &&
          prev.some(
            (p) =>
              p.locationSource === 'gps' &&
              !seenThisFrame.has(p.trackId) &&
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
          setComputeBackend(result.backend)
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

        const roadClass = auditsRef.current.find((a) => String(a.id) === String(auditId))?.road_class ?? null
        const camera = { heightM: cameraHeightRef.current, pitchDeg: pitchRef.current ?? DEFAULT_PITCH_DEG }
        const detections = (Array.isArray(response?.detections) ? response.detections : []).map((det) =>
          enrichDetection(det, offscreenW, offscreenH, camera, fix.speedKmh, roadClass)
        )
        setCurrentDetections(detections)
        setModelMode(response?.model_mode || '')
        setDetectError(null)
        setHumanWarning(response?.human_detected ? response?.warning_message || 'Non-road object filtered' : null)

        // Synthetic detections are never recorded
        if (response?.model_mode === SIMULATION_MODE) {
          tracksRef.current = []
          return
        }

        // Match detections to tracks across frames; record only once confirmed
        const t = Date.now()
        if (lastFrameAt) {
          // Smoothed time between processed frames drives how strict confirmation is
          const interval = t - lastFrameAt
          frameIntervalRef.current = frameIntervalRef.current ? frameIntervalRef.current * 0.7 + interval * 0.3 : interval
        }
        lastFrameAt = t
        const frameInterval = frameIntervalRef.current || INFERENCE_INTERVAL_MS[engine]
        const confirmFrames = framesToConfirm(frameInterval, fix.speedKmh)
        const ttl = Math.max(TRACK_TTL_MS, frameInterval * 3)
        const tracks = tracksRef.current.filter((tr) => t - tr.lastSeen <= ttl)
        const confirmed = []
        detections.forEach((det) => {
          if (!Array.isArray(det?.box) || det.box.length !== 4) return
          let track = null
          let bestScore = 0
          tracks.forEach((tr) => {
            if (tr.lastSeen === t) return // already matched in this frame
            const score = trackMatchScore(tr.box, det.box)
            if (score > bestScore) {
              track = tr
              bestScore = score
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
        recordConfirmed(confirmed, offscreen, fix, auditId, new Set(tracks.filter((tr) => tr.lastSeen === t).map((tr) => tr.id)))
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
    surveyRef.current = { last: null, total: 0 }
    setSurveyDistanceM(0)
    setScanEnded(false)
    setNotice(null)
  }

  // Stopping a scan shows the summary and the list of recorded potholes
  const handleStopScan = () => {
    stopCamera()
    setScanEnded(true)
    requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const saveMeasuredDepth = (id) => {
    const depthMm = Number(depthDraft)
    if (!Number.isFinite(depthMm) || depthMm <= 0 || depthMm > 500) {
      setNotice({ type: 'error', text: 'Enter the measured depth in millimetres (1-500).' })
      return
    }
    setSessionPotholes((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p
        const cls = classifyEntry({ depthCm: depthMm / 10, widthMm: p.width_mm, speedKmh: p.speedKmh, roadClass: p.roadClass })
        return { ...p, depth_cm: depthMm / 10, depthSource: 'measured', severity: cls.severity, risk_score: cls.sizeIndex, riskLevel: cls.riskLevel, actionPriority: cls.actionPriority }
      })
    )
    setEditingDepthId(null)
    setNotice(null)
  }

  const handleGenerateReport = async () => {
    const target = openReportWindow()
    setReportBusy(true)
    try {
      const audit = audits.find((a) => String(a.id) === String(selectedAuditId))
      await openPotholeReport({
        title: audit ? `Audit #${audit.id} · ${audit.location_name || 'Road audit'}` : 'Pothole scanner session',
        subtitle: `Scan session · ${surveyDistanceM ? `${surveyDistanceM} m surveyed (GPS)` : 'surveyed distance not recorded'}`,
        potholes: sessionPotholes.map(sessionEntryToReport),
        survey: surveyDistanceM
          ? { lengthM: surveyDistanceM, widthM: DEFAULT_CARRIAGEWAY_WIDTH_M, category: defaultCategoryForRoadClass(audit?.road_class) }
          : null,
        target,
      })
    } catch (err) {
      target?.close()
      setNotice({ type: 'error', text: `Could not create the report: ${err.message}` })
    } finally {
      setReportBusy(false)
    }
  }

  const counts = {
    severe: sessionPotholes.filter((p) => p.severity === 'severe').length,
    moderate: sessionPotholes.filter((p) => p.severity === 'moderate').length,
    minor: sessionPotholes.filter((p) => p.severity === 'minor').length,
  }
  const unlocatedCount = sessionPotholes.filter((p) => p.locationSource !== 'gps').length
  const essentialCount = sessionPotholes.filter((p) => p.actionPriority === 'Essential').length

  const gpsLabel = (() => {
    switch (gpsStatus) {
      case 'locked':
        if (fixIsStale) return { tone: 'amber', text: `Signal lost ${Math.round((fixAgeMs || 0) / 1000)}s ago` }
        if (fixIsPoor) return { tone: 'amber', text: `Low accuracy (±${gps.accuracy} m)` }
        return { tone: 'green', text: `Locked (±${gps.accuracy} m)` }
      case 'denied':
        return { tone: 'red', text: 'Permission denied' }
      case 'unavailable':
        return { tone: 'red', text: 'Unavailable' }
      case 'unsupported':
        return { tone: 'red', text: 'Not supported' }
      case 'insecure':
        return { tone: 'red', text: 'Requires HTTPS' }
      default:
        return { tone: 'slate', text: 'Locating…' }
    }
  })()
  const gpsDot = { green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500', slate: 'bg-slate-400 animate-pulse' }[gpsLabel.tone]
  const canRetryGps = gpsStatus !== 'locked' || fixIsStale

  const modelLabel = (() => {
    if (engine === 'loading') return `Loading model${modelProgress != null ? ` ${modelProgress}%` : '…'}`
    if (isSimulation) return 'Simulation'
    if (modelMode === ON_DEVICE_MODE) {
      const where = computeBackend === 'gpu' ? 'GPU' : 'CPU'
      return `On-device ${where}${inferenceMs != null ? ` · ${inferenceMs} ms` : ''}`
    }
    if (modelMode) return 'Server'
    return engine === 'device' ? 'On-device' : 'Server'
  })()

  const RISK_TONE = { 'Very High': 'red', High: 'orange', Medium: 'amber' }

  return (
    <div className="pothole-scanner-root">
      <PageHeader
        title="Pothole scanner"
        description="Point the camera at the road. Potholes are detected on this device, sized per IRC:82-2015 and risk-rated per IRC:SP:88-2019."
      />

      {engineError && (
        <Notice tone="warning" className="mb-4">
          On-device detection couldn&apos;t start ({engineError}). Using server detection instead, which is slower.
        </Notice>
      )}
      {isSimulation && (
        <Notice tone="warning" className="mb-4">
          <strong>Simulation mode.</strong> The detection model isn&apos;t available, so the boxes shown are synthetic.
          They are not recorded or saved.
        </Notice>
      )}
      {!isSecure && (
        <Notice tone="error" className="mb-4">
          Camera and location need a secure connection. Open this page over https:// to scan.
        </Notice>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Viewfinder */}
        <div className="scanner-viewfinder">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`scanner-video-feed ${cameraActive ? 'block' : 'hidden'}`}
          />

          {cameraActive ? (
            <>
              <PotholeCanvasOverlay detections={currentDetections} frameWidth={videoDims.width} frameHeight={videoDims.height} />

              <div className="scanner-hud-top">
                <div className="flex flex-col items-start gap-1.5">
                  <span className="hud-chip">
                    <span className="live-dot" aria-hidden="true" />
                    Live
                    <span className="text-white/50">·</span>
                    <span className={isSimulation ? 'text-amber-300' : 'text-white/80'}>{modelLabel}</span>
                  </span>
                  {videoDims.height > videoDims.width && (
                    <span className="hud-chip text-amber-200">Turn the phone sideways for better detection</span>
                  )}
                  {(detectError || humanWarning) && (
                    <span className={`hud-chip ${detectError ? 'text-red-200' : 'text-amber-200'}`}>
                      <IconAlert className="size-3.5" />
                      {detectError || humanWarning}
                    </span>
                  )}
                </div>
                {gps.speedKmh != null && !fixIsStale && (
                  <span className="hud-chip tabular-nums">{gps.speedKmh} km/h</span>
                )}
              </div>

              <div className="scanner-hud-bottom">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
                    className="hud-button"
                    aria-label="Switch camera"
                    title="Switch camera"
                  >
                    <IconCameraFlip className="size-5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleStopScan}
                    className="hud-button hud-button-stop"
                    aria-label="Stop scan"
                    title="Stop scan"
                  >
                    <IconStop className="size-5" />
                  </button>
                </div>
                <span className="hud-chip tabular-nums">{sessionPotholes.length} recorded</span>
              </div>
            </>
          ) : (
            <div className="relative z-10 flex max-w-xs flex-col items-center px-6 text-center">
              <span className="flex size-14 items-center justify-center rounded-full bg-white/10 text-white">
                <IconCamera className="size-7" />
              </span>
              <h2 className="mt-4 text-lg font-semibold text-white">
                {scanEnded ? 'Scan stopped' : 'Camera is off'}
              </h2>
              <p className={`mt-1.5 text-sm ${cameraError ? 'text-red-300' : 'text-slate-300'}`}>
                {cameraError ||
                  (scanEnded
                    ? `${sessionPotholes.length} pothole${sessionPotholes.length === 1 ? '' : 's'} recorded. Review them below or continue scanning.`
                    : 'Start the camera, then hold your phone steady with the road in view.')}
              </p>
              <button
                type="button"
                onClick={startCamera}
                disabled={!isSecure}
                className="btn mt-5 bg-white px-5 py-3 text-slate-900 hover:bg-slate-100"
              >
                <IconCamera className="size-4" />
                {scanEnded ? 'Continue scanning' : 'Start camera'}
              </button>
              {engine === 'loading' && <p className="mt-3 text-xs text-slate-400">{modelLabel}</p>}
            </div>
          )}
        </div>

        {/* Settings and save */}
        <aside className="card h-fit p-4 sm:p-5">
          <div>
            <label htmlFor="pothole-audit" className="field-label">Add detections to</label>
            <select
              id="pothole-audit"
              value={selectedAuditId}
              onChange={(e) => setSelectedAuditId(e.target.value)}
              className="input mt-1.5"
            >
              <option value="">{audits.length ? 'Select an audit…' : 'No audits available'}</option>
              {audits.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  #{a.id} · {a.location_name || `${a.road_class || 'Road'} audit`}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-5">
            <label htmlFor="pothole-height" className="field-label">Phone position</label>
            <select
              id="pothole-height"
              value={cameraHeightM}
              onChange={(e) => setCameraHeightM(Number(e.target.value))}
              className="input mt-1.5"
            >
              {CAMERA_HEIGHTS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Used to measure pothole width and area. Tilt:{' '}
              {pitchSource === 'sensor' ? 'from the motion sensor' : `assumed ${DEFAULT_PITCH_DEG}° (no motion sensor)`}.
            </p>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between">
              <label htmlFor="pothole-conf" className="field-label">Detection confidence</label>
              <span className="text-sm font-semibold tabular-nums text-slate-900">{Math.round(confThreshold * 100)}%</span>
            </div>
            <input
              id="pothole-conf"
              type="range"
              min="0.15"
              max="0.9"
              step="0.05"
              value={confThreshold}
              onChange={(e) => setConfThreshold(Number(e.target.value))}
              className="mt-2 w-full accent-slate-900"
            />
            <p className="mt-1 text-xs text-slate-500">Lower finds more potholes but also more false alarms.</p>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">Location</p>
              <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                <span className={`size-2 shrink-0 rounded-full ${gpsDot}`} aria-hidden="true" />
                <span className="truncate">{gpsLabel.text}</span>
              </p>
              {gpsStatus === 'locked' && gps.lat != null && (
                <p className="mt-0.5 truncate font-mono text-xs text-slate-500">{formatCoord(gps.lat, gps.lng)}</p>
              )}
            </div>
            {canRetryGps && (
              <button type="button" onClick={startLocationWatch} className="btn btn-secondary shrink-0 px-3 py-1.5 text-xs">
                <IconCrosshair className="size-3.5" />
                Retry
              </button>
            )}
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            {['minor', 'moderate', 'severe'].map((level) => (
              <div key={level} className="rounded-lg border border-slate-200 px-2 py-2">
                <p className="text-lg font-bold tabular-nums text-slate-900">{counts[level]}</p>
                <p className="text-xs text-slate-500">{IRC_CLASS_LABEL[level]}</p>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-center text-xs text-slate-500">
            IRC:82 size classes{surveyDistanceM ? ` · ${surveyDistanceM} m surveyed` : ''}
          </p>
          {unlocatedCount > 0 && (
            <p className="mt-2 text-xs text-amber-700">
              {unlocatedCount} recorded without a live GPS fix (approximate or no location).
            </p>
          )}

          {notice && <Notice tone={notice.type} className="mt-4">{notice.text}</Notice>}

          <button
            type="button"
            onClick={handleSaveToAudit}
            disabled={saving || sessionPotholes.length === 0 || !selectedAuditId || isSimulation}
            className="btn btn-primary mt-5 w-full py-3"
          >
            {saving
              ? 'Saving…'
              : sessionPotholes.length
                ? `Save ${sessionPotholes.length} pothole${sessionPotholes.length === 1 ? '' : 's'} to audit`
                : 'Save to audit'}
          </button>
        </aside>
      </div>

      {/* Recorded potholes */}
      <section ref={listRef} className="card mt-5 scroll-mt-20 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">
              {scanEnded && sessionPotholes.length ? 'Scan summary' : 'Recorded potholes'}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {sessionPotholes.length
                ? `${sessionPotholes.length} pothole${sessionPotholes.length === 1 ? '' : 's'}` +
                  `${essentialCount ? ` · ${essentialCount} essential` : ''}` +
                  `${surveyDistanceM ? ` · ${surveyDistanceM} m surveyed` : ''}`
                : 'A pothole is recorded once it is confirmed in consecutive frames.'}
            </p>
          </div>
          {sessionPotholes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleGenerateReport} disabled={reportBusy} className="btn btn-primary px-3 py-2 text-sm">
                <IconFileText className="size-4" />
                {reportBusy ? 'Creating PDF…' : 'Generate PDF report'}
              </button>
              <button type="button" onClick={handleClearSession} className="btn btn-secondary px-3 py-2 text-sm">
                <IconTrash className="size-4" />
                Clear
              </button>
            </div>
          )}
        </div>

        {sessionPotholes.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">
            No potholes recorded yet. Detections at or above {Math.round(confThreshold * 100)}% confidence appear here.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {[...sessionPotholes].reverse().map((item, idx) => (
              <li key={item.id} className="px-4 py-3 sm:px-6">
                <div className="flex gap-3">
                  {item.snapshot ? (
                    <img src={item.snapshot} alt="" className="h-16 w-24 shrink-0 rounded-md border border-slate-200 object-cover" />
                  ) : (
                    <div className="h-16 w-24 shrink-0 rounded-md bg-slate-100" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 text-sm font-medium text-slate-900">Pothole {sessionPotholes.length - idx}</span>
                      <Badge tone={SEVERITY_TONE[item.severity]}>{IRC_CLASS_LABEL[item.severity]}</Badge>
                      {item.riskLevel && <Badge tone={RISK_TONE[item.riskLevel]}>{item.riskLevel} risk</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      Depth {item.depth_cm != null ? `${Math.round(item.depth_cm * 10)} mm` : 'N/A'}{' '}
                      <span className="text-slate-400">({item.depthSource === 'measured' ? 'measured' : 'est.'})</span>
                      {' · '}Width {item.width_mm != null ? `${item.width_mm} mm` : 'N/A'}
                      {item.area_m2 != null && ` · ${item.area_m2} m²`}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      Priority: <span className="font-medium text-slate-900">{item.actionPriority || '–'}</span>
                      {' · '}{Math.round(item.confidence * 100)}% conf.
                    </p>
                    <p className="mt-0.5 truncate font-mono text-xs text-slate-500">
                      {formatCoord(item.latitude, item.longitude)}
                      {item.locationSource === 'gps' && item.gpsAccuracy != null && ` ±${item.gpsAccuracy} m`}
                      {item.locationSource === 'audit_center' && <span className="font-sans text-amber-700"> (approx.)</span>}
                    </p>
                  </div>
                </div>

                {editingDepthId === item.id ? (
                  <form
                    className="mt-2 flex items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault()
                      saveMeasuredDepth(item.id)
                    }}
                  >
                    <label htmlFor={`depth-${item.id}`} className="sr-only">Measured depth in mm</label>
                    <input
                      id={`depth-${item.id}`}
                      type="number"
                      inputMode="decimal"
                      min="1"
                      max="500"
                      autoFocus
                      value={depthDraft}
                      onChange={(event) => setDepthDraft(event.target.value)}
                      placeholder="Depth in mm"
                      className="input w-32 py-1.5"
                    />
                    <button type="submit" className="btn btn-primary px-3 py-1.5 text-xs">Save</button>
                    <button type="button" onClick={() => setEditingDepthId(null)} className="btn btn-secondary px-3 py-1.5 text-xs">
                      Cancel
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingDepthId(item.id)
                      setDepthDraft(item.depthSource === 'measured' && item.depth_cm != null ? String(Math.round(item.depth_cm * 10)) : '')
                    }}
                    className="mt-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    {item.depthSource === 'measured' ? 'Edit measured depth' : 'Enter measured depth'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export default PotholeScanner
