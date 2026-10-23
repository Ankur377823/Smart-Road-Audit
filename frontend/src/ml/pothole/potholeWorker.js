import { buildDetections } from './pipeline'
import { makeSelfTestFrame, SELF_TEST_HEIGHT, SELF_TEST_WIDTH, selfTestPassed } from './selfTest'
import { letterbox, MODEL_SIZE } from './yoloSeg'

const MODEL_CACHE = 'smartroad-pothole-model-v1'

// ONNX Runtime build, chosen in init(): the WebGPU build (runs on the phone GPU, with CPU fallback)
// when the browser exposes WebGPU, otherwise the smaller CPU-only build. Vite emits each build's .wasm
// into /assets; only the one imported here is downloaded.
let ort = null
let session = null
let backend = 'cpu'

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

// The GPU runs the float model; the CPU runs an INT8 (dynamically quantized) copy, which is about 1.3-1.8x
// faster on WebAssembly, a quarter of the download, and scored the same on a labelled pothole test set.
async function createSession(modelUrl, cpuModelUrl) {
  const hasWebGpu = typeof navigator !== 'undefined' && 'gpu' in navigator
  if (hasWebGpu) {
    try {
      const bytes = await fetchModel(modelUrl)
      ort = await import('onnxruntime-web/webgpu')
      ort.env.wasm.numThreads = 1
      const gpuSession = await ort.InferenceSession.create(bytes, {
        executionProviders: ['webgpu'],
        graphOptimizationLevel: 'all',
      })
      // Some GPU drivers run fast but compute wrong values: only trust the GPU if it finds the known
      // pothole in the built-in test frame
      const check = await runModel(gpuSession, makeSelfTestFrame(), SELF_TEST_WIDTH, SELF_TEST_HEIGHT, 0.2)
      if (!selfTestPassed(check.detections)) {
        await gpuSession.release()
        const found = check.detections.map((d) => `${d.box.map(Math.round)}@${d.confidence}`).join(' ') || 'nothing'
        throw new Error(`GPU results failed the self-test (found ${found})`)
      }
      backend = 'gpu'
      return gpuSession
    } catch (err) {
      // GPU blocklisted or an unsupported operator: fall back to the CPU
      console.warn('WebGPU unavailable for the pothole model, using CPU:', err?.message || err)
    }
  }
  ort = await import('onnxruntime-web/wasm')
  // Single-threaded on purpose: the threaded build needs its loader script as a separate file, which Vite
  // inlines, so session creation hangs if the page is ever served cross-origin isolated (COOP/COEP).
  ort.env.wasm.numThreads = 1
  backend = 'cpu'
  const bytes = await fetchModel(cpuModelUrl)
  return ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' })
}

async function init(modelUrl, cpuModelUrl) {
  session = await createSession(modelUrl, cpuModelUrl)
  // Warm-up run so the first real frame isn't slow (landscape 4:3 frame shape)
  const warmH = Math.round((MODEL_SIZE * 0.75) / 32) * 32
  const dummy = new ort.Tensor('float32', new Float32Array(3 * warmH * MODEL_SIZE), [1, 3, warmH, MODEL_SIZE])
  await session.run({ [session.inputNames[0]]: dummy })
}

async function runModel(sess, rgba, width, height, confThreshold) {
  const { tensor, inputW, inputH, ratio, padX, padY } = letterbox(rgba, width, height)

  const input = new ort.Tensor('float32', tensor, [1, 3, inputH, inputW])
  const results = await sess.run({ [sess.inputNames[0]]: input })
  const out0 = results[sess.outputNames[0]]
  const out1 = results[sess.outputNames[1]]

  return buildDetections({
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
}

async function detect({ pixels, width, height, confThreshold }) {
  const started = performance.now()
  const { detections, filteredNonRoad } = await runModel(session, new Uint8ClampedArray(pixels), width, height, confThreshold)
  return { detections, filteredNonRoad, backend, inferenceMs: Math.round(performance.now() - started) }
}

self.onmessage = async (event) => {
  const { type, id } = event.data
  try {
    if (type === 'init') {
      await init(event.data.modelUrl, event.data.cpuModelUrl)
      self.postMessage({ type: 'ready', id, backend })
    } else if (type === 'detect') {
      if (!session) throw new Error('Model not loaded')
      const result = await detect(event.data)
      self.postMessage({ type: 'result', id, ...result })
    }
  } catch (err) {
    self.postMessage({ type: 'error', id, message: err?.message || String(err) })
  }
}
