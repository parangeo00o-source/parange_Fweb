import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

type Point = { x: number; y: number }
type Landmark = { x: number; y: number }
type GemKind = 'heart' | 'star' | 'flower' | 'diamond' | 'butterfly' | 'moon' | 'bow' | 'bear' | 'sparkle' | 'clover' | 'cloud' | 'flower-orange' | 'square' | 'raindrop' | 'cat' | 'butterfly-aqua'
type GemOption = { kind: GemKind; color: string; size: number; label: string }
type Mouth = { center: Point; xAxis: Point; yAxis: Point; width: number; height: number; sourceCenter: Point; sourceWidth: number; silhouette: Point[]; active: boolean; seenAt: number }
type PlacedGem = { option: GemOption; u: number; v: number; sizeScale: number; rotation: number; element: HTMLElement; x: number; y: number; size: number; angle: number }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y

const gems: GemOption[] = [
  { kind: 'heart', color: '#ef4f9d', size: 31, label: '핑크 하트 보석' },
  { kind: 'star', color: '#f4bd36', size: 32, label: '옐로 스타 보석' },
  { kind: 'flower', color: '#c98be5', size: 33, label: '라일락 플라워 보석' },
  { kind: 'diamond', color: '#9ee9ee', size: 31, label: '아쿠아 다이아 보석' },
  { kind: 'butterfly', color: '#ff8d76', size: 35, label: '코랄 나비 보석' },
  { kind: 'moon', color: '#6ca5ec', size: 31, label: '블루 문 보석' },
  { kind: 'bow', color: '#f082ba', size: 35, label: '리본 보석' },
  { kind: 'bear', color: '#9aa8f5', size: 31, label: '베어 보석' },
  { kind: 'sparkle', color: '#e33fca', size: 32, label: '퍼플 스파클 보석' },
  { kind: 'clover', color: '#83d4be', size: 32, label: '민트 클로버 보석' },
  { kind: 'cloud', color: '#80e0e2', size: 35, label: '아쿠아 구름 보석' },
  { kind: 'flower-orange', color: '#ff9c4d', size: 33, label: '오렌지 플라워 보석' },
  { kind: 'square', color: '#70c993', size: 31, label: '에메랄드 네모 보석' },
  { kind: 'raindrop', color: '#527ee9', size: 32, label: '사파이어 빗방울 보석' },
  { kind: 'cat', color: '#d5b8f0', size: 33, label: '라일락 고양이 보석' },
  { kind: 'butterfly-aqua', color: '#63dbe9', size: 34, label: '아쿠아 나비 보석' },
]

const gemShape = (kind: GemKind) => {
  if (kind === 'heart') return '<path class="gem-body" d="M32 56 9 34C-2 22 5 5 20 7c6 1 10 6 12 10 3-5 7-9 13-10 15-2 22 15 10 27L32 56Z"/><path class="gem-facet" d="m13 18 19 27 19-27-19 7-19-7Z"/>'
  if (kind === 'star') return '<path class="gem-body" d="m32 3 7 19 20 1-16 12 6 20-17-11-17 11 6-20L5 23l20-1L32 3Z"/><path class="gem-facet" d="m32 12 7 18-7 10-7-10 7-18Zm0 28 10-7-4 13-6 5-6-5-4-13 10 7Z"/>'
  if (kind === 'flower') return '<g class="gem-body"><ellipse cx="32" cy="15" rx="11" ry="14"/><ellipse cx="48" cy="26" rx="11" ry="14" transform="rotate(72 48 26)"/><ellipse cx="42" cy="45" rx="11" ry="14" transform="rotate(144 42 45)"/><ellipse cx="22" cy="45" rx="11" ry="14" transform="rotate(216 22 45)"/><ellipse cx="16" cy="26" rx="11" ry="14" transform="rotate(288 16 26)"/></g><circle class="gem-core" cx="32" cy="32" r="9"/>'
  if (kind === 'diamond') return '<path class="gem-body" d="m11 23 10-13h22l10 13-21 32L11 23Z"/><path class="gem-facet" d="m11 23 21 32 21-32-11 7H22l-11-7Zm10-13 11 20L43 10 32 16 21 10Z"/>'
  if (kind === 'butterfly') return '<g class="gem-body"><path d="M30 30C17 3 4 11 8 26c3 12 13 14 22 8Z"/><path d="M34 30C47 3 60 11 56 26c-3 12-13 14-22 8Z"/><path d="M30 34C15 32 12 49 24 54c8 3 10-7 10-15Z"/><path d="M34 34c15-2 18 15 6 20-8 3-10-7-10-15Z"/></g><path class="gem-dark" d="M32 24c5 8 5 14 0 22-5-8-5-14 0-22Z"/>'
  if (kind === 'moon') return '<path class="gem-body" d="M48 7C29 10 21 30 31 43c6 8 17 10 26 4-10 13-30 13-41 0C3 32 12 8 31 6c6-1 12 0 17 1Z"/><path class="gem-facet" d="M43 13c-11 9-11 23-2 31-16-5-20-24-7-34 3-2 6-3 9-3Z"/>'
  if (kind === 'bow') return '<g class="gem-body"><path d="M29 30C15 9 3 15 6 29c2 11 12 13 23 7Z"/><path d="M35 30c14-21 26-15 23-1-2 11-12 13-23 7Z"/></g><path class="gem-core" d="M25 25h14l3 7-3 7H25l-3-7 3-7Z"/><path class="gem-facet" d="m9 22 18 12-15 1-3-13Zm46 0-18 12 15 1 3-13Z"/>'
  if (kind === 'bear') return '<g class="gem-body"><circle cx="18" cy="17" r="9"/><circle cx="46" cy="17" r="9"/><circle cx="32" cy="28" r="19"/><ellipse cx="32" cy="47" rx="15" ry="11"/></g><ellipse class="gem-core" cx="32" cy="33" rx="7" ry="5"/><circle class="gem-dark" cx="25" cy="27" r="2"/><circle class="gem-dark" cx="39" cy="27" r="2"/>'
  if (kind === 'sparkle') return '<path class="gem-body" d="M32 2 39 24 61 32 39 40 32 62 25 40 3 32 25 24 32 2Z"/><path class="gem-facet" d="m32 10 7 22-7 9-7-9 7-22Zm0 31 13-9-8 8-5 14-5-14-8-8 13 9Z"/>'
  return '<g class="gem-body"><ellipse cx="23" cy="22" rx="10" ry="13" transform="rotate(-45 23 22)"/><ellipse cx="41" cy="22" rx="10" ry="13" transform="rotate(45 41 22)"/><ellipse cx="23" cy="42" rx="10" ry="13" transform="rotate(45 23 42)"/><ellipse cx="41" cy="42" rx="10" ry="13" transform="rotate(-45 41 42)"/></g><circle class="gem-core" cx="32" cy="32" r="7"/>'
}

const gemMarkup = (option: GemOption) => {
  // The original ten gems use the supplied sprite sheet. The six additions
  // have matching, alpha-backed cut-gem assets of their own.
  void gemShape(option.kind)
  const index = gems.indexOf(option)
  if (index < 10) return `<span class="gem-sprite" aria-hidden="true" style="--gem-column:${index % 5};--gem-row:${Math.floor(index / 5)}"></span>`
  const files: Partial<Record<GemKind, string>> = {
    cloud: 'cloud',
    'flower-orange': 'flower-orange',
    square: 'square',
    raindrop: 'raindrop',
    cat: 'cat',
    'butterfly-aqua': 'butterfly-aqua',
  }
  const file = files[option.kind]
  if (file) return `<img class="gem-image gem-image--${file}" src="/tooth-gem-extra/${file}.png" alt="" draggable="false">`
  const id = `extra-gem-${index}`
  const shapes: Record<string, string> = {
    cloud: '<path class="extra-gem-body" d="M11 48c-8 0-11-10-4-15 0-11 14-16 21-7 8-10 24-5 23 7 10 4 7 15-2 15H11Z"/><path class="extra-gem-facet" d="M11 36c8-7 13 1 17-6 6 5 13-1 22 6l-9 8H18l-7-8Z"/>',
    'flower-orange': '<g class="extra-gem-body"><ellipse cx="32" cy="16" rx="10" ry="14"/><ellipse cx="47" cy="27" rx="10" ry="14" transform="rotate(72 47 27)"/><ellipse cx="42" cy="45" rx="10" ry="14" transform="rotate(144 42 45)"/><ellipse cx="22" cy="45" rx="10" ry="14" transform="rotate(216 22 45)"/><ellipse cx="17" cy="27" rx="10" ry="14" transform="rotate(288 17 27)"/></g><circle class="extra-gem-core" cx="32" cy="32" r="9"/><path class="extra-gem-facet" d="m32 12 5 17-5 5-5-5 5-17Z"/>',
    square: '<path class="extra-gem-body" d="m17 7h30l10 10v30L47 57H17L7 47V17L17 7Z"/><path class="extra-gem-facet" d="m17 7 8 12h14l8-12-6 18H23L17 7Zm-10 10 16 8v16L7 47V17Zm50 0-16 8v16l16 6V17ZM17 57l6-16h18l6 16H17Z"/>',
    raindrop: '<path class="extra-gem-body" d="M32 4C24 17 12 29 12 42a20 20 0 0 0 40 0C52 29 40 17 32 4Z"/><path class="extra-gem-facet" d="M31 12c-7 12-13 20-11 30 2 9 10 13 16 10-10-10-8-25-5-40Z"/>',
    cat: '<path class="extra-gem-body" d="m12 23 1-15 13 8c4-2 9-2 13 0l13-8 1 15c7 17-5 34-21 34S5 40 12 23Z"/><path class="extra-gem-facet" d="m13 12 11 9-10 7-1-16Zm38 0-11 9 10 7 1-16ZM17 37l15 13 15-13-7 3H24l-7-3Z"/><circle class="extra-gem-core" cx="24" cy="31" r="3"/><circle class="extra-gem-core" cx="40" cy="31" r="3"/><path class="extra-gem-dark" d="m29 39 3-3 3 3-3 3-3-3Z"/>',
    'butterfly-aqua': '<g class="extra-gem-body"><path d="M30 31C15 4 4 12 8 28c3 12 13 14 22 8Z"/><path d="M34 31C49 4 60 12 56 28c-3 12-13 14-22 8Z"/><path d="M30 35C13 35 13 53 26 56c7 1 8-10 8-21Z"/><path d="M34 35c17 0 17 18 4 21-7 1-8-10-8-21Z"/></g><path class="extra-gem-dark" d="M32 23c5 9 5 17 0 26-5-9-5-17 0-26Z"/><path class="extra-gem-facet" d="m10 21 17 10-12 2-5-12Zm44 0-17 10 12 2 5-12Z"/>',
  }
  return `<svg class="extra-gem" viewBox="0 0 64 64" aria-hidden="true" style="--gem:${option.color};--extra-gem-id:${id}">${shapes[option.kind] ?? ''}<path class="extra-gem-shine" d="M18 18c5-5 11-7 17-4"/></svg>`
}

/** A face-following tooth-jewel dressing room. The magnified mouth is a live
 * camera crop, and placed gems live in the mouth's rotated local coordinates. */
export const createToothGemExperience = () => {
  const screen = document.createElement('section')
  screen.className = 'tooth-gem-screen'
  screen.setAttribute('aria-hidden', 'true')
  screen.innerHTML = `
    <video class="tooth-gem-camera" autoplay muted playsinline></video>
    <canvas class="tooth-gem-canvas"></canvas>
    <div class="tooth-gem-placed">
      <div class="tooth-gem-transform" aria-hidden="true">${Array.from({ length: 8 }, (_, index) => `<i data-handle="${index}"></i>`).join('')}</div>
    </div>
    <aside class="tooth-gem-tray" aria-label="치아 보석 파츠">
      <header class="tooth-gem-tray-head">
        <div class="tooth-gem-tabs" role="tablist" aria-label="보석 종류">
          <button class="tooth-gem-tab is-active" type="button" data-filter="all" role="tab" aria-selected="true" aria-label="모든 보석">✦</button>
          <button class="tooth-gem-tab" type="button" data-filter="cut" role="tab" aria-selected="false" aria-label="컷팅 보석">◇</button>
          <button class="tooth-gem-tab" type="button" data-filter="charm" role="tab" aria-selected="false" aria-label="참 보석">♧</button>
        </div>
      </header>
      <button class="tooth-gem-clear" type="button" aria-label="붙인 보석 모두 지우기">↶</button>
      <div class="tooth-gem-parts">${gems.map((gem, index) => `<button class="tooth-gem-part" type="button" data-gem="${index}" data-category="${['flower', 'butterfly', 'bow', 'bear', 'clover'].includes(gem.kind) ? 'charm' : 'cut'}" aria-label="${gem.label}">${gemMarkup(gem)}</button>`).join('')}</div>
    </aside>
    <button class="tooth-gem-start" type="button" aria-label="카메라 켜기"><span></span></button>
    <button class="tooth-gem-close" type="button" aria-label="주사위 화면으로 돌아가기">×</button>
  `
  document.body.append(screen)

  const video = screen.querySelector<HTMLVideoElement>('.tooth-gem-camera')!
  const canvas = screen.querySelector<HTMLCanvasElement>('.tooth-gem-canvas')!
  const context = canvas.getContext('2d', { alpha: true })!
  const placedLayer = screen.querySelector<HTMLElement>('.tooth-gem-placed')!
  const transformGuide = screen.querySelector<HTMLElement>('.tooth-gem-transform')!
  const startButton = screen.querySelector<HTMLButtonElement>('.tooth-gem-start')!
  const closeButton = screen.querySelector<HTMLButtonElement>('.tooth-gem-close')!
  const clearButton = screen.querySelector<HTMLButtonElement>('.tooth-gem-clear')!
  const parts = [...screen.querySelectorAll<HTMLButtonElement>('.tooth-gem-part')]
  const tabs = [...screen.querySelectorAll<HTMLButtonElement>('.tooth-gem-tab')]
  let stream: MediaStream | null = null
  let outputStream: MediaStream | null = null
  let faceLandmarker: FaceLandmarker | null = null
  let open = false
  let tracking = false
  let frame = 0
  let lastFaceAt = 0
  let lastVideoTime = -1
  let lastMouthActiveAt = 0
  let mouth: Mouth | null = null
  let placed: PlacedGem[] = []
  let selectedGem: PlacedGem | null = null
  let activeDrag: { pointerId: number; option: GemOption; preview: HTMLElement; source: HTMLElement } | null = null
  let activeResize: { pointerId: number; gem: PlacedGem; startDistance: number; startScale: number } | null = null
  let activeRotation: { pointerId: number; gem: PlacedGem; startAngle: number; startRotation: number } | null = null
  let movingGem: { pointerId: number; gem: PlacedGem; last: Point; moved: boolean } | null = null
  let ignoreGemClick: PlacedGem | null = null

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
  const pointAt = (landmarks: Landmark[], index: number) => screenPoint(landmarks[index] ?? landmarks[0])
  // MediaPipe's outer-lip loop lets the enlarged live crop retain the actual
  // mouth silhouette instead of reading as a generic circular magnifier.
  const outerLipIndices = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]

  const updateMouth = (now: number) => {
    if (!faceLandmarker || now - lastFaceAt < 62 || video.currentTime === lastVideoTime) return
    lastFaceAt = now
    lastVideoTime = video.currentTime
    const result = faceLandmarker.detectForVideo(video, now)
    const landmarks = result.faceLandmarks[0]
    if (!landmarks) { if (mouth && now - mouth.seenAt > 420) mouth = null; return }
    const left = pointAt(landmarks, 61)
    const right = pointAt(landmarks, 291)
    const upper = pointAt(landmarks, 13)
    const lower = pointAt(landmarks, 14)
    const cheekLeft = pointAt(landmarks, 234)
    const cheekRight = pointAt(landmarks, 454)
    const center = { x: (left.x + right.x + upper.x + lower.x) / 4, y: (left.y + right.y + upper.y + lower.y) / 4 }
    const xVector = { x: right.x - left.x, y: right.y - left.y }
    const width = Math.max(distance(left, right), 1)
    const xAxis = { x: xVector.x / width, y: xVector.y / width }
    const yAxis = { x: -xAxis.y, y: xAxis.x }
    const down = { x: lower.x - upper.x, y: lower.y - upper.y }
    if (dot(down, yAxis) < 0) { yAxis.x *= -1; yAxis.y *= -1 }
    const height = Math.max(Math.abs(dot(down, yAxis)), 1)
    const faceWidth = Math.max(distance(cheekLeft, cheekRight), 1)
    const categories = result.faceBlendshapes?.[0]?.categories ?? []
    const score = (name: string) => categories.find((item) => item.categoryName === name)?.score ?? 0
    const smile = Math.max(score('mouthSmileLeft'), score('mouthSmileRight'))
    const jawOpen = score('jawOpen')
    // Combine geometry with the model's expression score. This avoids missing
    // a toothy but shallow smile, while the measured lip opening prevents a
    // closed-lip blendshape from triggering the crop. A short grace period
    // hides one-frame landmark losses without latching permanently.
    const candidateActive = (smile > .18 && (height / width > .047 || jawOpen > .045)) || (height / width > .105 && width / faceWidth > .35)
    if (candidateActive) lastMouthActiveAt = now
    const active = candidateActive || now - lastMouthActiveAt < 190
    const rawLeft = landmarks[61] ?? landmarks[0]
    const rawRight = landmarks[291] ?? landmarks[0]
    const rawUpper = landmarks[13] ?? landmarks[0]
    const rawLower = landmarks[14] ?? landmarks[0]
    const sourceWidth = Math.max(Math.hypot(rawRight.x - rawLeft.x, rawRight.y - rawLeft.y), .001)
    // The source crop must use the same four-point centre as the on-screen
    // contour. Using corner-only y previously displaced the video below its
    // landmark mask whenever the mouth opened.
    mouth = { center, xAxis, yAxis, width, height, sourceCenter: { x: (rawLeft.x + rawRight.x + rawUpper.x + rawLower.x) / 4, y: (rawLeft.y + rawRight.y + rawUpper.y + rawLower.y) / 4 }, sourceWidth, silhouette: outerLipIndices.map((index) => pointAt(landmarks, index)), active, seenAt: now }
  }

  const mouthBox = (current: Mouth) => ({ width: clamp(current.width * 4.15, 270, 700), height: clamp(current.width * (.76 / 1.24) * 4.15, 166, 430) })
  const cropFactor = 1.24
  const magnifiedContour = (current: Mouth) => {
    const zoom = mouthBox(current).width / Math.max(current.width * cropFactor, 1)
    return current.silhouette.map((point) => ({ x: current.center.x + (point.x - current.center.x) * zoom * 1.14, y: current.center.y + (point.y - current.center.y) * zoom * 1.14 }))
  }
  const traceContour = (points: Point[]) => {
    if (!points.length) return
    const firstMidpoint = { x: (points[0].x + points[points.length - 1].x) / 2, y: (points[0].y + points[points.length - 1].y) / 2 }
    context.moveTo(firstMidpoint.x, firstMidpoint.y)
    points.forEach((point, index) => {
      const next = points[(index + 1) % points.length]
      context.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2)
    })
    context.closePath()
  }
  const containsPoint = (point: Point, polygon: Point[]) => polygon.reduce((inside, vertex, index) => {
    const previous = polygon[(index + polygon.length - 1) % polygon.length]
    const crossing = (vertex.y > point.y) !== (previous.y > point.y) && point.x < (previous.x - vertex.x) * (point.y - vertex.y) / (previous.y - vertex.y) + vertex.x
    return crossing ? !inside : inside
  }, false)
  const drawMagnifiedMouth = (current: Mouth) => {
    if (!current.active || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
    const fit = cover()
    const box = mouthBox(current)
    const cropWidth = current.sourceWidth * cropFactor * fit.sourceWidth
    const cropHeight = current.sourceWidth * .76 * fit.sourceWidth
    const cropX = clamp(current.sourceCenter.x * fit.sourceWidth - cropWidth / 2, 0, Math.max(0, fit.sourceWidth - cropWidth))
    const cropY = clamp(current.sourceCenter.y * fit.sourceHeight - cropHeight / 2, 0, Math.max(0, fit.sourceHeight - cropHeight))
    context.save()
    context.beginPath(); traceContour(magnifiedContour(current)); context.clip()
    context.translate(fit.width, 0); context.scale(-1, 1)
    context.drawImage(video, cropX, cropY, cropWidth, cropHeight, fit.width - current.center.x - box.width / 2, current.center.y - box.height / 2, box.width, box.height)
    context.restore()
  }

  const updatePlacedGems = () => {
    const current = mouth && performance.now() - mouth.seenAt < 480 ? mouth : null
    if (!current || !current.active) { placedLayer.classList.remove('is-visible'); transformGuide.classList.remove('is-visible'); return }
    const box = mouthBox(current)
    // The mirrored camera makes the semantic right-to-left mouth axis point
    // 180° away from the screen's upright axis. Keep that axis for spatial
    // attachment math, but normalize the visual angle so new charms never
    // arrive upside down.
    let angle = Math.atan2(current.xAxis.y, current.xAxis.x) * 180 / Math.PI
    if (angle > 90) angle -= 180
    else if (angle < -90) angle += 180
    placedLayer.classList.add('is-visible')
    placed.forEach((gem) => {
      const x = current.center.x + current.xAxis.x * gem.u * box.width / 2 + current.yAxis.x * gem.v * box.height / 2
      const y = current.center.y + current.xAxis.y * gem.u * box.width / 2 + current.yAxis.y * gem.v * box.height / 2
      const size = gem.option.size * clamp(box.width / 235, .82, 1.34) * gem.sizeScale
      gem.x = x; gem.y = y; gem.size = size; gem.angle = angle
      gem.element.style.width = `${size}px`; gem.element.style.height = `${size}px`
      gem.element.style.transform = `translate(${x - size / 2}px, ${y - size / 2}px) rotate(${angle + gem.rotation}deg)`
    })
    if (!selectedGem || !placed.includes(selectedGem)) { transformGuide.classList.remove('is-visible'); return }
    const gem = selectedGem
    transformGuide.style.width = `${gem.size}px`; transformGuide.style.height = `${gem.size}px`
    transformGuide.style.transform = `translate(${gem.x - gem.size / 2}px, ${gem.y - gem.size / 2}px) rotate(${gem.angle + gem.rotation}deg)`
    transformGuide.classList.add('is-visible')
  }

  const draw = (now: number) => {
    if (!open) return
    const fit = cover()
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
    const width = Math.round(fit.width * ratio); const height = Math.round(fit.height * ratio)
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height }
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    // Leave the connecting state transparent instead of showing a coloured
    // placeholder. The live frame fills the canvas as soon as it is ready.
    context.clearRect(0, 0, fit.width, fit.height)
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      context.save(); context.translate(fit.width, 0); context.scale(-1, 1)
      context.drawImage(video, fit.offsetX, fit.offsetY, video.videoWidth * fit.scale, video.videoHeight * fit.scale); context.restore()
      if (tracking) updateMouth(now)
    }
    const current = mouth && now - mouth.seenAt < 480 ? mouth : null
    if (current?.active) { drawMagnifiedMouth(current); screen.classList.add('is-smiling') }
    else screen.classList.remove('is-smiling')
    updatePlacedGems()
    frame = requestAnimationFrame(draw)
  }

  const addGemAt = (option: GemOption, clientX: number, clientY: number) => {
    const current = mouth && performance.now() - mouth.seenAt < 480 && mouth.active ? mouth : null
    if (!current) return
    const rect = screen.getBoundingClientRect()
    const local = { x: clientX - rect.left - current.center.x, y: clientY - rect.top - current.center.y }
    const box = mouthBox(current)
    const u = dot(local, current.xAxis) / (box.width / 2)
    const v = dot(local, current.yAxis) / (box.height / 2)
    // Only accept drops inside the enlarged lip cutout, not in the old
    // magnifier's rectangular/circular bounds.
    if (!containsPoint({ x: clientX - rect.left, y: clientY - rect.top }, magnifiedContour(current))) return
    const element = document.createElement('div')
    element.className = 'tooth-gem-attached'
    element.innerHTML = gemMarkup(option)
    placedLayer.append(element)
    const gem: PlacedGem = { option, u, v, sizeScale: 1, rotation: 0, element, x: 0, y: 0, size: option.size, angle: 0 }
    element.addEventListener('pointerdown', (event) => {
      if (activeDrag || activeResize) return
      event.stopPropagation()
      movingGem = { pointerId: event.pointerId, gem, last: { x: event.clientX, y: event.clientY }, moved: false }
      try { element.setPointerCapture(event.pointerId) } catch { /* Window tracking below remains active. */ }
    })
    element.addEventListener('click', (event) => {
      event.stopPropagation()
      if (ignoreGemClick === gem) { ignoreGemClick = null; return }
      selectedGem = selectedGem === gem ? null : gem
      transformGuide.classList.toggle('is-visible', selectedGem === gem)
    })
    placed.push(gem)
  }

  const beginDrag = (event: PointerEvent, option: GemOption) => {
    event.preventDefault()
    if (activeDrag) return
    const preview = document.createElement('div')
    preview.className = 'tooth-gem-drag-preview is-visible'; preview.innerHTML = gemMarkup(option); screen.append(preview)
    const source = event.currentTarget as HTMLElement
    source.classList.add('is-dragging')
    activeDrag = { pointerId: event.pointerId, option, preview, source }
    const move = (x: number, y: number) => { preview.style.transform = `translate3d(${x + 12}px, ${y - 58}px, 0) rotate(-8deg) scale(1.08)` }
    move(event.clientX, event.clientY)
    try { (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId) } catch { /* Window handlers cover this path. */ }
  }
  window.addEventListener('pointermove', (event) => {
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return
    activeDrag.preview.style.transform = `translate3d(${event.clientX + 12}px, ${event.clientY - 58}px, 0) rotate(-8deg) scale(1.08)`
  }, { passive: true })
  const endDrag = (event: PointerEvent) => {
    if (!activeDrag || activeDrag.pointerId !== event.pointerId) return
    const drag = activeDrag; activeDrag = null; drag.source.classList.remove('is-dragging'); drag.preview.remove(); addGemAt(drag.option, event.clientX, event.clientY)
  }
  window.addEventListener('pointerup', endDrag, { passive: true })
  window.addEventListener('pointercancel', endDrag, { passive: true })
  window.addEventListener('pointermove', (event) => {
    if (!movingGem || movingGem.pointerId !== event.pointerId) return
    const current = mouth && performance.now() - mouth.seenAt < 480 && mouth.active ? mouth : null
    if (!current) return
    const change = { x: event.clientX - movingGem.last.x, y: event.clientY - movingGem.last.y }
    if (Math.hypot(change.x, change.y) > .5) movingGem.moved = true
    movingGem.last = { x: event.clientX, y: event.clientY }
    const box = mouthBox(current)
    const nextU = movingGem.gem.u + dot(change, current.xAxis) / (box.width / 2)
    const nextV = movingGem.gem.v + dot(change, current.yAxis) / (box.height / 2)
    const candidate = {
      x: current.center.x + current.xAxis.x * nextU * box.width / 2 + current.yAxis.x * nextV * box.height / 2,
      y: current.center.y + current.xAxis.y * nextU * box.width / 2 + current.yAxis.y * nextV * box.height / 2,
    }
    if (!containsPoint(candidate, magnifiedContour(current))) return
    movingGem.gem.u = nextU; movingGem.gem.v = nextV
  }, { passive: true })
  const endGemMove = (event: PointerEvent) => {
    if (!movingGem || movingGem.pointerId !== event.pointerId) return
    const move = movingGem; movingGem = null
    if (move.gem.element.hasPointerCapture(event.pointerId)) move.gem.element.releasePointerCapture(event.pointerId)
    if (move.moved) ignoreGemClick = move.gem
  }
  window.addEventListener('pointerup', endGemMove, { passive: true })
  window.addEventListener('pointercancel', endGemMove, { passive: true })
  transformGuide.addEventListener('pointerdown', (event) => {
    if (!selectedGem || !(event.target instanceof HTMLElement) || !event.target.matches('[data-handle]')) return
    event.preventDefault(); event.stopPropagation()
    const bounds = screen.getBoundingClientRect()
    const center = { x: bounds.left + selectedGem.x, y: bounds.top + selectedGem.y }
    const handle = Number(event.target.dataset.handle)
    // The four corners are rotation grips; the middle handles retain their
    // familiar resize action, so both transforms remain directly discoverable.
    if ([0, 2, 4, 6].includes(handle)) {
      activeRotation = { pointerId: event.pointerId, gem: selectedGem, startAngle: Math.atan2(event.clientY - center.y, event.clientX - center.x), startRotation: selectedGem.rotation }
      try { transformGuide.setPointerCapture(event.pointerId) } catch { /* Window tracking below remains active. */ }
      return
    }
    activeResize = { pointerId: event.pointerId, gem: selectedGem, startDistance: Math.max(distance({ x: event.clientX, y: event.clientY }, center), 8), startScale: selectedGem.sizeScale }
    try { transformGuide.setPointerCapture(event.pointerId) } catch { /* Window tracking below remains active. */ }
  })
  window.addEventListener('pointermove', (event) => {
    if (!activeResize || activeResize.pointerId !== event.pointerId) return
    const bounds = screen.getBoundingClientRect()
    const center = { x: bounds.left + activeResize.gem.x, y: bounds.top + activeResize.gem.y }
    activeResize.gem.sizeScale = clamp(activeResize.startScale * distance({ x: event.clientX, y: event.clientY }, center) / activeResize.startDistance, .42, 3.6)
  }, { passive: true })
  window.addEventListener('pointermove', (event) => {
    if (!activeRotation || activeRotation.pointerId !== event.pointerId) return
    const bounds = screen.getBoundingClientRect()
    const center = { x: bounds.left + activeRotation.gem.x, y: bounds.top + activeRotation.gem.y }
    const angle = Math.atan2(event.clientY - center.y, event.clientX - center.x)
    activeRotation.gem.rotation = activeRotation.startRotation + (angle - activeRotation.startAngle) * 180 / Math.PI
  }, { passive: true })
  const endResize = (event: PointerEvent) => {
    if (!activeResize || activeResize.pointerId !== event.pointerId) return
    if (transformGuide.hasPointerCapture(event.pointerId)) transformGuide.releasePointerCapture(event.pointerId)
    activeResize = null
  }
  window.addEventListener('pointerup', endResize, { passive: true })
  window.addEventListener('pointercancel', endResize, { passive: true })
  const endRotation = (event: PointerEvent) => {
    if (!activeRotation || activeRotation.pointerId !== event.pointerId) return
    if (transformGuide.hasPointerCapture(event.pointerId)) transformGuide.releasePointerCapture(event.pointerId)
    activeRotation = null
  }
  window.addEventListener('pointerup', endRotation, { passive: true })
  window.addEventListener('pointercancel', endRotation, { passive: true })
  parts.forEach((part) => part.addEventListener('pointerdown', (event) => beginDrag(event, gems[Number(part.dataset.gem)]!)))
  tabs.forEach((tab) => tab.addEventListener('click', () => {
    const filter = tab.dataset.filter ?? 'all'
    tabs.forEach((item) => { const active = item === tab; item.classList.toggle('is-active', active); item.setAttribute('aria-selected', String(active)) })
    parts.forEach((part) => part.classList.toggle('is-filtered-out', filter !== 'all' && part.dataset.category !== filter))
  }))
  clearButton.addEventListener('click', () => { placed.forEach((gem) => gem.element.remove()); placed = []; selectedGem = null; transformGuide.classList.remove('is-visible') })
  closeButton.addEventListener('click', () => history.back())

  const startCamera = async () => {
    if (tracking) return
    startButton.disabled = true
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: false })
      video.srcObject = stream; await video.play()
      // Do not reveal the editor over the home page while a camera stream is
      // still negotiating. Its controls become visible with the first usable
      // webcam frame instead.
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        await new Promise<void>((resolve) => video.addEventListener('loadeddata', () => resolve(), { once: true }))
      }
      if (!open) return
      screen.classList.add('is-camera-ready')
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm')
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task' },
        runningMode: 'VIDEO', numFaces: 1, outputFaceBlendshapes: true,
      })
      tracking = true; startButton.classList.add('is-hidden'); screen.classList.add('is-tracking')
    } catch (error) {
      console.error('Tooth Gem camera:', error)
      stream?.getTracks().forEach((track) => track.stop()); stream = null; video.srcObject = null
      faceLandmarker?.close(); faceLandmarker = null; screen.classList.remove('is-camera-ready'); startButton.disabled = false; startButton.classList.remove('is-hidden')
    }
  }
  startButton.addEventListener('click', () => { void startCamera() })

  return {
    open: () => {
      open = true
      screen.classList.add('is-open')
      screen.setAttribute('aria-hidden', 'false')
      // The upper A entry opens straight into its live camera experience; the
      // central control is retained only if a permission or connection retry is needed.
      startButton.disabled = true
      startButton.classList.add('is-hidden')
      frame = requestAnimationFrame(draw)
      void startCamera()
      closeButton.focus()
    },
    close: () => {
      open = false; cancelAnimationFrame(frame); screen.classList.remove('is-open', 'is-smiling', 'is-tracking', 'is-camera-ready'); screen.setAttribute('aria-hidden', 'true')
      tracking = false; faceLandmarker?.close(); faceLandmarker = null
      stream?.getTracks().forEach((track) => track.stop()); stream = null; video.srcObject = null
      outputStream?.getTracks().forEach((track) => track.stop()); outputStream = null
      activeDrag?.preview.remove(); activeDrag?.source.classList.remove('is-dragging'); activeDrag = null; activeResize = null; activeRotation = null; movingGem = null; ignoreGemClick = null; selectedGem = null; transformGuide.classList.remove('is-visible'); placed.forEach((gem) => gem.element.remove()); placed = []; mouth = null; lastFaceAt = 0; lastVideoTime = -1; lastMouthActiveAt = 0
      startButton.disabled = false; startButton.classList.remove('is-hidden')
    },
    getRecordingStream: () => { if (!open || !canvas.captureStream) return null; outputStream ??= canvas.captureStream(30); return outputStream },
    getRecordingCanvas: () => open ? canvas : null,
  }
}
