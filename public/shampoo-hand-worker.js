// This intentionally remains a classic Worker. MediaPipe's IIFE bundle exposes
// `Vision` globally and its WASM loader can safely use importScripts in both
// Vite development and the production build.
importScripts('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.js')

let landmarker = null
let loading = null

const prepare = async () => {
  if (landmarker) return
  loading ??= (async () => {
    const vision = await Vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm')
    landmarker = await Vision.HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
        delegate: 'CPU',
      },
      runningMode: 'VIDEO',
      numHands: 2,
    })
  })()
  await loading
}

self.onmessage = async (event) => {
  const message = event.data
  if (message.type === 'close') {
    landmarker?.close()
    landmarker = null
    loading = null
    self.close()
    return
  }
  try {
    await prepare()
    if (message.type === 'init') {
      self.postMessage({ type: 'ready' })
      return
    }
    const result = landmarker.detectForVideo(message.bitmap, message.timestamp)
    self.postMessage({
      type: 'result',
      id: message.id,
      timestamp: message.timestamp,
      hands: result.landmarks.map((landmarks, index) => ({
        handedness: result.handedness[index]?.[0]?.categoryName ?? `hand-${index}`,
        landmarks: landmarks.map(({ x, y, z }) => ({ x, y, z })),
      })),
    })
  } catch (error) {
    // A failed initialization must be retryable after a transient CDN error.
    loading = null
    self.postMessage({ type: 'error', id: message.id, message: error instanceof Error ? error.message : 'Hand tracking failed' })
  } finally {
    message.bitmap?.close()
  }
}
