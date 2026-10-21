type Point = { x: number; y: number }
type SpriteKind = 'star' | 'ember' | 'smoke'
export const DEVIL_VICTORY_DURATION = 1600
const TAU = Math.PI * 2
const clamp = (n: number) => Math.max(0, Math.min(1, n))
const hash = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v) }
const sprites = new Map<SpriteKind, HTMLCanvasElement>()

// Bake the soft light and charcoal texture once. Live camera frames only composite
// small sprites; there are no full-screen blur filters or flashing white overlays.
const spriteFor = (kind: SpriteKind) => {
  const cached = sprites.get(kind)
  if (cached) return cached
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = kind === 'smoke' ? 192 : 96
  const c = canvas.getContext('2d')!, size = canvas.width
  c.translate(size / 2, size / 2)
  if (kind === 'smoke') {
    for (let i = 0; i < 16; i++) {
      const angle = i * 2.39996, r = 12 + hash(i + 1) * 30
      const x = Math.cos(angle) * r, y = Math.sin(angle) * r, radius = 27 + hash(i + 19) * 28
      const ink = c.createRadialGradient(x, y, 0, x, y, radius)
      ink.addColorStop(0, 'rgba(32,20,33,.22)')
      ink.addColorStop(.45, 'rgba(49,27,45,.12)'); ink.addColorStop(1, 'rgba(49,27,45,0)')
      c.fillStyle = ink; c.fillRect(x - radius, y - radius, radius * 2, radius * 2)
    }
  } else {
    const glow = c.createRadialGradient(0, 0, 0, 0, 0, 47)
    glow.addColorStop(0, 'rgba(249,141,162,.8)')
    glow.addColorStop(.17, 'rgba(229,42,121,.65)')
    glow.addColorStop(.46, 'rgba(205,47,83,.2)'); glow.addColorStop(1, 'rgba(126,36,58,0)')
    c.fillStyle = glow; c.fillRect(-48, -48, 96, 96)
    if (kind === 'star') {
      c.beginPath(); c.moveTo(0, -24); c.lineTo(5, -6); c.lineTo(20, 0); c.lineTo(5, 6)
      c.lineTo(0, 24); c.lineTo(-5, 6); c.lineTo(-20, 0); c.lineTo(-5, -6); c.closePath()
      const pigment = c.createLinearGradient(-14, -24, 16, 24)
      pigment.addColorStop(0, '#f9a6b6'); pigment.addColorStop(.26, '#df3276')
      pigment.addColorStop(.65, '#cc3c5f'); pigment.addColorStop(1, '#7e243a')
      c.fillStyle = pigment; c.fill(); c.strokeStyle = '#f98da2'; c.lineWidth = .65; c.stroke()
      c.beginPath(); c.moveTo(0, -16); c.lineTo(1.8, -2); c.lineTo(12, 0); c.lineTo(0, 2)
      c.lineTo(-1.8, 0); c.closePath(); c.fillStyle = '#ffdce6'; c.fill()
    } else {
      c.fillStyle = '#e85a79'; c.beginPath(); c.ellipse(0, 0, 4, 10, .3, 0, TAU); c.fill()
      c.fillStyle = '#ffe0e9'; c.beginPath(); c.ellipse(-.4, -1, 1.5, 5, .3, 0, TAU); c.fill()
    }
  }
  sprites.set(kind, canvas)
  return canvas
}

const particles = Array.from({ length: 112 }, (_, i) => ({
  star: i < 24,
  angle: i * 2.39996,
  cosine: Math.cos(i * 2.39996),
  sine: Math.sin(i * 2.39996),
  speed: .25 + hash(i + 8) * .7,
  delay: hash(i + 11) * 150,
  life: 1000 + hash(i + 17) * 450,
  phase: hash(i + 23),
  size: i < 24 ? 32 + hash(i + 39) * 38 : 13 + hash(i + 41) * 19,
  spin: (hash(i + 47) - .5) * 4,
}))

/** A four-point magenta star burst, rising embers and wispy edge smoke. */
export const drawDevilEmberField = (
  c: CanvasRenderingContext2D, elapsed: number, opacity: number, width: number, height: number,
  origin: Point = { x: .5, y: .3 }, looping = true,
) => {
  if (elapsed < 0 || opacity <= 0 || (!looping && elapsed >= DEVIL_VICTORY_DURATION)) return
  const fade = opacity * (looping ? 1 : 1 - clamp((elapsed - 1000) / 600))
  const entry = clamp(elapsed / 90), fieldScale = Math.min(1.35, Math.max(.7, width / 650))
  c.save(); c.beginPath(); c.rect(0, 68, width, Math.max(0, height - 68)); c.clip()
  c.globalCompositeOperation = 'source-over'
  const smoke = spriteFor('smoke'), edgeSize = Math.min(210, width * .32)
  // Smoke never fills the center: its soft bounds stay within the outer 20%.
  for (let edge = 0; edge < 2; edge++) for (let i = 0; i < 5; i++) {
    const phase = elapsed * .0005 + i * 1.7, radius = edgeSize * (1 + .15 * Math.sin(phase))
    const x = edge ? width + radius * .1 : -radius * .1
    const y = Math.max(68 + radius * .72, 80 + (height - 100) * (i + .3) / 5 - Math.sin(phase) * 12)
    c.globalAlpha = fade * entry * .48
    c.drawImage(smoke, x - radius, y - radius * .72, radius * 2, radius * 1.44)
  }
  for (let i = 0; i < 4; i++) {
    const radius = edgeSize * 1.15
    c.globalAlpha = fade * entry * .35
    c.drawImage(smoke, width * (i + .5) / 4 - radius, height - radius * .38, radius * 2, radius)
  }

  // A quick magenta ripple marks the win, staying below the HUD and fading before the stars.
  if (!looping && elapsed < 480) {
    const t = elapsed / 480, radius = (24 + t * Math.min(width, height) * .6)
    c.globalAlpha = fade * Math.sin(t * Math.PI) * .35
    c.strokeStyle = '#f34b98'; c.lineWidth = 2 * (1 - t) + .5
    c.beginPath(); c.ellipse(origin.x * width, origin.y * height, radius, radius * .45, -.15, 0, TAU); c.stroke()
  }
  const star = spriteFor('star'), ember = spriteFor('ember')
  for (const [i, p] of particles.entries()) {
    const age = looping ? (elapsed + p.phase * p.life) % p.life : elapsed - p.delay
    if (age < 0 || age >= p.life) continue
    const t = age / p.life, launch = 1 - (1 - t) ** 3
    // Half the particles erupt from the winner; side fountains frame the user's face.
    const fountain = i % 4, ox = fountain < 2 ? origin.x * width : width * (fountain === 2 ? .06 : .94)
    const oy = fountain < 2 ? Math.max(85, origin.y * height) : height * (.42 + p.phase * .5)
    const dx = p.cosine * width * .43 * p.speed
    const dy = p.sine * Math.min(height * .45, width * .55) * p.speed
    const x = ox + dx * launch + Math.sin(t * 6 + p.phase * TAU) * 8 * t
    const y = oy + dy * launch - t * t * (p.star ? 36 : 110)
    if (x < -50 || x > width + 50 || y < 40 || y > height + 50) continue
    // A soft quiet zone keeps the camera subject visible, without a hard-edged cutout.
    const distance = Math.hypot((x - width * .5) / (width * .3), (y - height * .48) / (height * .32))
    const faceClearance = .16 + .84 * clamp((distance - .65) / .5)
    const alpha = fade * clamp(age / 45) * (1 - t) ** .65 * faceClearance
    const size = p.size * fieldScale * (.65 + .35 * Math.sin(Math.PI * t))
    c.save(); c.translate(x, y); c.rotate(p.angle + t * p.spin)
    c.globalAlpha = alpha
    if (!p.star) {
      c.strokeStyle = '#e96a7f'; c.lineWidth = .8 * fieldScale
      c.beginPath(); c.moveTo(0, 0); c.lineTo(-5 - 17 * (1 - t), 1); c.stroke()
    }
    c.drawImage(p.star ? star : ember, -size / 2, -size / 2, size, size)
    c.restore()
  }
  c.restore()
}

export const createDevilVictoryEffect = () => {
  let startedAt = -Infinity, origin: Point = { x: .5, y: .3 }
  const active = (now: number) => now >= startedAt && now - startedAt < DEVIL_VICTORY_DURATION
  return {
    start(now: number, point: Point) { startedAt = now; origin = { x: clamp(point.x), y: clamp(point.y) } },
    active,
    draw(c: CanvasRenderingContext2D, now: number, width: number, height: number, reducedMotion: boolean) {
      if (reducedMotion || !active(now)) return
      drawDevilEmberField(c, now - startedAt, 1, width, height, origin, false)
    },
    reset() { startedAt = -Infinity },
  }
}
