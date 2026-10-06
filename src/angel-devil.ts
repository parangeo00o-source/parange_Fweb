import { FaceLandmarker, FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { revealOnFirstVideoFrame } from './camera-page'
import angelUrl from './assets/angel-devil/angel-classic-v5.png'
import cloudUrl from './assets/angel-devil/cloud-platform-pet-v2.png'
import devilUrl from './assets/angel-devil/devil-tail-charcoal-v2.png'
import angelFeatherUrl from './assets/angel-devil/angel-feather.png'
import hellCloudUrl from './assets/angel-devil/hell-cloud-platform-pet-v6.png'

type Side = 'angel' | 'devil'
type Point = { x: number; y: number }
type FacePose = Point & { angle: number; scale: number }
type FeatherParticle = { x: number; y: number; size: number; speed: number; rotation: number; rotationSpeed: number; drift: number; phase: number; opacity: number }
type FeatherGlowSprite = { canvas: HTMLCanvasElement; featherSize: number; width: number; height: number }
type LightningBolt = { x: number; y: number; length: number; width: number; offset: number; seed: number; branchAt: number }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount
const fract = (value: number) => value - Math.floor(value)
const LONG_WINK_DELAY = 1_000

/** A face-following thought cloud where each wink gives one little self a
 * momentary upper hand in their continuous scuffle. */
export const createAngelDevilExperience = () => {
  const screen = document.createElement('section')
  screen.className = 'angel-devil-screen'
  screen.setAttribute('aria-hidden', 'true')
  screen.innerHTML = `
    <video class="angel-devil-camera" autoplay muted playsinline></video>
    <canvas class="angel-devil-canvas" aria-hidden="true"></canvas>
    <button class="angel-devil-start" type="button" aria-label="카메라 다시 켜기"><span>✦</span></button>
    <button class="angel-devil-close" type="button" aria-label="주사위 화면으로 돌아가기">×</button>
  `
  document.body.append(screen)

  const video = screen.querySelector<HTMLVideoElement>('.angel-devil-camera')!
  const canvas = screen.querySelector<HTMLCanvasElement>('.angel-devil-canvas')!
  const context = canvas.getContext('2d', { alpha: false, desynchronized: true })!
  const startButton = screen.querySelector<HTMLButtonElement>('.angel-devil-start')!
  const closeButton = screen.querySelector<HTMLButtonElement>('.angel-devil-close')!
  const angel = new Image(); angel.src = angelUrl
  const devil = new Image(); devil.src = devilUrl
  const angelFeather = new Image(); angelFeather.src = angelFeatherUrl
  const cloudPlatform = new Image(); cloudPlatform.src = cloudUrl
  const hellCloudPlatform = new Image(); hellCloudPlatform.src = hellCloudUrl
  let stream: MediaStream | null = null
  let outputStream: MediaStream | null = null
  let landmarker: FaceLandmarker | null = null
  let handLandmarker: HandLandmarker | null = null
  let open = false
  let tracking = false
  let frame = 0
  let lastRenderAt = 0
  let lastInferenceAt = 0
  let lastVideoTime = -1
  let lastHandInferenceAt = 0
  let lastHandVideoTime = -1
  let facePose: FacePose | null = null
  let lastFaceSeenAt = 0
  let poseFrozenUntil = 0
  let lastWinkSide: Side | null = null
  let lastWinkAt = 0
  let lastImpactAt = 0
  let lastImpactSide: Side | null = null
  let winkHoldSide: Side | null = null
  let winkHoldStartedAt = 0
  let lastWinkObservedAt = 0
  let leftBlinkSignal = 0
  let rightBlinkSignal = 0
  let longWinkSide: Side | null = null
  let lastLongWinkAt = 0
  let longWinkStartedAt = 0
  let longWinkCanRestart = true
  let featherParticles: FeatherParticle[] = []
  let featherGlowSprites: FeatherGlowSprite[] = []
  let lightningBolts: LightningBolt[] = []
  let duelMode = false
  let duelBlend = 0
  let fistsWereApart = false
  let fistContactFrames = 0
  let lastFistsCloseAt = 0
  let lastTwoFistsAt = 0
  let lastFistsApproachingAt = 0
  let smoothedFistDistance = Infinity
  let modeChangedAt = 0
  let visualAssetsWarmed = false
  let angelHealth = 100
  let devilHealth = 100
  let angelHitAt = 0
  let devilHitAt = 0
  let lastHealthUpdateAt = 0

  const warmVisualAssets = () => {
    if (visualAssetsWarmed) return
    visualAssetsWarmed = true
    // Browsers otherwise often decode the cloud PNGs on their first
    // draw, which coincides with the fist-bump transition. Decode them off the
    // interaction path after the camera has settled instead.
    window.setTimeout(() => {
      void Promise.all([angel, devil, cloudPlatform, hellCloudPlatform, angelFeather].map((image) => image.decode().catch(() => undefined))).then(() => prepareFeatherGlowSprites())
    }, 180)
  }

  const prepareFeatherGlowSprites = () => {
    if (featherGlowSprites.length || !angelFeather.complete || !angelFeather.naturalWidth) return
    const featherRatio = angelFeather.naturalHeight / angelFeather.naturalWidth
    // Cache three native-size glow sprites once. Reusing them removes the
    // expensive soft-shadow raster pass from every falling feather frame.
    featherGlowSprites = [28, 50, 72].map((featherSize) => {
      const blur = 10 + featherSize * .08
      const padding = Math.ceil(blur * 2.1)
      const width = featherSize + padding * 2
      const height = featherSize * featherRatio + padding * 2
      const density = 2
      const glowCanvas = document.createElement('canvas')
      glowCanvas.width = Math.ceil(width * density)
      glowCanvas.height = Math.ceil(height * density)
      const glowContext = glowCanvas.getContext('2d')!
      glowContext.setTransform(density, 0, 0, density, 0, 0)
      glowContext.shadowColor = '#3ed8ff'
      glowContext.shadowBlur = blur
      glowContext.drawImage(angelFeather, padding, padding, featherSize, featherSize * featherRatio)
      return { canvas: glowCanvas, featherSize, width, height }
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
  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
    const width = Math.max(1, Math.round(screen.clientWidth * ratio))
    const height = Math.max(1, Math.round(screen.clientHeight * ratio))
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
    return ratio
  }
  const triggerFight = (side: Side, now: number) => {
    lastWinkSide = side
    lastWinkAt = now
    const sideChanged = lastImpactSide !== side
    if (sideChanged || now - lastImpactAt > 230) {
      lastImpactAt = now
      lastImpactSide = side
      if (side === 'angel') {
        devilHealth = Math.max(0, devilHealth - 5)
        devilHitAt = now
      } else {
        angelHealth = Math.max(0, angelHealth - 5)
        angelHitAt = now
      }
    }
  }
  const prepareLongWinkEffect = (side: Side, now: number) => {
    longWinkSide = side
    longWinkStartedAt = now
    longWinkCanRestart = false
    if (side === 'angel') {
      featherParticles = Array.from({ length: 36 }, (_, index) => {
        const column = index % 6
        const row = Math.floor(index / 6)
        return {
          x: clamp((column + .5 + (Math.random() - .5) * .72) / 6, .035, .965),
          y: clamp((row + .5 + (Math.random() - .5) * .72) / 6, .025, .975),
          size: 21 + Math.random() * 53,
          speed: .11 + Math.random() * .17,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - .5) * .0045,
          drift: 8 + Math.random() * 36,
          phase: Math.random() * Math.PI * 2,
          opacity: .34 + Math.random() * .5,
        }
      })
      lightningBolts = []
      return
    }
    lightningBolts = Array.from({ length: 7 }, (_, index) => {
      const column = index % 3
      const row = Math.floor(index / 3)
      return {
        x: clamp((column + .5 + (Math.random() - .5) * .62) / 3, .08, .92),
        y: clamp(.015 + row * .19 + Math.random() * .12, .015, .48),
        length: .38 + Math.random() * .28,
        width: 1.3 + Math.random() * 1.55,
        offset: Math.random() * 760,
        seed: Math.random() * 100,
        branchAt: 2 + Math.floor(Math.random() * 3),
      }
    })
    featherParticles = []
  }
  const toggleDuelMode = (now: number) => {
    duelMode = !duelMode
    modeChangedAt = now
    // The idle tracker has already captured the brow anchor. Hold that anchor
    // briefly while the fists leave the frame so their movement cannot pull
    // the cloud down as battle appears.
    poseFrozenUntil = duelMode ? now + 420 : now + 150
    lastWinkSide = null
    lastWinkAt = 0
    lastImpactAt = 0
    lastImpactSide = null
    winkHoldSide = null
    winkHoldStartedAt = 0
    lastWinkObservedAt = 0
    leftBlinkSignal = 0
    rightBlinkSignal = 0
    longWinkSide = null
    lastLongWinkAt = 0
    longWinkStartedAt = 0
    longWinkCanRestart = true
    featherParticles = []
    lightningBolts = []
    lastVideoTime = -1
    fistsWereApart = false
    fistContactFrames = 0
    lastFistsCloseAt = 0
    lastTwoFistsAt = 0
    lastFistsApproachingAt = 0
    smoothedFistDistance = Infinity
    angelHealth = 100
    devilHealth = 100
    angelHitAt = 0
    devilHitAt = 0
    lastHealthUpdateAt = now
  }
  const updateTracking = (now: number) => {
    // Keep a light brow anchor even while the characters are pets. This lets
    // battle start from the correct place without analysing the face on the
    // same moment that two fists meet.
    const interval = duelMode ? 66 : 160
    if (!landmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || now < poseFrozenUntil || now - lastInferenceAt < interval || video.currentTime === lastVideoTime) return
    lastInferenceAt = now
    lastVideoTime = video.currentTime
    const result = landmarker.detectForVideo(video, now)
    const face = result.faceLandmarks[0]
    if (!face) {
      // A hand passing through the face area can hide landmarks for a few
      // frames. Keep the most recent stable brow point during that brief gap.
      if (now - lastFaceSeenAt > 700) facePose = null
      if (now - lastWinkObservedAt > 240) { winkHoldSide = null; winkHoldStartedAt = 0; longWinkCanRestart = true; leftBlinkSignal = 0; rightBlinkSignal = 0 }
      return
    }
    lastFaceSeenAt = now
    const fit = cover()
    const pointFor = (point: Point) => ({ x: fit.width - (fit.offsetX + point.x * fit.sourceWidth * fit.scale), y: fit.offsetY + point.y * fit.sourceHeight * fit.scale })
    const leftBrow = face[105]
    const rightBrow = face[334]
    const leftTemple = face[33]
    const rightTemple = face[263]
    if (leftBrow && rightBrow && leftTemple && rightTemple) {
      // Anchor at the midpoint of the brows, rather than the top of the face.
      // The drawing itself is offset upward below, leaving it immediately above
      // the brows without drifting onto the eyes.
      const leftBrowPoint = pointFor(leftBrow)
      const rightBrowPoint = pointFor(rightBrow)
      const forehead = { x: (leftBrowPoint.x + rightBrowPoint.x) / 2, y: (leftBrowPoint.y + rightBrowPoint.y) / 2 }
      const left = pointFor(leftTemple)
      const right = pointFor(rightTemple)
      const eyeDistance = Math.hypot(right.x - left.x, right.y - left.y)
      // Stay upright above the head. Only the position and distance follow the
      // face, so the cloud reads as a stable little thought rather than tilting
      // diagonally when the user moves their head.
      const next = { x: forehead.x, y: forehead.y, angle: 0, scale: clamp(eyeDistance / Math.max(fit.width * .34, 1), .74, 1.05) }
      facePose = facePose ? { x: facePose.x + (next.x - facePose.x) * .35, y: facePose.y + (next.y - facePose.y) * .35, angle: 0, scale: facePose.scale + (next.scale - facePose.scale) * .25 } : next
    }
    // Pet mode needs only the anchor; wink interpretation starts after the
    // fist gesture has opened the actual duel.
    if (!duelMode) { leftBlinkSignal = 0; rightBlinkSignal = 0; return }
    const categories = result.faceBlendshapes?.[0]?.categories ?? []
    const score = (name: string) => categories.find((item) => item.categoryName === name)?.score ?? 0
    const left = score('eyeBlinkLeft')
    const right = score('eyeBlinkRight')
    // Retain short blendshape peaks across the 15fps tracking cadence. The
    // right eye gets a slightly more forgiving entry point because its value
    // often arrives one inference later in mirrored webcam feeds.
    leftBlinkSignal = leftBlinkSignal * .42 + left * .58
    rightBlinkSignal = rightBlinkSignal * .42 + right * .58
    const leftBlink = Math.max(left, leftBlinkSignal)
    const rightBlink = Math.max(right, rightBlinkSignal)
    const bothEyesClosed = leftBlink > .58 && rightBlink > .58 && Math.abs(leftBlink - rightBlink) < .18
    const winkSide = !bothEyesClosed && leftBlink > .45 && leftBlink - rightBlink > .12
      ? 'angel'
      : !bothEyesClosed && rightBlink > .36 && rightBlink - leftBlink > .06
        ? 'devil'
        : null
    if (!winkSide) {
      // A single noisy blendshape frame should not interrupt a deliberate
      // one-second wink; a real eye-open transition lasts longer than this.
      if (now - lastWinkObservedAt > 240) { winkHoldSide = null; winkHoldStartedAt = 0; longWinkCanRestart = true }
      return
    }
    lastWinkObservedAt = now
    triggerFight(winkSide, now)
    if (winkHoldSide !== winkSide) {
      winkHoldSide = winkSide
      winkHoldStartedAt = now
    }
    // A normal wink triggers the local exchange. A deliberate, uninterrupted
    // one-second hold additionally unlocks the full-screen celebration layer.
    if (now - winkHoldStartedAt >= LONG_WINK_DELAY) {
      if (longWinkCanRestart || longWinkSide !== winkSide) prepareLongWinkEffect(winkSide, now)
      lastLongWinkAt = now
    }
  }
  const updateFistBump = (now: number) => {
    // Opening battle needs the quickest response. Once the battle is on, the
    // same gesture can still close it promptly while using fewer hand-model
    // passes, leaving GPU/thermal headroom for the face and visual effects.
    // Let the transition render cleanly before asking MediaPipe for another
    // full hand pass. This does not affect a real gesture, but removes the
    // post-contact stall when entering or leaving battle.
    if (now - modeChangedAt < 220) return
    const fistInterval = !duelMode ? 50 : longWinkSide && now - lastLongWinkAt < 900 ? 110 : 83
    if (!handLandmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || now - lastHandInferenceAt < fistInterval || video.currentTime === lastHandVideoTime) return
    lastHandInferenceAt = now
    lastHandVideoTime = video.currentTime
    const result = handLandmarker.detectForVideo(video, now)
    const [firstHand, secondHand] = result.landmarks
    if (!firstHand || !secondHand) {
      // Below the chin the two knuckles often merge into one MediaPipe hand
      // just before their centres cross the old "close" threshold. Remember
      // their approach as well as a fully close frame, so that natural contact
      // still completes the already-armed bump.
      const justApproached = now - lastFistsApproachingAt < 300 && now - lastTwoFistsAt < 380
      if (fistsWereApart && firstHand && (now - lastFistsCloseAt < 220 || justApproached)) {
        fistsWereApart = false
        fistContactFrames = 0
        smoothedFistDistance = Infinity
        toggleDuelMode(now)
      }
      return
    }
    const distance = (first: Point, second: Point) => Math.hypot(first.x - second.x, first.y - second.y)
    const palmSize = (distance(firstHand[0], firstHand[9]) + distance(secondHand[0], secondHand[9])) / 2
    if (!palmSize) return
    const isFist = (hand: Point[]) => {
      const size = distance(hand[0], hand[9])
      if (!size) return false
      let foldedFingers = 0
      // Compare every fingertip with its own middle joint as well as the palm.
      // This is much less sensitive to whether a fist faces the camera, which
      // was the main reason tightly closed fists could be missed before.
      for (const [tip, middle] of [[8, 6], [12, 10], [16, 14], [20, 18]]) {
        const tipToWrist = distance(hand[tip], hand[0])
        const middleToWrist = distance(hand[middle], hand[0])
        if (tipToWrist < middleToWrist * 1.32 || distance(hand[tip], hand[middle]) < size * 1.2 || tipToWrist < size * 2.05) foldedFingers += 1
      }
      return foldedFingers >= 2
    }
    if (!isFist(firstHand) || !isFist(secondHand)) {
      fistContactFrames = 0
      return
    }
    lastTwoFistsAt = now
    const centreFor = (hand: Point[]) => {
      let x = 0; let y = 0
      for (const index of [0, 5, 9, 13, 17]) { x += hand[index].x; y += hand[index].y }
      return { x: x / 5, y: y / 5 }
    }
    const fistRatio = distance(centreFor(firstHand), centreFor(secondHand)) / palmSize
    smoothedFistDistance = Number.isFinite(smoothedFistDistance) ? lerp(smoothedFistDistance, fistRatio, .48) : fistRatio
    // First move two closed fists apart to arm the gesture, then bring their
    // knuckles together once. Normalising by palm size keeps it reliable at
    // different distances from the webcam.
    if (!fistsWereApart && (fistRatio > 1.6 || smoothedFistDistance > 1.72)) {
      fistsWereApart = true
      fistContactFrames = 0
      return
    }
    if (fistsWereApart && (fistRatio < 2.3 || smoothedFistDistance < 2.15)) lastFistsApproachingAt = now
    if (fistsWereApart && (fistRatio < 2.05 || smoothedFistDistance < 1.95)) {
      lastFistsCloseAt = now
      fistContactFrames += 1
      // One confident near-contact frame is enough; this removes the visible
      // lag from waiting for a second inference after the knuckles meet.
      if (fistRatio < 1.9 || fistContactFrames >= 1) {
        fistsWereApart = false
        fistContactFrames = 0
        smoothedFistDistance = Infinity
        toggleDuelMode(now)
      }
    } else {
      fistContactFrames = 0
    }
  }
  const drawSprite = (image: HTMLImageElement, x: number, y: number, size: number, angle: number, bob = 0, scaleX = 1, scaleY = 1) => {
    if (!image.complete || !image.naturalWidth) return
    const height = size * (image.naturalHeight / image.naturalWidth)
    context.save()
    context.translate(x + size / 2, y + height * .68 + bob)
    context.rotate(angle)
    context.scale(scaleX, scaleY)
    // Canvas shadows give the same lifted sprite edge as drop-shadow without
    // allocating a filtered offscreen surface for each character every frame.
    context.shadowColor = 'rgba(16, 16, 48, .34)'
    context.shadowBlur = 9
    context.shadowOffsetY = 10
    context.drawImage(image, -size / 2, -height * .68, size, height)
    context.restore()
  }
  const drawImpact = (now: number, x: number, y: number, side: Side, strength: number) => {
    const pulse = Math.max(0, 1 - (now - lastImpactAt) / 260) * strength
    if (pulse < .04) return
    const colors = side === 'angel'
      ? { core: '#ffffff', bright: '#dffaff', mid: '#56dcff', dark: '#3180ff' }
      : { core: '#fae0d3', bright: '#e06a59', mid: '#ad3833', dark: '#23080b' }
    // Keep the original sharp fighting-game silhouette, just scaled down a
    // little so its centre stays comfortably between the characters.
    const spread = 30 + pulse * 50
    context.save()
    context.globalCompositeOperation = 'lighter'
    context.globalAlpha = .42 + pulse * .58
    context.shadowColor = colors.bright
    context.shadowBlur = 16 + pulse * 12
    // Jagged, torn spike clusters make the collision read like a stylised
    // fighting-game hit rather than evenly spaced radial lines.
    for (let index = 0; index < 15; index += 1) {
      const angle = index * 2.399 + now / 980
      const length = spread * (.42 + (index % 5) * .14)
      const width = 3 + (index % 3) * 2.3
      context.save()
      context.translate(x, y)
      context.rotate(angle)
      context.fillStyle = index % 4 === 0 ? colors.dark : index % 3 === 0 ? colors.bright : colors.mid
      context.beginPath()
      context.moveTo(4, -width * .28)
      context.lineTo(length * .42, -width)
      context.lineTo(length, 0)
      context.lineTo(length * .57, width * .48)
      context.lineTo(length * .23, width * .24)
      context.closePath()
      context.fill()
      context.restore()
    }
    // A broken ring and two crossing slashes reproduce the energetic, drawn
    // impact silhouette while keeping the effect local to the tiny fighters.
    context.lineWidth = 1.7 + pulse * 1.5
    context.strokeStyle = colors.mid
    context.setLineDash([spread * .23, spread * .09, spread * .12, spread * .16])
    context.beginPath(); context.arc(x, y, spread * .72, now / 370, now / 370 + Math.PI * 1.76); context.stroke()
    context.setLineDash([])
    context.strokeStyle = colors.bright
    context.lineWidth = 2.4 + pulse * 2
    context.beginPath(); context.moveTo(x - spread * .94, y + spread * .46); context.lineTo(x + spread * .88, y - spread * .52); context.stroke()
    context.beginPath(); context.moveTo(x - spread * .58, y - spread * .82); context.lineTo(x + spread * .64, y + spread * .78); context.stroke()
    context.fillStyle = colors.core
    context.beginPath()
    for (let point = 0; point < 12; point += 1) {
      const angle = -Math.PI / 2 + point * Math.PI / 6
      const radius = point % 2 === 0 ? 9 + pulse * 12 : 4 + pulse * 4.3
      const px = x + Math.cos(angle) * radius
      const py = y + Math.sin(angle) * radius
      if (point === 0) context.moveTo(px, py)
      else context.lineTo(px, py)
    }
    context.closePath(); context.fill()
    context.restore()
  }
  const drawWinnerParticles = (now: number, x: number, y: number, side: Side, strength: number) => {
    const age = now - lastImpactAt
    if (age < 0 || age > 360 || strength < .04) return
    const progress = clamp(age / 360, 0, 1)
    const fade = (1 - progress) * strength
    const colors = side === 'angel'
      ? { core: '#ffffff', glow: '#dffaff', edge: '#48cfff' }
      : { core: '#fae2d7', glow: '#d05247', edge: '#792126' }
    context.save()
    context.globalCompositeOperation = 'lighter'
    context.globalAlpha = .26 + fade * .7
    context.shadowColor = colors.glow
    context.shadowBlur = 7 + fade * 12
    // Uneven soft blobs and broken rings give the burst the hand-drawn,
    // circular particle silhouette of the supplied reference.
    for (let index = 0; index < 13; index += 1) {
      const angle = index * 2.399 + (side === 'angel' ? -.45 : .32)
      const distance = (13 + (index % 5) * 8) * (.35 + progress * .95)
      const px = x + Math.cos(angle) * distance
      const py = y + Math.sin(angle) * distance * .72
      const radius = (index % 4 === 0 ? 4.8 : 2.4 + (index % 3)) * (.72 + fade * .6)
      context.fillStyle = index % 3 === 0 ? colors.core : index % 2 === 0 ? colors.glow : colors.edge
      context.beginPath()
      context.ellipse(px, py, radius * (1.25 + (index % 2) * .3), radius, angle, 0, Math.PI * 2)
      context.fill()
    }
    context.strokeStyle = colors.edge
    context.lineWidth = 1.2 + fade * 1.6
    context.setLineDash([5 + progress * 4, 4 + progress * 3])
    context.beginPath()
    context.arc(x, y, 17 + progress * 24, -now / 260, -now / 260 + Math.PI * 1.5)
    context.stroke()
    context.setLineDash([])
    context.restore()
  }
  const drawScuffleParticles = (now: number, angelX: number, devilX: number, y: number, size: number, winningSide: Side, strength: number) => {
    const age = now - lastImpactAt
    if (age < 0 || age > 330 || strength < .04) return
    const progress = clamp(age / 330, 0, 1)
    const fade = (1 - progress) * strength
    const fighters: Array<{ side: Side; x: number }> = [
      { side: 'angel', x: angelX + size * .5 },
      { side: 'devil', x: devilX + size * .5 },
    ]
    context.save()
    context.globalCompositeOperation = 'lighter'
    for (const fighter of fighters) {
      const isWinner = fighter.side === winningSide
      const colors = fighter.side === 'angel'
        ? { bright: '#efffff', vivid: '#54d9ff' }
        : { bright: '#fae2d6', vivid: '#bd3d38' }
      context.globalAlpha = fade * (isWinner ? .9 : .5)
      context.shadowColor = colors.vivid
      context.shadowBlur = isWinner ? 7 : 4
      // The small, uneven flecks are deliberately kept away from the face: they
      // scatter around each fighter's outline rather than across its features.
      for (let index = 0; index < 11; index += 1) {
        const angle = index * 2.399 + (fighter.side === 'angel' ? -.7 : .45)
        const distance = (size * (.28 + (index % 4) * .065)) * (.4 + progress * .85)
        const px = fighter.x + Math.cos(angle) * distance
        const py = y + size * .34 + Math.sin(angle) * distance * .76
        const radius = index % 4 === 0 ? 2.5 : 1.15 + (index % 3) * .4
        context.fillStyle = index % 3 === 0 ? colors.bright : colors.vivid
        context.beginPath()
        context.ellipse(px, py, radius * (index % 2 ? 1.7 : 1), radius, angle, 0, Math.PI * 2)
        context.fill()
      }
    }
    context.restore()
  }
  const drawLongWinkEffect = (now: number, width: number, height: number, ratio: number) => {
    const age = now - lastLongWinkAt
    if (!longWinkSide || age < 0 || age > 820) return
    const fade = clamp(1 - age / 820, 0, 1)
    context.save()
    context.globalCompositeOperation = 'lighter'
    if (longWinkSide === 'angel') {
      // The randomized particle set is distributed across a six-by-six field,
      // keeping the shower balanced while each feather has its own scale,
      // falling speed, rotation, and side-to-side drift.
      if (angelFeather.complete && angelFeather.naturalWidth) {
        const elapsed = now - longWinkStartedAt
        for (const particle of featherParticles) {
          const y = (particle.y * height + elapsed * particle.speed) % (height + particle.size * 2) - particle.size
          const x = particle.x * width + Math.sin(elapsed / 430 + particle.phase) * particle.drift
          context.globalAlpha = fade * particle.opacity
          const rotation = particle.rotation + elapsed * particle.rotationSpeed + Math.sin(elapsed / 360 + particle.phase) * .26
          const cosine = Math.cos(rotation)
          const sine = Math.sin(rotation)
          // Equivalent to save/translate/rotate for every feather, but avoids
          // 36 canvas state-stack round trips on every visible frame.
          context.setTransform(ratio * cosine, ratio * sine, -ratio * sine, ratio * cosine, x * ratio, y * ratio)
          // The cached sprite already contains the same alpha-following glow;
          // picking the nearest native bucket avoids a costly shadow pass for
          // each of the 36 feathers on every frame.
          context.globalAlpha = fade * particle.opacity
          if (!featherGlowSprites.length) prepareFeatherGlowSprites()
          const glowSprite = featherGlowSprites[particle.size < 39 ? 0 : particle.size < 61 ? 1 : 2]
          if (glowSprite) {
            const spriteScale = particle.size / glowSprite.featherSize
            const spriteWidth = glowSprite.width * spriteScale
            const spriteHeight = glowSprite.height * spriteScale
            context.drawImage(glowSprite.canvas, -spriteWidth * .5, -spriteHeight * .5, spriteWidth, spriteHeight)
          } else {
            context.drawImage(angelFeather, -particle.size * .5, -particle.size * .335, particle.size, particle.size * .67)
          }
        }
      }
    } else {
      // Long, layered lightning bolts mimic a fighting-game special effect:
      // ink-dark outer silhouette, red plasma, and a white-hot amber core.
      const elapsed = now - longWinkStartedAt
      context.lineCap = 'round'
      context.lineJoin = 'round'
      const strokeLightning = (points: Point[], boltWidth: number, alpha: number) => {
        const path = () => {
          context.beginPath(); context.moveTo(points[0].x, points[0].y)
          for (let point = 1; point < points.length; point += 1) context.lineTo(points[point].x, points[point].y)
        }
        context.globalAlpha = alpha * .86
        context.shadowColor = '#501014'
        context.shadowBlur = 22
        context.strokeStyle = '#0c0507'
        context.lineWidth = boltWidth * 6.4
        path(); context.stroke()
        context.globalAlpha = alpha
        context.shadowColor = '#b03630'
        context.shadowBlur = 17
        context.strokeStyle = '#8f292a'
        context.lineWidth = boltWidth * 3.2
        path(); context.stroke()
        context.shadowBlur = 8
        context.strokeStyle = '#e0614c'
        context.lineWidth = boltWidth * 1.55
        path(); context.stroke()
        context.strokeStyle = '#ffe4d4'
        context.lineWidth = Math.max(.9, boltWidth * .52)
        path(); context.stroke()
      }
      for (const bolt of lightningBolts) {
        const cycle = fract((elapsed + bolt.offset) / 760)
        const flash = cycle < .18 ? Math.sin(cycle / .18 * Math.PI) : 0
        if (flash < .04) continue
        const points: Point[] = []
        const horizontalPadding = Math.min(32, width * .08)
        const verticalPadding = Math.min(30, height * .055)
        let currentX = clamp(width * bolt.x, horizontalPadding, width - horizontalPadding)
        const boltLength = height * bolt.length
        const startY = clamp(height * bolt.y, verticalPadding, Math.max(verticalPadding, height - verticalPadding - boltLength))
        const usableLength = Math.max(0, Math.min(boltLength, height - verticalPadding - startY))
        const segments = 9
        for (let segment = 0; segment <= segments; segment += 1) {
          if (segment > 0) {
            const step = (fract(Math.sin(bolt.seed * 12.7 + segment * 9.31) * 593.17) - .5) * width * .14
            currentX = clamp(currentX + step, horizontalPadding, width - horizontalPadding)
          }
          points.push({ x: currentX, y: startY + usableLength * (segment / segments) })
        }
        const alpha = fade * flash
        strokeLightning(points, bolt.width, alpha)
        const branchStart = points[bolt.branchAt]
        const branchPoints = [branchStart]
        let branchX = branchStart.x
        for (let point = 1; point < 4; point += 1) {
          const step = (fract(Math.sin(bolt.seed * 4.9 + point * 12.11) * 401.71) - .5) * width * .12
          branchX = clamp(branchX + step, horizontalPadding, width - horizontalPadding)
          branchPoints.push({ x: branchX, y: clamp(branchStart.y + usableLength * .1 * point, verticalPadding, height - verticalPadding) })
        }
        strokeLightning(branchPoints, bolt.width * .48, alpha * .82)
        const impact = points[points.length - 1]
        context.globalAlpha = alpha * .82
        context.shadowColor = '#be3d34'
        context.shadowBlur = 14
        context.strokeStyle = '#ea7d5c'
        context.lineWidth = bolt.width * .9
        for (let spark = 0; spark < 5; spark += 1) {
          const angle = -Math.PI * .92 + spark * Math.PI * .46 + (fract(Math.sin(bolt.seed + spark * 18.3) * 99.7) - .5) * .35
          const distance = 12 + (spark % 3) * 7
          const sparkX = clamp(impact.x + Math.cos(angle) * distance, horizontalPadding, width - horizontalPadding)
          const sparkY = clamp(impact.y + Math.sin(angle) * distance, verticalPadding, height - verticalPadding)
          context.beginPath(); context.moveTo(impact.x, impact.y); context.lineTo(sparkX, sparkY); context.stroke()
        }
        context.fillStyle = '#ffe3d2'
        context.beginPath(); context.arc(impact.x, impact.y, 2.6 + bolt.width, 0, Math.PI * 2); context.fill()
      }
    }
    context.restore()
  }
  const updateHealth = (now: number) => {
    if (!lastHealthUpdateAt) { lastHealthUpdateAt = now; return }
    const elapsed = Math.min((now - lastHealthUpdateAt) / 1_000, .1)
    lastHealthUpdateAt = now
    // This remains an endless little argument, rather than creating a round
    // end state: both sides gently catch their breath after an exchange.
    if (duelMode && now - lastImpactAt > 560) {
      angelHealth = Math.min(100, angelHealth + elapsed * 4)
      devilHealth = Math.min(100, devilHealth + elapsed * 4)
    }
  }
  const drawHealthGauges = (now: number, width: number, height: number) => {
    if (duelBlend < .04) return
    const edgeInset = clamp(width * .035, 12, 36)
    const portraitSize = clamp(width * .105, 32, 44)
    const gaugeWidth = clamp(width * .07, 24, 34)
    const gaugeHeight = clamp(height * .34, 138, 280)
    const y = clamp(height * .13, 72, 116)
    const drawGauge = (side: Side, health: number, hitAt: number, x: number) => {
      const isAngel = side === 'angel'
      const hit = clamp(1 - (now - hitAt) / 260, 0, 1)
      const fill = clamp(health / 100, 0, 1)
      const colors = isAngel
        ? { fillStart: '#4f9ed9', fillMid: '#a6ecff', fillEnd: '#ffffff', flare: '#c5f6ff', paper: '#f7fdff', ink: '#153862', edge: '#76cfff' }
        : { fillStart: '#2d080a', fillMid: '#922a2b', fillEnd: '#df9377', flare: '#e07059', paper: '#170608', ink: '#090203', edge: '#963037' }
      const railPath = (inset = 0) => {
        const left = x + inset
        const right = x + gaugeWidth - inset
        const top = y + inset
        const bottom = y + gaugeHeight - inset
        const radius = Math.max(6, (right - left) * .5)
        context.beginPath()
        context.moveTo(left + radius, top)
        context.lineTo(right - radius, top)
        context.quadraticCurveTo(right, top, right, top + radius)
        context.lineTo(right, bottom - radius)
        context.quadraticCurveTo(right, bottom, right - radius, bottom)
        context.lineTo(left + radius, bottom)
        context.quadraticCurveTo(left, bottom, left, bottom - radius)
        context.lineTo(left, top + radius)
        context.quadraticCurveTo(left, top, left + radius, top)
        context.closePath()
      }
      context.save()
      context.globalAlpha = duelBlend
      context.shadowColor = hit > 0 ? colors.flare : colors.edge
      context.shadowBlur = 8 + hit * 10
      railPath(); context.fillStyle = colors.paper; context.fill()
      context.shadowBlur = 0
      context.strokeStyle = colors.ink; context.lineWidth = 5; railPath(); context.stroke()
      context.strokeStyle = colors.edge; context.lineWidth = 2.1 + hit * .8; railPath(1.8); context.stroke()
      context.strokeStyle = isAngel ? '#ffffff' : '#f2c6b8'
      context.globalAlpha = duelBlend * .58
      context.lineWidth = .9; railPath(4); context.stroke()

      const inset = 8
      const innerHeight = gaugeHeight - inset * 2
      const fillHeight = innerHeight * fill
      const fillY = y + gaugeHeight - inset - fillHeight
      if (fillHeight > 0) {
        const gradient = context.createLinearGradient(x, fillY, x, fillY + fillHeight)
        gradient.addColorStop(0, colors.fillEnd)
        gradient.addColorStop(.48, colors.fillMid)
        gradient.addColorStop(1, colors.fillStart)
        context.save()
        railPath(5); context.clip()
        context.fillStyle = gradient
        context.fillRect(x + 6, fillY, gaugeWidth - 12, fillHeight)
        context.globalAlpha = duelBlend * .3
        context.strokeStyle = '#ffffff'; context.lineWidth = .8
        for (let stripe = fillY + 5; stripe < fillY + fillHeight; stripe += 13) {
          context.beginPath(); context.moveTo(x + 6, stripe); context.lineTo(x + gaugeWidth - 6, stripe - 4); context.stroke()
        }
        context.restore()
      }
      // The scan light now travels vertically, emphasizing the new tall rail.
      const sweep = fract(now / 850 + (isAngel ? 0 : .48))
      const sweepY = y - gaugeHeight * .16 + sweep * gaugeHeight * 1.32
      context.save()
      railPath(4); context.clip()
      context.globalCompositeOperation = 'lighter'
      const beam = context.createLinearGradient(x, sweepY - gaugeHeight * .08, x, sweepY + gaugeHeight * .08)
      beam.addColorStop(0, 'rgba(255,255,255,0)')
      beam.addColorStop(.42, isAngel ? 'rgba(177,248,255,.03)' : 'rgba(218,80,67,.04)')
      beam.addColorStop(.5, 'rgba(255,255,255,.72)')
      beam.addColorStop(.58, isAngel ? 'rgba(120,231,255,.16)' : 'rgba(194,55,48,.17)')
      beam.addColorStop(1, 'rgba(255,255,255,0)')
      context.globalAlpha = duelBlend * (.3 + hit * .25)
      context.fillStyle = beam
      context.fillRect(x + 3, sweepY - gaugeHeight * .08, gaugeWidth - 6, gaugeHeight * .16)
      context.restore()
      if (fillHeight > 4) {
        context.save()
        context.globalCompositeOperation = 'lighter'
        context.globalAlpha = duelBlend * (.34 + hit * .46)
        context.shadowColor = isAngel ? '#71efff' : '#d24a3e'
        context.shadowBlur = 11 + hit * 7
        context.strokeStyle = isAngel ? '#dfffff' : '#f1c7b8'
        context.lineWidth = 1.1 + hit
        context.beginPath(); context.moveTo(x + 4, fillY); context.lineTo(x + gaugeWidth - 4, fillY); context.stroke()
        context.fillStyle = '#ffffff'
        for (const offset of [-5, 5]) {
          context.beginPath(); context.arc(x + gaugeWidth * .5 + offset, fillY, 1.15 + hit, 0, Math.PI * 2); context.fill()
        }
        context.restore()
      }
      context.restore()
    }
    const leftGaugeX = edgeInset
    const rightGaugeX = width - edgeInset - gaugeWidth
    drawGauge('angel', angelHealth, angelHitAt, leftGaugeX)
    drawGauge('devil', devilHealth, devilHitAt, rightGaugeX)

    const drawPortrait = (image: HTMLImageElement, cx: number, side: Side) => {
      if (!image.complete || !image.naturalWidth) return
      const cy = y + portraitSize * .18
      const radius = portraitSize * .53
      const isAngel = side === 'angel'
      context.save()
      context.globalAlpha = duelBlend
      context.shadowColor = isAngel ? '#b7f6ff' : '#b33a35'; context.shadowBlur = 7
      context.fillStyle = isAngel ? '#f5fdff' : '#070d20'
      context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2); context.fill()
      context.shadowBlur = 0
      context.strokeStyle = isAngel ? '#78cffa' : '#943139'; context.lineWidth = 2
      context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2); context.stroke()
      context.save()
      context.beginPath(); context.arc(cx, cy, radius - 2, 0, Math.PI * 2); context.clip()
      const imageSize = portraitSize * 1.7
      context.filter = 'none'
      context.drawImage(image, cx - imageSize * .5, cy - portraitSize * .8, imageSize, imageSize)
      context.restore()
      context.strokeStyle = isAngel ? 'rgba(255,255,255,.9)' : 'rgba(244,189,175,.84)'; context.lineWidth = .8
      context.beginPath(); context.arc(cx, cy, radius - 3.3, 0, Math.PI * 2); context.stroke()
      context.restore()
    }
    drawPortrait(angel, leftGaugeX + gaugeWidth * .5, 'angel')
    drawPortrait(devil, rightGaugeX + gaugeWidth * .5, 'devil')
  }
  // The HUD is intentionally dormant while preserving the battle state for a
  // possible future UI treatment without affecting the render loop.
  void updateHealth
  void drawHealthGauges
  const drawScene = (now: number) => {
    const ratio = resize()
    const { width, height } = cover()
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    // The canvas is opaque and immediately painted edge-to-edge below, so a
    // separate full-frame clear only adds a costly raster pass.
    context.fillStyle = '#9a9dc4'
    context.fillRect(0, 0, width, height)
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth) {
      const fit = cover()
      const drawX = (width - fit.sourceWidth * fit.scale) / 2
      const drawY = (height - fit.sourceHeight * fit.scale) / 2
      const drawWidth = fit.sourceWidth * fit.scale
      const drawHeight = fit.sourceHeight * fit.scale
      // Winks never replace the camera world: the user's real environment
      // stays visible underneath the characters and their screen-wide effects.
      context.save()
      context.translate(width, 0); context.scale(-1, 1)
      context.drawImage(video, drawX, drawY, drawWidth, drawHeight)
      context.restore()
    }
    duelBlend = lerp(duelBlend, duelMode ? 1 : 0, .14)
    if (Math.abs((duelMode ? 1 : 0) - duelBlend) < .003) duelBlend = duelMode ? 1 : 0
    const strength = duelMode && lastWinkSide ? clamp(1 - (now - lastWinkAt) / 260, 0, 1) : 0
    const activeSide = strength > 0 ? lastWinkSide : null
    const pose = facePose ?? { x: width / 2, y: height * .22, angle: 0, scale: .86 }
    const bob = Math.sin(now / 730) * 6
    const cloudWidth = clamp(width * .56 * pose.scale, 180, 390)
    const cloudHeight = cloudWidth * (cloudPlatform.naturalHeight / cloudPlatform.naturalWidth || .5)
    const hellCloudActive = duelMode && lastImpactSide === 'devil' && now - lastImpactAt < 900
    const displayedCloud = hellCloudActive && hellCloudPlatform.complete && hellCloudPlatform.naturalWidth ? hellCloudPlatform : cloudPlatform
    // Keep the full cloud in frame without biasing it toward either edge.
    const cloudX = clamp(pose.x - cloudWidth / 2, -10, width - cloudWidth + 10)
    const cloudY = clamp(pose.y - cloudHeight * .9 + bob, 8, height * .54)
    // While the cloud is away, the two characters act like small floating pets
    // at either side of the screen. Their individual paths keep them alive
    // without needing face tracking in this lower-power mode.
    const petSize = clamp(Math.min(width * .28, height * .23), 92, 166)
    const petAngelX = clamp(width * .07 + Math.sin(now / 1320) * width * .035, 8, width - petSize - 8)
    const petDevilX = clamp(width * .75 + Math.sin(now / 1470 + 1.3) * width * .035, 8, width - petSize - 8)
    const petAngelY = clamp(height * .42 + Math.sin(now / 920) * height * .055, 18, height - petSize * 1.15)
    const petDevilY = clamp(height * .42 + Math.sin(now / 1110 + .8) * height * .055, 18, height - petSize * 1.15)
    context.save()
    if (duelBlend > .01 && cloudPlatform.complete && cloudPlatform.naturalWidth) {
      context.save()
      context.globalAlpha = duelBlend
      // Canvas shadows are visually equivalent here but avoid the temporary
      // filtered surface allocated by CSS-style drop-shadow every frame.
      context.shadowColor = hellCloudActive ? 'rgba(3, 0, 4, .5)' : 'rgba(19, 18, 59, .28)'
      context.shadowBlur = 14
      context.shadowOffsetY = 15
      context.filter = 'none'
      context.drawImage(displayedCloud, cloudX, cloudY, cloudWidth, cloudHeight)
      context.restore()
    }
    const platformY = cloudY + cloudHeight * .42
    const characterSize = cloudWidth * .4
    // Each hit is a compact three-beat animation: crouch, spring forward,
    // then recoil.  Moving the sprites (rather than only flashing an impact)
    // makes the two pets visibly trade little punches on their cloud.
    const attackPhase = activeSide ? 1 - strength : 0
    const strike = activeSide ? Math.sin(attackPhase * Math.PI) : 0
    const crouch = activeSide ? Math.max(0, .26 - attackPhase) / .26 : 0
    const angelStrike = activeSide === 'angel' ? strike : 0
    const devilStrike = activeSide === 'devil' ? strike : 0
    const angelX = cloudX + cloudWidth * .08 + angelStrike * cloudWidth * .175 - devilStrike * cloudWidth * .065
    const devilX = cloudX + cloudWidth * .52 - devilStrike * cloudWidth * .175 + angelStrike * cloudWidth * .065
    const bounce = Math.sin(now / 240) * 2
    const characterY = platformY - characterSize * .75 + bounce
    const displayedAngelSize = lerp(petSize, characterSize, duelBlend)
    const displayedDevilSize = lerp(petSize, characterSize, duelBlend)
    const displayedAngelX = lerp(petAngelX, angelX, duelBlend)
    const displayedDevilX = lerp(petDevilX, devilX, duelBlend)
    const displayedAngelY = lerp(petAngelY, characterY - angelStrike * characterSize * .14 + devilStrike * characterSize * .07 + crouch * characterSize * .04, duelBlend)
    const displayedDevilY = lerp(petDevilY, characterY - devilStrike * characterSize * .14 + angelStrike * characterSize * .07 + crouch * characterSize * .04, duelBlend)
    // Layer a tiny breath, sway, and springy footwork over the existing attack
    // lunge. The source art stays unchanged, but the pair feel like game
    // characters idling and readying themselves between exchanges.
    const angelPulse = Math.sin(now / 175) * .5 + Math.sin(now / 470 + .7) * .5
    const devilPulse = Math.sin(now / 158 + .8) * .5 + Math.sin(now / 430) * .5
    const angelBob = angelPulse * (1.7 + duelBlend * 1.5)
    const devilBob = devilPulse * (1.7 + duelBlend * 1.5)
    const angelStep = Math.sin(now / 225) * 1.8 * duelBlend + angelStrike * 4 - devilStrike * 2
    const devilStep = Math.sin(now / 205 + .9) * 1.8 * duelBlend - devilStrike * 4 + angelStrike * 2
    // The original illustration stays intact. Motion comes from a compact
    // forward hop, body lean, and recoil rather than added limbs or distortion.
    const angelAngle = angelPulse * .008 + angelStrike * .11 - devilStrike * .065 - crouch * .04
    const devilAngle = -devilPulse * .008 - devilStrike * .11 + angelStrike * .065 + crouch * .04
    const angelDrawX = displayedAngelX + angelStep
    const devilDrawX = displayedDevilX + devilStep
    const angelDrawY = displayedAngelY
    const devilDrawY = displayedDevilY
    drawSprite(angel, angelDrawX, angelDrawY, displayedAngelSize, angelAngle, angelBob - angelStrike * 2)
    drawSprite(devil, devilDrawX, devilDrawY, displayedDevilSize, devilAngle, devilBob - devilStrike * 2)
    // Put the impact on the foreground, then layer fine flecks around both
    // fighters so the exchange feels lively without obscuring their faces.
    if (activeSide && duelBlend > .86) {
      const winnerX = activeSide === 'angel' ? angelX + characterSize * .5 : devilX + characterSize * .5
      const winnerY = characterY + characterSize * .34
      drawImpact(now, cloudX + cloudWidth * .5, platformY - characterSize * .18, activeSide, strength)
      drawWinnerParticles(now, winnerX, winnerY, activeSide, strength)
      drawScuffleParticles(now, angelX, devilX, characterY, characterSize, activeSide, strength)
    }
    context.restore()
    drawLongWinkEffect(now, width, height, ratio)
  }
  const run = (now: number) => {
    if (!open) return
    // The camera itself is 30 fps. Capping composition to the same rate halves
    // redundant canvas work without changing the visible motion.
    if (now - lastRenderAt >= 1000 / 30) {
      if (tracking) {
        updateFistBump(now)
        updateTracking(now)
      }
      drawScene(now)
      lastRenderAt = now
    }
    frame = requestAnimationFrame(run)
  }
  const releaseCamera = () => {
    landmarker?.close(); landmarker = null
    handLandmarker?.close(); handLandmarker = null
    stream?.getTracks().forEach((track) => track.stop()); stream = null
    video.srcObject = null
    outputStream?.getTracks().forEach((track) => track.stop()); outputStream = null
    tracking = false
    lastHandInferenceAt = 0
    lastHandVideoTime = -1
  }
  const startCamera = async () => {
    if (tracking || startButton.disabled) return
    startButton.disabled = true
    startButton.textContent = '카메라 연결 중…'
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: false })
      if (!open) { stream.getTracks().forEach((track) => track.stop()); stream = null; return }
      video.srcObject = stream
      await video.play()
      revealOnFirstVideoFrame(screen, video)
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm')
      // Prefer the GPU delegate: the exact same model/output is used, but the
      // heavy inference no longer competes with canvas work on supported phones.
      // CPU is retained as a compatibility fallback for older browsers.
      let nextLandmarker: FaceLandmarker
      try {
        nextLandmarker = await FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task', delegate: 'GPU' }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true })
      } catch (gpuError) {
        console.warn('Angel Devil face tracker GPU fallback:', gpuError)
        nextLandmarker = await FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task', delegate: 'CPU' }, runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true })
      }
      if (!open) { nextLandmarker.close(); releaseCamera(); return }
      landmarker = nextLandmarker
      try {
        let nextHandLandmarker: HandLandmarker
        try {
          nextHandLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task', delegate: 'GPU' },
            runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .25, minHandPresenceConfidence: .25, minTrackingConfidence: .25,
          })
        } catch (gpuError) {
          console.warn('Angel Devil hand tracker GPU fallback:', gpuError)
          nextHandLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task', delegate: 'CPU' },
            runningMode: 'VIDEO', numHands: 2, minHandDetectionConfidence: .25, minHandPresenceConfidence: .25, minTrackingConfidence: .25,
          })
        }
        if (!open) { nextHandLandmarker.close(); releaseCamera(); return }
        handLandmarker = nextHandLandmarker
      } catch (error) {
        console.warn('Angel Devil fist-bump tracker:', error)
      }
      if (!open) { releaseCamera(); return }
      tracking = true
      warmVisualAssets()
      screen.classList.add('is-tracking')
    } catch (error) {
      console.error('Angel Devil camera:', error)
      screen.classList.remove('is-camera-pending')
      releaseCamera()
      startButton.disabled = false
      startButton.classList.remove('is-hidden')
    }
  }
  startButton.addEventListener('click', () => { void startCamera() })
  closeButton.addEventListener('click', () => history.back())
  document.addEventListener('visibilitychange', () => {
    if (!open) return
    if (document.hidden) {
      // Do not keep running compositing or camera frames while the experience
      // cannot be seen. Tracks resume without a second permission prompt.
      cancelAnimationFrame(frame); frame = 0
      stream?.getVideoTracks().forEach((track) => { track.enabled = false })
      return
    }
    stream?.getVideoTracks().forEach((track) => { track.enabled = true })
    lastVideoTime = -1
    lastRenderAt = 0
    if (!frame) frame = requestAnimationFrame(run)
  })
  return {
    open: () => {
      open = true
      lastRenderAt = 0
      screen.classList.add('is-open')
      screen.classList.add('is-camera-pending')
      screen.setAttribute('aria-hidden', 'false')
      startButton.classList.add('is-hidden')
      frame = requestAnimationFrame(run)
      void startCamera()
      closeButton.focus()
    },
    close: () => {
      open = false
      cancelAnimationFrame(frame); frame = 0
      lastRenderAt = 0
      releaseCamera()
      facePose = null; lastFaceSeenAt = 0; poseFrozenUntil = 0; lastWinkSide = null; lastWinkAt = 0; lastImpactAt = 0; lastImpactSide = null
      winkHoldSide = null; winkHoldStartedAt = 0; lastWinkObservedAt = 0; leftBlinkSignal = 0; rightBlinkSignal = 0; longWinkSide = null; lastLongWinkAt = 0; longWinkStartedAt = 0; longWinkCanRestart = true
      featherParticles = []; lightningBolts = []
      angelHealth = 100; devilHealth = 100; angelHitAt = 0; devilHitAt = 0; lastHealthUpdateAt = 0
      modeChangedAt = 0
      duelMode = false; duelBlend = 0; fistsWereApart = false; fistContactFrames = 0; lastFistsCloseAt = 0; lastTwoFistsAt = 0; lastFistsApproachingAt = 0; smoothedFistDistance = Infinity
      screen.classList.remove('is-open', 'is-tracking')
      screen.setAttribute('aria-hidden', 'true')
      startButton.disabled = false
      startButton.classList.remove('is-hidden')
    },
    getRecordingStream: () => { if (!open || !canvas.captureStream) return null; outputStream ??= canvas.captureStream(30); return outputStream },
    getRecordingCanvas: () => open ? canvas : null,
  }
}
