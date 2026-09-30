import { FaceLandmarker, FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'

type Point = { x: number; y: number }
type Fish = { x: number; y: number; vx: number; vy: number; size: number; phase: number; follow: number; variant: number; roamX: number; roamY: number; eating: boolean; breatheAt: number }
type Bubble = { x: number; y: number; vx: number; vy: number; radius: number; life: number; color: string }
type SpriteFrame = { image: HTMLCanvasElement; x: number; y: number; cellWidth: number; cellHeight: number }

const stitchColors = ['#e6505d', '#f2bd37', '#65a95e', '#3d79c9', '#c65b93']
const isolatedSpriteIndices = [0, 1, 2, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14]
// The colour treatment is calculated on sprite pixels once, rather than through
// CSS `filter`. This keeps the intended palette identical across browsers.
type FishColorGrade = { hue: number; saturation: number; brightness: number; contrast: number }
const fishColorGrades: FishColorGrade[] = [
  { hue: 205, saturation: 1.48, brightness: 1.05, contrast: 1.12 }, // electric blue
  { hue: 175, saturation: 1.36, brightness: 1.08, contrast: 1.12 }, // cyan
  { hue: 332, saturation: 1.5, brightness: 1.04, contrast: 1.12 },  // coral red
  { hue: 22, saturation: 1.5, brightness: 1.08, contrast: 1.12 },   // golden orange
  { hue: 82, saturation: 1.42, brightness: 1.08, contrast: 1.12 },  // lime green
  { hue: 286, saturation: 1.35, brightness: 1.08, contrast: 1.12 }, // violet pink
  { hue: 244, saturation: 1.32, brightness: 1.04, contrast: 1.12 }, // deep blue
  { hue: 0, saturation: .72, brightness: 1.26, contrast: .94 },     // translucent pearl
]
const fishBubbleColors = ['#d8f8ff', '#a7eaff', '#f6fbff', '#d9cbff']
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const length = (x: number, y: number) => Math.hypot(x, y)

const gradeSpritePixels = (context: CanvasRenderingContext2D, width: number, height: number, grade: FishColorGrade) => {
  const pixels = context.getImageData(0, 0, width, height)
  const data = pixels.data
  const radians = grade.hue * Math.PI / 180
  const cosine = Math.cos(radians), sine = Math.sin(radians)
  // CSS hue-rotate matrix coefficients, applied directly to sRGB pixel values.
  const hueMatrix = [
    .213 + cosine * .787 - sine * .213, .715 - cosine * .715 - sine * .715, .072 - cosine * .072 + sine * .928,
    .213 - cosine * .213 + sine * .143, .715 + cosine * .285 + sine * .14, .072 - cosine * .072 - sine * .283,
    .213 - cosine * .213 - sine * .787, .715 - cosine * .715 + sine * .715, .072 + cosine * .928 + sine * .072,
  ]
  for (let index = 0; index < data.length; index += 4) {
    if (!data[index + 3]) continue
    let red = data[index] / 255
    let green = data[index + 1] / 255
    let blue = data[index + 2] / 255
    red = (red - .5) * grade.contrast + .5
    green = (green - .5) * grade.contrast + .5
    blue = (blue - .5) * grade.contrast + .5
    const luminance = red * .213 + green * .715 + blue * .072
    red = (luminance + (red - luminance) * grade.saturation) * grade.brightness
    green = (luminance + (green - luminance) * grade.saturation) * grade.brightness
    blue = (luminance + (blue - luminance) * grade.saturation) * grade.brightness
    data[index] = clamp(hueMatrix[0] * red + hueMatrix[1] * green + hueMatrix[2] * blue, 0, 1) * 255
    data[index + 1] = clamp(hueMatrix[3] * red + hueMatrix[4] * green + hueMatrix[5] * blue, 0, 1) * 255
    data[index + 2] = clamp(hueMatrix[6] * red + hueMatrix[7] * green + hueMatrix[8] * blue, 0, 1) * 255
  }
  context.putImageData(pixels, 0, 0)
}

export const createBluefishExperience = () => {
  const screen = document.createElement('section')
  screen.className = 'bluefish-screen'
  screen.setAttribute('aria-hidden', 'true')
  screen.innerHTML = `
    <video class="bluefish-camera" autoplay muted playsinline></video><canvas class="bluefish-canvas" aria-hidden="true"></canvas><div class="bluefish-wash"></div>
    <p class="bluefish-status">손가락 끝을 인식하는 중</p><p class="bluefish-guide" aria-live="polite">검지를 움직여 물고기 떼를 이끌고, 입을 벌려 물고기를 먹어 보세요.</p><button class="bluefish-start" type="button">카메라 켜기</button><button class="bluefish-close" type="button" aria-label="주사위 화면으로 돌아가기">×</button>
  `
  document.body.append(screen)

  const video = screen.querySelector<HTMLVideoElement>('.bluefish-camera')!
  const canvas = screen.querySelector<HTMLCanvasElement>('.bluefish-canvas')!
  const context = canvas.getContext('2d', { alpha: true })!
  const recordingCanvas = document.createElement('canvas')
  const recordingContext = recordingCanvas.getContext('2d')!
  const startButton = screen.querySelector<HTMLButtonElement>('.bluefish-start')!
  const closeButton = screen.querySelector<HTMLButtonElement>('.bluefish-close')!
  const status = screen.querySelector<HTMLElement>('.bluefish-status')!
  const guide = screen.querySelector<HTMLElement>('.bluefish-guide')!
  const fish: Fish[] = []
  const bubbles: Bubble[] = []
  const fishSprites = new Image()
  const spriteCanvas = document.createElement('canvas')
  const spriteContext = spriteCanvas.getContext('2d')!
  const spriteFrames: SpriteFrame[] = []
  const tintedSpriteFrames = new Map<number, HTMLCanvasElement>()
  let spritesReady = false
  fishSprites.addEventListener('load', () => {
    spriteCanvas.width = fishSprites.naturalWidth
    spriteCanvas.height = fishSprites.naturalHeight
    spriteContext.drawImage(fishSprites, 0, 0)
    spriteFrames.splice(0)
    tintedSpriteFrames.clear()
    for (let row = 0; row < 4; row += 1) {
      for (let column = 0; column < 4; column += 1) {
        const left = Math.floor(column * spriteCanvas.width / 4)
        const right = Math.floor((column + 1) * spriteCanvas.width / 4)
        const top = Math.floor(row * spriteCanvas.height / 4)
        const bottom = Math.floor((row + 1) * spriteCanvas.height / 4)
        const cellWidth = right - left, cellHeight = bottom - top
        const cell = document.createElement('canvas')
        cell.width = cellWidth; cell.height = cellHeight
        const cellContext = cell.getContext('2d', { willReadFrequently: true })!
        cellContext.drawImage(spriteCanvas, left, top, cellWidth, cellHeight, 0, 0, cellWidth, cellHeight)
        const alpha = cellContext.getImageData(0, 0, cellWidth, cellHeight).data
        let minX = cellWidth, minY = cellHeight, maxX = -1, maxY = -1
        for (let pixel = 0; pixel < alpha.length; pixel += 4) {
          if (!alpha[pixel + 3]) continue
          const x = (pixel / 4) % cellWidth, y = Math.floor(pixel / 4 / cellWidth)
          minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y)
        }
        // Cache only the visible silhouette plus a small safety edge. The draw
        // coordinates below retain the exact original cell placement and scale.
        const padding = 2
        minX = Math.max(0, minX - padding); minY = Math.max(0, minY - padding)
        maxX = Math.min(cellWidth - 1, maxX + padding); maxY = Math.min(cellHeight - 1, maxY + padding)
        const frame = document.createElement('canvas')
        frame.width = Math.max(1, maxX - minX + 1); frame.height = Math.max(1, maxY - minY + 1)
        frame.getContext('2d')!.drawImage(cell, minX, minY, frame.width, frame.height, 0, 0, frame.width, frame.height)
        spriteFrames.push({ image: frame, x: minX, y: minY, cellWidth, cellHeight })
      }
    }
    spritesReady = true
  })
  fishSprites.src = `${import.meta.env.BASE_URL}bluefish/fish-sprites.png`
  let stream: MediaStream | null = null
  let landmarker: HandLandmarker | null = null
  let faceLandmarker: FaceLandmarker | null = null
  let open = false
  let tracking = false
  let frame = 0
  let lastTime = 0
  let lastInferenceAt = 0
  let lastFaceInferenceAt = 0
  let lastVideoTime = -1
  let lastFaceVideoTime = -1
  let lastRecordingCompositionAt = 0
  let lastBubbleAt = 0
  let lastFishBubbleScanAt = 0
  let pointer: Point | null = null
  let pointerTarget: Point | null = null
  let pointing = false
  let canvasWidth = 0
  let canvasHeight = 0
  let fishId = 0
  let shoalAnchor: Point = { x: 0, y: 0 }
  let mouthPoint: Point | null = null
  let mouthOpen = false
  let lastBiteAt = 0
  let outputStream: MediaStream | null = null
  let guideTimer: number | null = null
  let resizePending = true

  const requestResize = () => { resizePending = true }
  window.addEventListener('resize', requestResize, { passive: true })

  const resize = () => {
    if (!resizePending) return
    resizePending = false
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
    const width = Math.round(window.innerWidth * ratio)
    const height = Math.round(window.innerHeight * ratio)
    if (width === canvas.width && height === canvas.height) return
    canvas.width = width; canvas.height = height
    canvasWidth = window.innerWidth; canvasHeight = window.innerHeight
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.imageSmoothingEnabled = true
  }
  const composeRecording = () => {
    const width = Math.max(1, Math.round(canvasWidth))
    const height = Math.max(1, Math.round(canvasHeight))
    if (recordingCanvas.width !== width || recordingCanvas.height !== height) { recordingCanvas.width = width; recordingCanvas.height = height }
    recordingContext.clearRect(0, 0, width, height)
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth && video.videoHeight) {
      const scale = Math.max(width / video.videoWidth, height / video.videoHeight)
      const drawWidth = video.videoWidth * scale; const drawHeight = video.videoHeight * scale
      recordingContext.save(); recordingContext.translate(width, 0); recordingContext.scale(-1, 1)
      recordingContext.drawImage(video, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
      recordingContext.restore()
    }
    recordingContext.drawImage(canvas, 0, 0, width, height)
  }
  const makeFish = (): Fish => {
    const horizontalDirection = Math.random() < .5 ? 0 : Math.PI
    const angle = horizontalDirection + (Math.random() - .5) * .48
    const speed = 18 + Math.random() * 30
    const x = Math.random() * canvasWidth
    const y = Math.random() * canvasHeight
    return { x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size: 7.5 + Math.random() * 15.5, phase: Math.random() * Math.PI * 2, follow: .5 + Math.random() * .7, variant: fishId++, roamX: x, roamY: y, eating: false, breatheAt: performance.now() + Math.random() * 1200 }
  }
  const resetFish = () => {
    fish.splice(0)
    fishId = 0
    shoalAnchor = { x: canvasWidth * .5, y: canvasHeight * .53 }
    for (let index = 0; index < 65; index += 1) fish.push(makeFish())
  }
  const mapPoint = (landmark: { x: number; y: number }): Point => ({ x: (1 - landmark.x) * canvasWidth, y: landmark.y * canvasHeight })
  const inferHand = (now: number) => {
    if (!landmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || now - lastInferenceAt < 50 || video.currentTime === lastVideoTime) return
    lastInferenceAt = now; lastVideoTime = video.currentTime
    const landmarks = landmarker.detectForVideo(video, now).landmarks[0]
    if (!landmarks) { pointerTarget = null; pointing = false; return }
    const index = mapPoint(landmarks[8])
    const knuckle = mapPoint(landmarks[5])
    pointerTarget = index
    const dx = index.x - knuckle.x; const dy = index.y - knuckle.y
    const reach = length(dx, dy)
    const wrist = landmarks[0]
    const indexReach = Math.hypot(landmarks[8].x - wrist.x, landmarks[8].y - wrist.y)
    const foldedReach = (Math.hypot(landmarks[12].x - wrist.x, landmarks[12].y - wrist.y) + Math.hypot(landmarks[16].x - wrist.x, landmarks[16].y - wrist.y) + Math.hypot(landmarks[20].x - wrist.x, landmarks[20].y - wrist.y)) / 3
    pointing = indexReach > foldedReach * 1.18 && reach > 35
  }
  const inferFace = (now: number) => {
    if (!faceLandmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || now - lastFaceInferenceAt < 125 || video.currentTime === lastFaceVideoTime) return
    lastFaceInferenceAt = now; lastFaceVideoTime = video.currentTime
    const landmarks = faceLandmarker.detectForVideo(video, now).faceLandmarks[0]
    if (!landmarks) { mouthPoint = null; mouthOpen = false; return }
    const top = landmarks[13]
    const bottom = landmarks[14]
    const left = landmarks[78]
    const right = landmarks[308]
    const width = Math.max(Math.hypot(left.x - right.x, left.y - right.y), .001)
    const openness = Math.hypot(top.x - bottom.x, top.y - bottom.y)
    mouthPoint = mapPoint({ x: (top.x + bottom.x) / 2, y: (top.y + bottom.y) / 2 })
    mouthOpen = openness / width > .3
  }
  const startBite = (now: number) => {
    if (!mouthOpen || !mouthPoint || now - lastBiteAt < 700 || fish.some((item) => item.eating)) return
    let candidate: Fish | null = null
    let nearest = Math.min(canvasWidth, canvasHeight) * .42
    for (const item of fish) {
      const distance = length(item.x - mouthPoint.x, item.y - mouthPoint.y)
      if (distance < nearest) { nearest = distance; candidate = item }
    }
    if (candidate) candidate.eating = true
  }
  const spawnCurrent = (now: number) => {
    if (!pointer || now - lastBubbleAt < 105) return
    lastBubbleAt = now
    for (let index = 0; index < 2; index += 1) {
      bubbles.push({ x: pointer.x + (Math.random() - .5) * 14, y: pointer.y + (Math.random() - .5) * 14, vx: (Math.random() - .5) * 34, vy: -(24 + Math.random() * 48), radius: 3 + Math.random() * 8, life: 1, color: stitchColors[Math.floor(Math.random() * stitchColors.length)] })
    }
    if (bubbles.length > 72) bubbles.splice(0, bubbles.length - 72)
  }
  const spawnFishBubbles = (now: number) => {
    // Breathing is intentionally slow; sampling at 12 fps avoids a 65-item
    // scan on every render frame without changing the visible cadence.
    if (now - lastFishBubbleScanAt < 83) return
    lastFishBubbleScanAt = now
    for (const item of fish) {
      if (item.eating || now < item.breatheAt) continue
      item.breatheAt = now + 1250 + Math.random() * 1900
      const heading = Math.atan2(item.vy, item.vx)
      const mouthX = item.x + Math.cos(heading) * item.size * 1.7
      const mouthY = item.y + Math.sin(heading) * item.size * 1.7
      for (let bubbleIndex = 0; bubbleIndex < 4; bubbleIndex += 1) {
        bubbles.push({
          x: mouthX + (Math.random() - .5) * 9,
          y: mouthY + (Math.random() - .5) * 7,
          vx: (Math.random() - .5) * 18,
          vy: -(24 + Math.random() * 35),
          radius: 1.8 + Math.random() * 2.8,
          life: .78 + Math.random() * .42,
          color: fishBubbleColors[(item.variant + bubbleIndex) % fishBubbleColors.length],
        })
      }
    }
    if (bubbles.length > 150) bubbles.splice(0, bubbles.length - 150)
  }
  const updateFish = (delta: number, now: number) => {
    if (pointerTarget) {
      if (!pointer) pointer = { ...pointerTarget }
      pointer.x += (pointerTarget.x - pointer.x) * Math.min(1, delta * 7)
      pointer.y += (pointerTarget.y - pointer.y) * Math.min(1, delta * 7)
    } else pointer = null
    const hasFinger = pointer !== null
    const ringRadius = clamp(Math.min(canvasWidth, canvasHeight) * .2, 78, 170)
    // The idle flock only reacts to neighbours within 118px. A tiny spatial
    // grid therefore produces the same local behaviour without comparing every
    // fish against all 64 others every animation frame.
    const neighbourCell = 118
    const neighbourBuckets = new Map<string, Fish[]>()
    if (!hasFinger) {
      for (const item of fish) {
        const key = `${Math.floor(item.x / neighbourCell)}:${Math.floor(item.y / neighbourCell)}`
        const bucket = neighbourBuckets.get(key)
        if (bucket) bucket.push(item)
        else neighbourBuckets.set(key, [item])
      }
    }
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
      if (item.eating) {
        if (!mouthOpen || !mouthPoint) item.eating = false
        else {
          const dx = mouthPoint.x - item.x; const dy = mouthPoint.y - item.y
          const distance = Math.max(length(dx, dy), 1)
          const desiredSpeed = Math.min(220, 76 + distance * .5)
          item.vx += (dx / distance * desiredSpeed - item.vx) * Math.min(1, delta * 3.2)
          item.vy += (dy / distance * desiredSpeed - item.vy) * Math.min(1, delta * 3.2)
          item.x += item.vx * delta; item.y += item.vy * delta
          if (distance < 20) {
            for (let bubble = 0; bubble < 7; bubble += 1) bubbles.push({ x: mouthPoint.x + (Math.random() - .5) * 16, y: mouthPoint.y + (Math.random() - .5) * 12, vx: (Math.random() - .5) * 70, vy: -(20 + Math.random() * 80), radius: 3 + Math.random() * 8, life: .9, color: stitchColors[Math.floor(Math.random() * stitchColors.length)] })
            fish.splice(index, 1); lastBiteAt = now; index -= 1
            continue
          }
          continue
        }
      }
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
      const bucketX = Math.floor(item.x / neighbourCell), bucketY = Math.floor(item.y / neighbourCell)
      for (let y = bucketY - 1; y <= bucketY + 1; y += 1) for (let x = bucketX - 1; x <= bucketX + 1; x += 1) {
        const nearby = neighbourBuckets.get(`${x}:${y}`)
        if (!nearby) continue
        for (const other of nearby) {
          if (other === item) continue
          const dx = other.x - item.x; const dy = other.y - item.y; const distance = length(dx, dy)
          if (distance > neighbourCell) continue
          alignX += other.vx; alignY += other.vy; centerX += other.x; centerY += other.y; neighbors += 1
          if (distance < 26 && distance > .001) { separateX -= dx / distance * (26 - distance); separateY -= dy / distance * (26 - distance) }
        }
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
  const drawDetailedFish = (item: Fish) => {
    if (!spritesReady || !spriteFrames.length) return
    const mostlyHorizontal = Math.abs(item.vx) > Math.abs(item.vy) * 1.6
    const angle = mostlyHorizontal ? 0 : Math.atan2(item.vy, item.vx)
    const spriteIndex = isolatedSpriteIndices[item.variant % isolatedSpriteIndices.length]
    const width = item.size * 4.1
    const height = item.size * 3.2
    let frame = tintedSpriteFrames.get(item.variant)
    const source = spriteFrames[spriteIndex]
    if (!frame) {
      frame = document.createElement('canvas')
      frame.width = source.image.width; frame.height = source.image.height
      const frameContext = frame.getContext('2d')!
      const grade = fishColorGrades[item.variant % fishColorGrades.length]
      frameContext.drawImage(source.image, 0, 0)
      gradeSpritePixels(frameContext, frame.width, frame.height, grade)
      tintedSpriteFrames.set(item.variant, frame)
    }
    context.save()
    context.translate(item.x, item.y)
    context.rotate(angle)
    // The source sprites face right with their bellies at the bottom. Mirroring
    // leftward horizontal motion preserves that natural upright orientation.
    if (mostlyHorizontal && item.vx < 0) context.scale(-1, 1)
    context.globalAlpha = .98
    const scaleX = width / source.cellWidth, scaleY = height / source.cellHeight
    context.drawImage(frame, -width / 2 + source.x * scaleX, -height / 2 + source.y * scaleY, frame.width * scaleX, frame.height * scaleY)
    context.restore()
  }
  const draw = (delta: number, now: number) => {
    context.clearRect(0, 0, canvasWidth, canvasHeight)
    fish.forEach((item) => drawDetailedFish(item))
    for (let index = bubbles.length - 1; index >= 0; index -= 1) {
      const bubble = bubbles[index]; bubble.x += bubble.vx * delta; bubble.y += bubble.vy * delta; bubble.life -= delta * .8
      context.globalAlpha = Math.max(0, bubble.life) * .78; context.strokeStyle = bubble.color; context.lineWidth = 1.45; context.beginPath(); context.arc(bubble.x, bubble.y, bubble.radius, 0, Math.PI * 2); context.stroke()
      if (bubble.life <= 0) bubbles.splice(index, 1)
    }
    context.globalAlpha = 1
    if (outputStream && now - lastRecordingCompositionAt >= 33) {
      lastRecordingCompositionAt = now
      composeRecording()
    }
  }
  const run = (now: number) => {
    if (!open) return
    resize()
    const delta = Math.min((now - lastTime) / 1000 || 0, .05); lastTime = now
    if (tracking) { inferHand(now); inferFace(now); startBite(now) }
    updateFish(delta, now); spawnCurrent(now); spawnFishBubbles(now); draw(delta, now)
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
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task' }, runningMode: 'VIDEO', numFaces: 1 })
      tracking = true; startButton.classList.add('is-hidden'); status.classList.add('is-hidden'); screen.classList.add('is-tracking')
      if (guideTimer !== null) window.clearTimeout(guideTimer)
      guide.classList.add('is-visible')
      guideTimer = window.setTimeout(() => { guide.classList.remove('is-visible'); guideTimer = null }, 5_000)
    } catch (error) { console.error(error); startButton.disabled = false; startButton.textContent = '카메라 다시 켜기' }
  }
  startButton.addEventListener('click', startCamera)
  closeButton.addEventListener('click', () => history.back())
  return {
    open: () => { open = true; requestResize(); resize(); resetFish(); screen.classList.add('is-open'); screen.setAttribute('aria-hidden', 'false'); lastTime = performance.now(); frame = requestAnimationFrame(run); closeButton.focus() },
    close: () => {
      open = false; cancelAnimationFrame(frame); screen.classList.remove('is-open', 'is-tracking'); screen.setAttribute('aria-hidden', 'true'); tracking = false
      landmarker?.close(); landmarker = null; stream?.getTracks().forEach((track) => track.stop()); stream = null; video.srcObject = null
      faceLandmarker?.close(); faceLandmarker = null
      outputStream?.getTracks().forEach((track) => track.stop()); outputStream = null
      tintedSpriteFrames.clear(); lastRecordingCompositionAt = 0
      if (guideTimer !== null) window.clearTimeout(guideTimer); guideTimer = null; guide.classList.remove('is-visible')
      pointer = null; pointerTarget = null; pointing = false; mouthPoint = null; mouthOpen = false; lastBiteAt = 0; lastFishBubbleScanAt = 0; bubbles.splice(0); startButton.disabled = false; startButton.textContent = '카메라 켜기'; startButton.classList.remove('is-hidden'); status.classList.remove('is-hidden')
    },
    getRecordingStream: () => {
      if (!open || !recordingCanvas.captureStream) return null
      composeRecording()
      lastRecordingCompositionAt = performance.now()
      outputStream ??= recordingCanvas.captureStream(30)
      return outputStream
    },
    getRecordingCanvas: () => {
      if (!open) return null
      composeRecording()
      lastRecordingCompositionAt = performance.now()
      return recordingCanvas
    },
  }
}
