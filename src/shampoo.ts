import { FaceLandmarker, FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision'

type Point = { x: number; y: number }
type Landmark = { x: number; y: number; z?: number }
type FaceState = { landmarks: Landmark[]; center: Point; xAxis: Point; yAxis: Point; scale: number; foreheadY: number; width: number; seenAt: number }
type Bubble = { x: number; y: number; targetX: number; targetY: number; radius: number; sprite: number; phase: number; normal: Point; tangent: Point; edge: boolean }
type AttachedBubble = { anchors: Array<{ index: number; weight: number }>; offsetX: number; offsetY: number; radius: number; sprite: number; phase: number; lastX: number; lastY: number }
type Gesture = { point: Point; kind: 'pinch' | 'fist' | 'open'; lastSeen: number; lastPinch: Point | null; lastFistAt: number; lastFistPoint: Point | null; nextFistAt: number; fistActive: boolean }
type HumanMask = { data: Float32Array; width: number; height: number; at: number }
type WaterDrop = { x: number; y: number; size: number; velocity: number; sway: number; phase: number }
type FlyingBubble = { x: number; y: number; velocityX: number; velocityY: number; radius: number; sprite: number; phase: number; startedAt: number; lifetime: number }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const mix = (from: number, to: number, amount: number) => from + (to - from) * amount

/** A face-attached shampoo foam camera experiment. The silhouette is always
 * derived from the selfie confidence mask; face landmarks only supply the
 * forehead cutoff and attachment coordinates for user-created bubbles. */
export const createShampooExperience = () => {
  const screen = document.createElement('section')
  screen.className = 'shampoo-screen'
  screen.setAttribute('aria-hidden', 'true')
  screen.innerHTML = `
    <video class="shampoo-camera" autoplay muted playsinline></video>
    <canvas class="shampoo-canvas"></canvas>
    <div class="shampoo-wash" aria-hidden="true"></div>
    <button class="shampoo-start" type="button" aria-label="카메라 켜기"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="18"/><circle cx="17" cy="20" r="8"/><circle cx="48" cy="17" r="6"/><circle cx="50" cy="43" r="7"/><circle class="shampoo-start-shine" cx="25" cy="27" r="5"/><circle class="shampoo-start-shine" cx="42" cy="42" r="3"/></svg></button>
    <button class="shampoo-lever" type="button" aria-label="샤워 물 내리기"><i></i><b></b></button>
    <button class="shampoo-close" type="button" aria-label="주사위 화면으로 돌아가기">×</button>
  `
  document.body.append(screen)

  const video = screen.querySelector<HTMLVideoElement>('.shampoo-camera')!
  const canvas = screen.querySelector<HTMLCanvasElement>('.shampoo-canvas')!
  const context = canvas.getContext('2d', { alpha: false })!
  const startButton = screen.querySelector<HTMLButtonElement>('.shampoo-start')!
  const lever = screen.querySelector<HTMLButtonElement>('.shampoo-lever')!
  const closeButton = screen.querySelector<HTMLButtonElement>('.shampoo-close')!

  let stream: MediaStream | null = null
  let faceLandmarker: FaceLandmarker | null = null
  let segmenter: ImageSegmenter | null = null
  let handWorker: Worker | null = null
  let handRequestPending = false
  let handWorkerFailed = false
  let handWorkerReady = false
  let handFrameFromCanvas = false
  let nextHandRequest = 0
  let handRequestId = 0
  let open = false
  let tracking = false
  let frame = 0
  let lastTime = 0
  let lastVideoTime = -1
  let lastFaceAt = 0
  let lastSegmentAt = 0
  let lastFaceSeenAt = 0
  let face: FaceState | null = null
  let humanMask: HumanMask | null = null
  let personMaskIndex = 1
  let outputStream: MediaStream | null = null
  let foamRinsed = false
  let baseFoamSuppressed = false
  let rinseStartedAt = 0
  let rinsingUntil = 0
  let lastWaterDropAt = 0
  let leverPull = 0
  let foamClearUntil = 0
  let previousFaceCenter: Point | null = null
  let previousFaceAt = 0
  let lastHeadDirection = 0
  let headShakeEnergy = 0
  let lastShakeAt = 0
  const baseBubbles: Bubble[] = []
  const attachedBubbles: AttachedBubble[] = []
  const waterDrops: WaterDrop[] = []
  const flyingBubbles: FlyingBubble[] = []
  const gestures = new Map<string, Gesture>()
  const sprites = createBubbleSprites()
  const handFrameCanvas = document.createElement('canvas')
  const handFrameContext = handFrameCanvas.getContext('2d', { alpha: false })!

  // The camera view is intentionally text-free. Diagnostics remain in the
  // console so they do not intrude on the interaction surface.
  const setGuide = (message: string) => { console.info('Shampoo:', message) }

  function createBubbleSprites() {
    return Array.from({ length: 6 }, (_, variant) => {
      const sprite = document.createElement('canvas')
      sprite.width = sprite.height = 128
      const ctx = sprite.getContext('2d')!
      const center = 64
      const radius = 46
      const body = ctx.createRadialGradient(45, 38, 3, center, center, radius)
      body.addColorStop(0, 'rgba(255,255,255,.98)')
      body.addColorStop(.25, 'rgba(255,238,247,.9)')
      body.addColorStop(.7, 'rgba(248,177,211,.7)')
      body.addColorStop(1, 'rgba(224,121,173,.48)')
      ctx.fillStyle = body
      ctx.beginPath(); ctx.arc(center, center, radius, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,.82)'; ctx.lineWidth = 2.2
      ctx.beginPath(); ctx.arc(center, center, radius - 1, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = variant % 2 ? 'rgba(255,255,255,.8)' : 'rgba(255,233,245,.76)'
      ctx.beginPath(); ctx.ellipse(47, 42, 14 + variant, 8 + variant * .35, -.62, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = 'rgba(255,245,251,.48)'
      ctx.beginPath(); ctx.ellipse(72, 83, 9, 4, .28, 0, Math.PI * 2); ctx.fill()
      return sprite
    })
  }

  const cover = () => {
    const width = Math.max(screen.clientWidth, 1)
    const height = Math.max(screen.clientHeight, 1)
    const sourceWidth = Math.max(video.videoWidth, 1)
    const sourceHeight = Math.max(video.videoHeight, 1)
    const scale = Math.max(width / sourceWidth, height / sourceHeight)
    return { width, height, sourceWidth, sourceHeight, scale, offsetX: (width - sourceWidth * scale) / 2, offsetY: (height - sourceHeight * scale) / 2 }
  }
  const screenPoint = (point: Landmark): Point => {
    const fit = cover()
    return { x: fit.width - (fit.offsetX + point.x * fit.sourceWidth * fit.scale), y: fit.offsetY + point.y * fit.sourceHeight * fit.scale }
  }
  const sourcePoint = (point: Point) => {
    const fit = cover()
    return { x: clamp((fit.width - point.x - fit.offsetX) / (fit.sourceWidth * fit.scale), 0, 1), y: clamp((point.y - fit.offsetY) / (fit.sourceHeight * fit.scale), 0, 1) }
  }

  const updateFace = (now: number) => {
    if (!faceLandmarker || now - lastFaceAt < 82 || video.currentTime === lastVideoTime) return
    lastFaceAt = now
    const landmarks = faceLandmarker.detectForVideo(video, now).faceLandmarks[0]
    if (!landmarks) {
      if (face && now - lastFaceSeenAt > 260) face = null
      return
    }
    const screenLandmarks = landmarks.map(screenPoint)
    const left = screenLandmarks[234]
    const right = screenLandmarks[454]
    const forehead = screenLandmarks[10]
    const chin = screenLandmarks[152]
    const center = screenLandmarks[1] ?? { x: (left.x + right.x) / 2, y: (forehead.y + chin.y) / 2 }
    const xVector = { x: right.x - left.x, y: right.y - left.y }
    const xLength = Math.max(Math.hypot(xVector.x, xVector.y), 1)
    const xAxis = { x: xVector.x / xLength, y: xVector.y / xLength }
    const yAxis = { x: -xAxis.y, y: xAxis.x }
    const down = { x: chin.x - forehead.x, y: chin.y - forehead.y }
    if (down.x * yAxis.x + down.y * yAxis.y < 0) { yAxis.x *= -1; yAxis.y *= -1 }
    face = { landmarks: screenLandmarks, center, xAxis, yAxis, scale: Math.max(xLength, distance(forehead, chin)), foreheadY: forehead.y, width: xLength, seenAt: now }
    lastFaceSeenAt = now
    detectHeadShake(now)
    if (humanMask) refreshBaseBubbles()
  }

  const maskAt = (source: Point) => {
    if (!humanMask) return 0
    const x = clamp(Math.round(source.x * (humanMask.width - 1)), 0, humanMask.width - 1)
    const y = clamp(Math.round(source.y * (humanMask.height - 1)), 0, humanMask.height - 1)
    return humanMask.data[y * humanMask.width + x] ?? 0
  }
  const maskAtPixel = (x: number, y: number) => {
    if (!humanMask || x < 0 || y < 0 || x >= humanMask.width || y >= humanMask.height) return 0
    return humanMask.data[y * humanMask.width + x] ?? 0
  }
  const isHeadMaskPoint = (source: Point) => {
    if (!face || !humanMask || maskAt(source) < .54) return false
    const point = screenPoint(source)
    // The face gives only the forehead cutoff and a loose search window. The
    // resulting contour itself comes exclusively from HumanSeg confidence.
    return point.y <= face.foreheadY + 3 && Math.abs(point.x - face.center.x) <= face.width * .82
  }
  const boundaryAt = (x: number, y: number) => {
    const value = maskAtPixel(x, y)
    return value >= .54 && ([[-1, 0], [1, 0], [0, -1], [0, 1]] as const).some(([dx, dy]) => maskAtPixel(x + dx, y + dy) < .48)
  }

  const refreshBaseBubbles = () => {
    if (baseFoamSuppressed || performance.now() < foamClearUntil || !face || !humanMask) return
    const candidates: Array<{ point: Point; edge: boolean; normal: Point; tangent: Point }> = []
    const edges: Array<{ point: Point; edge: boolean; normal: Point; tangent: Point }> = []
    for (let y = 2; y < humanMask.height - 2; y += 4) {
      for (let x = 2; x < humanMask.width - 2; x += 4) {
        const source = { x: x / (humanMask.width - 1), y: y / (humanMask.height - 1) }
        if (!isHeadMaskPoint(source)) continue
        const edge = boundaryAt(x, y)
        const gradient = { x: maskAtPixel(x + 1, y) - maskAtPixel(x - 1, y), y: maskAtPixel(x, y + 1) - maskAtPixel(x, y - 1) }
        const length = Math.max(Math.hypot(gradient.x, gradient.y), .001)
        const normal = { x: -gradient.x / length, y: -gradient.y / length }
        const point = screenPoint(source)
        const entry = { point, edge, normal, tangent: { x: -normal.y, y: normal.x } }
        candidates.push(entry)
        if (edge) edges.push(entry)
      }
    }
    if (candidates.length < 12) return
    const selected = Array.from({ length: 184 }, (_, index) => candidates[(index * 37 + index * index * 11) % candidates.length])
    // A separate edge ring makes a few foam globes overlap the true mask edge
    // without ever replacing the HumanSeg silhouette with landmarks.
    const edgeSelected = edges.length ? Array.from({ length: Math.min(54, edges.length) }, (_, index) => edges[(index * 19 + index * index * 3) % edges.length]) : []
    const desired = [...selected, ...edgeSelected]
    desired.forEach((item, index) => {
      const outward = index >= selected.length ? 5 + (index % 4) * 2 : 0
      const targetX = item.point.x + item.normal.x * outward
      const targetY = item.point.y + item.normal.y * outward
      const existing = baseBubbles[index]
      if (existing) {
        existing.targetX = targetX; existing.targetY = targetY; existing.normal = item.normal; existing.tangent = item.tangent; existing.edge = item.edge
      } else {
        baseBubbles.push({ x: targetX, y: targetY, targetX, targetY, radius: 8 + (index * 13 % 12), sprite: index % sprites.length, phase: index * .71, normal: item.normal, tangent: item.tangent, edge: item.edge })
      }
    })
    baseBubbles.length = desired.length
  }

  const updateSegmentation = (now: number) => {
    if (!segmenter || !face || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
    // Hand interactions get the budget first; HumanSeg continues at a relaxed
    // cadence, so an active gesture cannot stall on mask copies.
    const gesturing = [...gestures.values()].some((gesture) => gesture.kind !== 'open' && now - gesture.lastSeen < 180)
    const interval = gesturing ? 620 : 220
    if (now - lastSegmentAt < interval || video.currentTime === lastVideoTime) return
    lastSegmentAt = now
    segmenter.segmentForVideo(video, now, (result) => {
      const mask = result.confidenceMasks?.[personMaskIndex]
      if (!mask) return
      const data = Float32Array.from(mask.getAsFloat32Array())
      // Reject empty/noisy outputs. Existing bubbles remain only for this short
      // HumanSeg grace window; there is intentionally no landmark silhouette.
      let confident = 0
      for (let index = 0; index < data.length; index += 8) if (data[index] > .54) confident += 1
      if (confident < 18) return
      humanMask = { data, width: mask.width, height: mask.height, at: now }
      refreshBaseBubbles()
    })
  }

  const requestHands = async (now: number) => {
    if (!handWorker || !handWorkerReady || handWorkerFailed || handRequestPending || now < nextHandRequest || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
    handRequestPending = true
    nextHandRequest = now + 32
    try {
      let bitmap: ImageBitmap
      if (handFrameFromCanvas) {
        const width = Math.min(480, video.videoWidth)
        const height = Math.max(1, Math.round(width * video.videoHeight / Math.max(video.videoWidth, 1)))
        if (handFrameCanvas.width !== width || handFrameCanvas.height !== height) { handFrameCanvas.width = width; handFrameCanvas.height = height }
        handFrameContext.drawImage(video, 0, 0, width, height)
        bitmap = await createImageBitmap(handFrameCanvas)
      } else {
        try {
          bitmap = await createImageBitmap(video)
        } catch {
          // A few browsers cannot create an ImageBitmap directly from video.
          // This is only a transport fallback—the landmark model remains in
          // the Worker, as required.
          handFrameFromCanvas = true
          const width = Math.min(480, video.videoWidth)
          const height = Math.max(1, Math.round(width * video.videoHeight / Math.max(video.videoWidth, 1)))
          handFrameCanvas.width = width; handFrameCanvas.height = height
          handFrameContext.drawImage(video, 0, 0, width, height)
          bitmap = await createImageBitmap(handFrameCanvas)
        }
      }
      handWorker.postMessage({ type: 'frame', id: ++handRequestId, timestamp: now, bitmap }, [bitmap])
    } catch (error) {
      console.error(error)
      handRequestPending = false
      handWorkerFailed = true
      setGuide('손 인식 프레임을 만들지 못했어요. 페이지를 다시 열어 주세요.')
    }
  }
  const gestureFor = (landmarks: Landmark[], wasPinching: boolean) => {
    const wrist = landmarks[0]
    // Wrist-to-middle-joint alone changes markedly with wrist bend. Combining
    // it with palm width makes pinch usable close to the camera too; a wider
    // release threshold prevents a valid pinch from flickering into "open".
    const palm = Math.max(distance(wrist, landmarks[9]), distance(landmarks[5], landmarks[17]), .001)
    const fist = [8, 12, 16, 20].every((tip) => distance(wrist, landmarks[tip]) / palm < 1.55)
    const pinch = distance(landmarks[4], landmarks[8]) / palm < (wasPinching ? .88 : .64)
    const point = pinch ? { x: (landmarks[4].x + landmarks[8].x) / 2, y: (landmarks[4].y + landmarks[8].y) / 2 } : landmarks[9]
    // A closed fist often also puts thumb and index close together. Fist takes
    // precedence so it reliably creates the intended large foam cluster.
    return { kind: fist ? 'fist' as const : pinch ? 'pinch' as const : 'open' as const, point: screenPoint(point) }
  }
  const attachBubble = (point: Point, radius = 7) => {
    if (!face) return
    const closest = face.landmarks.map((landmark, index) => ({ index, weight: 1 / Math.max(distance(point, landmark), 12) })).sort((a, b) => b.weight - a.weight).slice(0, 3)
    const total = closest.reduce((sum, item) => sum + item.weight, 0)
    const anchor = closest.reduce((sum, item) => ({ x: sum.x + face!.landmarks[item.index].x * item.weight / total, y: sum.y + face!.landmarks[item.index].y * item.weight / total }), { x: 0, y: 0 })
    const dx = point.x - anchor.x; const dy = point.y - anchor.y
    attachedBubbles.push({ anchors: closest.map((item) => ({ index: item.index, weight: item.weight / total })), offsetX: (dx * face.xAxis.x + dy * face.xAxis.y) / face.scale, offsetY: (dx * face.yAxis.x + dy * face.yAxis.y) / face.scale, radius, sprite: attachedBubbles.length % sprites.length, phase: attachedBubbles.length * .43, lastX: point.x, lastY: point.y })
  }
  const addPinchTrail = (gesture: Gesture, point: Point) => {
    const previous = gesture.lastPinch ?? point
    const gap = distance(previous, point)
    const count = Math.max(1, Math.ceil(gap / 11))
    for (let index = 1; index <= count; index += 1) {
      const amount = index / count
      attachBubble({ x: mix(previous.x, point.x, amount), y: mix(previous.y, point.y, amount) }, 4.5 + (index % 3) * 1.25)
    }
    gesture.lastPinch = point
  }
  const isOnFaceOrScalp = (point: Point) => {
    if (!face) return false
    const localX = (point.x - face.center.x) * face.xAxis.x + (point.y - face.center.y) * face.xAxis.y
    const localY = (point.x - face.center.x) * face.yAxis.x + (point.y - face.center.y) * face.yAxis.y
    const faceArea = localX * localX / (face.width * face.width * .48) + localY * localY / (face.scale * face.scale * .40) < 1
    return faceArea || isHeadMaskPoint(sourcePoint(point))
  }
  const addFistCluster = (point: Point) => {
    for (let index = 0; index < 24; index += 1) {
      const angle = index * 2.399 + performance.now() * .002
      const radius = 9 + Math.sqrt((index + 1) / 24) * 64
      attachBubble({ x: point.x + Math.cos(angle) * radius, y: point.y + Math.sin(angle) * radius }, 10 + (index % 4) * 3.5)
    }
  }
  const applyHands = (hands: Array<{ handedness: string; landmarks: Landmark[] }>, now: number) => {
    const seen = new Set<string>()
    hands.forEach(({ handedness, landmarks }, index) => {
      const key = handedness || `hand-${index}`
      seen.add(key)
      let gesture = gestures.get(key)
      const next = gestureFor(landmarks, gesture?.kind === 'pinch')
      if (!gesture) {
        gesture = { point: next.point, kind: 'open', lastSeen: now, lastPinch: null, lastFistAt: 0, lastFistPoint: null, nextFistAt: now, fistActive: false }
        gestures.set(key, gesture)
      }
      gesture.point = next.point; gesture.lastSeen = now
      if (next.kind !== gesture.kind) {
        gesture.kind = next.kind
        if (next.kind !== 'pinch') gesture.lastPinch = null
        if (next.kind === 'fist') { gesture.nextFistAt = now; gesture.lastFistPoint = next.point; gesture.fistActive = isOnFaceOrScalp(next.point) }
        if (next.kind !== 'fist') { gesture.fistActive = false; gesture.lastFistPoint = null }
      }
      if (gesture.kind === 'pinch') addPinchTrail(gesture, next.point)
      if (gesture.kind === 'fist' && !gesture.fistActive && isOnFaceOrScalp(next.point)) { gesture.fistActive = true; gesture.lastFistPoint = next.point; gesture.nextFistAt = now }
      if (gesture.kind === 'fist' && gesture.fistActive && now >= gesture.nextFistAt) {
        // Once a fist begins on the face/scalp, keep laying the foam down until
        // it opens. Interpolating from the prior emission prevents a gap when
        // the hand crosses outside the face during the 360–460ms cadence.
        const previous = gesture.lastFistPoint ?? next.point
        const steps = Math.max(1, Math.ceil(distance(previous, next.point) / 34))
        for (let step = 1; step <= steps; step += 1) addFistCluster({ x: mix(previous.x, next.point.x, step / steps), y: mix(previous.y, next.point.y, step / steps) })
        gesture.lastFistPoint = next.point
        gesture.lastFistAt = now
        gesture.nextFistAt = now + 360 + (Math.floor(now / 10 + index * 47) % 101)
      }
    })
    // A brief grace period bridges individual Worker / camera frame misses.
    gestures.forEach((gesture, key) => { if (!seen.has(key) && now - gesture.lastSeen > 190) gestures.delete(key) })
  }

  const drawBubble = (x: number, y: number, radius: number, sprite: number, phase: number, now: number) => {
    const drift = 1 + Math.sin(now * .002 + phase) * .035
    const size = radius * 2 * drift
    context.drawImage(sprites[sprite], x - size, y - size, size * 2, size * 2)
  }
  const scatterFoam = (direction: number, now: number) => {
    const release = (x: number, y: number, radius: number, sprite: number, phase: number, index: number) => {
      const horizontal = (direction || (index % 2 ? 1 : -1)) * (150 + (index % 7) * 23) + (Math.random() - .5) * 130
      flyingBubbles.push({ x, y, velocityX: horizontal, velocityY: -130 - Math.random() * 190, radius, sprite, phase, startedAt: now, lifetime: 760 + Math.random() * 560 })
    }
    const baseStride = Math.max(1, Math.ceil(baseBubbles.length / 120))
    baseBubbles.forEach((bubble, index) => { if (index % baseStride === 0) release(bubble.x, bubble.y, bubble.radius, bubble.sprite, bubble.phase, index) })
    const attachedStride = Math.max(1, Math.ceil(attachedBubbles.length / 100))
    attachedBubbles.forEach((bubble, index) => { if (index % attachedStride === 0) release(bubble.lastX, bubble.lastY, bubble.radius, bubble.sprite, bubble.phase, index + 31) })
    baseBubbles.length = 0
    attachedBubbles.length = 0
    foamClearUntil = now + 1150
  }
  const detectHeadShake = (now: number) => {
    if (!face || foamRinsed || baseFoamSuppressed) return
    if (previousFaceCenter) {
      const elapsed = Math.max((now - previousFaceAt) / 1000, .001)
      const travel = (face.center.x - previousFaceCenter.x) / Math.max(face.scale, 1)
      const speed = Math.abs(travel) / elapsed
      const direction = Math.sign(travel)
      headShakeEnergy = Math.max(0, headShakeEnergy - elapsed * .72)
      if (Math.abs(travel) > .055 && speed > .68 && direction) {
        if (lastHeadDirection && direction !== lastHeadDirection) headShakeEnergy += Math.abs(travel) * 1.9
        lastHeadDirection = direction
      }
      if (headShakeEnergy > .17 && now - lastShakeAt > 850) {
        scatterFoam(direction, now)
        lastShakeAt = now
        headShakeEnergy = 0
      }
    }
    previousFaceCenter = { ...face.center }
    previousFaceAt = now
  }
  const updateFlyingBubbles = (now: number, delta: number, width: number, height: number) => {
    for (let index = flyingBubbles.length - 1; index >= 0; index -= 1) {
      const bubble = flyingBubbles[index]
      const age = now - bubble.startedAt
      bubble.x += bubble.velocityX * delta
      bubble.y += bubble.velocityY * delta
      bubble.velocityY += 265 * delta
      bubble.velocityX *= Math.exp(-.55 * delta)
      if (age >= bubble.lifetime || bubble.x < -80 || bubble.x > width + 80 || bubble.y < -80 || bubble.y > height + 80) {
        flyingBubbles.splice(index, 1)
        continue
      }
      context.save()
      context.globalAlpha = Math.pow(1 - age / bubble.lifetime, 1.7)
      drawBubble(bubble.x, bubble.y, bubble.radius, bubble.sprite, bubble.phase, now)
      context.restore()
    }
  }
  const startRinse = (now: number) => {
    if (!foamRinsed) {
      foamRinsed = true
      baseFoamSuppressed = true
      rinseStartedAt = now
    }
    if (now >= rinsingUntil) lastWaterDropAt = now
    rinsingUntil = Math.max(rinsingUntil, now + 2300)
  }
  const drawWaterDrop = (drop: WaterDrop) => {
    context.save()
    context.translate(drop.x, drop.y)
    context.scale(drop.size, drop.size * 1.34)
    const water = context.createRadialGradient(-.25, -.36, .05, 0, 0, 1)
    water.addColorStop(0, 'rgba(238,255,255,.96)')
    water.addColorStop(.3, 'rgba(166,235,246,.82)')
    water.addColorStop(1, 'rgba(73,169,199,.32)')
    context.fillStyle = water
    context.beginPath()
    context.moveTo(0, -1.25)
    context.bezierCurveTo(.72, -.35, .74, .36, 0, .92)
    context.bezierCurveTo(-.74, .36, -.72, -.35, 0, -1.25)
    context.fill()
    context.restore()
  }
  const updateWater = (now: number, delta: number, width: number, height: number) => {
    if (now < rinsingUntil) {
      while (now - lastWaterDropAt > 22) {
        lastWaterDropAt += 22
        waterDrops.push({ x: Math.random() * width, y: -14 - Math.random() * height * .16, size: 3 + Math.random() * 6, velocity: 390 + Math.random() * 420, sway: (Math.random() - .5) * 38, phase: Math.random() * Math.PI * 2 })
      }
    }
    for (let index = waterDrops.length - 1; index >= 0; index -= 1) {
      const drop = waterDrops[index]
      drop.y += drop.velocity * delta
      drop.x += Math.sin(now * .004 + drop.phase) * drop.sway * delta
      if (drop.y > height + 28) waterDrops.splice(index, 1)
    }
    waterDrops.forEach(drawWaterDrop)
  }
  const draw = (now: number) => {
    if (!open) return
    const delta = Math.min((now - lastTime) / 1000 || 0, .05)
    lastTime = now
    const fit = cover()
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
    const width = Math.round(fit.width * ratio); const height = Math.round(fit.height * ratio)
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.fillStyle = '#183631'; context.fillRect(0, 0, fit.width, fit.height)
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      context.save(); context.translate(fit.width, 0); context.scale(-1, 1)
      context.drawImage(video, fit.offsetX, fit.offsetY, video.videoWidth * fit.scale, video.videoHeight * fit.scale); context.restore()
      if (tracking) {
        updateFace(now)
        updateSegmentation(now)
        void requestHands(now)
      }
    }
    // HumanSeg has a short grace period, but bubbles are not kept alive by a
    // synthetic contour when segmentation has genuinely gone stale.
    const maskFresh = !baseFoamSuppressed && humanMask && now - humanMask.at < 780
    const foamOpacity = foamRinsed ? Math.max(0, 1 - (now - rinseStartedAt) / 720) : 1
    context.save()
    context.globalAlpha = foamOpacity
    if (maskFresh) baseBubbles.forEach((bubble) => {
      bubble.x = mix(bubble.x, bubble.targetX, 1 - Math.exp(-delta * 9))
      bubble.y = mix(bubble.y, bubble.targetY, 1 - Math.exp(-delta * 9))
      const motion = Math.sin(now * .0023 + bubble.phase) * (bubble.edge ? 2.8 : 1.25)
      drawBubble(bubble.x + bubble.tangent.x * motion + bubble.normal.x * Math.cos(now * .0017 + bubble.phase), bubble.y + bubble.tangent.y * motion + bubble.normal.y * Math.cos(now * .0017 + bubble.phase), bubble.radius, bubble.sprite, bubble.phase, now)
    })
    // A hand can hide the face model for a few frames. Bubbles are permanent:
    // while landmarks are unavailable, draw at their last valid attachment
    // position instead of dropping the entire user-created foam layer.
    const attachedFace = face && now - face.seenAt < 1100 ? face : null
    attachedBubbles.forEach((bubble) => {
      if (attachedFace) {
        const anchor = bubble.anchors.reduce((sum, item) => ({ x: sum.x + attachedFace.landmarks[item.index].x * item.weight, y: sum.y + attachedFace.landmarks[item.index].y * item.weight }), { x: 0, y: 0 })
        bubble.lastX = anchor.x + (attachedFace.xAxis.x * bubble.offsetX + attachedFace.yAxis.x * bubble.offsetY) * attachedFace.scale
        bubble.lastY = anchor.y + (attachedFace.xAxis.y * bubble.offsetX + attachedFace.yAxis.y * bubble.offsetY) * attachedFace.scale
      }
      drawBubble(bubble.lastX, bubble.lastY, bubble.radius, bubble.sprite, bubble.phase, now)
    })
    context.restore()
    if (foamRinsed && foamOpacity === 0) { baseBubbles.length = 0; attachedBubbles.length = 0; foamRinsed = false }
    updateFlyingBubbles(now, delta, fit.width, fit.height)
    updateWater(now, delta, fit.width, fit.height)
    // The rinse removes the current foam, then a fresh valid HumanSeg result
    // restores only the default head foam once the shower stream has passed.
    if (baseFoamSuppressed && now >= rinsingUntil && !waterDrops.length) {
      baseFoamSuppressed = false
      if (humanMask) refreshBaseBubbles()
    }
    frame = requestAnimationFrame(draw)
  }

  const startCamera = async () => {
    if (tracking) return
    startButton.disabled = true
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: false })
      video.srcObject = stream; await video.play()
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm')
      const options = { runningMode: 'VIDEO' as const }
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, { ...options, baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task' }, numFaces: 1 })
      segmenter = await ImageSegmenter.createFromOptions(vision, { ...options, baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite' }, outputConfidenceMasks: true, outputCategoryMask: false })
      const labels = segmenter.getLabels()
      const labelledPersonIndex = labels.findIndex((label) => /person|human|selfie/i.test(label))
      // Selfie Segmenter is a two-class model (background, person). Do not
      // silently use the background mask when a different model is supplied.
      if (labelledPersonIndex >= 0) personMaskIndex = labelledPersonIndex
      else if (labels.length === 2) personMaskIndex = 1
      else throw new Error('Selfie Segmenter person confidence mask is unavailable')
      handWorker = new Worker(`${import.meta.env.BASE_URL}shampoo-hand-worker.js`)
      handWorker.onmessage = (event: MessageEvent<{ type: string; hands?: Array<{ handedness: string; landmarks: Landmark[] }>; message?: string }>) => {
        handRequestPending = false
        if (event.data.type === 'result' && event.data.hands) applyHands(event.data.hands, performance.now())
        if (event.data.type === 'ready') { handWorkerReady = true; setGuide('핀치로 작은 거품을 그리고, 주먹으로 풍성하게 채워보세요') }
        if (event.data.type === 'error') {
          handWorkerFailed = true
          console.error('Shampoo hand Worker:', event.data.message)
          setGuide(`손 인식 오류: ${event.data.message ?? '초기화 실패'}`)
        }
      }
      handWorker.onerror = (event) => { handRequestPending = false; handWorkerFailed = true; console.error('Shampoo hand Worker:', event.message); setGuide(`손 인식 오류: ${event.message || 'Worker 초기화 실패'}`) }
      handWorker.postMessage({ type: 'init' })
      tracking = true; startButton.classList.add('is-hidden'); screen.classList.add('is-tracking'); setGuide('손 인식을 준비 중이에요…')
    } catch (error) {
      console.error(error)
      stream?.getTracks().forEach((track) => track.stop()); stream = null; video.srcObject = null
      faceLandmarker?.close(); faceLandmarker = null; segmenter?.close(); segmenter = null
      handWorker?.terminate(); handWorker = null
      startButton.disabled = false; setGuide('카메라와 모델을 연결하지 못했어요')
    }
  }
  startButton.addEventListener('click', () => { void startCamera() })
  let leverStartY = 0
  let activeLeverPointer: number | null = null
  let leverActivated = false
  const setLeverPull = (amount: number) => {
    leverPull = clamp(amount, 0, 1)
    lever.style.setProperty('--lever-pull', String(leverPull))
    if (leverPull >= .26 && !leverActivated) { leverActivated = true; startRinse(performance.now()) }
  }
  lever.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    leverStartY = event.clientY
    activeLeverPointer = event.pointerId
    leverActivated = false
    try { lever.setPointerCapture(event.pointerId) } catch { /* Window tracking below remains reliable. */ }
    setLeverPull(0)
  })
  const releaseLever = (event: PointerEvent) => {
    if (activeLeverPointer !== event.pointerId) return
    activeLeverPointer = null
    if (lever.hasPointerCapture(event.pointerId)) lever.releasePointerCapture(event.pointerId)
    window.setTimeout(() => setLeverPull(0), 140)
  }
  window.addEventListener('pointermove', (event) => {
    if (activeLeverPointer !== event.pointerId) return
    setLeverPull((event.clientY - leverStartY) / 72)
  }, { passive: true })
  window.addEventListener('pointerup', releaseLever, { passive: true })
  window.addEventListener('pointercancel', releaseLever, { passive: true })
  lever.addEventListener('click', () => { if (!leverActivated) startRinse(performance.now()) })
  closeButton.addEventListener('click', () => history.back())

  return {
    open: () => { open = true; screen.classList.add('is-open'); screen.setAttribute('aria-hidden', 'false'); lastTime = performance.now(); frame = requestAnimationFrame(draw); closeButton.focus() },
    close: () => {
      open = false; cancelAnimationFrame(frame); screen.classList.remove('is-open', 'is-tracking'); screen.setAttribute('aria-hidden', 'true')
      tracking = false
      const workerToClose = handWorker
      workerToClose?.postMessage({ type: 'close' })
      // Give the Worker a moment to call HandLandmarker.close(); termination is
      // retained as a final guard for a stalled WASM task.
      if (workerToClose) window.setTimeout(() => workerToClose.terminate(), 240)
      handWorker = null; handRequestPending = false; handWorkerFailed = false; handWorkerReady = false; handFrameFromCanvas = false
      faceLandmarker?.close(); faceLandmarker = null; segmenter?.close(); segmenter = null
      stream?.getTracks().forEach((track) => track.stop()); stream = null; video.srcObject = null
      outputStream?.getTracks().forEach((track) => track.stop()); outputStream = null
      baseBubbles.length = 0; attachedBubbles.length = 0; waterDrops.length = 0; flyingBubbles.length = 0; gestures.clear(); face = null; humanMask = null; foamRinsed = false; baseFoamSuppressed = false; foamClearUntil = 0; previousFaceCenter = null; previousFaceAt = 0; lastHeadDirection = 0; headShakeEnergy = 0; lastShakeAt = 0; rinseStartedAt = 0; rinsingUntil = 0; lastWaterDropAt = 0; setLeverPull(0); lastVideoTime = -1; lastFaceSeenAt = 0
      startButton.disabled = false; startButton.classList.remove('is-hidden'); setGuide('카메라를 켜면 머리 거품이 시작돼요')
    },
    getRecordingStream: () => { if (!open || !canvas.captureStream) return null; outputStream ??= canvas.captureStream(30); return outputStream },
    getRecordingCanvas: () => open ? canvas : null,
  }
}
