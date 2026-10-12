/**
 * Main-thread client for the on-device pothole model. One shared worker per page load,
 * so navigating away and back to the scanner doesn't reload the model.
 */

const MODEL_URL = `${import.meta.env.BASE_URL}models/pothole-seg.onnx`

let worker = null
let readyPromise = null
let nextId = 1
const pending = new Map()
const progressListeners = new Set()

function getWorker() {
  if (worker) return worker
  worker = new Worker(new URL('./potholeWorker.js', import.meta.url), { type: 'module' })
  worker.onmessage = (event) => {
    const msg = event.data
    if (msg.type === 'progress') {
      progressListeners.forEach((fn) => fn(msg.loaded, msg.total))
      return
    }
    const entry = pending.get(msg.id)
    if (!entry) return
    pending.delete(msg.id)
    if (msg.type === 'error') entry.reject(new Error(msg.message))
    else entry.resolve(msg)
  }
  worker.onerror = (event) => {
    const error = new Error(event.message || 'On-device detector crashed')
    pending.forEach((entry) => entry.reject(error))
    pending.clear()
    worker = null
    readyPromise = null
  }
  return worker
}

export function isOnDeviceSupported() {
  return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined'
}

/**
 * Loads the model (cached after the first visit). onProgress(loaded, total) reports download progress.
 */
export function loadOnDeviceDetector(onProgress) {
  if (onProgress) progressListeners.add(onProgress)
  if (!readyPromise) {
    readyPromise = new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      getWorker().postMessage({ type: 'init', id, modelUrl: new URL(MODEL_URL, window.location.href).href })
    }).catch((err) => {
      readyPromise = null
      throw err
    })
  }
  return readyPromise.finally(() => onProgress && progressListeners.delete(onProgress))
}

/**
 * Runs detection on an ImageData frame. The pixel buffer is transferred to the worker.
 */
export function detectOnDevice(imageData, confThreshold) {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    const pixels = imageData.data.buffer
    getWorker().postMessage(
      { type: 'detect', id, pixels, width: imageData.width, height: imageData.height, confThreshold },
      [pixels]
    )
  })
}
