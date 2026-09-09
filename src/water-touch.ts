import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'

const fingertipIndices = [4, 8, 12, 16, 20]
const maxTouches = 10
const maxRipples = 20
type Ripple = { x: number; y: number; startedAt: number; strength: number }

export const createWaterTouchExperience = () => {
  const screen = document.createElement('section')
  screen.className = 'water-touch-screen'
  screen.setAttribute('aria-hidden', 'true')
  screen.innerHTML = `
    <video class="water-touch-camera" autoplay muted playsinline></video>
    <canvas class="water-touch-canvas"></canvas>
    <header class="water-touch-header"><p>WaterTouch</p><span>양손의 손끝으로 수면을 만져보세요</span></header>
    <button class="water-touch-start" type="button">카메라 켜기</button>
    <button class="water-touch-close" type="button" aria-label="주사위 화면으로 돌아가기">×</button>
  `
  document.body.append(screen)

  const video = screen.querySelector<HTMLVideoElement>('.water-touch-camera')!
  const canvas = screen.querySelector<HTMLCanvasElement>('.water-touch-canvas')!
  const startButton = screen.querySelector<HTMLButtonElement>('.water-touch-start')!
  const closeButton = screen.querySelector<HTMLButtonElement>('.water-touch-close')!
  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: false })
  let stream: MediaStream | null = null
  let handLandmarker: HandLandmarker | null = null
  let open = false
  let tracking = false
  let frame = 0
  let lastInferenceAt = 0
  let lastVideoTime = -1
  let lastUploadedVideoTime = -1
  let uploadedVideoWidth = 0
  let uploadedVideoHeight = 0
  let canvasWidth = 0
  let canvasHeight = 0
  let shaderProgram: WebGLProgram | null = null
  let texture: WebGLTexture | null = null
  let outputStream: MediaStream | null = null
  let touchUniform: WebGLUniformLocation | null = null
  let touchStrengthUniform: WebGLUniformLocation | null = null
  let rippleUniform: WebGLUniformLocation | null = null
  let timeUniform: WebGLUniformLocation | null = null
  let samplerUniform: WebGLUniformLocation | null = null
  let viewportUniform: WebGLUniformLocation | null = null
  let videoSizeUniform: WebGLUniformLocation | null = null
  const touches = new Float32Array(maxTouches * 4)
  const touchStrengths = new Float32Array(maxTouches)
  const rippleData = new Float32Array(maxRipples * 4)
  const ripples: Ripple[] = []
  const previousTips = new Map<string, { x: number; y: number; at: number }>()
  const lastRippleAt = new Map<string, number>()
  let touchesDirty = true
  let ripplesDirty = true

  const vertexSource = `
    attribute vec2 aPosition;
    varying vec2 vUv;
    void main() { vUv = aPosition * .5 + .5; gl_Position = vec4(aPosition, 0., 1.); }
  `
  const fragmentSource = `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uCamera;
    uniform float uTime;
    uniform vec2 uViewport;
    uniform vec2 uVideoSize;
    uniform vec4 uTouches[10];
    uniform float uTouchStrengths[10];
    uniform vec4 uRipples[20];
    void main() {
      vec2 uv = vUv;
      float aspect = uViewport.x / max(uViewport.y, 1.);
      vec2 displacement = vec2(0.);
      for (int i = 0; i < 10; i++) {
        vec4 touch = uTouches[i];
        float touchStrength = uTouchStrengths[i];
        if (touch.y < -1. || touchStrength <= 0.) continue;
        vec2 delta = uv - touch.xy;
        delta.x *= aspect;
        float rangeScale = mix(1., .46, clamp((touchStrength - 1.) / 1.8, 0., 1.));
        float radius = max(length(delta) * rangeScale, .001);
        vec2 normal = normalize(vec2(delta.x / aspect, delta.y));
        float speed = length(touch.zw);
        // Keep each fingertip's ripple compact so nearby fingers create five
        // distinct contact rings instead of one merged distortion field.
        float ringFalloff = exp(-radius * 16.);
        float ripple = sin(radius * 105. - uTime * (4.2 + speed * 4.)) * ringFalloff;
        float ripplePower = (.022 + min(speed, 1.2) * .035) * touchStrength;
        float contactLens = exp(-radius * 25.) * (.013 + min(speed, 1.2) * .020) * touchStrength;
        displacement += normal * (ripple * ripplePower + contactLens);
        displacement += touch.zw * exp(-radius * 16.) * .029 * touchStrength;
      }
      for (int i = 0; i < 20; i++) {
        vec4 ripplePoint = uRipples[i];
        if (ripplePoint.z < 0.) continue;
        vec2 delta = uv - ripplePoint.xy;
        delta.x *= aspect;
        float radius = max(length(delta), .001);
        vec2 normal = normalize(vec2(delta.x / aspect, delta.y));
        float age = uTime - ripplePoint.z;
        float travelled = age * .13;
        float ring = exp(-abs(radius - travelled) * (32. / max(1., ripplePoint.w * .8)));
        float fade = exp(-age * .72);
        float pulse = sin((radius - travelled) * 105. - uTime * 4.);
        displacement += normal * ring * fade * pulse * ripplePoint.w * .042;
      }
      // Match CSS object-fit: cover. The previous direct UV lookup stretched
      // the camera whenever its native aspect ratio differed from the screen.
      vec2 source = uv + displacement;
      float viewportAspect = aspect;
      float videoAspect = uVideoSize.x / uVideoSize.y;
      if (viewportAspect > videoAspect) {
        source.y = (source.y - .5) * viewportAspect / videoAspect + .5;
      } else {
        source.x = (source.x - .5) * videoAspect / viewportAspect + .5;
      }
      source.x = 1. - source.x;
      vec3 color = texture2D(uCamera, clamp(source, .001, .999)).rgb;
      gl_FragColor = vec4(color, 1.);
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
    if (!gl || shaderProgram) return
    const program = gl.createProgram()!
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource)!)
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource)!)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Shader linking failed')
    shaderProgram = program
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
    touchUniform = gl.getUniformLocation(program, 'uTouches[0]')
    touchStrengthUniform = gl.getUniformLocation(program, 'uTouchStrengths[0]')
    rippleUniform = gl.getUniformLocation(program, 'uRipples[0]')
    timeUniform = gl.getUniformLocation(program, 'uTime')
    samplerUniform = gl.getUniformLocation(program, 'uCamera')
    viewportUniform = gl.getUniformLocation(program, 'uViewport')
    videoSizeUniform = gl.getUniformLocation(program, 'uVideoSize')
    gl.uniform1i(samplerUniform, 0)
  }
  const resize = () => {
    if (!gl) return
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
    const width = Math.round(window.innerWidth * ratio)
    const height = Math.round(window.innerHeight * ratio)
    if (canvasWidth === width && canvasHeight === height) return false
    canvasWidth = width
    canvasHeight = height
    canvas.width = width
    canvas.height = height
    gl.viewport(0, 0, width, height)
    return true
  }
  const syncRippleData = () => {
    rippleData.fill(0)
    for (let index = 0; index < maxRipples; index += 1) rippleData[index * 4 + 2] = -1
    ripples.forEach((ripple, index) => {
      const offset = index * 4
      rippleData[offset] = ripple.x
      rippleData[offset + 1] = ripple.y
      rippleData[offset + 2] = ripple.startedAt / 1000
      rippleData[offset + 3] = ripple.strength
    })
    ripplesDirty = false
  }
  const inferHands = (now: number) => {
    if (!handLandmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || now - lastInferenceAt < 42 || video.currentTime === lastVideoTime) return
    lastInferenceAt = now
    lastVideoTime = video.currentTime
    touches.fill(0)
    touchStrengths.fill(0)
    for (let index = 0; index < maxTouches; index += 1) touches[index * 4 + 1] = -2
    const result = handLandmarker.detectForVideo(video, now)
    let touchIndex = 0
    result.landmarks.forEach((landmarks, handIndex) => {
      const wrist = landmarks[0]
      const handSpan = Math.max(Math.hypot(wrist.x - landmarks[9].x, wrist.y - landmarks[9].y), .001)
      const isFist = fingertipIndices.every((tipIndex) => Math.hypot(wrist.x - landmarks[tipIndex].x, wrist.y - landmarks[tipIndex].y) / handSpan < 1.35)
      const handSizeStrength = Math.max(.65, Math.min(1.65, handSpan / .16))
      const handStrength = handSizeStrength * (isFist ? 2.35 : 1)
      fingertipIndices.forEach((tipIndex) => {
        if (touchIndex >= maxTouches) return
        const landmark = landmarks[tipIndex]
        const x = 1 - landmark.x
        const y = landmark.y
        const key = `${handIndex}:${tipIndex}`
        const previous = previousTips.get(key)
        const elapsed = previous ? Math.max((now - previous.at) / 1000, .001) : .05
        const velocityX = previous ? Math.max(-1.2, Math.min(1.2, (x - previous.x) / elapsed * .08)) : 0
        const velocityY = previous ? Math.max(-1.2, Math.min(1.2, (y - previous.y) / elapsed * .08)) : 0
        const moved = previous ? Math.hypot(x - previous.x, y - previous.y) : .02
        const lastRipple = lastRippleAt.get(key) ?? -Infinity
        if (moved > .006 && now - lastRipple > 95) {
          ripples.push({ x, y, startedAt: now, strength: Math.max(.7, Math.min(2.8, moved * 28 * handStrength)) })
          if (ripples.length > maxRipples) ripples.shift()
          lastRippleAt.set(key, now)
          ripplesDirty = true
        }
        const offset = touchIndex * 4
        touches[offset] = x
        touches[offset + 1] = y
        touches[offset + 2] = velocityX
        touches[offset + 3] = velocityY
        touchStrengths[touchIndex] = handStrength
        previousTips.set(key, { x, y, at: now })
        touchIndex += 1
      })
    })
    touchesDirty = true
  }
  const draw = (now: number) => {
    if (!open) return
    const viewportChanged = resize()
    if (tracking) inferHands(now)
    if (gl && shaderProgram && texture && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      for (let index = ripples.length - 1; index >= 0; index -= 1) {
        if (now - ripples[index].startedAt > 2_600) { ripples.splice(index, 1); ripplesDirty = true }
      }
      gl.useProgram(shaderProgram)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      if (video.currentTime !== lastUploadedVideoTime) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video)
        lastUploadedVideoTime = video.currentTime
      }
      gl.uniform1f(timeUniform, now / 1000)
      const videoSizeChanged = uploadedVideoWidth !== video.videoWidth || uploadedVideoHeight !== video.videoHeight
      if (viewportChanged || videoSizeChanged) {
        gl.uniform2f(viewportUniform, canvas.width, canvas.height)
        gl.uniform2f(videoSizeUniform, video.videoWidth, video.videoHeight)
        uploadedVideoWidth = video.videoWidth
        uploadedVideoHeight = video.videoHeight
      }
      if (touchesDirty) { gl.uniform4fv(touchUniform, touches); gl.uniform1fv(touchStrengthUniform, touchStrengths); touchesDirty = false }
      if (ripplesDirty) { syncRippleData(); gl.uniform4fv(rippleUniform, rippleData) }
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }
    frame = requestAnimationFrame(draw)
  }
  const startCamera = async () => {
    if (tracking) return
    startButton.disabled = true
    startButton.textContent = '카메라 연결 중…'
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } }, audio: false })
      video.srcObject = stream
      await video.play()
      setupRenderer()
      const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm')
      handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task' },
        runningMode: 'VIDEO', numHands: 2,
      })
      tracking = true
      startButton.remove()
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
    open: () => {
      open = true
      screen.classList.add('is-open')
      screen.setAttribute('aria-hidden', 'false')
      frame = requestAnimationFrame(draw)
      closeButton.focus()
    },
    close: () => {
      open = false
      cancelAnimationFrame(frame)
      screen.classList.remove('is-open', 'is-tracking')
      screen.setAttribute('aria-hidden', 'true')
      tracking = false
      handLandmarker?.close()
      handLandmarker = null
      stream?.getTracks().forEach((track) => track.stop())
      stream = null
      video.srcObject = null
      lastUploadedVideoTime = -1
      uploadedVideoWidth = 0
      uploadedVideoHeight = 0
      outputStream?.getTracks().forEach((track) => track.stop())
      outputStream = null
      startButton.disabled = false
      startButton.textContent = '카메라 켜기'
      if (!startButton.isConnected) screen.append(startButton)
      previousTips.clear()
      lastRippleAt.clear()
      ripples.splice(0)
      touches.fill(0)
      touchStrengths.fill(0)
    },
    isOpen: () => open,
    getRecordingStream: () => {
      if (!open || !canvas.captureStream) return null
      outputStream ??= canvas.captureStream(30)
      return outputStream
    },
    getRecordingCanvas: () => open ? canvas : null,
  }
}
