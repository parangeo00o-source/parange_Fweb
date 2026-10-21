import { FIREWORK_OUTLINES, prepareFireworkArt } from './bird-firework-art'

const COLORS = ['#ff34d3', '#7339e5', '#5577ff', '#38e9f4', '#37f37e', '#f0ff48', '#ffc637', '#ff6657']
// Overlapping crown and temple clusters form one composition around the head.
// The space below the crown is left open for the face.
const LAYOUT = [
  [0, -.22, .46], [-.26, -.1, .37], [.28, -.07, .4], [-.16, -.31, .19],
  [.22, -.29, .23], [-.42, .1, .23], [.43, .14, .25], [-.37, -.23, .12],
  [.39, -.23, .16], [-.28, .18, .14], [.29, .22, .1], [-.08, -.4, .105],
  [.13, -.03, .15], [-.1, -.04, .18],
]
type Spark = { ox: number; oy: number; vx: number; vy: number; size: number; color: string; phase: number; dust: boolean; drag: number }
type Firework = { x: number; y: number; size: number; delay: number; life: number; sparks: Spark[] }

/** Independent cached motifs ignite in sequence; no full-frame composite print. */
export const createBirdImpactGraphic = () => {
  let sprites: HTMLCanvasElement[] = [], bursts: Firework[] = []
  let preparation: Promise<void> | null = null, generation = 0
  let startedAt = -Infinity, endsAt = -Infinity, x = .5, y = .5, span = .2
  const active = (now: number) => now >= startedAt && now < endsAt
  const reset = () => { startedAt = endsAt = -Infinity; bursts = [] }
  const prepare = () => {
    if (sprites.length) return Promise.resolve()
    if (preparation) return preparation
    const current = generation
    preparation = prepareFireworkArt().then(images => {
      if (current !== generation) { for (const image of images) image.width = image.height = 0; return }
      sprites = images
    }).finally(() => { if (current === generation) preparation = null })
    return preparation
  }
  return {
    active, reset, prepare,
    follow(target: { x: number; y: number; span: number }) {
      x += (target.x - x) * .4; y += (target.y - y) * .4
      span += (target.span - span) * .3
    },
    burst(point: { x: number; y: number }, now: number, width: number, height: number, headSpan = .2) {
      x = point.x / Math.max(1, width); y = point.y / Math.max(1, height)
      span = headSpan
      // Closely spaced ignitions let neighbouring blooms overlap as a collage.
      bursts = LAYOUT.map(([x, y, size], i) => ({ x, y, size, delay: i * 46,
        // Retain individual fades, but gather their endings into a short window.
        // Later ignitions finish sooner instead of leaving isolated last blooms.
        life: 1440 + size * 100 + (i % 3) * 25 + i * 7 - i * 46,
        sparks: Array.from({ length: 32 }, (_, j) => {
          const dust = j >= 10
          const outline = FIREWORK_OUTLINES[i], a = outline[j % outline.length], b = outline[(j + 1) % outline.length]
          const mix = Math.random(), ox = a.x + (b.x - a.x) * mix, oy = a.y + (b.y - a.y) * mix
          const angle = Math.atan2(oy, ox) + (Math.random() - .5) * .22
          const speed = (dust ? .65 + Math.random() * .95 : .85 + Math.random() * .65) * Math.sqrt(size / .3)
          return { ox, oy, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            size: dust ? 1 + Math.random() * 1.1 : 1.8 + Math.random() * 1.2,
            dust, drag: dust ? 2 + Math.random() * 1.5 : 2.2,
            color: COLORS[(i + j) % COLORS.length], phase: Math.random() * Math.PI * 2 }
        }),
      }))
      startedAt = now
      endsAt = now + Math.max(...bursts.map(burst => burst.delay + burst.life))
      return endsAt
    },
    draw(c: CanvasRenderingContext2D, now: number, width: number, height: number, reducedMotion: boolean) {
      if (!active(now) || !sprites.length) return
      const age = now - startedAt
      const base = Math.max(150, Math.min(580, width * 1.05, height * .72,
        span * Math.min(width, height) * 2.6, (y * height - 12) / .49))
      c.save(); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'low'
      for (let i = 0; i < bursts.length; i++) {
        const burst = bursts[i], elapsed = age - burst.delay
        const cx = (x * width) + burst.x * base
        const cy = (y * height) + burst.y * base
        // A short rising ignition spark gives later blooms a visible trigger.
        // It stays local to the head rather than launching from the screen edge.
        if (!reducedMotion && elapsed > -95 && elapsed <= 0) {
          const lead = 1 + elapsed / 95
          for (let j = 5; j >= 0; j--) {
            const progress = Math.max(0, lead - j * .09)
            c.globalAlpha = lead * (1 - j / 6) * .9
            c.fillStyle = j === 0 ? '#fff9cf' : COLORS[i % COLORS.length]
            const px = cx + Math.sin(progress * Math.PI) * base * .015 * (i % 2 ? 1 : -1)
            const py = cy + base * .13 * (1 - progress)
            c.fillRect(px - 1, py - 1, j === 0 ? 2.8 : 1.6, j === 0 ? 3.5 : 1.6)
          }
        }
        if (elapsed <= 0 || elapsed >= burst.life) continue
        const t = Math.max(0, elapsed) / 1000
        const fade = Math.min(1, elapsed / 35, (burst.life - elapsed) / 300)
        const printFade = Math.max(0, Math.min(1, elapsed / 35, (burst.life - 140 - elapsed) / 300))
        // Fast detonation, then drag: the artwork briefly blooms instead of
        // staying suspended like a sticker. Flying embers outlive the print.
        const scale = reducedMotion ? 1 : .025 + 1.1 * (1 - Math.exp(-t * 16))
          + .2 * (1 - Math.exp(-Math.max(0, t - .18) * 1.8))
        const size = base * burst.size * scale
        const burn = reducedMotion ? 1 : Math.exp(-Math.max(0, t - .26) * 4.2)
        c.globalAlpha = printFade * burn * .95
        if (printFade > 0) c.drawImage(sprites[i], cx - size / 2, cy - size / 2, size, size)
        if (reducedMotion) continue
        // Ignition follows the same concave contour as the visible artwork.
        if (elapsed < 240) {
          const progress = elapsed / 240, contourSize = size * (1 + .16 * progress)
          const outline = FIREWORK_OUTLINES[i]
          c.globalAlpha = (1 - progress) * .9
          for (let j = 0; j < 20; j++) {
            const edge = j / 20 * outline.length, a = outline[Math.floor(edge)], b = outline[(Math.floor(edge) + 1) % outline.length]
            const mix = edge % 1
            c.fillStyle = COLORS[(i + j) % COLORS.length]
            const jitterX = Math.sin(j * 29.7 + i * 4.1) * .025
            const jitterY = Math.cos(j * 17.3 + i * 2.7) * .025
            c.fillRect(cx + (a.x + (b.x - a.x) * mix + jitterX) * contourSize - 1,
              cy + (a.y + (b.y - a.y) * mix + jitterY) * contourSize - 1, 2, 2)
          }
          if (elapsed < 100) {
            const r = base * .018 * (1 - elapsed / 100)
            c.fillStyle = '#ffffe7'; c.fillRect(cx - r, cy - 1, r * 2, 2); c.fillRect(cx - 1, cy - r, 2, r * 2)
          }
        }
        for (const spark of burst.sparks) {
          const life = elapsed / burst.life
          const alpha = fade * Math.pow(1 - life, spark.dust ? .22 : .32)
          const twinkle = life > .4 ? .28 + .72 * Math.pow(Math.sin(t * 28 + spark.phase), 2) : 1
          c.fillStyle = spark.color
          const trail = spark.dust ? 1 : 5
          for (let j = trail; j >= 0; j--) {
            const trailT = Math.max(0, t - j * (spark.dust ? .03 : .055))
            const distance = (1 - Math.exp(-spark.drag * trailT)) / spark.drag
            const launch = base * burst.size * .16 * (1 - Math.exp(-trailT * 20))
            const px = cx + spark.ox * launch + spark.vx * base * distance
            const py = cy + spark.oy * launch + spark.vy * base * distance + base * .19 * trailT * trailT
            const s = spark.size * Math.max(.85, Math.min(1.4, base / 380)) * (1 - j * .12)
            c.globalAlpha = alpha * twinkle * (1 - j / (trail + 1))
            c.fillRect(px - s / 2, py - s / 2, s, s)
            if (j === 0 && !spark.dust && life < .6) {
              c.globalAlpha = alpha * .85; c.fillStyle = '#fff8d9'
              c.fillRect(px - s * .22, py - s * .22, s * .44, s * .44)
            }
          }
        }
      }
      c.restore()
    },
    dispose() {
      generation++; preparation = null
      reset()
      for (const sprite of sprites) sprite.width = sprite.height = 0
      sprites = []
    },
  }
}
