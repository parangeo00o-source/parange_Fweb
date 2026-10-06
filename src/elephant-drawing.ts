import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { revealOnFirstVideoFrame } from './camera-page'

type Point = { x: number; y: number }

// Bright toy colours sampled from the supplied lime, mint, yellow, pink, and
// violet reference graphic. They stay legible over the live camera feed.
const colors = ['#B8F46A', '#78E2D4', '#FFD14A', '#FF5DC5', '#A752DD']
const distance = (first: { x: number; y: number }, second: { x: number; y: number }) => Math.hypot(first.x - second.x, first.y - second.y)

export const createElephantDrawingExperience = () => {
  const screen = document.createElement('section')
  screen.className = 'elephant-draw-screen'
  screen.setAttribute('aria-hidden', 'true')
  screen.innerHTML = `
    <svg class="elephant-vhs-filter-definitions" aria-hidden="true" focusable="false">
      <filter id="elephant-camcorder-grade" color-interpolation-filters="sRGB">
        <feColorMatrix type="matrix" values=".87 .056 .035 0 .011 .021 .923 .077 0 .011 .014 .105 .944 0 .014 0 0 0 1 0" />
      </filter>
    </svg>
    <div class="elephant-board" aria-label="코끼리 드로잉 보드">
      <div class="elephant-head" aria-hidden="true"></div>
      <div class="elephant-ear" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <div class="elephant-eye" aria-hidden="true"></div><div class="elephant-trunk" aria-hidden="true"></div>
      <div class="elephant-pen" aria-hidden="true"><i></i><b></b></div>
      <header class="elephant-toolbar">
        <button class="elephant-clear" type="button" aria-label="전체 지우기">♥<span>Clear</span></button>
        <button class="elephant-brush" type="button" aria-label="펜 굵기 변경">▲<span>Pen</span></button>
        <div class="elephant-dials" role="group" aria-label="펜 색상 선택">
          ${colors.map((color, index) => `<button class="elephant-dial${index === 0 ? ' is-selected' : ''}" type="button" data-color="${color}" aria-label="${index + 1}번 펜 색상" style="--dial-color:${color}"><i></i></button>`).join('')}
        </div>
      </header>
      <div class="elephant-canvas-frame">
        <video class="elephant-camera" autoplay muted playsinline></video>
        <canvas class="elephant-camera-texture" aria-hidden="true"></canvas>
        <div class="elephant-vhs-overlay" aria-hidden="true"></div>
        <canvas class="elephant-canvas" aria-label="그림판. 마우스 또는 터치로 그림을 그릴 수 있습니다."></canvas>
        <div class="elephant-stylus" aria-hidden="true">●</div>
      </div>
      <p class="elephant-status is-hidden" role="status"></p>
      <div class="elephant-sticker" aria-hidden="true">✦</div>
      <div class="elephant-foot" aria-hidden="true"></div>
      <div class="elephant-camera-panel"><button class="elephant-camera-start" type="button">Turn On Camera</button></div>
      <button class="elephant-close" type="button" aria-label="주사위 화면으로 돌아가기">×</button>
    </div>
  `
  document.body.append(screen)

  const board = screen.querySelector<HTMLElement>('.elephant-board')!
  const canvas = screen.querySelector<HTMLCanvasElement>('.elephant-canvas')!
  const context = canvas.getContext('2d', { alpha: true })!
  const video = screen.querySelector<HTMLVideoElement>('.elephant-camera')!
  const cameraTexture = screen.querySelector<HTMLCanvasElement>('.elephant-camera-texture')!
  const cameraTextureContext = cameraTexture.getContext('2d', { alpha: false })!
  const status = screen.querySelector<HTMLElement>('.elephant-status')!
  const stylus = screen.querySelector<HTMLElement>('.elephant-stylus')!
  const startButton = screen.querySelector<HTMLButtonElement>('.elephant-camera-start')!
  const closeButton = screen.querySelector<HTMLButtonElement>('.elephant-close')!
  const brushButton = screen.querySelector<HTMLButtonElement>('.elephant-brush')!
  const dialButtons = [...screen.querySelectorAll<HTMLButtonElement>('.elephant-dial')]
  let stream: MediaStream | null = null
  let outputStream: MediaStream | null = null
  let landmarker: HandLandmarker | null = null
  let open = false
  let tracking = false
  let frame: number | null = null
  let clearFrame = 0
  let lastInferenceAt = 0
  let lastVideoTime = -1
  let previousPoint: Point | null = null
  let smoothedPoint: Point | null = null
  let lastDrawingGestureAt = 0
  let lastHandSeenAt = 0
  let lastTrackedPoint: Point | null = null
  let lastTrackedAt = 0
  let fingertipVelocity: Point = { x: 0, y: 0 }
  let penDown = false
  let pointerDrawing = false
  let hasStartedDrawing = false
  let brushColor = colors[0]
  let brushWidth = 3.2
  let canvasRatio = 1
  let statusTimer: number | undefined

  const resizeCanvas = () => {
    const bounds = canvas.getBoundingClientRect()
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const width = Math.max(1, Math.round(bounds.width * ratio))
    const height = Math.max(1, Math.round(bounds.height * ratio))
    if (canvas.width === width && canvas.height === height) return
    const snapshot = document.createElement('canvas')
    snapshot.width = canvas.width
    snapshot.height = canvas.height
    snapshot.getContext('2d')?.drawImage(canvas, 0, 0)
    canvas.width = width
    canvas.height = height
    canvasRatio = ratio
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    if (snapshot.width && snapshot.height) context.drawImage(snapshot, 0, 0, snapshot.width, snapshot.height, 0, 0, bounds.width, bounds.height)
  }
  const renderCameraTexture = () => {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return
    const bounds = cameraTexture.getBoundingClientRect()
    // A small, deliberately lower-resolution backing store is scaled back to
    // the LCD window. This produces the soft, merged detail of a camcorder
    // display instead of a CSS-only blur over a sharp modern video frame.
    const textureScale = .54
    const width = Math.max(1, Math.round(bounds.width * textureScale))
    const height = Math.max(1, Math.round(bounds.height * textureScale))
    if (cameraTexture.width !== width || cameraTexture.height !== height) {
      cameraTexture.width = width
      cameraTexture.height = height
    }
    const sourceAspect = video.videoWidth / video.videoHeight
    const destinationAspect = width / height
    let sourceX = 0
    let sourceY = 0
    let sourceWidth = video.videoWidth
    let sourceHeight = video.videoHeight
    if (sourceAspect > destinationAspect) {
      sourceWidth = sourceHeight * destinationAspect
      sourceX = (video.videoWidth - sourceWidth) / 2
    } else if (sourceAspect < destinationAspect) {
      sourceHeight = sourceWidth / destinationAspect
      sourceY = (video.videoHeight - sourceHeight) / 2
    }
    cameraTextureContext.imageSmoothingEnabled = true
    cameraTextureContext.imageSmoothingQuality = 'low'
    cameraTextureContext.setTransform(-1, 0, 0, 1, width, 0)
    cameraTextureContext.drawImage(video, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height)
    cameraTextureContext.setTransform(1, 0, 0, 1, 0, 0)
  }
  const pointFromClient = (clientX: number, clientY: number): Point => {
    const bounds = canvas.getBoundingClientRect()
    return { x: Math.max(0, Math.min(bounds.width, clientX - bounds.left)), y: Math.max(0, Math.min(bounds.height, clientY - bounds.top)) }
  }
  const showStylus = (point: Point | null) => {
    if (!point) { stylus.classList.remove('is-visible'); return }
    stylus.style.transform = `translate(${point.x}px, ${point.y}px)`
    stylus.classList.add('is-visible')
  }
  const setStatus = (text: string, down = false) => {
    if (statusTimer !== undefined) window.clearTimeout(statusTimer)
    statusTimer = undefined
    status.textContent = text
    status.classList.toggle('is-down', down)
    status.classList.toggle('is-hidden', !text)
  }
  const showHint = (text: string, duration = 5000) => {
    setStatus(text)
    statusTimer = window.setTimeout(() => setStatus(''), duration)
  }
  // The green plastic camera control is also the compact live-state display.
  // Keeping it as one physical button avoids creating a second, floating
  // status chip over the board while the user is drawing.
  const setCameraButtonLabel = (text: string, isDrawing = false) => {
    startButton.textContent = text
    startButton.classList.toggle('is-drawing', isDrawing)
  }
  const strokeTo = (point: Point) => {
    if (!previousPoint) { previousPoint = { ...point }; return }
    context.save()
    context.globalCompositeOperation = 'source-over'
    // Keep the selected toy colour pure: the webcam drawing must not gain a
    // dark outline that changes its selected brush colour.
    // Lay a broad colour-matched light underneath the crisp centre stroke.
    // Both layers use the selected brush colour; there is no dark outline.
    context.strokeStyle = brushColor
    context.globalAlpha = .88
    context.lineWidth = brushWidth * 5.2
    context.shadowColor = brushColor
    context.shadowBlur = Math.max(32, brushWidth * 10)
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.beginPath()
    context.moveTo(previousPoint.x, previousPoint.y)
    // Canvas rasterizes this segment continuously, which is the same linear
    // interpolation as manually adding every 2px point without the per-frame
    // JavaScript loop that caused unnecessary work during fast drawing.
    context.lineTo(point.x, point.y)
    context.stroke()
    context.globalAlpha = 1
    context.lineWidth = brushWidth * 1.3
    context.shadowBlur = Math.max(18, brushWidth * 5.4)
    context.stroke()
    context.restore()
    // `smoothedPoint` is mutated on every hand frame. Keep a distinct copy so
    // the next segment starts at the actual previous position, not the newly
    // mutated one (which would collapse it into a dot).
    previousPoint = { ...point }
  }
  const penUp = (keepStylus = false) => {
    previousPoint = null
    smoothedPoint = null
    lastTrackedPoint = null
    lastTrackedAt = 0
    fingertipVelocity = { x: 0, y: 0 }
    penDown = false
    if (!keepStylus) showStylus(null)
  }
  const isFingertipReady = (landmarks: Array<{ x: number; y: number }>) => {
    // Start from the index-tip landmark itself rather than requiring every
    // index joint and the other fingers to be clearly framed.
    const palmSize = Math.max(distance(landmarks[0], landmarks[9]), .001)
    return distance(landmarks[8], landmarks[0]) > palmSize * 1.18
  }
  const isClosedFist = (landmarks: Array<{ x: number; y: number }>) => {
    const palmSize = Math.max(distance(landmarks[0], landmarks[9]), .001)
    // Keep a real, tightly closed fist as pen-up without misclassifying a
    // partially framed index tip as a fist.
    return [8, 12, 16, 20].every((tip) => distance(landmarks[tip], landmarks[0]) < palmSize * 1.05)
  }
  const trackHand = (now: number) => {
    // The video timestamp guard prevents duplicate inference. Matching the
    // 30fps camera cadence keeps the pen responsive without redundant model
    // passes or a 60fps camera stream warming the device.
    if (!tracking || !landmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || now - lastInferenceAt < 30 || video.currentTime === lastVideoTime) return
    lastInferenceAt = now
    lastVideoTime = video.currentTime
    const landmarks = landmarker.detectForVideo(video, now).landmarks[0]
    if (!landmarks) {
      const missingFor = now - lastHandSeenAt
      // Fill the very short gaps common at frame edges with a decaying
      // continuation from the last measured fingertip velocity. This is only
      // for transient detector loss; it stops well before a real hand exit.
      if (penDown && lastTrackedPoint && previousPoint && missingFor <= 120) {
        const travel = Math.min(missingFor, 110)
        const fade = 1 - missingFor / 150
        const bounds = canvas.getBoundingClientRect()
        const predicted = {
          x: Math.max(0, Math.min(bounds.width, lastTrackedPoint.x + fingertipVelocity.x * travel * fade)),
          y: Math.max(0, Math.min(bounds.height, lastTrackedPoint.y + fingertipVelocity.y * travel * fade)),
        }
        showStylus(predicted)
        strokeTo(predicted)
      }
      if (missingFor > 750) penUp()
      return
    }
    lastHandSeenAt = now
    const bounds = canvas.getBoundingClientRect()
    const tip = landmarks[8]
    // The preview preserves the camera's native aspect ratio with
    // `object-fit: cover`. Translate the MediaPipe point through that same
    // centre crop so the finger and drawing cursor remain aligned.
    const videoAspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9
    const frameAspect = bounds.width / Math.max(bounds.height, 1)
    let mappedX = 1 - tip.x
    let mappedY = tip.y
    if (videoAspect > frameAspect) {
      const scale = videoAspect / frameAspect
      mappedX = mappedX * scale - (scale - 1) / 2
    } else if (videoAspect < frameAspect) {
      const scale = frameAspect / videoAspect
      mappedY = mappedY * scale - (scale - 1) / 2
    }
    mappedX = Math.max(0, Math.min(1, mappedX))
    mappedY = Math.max(0, Math.min(1, mappedY))
    const point = { x: mappedX * bounds.width, y: mappedY * bounds.height }
    if (lastTrackedPoint && lastTrackedAt) {
      const elapsed = Math.max(1, now - lastTrackedAt)
      const measuredVelocity = { x: (point.x - lastTrackedPoint.x) / elapsed, y: (point.y - lastTrackedPoint.y) / elapsed }
      fingertipVelocity = {
        x: fingertipVelocity.x * .25 + measuredVelocity.x * .75,
        y: fingertipVelocity.y * .25 + measuredVelocity.y * .75,
      }
    }
    lastTrackedPoint = { ...point }
    lastTrackedAt = now
    showStylus(point)
    const fingertipReady = isFingertipReady(landmarks)
    if (isClosedFist(landmarks) && !fingertipReady) {
      penUp(true)
      return
    }
    // A visible index tip begins the stroke. The other fingers no longer need
    // to be fully shown, so drawing can start with the fingertip near an edge.
    if (!fingertipReady && !penDown) {
      penUp(true)
      return
    }
    // Once a valid index-only stroke starts, retain it through brief landmark
    // jitter. A real fist still ends instantly above; a sustained pose change
    // ends after this grace window instead of producing dotted segments.
    if (fingertipReady) lastDrawingGestureAt = now
    else if (now - lastDrawingGestureAt > 600) {
      penUp(true)
      return
    }
    penDown = true
    // Linear interpolation in `strokeTo` already guarantees a connected line,
    // so do not delay the visual cursor with an extra tracking filter.
    smoothedPoint = { ...point }
    if (!hasStartedDrawing) {
      hasStartedDrawing = true
      setCameraButtonLabel('Drawing', true)
    }
    strokeTo(smoothedPoint)
  }
  const animate = (now: number) => {
    if (!open || !tracking) {
      frame = null
      return
    }
    renderCameraTexture()
    trackHand(now)
    frame = requestAnimationFrame(animate)
  }
  const startCamera = async () => {
    if (tracking) return
    startButton.disabled = true
    setCameraButtonLabel('Connecting Camera…')
    // This guidance is intentionally triggered on the click, rather than
    // after MediaPipe finishes loading, so it is immediately visible for the
    // requested five seconds.
    showHint('Raise your index finger to start drawing', 5000)
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API unavailable')
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: false })
      video.srcObject = stream
      await video.play()
      revealOnFirstVideoFrame(screen, video)
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm')
      landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task' },
        runningMode: 'VIDEO', numHands: 1,
        minHandDetectionConfidence: .28,
        minHandPresenceConfidence: .28,
        minTrackingConfidence: .28,
      })
      tracking = true
      startButton.disabled = false
      setCameraButtonLabel('Camera On')
      screen.classList.add('is-tracking')
      if (frame === null) frame = requestAnimationFrame(animate)
    } catch (error) {
      console.error(error)
      screen.classList.remove('is-camera-pending')
      stream?.getTracks().forEach((track) => track.stop())
      stream = null
      video.srcObject = null
      cameraTextureContext.clearRect(0, 0, cameraTexture.width, cameraTexture.height)
      startButton.disabled = false
      setCameraButtonLabel('Retry Camera')
      showHint('Camera unavailable — use mouse or touch.')
    }
  }
  const clearDrawing = () => {
    cancelAnimationFrame(clearFrame)
    previousPoint = null
    const startedAt = performance.now()
    const erase = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / 520)
      context.save()
      context.setTransform(canvasRatio, 0, 0, canvasRatio, 0, 0)
      context.globalCompositeOperation = 'destination-out'
      context.fillStyle = `rgba(0,0,0,${0.06 + progress * 0.17})`
      context.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight)
      context.restore()
      if (progress < 1) clearFrame = requestAnimationFrame(erase)
      else context.clearRect(0, 0, canvas.width, canvas.height)
    }
    clearFrame = requestAnimationFrame(erase)
  }

  const resizeObserver = new ResizeObserver(resizeCanvas)
  resizeObserver.observe(canvas)
  startButton.addEventListener('click', () => void startCamera())
  const cycleBrushWidth = () => {
    brushWidth = brushWidth === 3.2 ? 4.5 : brushWidth === 4.5 ? 6 : 3.2
    brushButton.dataset.width = String(brushWidth)
    showHint(`Brush size: ${brushWidth}px`, 1600)
  }
  brushButton.addEventListener('click', (event) => {
    event.stopPropagation()
    cycleBrushWidth()
  })
  const selectBrush = (index: number) => {
    const button = dialButtons[index]
    if (!button) return
    brushColor = button.dataset.color ?? colors[0]
    dialButtons.forEach((dial) => dial.classList.toggle('is-selected', dial === button))
  }
  // The image itself remains the visual control. This single board-level hit
  // test makes the heart and five printed stars work even if a decorative
  // layer sits above their transparent HTML hit targets.
  board.addEventListener('click', (event) => {
    const bounds = board.getBoundingClientRect()
    const x = (event.clientX - bounds.left) / bounds.width * 100
    const y = (event.clientY - bounds.top) / bounds.height * 100
    if (x >= 33.7 && x <= 40.9 && y >= 13.6 && y <= 23.3) {
      clearDrawing()
      return
    }
    // The printed triangle is wider than the original transparent hit target.
    // Cover its entire visual surface and keep the brush-width cycle available.
    if (x >= 76 && x <= 85.4 && y >= 13.2 && y <= 24.6) {
      cycleBrushWidth()
      return
    }
    if (x >= 47.1 && x <= 74.2 && y >= 15.5 && y <= 22.5) {
      const index = Math.min(4, Math.floor((x - 47.1) / (27.1 / 5)))
      selectBrush(index)
    }
  })
  canvas.addEventListener('pointerdown', (event) => {
    pointerDrawing = true
    canvas.setPointerCapture(event.pointerId)
    const point = pointFromClient(event.clientX, event.clientY)
    showStylus(point)
    if (!hasStartedDrawing) {
      hasStartedDrawing = true
      setCameraButtonLabel('Drawing', true)
    }
    previousPoint = point
  })
  canvas.addEventListener('pointermove', (event) => {
    if (!pointerDrawing) return
    const point = pointFromClient(event.clientX, event.clientY)
    showStylus(point)
    strokeTo(point)
  })
  const finishPointerStroke = () => {
    pointerDrawing = false
    penUp()
  }
  canvas.addEventListener('pointerup', finishPointerStroke)
  canvas.addEventListener('pointercancel', finishPointerStroke)
  closeButton.addEventListener('click', () => history.back())

  return {
    open: () => {
      open = true
      screen.classList.add('is-open')
      screen.classList.add('is-camera-pending')
      screen.setAttribute('aria-hidden', 'false')
      resizeCanvas()
      void startCamera()
      closeButton.focus()
    },
    close: () => {
      open = false
      if (frame !== null) cancelAnimationFrame(frame)
      frame = null
      cancelAnimationFrame(clearFrame)
      penUp()
      screen.classList.remove('is-open')
      screen.classList.remove('is-tracking')
      screen.setAttribute('aria-hidden', 'true')
      tracking = false
      hasStartedDrawing = false
      landmarker?.close()
      landmarker = null
      stream?.getTracks().forEach((track) => track.stop())
      stream = null
      video.srcObject = null
      cameraTextureContext.clearRect(0, 0, cameraTexture.width, cameraTexture.height)
      outputStream?.getTracks().forEach((track) => track.stop())
      outputStream = null
      lastVideoTime = -1
      startButton.disabled = false
      setCameraButtonLabel('Turn On Camera')
      startButton.classList.remove('is-hidden')
    },
    getRecordingStream: () => {
      if (!open || !canvas.captureStream) return null
      outputStream ??= canvas.captureStream(30)
      return outputStream
    },
    getRecordingCanvas: () => open ? canvas : null,
  }
}
