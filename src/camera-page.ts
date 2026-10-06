// Keep a destination invisible until its video has a real decoded frame.
// This avoids exposing its controls or a coloured canvas placeholder over the
// home page while a camera permission prompt or stream negotiation is pending.
export const revealOnFirstVideoFrame = (screen: HTMLElement, video: HTMLVideoElement) => {
  const reveal = () => screen.classList.remove('is-camera-pending')
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) reveal()
  else video.addEventListener('loadeddata', reveal, { once: true })
}
