import { FaceLandmarker, FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'

type Point = { x: number; y: number }
type Face = { center: Point; radius: Point; skinCenter: Point; skinRadius: Point }
type RubberPull = { anchor: Point; drag: Point; velocity: Point; amount: number; pinching: boolean; lastPinchAt: number }

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
const distance = (first: Point, second: Point) => Math.hypot(first.x - second.x, first.y - second.y)

/**
 * A camera experiment that turns a picked-up patch of face texture into a
 * rubbery, continuously curved ribbon while leaving the unpinched camera image
 * completely untouched.
 */
export const createRubberHumanExperience = () => {
  const screen = document.createElement('section')
  screen.className = 'rubber-human-screen'
  screen.setAttribute('aria-hidden', 'true')
  screen.innerHTML = `
    <video class="rubber-human-camera" autoplay muted playsinline></video>
    <canvas class="rubber-human-canvas"></canvas>
    <header class="rubber-human-header"><p>고무 인간</p><span>양손의 엄지와 검지로 얼굴을 잡고, 양쪽으로 늘려보세요</span></header>
    <p class="rubber-human-guide" aria-live="polite">핀치로 얼굴을 잡아보세요</p>
    <button class="rubber-human-start" type="button">카메라 켜기</button>
    <button class="rubber-human-close" type="button" aria-label="주사위 화면으로 돌아가기">×</button>
  `
  document.body.append(screen)

  const video = screen.querySelector<HTMLVideoElement>('.rubber-human-camera')!
  const canvas = screen.querySelector<HTMLCanvasElement>('.rubber-human-canvas')!
  const startButton = screen.querySelector<HTMLButtonElement>('.rubber-human-start')!
  const closeButton = screen.querySelector<HTMLButtonElement>('.rubber-human-close')!
  const guide = screen.querySelector<HTMLElement>('.rubber-human-guide')!
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: false })

  let stream: MediaStream | null = null
  let handLandmarker: HandLandmarker | null = null
  let faceLandmarker: FaceLandmarker | null = null
  let program: WebGLProgram | null = null
  let texture: WebGLTexture | null = null
  let outputStream: MediaStream | null = null
  let open = false
  let tracking = false
  let frame = 0
  let lastInferenceAt = 0
  let lastFaceAt = 0
  let lastVideoTime = -1
  let lastUploadedVideoTime = -1
  let lastTime = 0
  let canvasWidth = 0
  let canvasHeight = 0
  let uploadedVideoWidth = 0
  let uploadedVideoHeight = 0
  let face: Face | null = null
  const pulls = new Map<string, RubberPull>()
  let samplerUniform: WebGLUniformLocation | null = null
  let faceUniform: WebGLUniformLocation | null = null
  let skinUniform: WebGLUniformLocation | null = null
  let anchorsUniform: WebGLUniformLocation | null = null
  let dragsUniform: WebGLUniformLocation | null = null
  let amountsUniform: WebGLUniformLocation | null = null
  let viewportUniform: WebGLUniformLocation | null = null
  let videoSizeUniform: WebGLUniformLocation | null = null

  const vertexSource = `
    attribute vec2 aPosition;
    varying vec2 vUv;
    void main() { vUv = aPosition * .5 + .5; gl_Position = vec4(aPosition, 0., 1.); }
  `
  const fragmentSource = `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uCamera;
    uniform vec4 uFace;
    uniform vec4 uSkin;
    uniform vec2 uAnchors[2];
    uniform vec2 uDrags[2];
    uniform float uAmounts[2];
    uniform vec2 uViewport;
    uniform vec2 uVideoSize;

    vec2 cameraUv(vec2 point) {
      float viewportAspect = uViewport.x / max(uViewport.y, 1.);
      float videoAspect = uVideoSize.x / max(uVideoSize.y, 1.);
      vec2 scale = vec2(1.);
      if (viewportAspect > videoAspect) scale.y = videoAspect / viewportAspect;
      else scale.x = viewportAspect / videoAspect;
      vec2 source = (point - .5) * scale + .5;
      source.x = 1. - source.x;
      return clamp(source, .001, .999);
    }
    vec3 cameraAt(vec2 point) { return texture2D(uCamera, cameraUv(point)).rgb; }
    float skinMaskAt(vec2 point) {
      vec2 oval = (point - uSkin.xy) / max(uSkin.zw, vec2(.001));
      // Include cheek edges and the jaw, but independently clip the upper
      // hairline. A symmetric tiny oval made the contour capturable in JS yet
      // invisible to the shader, which is why jaw pulls appeared to fail.
      float facialArea = 1. - smoothstep(1.04, 1.42, dot(oval, oval));
      float hairlineMask = 1. - smoothstep(uSkin.y + uSkin.w * .88, uSkin.y + uSkin.w * 1.10, point.y);
      return facialArea * hairlineMask;
    }
    void main() {
      vec2 point = vUv;
      // The resting image is always the untouched live camera. This is
      // deliberately outside the pinch branch, so releasing a hand returns to
      // a real, recognisable face rather than a skin-colour blur.
      vec2 sourcePoint = point;
      // Each hand owns an independent inverse warp. Applying both mappings in
      // sequence keeps two simultaneous pulls continuous where they overlap.
      for (int hand = 0; hand < 2; hand++) {
        vec2 pull = uDrags[hand] - uAnchors[hand];
        float pullLength = length(pull);
        float amount = uAmounts[hand];
        if (amount <= .002 || pullLength <= .001) continue;
        vec2 direction = pull / pullLength;
        vec2 relative = sourcePoint - uAnchors[hand];
        float axial = dot(relative, direction);
        float along = clamp(axial / pullLength, 0., 1.);
        float perpendicular = abs(dot(relative, vec2(-direction.y, direction.x)));
        // The pull starts as a small patch, then broadens with a deliberate
        // drag. Its maximum width is the face cross-section in the pull
        // direction, matching the broad cheek-to-jaw stretch in the reference
        // without affecting the surrounding camera frame at rest.
        float crossFaceRadius = length(vec2(direction.x * uFace.w, direction.y * uFace.z));
        float width = min(crossFaceRadius * .88, max(crossFaceRadius * .42, pullLength * .58));
        width = max(width, .045);
        float sideFalloff = exp(-pow(perpendicular / width, 2.));
        float startFade = smoothstep(-width * .62, width * .08, axial);
        float endFade = 1. - smoothstep(pullLength, pullLength + width * .64, axial);
        // A controlled inverse map, rather than a copied overlay: it keeps
        // every pixel connected to its neighbour. The .84 cap avoids folds in
        // the texture coordinate field (the visual cause of a split screen).
        float longitudinal = along * (.80 + .20 * along);
        float rawField = .84 * longitudinal * sideFalloff * startFade * endFade * amount;
        // Inverse mapping carries the *actual live face texture* from the
        // caught neighbourhood toward the pinch in one continuous surface.
        vec2 tentativeSource = sourcePoint - pull * rawField;
        // Do not pull hair or the room into the rubber. The source point must
        // be inside the tracked skin oval; elsewhere the map resolves exactly
        // back to the untouched camera frame.
        float skinMask = skinMaskAt(tentativeSource);
        sourcePoint -= pull * (rawField * skinMask);
      }
      // Do not alpha-blend shifted and unshifted faces: a single final sample
      // avoids double-image ghosting while preserving the live camera texture.
      gl_FragColor = vec4(cameraAt(sourcePoint), 1.);
    }
  `

  const compile = (type: number, source: string) => {
    if (!gl) return null
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compilation failed')
    return shader
  }
  const setupRenderer = () => {
    if (!gl || program) return
    const nextProgram = gl.createProgram()!
    gl.attachShader(nextProgram, compile(gl.VERTEX_SHADER, vertexSource)!)
    gl.attachShader(nextProgram, compile(gl.FRAGMENT_SHADER, fragmentSource)!)
    gl.linkProgram(nextProgram)
    if (!gl.getProgramParameter(nextProgram, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(nextProgram) ?? 'Shader linking failed')
    program = nextProgram
    texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1)
    const buffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW)
    gl.useProgram(program)
    const position = gl.getAttribLocation(program, 'aPosition')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    samplerUniform = gl.getUniformLocation(program, 'uCamera')
    faceUniform = gl.getUniformLocation(program, 'uFace')
    skinUniform = gl.getUniformLocation(program, 'uSkin')
    anchorsUniform = gl.getUniformLocation(program, 'uAnchors[0]')
    dragsUniform = gl.getUniformLocation(program, 'uDrags[0]')
    amountsUniform = gl.getUniformLocation(program, 'uAmounts[0]')
    viewportUniform = gl.getUniformLocation(program, 'uViewport')
    videoSizeUniform = gl.getUniformLocation(program, 'uVideoSize')
    gl.uniform1i(samplerUniform, 0)
  }
  const resize = () => {
    if (!gl) return false
    const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5, Math.min(maxViewport[0], maxViewport[1]) / Math.max(window.innerWidth, window.innerHeight, 1))
    const width = Math.max(1, Math.round(window.innerWidth * ratio))
    const height = Math.max(1, Math.round(window.innerHeight * ratio))
    if (width === canvasWidth && height === canvasHeight) return false
    canvasWidth = width; canvasHeight = height; canvas.width = width; canvas.height = height
    gl.viewport(0, 0, width, height)
    return true
  }
  const pointFor = (landmark: { x: number; y: number }): Point => {
    // Match the exact `object-fit: cover` + mirrored camera mapping used in
    // cameraUv(). MediaPipe coordinates describe the uncropped source video;
    // passing them through unchanged made the pinch visibly miss the fingers
    // on portrait screens, and also inverted its vertical position in WebGL.
    const viewportAspect = Math.max(window.innerWidth, 1) / Math.max(window.innerHeight, 1)
    const videoAspect = video.videoWidth / Math.max(video.videoHeight, 1)
    let scaleX = 1
    let scaleY = 1
    if (viewportAspect > videoAspect) scaleY = videoAspect / viewportAspect
    else scaleX = viewportAspect / videoAspect
    return {
      x: .5 + (.5 - landmark.x) / scaleX,
      y: .5 + (.5 - landmark.y) / scaleY,
    }
  }
  const insideSkin = (point: Point, nextFace: Face) => {
    const x = (point.x - nextFace.skinCenter.x) / nextFace.skinRadius.x
    const y = (point.y - nextFace.skinCenter.y) / nextFace.skinRadius.y
    // Be generous at cheeks, jaw and the lateral contour, where the prior
    // tight oval dropped valid facial pinches. Keep the upper cap strict so a
    // hand near the hairline still cannot grab hair.
    const belowHairline = point.y < nextFace.skinCenter.y + nextFace.skinRadius.y * 1.08
    return belowHairline && x * x + y * y < 1.42
  }
  const inferLandmarks = (now: number) => {
    if (!handLandmarker || !faceLandmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || now - lastInferenceAt < 42 || video.currentTime === lastVideoTime) return
    lastInferenceAt = now; lastVideoTime = video.currentTime
    const faceResult = faceLandmarker.detectForVideo(video, now).faceLandmarks[0]
    if (faceResult) {
      const left = pointFor(faceResult[234]); const right = pointFor(faceResult[454])
      const forehead = pointFor(faceResult[10]); const chin = pointFor(faceResult[152])
      const faceHeight = Math.abs(forehead.y - chin.y)
      face = {
        center: { x: (left.x + right.x) / 2, y: (forehead.y + chin.y) / 2 },
        radius: { x: Math.max(.08, Math.abs(right.x - left.x) * .57), y: Math.max(.10, Math.abs(chin.y - forehead.y) * .53) },
        // In this mirrored WebGL space y decreases down the face. Shifting the
        // skin oval downward removes the hairline but preserves eyebrows,
        // cheeks, nose, mouth and jaw as valid rubber texture.
        skinCenter: { x: (left.x + right.x) / 2, y: (forehead.y + chin.y) / 2 - faceHeight * .08 },
        skinRadius: { x: Math.max(.07, Math.abs(right.x - left.x) * .52), y: Math.max(.09, faceHeight * .40) },
      }
      lastFaceAt = now
    } else if (now - lastFaceAt > 260) face = null
    const hands = handLandmarker.detectForVideo(video, now)
    const pinchingHands = new Set<string>()
    for (let handIndex = 0; handIndex < hands.landmarks.length; handIndex += 1) {
      const landmarks = hands.landmarks[handIndex]
      const thumb = pointFor(landmarks[4]); const index = pointFor(landmarks[8])
      // A fixed normalized gap only works at one camera distance. Scale the
      // pinch threshold by this hand's measured palm size instead, with a
      // wider threshold while already holding the virtual rubber (hysteresis).
      const palmSize = Math.max(distance(landmarks[0], landmarks[9]), .06)
      const handKey = hands.handedness[handIndex]?.[0]?.categoryName ?? `hand-${handIndex}`
      const existingPull = pulls.get(handKey)
      const ratio = existingPull ? .66 : .52
      const pinchThreshold = clamp(palmSize * ratio, .035, .105)
      if (distance(thumb, index) >= pinchThreshold) continue
      const pinch = { x: (thumb.x + index.x) / 2, y: (thumb.y + index.y) / 2 }
      let pull = existingPull
      // A new hand may catch only the face skin; once caught, it can pull out
      // toward either side independently of the other hand.
      if (!pull && face && insideSkin(pinch, face) && pulls.size < 2) {
        pull = { anchor: { ...pinch }, drag: { ...pinch }, velocity: { x: 0, y: 0 }, amount: 0, pinching: true, lastPinchAt: now }
        pulls.set(handKey, pull)
        guide.textContent = pulls.size === 2 ? '양쪽을 동시에 당겨보세요' : '잡았어요 — 천천히 당겨보세요'
      }
      if (!pull) continue
      const elapsed = Math.max((now - pull.lastPinchAt) / 1000, 1 / 60)
      pull.velocity = { x: clamp((pinch.x - pull.drag.x) / elapsed, -1.2, 1.2), y: clamp((pinch.y - pull.drag.y) / elapsed, -1.2, 1.2) }
      pull.drag = pinch
      pull.lastPinchAt = now
      pull.pinching = true
      pinchingHands.add(handKey)
    }
    pulls.forEach((pull, handKey) => {
      if (!pinchingHands.has(handKey)) pull.pinching = false
    })
  }
  const updateRubber = (delta: number) => {
    pulls.forEach((pull, handKey) => {
      if (!pull.pinching) {
        const dx = pull.anchor.x - pull.drag.x; const dy = pull.anchor.y - pull.drag.y
        // Critically damped-ish spring: visibly elastic without jitter at rest.
        pull.velocity.x += dx * 88 * delta; pull.velocity.y += dy * 88 * delta
        pull.velocity.x *= Math.exp(-9.5 * delta); pull.velocity.y *= Math.exp(-9.5 * delta)
        pull.drag.x += pull.velocity.x * delta; pull.drag.y += pull.velocity.y * delta
        if (Math.hypot(dx, dy) < .0015 && Math.hypot(pull.velocity.x, pull.velocity.y) < .003) {
          pulls.delete(handKey)
          if (!pulls.size) guide.textContent = '핀치로 얼굴을 잡아보세요'
          return
        }
      }
      const pullDistance = distance(pull.anchor, pull.drag)
      const targetAmount = pull.pinching ? 1 : clamp(pullDistance / .035, 0, 1)
      pull.amount += (targetAmount - pull.amount) * (1 - Math.exp(-delta * 16))
    })
  }
  const draw = (now: number) => {
    if (!open) return
    const delta = Math.min((now - lastTime) / 1000 || 0, .05); lastTime = now
    if (tracking) inferLandmarks(now)
    updateRubber(delta)
    const viewportChanged = resize()
    if (gl && program && texture && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth && video.videoHeight) {
      gl.useProgram(program); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture)
      if (video.currentTime !== lastUploadedVideoTime) { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video); lastUploadedVideoTime = video.currentTime }
      const videoChanged = uploadedVideoWidth !== video.videoWidth || uploadedVideoHeight !== video.videoHeight
      if (viewportChanged || videoChanged) { gl.uniform2f(viewportUniform, canvas.width, canvas.height); gl.uniform2f(videoSizeUniform, video.videoWidth, video.videoHeight); uploadedVideoWidth = video.videoWidth; uploadedVideoHeight = video.videoHeight }
      const currentFace = face ?? { center: { x: .5, y: .5 }, radius: { x: .001, y: .001 }, skinCenter: { x: .5, y: .5 }, skinRadius: { x: .001, y: .001 } }
      const activePulls = [...pulls.values()].slice(0, 2)
      const anchors = new Float32Array([-2, -2, -2, -2])
      const drags = new Float32Array([-2, -2, -2, -2])
      const amounts = new Float32Array([0, 0])
      activePulls.forEach((pull, index) => {
        anchors[index * 2] = pull.anchor.x; anchors[index * 2 + 1] = pull.anchor.y
        drags[index * 2] = pull.drag.x; drags[index * 2 + 1] = pull.drag.y
        amounts[index] = pull.amount
      })
      gl.uniform4f(faceUniform, currentFace.center.x, currentFace.center.y, currentFace.radius.x, currentFace.radius.y)
      gl.uniform4f(skinUniform, currentFace.skinCenter.x, currentFace.skinCenter.y, currentFace.skinRadius.x, currentFace.skinRadius.y)
      gl.uniform2fv(anchorsUniform, anchors); gl.uniform2fv(dragsUniform, drags); gl.uniform1fv(amountsUniform, amounts)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }
    frame = requestAnimationFrame(draw)
  }
  const startCamera = async () => {
    if (tracking) return
    startButton.disabled = true; startButton.textContent = '카메라 연결 중…'
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: false })
      video.srcObject = stream; await video.play(); setupRenderer()
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm')
      const options = { runningMode: 'VIDEO' as const }
      handLandmarker = await HandLandmarker.createFromOptions(vision, { ...options, baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task' }, numHands: 2 })
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, { ...options, baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task' }, numFaces: 1 })
      tracking = true; startButton.classList.add('is-hidden'); screen.classList.add('is-tracking'); guide.textContent = '핀치로 얼굴을 잡아보세요'
    } catch (error) { console.error(error); startButton.disabled = false; startButton.textContent = '카메라 다시 켜기' }
  }
  startButton.addEventListener('click', startCamera)
  closeButton.addEventListener('click', () => history.back())
  return {
    open: () => { open = true; screen.classList.add('is-open'); screen.setAttribute('aria-hidden', 'false'); lastTime = performance.now(); frame = requestAnimationFrame(draw); closeButton.focus() },
    close: () => {
      open = false; cancelAnimationFrame(frame); screen.classList.remove('is-open', 'is-tracking'); screen.setAttribute('aria-hidden', 'true'); tracking = false
      handLandmarker?.close(); handLandmarker = null; faceLandmarker?.close(); faceLandmarker = null
      stream?.getTracks().forEach((track) => track.stop()); stream = null; video.srcObject = null; outputStream?.getTracks().forEach((track) => track.stop()); outputStream = null
      lastUploadedVideoTime = -1; uploadedVideoWidth = 0; uploadedVideoHeight = 0; lastFaceAt = 0; face = null; pulls.clear()
      guide.textContent = '핀치로 얼굴을 잡아보세요'; startButton.disabled = false; startButton.textContent = '카메라 켜기'; startButton.classList.remove('is-hidden')
    },
    getRecordingStream: () => { if (!open || !canvas.captureStream) return null; outputStream ??= canvas.captureStream(30); return outputStream },
    getRecordingCanvas: () => open ? canvas : null,
  }
}
