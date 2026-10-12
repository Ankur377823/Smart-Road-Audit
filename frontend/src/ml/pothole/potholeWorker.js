import * as ort from 'onnxruntime-web/wasm'
import { buildDetections } from './pipeline'
import { letterbox, MODEL_SIZE } from './yoloSeg'

const MODEL_CACHE = 'smartroad-pothole-model-v1'

// The ONNX Runtime .wasm binary is emitted by Vite into /assets and served alongside the app.

// Single-threaded on purpose: the threaded build needs its loader script as a separate file, which Vite
// inlines, so session creation hangs if the page is ever served cross-origin isolated (COOP/COEP).
ort.env.wasm.numThreads = 1

let session = null

async function fetchModel(url) {
  let cache = null
  try {
    cache = await caches.open(MODEL_CACHE)
    const cached = await cache.match(url)
    if (cached) return new Uint8Array(await cached.arrayBuffer())
  } catch {
    cache = null // Cache API unavailable (private mode, insecure origin)
  }

  const response = await fetch(url)
  if (!response.ok) throw new Error(`Model download failed (HTTP ${response.status})`)

  const total = Number(response.headers.get('content-length')) || 0
  const reader = response.body.getReader()
  const chunks = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    self.postMessage({ type: 'progress', loaded, total })
  }

  const bytes = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.length
  }

  try {
    await cache?.put(url, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } }))
  } catch {
    // Quota exceeded etc.: the model still works, it just re-downloads next visit
  }
  return bytes
}

async function init(modelUrl) {
  const bytes = await fetchModel(modelUrl)
  session = await ort.InferenceSession.create(bytes, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  })
  // Warm-up run so the first real frame isn't slow (4:3 frame shape)
  const warmH = MODEL_SIZE - 96
  const dummy = new ort.Tensor('float32', new Float32Array(3 * warmH * MODEL_SIZE), [1, 3, warmH, MODEL_SIZE])
  await session.run({ [session.inputNames[0]]: dummy })
}

async function detect({ pixels, width, height, confThreshold }) {
  const started = performance.now()
  const rgba = new Uint8ClampedArray(pixels)
  const { tensor, inputW, inputH, ratio, padX, padY } = letterbox(rgba, width, height)

  const input = new ort.Tensor('float32', tensor, [1, 3, inputH, inputW])
  const results = await session.run({ [session.inputNames[0]]: input })
  const out0 = results[session.outputNames[0]]
  const out1 = results[session.outputNames[1]]

  const { detections, filteredNonRoad } = buildDetections({
    rgba,
    width,
    height,
    output0: out0.data,
    dims0: out0.dims,
    output1: out1.data,
    dims1: out1.dims,
    meta: { inputW, inputH, ratio, padX, padY },
    confThreshold,
  })

  return { detections, filteredNonRoad, inferenceMs: Math.round(performance.now() - started) }
}

self.onmessage = async (event) => {
  const { type, id } = event.data
  try {
    if (type === 'init') {
      await init(event.data.modelUrl)
      self.postMessage({ type: 'ready', id })
    } else if (type === 'detect') {
      if (!session) throw new Error('Model not loaded')
      const result = await detect(event.data)
      self.postMessage({ type: 'result', id, ...result })
    }
  } catch (err) {
    self.postMessage({ type: 'error', id, message: err?.message || String(err) })
  }
}
