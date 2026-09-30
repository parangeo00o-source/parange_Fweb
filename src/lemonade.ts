import { FaceLandmarker, FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'

type Point = { x: number; y: number }
type Lemon = {
  id: number
  x: number
  y: number
  phase: number
  juice: number
  maxJuice: number
  grabbed: boolean
  spent: boolean
  fallY: number
  displayX: number
  displayY: number
  displaySquash: number
}
type Drop = { x: number; y: number; velocity: number; node: HTMLElement }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

export const createLemonadeExperience = () => {
  const screen = document.createElement('section')
  screen.className = 'lemonade-screen'
  screen.setAttribute('aria-hidden', 'true')
  screen.innerHTML = `
    <video class="lemonade-camera" autoplay muted playsinline></video>
    <div class="lemonade-wash"></div>
    <header class="lemonade-header"><p>Lemonade</p></header>
    <div class="lemonade-orchard" aria-hidden="true"></div>
    <div class="lemonade-drops" aria-hidden="true"></div>
    <div class="lemonade-cup" aria-label="레몬에이드 컵">
      <div class="cup-liquid"></div><div class="cup-ice ice-one"></div><div class="cup-ice ice-two"></div><div class="cup-ice ice-three"></div><div class="cup-slice"></div><div class="cup-straw" aria-hidden="true"><i></i></div>
    </div>
    <div class="lemonade-hint"><b>왼손</b>으로 레몬을 쥐어 짜고, <b>오른손</b>으로 컵을 옮겨 담아보세요.</div>
    <button class="lemonade-camera-button" type="button">카메라 켜기</button>
    <span class="lemonade-status">카메라를 켜면 시작됩니다</span>
    <button class="lemonade-close" type="button" aria-label="주사위 화면으로 돌아가기">×</button>
  `
  document.body.append(screen)

  const video = screen.querySelector<HTMLVideoElement>('.lemonade-camera')!
  const orchard = screen.querySelector<HTMLElement>('.lemonade-orchard')!
  const dropsLayer = screen.querySelector<HTMLElement>('.lemonade-drops')!
  const cup = screen.querySelector<HTMLElement>('.lemonade-cup')!
  const liquid = screen.querySelector<HTMLElement>('.cup-liquid')!
  const hint = screen.querySelector<HTMLElement>('.lemonade-hint')!
  const status = screen.querySelector<HTMLElement>('.lemonade-status')!
  const cameraButton = screen.querySelector<HTMLButtonElement>('.lemonade-camera-button')!
  const closeButton = screen.querySelector<HTMLButtonElement>('.lemonade-close')!
  const lemons: Lemon[] = [
    { id: 0, x: 18, y: 25, phase: 0.2, juice: 100, maxJuice: 100, grabbed: false, spent: false, fallY: 0, displayX: 0, displayY: 0, displaySquash: 1 },
    { id: 1, x: 42, y: 18, phase: 2.4, juice: 78, maxJuice: 78, grabbed: false, spent: false, fallY: 0, displayX: 0, displayY: 0, displaySquash: 1 },
    { id: 2, x: 68, y: 30, phase: 4.1, juice: 120, maxJuice: 120, grabbed: false, spent: false, fallY: 0, displayX: 0, displayY: 0, displaySquash: 1 },
    { id: 3, x: 84, y: 17, phase: 1.1, juice: 88, maxJuice: 88, grabbed: false, spent: false, fallY: 0, displayX: 0, displayY: 0, displaySquash: 1 },
    { id: 4, x: 28, y: 49, phase: 5.1, juice: 95, maxJuice: 95, grabbed: false, spent: false, fallY: 0, displayX: 0, displayY: 0, displaySquash: 1 },
  ]
  const lemonNodes = new Map<number, HTMLElement>()
  const drops: Drop[] = []
  let landmarker: HandLandmarker | null = null
  let faceLandmarker: FaceLandmarker | null = null
  let stream: MediaStream | null = null
  let open = false
  let tracking = false
  let animation = 0
  let lastTime = 0
  let lastVideoTime = -1
  let lastHandInferenceAt = 0
  let lastFaceInferenceAt = 0
  let filled = 0
  let dropCarry = 0
  let leftFist: Point | null = null
  let rightPalm: Point | null = null
  let mouthPoint: Point | null = null
  let hasStraw = false
  const recordingCanvas = document.createElement('canvas')
  const recordingContext = recordingCanvas.getContext('2d')!
  const titleCanvas = document.createElement('canvas')
  const titleContext = titleCanvas.getContext('2d')!
  let compositeStream: MediaStream | null = null
  let lastCompositeFrameAt = 0
  let lastCupCenter: Point = { x: window.innerWidth / 2, y: window.innerHeight - 132 }
  let lastDrinking = false
  let hintTimer: number | null = null

  lemons.forEach((lemon) => {
    const node = document.createElement('div')
    node.className = 'lemon'
    node.dataset.lemon = String(lemon.id)
    node.innerHTML = `<div class="lemon-fallback"></div><img src="${import.meta.env.BASE_URL}lemons/lemon.png" alt="" onerror="this.style.display='none'" /><span></span>`
    orchard.append(node)
    lemonNodes.set(lemon.id, node)
  })

  const cameraPoint = (landmark: { x: number; y: number }) => ({ x: (1 - landmark.x) * window.innerWidth, y: landmark.y * window.innerHeight })
  const isFist = (landmarks: Array<{ x: number; y: number }>) => {
    const wrist = landmarks[0]
    const scale = Math.max(distance(wrist, landmarks[9]), 0.001)
    return [8, 12, 16, 20].every((tip) => distance(wrist, landmarks[tip]) / scale < 1.35)
  }

  const createDrop = (x: number, y: number) => {
    const node = document.createElement('i')
    node.className = 'lemon-drop'
    dropsLayer.append(node)
    return { x, y, velocity: 260, node }
  }

  const updateTracking = (now: number) => {
    if (!landmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || now - lastHandInferenceAt < 42 || video.currentTime === lastVideoTime) return
    lastVideoTime = video.currentTime
    lastHandInferenceAt = now
    leftFist = null
    rightPalm = null
    const result = landmarker.detectForVideo(video, performance.now())
    result.landmarks.forEach((landmarks, index) => {
      const handedness = result.handedness[index]?.[0]?.categoryName
      if (handedness === 'Left' && isFist(landmarks)) leftFist = cameraPoint(landmarks[9])
      if (handedness === 'Right') rightPalm = cameraPoint(landmarks[9])
    })
    // The mouth is only needed once the straw exists. Skipping this second model
    // for the rest of the experience removes a large continuous mobile workload.
    if (!hasStraw) {
      mouthPoint = null
    } else if (faceLandmarker && now - lastFaceInferenceAt >= 66) {
      lastFaceInferenceAt = now
      mouthPoint = null
      const face = faceLandmarker.detectForVideo(video, performance.now()).faceLandmarks[0]
      // 13 and 14 are the inner upper/lower lip landmarks. Averaging them is
      // more stable than a single lip point while the user is moving the cup.
      if (face) mouthPoint = cameraPoint({ x: (face[13].x + face[14].x) / 2, y: (face[13].y + face[14].y) / 2 })
    }
  }

  const drawRecordingFrame = (cupCenter: Point, drinking: boolean) => {
    // Use the actual fixed-page box, rather than a camera-frame size, so the
    // saved canvas has precisely the same aspect ratio as the live page.
    const width = Math.round(screen.clientWidth)
    const height = Math.round(screen.clientHeight)
    if (recordingCanvas.width !== width || recordingCanvas.height !== height) {
      recordingCanvas.width = width
      recordingCanvas.height = height
    }
    const context = recordingContext
    context.clearRect(0, 0, width, height)
    context.fillStyle = '#151b12'
    context.fillRect(0, 0, width, height)
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth) {
      const scale = Math.max(width / video.videoWidth, height / video.videoHeight)
      const drawWidth = video.videoWidth * scale
      const drawHeight = video.videoHeight * scale
      context.save()
      context.translate(width, 0)
      context.scale(-1, 1)
      context.drawImage(video, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
      context.restore()
    }
    context.fillStyle = 'rgba(13, 24, 8, .24)'
    context.fillRect(0, 0, width, height)
    const titleX = clamp(width * .04, 22, 58)
    const titleSize = clamp(width * .085, 48, 116)
    const titleY = clamp(width * .04, 22, 52) + titleSize * .78
    const titleFont = `900 ${titleSize}px Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif`
    // Render the striped logo on a transparent, tightly-sized layer. The old
    // rectangular clip allowed every stripe to continue past the last letter.
    titleContext.font = titleFont
    const titleWidth = Math.ceil((titleContext.measureText('LEMONADE').width + titleSize * .12) * .73 + 8)
    const titleHeight = Math.ceil(titleSize * 1.1 + 8)
    if (titleCanvas.width !== titleWidth || titleCanvas.height !== titleHeight) {
      titleCanvas.width = titleWidth
      titleCanvas.height = titleHeight
    }
    titleContext.clearRect(0, 0, titleWidth, titleHeight)
    titleContext.save()
    titleContext.translate(4, 4)
    titleContext.scale(.73, 1)
    titleContext.font = titleFont
    titleContext.textBaseline = 'alphabetic'
    titleContext.fillStyle = '#075eea'
    titleContext.fillText('LEMONADE', 0, titleSize * .82)
    // source-atop is now constrained to the transparent title layer, so the
    // stripes can never escape into the camera image.
    titleContext.globalCompositeOperation = 'source-atop'
    titleContext.strokeStyle = 'rgba(99, 188, 255, .78)'
    titleContext.lineWidth = Math.max(1, titleSize * .018)
    for (let line = titleSize * .04; line < titleSize * .86; line += titleSize * .15) {
      titleContext.beginPath(); titleContext.moveTo(0, line); titleContext.lineTo(titleWidth / .73, line); titleContext.stroke()
    }
    titleContext.globalCompositeOperation = 'source-over'
    titleContext.lineJoin = 'miter'
    titleContext.lineWidth = Math.max(2, titleSize * .028)
    titleContext.strokeStyle = '#fffdf0'
    titleContext.strokeText('LEMONADE', 0, titleSize * .82)
    titleContext.restore()
    context.drawImage(titleCanvas, titleX - 4, titleY - titleSize * .82 - 4)
    const lemonSize = width <= 620 ? 72 : clamp(width * .1, 64, 136)
    lemons.forEach((lemon) => {
      if (lemon.displayY < -lemonSize || lemon.displayY > height + lemonSize) return
      const lemonWidth = lemonSize * (1 + (1 - lemon.displaySquash) * .18)
      const lemonHeight = lemonSize * lemon.displaySquash
      context.save()
      context.translate(lemon.displayX, lemon.displayY)
      context.rotate(.22)
      const gradient = context.createRadialGradient(-lemonWidth * .21, -lemonHeight * .25, 2, 0, 0, lemonWidth * .58)
      gradient.addColorStop(0, '#fffbd9')
      gradient.addColorStop(.16, '#f6e755')
      gradient.addColorStop(.68, '#e9bd20')
      gradient.addColorStop(1, lemon.spent ? '#96762e' : '#aa7914')
      context.fillStyle = gradient
      context.beginPath()
      context.ellipse(0, 0, lemonWidth * .43, lemonHeight * .48, 0, 0, Math.PI * 2)
      context.fill()
      context.strokeStyle = 'rgba(255,248,126,.75)'
      context.lineWidth = 2
      context.stroke()
      context.restore()
    })
    drops.forEach((drop) => {
      context.fillStyle = '#ffe34d'
      context.beginPath()
      context.arc(drop.x, drop.y, 7, 0, Math.PI * 2)
      context.fill()
    })
    const cupLeft = cupCenter.x - 63
    const cupTop = cupCenter.y - 79
    const liquidTop = cupTop + 158 - (158 * filled / 100)
    context.save()
    context.beginPath()
    context.moveTo(cupLeft + 9, cupTop + 4)
    context.lineTo(cupLeft + 117, cupTop + 4)
    context.lineTo(cupLeft + 106, cupTop + 151)
    context.quadraticCurveTo(cupCenter.x, cupTop + 163, cupLeft + 20, cupTop + 151)
    context.closePath()
    context.clip()
    context.fillStyle = '#f6d63a'
    context.fillRect(cupLeft, liquidTop, 126, 160 - (liquidTop - cupTop))
    context.restore()
    context.strokeStyle = 'rgba(255,255,255,.86)'
    context.lineWidth = 3
    context.beginPath()
    context.moveTo(cupLeft + 9, cupTop + 4)
    context.lineTo(cupLeft + 117, cupTop + 4)
    context.lineTo(cupLeft + 106, cupTop + 151)
    context.quadraticCurveTo(cupCenter.x, cupTop + 163, cupLeft + 20, cupTop + 151)
    context.closePath()
    context.stroke()
    ;[-22, 16, 49].forEach((offset, index) => {
      context.save()
      context.translate(cupCenter.x + offset, cupTop + 102 - index * 15 - filled * .22)
      context.rotate(index * .4)
      context.fillStyle = 'rgba(223, 251, 255, .66)'
      context.fillRect(-18, -18, 36, 36)
      context.restore()
    })
    context.save()
    context.translate(cupCenter.x, cupTop + 70 - filled * .22)
    context.rotate(.28)
    context.fillStyle = '#fff6b5'
    context.beginPath(); context.arc(0, 0, 25, 0, Math.PI * 2); context.fill()
    context.strokeStyle = '#f4d238'
    context.lineWidth = 8
    context.stroke()
    context.strokeStyle = 'rgba(243,217,71,.72)'
    context.lineWidth = 1.5
    for (let ray = 0; ray < 8; ray += 1) {
      const angle = ray * Math.PI / 4
      context.beginPath(); context.moveTo(0, 0); context.lineTo(Math.cos(angle) * 18, Math.sin(angle) * 18); context.stroke()
    }
    context.restore()
    if (hasStraw) {
      context.save()
      context.translate(cupCenter.x + 17, cupTop + 72)
      context.rotate(.17)
      context.fillStyle = '#f9f1d6'
      context.fillRect(-6, -120, 12, 122)
      context.strokeStyle = '#e63e32'
      context.lineWidth = 5
      for (let stripe = -111; stripe < 0; stripe += 17) {
        context.beginPath(); context.moveTo(-6, stripe); context.lineTo(6, stripe + 9); context.stroke()
      }
      if (drinking) {
        context.fillStyle = '#fff27a'
        context.beginPath(); context.arc(0, -42, 4, 0, Math.PI * 2); context.fill()
        context.beginPath(); context.arc(0, -82, 3, 0, Math.PI * 2); context.fill()
      }
      context.restore()
    }
  }

  const run = (now: number) => {
    if (!open) return
    const delta = Math.min((now - lastTime) / 1000 || 0, 0.05)
    lastTime = now
    if (tracking) updateTracking(now)
    const cupCenter = rightPalm ?? { x: window.innerWidth / 2, y: window.innerHeight - 132 }
    cup.style.transform = `translate3d(${cupCenter.x}px, ${cupCenter.y}px, 0)`
    cup.classList.toggle('is-held', Boolean(rightPalm))
    if (filled >= 99) hasStraw = true
    // This point matches the visible end of the straw above the glass. When it
    // reaches the mouth, the lemonade is pulled up through the straw.
    const strawTip = { x: cupCenter.x + 17, y: cupCenter.y - 128 }
    const drinking = hasStraw && Boolean(mouthPoint) && distance(strawTip, mouthPoint!) < 82
    if (drinking) {
      filled = Math.max(0, filled - delta * 17)
      if (filled === 0) hasStraw = false
    }
    cup.classList.toggle('is-full', hasStraw)
    cup.classList.toggle('is-drinking', drinking)
    lastCupCenter = cupCenter
    lastDrinking = drinking
    const movingLemon = lemons.find((lemon) => lemon.grabbed && !lemon.spent)
    if (leftFist && !movingLemon) {
      const candidate = lemons.filter((lemon) => !lemon.spent).sort((a, b) => {
        const ap = { x: window.innerWidth * a.x / 100, y: window.innerHeight * a.y / 100 }
        const bp = { x: window.innerWidth * b.x / 100, y: window.innerHeight * b.y / 100 }
        return distance(leftFist!, ap) - distance(leftFist!, bp)
      })[0]
      if (candidate && distance(leftFist, { x: window.innerWidth * candidate.x / 100, y: window.innerHeight * candidate.y / 100 }) < 105) candidate.grabbed = true
    }
    lemons.forEach((lemon) => {
      const node = lemonNodes.get(lemon.id)!
      let position: Point = { x: window.innerWidth * lemon.x / 100, y: window.innerHeight * lemon.y / 100 + Math.sin(now / 900 + lemon.phase) * 18 }
      let squash = 1
      if (lemon.grabbed && leftFist && !lemon.spent) {
        position = leftFist
        lemon.x = position.x / window.innerWidth * 100
        lemon.y = position.y / window.innerHeight * 100
        lemon.juice = Math.max(0, lemon.juice - delta * 23)
        squash = 0.72 + Math.sin(now / 55) * 0.08
        dropCarry += delta * 13
        while (dropCarry >= 1 && lemon.juice > 0) {
          drops.push(createDrop(position.x, position.y + 42))
          dropCarry -= 1
        }
        if (lemon.juice <= 0) { lemon.spent = true; lemon.grabbed = false }
      } else if (lemon.grabbed && !leftFist) lemon.grabbed = false
      if (lemon.spent) { lemon.fallY += delta * 420; position.y += lemon.fallY; squash = 0.68 }
      lemon.displayX = position.x
      lemon.displayY = position.y
      lemon.displaySquash = squash
      node.style.transform = `translate3d(${position.x}px, ${position.y}px, 0) translate(-50%, -50%) scaleX(${1 + (1 - squash) * .18}) scaleY(${squash}) rotate(${Math.sin(now / 1300 + lemon.phase) * 8}deg)`
      node.classList.toggle('is-squeezed', lemon.grabbed)
      node.classList.toggle('is-spent', lemon.spent)
      if (position.y > window.innerHeight + 100) node.remove()
    })
    for (let index = drops.length - 1; index >= 0; index -= 1) {
      const drop = drops[index]
      drop.velocity += delta * 680
      drop.y += drop.velocity * delta
      const nearCup = Math.abs(drop.x - cupCenter.x) < 56 && drop.y > cupCenter.y - 80 && drop.y < cupCenter.y + 48
      if (nearCup) { filled = clamp(filled + 1.4, 0, 100); drop.y = window.innerHeight + 100 }
      if (drop.y > window.innerHeight + 20) { drop.node.remove(); drops.splice(index, 1) }
      else drop.node.style.transform = `translate3d(${drop.x}px, ${drop.y}px, 0)`
    }
    liquid.style.height = `${filled}%`
    cup.style.setProperty('--ice-lift', `${filled * .42}px`)
    // Compositing a full-screen canvas is needed only for capture. Limit it to
    // the 30fps output cadence instead of redrawing it during normal gameplay.
    if (compositeStream && now - lastCompositeFrameAt >= 33) {
      lastCompositeFrameAt = now
      drawRecordingFrame(cupCenter, drinking)
    }
    animation = requestAnimationFrame(run)
  }

  const startCamera = async () => {
    if (tracking) return
    cameraButton.disabled = true
    cameraButton.textContent = '카메라 연결 중…'
    status.textContent = '손을 인식하고 있어요'
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: false })
      video.srcObject = stream
      await video.play()
      // Keep the remotely loaded WASM runtime aligned with the installed package.
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm')
      landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task' },
        runningMode: 'VIDEO', numHands: 2,
      })
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task' },
        runningMode: 'VIDEO', numFaces: 1,
      })
      tracking = true
      screen.classList.add('is-tracking')
      cameraButton.classList.add('is-hidden')
      status.classList.add('is-hidden')
      hint.classList.add('is-visible')
      hintTimer = window.setTimeout(() => hint.classList.remove('is-visible'), 5_000)
    } catch (error) {
      console.error(error)
      cameraButton.disabled = false
      cameraButton.textContent = '카메라 다시 켜기'
      status.textContent = '카메라 권한을 허용하면 손 추적을 시작할 수 있어요'
    }
  }

  cameraButton.addEventListener('click', startCamera)
  closeButton.addEventListener('click', () => history.back())

  return {
    open: () => {
      open = true
      screen.classList.add('is-open')
      screen.setAttribute('aria-hidden', 'false')
      lastTime = performance.now()
      animation = requestAnimationFrame(run)
      closeButton.focus()
    },
    close: () => {
      open = false
      cancelAnimationFrame(animation)
      if (hintTimer !== null) window.clearTimeout(hintTimer)
      hintTimer = null
      hint.classList.remove('is-visible')
      screen.classList.remove('is-open')
      screen.classList.remove('is-tracking')
      screen.setAttribute('aria-hidden', 'true')
      tracking = false
      landmarker?.close()
      landmarker = null
      faceLandmarker?.close()
      faceLandmarker = null
      stream?.getTracks().forEach((track) => track.stop())
      stream = null
      video.srcObject = null
      compositeStream?.getTracks().forEach((track) => track.stop())
      compositeStream = null
      cameraButton.disabled = false
      cameraButton.textContent = '카메라 켜기'
      cameraButton.classList.remove('is-hidden')
      status.textContent = '카메라를 켜면 시작됩니다'
      status.classList.remove('is-hidden')
    },
    isOpen: () => open,
    getRecordingStream: () => {
      if (!open || !recordingCanvas.captureStream) return null
      drawRecordingFrame(lastCupCenter, lastDrinking)
      compositeStream ??= recordingCanvas.captureStream(30)
      return compositeStream
    },
    getRecordingCanvas: () => {
      if (!open) return null
      drawRecordingFrame(lastCupCenter, lastDrinking)
      return recordingCanvas
    },
  }
}
