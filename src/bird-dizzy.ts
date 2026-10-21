import { BIRD_EFFECT_COLORS as colors } from './bird-effect-palette'
export type BirdHaloAnchor = { x: number; y: number; span: number }
const TAU = Math.PI * 2
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

// Small reusable, speckled neon stars echo the flock's bright polka-dot plumage.
const starSprite = (color: string) => {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96
  const c = canvas.getContext('2d')!
  c.translate(48, 48)
  const star = new Path2D()
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 16 : 36
    if (i === 0) star.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  star.closePath()
  const ink = c.createLinearGradient(-15, -36, 22, 36)
  ink.addColorStop(0, '#fff9f0'); ink.addColorStop(.28, color); ink.addColorStop(1, color)
  c.shadowColor = color; c.shadowBlur = 9; c.fillStyle = ink; c.fill(star)
  c.shadowBlur = 0
  c.save(); c.clip(star)
  c.fillStyle = color === '#ff3dca' ? '#ffe54a' : '#ff78e0'
  for (let y = -30; y <= 32; y += 12) for (let x = -30; x <= 32; x += 12) {
    c.beginPath(); c.arc(x, y, 2.5, 0, TAU); c.fill()
  }
  c.restore()
  c.strokeStyle = '#ffffffb3'; c.lineWidth = 1.5; c.stroke(star)
  return canvas
}

/** Persistent head halo, temporarily hidden while the impact fireworks play. */
export const createBirdDizzy = () => {
  let startsAt = Infinity
  let anchor: BirdHaloAnchor = { x: .5, y: .3, span: .2 }
  let sprites: HTMLCanvasElement[] = []
  const active = (now: number) => now >= startsAt
  return {
    active,
    show(now: number, origin: BirdHaloAnchor) {
      if (startsAt !== Infinity) return
      startsAt = now; anchor = { ...origin }
    },
    hideUntil(at: number) { startsAt = at },
    follow(target: BirdHaloAnchor) {
      anchor.x += (target.x - anchor.x) * .4
      anchor.y += (target.y - anchor.y) * .4
      anchor.span += (target.span - anchor.span) * .3
    },
    draw(c: CanvasRenderingContext2D, now: number, width: number, height: number, reducedMotion: boolean) {
      if (!active(now)) return
      if (!sprites.length) sprites = colors.map(starSprite)
      const elapsed = now - startsAt
      const alpha = Math.min(1, elapsed / 100)
      const radius = clamp(anchor.span * Math.min(width, height) * .7, 48, Math.min(138, width * .33))
      const ry = radius * .24
      const x = clamp(anchor.x * width, radius + 20, width - radius - 20)
      const y = clamp(anchor.y * height, ry + 38, height - ry - 38)
      const spin = reducedMotion ? 0 : elapsed * .0042
      c.save(); c.globalAlpha = alpha
      c.translate(x, y)
      if (!reducedMotion) c.rotate(Math.sin(elapsed * .003) * .055)
      c.lineCap = 'round'
      // Separate short arcs keep the orbit airy and leave the face unobscured.
      for (let i = 0; i < 4; i++) {
        const a = spin + i * TAU / 4
        c.save(); c.globalAlpha *= .65
        c.strokeStyle = colors[i]; c.lineWidth = 2.2
        c.beginPath(); c.ellipse(0, 0, radius, ry, 0, a + .18, a + 1.08); c.stroke()
        c.restore()
      }
      for (let i = 0; i < 20; i++) {
        const a = -spin * .7 + i * TAU / 20
        c.fillStyle = colors[i % 4]
        c.beginPath(); c.arc(Math.cos(a) * radius * .87, Math.sin(a) * ry * .78, i % 3 === 0 ? 2.1 : 1.2, 0, TAU); c.fill()
      }
      // Back stars are smaller; front stars sit above the orbit for depth.
      for (const front of [false, true]) for (let i = 0; i < 4; i++) {
        const a = spin + i * TAU / 4, depth = Math.sin(a)
        if ((depth >= 0) !== front) continue
        const size = clamp(radius * .34, 24, 42) * (1 + depth * .18)
        c.save()
        c.translate(Math.cos(a) * radius, depth * ry)
        c.rotate(reducedMotion ? -.15 : Math.sin(a * 1.5) * .3)
        c.drawImage(sprites[i], -size / 2, -size / 2, size, size)
        c.restore()
      }
      c.restore()
    },
    reset() { startsAt = Infinity },
    dispose() {
      startsAt = Infinity
      for (const sprite of sprites) { sprite.width = 0; sprite.height = 0 }
      sprites = []
    },
  }
}
