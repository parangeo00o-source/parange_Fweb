import { FaceLandmarker, FilesetResolver, HandLandmarker, ImageSegmenter } from '@mediapipe/tasks-vision'
import { revealOnFirstVideoFrame } from './camera-page'

type Frame = { x: number; y: number; width: number; height: number }
type Point = { x: number; y: number }
type Landmark = { x: number; y: number }
type PersonMask = { data: Uint8Array; width: number; height: number }
type HeadContour = { left: number; right: number; top: number }
type HandTileMask = { points: Point[]; radius: number; expiresAt: number }
type StarParticle = { x: number; y: number; vx: number; vy: number; size: number; rotation: number; spin: number; life: number; maxLife: number; color: [number, number, number] }
type LoveReading = { value: number }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const distance = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y)

export const createFramingBlueprintExperience = () => {
  const screen = document.createElement('section')
  screen.className = 'framing-blueprint-screen'
  screen.setAttribute('aria-hidden', 'true')
  screen.innerHTML = `
    <video class="framing-blueprint-camera" autoplay muted playsinline></video>
    <canvas class="framing-blueprint-canvas" aria-label="실시간 청사진 프레임"></canvas>
    <div class="framing-blueprint-interface" aria-hidden="true"><p class="framing-blueprint-kicker">LIVE / QUADTREE BLUEPRINT</p><p class="framing-blueprint-guide">V 제스처를 만들면 인물 실루엣을 픽셀로 변환합니다</p><p class="framing-blueprint-status" role="status">카메라를 켠 뒤 V 제스처를 만들어 보세요</p></div>
    <button class="framing-blueprint-start" type="button">카메라 켜기</button><button class="framing-blueprint-close" type="button" aria-label="주사위 화면으로 돌아가기">×</button>
  `
  document.body.append(screen)
  const video = screen.querySelector<HTMLVideoElement>('.framing-blueprint-camera')!
  const canvas = screen.querySelector<HTMLCanvasElement>('.framing-blueprint-canvas')!
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true })!
  const startButton = screen.querySelector<HTMLButtonElement>('.framing-blueprint-start')!
  const closeButton = screen.querySelector<HTMLButtonElement>('.framing-blueprint-close')!
  const status = screen.querySelector<HTMLElement>('.framing-blueprint-status')!
  const sampleCanvas = document.createElement('canvas')
  const sampleCtx = sampleCanvas.getContext('2d', { willReadFrequently: true })!
  const filteredCanvas = document.createElement('canvas')
  // The quadtree output is a transparent layer over the live camera.
  const filteredCtx = filteredCanvas.getContext('2d')!
  let stream: MediaStream | null = null
  let handLandmarker: HandLandmarker | null = null
  let faceLandmarker: FaceLandmarker | null = null
  let segmenter: ImageSegmenter | null = null
  let open = false, tracking = false, animation = 0, width = 0, height = 0, lastRenderedVideoTime = -1, lastGestureInference = 0, lastGestureVideoTime = -1, lastGestureAt = 0, lastFaceInference = 0, lastFaceVideoTime = -1, lastSegmentation = 0, lastSegmentedVideoTime = -1, lastFilter = 0
  let effectActive = false
  let gestureAnchor: Point | null = null
  let opacity = 0
  let outputStream: MediaStream | null = null
  let personMask: PersonMask | null = null
  let personBounds: Frame | null = null
  let personHead: Point | null = null
  let headContour: HeadContour | null = null
  let faceContour: HeadContour | null = null
  let lastFaceContourAt = 0
  let handTileMask: HandTileMask | null = null
  let personCategory = 1
  const starParticles: StarParticle[] = []
  let lastParticleRenderAt = 0
  let lastParticleUpdateAt = 0
  let loveReadings: LoveReading[] = []
  let lastLoveReadingAt = 0
  let needsResize = true
  const blueprintWorker = new Worker(new URL('./blueprint-worker.ts', import.meta.url), { type: 'module' })
  let workerBusy = false
  let filterJobId = 0
  blueprintWorker.addEventListener('message', (event: MessageEvent<{ type: string; id: number; width: number; height: number; pixels: ArrayBuffer }>) => {
    const result = event.data
    if (result.type !== 'rendered') return
    filteredCanvas.width = result.width
    filteredCanvas.height = result.height
    filteredCtx.putImageData(new ImageData(new Uint8ClampedArray(result.pixels), result.width, result.height), 0, 0)
    workerBusy = false
  })
  blueprintWorker.addEventListener('error', (error) => { console.error('Blueprint worker failed', error); workerBusy = false })
  const setStatus = (text: string) => { status.textContent = text }
  window.addEventListener('resize', () => { needsResize = true }, { passive: true })

  const resize = () => {
    if (!needsResize) return
    needsResize = false; width = Math.max(1, window.innerWidth); height = Math.max(1, window.innerHeight)
    canvas.width = width; canvas.height = height; opacity = 0
  }
  const layout = () => {
    const sourceWidth = video.videoWidth || 1280, sourceHeight = video.videoHeight || 720
    const scale = Math.max(width / sourceWidth, height / sourceHeight)
    const drawWidth = sourceWidth * scale, drawHeight = sourceHeight * scale
    return { drawWidth, drawHeight, left: (width - drawWidth) / 2, top: (height - drawHeight) / 2 }
  }
  const mapLandmark = (landmark: Landmark): Point => {
    const view = layout()
    return { x: width - (view.left + landmark.x * view.drawWidth), y: view.top + landmark.y * view.drawHeight }
  }
  const drawCamera = () => {
    ctx.fillStyle = '#07121b'; ctx.fillRect(0, 0, width, height)
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
    const view = layout(); ctx.save(); ctx.translate(width, 0); ctx.scale(-1, 1)
    ctx.drawImage(video, view.left, view.top, view.drawWidth, view.drawHeight); ctx.restore()
  }
  const isVPose = (hand: Landmark[]) => {
    const palmSize = Math.max(distance(hand[0], hand[9]), .001)
    const index = { x: hand[8].x - hand[5].x, y: hand[8].y - hand[5].y }
    const middle = { x: hand[12].x - hand[9].x, y: hand[12].y - hand[9].y }
    const indexExtended = Math.hypot(index.x, index.y) > palmSize * .62
    const middleExtended = Math.hypot(middle.x, middle.y) > palmSize * .62
    const fingersSpread = distance(hand[8], hand[12]) > palmSize * .42
    const ringFolded = distance(hand[16], hand[0]) < distance(hand[14], hand[0]) * 1.14
    const pinkyFolded = distance(hand[20], hand[0]) < distance(hand[18], hand[0]) * 1.16
    const fingerAngle = Math.acos(clamp((index.x * middle.x + index.y * middle.y) / ((Math.hypot(index.x, index.y) || 1) * (Math.hypot(middle.x, middle.y) || 1)), -1, 1)) * 180 / Math.PI
    return indexExtended && middleExtended && fingersSpread && ringFolded && pinkyFolded && fingerAngle >= 16 && fingerAngle <= 105
  }
  const inferGesture = (now: number) => {
    if (!handLandmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || now - lastGestureInference < 58 || lastGestureVideoTime === video.currentTime) return
    lastGestureInference = now
    lastGestureVideoTime = video.currentTime
    const gestureHand = handLandmarker.detectForVideo(video, now).landmarks.find((hand) => isVPose(hand as Landmark[])) as Landmark[] | undefined
    if (gestureHand) {
      gestureAnchor = mapLandmark({ x: (gestureHand[8].x + gestureHand[12].x) / 2, y: (gestureHand[8].y + gestureHand[12].y) / 2 })
      const mappedHand = gestureHand.map((landmark) => mapLandmark(landmark))
      const handScale = Math.max(24, distance(mappedHand[0], mappedHand[9]))
      // Selfie segmentation is often weakest at thin fingertips. Preserve a
      // compact skeleton of the recognised V hand so those fingers receive
      // the same tiles as the rest of the silhouette.
      handTileMask = { points: mappedHand, radius: clamp(handScale * .18, 9, 28), expiresAt: now + 420 }
      lastGestureAt = now
      if (!effectActive) setStatus('실루엣 픽셀 효과 활성화')
      effectActive = true
    } else if (effectActive && now - lastGestureAt > 280) {
      releaseTileStars()
      effectActive = false
      gestureAnchor = null
      setStatus('V 제스처를 만들면 픽셀 효과가 나타납니다')
    }
  }
  const inferFace = (now: number) => {
    if (!faceLandmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || now - lastFaceInference < 100 || lastFaceVideoTime === video.currentTime) return
    lastFaceInference = now
    lastFaceVideoTime = video.currentTime
    const face = faceLandmarker.detectForVideo(video, now).faceLandmarks[0]
    // Keep the most recent valid face position briefly. The V pose often
    // covers part of the face for a frame or two, and clearing it immediately
    // made the ears jump to the raised hand in the silhouette mask.
    if (!face) {
      if (now - lastFaceContourAt > 720) faceContour = null
      return
    }
    const firstSide = mapLandmark(face[234])
    const secondSide = mapLandmark(face[454])
    const forehead = mapLandmark(face[10])
    const left = Math.min(firstSide.x, secondSide.x)
    const right = Math.max(firstSide.x, secondSide.x)
    if (right - left < 24) return
    faceContour = { left, right, top: forehead.y }
    lastFaceContourAt = now
  }
  const setPersonMask = (data: Uint8Array, maskWidth: number, maskHeight: number) => {
    personMask = { data, width: maskWidth, height: maskHeight }
    let minX = maskWidth, minY = maskHeight, maxX = -1, maxY = -1, count = 0
    for (let y = 0; y < maskHeight; y += 2) for (let x = 0; x < maskWidth; x += 2) {
      if (data[y * maskWidth + x] <= 80) continue
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); count += 1
    }
    const coverage = count * 4 / (maskWidth * maskHeight)
    if (maxX < 0 || coverage < .008 || coverage > .86) { personBounds = null; personHead = null; headContour = null; return }
    const view = layout()
    const topLeft = { x: width - (view.left + (maxX + 1) / maskWidth * view.drawWidth), y: view.top + minY / maskHeight * view.drawHeight }
    const bottomRight = { x: width - (view.left + minX / maskWidth * view.drawWidth), y: view.top + (maxY + 1) / maskHeight * view.drawHeight }
    personBounds = { x: Math.min(topLeft.x, bottomRight.x), y: Math.min(topLeft.y, bottomRight.y), width: Math.abs(bottomRight.x - topLeft.x), height: Math.abs(bottomRight.y - topLeft.y) }
    const headTop = Math.min(maxY, minY + Math.max(2, Math.round((maxY - minY) * .05)))
    const headBottom = Math.min(maxY, minY + Math.max(8, Math.round((maxY - minY) * .25)))
    let headXTotal = 0, headCount = 0
    let headMinX = maskWidth, headMaxX = -1
    for (let y = headTop; y <= headBottom; y += 1) for (let x = minX; x <= maxX; x += 1) {
      if (data[y * maskWidth + x] <= 80) continue
      headXTotal += x
      headCount += 1
      headMinX = Math.min(headMinX, x)
      headMaxX = Math.max(headMaxX, x)
    }
    const headX = headCount ? headXTotal / headCount : (minX + maxX) / 2
    personHead = { x: width - (view.left + (headX + .5) / maskWidth * view.drawWidth), y: view.top + minY / maskHeight * view.drawHeight }
    const contourMinX = headCount ? headMinX : minX
    const contourMaxX = headCount ? headMaxX : maxX
    const contourFirstX = width - (view.left + (contourMinX + .5) / maskWidth * view.drawWidth)
    const contourLastX = width - (view.left + (contourMaxX + .5) / maskWidth * view.drawWidth)
    headContour = { left: Math.min(contourFirstX, contourLastX), right: Math.max(contourFirstX, contourLastX), top: personHead.y }
  }
  const inferPerson = (now: number) => {
    // Analyse the complete camera view. The segmentation mask itself is now
    // the trigger and boundary for the quadtree field.
    if (!segmenter || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || now - lastSegmentation < 220 || lastSegmentedVideoTime === video.currentTime) return
    lastSegmentation = now; lastSegmentedVideoTime = video.currentTime
    segmenter.segmentForVideo(video, now, (result) => {
      // The compact selfie model supplies a foreground confidence mask. Using
      // that probability rather than a category-id equality also works across
      // models that encode their foreground as 1 or as 255.
      const confidenceMask = result.confidenceMasks?.[result.confidenceMasks.length - 1]
      if (confidenceMask) {
        const confidence = confidenceMask.getAsFloat32Array()
        const aboveThreshold = confidence.reduce((count, value) => count + (value > .5 ? 1 : 0), 0)
        // Some binary models expose background probability instead; only flip
        // an almost-full mask, never an empty no-person frame.
        const invert = aboveThreshold / confidence.length > .92
        const data = new Uint8Array(confidence.length)
        for (let index = 0; index < confidence.length; index += 1) data[index] = (invert ? 1 - confidence[index] : confidence[index]) > .46 ? 255 : 0
        setPersonMask(data, confidenceMask.width, confidenceMask.height)
        return
      }
      const categoryMask = result.categoryMask
      if (!categoryMask) return
      const categories = categoryMask.getAsUint8Array()
      const data = new Uint8Array(categories.length)
      for (let index = 0; index < categories.length; index += 1) data[index] = categories[index] > 0 && (personCategory === 0 || categories[index] === personCategory || categories[index] > 127) ? 255 : 0
      setPersonMask(data, categoryMask.width, categoryMask.height)
    })
  }
  const cropPersonMask = (frame: Frame, sampleWidth: number, sampleHeight: number) => {
    if (!personMask) return undefined
    const cropped = new Uint8Array(sampleWidth * sampleHeight)
    const view = layout()
    const earContour = faceContour ?? headContour
    const hasEars = earContour !== null
    const headWidth = earContour ? Math.max(36, earContour.right - earContour.left) : 0
    // Use the compact, outward-pointing silhouette of the reference: each
    // ear grows from a side of the rounded head, its point sits just outside
    // that side, and its inner base overlaps the head rather than forming a
    // straight headband across the forehead.
    const headTop = earContour?.top ?? 0
    const leftEdge = earContour?.left ?? 0
    const rightEdge = earContour?.right ?? 0
    const headCenterX = (leftEdge + rightEdge) / 2
    // The reference has an oversized, soft circular head rather than the
    // narrow outline of a human face. This mask intentionally takes priority
    // around the face, while the rest of the body still follows segmentation.
    const catHeadCenterY = headTop + headWidth * .43
    const catHeadRadiusX = headWidth * .67
    const catHeadRadiusY = headWidth * .61
    const earHeight = clamp(headWidth * .47, 30, 88)
    const outerBaseY = headTop + Math.max(16, headWidth * .35)
    const innerBaseY = headTop + Math.max(10, headWidth * .14)
    const inTriangle = (pointX: number, pointY: number, first: Point, second: Point, third: Point) => {
      const sign = (a: Point, b: Point, x: number, y: number) => (x - b.x) * (a.y - b.y) - (a.x - b.x) * (y - b.y)
      const firstSign = sign(first, second, pointX, pointY) < 0
      const secondSign = sign(second, third, pointX, pointY) < 0
      const thirdSign = sign(third, first, pointX, pointY) < 0
      return firstSign === secondSign && secondSign === thirdSign
    }
    const leftEar: [Point, Point, Point] = [
      { x: headCenterX - headWidth * .68, y: outerBaseY },
      { x: headCenterX - headWidth * .08, y: innerBaseY },
      { x: headCenterX - headWidth * .61, y: headTop - earHeight },
    ]
    const rightEar: [Point, Point, Point] = [
      { x: headCenterX + headWidth * .08, y: innerBaseY },
      { x: headCenterX + headWidth * .68, y: outerBaseY },
      { x: headCenterX + headWidth * .61, y: headTop - earHeight },
    ]
    const inCatHead = (pointX: number, pointY: number) => {
      if (!hasEars) return false
      const horizontal = (pointX - headCenterX) / catHeadRadiusX
      const vertical = (pointY - catHeadCenterY) / catHeadRadiusY
      return horizontal * horizontal + vertical * vertical <= 1
    }
    const activeHand = handTileMask && handTileMask.expiresAt > performance.now() ? handTileMask : null
    const handBounds = activeHand
      ? activeHand.points.reduce((bounds, point) => ({
        left: Math.min(bounds.left, point.x), right: Math.max(bounds.right, point.x),
        top: Math.min(bounds.top, point.y), bottom: Math.max(bounds.bottom, point.y),
      }), { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity })
      : null
    const handBones: Array<[number, number]> = [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [0, 9], [9, 10], [10, 11], [11, 12],
      [0, 13], [13, 14], [14, 15], [15, 16],
      [0, 17], [17, 18], [18, 19], [19, 20],
      [5, 9], [9, 13], [13, 17],
    ]
    const inHand = (pointX: number, pointY: number) => {
      if (!activeHand) return false
      const { points, radius } = activeHand
      if (!handBounds || pointX < handBounds.left - radius || pointX > handBounds.right + radius || pointY < handBounds.top - radius || pointY > handBounds.bottom + radius) return false
      for (const [startIndex, endIndex] of handBones) {
        const start = points[startIndex], end = points[endIndex]
        const deltaX = end.x - start.x, deltaY = end.y - start.y
        const lengthSquared = deltaX * deltaX + deltaY * deltaY || 1
        const along = clamp(((pointX - start.x) * deltaX + (pointY - start.y) * deltaY) / lengthSquared, 0, 1)
        const nearestX = start.x + deltaX * along, nearestY = start.y + deltaY * along
        if (Math.hypot(pointX - nearestX, pointY - nearestY) <= radius) return true
      }
      return false
    }
    for (let y = 0; y < sampleHeight; y += 1) for (let x = 0; x < sampleWidth; x += 1) {
      const displayX = frame.x + (x + .5) / sampleWidth * frame.width
      const displayY = frame.y + (y + .5) / sampleHeight * frame.height
      const sourceX = clamp(Math.floor((width - displayX - view.left) / view.drawWidth * personMask.width), 0, personMask.width - 1)
      const sourceY = clamp(Math.floor((displayY - view.top) / view.drawHeight * personMask.height), 0, personMask.height - 1)
      const withinLeftEar = inTriangle(displayX, displayY, leftEar[0], leftEar[1], leftEar[2])
      const withinRightEar = inTriangle(displayX, displayY, rightEar[0], rightEar[1], rightEar[2])
      cropped[y * sampleWidth + x] = personMask.data[sourceY * personMask.width + sourceX] > 80 || inHand(displayX, displayY) || (hasEars && (inCatHead(displayX, displayY) || withinLeftEar || withinRightEar)) ? 255 : 0
    }
    return cropped
  }
  const rebuild = (frame: Frame, now: number) => {
    // The worker owns a single job at a time. This naturally reuses the last
    // finished tree for the three-to-five display frames in between jobs.
    // Keep analysis infrequent, but feed it enough source pixels for the tile
    // glyphs to remain clean when the result fills a large heart frame.
    if (workerBusy || now - lastFilter < 152) return
    lastFilter = now
    const frameRatio = clamp(Math.sqrt(frame.width * frame.height / (width * height)), .04, .9)
    const detail = clamp((frameRatio - .07) / .52, 0, 1)
    // The vision calculation remains capped, while the denser sample prevents
    // the repeating star/W tile artwork from becoming blocky when upscaled.
    const analysisWidth = 520 + detail * 140
    const scale = Math.min(1, analysisWidth / frame.width, (360 + detail * 100) / frame.height)
    const sampleWidth = Math.max(24, Math.round(frame.width * scale)), sampleHeight = Math.max(24, Math.round(frame.height * scale))
    sampleCanvas.width = sampleWidth; sampleCanvas.height = sampleHeight
    sampleCtx.drawImage(canvas, Math.round(frame.x), Math.round(frame.y), Math.round(frame.width), Math.round(frame.height), 0, 0, sampleWidth, sampleHeight)
    const pixels = sampleCtx.getImageData(0, 0, sampleWidth, sampleHeight).data
    const croppedMask = cropPersonMask(frame, sampleWidth, sampleHeight)
    workerBusy = true
    filterJobId += 1
    const transfer: Transferable[] = [pixels.buffer]
    if (croppedMask) transfer.push(croppedMask.buffer)
    blueprintWorker.postMessage({ type: 'render', id: filterJobId, width: sampleWidth, height: sampleHeight, pixels: pixels.buffer, personMask: croppedMask?.buffer, detail }, transfer)
  }
  const releaseTileStars = () => {
    if (!filteredCanvas.width || !filteredCanvas.height) return
    const pixels = filteredCtx.getImageData(0, 0, filteredCanvas.width, filteredCanvas.height).data
    const candidates: Array<{ x: number; y: number; color: [number, number, number] }> = []
    for (let y = 2; y < filteredCanvas.height; y += 3) for (let x = 2; x < filteredCanvas.width; x += 3) {
      const offset = (y * filteredCanvas.width + x) * 4
      const alpha = pixels[offset + 3]
      if (alpha < 100) continue
      const red = pixels[offset], green = pixels[offset + 1], blue = pixels[offset + 2]
      if (Math.max(red, green, blue) - Math.min(red, green, blue) > 24 || Math.max(red, green, blue) > 205) candidates.push({ x, y, color: [red, green, blue] })
    }
    if (!candidates.length) return
    const count = Math.min(145, Math.max(48, Math.round(width * height / 15_000)))
    const centerX = width / 2, centerY = height / 2
    for (let index = 0; index < count; index += 1) {
      const source = candidates[Math.floor(Math.random() * candidates.length)]
      const x = source.x / filteredCanvas.width * width
      const y = source.y / filteredCanvas.height * height
      const strength = .32 + Math.random() * .82
      const sizeRoll = Math.random()
      const size = sizeRoll < .1 ? 10 + Math.random() * 10 : sizeRoll < .34 ? 5 + Math.random() * 6 : 1.5 + Math.random() * 4.5
      const brightness = sizeRoll < .1 ? 1.16 : .98 + Math.random() * .12
      const color: [number, number, number] = [Math.min(255, source.color[0] * brightness), Math.min(255, source.color[1] * brightness), Math.min(255, source.color[2] * brightness)]
      const maxLife = 650 + Math.random() * 700
      starParticles.push({ x, y, vx: (x - centerX) * .0018 * strength + (Math.random() - .5) * .72, vy: (y - centerY) * .0018 * strength - .28 - Math.random() * .58, size, rotation: Math.random() * Math.PI * 2, spin: (Math.random() - .5) * .012, life: maxLife, maxLife, color })
    }
    if (starParticles.length > 180) starParticles.splice(0, starParticles.length - 180)
  }
  const drawStarParticles = (now: number) => {
    if (!starParticles.length) return
    const delta = Math.min(42, now - lastParticleUpdateAt || 16)
    lastParticleUpdateAt = now
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    for (let index = starParticles.length - 1; index >= 0; index -= 1) {
      const particle = starParticles[index]
      particle.life -= delta
      if (particle.life <= 0) { starParticles.splice(index, 1); continue }
      particle.vy += delta * .00042
      particle.x += particle.vx * delta; particle.y += particle.vy * delta; particle.rotation += particle.spin * delta
      const alpha = Math.min(1, particle.life / 170) * Math.min(1, (particle.maxLife - particle.life) / 110)
      const radius = particle.size * (0.72 + .28 * Math.sin(now / 85 + index))
      ctx.save(); ctx.translate(particle.x, particle.y); ctx.rotate(particle.rotation); ctx.globalAlpha = alpha
      ctx.fillStyle = `rgb(${particle.color[0]} ${particle.color[1]} ${particle.color[2]})`; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = particle.size * 2.4
      ctx.beginPath()
      for (let point = 0; point < 10; point += 1) {
        const length = point % 2 ? radius * .42 : radius
        const radians = -Math.PI / 2 + point * Math.PI / 5
        if (!point) ctx.moveTo(Math.cos(radians) * length, Math.sin(radians) * length)
        else ctx.lineTo(Math.cos(radians) * length, Math.sin(radians) * length)
      }
      ctx.closePath(); ctx.fill(); ctx.restore()
    }
    ctx.restore()
  }
  const drawLoveGauge = (now: number) => {
    if (!gestureAnchor || !personBounds || !personHead) return
    if (!loveReadings.length || now - lastLoveReadingAt > 140) {
      lastLoveReadingAt = now
      const minimum = 92_295_983
      const maximum = 328_957_982
      loveReadings = Array.from({ length: 1 }, () => ({
        value: Math.round(minimum + Math.random() * (maximum - minimum)),
      }))
    }
    const gaugeContour = faceContour ?? headContour
    const anchorX = gaugeContour ? (gaugeContour.left + gaugeContour.right) / 2 : personHead.x
    const anchorY = Math.max(18, (gaugeContour?.top ?? personHead.y) - 18)
    const value = `${String(loveReadings[0]?.value ?? 0)}%`
    ctx.save()
    ctx.globalCompositeOperation = 'screen'
    ctx.textBaseline = 'middle'
    ctx.globalAlpha = .9
    ctx.font = '700 9px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'center'
    ctx.fillStyle = '#b7e9ff'
    ctx.shadowColor = 'rgba(86,170,255,.72)'
    ctx.shadowBlur = 5
    ctx.fillText(value, anchorX, anchorY)
    ctx.restore()
  }
  const drawFrame = (now: number) => {
    // Render in the camera's own coordinate space. No heart path, gesture,
    // border, or hand markers remain between the person and the pixels.
    if (!effectActive) { opacity *= .78; drawStarParticles(now); return }
    const fullScreen = { x: 0, y: 0, width, height }
    opacity += (1 - opacity) * .23
    rebuild(fullScreen, now)
    if (!filteredCanvas.width) return
    ctx.save()
    ctx.globalAlpha = opacity
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(filteredCanvas, 0, 0, width, height)
    ctx.restore()
    drawLoveGauge(now)
    drawStarParticles(now)
  }
  const run = (now: number) => {
    if (!open) return
    resize()
    // A 30fps webcam otherwise gets copied over a full-screen canvas twice for
    // every source frame on 60/120Hz displays. Rendering only fresh video
    // frames cuts that compositing cost without reducing visual fidelity.
    const hasFreshVideo = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.currentTime !== lastRenderedVideoTime
    const shouldRenderParticles = starParticles.length && now - lastParticleRenderAt >= 33
    if (hasFreshVideo || !tracking || shouldRenderParticles) {
      if (hasFreshVideo) lastRenderedVideoTime = video.currentTime
      if (shouldRenderParticles) lastParticleRenderAt = now
      drawCamera()
      if (tracking) { inferGesture(now); inferFace(now); inferPerson(now) }
      drawFrame(now)
    }
    animation = requestAnimationFrame(run)
  }
  const startCamera = async () => {
    if (tracking) return
    if (!navigator.mediaDevices?.getUserMedia) { setStatus('이 브라우저에서는 카메라를 사용할 수 없어요'); return }
    startButton.disabled = true; startButton.textContent = '카메라 연결 중…'
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: false })
      video.srcObject = stream; await video.play()
      revealOnFirstVideoFrame(screen, video)
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm')
      handLandmarker = await HandLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task' }, runningMode: 'VIDEO', numHands: 1 })
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task' }, runningMode: 'VIDEO', numFaces: 1 })
      try {
        segmenter = await ImageSegmenter.createFromOptions(vision, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite' }, runningMode: 'VIDEO', outputCategoryMask: true, outputConfidenceMasks: true })
        const detectedPersonCategory = segmenter.getLabels().findIndex((label) => label.toLowerCase().includes('person'))
        personCategory = detectedPersonCategory >= 0 ? detectedPersonCategory : 1
      } catch (error) { console.warn('Person segmentation model could not load', error); segmenter = null }
      tracking = true; startButton.classList.add('is-hidden'); screen.classList.add('is-tracking'); setStatus('V 제스처를 만들면 픽셀 효과가 나타납니다')
    } catch (error) { console.error(error); screen.classList.remove('is-camera-pending'); setStatus('카메라 권한을 확인한 뒤 다시 시도해 주세요'); startButton.disabled = false; startButton.textContent = '카메라 다시 켜기'; stream?.getTracks().forEach((track) => track.stop()); stream = null; video.srcObject = null }
  }
  startButton.addEventListener('click', () => void startCamera())
  closeButton.addEventListener('click', () => history.back())
  return {
    open: () => { open = true; needsResize = true; resize(); screen.classList.add('is-open', 'is-camera-pending'); screen.setAttribute('aria-hidden', 'false'); setStatus('카메라를 켠 뒤 V 제스처를 만들어 보세요'); animation = requestAnimationFrame(run); void startCamera(); closeButton.focus() },
    close: () => { open = false; cancelAnimationFrame(animation); screen.classList.remove('is-open', 'is-tracking'); screen.setAttribute('aria-hidden', 'true'); tracking = false; handLandmarker?.close(); handLandmarker = null; faceLandmarker?.close(); faceLandmarker = null; segmenter?.close(); segmenter = null; stream?.getTracks().forEach((track) => track.stop()); stream = null; outputStream?.getTracks().forEach((track) => track.stop()); outputStream = null; video.srcObject = null; personMask = null; personBounds = null; personHead = null; headContour = null; faceContour = null; lastFaceContourAt = 0; handTileMask = null; personCategory = 1; starParticles.splice(0); loveReadings = []; gestureAnchor = null; lastParticleRenderAt = 0; lastParticleUpdateAt = 0; lastLoveReadingAt = 0; lastRenderedVideoTime = -1; lastGestureInference = 0; lastGestureVideoTime = -1; lastGestureAt = 0; lastFaceInference = 0; lastFaceVideoTime = -1; lastSegmentation = 0; lastSegmentedVideoTime = -1; effectActive = false; opacity = 0; startButton.disabled = false; startButton.textContent = '카메라 켜기'; startButton.classList.remove('is-hidden') },
    getRecordingStream: () => { if (!open || !canvas.captureStream) return null; outputStream ??= canvas.captureStream(30); return outputStream },
    getRecordingCanvas: () => open ? canvas : null,
  }
}
