import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'
import { revealOnFirstVideoFrame } from './camera-page'
import impactFrontalUrl from './assets/bird-impact/wing-impact-frontal-v1.png'
import impactVUpUrl from './assets/bird-impact/wing-impact-v-up-v1.png'
import impactDiagonalUrl from './assets/bird-impact/wing-impact-diagonal-v1.png'
import impactRightUrl from './assets/bird-impact/wing-impact-right-v1.png'
import impactCrescentUrl from './assets/bird-impact/wing-impact-crescent-v1.png'
import impactFoldedUrl from './assets/bird-impact/wing-impact-folded-v1.png'
import impactLegacyMainUrl from './assets/bird-impact/glass-bird-impact-photographic-v8.png'
import impactLegacyLeftUrl from './assets/bird-impact/glass-bird-impact-variant-left-v1.png'
import impactLegacyRightUrl from './assets/bird-impact/glass-bird-impact-variant-right-v1.png'

type Point = { x: number; y: number }
type GlassShard = {
  points: Point[]
  center: Point
  velocityX: number
  velocityY: number
  rotation: number
  tiltX: number
  tiltY: number
  delay: number
  depth: number
}
type InteractionPhase = 'waiting' | 'calibrating' | 'ready' | 'armed' | 'broken'

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const distance = (first: Point, second: Point) => Math.hypot(first.x - second.x, first.y - second.y)

export const createBirdImpactExperience = () => {
  const screen = document.createElement('section')
  screen.className = 'bird-impact-screen'
  screen.setAttribute('aria-hidden', 'true')
  screen.innerHTML = `
    <video class="bird-impact-camera" autoplay muted playsinline></video>
    <canvas class="bird-impact-canvas" aria-label="새가 부딪힌 듯한 유리 균열 효과"></canvas>
    <button class="bird-impact-close" type="button" aria-label="주사위 화면으로 돌아가기"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="m16 16 16 16M32 16 16 32"/></svg></button>
  `
  document.body.append(screen)

  const video = screen.querySelector<HTMLVideoElement>('.bird-impact-camera')!
  const canvas = screen.querySelector<HTMLCanvasElement>('.bird-impact-canvas')!
  const context = canvas.getContext('2d', { alpha: false, desynchronized: true })!
  const fragmentSurface = document.createElement('canvas')
  const fragmentContext = fragmentSurface.getContext('2d', { alpha: false, desynchronized: true })!
  const closeButton = screen.querySelector<HTMLButtonElement>('.bird-impact-close')!
  const impactTextures = [
    impactLegacyMainUrl,
    impactLegacyLeftUrl,
    impactLegacyRightUrl,
    impactFrontalUrl,
    impactVUpUrl,
    impactDiagonalUrl,
    impactRightUrl,
    impactCrescentUrl,
    impactFoldedUrl,
  ].map((source) => {
    const image = new Image()
    image.decoding = 'async'
    image.src = source
    return image
  })

  let stream: MediaStream | null = null
  let outputStream: MediaStream | null = null
  let faceLandmarker: FaceLandmarker | null = null
  let open = false
  let tracking = false
  let animation = 0
  let width = 1
  let height = 1
  let pixelRatio = 1
  let phase: InteractionPhase = 'waiting'
  let calibrationStartedAt = 0
  let lastInferenceAt = 0
  let lastVideoTime = -1
  let lastFaceAt = 0
  let baselineSize = 0
  let retreatSize = 0
  let previousSize = 0
  let previousSizeAt = 0
  let impactAt = 0
  let dizzyOrigin: Point = { x: 0, y: 0 }
  let dizzyFaceSize = 0
  let glassShards: GlassShard[] = []
  let activeTextureIndex = 0
  let previousTextureIndex = -1
  let fragmentTextureIndex = -1
  let clearTimer: number | null = null

  const resize = () => {
    width = Math.max(1, window.innerWidth)
    height = Math.max(1, window.innerHeight)
    pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
    canvas.width = Math.round(width * pixelRatio)
    canvas.height = Math.round(height * pixelRatio)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    fragmentTextureIndex = -1
  }

  const prepareFragmentTexture = (texture: HTMLImageElement) => {
    if (!texture.complete || !texture.naturalWidth) return false
    if (fragmentTextureIndex === activeTextureIndex && fragmentSurface.width === canvas.width && fragmentSurface.height === canvas.height) return true
    fragmentSurface.width = canvas.width
    fragmentSurface.height = canvas.height
    fragmentContext.setTransform(1, 0, 0, 1, 0, 0)
    fragmentContext.clearRect(0, 0, fragmentSurface.width, fragmentSurface.height)
    fragmentContext.drawImage(texture, 0, 0, fragmentSurface.width, fragmentSurface.height)
    fragmentTextureIndex = activeTextureIndex
    return true
  }

  const cover = () => {
    const sourceWidth = video.videoWidth || 1280
    const sourceHeight = video.videoHeight || 720
    const scale = Math.max(width / sourceWidth, height / sourceHeight)
    const drawWidth = sourceWidth * scale
    const drawHeight = sourceHeight * scale
    return { drawWidth, drawHeight, left: (width - drawWidth) / 2, top: (height - drawHeight) / 2 }
  }

  const pointFor = (landmark: { x: number; y: number }): Point => {
    const view = cover()
    return { x: width - (view.left + landmark.x * view.drawWidth), y: view.top + landmark.y * view.drawHeight }
  }

  const resetInteraction = (preserveCalibration = false) => {
    phase = tracking && preserveCalibration && baselineSize ? 'ready' : 'waiting'
    calibrationStartedAt = 0
    lastFaceAt = 0
    if (!preserveCalibration) baselineSize = 0
    retreatSize = preserveCalibration ? baselineSize : 0
    previousSize = preserveCalibration ? baselineSize : 0
    previousSizeAt = 0
    impactAt = 0
    if (!preserveCalibration) {
      dizzyOrigin = { x: 0, y: 0 }
      dizzyFaceSize = 0
    }
    glassShards = []
  }

  const createGlassShards = (origin: Point): GlassShard[] => {
    const columns = 8
    const rows = 5
    const cellWidth = width / columns
    const cellHeight = height / rows
    const vertices: Point[][] = Array.from({ length: rows + 1 }, (_, row) =>
      Array.from({ length: columns + 1 }, (_, column) => {
        const edge = row === 0 || row === rows || column === 0 || column === columns
        return {
          x: column * cellWidth + (edge ? 0 : (Math.random() - .5) * cellWidth * .44),
          y: row * cellHeight + (edge ? 0 : (Math.random() - .5) * cellHeight * .44),
        }
      }),
    )

    const createShard = (points: Point[]): GlassShard => {
      const center = points.reduce((total, point) => ({ x: total.x + point.x / points.length, y: total.y + point.y / points.length }), { x: 0, y: 0 })
      const side = (center.x - origin.x) / Math.max(width, 1)
      const heightBias = 1 - center.y / Math.max(height, 1)
      return {
        points,
        center,
        velocityX: side * (280 + Math.random() * 360) + (Math.random() - .5) * 130,
        velocityY: 260 + Math.random() * 260 + heightBias * 150,
        rotation: (Math.random() - .5) * (1.05 + Math.abs(side) * 1.5),
        tiltX: (Math.random() - .5) * (1.8 + Math.abs(side) * .8),
        tiltY: (Math.random() - .5) * (2.2 + Math.abs(side) * .8),
        delay: Math.random() * 150,
        depth: .45 + Math.random() * .75,
      }
    }

    return Array.from({ length: rows * columns }, (_, index) => {
      const row = Math.floor(index / columns)
      const column = index % columns
      const topLeft = vertices[row][column]
      const topRight = vertices[row][column + 1]
      const bottomRight = vertices[row + 1][column + 1]
      const bottomLeft = vertices[row + 1][column]
      return Math.random() > .5
        ? [createShard([topLeft, topRight, bottomRight]), createShard([topLeft, bottomRight, bottomLeft])]
        : [createShard([topLeft, topRight, bottomLeft]), createShard([topRight, bottomRight, bottomLeft])]
    }).flat()
  }

  const selectImpactTexture = () => {
    const candidates = impactTextures.map((_, index) => index).filter((index) => index !== previousTextureIndex)
    activeTextureIndex = candidates[Math.floor(Math.random() * candidates.length)]
    previousTextureIndex = activeTextureIndex
  }

  const tracePolygon = (drawingContext: CanvasRenderingContext2D, points: Point[]) => {
    drawingContext.beginPath()
    drawingContext.moveTo(points[0].x, points[0].y)
    points.slice(1).forEach((point) => drawingContext.lineTo(point.x, point.y))
    drawingContext.closePath()
  }

  const projectShard = (shard: GlassShard, local: number, movement: number, offsetX: number, offsetY: number) => {
    const rotateZ = shard.rotation * movement
    const rotateX = shard.tiltX * movement
    const rotateY = shard.tiltY * movement
    const cosX = Math.cos(rotateX)
    const sinX = Math.sin(rotateX)
    const cosY = Math.cos(rotateY)
    const sinY = Math.sin(rotateY)
    const cosZ = Math.cos(rotateZ)
    const sinZ = Math.sin(rotateZ)
    const focalLength = Math.max(width, height) * 1.2
    const points = shard.points.map((point) => {
      const x = point.x - shard.center.x
      const y = point.y - shard.center.y
      const xAfterY = x * cosY
      const zAfterY = -x * sinY
      const yAfterX = y * cosX - zAfterY * sinX
      const zAfterX = y * sinX + zAfterY * cosX + local * shard.depth * 80
      const xAfterZ = xAfterY * cosZ - yAfterX * sinZ
      const yAfterZ = xAfterY * sinZ + yAfterX * cosZ
      const perspective = focalLength / Math.max(focalLength + zAfterX, focalLength * .35)
      return {
        x: shard.center.x + offsetX + xAfterZ * perspective,
        y: shard.center.y + offsetY + yAfterZ * perspective,
      }
    })
    const lighting = clamp(.48 + Math.sin(rotateY) * .25 - Math.sin(rotateX) * .18, .12, .88)
    return { points, lighting }
  }

  const affineTransform = (source: Point[], destination: Point[]) => {
    const sourceX1 = source[1].x - source[0].x
    const sourceY1 = source[1].y - source[0].y
    const sourceX2 = source[2].x - source[0].x
    const sourceY2 = source[2].y - source[0].y
    const destinationX1 = destination[1].x - destination[0].x
    const destinationY1 = destination[1].y - destination[0].y
    const destinationX2 = destination[2].x - destination[0].x
    const destinationY2 = destination[2].y - destination[0].y
    const determinant = sourceX1 * sourceY2 - sourceX2 * sourceY1
    if (Math.abs(determinant) < .001) return null
    const a = (destinationX1 * sourceY2 - destinationX2 * sourceY1) / determinant
    const b = (destinationY1 * sourceY2 - destinationY2 * sourceY1) / determinant
    const c = (sourceX1 * destinationX2 - sourceX2 * destinationX1) / determinant
    const d = (sourceX1 * destinationY2 - sourceX2 * destinationY1) / determinant
    return { a, b, c, d, e: destination[0].x - a * source[0].x - c * source[0].y, f: destination[0].y - b * source[0].x - d * source[0].y }
  }

  const triggerImpact = (origin: Point = { x: width / 2, y: height / 2 }, faceSize = Math.min(width, height) * .16) => {
    if (phase === 'broken') return
    impactAt = performance.now()
    dizzyOrigin = { x: origin.x, y: Math.max(62, origin.y - faceSize * 1.05) }
    dizzyFaceSize = faceSize
    selectImpactTexture()
    glassShards = createGlassShards(origin)
    phase = 'broken'
    screen.classList.add('is-broken')
    if (clearTimer !== null) window.clearTimeout(clearTimer)
    clearTimer = window.setTimeout(() => {
      clearTimer = null
      screen.classList.remove('is-broken')
      resetInteraction(true)
    }, 5_150)
  }

  const inferFace = (now: number) => {
    const inferenceInterval = phase === 'broken' ? 72 : 48
    if (!tracking || !faceLandmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || now - lastInferenceAt < inferenceInterval || video.currentTime === lastVideoTime) return
    lastInferenceAt = now
    lastVideoTime = video.currentTime
    const face = faceLandmarker.detectForVideo(video, now).faceLandmarks[0]
    if (!face?.[33] || !face[263]) {
      if (phase === 'armed' && now - lastFaceAt > 520) {
        phase = 'ready'
      }
      return
    }
    lastFaceAt = now
    const leftTemple = pointFor(face[33])
    const rightTemple = pointFor(face[263])
    const center = pointFor(face[1] ?? face[33])
    const forehead = pointFor(face[10] ?? face[1] ?? face[33])
    const size = distance(leftTemple, rightTemple)
    if (phase === 'broken') {
      // Keep the halo locked to the person's crown even while the impact
      // animation is playing and the rest of interaction tracking is paused.
      dizzyOrigin = { x: forehead.x, y: Math.max(48, forehead.y - size * .4) }
      dizzyFaceSize = size
      return
    }
    if (!baselineSize) {
      baselineSize = size
      retreatSize = size
      previousSize = size
      previousSizeAt = now
      calibrationStartedAt = now
      phase = 'calibrating'
      return
    }
    if (phase === 'calibrating') {
      baselineSize += (size - baselineSize) * .12
      retreatSize = Math.min(retreatSize || size, size)
      if (now - calibrationStartedAt > 720) {
        phase = 'ready'
      }
    } else if (phase === 'ready') {
      retreatSize = Math.min(retreatSize || size, size)
      if (size <= baselineSize * 1.12) {
        phase = 'armed'
        retreatSize = Math.min(retreatSize, size)
        calibrationStartedAt = now
      }
    } else if (phase === 'armed') {
      retreatSize = Math.min(retreatSize, size)
      const elapsed = Math.max(now - previousSizeAt, 1)
      const speed = (size - previousSize) / elapsed
      const forwardRatio = size / Math.max(retreatSize, 1)
      const centered = Math.abs(center.x - width / 2) < width * .32 && Math.abs(center.y - height / 2) < height * .31
      if (centered && forwardRatio > 1.17 && speed > .095) triggerImpact(center, size)
      else if (now - calibrationStartedAt > 12_000) {
        phase = 'ready'
        baselineSize = size
        retreatSize = size
      }
    }
    previousSize = size
    previousSizeAt = now
  }

  const drawCamera = () => {
    context.fillStyle = '#182226'
    context.fillRect(0, 0, width, height)
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
    const view = cover()
    context.save()
    context.translate(width, 0)
    context.scale(-1, 1)
    context.drawImage(video, view.left, view.top, view.drawWidth, view.drawHeight)
    context.restore()
  }

  const drawDizzy = (now: number) => {
    if (!impactAt) return
    const elapsed = now - impactAt
    // The dizzy moment begins as the falling glass clears the face area.
    const entrance = clamp((elapsed - 2_720) / 220, 0, 1)
    const exit = clamp((5_150 - elapsed) / 600, 0, 1)
    const visibility = entrance * exit
    if (!visibility) return
    const center = { x: dizzyOrigin.x, y: clamp(dizzyOrigin.y, 52, height * .36) }
    const spin = (elapsed - 2_720) * .0052
    const haloWidth = clamp(dizzyFaceSize * .74, 58, Math.min(width, height) * .3)
    const haloHeight = haloWidth * .22
    context.save()
    context.globalCompositeOperation = 'lighter'
    context.globalAlpha = visibility
    context.translate(center.x, center.y)
    context.rotate(Math.sin(spin) * .12)
    context.strokeStyle = 'rgba(255, 255, 255, .88)'
    context.lineWidth = 3.4
    context.shadowColor = 'rgba(255, 255, 255, .5)'
    context.shadowBlur = 9
    context.beginPath()
    context.ellipse(0, 0, haloWidth, haloHeight, 0, 0, Math.PI * 2)
    context.stroke()
    context.strokeStyle = 'rgba(255, 255, 255, .96)'
    context.lineWidth = 1
    context.shadowBlur = 0
    context.beginPath()
    context.ellipse(0, 0, haloWidth * .77, haloHeight * .56, 0, 0, Math.PI * 2)
    context.stroke()

    const starColors = ['rgba(255, 255, 255, .98)', 'rgba(255, 255, 255, .98)', 'rgba(255, 255, 255, .98)']
    for (let index = 0; index < 3; index += 1) {
      const angle = spin * 1.75 + index * (Math.PI * 2 / 3)
      const x = Math.cos(angle) * haloWidth
      const y = Math.sin(angle) * haloHeight * 1.9
      context.save()
      context.translate(x, y)
      context.rotate(angle - Math.PI / 2)
      context.fillStyle = starColors[index]
      context.shadowColor = starColors[index]
      context.shadowBlur = 8
      context.beginPath()
      for (let point = 0; point < 10; point += 1) {
        const radius = point % 2 === 0 ? 7.2 : 3.6
        const pointAngle = -Math.PI / 2 + point * Math.PI / 5
        const starX = Math.cos(pointAngle) * radius
        const starY = Math.sin(pointAngle) * radius
        if (point === 0) context.moveTo(starX, starY)
        else context.lineTo(starX, starY)
      }
      context.closePath()
      context.fill()
      context.shadowBlur = 0
      context.fillStyle = 'rgba(255, 255, 245, .8)'
      context.beginPath()
      context.arc(-1.5, .2, .75, 0, Math.PI * 2)
      context.arc(1.5, .2, .75, 0, Math.PI * 2)
      context.fill()
      context.restore()
    }
    context.restore()
  }

  const drawGlass = (now: number) => {
    if (!impactAt) return
    const impactTexture = impactTextures[activeTextureIndex]
    const elapsed = now - impactAt
    const flash = clamp(1 - elapsed / 145, 0, 1)
    if (flash) {
      context.fillStyle = `rgba(238, 255, 255, ${flash * .44})`
      context.fillRect(0, 0, width, height)
    }
    const textureProgress = clamp((elapsed - 42) / 460, 0, 1)
    const eased = 1 - Math.pow(1 - textureProgress, 3)

    if (impactTexture.complete && impactTexture.naturalWidth) {
      const hasFragmentTexture = prepareFragmentTexture(impactTexture)
      const textureSource = hasFragmentTexture ? fragmentSurface : impactTexture
      const textureWidth = hasFragmentTexture ? fragmentSurface.width : width
      const textureHeight = hasFragmentTexture ? fragmentSurface.height : height
      const textureCoordinateScale = hasFragmentTexture ? 1 : pixelRatio
      context.save()
      context.globalCompositeOperation = 'lighter'
      context.globalAlpha = .78 + eased * .22

      if (elapsed < 2_000) {
        if (hasFragmentTexture) {
          context.setTransform(1, 0, 0, 1, 0, 0)
          context.drawImage(fragmentSurface, 0, 0)
        } else {
          context.drawImage(impactTexture, 0, 0, width, height)
        }
      } else {
        // After the two-second hold, the photographed texture itself is
        // clipped into irregular pieces. Each piece keeps its crack detail,
        // then falls and rotates beyond the lower edge under gravity.
        const fallElapsed = elapsed - 2_000
        for (const shard of glassShards) {
          const local = clamp((fallElapsed - shard.delay) / 1_350, 0, 1)
          if (local <= 0) {
            context.save()
            const points = hasFragmentTexture ? shard.points.map((point) => ({ x: point.x * pixelRatio, y: point.y * pixelRatio })) : shard.points
            context.setTransform(textureCoordinateScale, 0, 0, textureCoordinateScale, 0, 0)
            tracePolygon(context, points)
            context.clip()
            context.setTransform(textureCoordinateScale, 0, 0, textureCoordinateScale, 0, 0)
            context.drawImage(textureSource, 0, 0, textureWidth, textureHeight)
            context.restore()
            continue
          }
          const time = local * 1.45
          const movement = local * local * (3 - 2 * local)
          const offsetX = shard.velocityX * time
          const offsetY = shard.velocityY * time + 620 * time * time
          const projection = projectShard(shard, local, movement, offsetX, offsetY)
          const sourcePoints = hasFragmentTexture ? shard.points.map((point) => ({ x: point.x * pixelRatio, y: point.y * pixelRatio })) : shard.points
          const destinationPoints = hasFragmentTexture ? projection.points.map((point) => ({ x: point.x * pixelRatio, y: point.y * pixelRatio })) : projection.points
          const transform = affineTransform(sourcePoints, destinationPoints)
          if (!transform) continue
          context.save()
          context.setTransform(textureCoordinateScale, 0, 0, textureCoordinateScale, 0, 0)
          tracePolygon(context, destinationPoints)
          context.clip()
          context.setTransform(
            transform.a * textureCoordinateScale,
            transform.b * textureCoordinateScale,
            transform.c * textureCoordinateScale,
            transform.d * textureCoordinateScale,
            transform.e * textureCoordinateScale,
            transform.f * textureCoordinateScale,
          )
          context.drawImage(textureSource, 0, 0, textureWidth, textureHeight)

          // The face, dark side and rim all follow the perspective-projected
          // triangle. This lets shards tip toward/away from the camera rather
          // than behaving as flat rotating crops.
          context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
          context.globalCompositeOperation = 'source-over'
          context.globalAlpha = local * (1 - projection.lighting) * (.08 + shard.depth * .09)
          context.fillStyle = 'rgba(3, 12, 16, .9)'
          tracePolygon(context, projection.points)
          context.fill()
          context.globalAlpha = local * projection.lighting * .11
          context.fillStyle = 'rgba(230, 249, 252, .9)'
          tracePolygon(context, projection.points)
          context.fill()
          context.globalAlpha = local * (.1 + shard.depth * .12)
          context.strokeStyle = 'rgba(3, 10, 14, .95)'
          context.lineJoin = 'round'
          context.lineWidth = 3 + shard.depth * 2
          context.shadowColor = 'rgba(0, 0, 0, .5)'
          context.shadowBlur = 4 + shard.depth * 5
          context.shadowOffsetX = 2 + shard.depth * 2
          context.shadowOffsetY = 4 + shard.depth * 3
          tracePolygon(context, projection.points)
          context.stroke()
          context.globalAlpha = local * (.24 + shard.depth * .18)
          context.strokeStyle = 'rgba(226, 245, 248, .82)'
          context.lineWidth = .65 + shard.depth * .45
          context.shadowColor = 'transparent'
          context.shadowBlur = 0
          context.shadowOffsetX = 0
          context.shadowOffsetY = 0
          tracePolygon(context, projection.points)
          context.stroke()
          context.restore()
        }
      }
      context.restore()
    }
  }

  const render = (now: number) => {
    animation = requestAnimationFrame(render)
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    drawCamera()
    inferFace(now)
    drawGlass(now)
    drawDizzy(now)
  }

  const startCamera = async () => {
    if (tracking) return
    if (!navigator.mediaDevices?.getUserMedia) return
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      video.srcObject = stream
      await video.play()
      revealOnFirstVideoFrame(screen, video)
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm')
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task' },
        runningMode: 'VIDEO',
        numFaces: 1,
      })
      tracking = true
      screen.classList.add('is-tracking')
      resetInteraction()
    } catch (error) {
      console.error('Bird Impact camera:', error)
      screen.classList.remove('is-camera-pending')
      stream?.getTracks().forEach((track) => track.stop())
      stream = null
      video.srcObject = null
    }
  }

  screen.addEventListener('pointerup', (event) => {
    if (event.target instanceof Element && event.target.closest('.bird-impact-close')) return
    void startCamera()
  })
  closeButton.addEventListener('click', () => history.back())
  window.addEventListener('resize', resize, { passive: true })

  return {
    open: () => {
      open = true
      resize()
      resetInteraction()
      screen.classList.add('is-open')
      screen.classList.add('is-camera-pending')
      screen.setAttribute('aria-hidden', 'false')
      animation = requestAnimationFrame(render)
      // G-die navigation opens synchronously from a user action, so this can
      // request permission without leaving a camera icon over the live image.
      void startCamera()
      closeButton.focus()
    },
    close: () => {
      open = false
      cancelAnimationFrame(animation)
      if (clearTimer !== null) window.clearTimeout(clearTimer)
      clearTimer = null
      screen.classList.remove('is-open', 'is-tracking', 'is-broken')
      screen.setAttribute('aria-hidden', 'true')
      tracking = false
      faceLandmarker?.close()
      faceLandmarker = null
      stream?.getTracks().forEach((track) => track.stop())
      stream = null
      outputStream?.getTracks().forEach((track) => track.stop())
      outputStream = null
      video.srcObject = null
      resetInteraction()
    },
    getRecordingStream: () => {
      if (!open || !tracking || !canvas.captureStream) return null
      outputStream ??= canvas.captureStream(30)
      return outputStream
    },
    getRecordingCanvas: () => open && tracking ? canvas : null,
  }
}
