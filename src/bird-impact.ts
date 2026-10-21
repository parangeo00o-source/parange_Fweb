import { requestCamera } from './analytics'
import { FaceLandmarker, FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'
import { revealOnFirstVideoFrame } from './camera-page'
import { createBirdFlock } from './bird-flock'
import type { BirdFingerTarget } from './bird-flock'
import { createBirdDizzy } from './bird-dizzy'
import { createBirdImpactGraphic } from './bird-impact-graphic'
import { isBirdCallingFinger, isBirdVictoryHand, createBirdVictoryGesture } from './bird-finger'
import { createBirdArmTracker } from './bird-arm'

type Point = { x: number; y: number }
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

/** G: two-hand V fireworks and a colourful flock called to extended index fingers. */
export const createBirdImpactExperience = () => {
  const screen = document.createElement('section')
  screen.className = 'bird-impact-screen'
  screen.setAttribute('aria-hidden', 'true')
  screen.innerHTML = `
    <video class="bird-impact-camera" autoplay muted playsinline></video>
    <canvas class="bird-impact-canvas" aria-label="검지 위로 모이는 새 무리, 양손 브이로 터뜨리는 폭죽과 헤롱 별 효과"></canvas>
    <button class="bird-impact-retry" type="button" hidden>카메라 다시 켜기</button>
    <button class="bird-impact-close" type="button" aria-label="주사위 화면으로 돌아가기"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="m16 16 16 16M32 16 16 32"/></svg></button>
  `
  document.body.append(screen)
  const video = screen.querySelector<HTMLVideoElement>('video')!
  const canvas = screen.querySelector<HTMLCanvasElement>('canvas')!
  const context = canvas.getContext('2d', { alpha: false, desynchronized: true })!
  const closeButton = screen.querySelector<HTMLButtonElement>('.bird-impact-close')!
  const retryButton = screen.querySelector<HTMLButtonElement>('.bird-impact-retry')!
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const victory = createBirdVictoryGesture(), flock = createBirdFlock()
  const dizzy = createBirdDizzy()
  const graphic = createBirdImpactGraphic()
  let headSpan = .2
  let impactAnchor: Point = { x: .5, y: .3 }
  let stream: MediaStream | null = null, outputStream: MediaStream | null = null
  let faceLandmarker: FaceLandmarker | null = null
  let handLandmarker: HandLandmarker | null = null
  let poseLandmarker: PoseLandmarker | null = null
  let lastPoseAt = -Infinity, lastPoseVideoTime = -1, pose: NormalizedLandmark[] = []
  let needsArmTracking = false, poseInterval = 140
  const armTracker = createBirdArmTracker()
  let lastHandInferenceAt = -Infinity, lastHandVideoTime = -1
  const fingers = new Map<string, { since: number; seen: number; anchor: BirdFingerTarget }>()
  const resetFinger = () => {
    lastHandInferenceAt = -Infinity; lastHandVideoTime = -1
    fingers.clear(); victory.reset()
    pose = []; lastPoseAt = -Infinity; lastPoseVideoTime = -1
    needsArmTracking = false; poseInterval = 140; armTracker.reset()
  }
  let open = false, tracking = false, starting = false, generation = 0
  let animation = 0, width = 1, height = 1, pixelRatio = 1, needsResize = true
  let lastRenderAt = -Infinity, lastInferenceAt = -Infinity, lastVideoTime = -1

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
    if (!needsResize && ratio === pixelRatio) return
    needsResize = false
    width = Math.max(1, window.innerWidth); height = Math.max(1, window.innerHeight); pixelRatio = ratio
    const w = Math.round(width * ratio), h = Math.round(height * ratio)
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
  }
  const cover = () => {
    const sourceWidth = video.videoWidth || 1280, sourceHeight = video.videoHeight || 720
    const scale = Math.max(width / sourceWidth, height / sourceHeight)
    const drawWidth = sourceWidth * scale, drawHeight = sourceHeight * scale
    return { drawWidth, drawHeight, left: (width - drawWidth) / 2, top: (height - drawHeight) / 2 }
  }
  const triggerImpact = (origin: Point, now: number) => {
    const graphicEndsAt = graphic.burst(origin, now, width, height, headSpan)
    dizzy.hideUntil(graphicEndsAt)
    flock.release(now); fingers.clear()
    needsArmTracking = false; pose = []; armTracker.reset()
  }
  const inferPose = (now: number) => {
    if (!tracking || !needsArmTracking || !poseLandmarker || video.readyState < 2 || now - lastPoseAt < poseInterval || video.currentTime === lastPoseVideoTime) return false
    const next = poseLandmarker.detectForVideo(video, now).landmarks[0] ?? []
    const visible = [13, 14, 15, 16].filter(i => next[i] && next[i].visibility > .55)
    const stable = visible.length >= 2 && visible.every(i => pose[i]
      && Math.hypot((next[i].x - pose[i].x) * video.videoWidth / video.videoHeight, next[i].y - pose[i].y) < .008)
    poseInterval = stable ? 200 : visible.length ? 115 : 160
    pose = next; lastPoseAt = now; lastPoseVideoTime = video.currentTime
    return true
  }
  const inferHand = (now: number) => {
    if (!tracking || !handLandmarker || video.readyState < 2 || now - lastHandInferenceAt < 80 || video.currentTime === lastHandVideoTime) return
    lastHandInferenceAt = now; lastHandVideoTime = video.currentTime
    const result = handLandmarker.detectForVideo(video, now), view = cover()
    const bothV = result.landmarks.length === 2 && result.landmarks.every(hand => isBirdVictoryHand(hand, video.videoWidth / video.videoHeight))
    if (victory.sample(bothV, now)) triggerImpact({ x: impactAnchor.x * width, y: impactAnchor.y * height }, now)
    if (graphic.active(now)) { flock.release(now); fingers.clear(); return }
    const needsArm = result.landmarks.some(hand => isBirdCallingFinger(hand, video.videoWidth / video.videoHeight)
      && Math.abs((hand[8].x - hand[5].x) * view.drawWidth) > Math.abs((hand[8].y - hand[5].y) * view.drawHeight))
    needsArmTracking = needsArm
    if (!needsArm) { pose = []; armTracker.reset() }
    const matchedWrists = new Set<number>()
    result.landmarks.forEach((hand, index) => {
      if (!isBirdCallingFinger(hand, video.videoWidth / video.videoHeight)) return
      const key = result.handedness[index]?.[0]?.categoryName ?? `hand-${index}`
      const tip = hand[8], base = hand[5], previous = fingers.get(key)
      const dx = -(tip.x - base.x) * view.drawWidth, dy = (tip.y - base.y) * view.drawHeight
      // Hysteresis prevents rapid pose changes near the diagonal threshold.
      const horizontal = Math.abs(dx) > Math.abs(dy) * (previous?.anchor.horizontal ? 1.05 : 1.4)
      const palm = { x: (hand[0].x + hand[5].x + hand[17].x) / 3, y: (hand[0].y + hand[5].y + hand[17].y) / 3 }
      const perchPath = [8, 7, 6, 5, 0].map(i => ({
        x: 1 - (view.left + hand[i].x * view.drawWidth) / width,
        y: (view.top + hand[i].y * view.drawHeight) / height,
      }))
      const elbow = horizontal ? armTracker.sample(key, hand, pose, video.videoWidth / video.videoHeight, now, lastPoseAt, matchedWrists) : null
      if (elbow) perchPath.push({
        x: 1 - (view.left + elbow.x * view.drawWidth) / width,
        y: (view.top + elbow.y * view.drawHeight) / height,
      })
      const target = { key, x: clamp(1 - (view.left + tip.x * view.drawWidth) / width, 0, 1), y: clamp((view.top + tip.y * view.drawHeight) / height, 0, 1), horizontal, direction: Math.sign(dx),
        perchPath,
        palmX: clamp(1 - (view.left + palm.x * view.drawWidth) / width, 0, 1), palmY: clamp((view.top + palm.y * view.drawHeight) / height, 0, 1),
        span: Math.hypot((hand[5].x - hand[17].x) * view.drawWidth, (hand[5].y - hand[17].y) * view.drawHeight) / Math.min(width, height) }
      if (!previous) fingers.set(key, { since: now, seen: now, anchor: target })
      else {
        previous.seen = now
        previous.anchor.x += (target.x - previous.anchor.x) * .45
        previous.anchor.y += (target.y - previous.anchor.y) * .45
        previous.anchor.palmX = (previous.anchor.palmX ?? target.palmX) * .55 + target.palmX * .45
        previous.anchor.palmY = (previous.anchor.palmY ?? target.palmY) * .55 + target.palmY * .45
        previous.anchor.span = (previous.anchor.span ?? target.span) * .55 + target.span * .45
        previous.anchor.perchPath = target.perchPath.map((point, i) => i >= 5 ? point : ({
          x: (previous.anchor.perchPath?.[i]?.x ?? point.x) * .55 + point.x * .45,
          y: (previous.anchor.perchPath?.[i]?.y ?? point.y) * .55 + point.y * .45,
        }))
        previous.anchor.horizontal = horizontal; previous.anchor.direction = target.direction
      }
    })
    for (const [key, finger] of fingers) if (now - finger.seen > 260) fingers.delete(key)
    const anchors = [...fingers.values()].filter(finger => now - finger.since >= 80).map(finger => ({ ...finger.anchor }))
    if (anchors.length) flock.gather(now, anchors)
    else flock.release(now)
  }
  const inferFace = (now: number) => {
    if (!tracking || !faceLandmarker || video.readyState < 2 || now - lastInferenceAt < 48 || video.currentTime === lastVideoTime) return
    lastInferenceAt = now; lastVideoTime = video.currentTime
    const face = faceLandmarker.detectForVideo(video, now).faceLandmarks[0]
    if (!face?.[33] || !face[263] || !face[1]) return
    const view = cover()
    const pointFor = (p: Point) => ({ x: width - (view.left + p.x * view.drawWidth), y: view.top + p.y * view.drawHeight })
    const left = pointFor(face[33]), right = pointFor(face[263])
    const crown = pointFor(face[10] ?? face[1])
    const size = Math.hypot(left.x - right.x, left.y - right.y)
    headSpan = size / Math.min(width, height)
    impactAnchor = { x: crown.x / width, y: (crown.y - size * .15) / height }
    graphic.follow({ ...impactAnchor, span: headSpan })
    const haloAnchor = { x: crown.x / width, y: (crown.y - size * .28) / height, span: headSpan }
    dizzy.show(now, haloAnchor)
    dizzy.follow(haloAnchor)
  }
  const drawScene = (now: number) => {
    resize()
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    if (video.readyState >= 2) {
      const view = cover()
      context.save(); context.translate(width, 0); context.scale(-1, 1)
      context.drawImage(video, view.left, view.top, view.drawWidth, view.drawHeight); context.restore()
    } else {
      context.fillStyle = '#182226'; context.fillRect(0, 0, width, height)
    }
    // Back to front: camera → flock → fireworks / persistent head halo.
    flock.draw(context, now, width, height, reducedMotion.matches)
    graphic.draw(context, now, width, height, reducedMotion.matches)
    dizzy.draw(context, now, width, height, reducedMotion.matches)
  }
  const render = (now: number) => {
    animation = 0
    if (!open || document.hidden) return
    const interval = (flock.active(now) || dizzy.active(now) || graphic.active(now)) && !reducedMotion.matches ? 1000 / 60 : 1000 / 30
    if (now - lastRenderAt >= interval - 1) {
      resize()
      // Run at most one ML inference per animation frame; the art still renders at 60 fps.
      if (tracking && video.readyState >= 2 && now - lastHandInferenceAt >= 80 && video.currentTime !== lastHandVideoTime) inferHand(now)
      else if (!inferPose(now)) inferFace(now)
      drawScene(now); lastRenderAt = now
    }
    animation = requestAnimationFrame(render)
  }
  const releaseCamera = () => {
    tracking = false
    faceLandmarker?.close(); faceLandmarker = null
    handLandmarker?.close(); handLandmarker = null; resetFinger()
    poseLandmarker?.close(); poseLandmarker = null
    stream?.getTracks().forEach(track => track.stop()); stream = null
    outputStream?.getTracks().forEach(track => track.stop()); outputStream = null
    video.srcObject = null
  }
  const startCamera = async () => {
    if (!open || tracking || starting) return
    starting = true; retryButton.hidden = true
    const current = generation, isCurrent = () => open && generation === current
    let camera: MediaStream | null = null, model: FaceLandmarker | null = null, handModel: HandLandmarker | null = null, poseModel: PoseLandmarker | null = null
    try {
      // Request permission from the navigation gesture. Prepare the artwork
      // while the video starts, never during an individual wingbeat.
      camera = await requestCamera({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: false })
      if (!isCurrent()) { camera.getTracks().forEach(track => track.stop()); return }
      stream = camera; video.srcObject = camera
      if (document.hidden) camera.getVideoTracks().forEach(track => { track.enabled = false })
      await Promise.all([video.play(), flock.prepare(), graphic.prepare()])
      if (!isCurrent()) return
      revealOnFirstVideoFrame(screen, video)
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm')
      if (!isCurrent()) return
      const options = { runningMode: 'VIDEO' as const, numFaces: 1 }
      const modelAssetPath = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task'
      try {
        model = await FaceLandmarker.createFromOptions(vision, { ...options, baseOptions: { modelAssetPath, delegate: 'GPU' } })
      } catch {
        if (!isCurrent()) return
        model = await FaceLandmarker.createFromOptions(vision, { ...options, baseOptions: { modelAssetPath, delegate: 'CPU' } })
      }
      if (!isCurrent()) { model.close(); return }
      const handModelPath = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task'
      try {
        handModel = await HandLandmarker.createFromOptions(vision, { runningMode: 'VIDEO', numHands: 2, baseOptions: { modelAssetPath: handModelPath, delegate: 'GPU' } })
      } catch {
        if (!isCurrent()) { model.close(); return }
        handModel = await HandLandmarker.createFromOptions(vision, { runningMode: 'VIDEO', numHands: 2, baseOptions: { modelAssetPath: handModelPath, delegate: 'CPU' } })
      }
      if (!isCurrent()) { model.close(); handModel.close(); return }
      const poseModelPath = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
      try {
        poseModel = await PoseLandmarker.createFromOptions(vision, { runningMode: 'VIDEO', numPoses: 1, outputSegmentationMasks: false, baseOptions: { modelAssetPath: poseModelPath, delegate: 'GPU' } })
      } catch {
        if (!isCurrent()) { model.close(); handModel.close(); return }
        poseModel = await PoseLandmarker.createFromOptions(vision, { runningMode: 'VIDEO', numPoses: 1, outputSegmentationMasks: false, baseOptions: { modelAssetPath: poseModelPath, delegate: 'CPU' } })
      }
      if (!isCurrent()) { model.close(); handModel.close(); poseModel.close(); return }
      faceLandmarker = model; handLandmarker = handModel; poseLandmarker = poseModel; tracking = true; resetFinger()
      lastVideoTime = -1; lastInferenceAt = -Infinity
      screen.classList.add('is-tracking')
    } catch (error) {
      model?.close(); handModel?.close(); poseModel?.close()
      camera?.getTracks().forEach(track => track.stop())
      if (!isCurrent()) return
      console.error('Bird flock camera:', error)
      releaseCamera()
      screen.classList.remove('is-camera-pending', 'is-tracking')
      retryButton.hidden = false
    } finally { if (isCurrent()) starting = false }
  }
  closeButton.addEventListener('click', () => history.back())
  retryButton.addEventListener('click', () => { void startCamera() })
  window.addEventListener('resize', () => { needsResize = true }, { passive: true })
  document.addEventListener('visibilitychange', () => {
    if (!open) return
    if (document.hidden) {
      cancelAnimationFrame(animation); animation = 0
      stream?.getVideoTracks().forEach(track => { track.enabled = false })
    } else {
      stream?.getVideoTracks().forEach(track => { track.enabled = true })
      flock.reset(); dizzy.reset(); graphic.reset(); resetFinger(); lastVideoTime = -1; lastRenderAt = -Infinity
      if (!animation) animation = requestAnimationFrame(render)
    }
  })
  return {
    open: () => {
      if (open) return
      open = true; generation++; starting = false; needsResize = true
      flock.reset(); dizzy.reset(); graphic.reset(); resetFinger(); headSpan = .2; impactAnchor = { x: .5, y: .3 }; resize(); lastRenderAt = -Infinity
      screen.classList.add('is-open', 'is-camera-pending'); screen.setAttribute('aria-hidden', 'false')
      if (!document.hidden) animation = requestAnimationFrame(render)
      void startCamera(); closeButton.focus()
    },
    close: () => {
      open = false; generation++; starting = false
      cancelAnimationFrame(animation); animation = 0
      releaseCamera(); flock.dispose(); dizzy.dispose(); graphic.dispose()
      screen.classList.remove('is-open', 'is-tracking', 'is-camera-pending'); screen.setAttribute('aria-hidden', 'true')
    },
    getRecordingStream: () => {
      if (!open || !tracking || !canvas.captureStream) return null
      outputStream ??= canvas.captureStream(30)
      return outputStream
    },
    getRecordingCanvas: () => open && tracking ? canvas : null,
  }
}
