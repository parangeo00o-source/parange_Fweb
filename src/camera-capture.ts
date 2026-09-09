type RecordingState = {
  recorder: MediaRecorder
  chunks: Blob[]
  mimeType: string
  stream: MediaStream
  isDisplayCapture: boolean
}

const recordingMimeType = () => [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
].find((type) => MediaRecorder.isTypeSupported(type)) ?? ''

const dateStamp = () => new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)

const saveBlob = async (blob: Blob, fileName: string) => {
  const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' })
  // iOS does not consistently honor <a download>. Its native share sheet lets
  // the user save the file to Photos/Files, while desktop keeps a direct download.
  const mobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || navigator.maxTouchPoints > 1
  if (mobileDevice && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName })
      return
    } catch (error) {
      if ((error as DOMException).name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.style.display = 'none'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export const createCameraCapture = () => {
  const control = document.createElement('div')
  control.className = 'global-camera-capture'
  control.innerHTML = `<button type="button" class="capture-button" aria-label="사진 촬영" aria-pressed="false"><span></span></button><p class="capture-message" role="status"></p>`
  document.body.append(control)
  const button = control.querySelector<HTMLButtonElement>('.capture-button')!
  const message = control.querySelector<HTMLElement>('.capture-message')!
  const fallbackVideo = document.createElement('video')
  fallbackVideo.autoplay = true
  fallbackVideo.muted = true
  fallbackVideo.playsInline = true
  fallbackVideo.className = 'capture-fallback-video'
  document.body.append(fallbackVideo)
  let fallbackStream: MediaStream | null = null
  let recording: RecordingState | null = null
  let holdTimer: number | null = null
  let recordingStreamSource: (() => MediaStream | null) | null = null
  let photoCanvasSource: (() => HTMLCanvasElement | null) | null = null
  let pressStartedAt = 0

  const showMessage = (text: string) => {
    message.textContent = text
    control.classList.add('has-message')
    window.setTimeout(() => control.classList.remove('has-message'), 2600)
  }
  const currentVideo = () => {
    const visibleCamera = [...document.querySelectorAll<HTMLVideoElement>('.lemonade-camera')]
      .find((video) => video.closest('.lemonade-screen')?.classList.contains('is-open') && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)
    return visibleCamera ?? (fallbackVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA ? fallbackVideo : null)
  }
  const ensureVideo = async () => {
    const active = currentVideo()
    if (active) return active
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera API is unavailable')
    fallbackStream ??= await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
    fallbackVideo.srcObject = fallbackStream
    await fallbackVideo.play()
    if (fallbackVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await new Promise<void>((resolve) => fallbackVideo.addEventListener('loadeddata', () => resolve(), { once: true }))
    }
    return fallbackVideo
  }
  const takePhoto = async () => {
    try {
      // In Lemonade this is the same composited canvas used by video recording,
      // so a still image contains every on-screen effect as well.
      const effectCanvas = photoCanvasSource?.()
      let photo: Blob | null = null
      if (effectCanvas) {
        photo = await new Promise<Blob | null>((resolve) => effectCanvas.toBlob(resolve, 'image/jpeg', .94))
      } else {
        const video = await ensureVideo()
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const context = canvas.getContext('2d')
        if (!context || !canvas.width || !canvas.height) throw new Error('No camera frame')
        context.translate(canvas.width, 0)
        context.scale(-1, 1)
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        photo = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', .94))
      }
      if (!photo) throw new Error('Could not create photo')
      await saveBlob(photo, `lemonade-${dateStamp()}.jpg`)
      showMessage('사진을 저장할 수 있어요')
    } catch (error) {
      console.error(error)
      showMessage('카메라 권한을 확인해 주세요')
    }
  }
  const stopRecording = () => {
    if (!recording) return
    recording.recorder.stop()
    button.classList.remove('is-recording')
    button.setAttribute('aria-label', '사진 촬영')
    button.setAttribute('aria-pressed', 'false')
    showMessage('영상 저장 중…')
  }
  const startRecording = async () => {
    if (recording) return
    try {
      // Browser display capture is the only source that preserves the actual
      // page compositor: CSS graphics, filters, text, and layout match 1:1.
      let stream: MediaStream | null = null
      let isDisplayCapture = false
      if (navigator.mediaDevices?.getDisplayMedia) {
        showMessage('공유 창에서 현재 Lemonade 탭을 선택해 주세요')
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
        isDisplayCapture = true
      } else {
        // Retain a functional fallback for browsers without display capture.
        const composedStream = recordingStreamSource?.()
        const video = composedStream ? null : await ensureVideo()
        stream = composedStream ?? video?.srcObject as MediaStream | null
      }
      if (!stream || !window.MediaRecorder) throw new Error('Recording unavailable')
      const mimeType = recordingMimeType()
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      const nextRecording: RecordingState = { recorder, chunks: [], mimeType, stream, isDisplayCapture }
      recording = nextRecording
      recorder.addEventListener('dataavailable', (event) => { if (event.data.size) nextRecording.chunks.push(event.data) })
      recorder.addEventListener('stop', async () => {
        const finished = nextRecording
        recording = null
        if (finished.isDisplayCapture) finished.stream.getTracks().forEach((track) => track.stop())
        const extension = finished.mimeType.includes('mp4') ? 'mp4' : 'webm'
        const videoBlob = new Blob(finished.chunks, { type: finished.mimeType || 'video/webm' })
        if (videoBlob.size) await saveBlob(videoBlob, `lemonade-${dateStamp()}.${extension}`)
        showMessage('영상이 저장되었습니다')
      }, { once: true })
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (recording === nextRecording && recorder.state !== 'inactive') stopRecording()
      }, { once: true })
      recorder.start(250)
      button.classList.add('is-recording')
      button.setAttribute('aria-label', '영상 촬영 중지')
      button.setAttribute('aria-pressed', 'true')
      showMessage('영상 촬영 중')
    } catch (error) {
      console.error(error)
      showMessage('이 브라우저에서는 영상 촬영을 지원하지 않아요')
    }
  }

  button.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    button.setPointerCapture(event.pointerId)
    if (recording) { stopRecording(); return }
    pressStartedAt = performance.now()
    // getDisplayMedia must run directly from a trusted user event. Recognize
    // the long press here, then request the tab on its pointerup event.
    holdTimer = window.setTimeout(() => { holdTimer = null }, 500)
  })
  button.addEventListener('pointerup', () => {
    if (holdTimer !== null) window.clearTimeout(holdTimer)
    holdTimer = null
    if (performance.now() - pressStartedAt >= 500) void startRecording()
    else void takePhoto()
  })
  button.addEventListener('pointercancel', () => {
    if (holdTimer !== null) window.clearTimeout(holdTimer)
    holdTimer = null
  })
  button.addEventListener('contextmenu', (event) => event.preventDefault())
  return {
    control,
    setRecordingStreamSource: (source: () => MediaStream | null) => { recordingStreamSource = source },
    setPhotoCanvasSource: (source: () => HTMLCanvasElement | null) => { photoCanvasSource = source },
  }
}
