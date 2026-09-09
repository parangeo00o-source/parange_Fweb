import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'

type Point = { x: number; y: number }
type Fish = { x: number; y: number; vx: number; vy: number; size: number; color: string; phase: number; follow: number; variant: number; roamX: number; roamY: number }
type Bubble = { x: number; y: number; vx: number; vy: number; radius: number; life: number }

const colors = ['#d6fcff', '#83ecf4', '#54b8f3', '#71dac5', '#8b9df5', '#b093ed', '#6ac8e4']
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const length = (x: number, y: number) => Math.hypot(x, y)

export const createBluefishExperience = () => {
  const screen = document.createElement('section')
  screen.className = 'bluefish-screen'
  screen.setAttribute('aria-hidden', 'true')
  screen.innerHTML = `
    <video class="bluefish-camera" autoplay muted playsinline></video><canvas class="bluefish-canvas" aria-hidden="true"></canvas><div class="bluefish-wash"></div>
    <header class="bluefish-header"><p class="bluefish-word" aria-label="Bluefish"><i>B</i><i>l</i><i>u</i><i>e</i><i>f</i><i>i</i><i>s</i><i>h</i></p><span class="bluefish-header-hint">검지를 움직여 물고기 떼를 이끌어 보세요</span></header>
    <p class="bluefish-status">손가락 끝을 인식하는 중</p><button class="bluefish-start" type="button">카메라 켜기</button><button class="bluefish-close" type="button" aria-label="주사위 화면으로 돌아가기">×</button>
  `
  document.body.append(screen)

  const video = screen.querySelector<HTMLVideoElement>('.bluefish-camera')!
  const canvas = screen.querySelector<HTMLCanvasElement>('.bluefish-canvas')!
  const context = canvas.getContext('2d', { alpha: true })!
  const startButton = screen.querySelector<HTMLButtonElement>('.bluefish-start')!
  const closeButton = screen.querySelector<HTMLButtonElement>('.bluefish-close')!
  const status = screen.querySelector<HTMLElement>('.bluefish-status')!
  const fish: Fish[] = []
  const bubbles: Bubble[] = []
  const fishSprites = new Image()
  const spriteCanvas = document.createElement('canvas')
  const spriteContext = spriteCanvas.getContext('2d', { willReadFrequently: true })!
  let spritesReady = false
  fishSprites.addEventListener('load', () => {
    spriteCanvas.width = fishSprites.naturalWidth
    spriteCanvas.height = fishSprites.naturalHeight
    spriteContext.drawImage(fishSprites, 0, 0)
    // The source's display checkerboard is flattened by the generator; key it
    // out once so only the photoreal fish are composited over the camera.
    const pixels = spriteContext.getImageData(0, 0, spriteCanvas.width, spriteCanvas.height)
    for (let pixel = 0; pixel < pixels.data.length; pixel += 4) {
      const red = pixels.data[pixel]; const green = pixels.data[pixel + 1]; const blue = pixels.data[pixel + 2]
      if (Math.max(red, green, blue) - Math.min(red, green, blue) < 8 && (red + green + blue) / 3 > 165) pixels.data[pixel + 3] = 0
    }
    spriteContext.putImageData(pixels, 0, 0)
    spritesReady = true
  })
  fishSprites.src = '/bluefish/fish-sprites.png'
  let stream: MediaStream | null = null
  let landmarker: HandLandmarker | null = null
  let open = false
  let tracking = false
  let frame = 0
  let lastTime = 0
  let lastInferenceAt = 0
  let lastVideoTime = -1
  let lastBubbleAt = 0
  let pointer: Point | null = null
  let pointerTarget: Point | null = null
  let pointing = false
  let direction = { x: 0, y: -1 }
  let canvasWidth = 0
  let canvasHeight = 0
  let fishId = 0
  let shoalAnchor: Point = { x: 0, y: 0 }

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
    const width = Math.round(window.innerWidth * ratio)
    const height = Math.round(window.innerHeight * ratio)
    if (width === canvas.width && height === canvas.height) return
    canvas.width = width; canvas.height = height
    canvasWidth = window.innerWidth; canvasHeight = window.innerHeight
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
  }
  const makeFish = (): Fish => {
    const horizontalDirection = Math.random() < .5 ? 0 : Math.PI
    const angle = horizontalDirection + (Math.random() - .5) * .48
    const speed = 18 + Math.random() * 30
    const x = Math.random() * canvasWidth
    const y = Math.random() * canvasHeight
    return { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: 9 + Math.random() * 10, color: colors[Math.floor(Math.random() * colors.length)], phase: Math.random() * Math.PI * 2, follow: .5 + Math.random() * .7, variant: fishId++, roamX: x, roamY: y }
  }
  const resetFish = () => {
    fish.splice(0)
    fishId = 0
    shoalAnchor = { x: canvasWidth * .5, y: canvasHeight * .53 }
    for (let index = 0; index < 100; index += 1) fish.push(makeFish())
  }
  const mapPoint = (landmark: { x: number; y: number }): Point => ({ x: (1 - landmark.x) * canvasWidth, y: landmark.y * canvasHeight })
  const inferHand = (now: number) => {
    if (!landmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || now - lastInferenceAt < 42 || video.currentTime === lastVideoTime) return
    lastInferenceAt = now; lastVideoTime = video.currentTime
    const landmarks = landmarker.detectForVideo(video, now).landmarks[0]
    if (!landmarks) { pointerTarget = null; pointing = false; return }
    const index = mapPoint(landmarks[8])
    const knuckle = mapPoint(landmarks[5])
    pointerTarget = index
    const dx = index.x - knuckle.x; const dy = index.y - knuckle.y
    const reach = length(dx, dy)
    if (reach > 1) direction = { x: dx / reach, y: dy / reach }
    const wrist = landmarks[0]
    const indexReach = Math.hypot(landmarks[8].x - wrist.x, landmarks[8].y - wrist.y)
    const foldedReach = (Math.hypot(landmarks[12].x - wrist.x, landmarks[12].y - wrist.y) + Math.hypot(landmarks[16].x - wrist.x, landmarks[16].y - wrist.y) + Math.hypot(landmarks[20].x - wrist.x, landmarks[20].y - wrist.y)) / 3
    pointing = indexReach > foldedReach * 1.18 && reach > 35
  }
  const spawnCurrent = (now: number) => {
    if (!pointing || !pointer || now - lastBubbleAt < 65) return
    lastBubbleAt = now
    for (let index = 0; index < 3; index += 1) {
      const spread = (Math.random() - .5) * 28
      bubbles.push({ x: pointer.x - direction.x * (20 + Math.random() * 52) + direction.y * spread, y: pointer.y - direction.y * (20 + Math.random() * 52) - direction.x * spread, vx: -direction.x * (38 + Math.random() * 62) + (Math.random() - .5) * 22, vy: -direction.y * (38 + Math.random() * 62) - 18 + (Math.random() - .5) * 22, radius: 2 + Math.random() * 5, life: 1 })
    }
    if (bubbles.length > 90) bubbles.splice(0, bubbles.length - 90)
  }
  const updateFish = (delta: number, now: number) => {
    if (pointerTarget) {
      if (!pointer) pointer = { ...pointerTarget }
      pointer.x += (pointerTarget.x - pointer.x) * Math.min(1, delta * 7)
      pointer.y += (pointerTarget.y - pointer.y) * Math.min(1, delta * 7)
    } else pointer = null
    const hasFinger = pointer !== null
    const ringRadius = clamp(Math.min(canvasWidth, canvasHeight) * .2, 78, 170)
    if (pointer) {
      // Constrain the ring centre so even a fingertip near an edge keeps the
      // whole school inside the live frame.
      shoalAnchor.x += (pointer.x - shoalAnchor.x) * Math.min(1, delta * 8.2)
      shoalAnchor.y += (pointer.y - shoalAnchor.y) * Math.min(1, delta * 8.2)
      shoalAnchor.x = clamp(shoalAnchor.x, ringRadius + 24, canvasWidth - ringRadius - 24)
      shoalAnchor.y = clamp(shoalAnchor.y, ringRadius + 24, canvasHeight - ringRadius - 24)
    }
    for (let index = 0; index < fish.length; index += 1) {
      const item = fish[index]
      if (hasFinger) {
        // 100 evenly spaced slots lock the group into a clean circular band.
        // Increasing the angle in screen coordinates creates clockwise motion.
        const orbit = item.variant / fish.length * Math.PI * 2 + now / 1_800
        const radius = ringRadius + ((item.variant % 5) - 2) * 2
        const targetX = shoalAnchor.x + Math.cos(orbit) * radius
        const targetY = shoalAnchor.y + Math.sin(orbit) * radius
        const moveX = targetX - item.x
        const moveY = targetY - item.y
        const distance = Math.max(length(moveX, moveY), 1)
        const approachX = moveX / distance
        const approachY = moveY / distance
        const forming = clamp(distance / (radius * .62), 0, 1)
        const tangentX = -Math.sin(orbit)
        const tangentY = Math.cos(orbit)
        // Each fish turns gradually from its present heading, adding a small
        // clockwise curl. The approach reads as swimming, not magnetism.
        const curl = .24 + (1 - forming) * .76
        const wishX = approachX * forming + tangentX * curl
        const wishY = approachY * forming + tangentY * curl
        const wishLength = Math.max(length(wishX, wishY), .001)
        const swimSpeed = radius / 1.8 + Math.min(95, distance * .22)
        const turn = Math.min(1, delta * 2.35)
        item.vx += (wishX / wishLength * swimSpeed - item.vx) * turn
        item.vy += (wishY / wishLength * swimSpeed - item.vy) * turn
        item.x += item.vx * delta
        item.y += item.vy * delta
        const padding = item.size * 1.9
        item.x = clamp(item.x, padding, canvasWidth - padding)
        item.y = clamp(item.y, padding, canvasHeight - padding)
        continue
      }
      let alignX = 0; let alignY = 0; let centerX = 0; let centerY = 0; let separateX = 0; let separateY = 0; let neighbors = 0
      for (let otherIndex = 0; otherIndex < fish.length; otherIndex += 1) {
        if (otherIndex === index) continue
        const other = fish[otherIndex]; const dx = other.x - item.x; const dy = other.y - item.y; const distance = length(dx, dy)
        if (distance > 118) continue
        alignX += other.vx; alignY += other.vy; centerX += other.x; centerY += other.y; neighbors += 1
        if (distance < 26 && distance > .001) { separateX -= dx / distance * (26 - distance); separateY -= dy / distance * (26 - distance) }
      }
      if (neighbors) {
        alignX = alignX / neighbors - item.vx; alignY = alignY / neighbors - item.vy
        centerX = centerX / neighbors - item.x; centerY = centerY / neighbors - item.y
        const flockWeight = hasFinger ? 1 : .2
        item.vx += (alignX * (.026 * flockWeight) + centerX * (.011 * flockWeight) + separateX * .14) * delta * 60
        item.vy += (alignY * (.026 * flockWeight) + centerY * (.011 * flockWeight) + separateY * .14) * delta * 60
      }
      // Gentle curved wandering keeps an idle shoal from moving mechanically.
      item.vx += Math.cos(now / 900 + item.phase) * .22 * delta * 60
      item.vy += Math.sin(now / 730 + item.phase) * .035 * delta * 60
      if (hasFinger) {
        // Each fish owns a position on one rotating ring, which preserves a
        // distinct circular band instead of collapsing into a central clump.
        const orbit = item.phase + now / (pointing ? 520 : 760)
        const targetX = shoalAnchor.x + Math.cos(orbit) * ringRadius
        const targetY = shoalAnchor.y + Math.sin(orbit) * ringRadius
        const dx = targetX - item.x; const dy = targetY - item.y; const distance = Math.max(length(dx, dy), 1)
        const tangentX = -Math.sin(orbit); const tangentY = Math.cos(orbit)
        const pull = pointing ? 1.7 : 1.18
        item.vx += (dx / distance * pull * item.follow + tangentX * .36) * delta * 60
        item.vy += (dy / distance * pull * item.follow + tangentY * .36) * delta * 60
      } else {
        // Without a hand, every fish returns to a different moving territory
        // so the school naturally disperses across the complete frame.
        const padding = item.size * 1.9
      const targetX = clamp(item.roamX + Math.sin(now / 2_100 + item.phase) * Math.min(150, canvasWidth * .2), padding, canvasWidth - padding)
      const targetY = clamp(item.roamY + Math.cos(now / 2_700 + item.phase * 1.4) * Math.min(26, canvasHeight * .035), padding, canvasHeight - padding)
      const dx = targetX - item.x; const dy = targetY - item.y; const distance = Math.max(length(dx, dy), 1)
      item.vx += dx / distance * .2 * delta * 60
      item.vy += dy / distance * .055 * delta * 60
      item.vy *= .97
      }
      const maxSpeed = pointing ? 235 : pointer ? 165 : 58
      const speed = length(item.vx, item.vy) || 1
      const minSpeed = pointing ? 92 : pointer ? 62 : 19
      if (speed > maxSpeed) { item.vx = item.vx / speed * maxSpeed; item.vy = item.vy / speed * maxSpeed }
      else if (speed < minSpeed) { item.vx = item.vx / speed * minSpeed; item.vy = item.vy / speed * minSpeed }
      const padding = item.size * 1.9
      // Keep every silhouette inside the viewport instead of wrapping around.
      if (item.x < padding) item.vx += (padding - item.x) * .8 * delta * 60
      if (item.x > canvasWidth - padding) item.vx -= (item.x - (canvasWidth - padding)) * .8 * delta * 60
      if (item.y < padding) item.vy += (padding - item.y) * .8 * delta * 60
      if (item.y > canvasHeight - padding) item.vy -= (item.y - (canvasHeight - padding)) * .8 * delta * 60
      item.x = clamp(item.x + item.vx * delta, padding, canvasWidth - padding)
      item.y = clamp(item.y + item.vy * delta, padding, canvasHeight - padding)
    }
  }
  const drawPhotoFish = (item: Fish) => {
    if (!spritesReady) return
    const angle = Math.atan2(item.vy, item.vx)
    const sourceColumns = 4
    const sourceRows = 4
    const spriteIndex = item.variant % (sourceColumns * sourceRows)
    const sourceWidth = spriteCanvas.width / sourceColumns
    const sourceHeight = spriteCanvas.height / sourceRows
    const width = item.size * 3.35
    const height = item.size * 2.52
    context.save()
    context.translate(item.x, item.y)
    context.rotate(angle)
    context.globalAlpha = .98
    context.drawImage(spriteCanvas, (spriteIndex % sourceColumns) * sourceWidth, Math.floor(spriteIndex / sourceColumns) * sourceHeight, sourceWidth, sourceHeight, -width / 2, -height / 2, width, height)
    context.restore()
  }
  const draw = (delta: number) => {
    context.clearRect(0, 0, canvasWidth, canvasHeight)
    if (pointing && pointer) {
      context.save(); context.globalAlpha = .16; context.strokeStyle = '#c8fbff'; context.lineWidth = 2
      for (let index = 0; index < 4; index += 1) { const offset = (index - 1.5) * 12; context.beginPath(); context.moveTo(pointer.x - direction.x * 120 + direction.y * offset, pointer.y - direction.y * 120 - direction.x * offset); context.lineTo(pointer.x + direction.x * 74 + direction.y * offset, pointer.y + direction.y * 74 - direction.x * offset); context.stroke() }
      context.restore()
    }
    fish.forEach((item) => drawPhotoFish(item))
    for (let index = bubbles.length - 1; index >= 0; index -= 1) {
      const bubble = bubbles[index]; bubble.x += bubble.vx * delta; bubble.y += bubble.vy * delta; bubble.life -= delta * .8
      context.globalAlpha = Math.max(0, bubble.life) * .72; context.strokeStyle = '#d8faff'; context.lineWidth = 1.3; context.beginPath(); context.arc(bubble.x, bubble.y, bubble.radius, 0, Math.PI * 2); context.stroke()
      if (bubble.life <= 0) bubbles.splice(index, 1)
    }
    context.globalAlpha = 1
  }
  const run = (now: number) => {
    if (!open) return
    resize()
    const delta = Math.min((now - lastTime) / 1000 || 0, .05); lastTime = now
    if (tracking) inferHand(now)
    updateFish(delta, now); spawnCurrent(now); draw(delta)
    frame = requestAnimationFrame(run)
  }
  const startCamera = async () => {
    if (tracking) return
    startButton.disabled = true; startButton.textContent = '카메라 연결 중…'
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: false })
      video.srcObject = stream; await video.play()
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm')
      landmarker = await HandLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task' }, runningMode: 'VIDEO', numHands: 1 })
      tracking = true; startButton.classList.add('is-hidden'); status.classList.add('is-hidden'); screen.classList.add('is-tracking')
    } catch (error) { console.error(error); startButton.disabled = false; startButton.textContent = '카메라 다시 켜기' }
  }
  startButton.addEventListener('click', startCamera)
  closeButton.addEventListener('click', () => history.back())
  return {
    open: () => { open = true; resize(); resetFish(); screen.classList.add('is-open'); screen.setAttribute('aria-hidden', 'false'); lastTime = performance.now(); frame = requestAnimationFrame(run); closeButton.focus() },
    close: () => {
      open = false; cancelAnimationFrame(frame); screen.classList.remove('is-open', 'is-tracking'); screen.setAttribute('aria-hidden', 'true'); tracking = false
      landmarker?.close(); landmarker = null; stream?.getTracks().forEach((track) => track.stop()); stream = null; video.srcObject = null
      pointer = null; pointerTarget = null; pointing = false; bubbles.splice(0); startButton.disabled = false; startButton.textContent = '카메라 켜기'; startButton.classList.remove('is-hidden'); status.classList.remove('is-hidden')
    },
  }
}
