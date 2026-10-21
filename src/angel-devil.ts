import { requestCamera } from './analytics'
import { FaceLandmarker, FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import { revealOnFirstVideoFrame } from './camera-page'
import { createDuelChoreography, restingFighterPose } from './angel-devil-motion'
import type { FighterPose } from './angel-devil-motion'
import { createFighterRigRenderer } from './angel-devil-rig'
import { createDuelEffects } from './angel-devil-effects'
import { createDevilVictoryEffect, drawDevilEmberField } from './angel-devil-celebration'
import { createDuelVitals, createDamageNumbers, drawDuelHud } from './angel-devil-hud'
import { drawFighterGrip, drawFighterWeapon, drawWeaponSwing, fighterWeaponPlacement } from './angel-devil-weapons'
import angelUrl from './assets/angel-devil/angel-retro-3d-blended-v9.lossless.png'
import cloudUrl from './assets/angel-devil/cloud-platform-retro-3d-blended-v6.lossless.png'
import devilUrl from './assets/angel-devil/devil-retro-3d-raspberry-v16.lossless.png'
import angelFeatherUrl from './assets/angel-devil/angel-feather-retro-3d-blended-v5.lossless.png'
import hellCloudUrl from './assets/angel-devil/hell-cloud-platform-raspberry-v17.lossless.png'

type Side = 'angel' | 'devil'
type Point = { x: number; y: number }
type FacePose = Point & { angle: number; scale: number }
type FeatherParticle = { x: number; y: number; size: number; speed: number; rotation: number; rotationSpeed: number; drift: number; phase: number; opacity: number }
type FeatherGlowSprite = { canvas: HTMLCanvasElement; featherSize: number; width: number; height: number }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount
const LONG_WINK_DELAY = 1_000
const FIGHTER_SCALE = .85
const FEATHER_VISUAL_SCALE = .75

/** A face-following thought cloud. Each wink animates only that fighter;
 * both characters rest when there is no attack. */
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
  const fighterPortraits = { angel, devil }
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
  const choreography = createDuelChoreography()
  const neutralFighter = restingFighterPose()
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const duelEffects = createDuelEffects()
  const devilVictory = createDevilVictoryEffect()
  const vitals = createDuelVitals()
  const damageNumbers = createDamageNumbers()
  let lastImpactAt = 0
  let lastImpactSide: Side | null = null
  let lastImpactBoosted = false
  let lastImpactPoint: Point | null = null
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
  let visualWarmupTimer = 0
  let visualWarmupGeneration = 0
  let fighterRig: ReturnType<typeof createFighterRigRenderer> | null = null

  const cancelVisualWarmup = () => {
    window.clearTimeout(visualWarmupTimer); visualWarmupTimer = 0
    visualWarmupGeneration++
    visualAssetsWarmed = false
  }

  const warmVisualAssets = () => {
    if (visualAssetsWarmed) return
    visualAssetsWarmed = true
    // Browsers otherwise often decode the cloud PNGs on their first
    // draw, which coincides with the fist-bump transition. Decode them off the
    // interaction path after the camera has settled instead.
    const generation = visualWarmupGeneration
    visualWarmupTimer = window.setTimeout(() => {
      visualWarmupTimer = 0
      if (!open || generation !== visualWarmupGeneration) return
      void Promise.all([angel, devil, cloudPlatform, hellCloudPlatform, angelFeather].map((image) => image.decode().catch(() => undefined))).then(() => {
        if (!open || generation !== visualWarmupGeneration) return
        prepareFeatherGlowSprites()
        fighterRig ??= createFighterRigRenderer()
        fighterRig.prepare(angel, 'angel'); fighterRig.prepare(devil, 'devil')
      })
    }, 180)
  }

  const prepareFeatherGlowSprites = () => {
    if (featherGlowSprites.length || !angelFeather.complete || !angelFeather.naturalWidth) return
    const featherRatio = angelFeather.naturalHeight / angelFeather.naturalWidth
    // Cache only the light layer. Render the original feather separately so
    // its colors stay crisp without changing the glow intensity.
    featherGlowSprites = [64, 104, 144].map((featherSize) => {
      const width = featherSize * 2.6, height = featherSize * 2.1, density = 2
      const glowCanvas = document.createElement('canvas')
      glowCanvas.width = Math.ceil(width * density); glowCanvas.height = Math.ceil(height * density)
      const g = glowCanvas.getContext('2d')!
      g.scale(density, density); g.translate(width / 2, height / 2)
      const radius = featherSize * .95, bloom = g.createRadialGradient(0, 0, 0, 0, 0, radius)
      bloom.addColorStop(0, 'rgba(225,255,239,.65)'); bloom.addColorStop(.25, 'rgba(149,201,239,.28)'); bloom.addColorStop(1, 'transparent')
      g.fillStyle = bloom; g.fillRect(-radius, -radius, radius * 2, radius * 2)
      for (const angle of [-.32, Math.PI - .32, Math.PI / 2 - .32, -Math.PI / 2 - .32]) {
        g.save(); g.rotate(angle)
        const length = featherSize * 1.2, ray = g.createLinearGradient(0, 0, length, 0)
        ray.addColorStop(0, 'rgba(236,255,244,.8)'); ray.addColorStop(.2, 'rgba(180,233,231,.32)'); ray.addColorStop(1, 'transparent')
        g.fillStyle = ray; g.beginPath(); g.moveTo(0, -featherSize * .035); g.lineTo(length, 0); g.lineTo(0, featherSize * .035); g.closePath(); g.fill(); g.restore()
      }
      g.shadowColor = '#73e8b8'; g.shadowBlur = 14 + featherSize * .12
      g.globalAlpha = .24
      g.filter = 'blur(5px)'
      g.drawImage(angelFeather, -featherSize / 2, -featherSize * featherRatio / 2, featherSize, featherSize * featherRatio)
      g.filter = 'none'; g.shadowBlur = 0
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
    if (duelMode) choreography.requestAttack(side, now)
  }
  const prepareLongWinkEffect = (side: Side, now: number) => {
    longWinkSide = side
    longWinkStartedAt = now
    longWinkCanRestart = false
    if (side === 'angel') {
      featherParticles = Array.from({ length: 28 }, (_, index) => {
        const column = index % 6
        const row = Math.floor(index / 6)
        return {
          x: clamp((column + .5 + (Math.random() - .5) * .72) / 6, .035, .965),
          y: clamp((row + .5 + (Math.random() - .5) * .72) / 5, .025, .975),
          size: 54 + Math.random() * 92,
          speed: .11 + Math.random() * .17,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - .5) * .0045,
          drift: 8 + Math.random() * 36,
          phase: Math.random() * Math.PI * 2,
          opacity: .4 + Math.random() * .4,
        }
      })
      return
    }
    featherParticles = []
  }
  const toggleDuelMode = (now: number) => {
    duelMode = !duelMode
    modeChangedAt = now
    // The idle tracker has already captured the brow anchor. Hold that anchor
    // briefly while the fists leave the frame so their movement cannot pull
    // the cloud down as battle appears.
    poseFrozenUntil = duelMode ? now + 420 : now + 150
    duelEffects.reset()
    devilVictory.reset()
    choreography.reset(now)
    lastImpactAt = 0
    lastImpactSide = null
    lastImpactBoosted = false
    lastImpactPoint = null
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
    lastVideoTime = -1
    fistsWereApart = false
    fistContactFrames = 0
    lastFistsCloseAt = 0
    lastTwoFistsAt = 0
    lastFistsApproachingAt = 0
    smoothedFistDistance = Infinity
    vitals.reset(); damageNumbers.reset()
  }
  const updateTracking = (now: number) => {
    // Keep a light brow anchor even while the characters are pets. This lets
    // battle start from the correct place without analysing the face on the
    // same moment that two fists meet.
    const interval = duelMode ? 33 : 160
    if (!landmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || now < poseFrozenUntil || now - lastInferenceAt < interval || video.currentTime === lastVideoTime) return
    lastInferenceAt = now
    lastVideoTime = video.currentTime
    const result = landmarker.detectForVideo(video, now)
    const face = result.faceLandmarks[0]
    if (!face) {
      // A hand passing through the face area can hide landmarks for a few
      // frames. Keep the most recent stable brow point during that brief gap.
      if (now - lastFaceSeenAt > 700) facePose = null
      if (now - lastWinkObservedAt > 120) choreography.releaseWink()
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
    // Retain short blendshape peaks across the camera's tracking cadence. The
    // right eye gets a slightly more forgiving entry point because its value
    // often arrives one inference later in mirrored webcam feeds.
    leftBlinkSignal = leftBlinkSignal * .42 + left * .58
    rightBlinkSignal = rightBlinkSignal * .42 + right * .58
    // A clearly reopened pair of eyes rearms the next wink immediately; a
    // stale smoothed peak must not swallow a quick second attack.
    const eyesOpen = left < .2 && right < .2
    if (eyesOpen) { leftBlinkSignal = 0; rightBlinkSignal = 0; choreography.releaseWink() }
    const leftBlink = Math.max(left, leftBlinkSignal)
    const rightBlink = Math.max(right, rightBlinkSignal)
    const bothEyesClosed = leftBlink > .58 && rightBlink > .58
    const winkSide = !bothEyesClosed && leftBlink > .45 && leftBlink - rightBlink > .12
      ? 'angel'
      : !bothEyesClosed && rightBlink > .36 && rightBlink - leftBlink > .06
        ? 'devil'
        : null
    if (!winkSide) {
      if (bothEyesClosed || now - lastWinkObservedAt > 120) choreography.releaseWink()
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
  const drawSprite = (image: HTMLImageElement, x: number, y: number, size: number, angle: number, bob = 0, scaleX = 1, scaleY = 1, pose?: FighterPose, side?: Side) => {
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
    const activePose = pose ?? neutralFighter
    if (side && duelBlend > .001) drawWeaponSwing(context, side, activePose, size, height, duelBlend)
    const articulated = pose && side && Math.abs(pose.twist) + pose.windup + pose.punch + pose.kick > .0001
    let skin: HTMLCanvasElement | null = null
    if (articulated) {
      fighterRig ??= createFighterRigRenderer()
      skin = fighterRig.draw(image, side, pose)
    }
    const paintBody = () => {
      if (skin) context.drawImage(skin, -size * .75, -height * .93, size * 1.5, height * 1.5)
      else context.drawImage(image, -size / 2, -height * .68, size, height)
    }
    paintBody()
    if (side && duelBlend > .001) {
      drawFighterWeapon(context, side, activePose, size, height, duelBlend)
      context.save(); context.globalAlpha *= duelBlend
      drawFighterGrip(context, side, activePose, size, height, paintBody)
      context.restore()
    }
    context.restore()
  }
  const drawLongWinkEffect = (now: number, width: number, height: number, ratio: number) => {
    if (devilVictory.active(now) || vitals.snapshot().winner) return
    const age = now - lastLongWinkAt
    if (!longWinkSide || age < 0 || age > 820 || reducedMotion.matches) return
    const fade = clamp(1 - age / 820, 0, 1)
    context.save()
    context.globalCompositeOperation = 'source-over'
    if (longWinkSide === 'angel') {
      // The randomized particle set is distributed across the viewport,
      // keeping the shower balanced while each feather has its own scale,
      // falling speed, rotation, and side-to-side drift.
      if (angelFeather.complete && angelFeather.naturalWidth) {
        const elapsed = now - longWinkStartedAt
        for (const particle of featherParticles) {
          const featherSize = particle.size * FEATHER_VISUAL_SCALE
          const y = (particle.y * height + elapsed * particle.speed) % (height + particle.size * 2) - particle.size
          const x = particle.x * width + Math.sin(elapsed / 430 + particle.phase) * particle.drift
          context.globalAlpha = fade * particle.opacity
          const rotation = particle.rotation + elapsed * particle.rotationSpeed + Math.sin(elapsed / 360 + particle.phase) * .26
          const cosine = Math.cos(rotation)
          const sine = Math.sin(rotation)
          // Equivalent to save/translate/rotate for every feather, but avoids
          // repeated canvas state-stack round trips on every visible frame.
          context.setTransform(ratio * cosine, ratio * sine, -ratio * sine, ratio * cosine, x * ratio, y * ratio)
          // Keep the light bright while preserving the feather's original alpha.
          // The nearest cached bucket avoids a shadow/blur pass per frame.
          context.globalAlpha = fade * particle.opacity
          if (!featherGlowSprites.length) prepareFeatherGlowSprites()
          const glowSprite = featherGlowSprites[particle.size < 84 ? 0 : particle.size < 124 ? 1 : 2]
          if (glowSprite) {
            context.globalCompositeOperation = 'screen'
            const spriteScale = featherSize / glowSprite.featherSize
            const spriteWidth = glowSprite.width * spriteScale
            const spriteHeight = glowSprite.height * spriteScale
            context.drawImage(glowSprite.canvas, -spriteWidth * .5, -spriteHeight * .5, spriteWidth, spriteHeight)
          }
          context.globalCompositeOperation = 'source-over'
          context.globalAlpha = fade
          const featherHeight = featherSize * angelFeather.naturalHeight / angelFeather.naturalWidth
          context.drawImage(angelFeather, -featherSize * .5, -featherHeight * .5, featherSize, featherHeight)
        }
      }
    } else {
      drawDevilEmberField(context, now - longWinkStartedAt, fade, width, height)
    }
    context.restore()
  }
  const drawScene = (now: number) => {
    const ratio = resize()
    const fit = cover(), { width, height } = fit
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    // The canvas is opaque and immediately painted edge-to-edge below, so a
    // separate full-frame clear only adds a costly raster pass.
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth) {
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
    } else {
      context.fillStyle = '#9a9dc4'
      context.fillRect(0, 0, width, height)
    }
    duelBlend = lerp(duelBlend, duelMode ? 1 : 0, .14)
    if (Math.abs((duelMode ? 1 : 0) - duelBlend) < .003) duelBlend = duelMode ? 1 : 0
    vitals.update(now)
    const motion = duelMode && duelBlend > .86 ? choreography.sample(now, reducedMotion.matches) : null
    const damage = motion?.impact ? vitals.hit(motion.impact.side, motion.impact.boosted ? 8 : 3, motion.impact.at) : null
    if (motion?.impact) {
      const hit = motion.impact
      lastImpactAt = hit.at
      lastImpactSide = hit.side
      lastImpactBoosted = hit.boosted
      lastImpactPoint = null
    }
    const pose = facePose ?? { x: width / 2, y: height * .22, angle: 0, scale: .86 }
    const bob = Math.sin(now / 730) * 6 * (1 - duelBlend)
    // Keep the duel comfortably framed below the header in shallow landscape viewports.
    const cloudWidth = Math.min(clamp(width * .56 * pose.scale, 180, 390), Math.max(180, (height - 140) * 1.12))
    const cloudHeight = cloudWidth * (cloudPlatform.naturalHeight / cloudPlatform.naturalWidth || .5)
    const characterSize = cloudWidth * .4 * FIGHTER_SCALE
    const hellCloudActive = duelMode && lastImpactSide === 'devil' && now - lastImpactAt < 900
    const displayedCloud = hellCloudActive && hellCloudPlatform.complete && hellCloudPlatform.naturalWidth ? hellCloudPlatform : cloudPlatform
    // Keep the full cloud in frame without biasing it toward either edge.
    const cloudX = clamp(pose.x - cloudWidth / 2, -10, width - cloudWidth + 10)
    // Reserve space for the highest jump/lean, even with a face at the top.
    const cloudY = clamp(pose.y - cloudHeight * .9 + bob, Math.max(8, characterSize * 1.3 - cloudHeight * .42 + 54 * duelBlend), height * .54)
    // While the cloud is away, the two characters act like small floating pets
    // at either side of the screen. Their individual paths keep them alive
    // without needing face tracking in this lower-power mode.
    const petSize = clamp(Math.min(width * .28, height * .23), 92, 166) * FIGHTER_SCALE
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
      context.shadowColor = hellCloudActive ? 'rgba(59, 18, 42, .28)' : 'rgba(19, 18, 59, .28)'
      context.shadowBlur = 14
      context.shadowOffsetY = 15
      context.filter = 'none'
      context.drawImage(displayedCloud, cloudX, cloudY, cloudWidth, cloudHeight)
      context.restore()
    }
    const platformY = cloudY + cloudHeight * .42
    // Shrink the pair around the platform center so weapon reach and spacing
    // retain their proportions at the smaller character size.
    const formationX = cloudX + cloudWidth * (1 - FIGHTER_SCALE) * .5
    const angelX = formationX + cloudWidth * .10 * FIGHTER_SCALE + (motion?.angel.x ?? 0) * characterSize
    const devilX = formationX + cloudWidth * .49 * FIGHTER_SCALE + (motion?.devil.x ?? 0) * characterSize
    const characterY = platformY - characterSize * .75
    const displayedAngelSize = lerp(petSize, characterSize, duelBlend)
    const displayedDevilSize = lerp(petSize, characterSize, duelBlend)
    const displayedAngelX = lerp(petAngelX, angelX, duelBlend)
    const displayedDevilX = lerp(petDevilX, devilX, duelBlend)
    const displayedAngelY = lerp(petAngelY, characterY + (motion?.angel.y ?? 0) * characterSize, duelBlend)
    const displayedDevilY = lerp(petDevilY, characterY + (motion?.devil.y ?? 0) * characterSize, duelBlend)
    const angelPulse = Math.sin(now / 175) * .5 + Math.sin(now / 470 + .7) * .5
    const devilPulse = Math.sin(now / 158 + .8) * .5 + Math.sin(now / 430) * .5
    const angelBob = angelPulse * 1.7 * (1 - duelBlend)
    const devilBob = devilPulse * 1.7 * (1 - duelBlend)
    const angelAngle = lerp(angelPulse * .008, motion?.angel.angle ?? 0, duelBlend)
    const devilAngle = lerp(-devilPulse * .008, motion?.devil.angle ?? 0, duelBlend)
    const drawFighter = (side: Side) => {
      const isAngel = side === 'angel'
      const pose = motion?.[side]
      const x = isAngel ? displayedAngelX : displayedDevilX
      const y = isAngel ? displayedAngelY : displayedDevilY
      const size = isAngel ? displayedAngelSize : displayedDevilSize
      const direction = isAngel ? 1 : -1
      // Three short strokes follow the lunge; no extra sprites or per-frame
      // image filters are needed for the speed trail.
      if (pose && pose.trail > .01) {
        context.save()
        context.globalAlpha = pose.trail * duelBlend * .5
        context.strokeStyle = isAngel ? '#d9ffec' : '#d63e87'
        context.lineWidth = Math.max(1, size * .012)
        context.lineCap = 'round'
        for (let line = 0; line < 3; line++) {
          const trailX = x + size * (isAngel ? .3 : .7)
          const trailY = y + size * (.55 + line * .1)
          context.beginPath()
          context.moveTo(trailX - direction * size * (.24 + line * .035), trailY + size * .045)
          context.quadraticCurveTo(trailX - direction * size * .12, trailY, trailX, trailY)
          context.stroke()
        }
        context.restore()
      }
      drawSprite(isAngel ? angel : devil, x, y, size, isAngel ? angelAngle : devilAngle,
        isAngel ? angelBob : devilBob, lerp(1, pose?.scaleX ?? 1, duelBlend), lerp(1, pose?.scaleY ?? 1, duelBlend), pose, side)
      if (pose && motion?.impact?.side === side) {
        const weapon = fighterWeaponPlacement(side, pose)
        const height = size * ((isAngel ? angel : devil).naturalHeight / (isAngel ? angel : devil).naturalWidth || 1)
        const angle = isAngel ? angelAngle : devilAngle
        const dx = (weapon.grip.x - .5) * size + Math.sin(weapon.angle) * weapon.length * size
        const dy = (weapon.grip.y - .68) * height - Math.cos(weapon.angle) * weapon.length * size
        lastImpactPoint = { x: x + size * .5 + Math.cos(angle) * dx - Math.sin(angle) * dy, y: y + height * .68 + Math.sin(angle) * dx + Math.cos(angle) * dy }
      }
    }
    if (damage && vitals.snapshot().winner === 'devil') {
      devilVictory.start(now, { x: (displayedDevilX + characterSize * .4) / width, y: (displayedDevilY + characterSize * .5) / height })
    }
    if (damage && motion?.impact) {
      const targetX = damage.target === 'angel' ? displayedAngelX : displayedDevilX
      const targetY = damage.target === 'angel' ? displayedAngelY : displayedDevilY
      damageNumbers.emit(damage.target, damage.damage, motion.impact.at, targetX + characterSize * .5, Math.max(40, targetY + characterSize * .06), characterSize)
    }
    // The attacking fist stays in front of its opponent at contact.
    drawFighter(motion?.attacker === 'angel' ? 'devil' : 'angel')
    drawFighter(motion?.attacker === 'angel' ? 'angel' : 'devil')
    if (duelMode && duelBlend > .86 && !reducedMotion.matches) {
      if (motion?.impact && lastImpactPoint) duelEffects.emit(motion.impact.side, motion.impact.at,
        lastImpactPoint.x, lastImpactPoint.y, characterSize * (lastImpactBoosted ? 1 : .85))
      duelEffects.draw(context, now)
    } else duelEffects.reset()
    context.restore()
    drawLongWinkEffect(now, width, height, ratio)
    if (duelMode) devilVictory.draw(context, now, width, height, reducedMotion.matches)
    if (duelMode) damageNumbers.draw(context, now, reducedMotion.matches)
    drawDuelHud(context, vitals.snapshot(), now, width, height, duelBlend, reducedMotion.matches, fighterPortraits)
  }
  const run = (now: number) => {
    if (!open) return
    // Give brief weapon attacks a 60fps composition budget. Camera inference
    // still runs only on fresh video frames; resting scenes stay at 30fps.
    const renderInterval = duelMode && (choreography.isActive(now) || devilVictory.active(now)) && !reducedMotion.matches ? 1000 / 60 : 1000 / 30
    if (now - lastRenderAt >= renderInterval - 1) {
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
      stream = await requestCamera({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: false })
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
      cancelVisualWarmup()
      fighterRig?.dispose(); fighterRig = null
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
    duelEffects.reset()
    devilVictory.reset()
    choreography.reset(performance.now())
    damageNumbers.reset()
    lastImpactAt = 0; lastImpactSide = null; lastImpactPoint = null
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
      cancelVisualWarmup()
      fighterRig?.dispose(); fighterRig = null
      facePose = null; lastFaceSeenAt = 0; poseFrozenUntil = 0; lastImpactAt = 0; lastImpactSide = null; lastImpactBoosted = false; lastImpactPoint = null
      duelEffects.reset()
      devilVictory.reset()
      choreography.reset(0)
      winkHoldSide = null; winkHoldStartedAt = 0; lastWinkObservedAt = 0; leftBlinkSignal = 0; rightBlinkSignal = 0; longWinkSide = null; lastLongWinkAt = 0; longWinkStartedAt = 0; longWinkCanRestart = true
      featherParticles = []
      vitals.reset(); damageNumbers.reset()
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
