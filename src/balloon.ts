import { FaceLandmarker, FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'

type Point = { x: number; y: number }
type Balloon = { id: number; x: number; y: number; vx: number; vy: number; radius: number; color: string; stringLength: number; grabbed: boolean; zoomStartedAt: number | null; zoomCooldownUntil: number; node: HTMLElement }
type Fragment = { x: number; y: number; vx: number; vy: number; rotation: number; spin: number; life: number; color: string; node: HTMLElement }

const colors = ['#f35b79', '#ff9b42', '#ffd34f', '#84cf74', '#61bee9', '#9181e6', '#df78ba']
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

export const createBalloonExperience = () => {
  const screen = document.createElement('section')
  screen.className = 'balloon-screen'
  screen.setAttribute('aria-hidden', 'true')
  screen.innerHTML = `
    <video class="balloon-camera" autoplay muted playsinline></video><div class="balloon-wash"></div>
    <header class="balloon-header"><p>Balloon</p><span>검지로 터뜨리고, 엄지와 검지로 끈을 잡아보세요</span></header>
    <div class="balloon-field" aria-hidden="true"></div><div class="balloon-confetti" aria-hidden="true"></div>
    <button class="balloon-start" type="button">카메라 켜기</button><button class="balloon-close" type="button" aria-label="주사위 화면으로 돌아가기">×</button>
  `
  document.body.append(screen)
  const video = screen.querySelector<HTMLVideoElement>('.balloon-camera')!
  const field = screen.querySelector<HTMLElement>('.balloon-field')!
  const confettiLayer = screen.querySelector<HTMLElement>('.balloon-confetti')!
  const startButton = screen.querySelector<HTMLButtonElement>('.balloon-start')!
  const closeButton = screen.querySelector<HTMLButtonElement>('.balloon-close')!
  const balloons: Balloon[] = []
  const fragments: Fragment[] = []
  const fragmentPool: HTMLElement[] = []
  let stream: MediaStream | null = null
  let landmarker: HandLandmarker | null = null
  let faceLandmarker: FaceLandmarker | null = null
  let open = false
  let tracking = false
  let frame = 0
  let lastTime = 0
  let lastInferenceAt = 0
  let lastVideoTime = -1
  let lastFaceInferenceAt = 0
  let lastSpawnAt = 0
  let balloonId = 0
  let indexTips: Point[] = []
  let pinchPoint: Point | null = null
  let mouthPoint: Point | null = null
  let mouthIsRound = false

  const pointFor = (landmark: { x: number; y: number }): Point => ({ x: (1 - landmark.x) * window.innerWidth, y: landmark.y * window.innerHeight })
  const createBalloon = () => {
    const radius = 34 + Math.random() * 36
    const node = document.createElement('div')
    const color = colors[Math.floor(Math.random() * colors.length)]
    node.className = 'balloon-item'
    node.innerHTML = `<i class="balloon-body" style="--balloon-color:${color}"></i><i class="balloon-knot" style="--balloon-color:${color}"></i><i class="balloon-string"></i>`
    node.style.setProperty('--balloon-size', `${radius * 2}px`)
    node.style.setProperty('--string-length', `${92 + Math.random() * 72}px`)
    node.style.setProperty('--string-angle', '0deg')
    field.append(node)
    const stringLength = Number.parseFloat(node.style.getPropertyValue('--string-length'))
    balloons.push({ id: balloonId++, x: radius + Math.random() * (window.innerWidth - radius * 2), y: window.innerHeight + radius + Math.random() * 160, vx: (Math.random() - .5) * 14, vy: -(22 + Math.random() * 24), radius, color, stringLength, grabbed: false, zoomStartedAt: null, zoomCooldownUntil: 0, node })
  }
  const burst = (balloon: Balloon) => {
    balloon.node.remove()
    const index = balloons.indexOf(balloon)
    if (index >= 0) balloons.splice(index, 1)
    for (let count = 0; count < 12; count += 1) {
      const angle = Math.random() * Math.PI * 2
      const speed = 85 + Math.random() * 180
      const node = fragmentPool.pop() ?? document.createElement('i')
      node.className = 'balloon-fragment'
      node.style.background = balloon.color
      confettiLayer.append(node)
      fragments.push({ x: balloon.x, y: balloon.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, rotation: Math.random() * 360, spin: (Math.random() - .5) * 720, life: 1, color: balloon.color, node })
    }
  }
  const inferHands = (now: number) => {
    if (!landmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || now - lastInferenceAt < 42 || video.currentTime === lastVideoTime) return
    lastInferenceAt = now
    lastVideoTime = video.currentTime
    indexTips = []
    pinchPoint = null
    const result = landmarker.detectForVideo(video, now)
    result.landmarks.forEach((landmarks) => {
      const index = pointFor(landmarks[8])
      const thumb = pointFor(landmarks[4])
      indexTips.push(index)
      if (distance(index, thumb) < 42) pinchPoint = { x: (index.x + thumb.x) / 2, y: (index.y + thumb.y) / 2 }
    })
    if (faceLandmarker && now - lastFaceInferenceAt >= 66) {
      lastFaceInferenceAt = now
      mouthPoint = null
      mouthIsRound = false
      const face = faceLandmarker.detectForVideo(video, now).faceLandmarks[0]
      if (face) {
        const top = face[13]
        const bottom = face[14]
        const left = face[78]
        const right = face[308]
        const openness = Math.hypot(top.x - bottom.x, top.y - bottom.y)
        const width = Math.max(Math.hypot(left.x - right.x, left.y - right.y), .001)
        mouthPoint = pointFor({ x: (top.x + bottom.x) / 2, y: (top.y + bottom.y) / 2 })
        mouthIsRound = openness / width > .34
      }
    }
  }
  const updateBalloonNode = (balloon: Balloon, now: number) => {
    if (balloon.grabbed && pinchPoint) {
      const angle = Math.atan2(pinchPoint.y - balloon.y, pinchPoint.x - balloon.x) * 180 / Math.PI - 90
      balloon.node.style.setProperty('--string-angle', `${angle}deg`)
    }
    let scale = 1
    if (balloon.zoomStartedAt !== null) {
      const progress = (now - balloon.zoomStartedAt) / 1_150
      if (progress >= 1) balloon.zoomStartedAt = null
      else scale = 1 + Math.sin(progress * Math.PI) * 1.05
    }
    balloon.node.style.transform = `translate3d(${balloon.x}px, ${balloon.y}px, 0) translate(-50%, -50%) scale(${scale})`
  }
  const run = (now: number) => {
    if (!open) return
    const delta = Math.min((now - lastTime) / 1000 || 0, .05)
    lastTime = now
    if (tracking) inferHands(now)
    if (now - lastSpawnAt > 720 && balloons.length < 12) { createBalloon(); lastSpawnAt = now }
    // Touching the balloon body with either index finger pops it immediately.
    for (let index = balloons.length - 1; index >= 0; index -= 1) {
      const balloon = balloons[index]
      if (indexTips.some((tip) => distance(tip, { x: balloon.x, y: balloon.y }) < balloon.radius * .78)) burst(balloon)
    }
    // A round open mouth near a balloon draws it toward the camera, then the
    // sine scale returns it to the scene without affecting its string physics.
    if (mouthPoint && mouthIsRound) {
      balloons.forEach((balloon) => {
        if (!balloon.grabbed && now >= balloon.zoomCooldownUntil && distance(mouthPoint!, { x: balloon.x, y: balloon.y }) < balloon.radius * .9) {
          balloon.zoomStartedAt = now
          balloon.zoomCooldownUntil = now + 1_500
        }
      })
    }
    let heldBalloon = balloons.find((balloon) => balloon.grabbed) ?? null
    if (pinchPoint && !heldBalloon) {
      let candidate: Balloon | null = null
      let nearest = 54
      for (const balloon of balloons) {
        if (balloon.grabbed) continue
        const distanceToString = distance(pinchPoint!, { x: balloon.x, y: balloon.y + balloon.stringLength })
        if (distanceToString < nearest) { nearest = distanceToString; candidate = balloon }
      }
      if (candidate) { candidate.grabbed = true; heldBalloon = candidate }
    }
    for (let index = balloons.length - 1; index >= 0; index -= 1) {
      const balloon = balloons[index]
      if (balloon.grabbed && !pinchPoint) balloon.grabbed = false
      if (!balloon.grabbed) balloon.node.style.setProperty('--string-angle', '0deg')
      if (balloon.grabbed && pinchPoint) {
        // Spring motion supplies weight while projection keeps the string's
        // endpoint exactly pinned to the gesture at a constant string length.
        const desired = { x: pinchPoint.x, y: pinchPoint.y - balloon.stringLength }
        balloon.vx += (desired.x - balloon.x) * 11 * delta
        balloon.vy += (desired.y - balloon.y) * 11 * delta
        balloon.vx *= .87
        balloon.vy *= .87
        balloon.x += balloon.vx * delta
        balloon.y += balloon.vy * delta
        const dx = balloon.x - pinchPoint.x
        const dy = balloon.y - pinchPoint.y
        const length = Math.max(Math.hypot(dx, dy), .001)
        balloon.x = pinchPoint.x + dx / length * balloon.stringLength
        balloon.y = pinchPoint.y + dy / length * balloon.stringLength
      } else {
        balloon.x += balloon.vx * delta
        balloon.y += balloon.vy * delta
        balloon.vx += Math.sin(now / 900 + balloon.id) * 2.2 * delta
      }
      updateBalloonNode(balloon, now)
      if (!balloon.grabbed && balloon.y < -balloon.radius - balloon.stringLength) { balloon.node.remove(); balloons.splice(index, 1) }
    }
    for (let index = fragments.length - 1; index >= 0; index -= 1) {
      const particle = fragments[index]
      particle.vy += 330 * delta
      particle.x += particle.vx * delta
      particle.y += particle.vy * delta
      particle.rotation += particle.spin * delta
      particle.life -= delta * 1.25
      particle.node.style.opacity = `${Math.max(0, particle.life)}`
      particle.node.style.transform = `translate3d(${particle.x}px, ${particle.y}px, 0) rotate(${particle.rotation}deg)`
      if (particle.life <= 0) { particle.node.remove(); if (fragmentPool.length < 96) fragmentPool.push(particle.node); fragments.splice(index, 1) }
    }
    frame = requestAnimationFrame(run)
  }
  const startCamera = async () => {
    if (tracking) return
    startButton.disabled = true
    startButton.textContent = '카메라 연결 중…'
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: false })
      video.srcObject = stream
      await video.play()
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm')
      landmarker = await HandLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task' }, runningMode: 'VIDEO', numHands: 2 })
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task' }, runningMode: 'VIDEO', numFaces: 1 })
      tracking = true
      startButton.classList.add('is-hidden')
      screen.classList.add('is-tracking')
    } catch (error) {
      console.error(error)
      startButton.disabled = false
      startButton.textContent = '카메라 다시 켜기'
    }
  }
  startButton.addEventListener('click', startCamera)
  closeButton.addEventListener('click', () => history.back())
  return {
    open: () => { open = true; screen.classList.add('is-open'); screen.setAttribute('aria-hidden', 'false'); lastTime = performance.now(); frame = requestAnimationFrame(run); closeButton.focus() },
    close: () => {
      open = false; cancelAnimationFrame(frame); screen.classList.remove('is-open', 'is-tracking'); screen.setAttribute('aria-hidden', 'true'); tracking = false
      landmarker?.close(); landmarker = null; stream?.getTracks().forEach((track) => track.stop()); stream = null; video.srcObject = null
      faceLandmarker?.close(); faceLandmarker = null
      balloons.forEach((balloon) => balloon.node.remove()); balloons.splice(0); fragments.forEach((fragment) => fragment.node.remove()); fragments.splice(0); fragmentPool.splice(0)
      indexTips = []; pinchPoint = null; mouthPoint = null; mouthIsRound = false; startButton.disabled = false; startButton.textContent = '카메라 켜기'; startButton.classList.remove('is-hidden')
    },
    isOpen: () => open,
  }
}
