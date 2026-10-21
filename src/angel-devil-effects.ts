import type { FighterSide } from './angel-devil-motion'

export const DUEL_EFFECT_DURATION = 480
const TAU = Math.PI * 2
const clamp = (n: number) => Math.max(0, Math.min(1, n))
const sparks = Array.from({ length: 52 }, (_, i) => ({
  angle: i * 2.3999632297,
  speed: .27 + ((i * 17) % 23) / 46,
  length: .045 + (i % 5) * .018,
  width: .003 + (i % 3) * .0018,
  delay: i < 24 ? 0 : 24 + (i % 5) * 12,
  life: i < 24 ? 250 + (i % 4) * 24 : 330 + (i % 4) * 22,
}))
type Direction = { angle: number; cosine: number; sine: number }
type BurstDirections = { sparks: Direction[]; heroes: Direction[] }
const directionFor = (angle: number): Direction => ({ angle, cosine: Math.cos(angle), sine: Math.sin(angle) })
const directionsFor = (side: FighterSide, seed: number): BurstDirections => ({
  sparks: sparks.map(spark => directionFor(spark.angle + seed * .53 + (side === 'angel' ? -.25 : .25))),
  heroes: Array.from({ length: 8 }, (_, i) => directionFor(i * 2.4 + seed * .71)),
})
const glows = new Map<FighterSide, HTMLCanvasElement>()
const glowFor = (side: FighterSide) => {
  let image = glows.get(side)
  if (!image) {
    image = document.createElement('canvas'); image.width = image.height = 96
    const c = image.getContext('2d')!, g = c.createRadialGradient(48, 48, 0, 48, 48, 48)
    g.addColorStop(0, side === 'angel' ? 'rgba(240,255,247,.95)' : 'rgba(255,229,239,.95)')
    g.addColorStop(.12, side === 'angel' ? 'rgba(174,237,235,.9)' : 'rgba(249,141,162,.9)')
    g.addColorStop(.35, side === 'angel' ? 'rgba(116,199,216,.48)' : 'rgba(210,54,92,.48)')
    g.addColorStop(1, 'transparent'); c.fillStyle = g; c.fillRect(0, 0, 96, 96)
    glows.set(side, image)
  }
  return image
}

/** Fast core flash, expanding shock waves and delayed debris have distinct
 * lifetimes. All trajectories are deterministic and evaluated from contact time. */
export const drawDuelImpact = (c: CanvasRenderingContext2D, side: FighterSide, age: number, size: number, seed = 0, cachedDirections?: BurstDirections) => {
  if (age < 0 || age >= DUEL_EFFECT_DURATION) return
  const directions = cachedDirections ?? directionsFor(side, seed)
  const angel = side === 'angel'
  const vivid = angel ? '#53dcb0' : '#e52a79', light = angel ? '#e8fff2' : '#ffe0e9'
  const accent = angel ? '#92d5df' : '#d94866', direction = angel ? 1 : -1
  const burst = (1 - clamp(age / 220)) ** 1.3
  const glow = glowFor(side)
  c.save(); c.scale(size, size); c.shadowOffsetY = 0; c.shadowBlur = 0
  c.globalAlpha = burst * .8
  const bloom = .29 + clamp(age / 160) * .15
  c.drawImage(glow, -bloom, -bloom, bloom * 2, bloom * 2)

  // Two offset rings suggest a three-dimensional shock wave at the weapon tip.
  for (let ring = 0; ring < 2; ring++) {
    const progress = clamp((age - ring * 38) / 270)
    if (age < ring * 38 || progress >= 1) continue
    const radius = .075 + (1 - (1 - progress) ** 2) * (.43 + ring * .055)
    c.save(); c.rotate(direction * -.55)
    c.globalAlpha = (1 - progress) ** 1.4 * .8
    c.strokeStyle = ring ? accent : vivid; c.lineWidth = .015 * (1 - progress) + .002
    c.beginPath(); c.ellipse(0, 0, radius, radius * .53, 0, -.35, TAU - .6); c.stroke()
    c.strokeStyle = light; c.lineWidth = .003
    c.beginPath(); c.ellipse(0, 0, radius * .98, radius * .52, 0, .15, Math.PI * 1.3); c.stroke()
    c.restore()
  }

  // A sharp asymmetric impact silhouette under the particle spray.
  if (burst > 0) {
    c.globalAlpha = burst * .65
    for (let i = 0; i < 9; i++) {
      const angle = i * 2.39996 + seed * .37, length = .12 + (i % 4) * .075
      c.save(); c.rotate(angle); c.fillStyle = i % 3 ? vivid : accent
      c.beginPath(); c.moveTo(.025, -.012); c.lineTo(length * .48, -.018 * burst)
      c.lineTo(length + age * .0003, 0); c.lineTo(length * .4, .008); c.closePath(); c.fill(); c.restore()
    }
    // Narrow luminous slashes rather than an opaque ball over the fighters.
    c.save(); c.rotate(direction * -.5); c.globalAlpha = burst * .85
    for (let i = 0; i < 2; i++) {
      c.strokeStyle = i ? light : vivid; c.lineWidth = i ? .007 : .018
      c.beginPath(); c.moveTo(-.34, .16); c.bezierCurveTo(-.13, -.12, .16, .07, .36, -.16); c.stroke()
    }
    c.restore()
  }

  // 24 velocity streaks and 28 drifting motes. Vary the seed for each hit so
  // consecutive attacks overlap naturally instead of stamping identical stars.
  for (let i = 0; i < sparks.length; i++) {
    const spark = sparks[i], p = (age - spark.delay) / spark.life
    if (p < 0 || p >= 1) continue
    const fade = (1 - p) ** 1.35
    const { angle, cosine, sine } = directions.sparks[i]
    const travel = .035 + spark.speed * (1 - (1 - p) ** 2)
    const x = cosine * travel, y = sine * travel * .78 + (angel ? -.05 : .16) * p * p
    c.save(); c.translate(x, y); c.rotate(angle)
    c.globalAlpha = fade * (i < 24 ? .95 : .8)
    if (i < 24) {
      const length = spark.length * (1 - p * .65), width = spark.width * (1 - p * .6)
      c.fillStyle = i % 4 === 0 ? accent : vivid
      c.beginPath(); c.moveTo(-length, 0); c.lineTo(-length * .2, -width); c.lineTo(.018, 0); c.lineTo(-length * .2, width); c.closePath(); c.fill()
      c.strokeStyle = light; c.lineWidth = width * .65
      c.beginPath(); c.moveTo(-length * .7, 0); c.lineTo(.009, 0); c.stroke()
      if (i % 4 === 0) c.drawImage(glow, -.035, -.035, .07, .07)
    } else {
      const radius = (.018 + (i % 3) * .008) * (1 - p * .55)
      c.drawImage(glow, -radius * 2, -radius * 2, radius * 4, radius * 4)
      c.fillStyle = i % 3 ? light : accent
      if (i % 4 === 0) {
        // Small four-point stars remain legible at mobile character sizes.
        c.beginPath(); c.moveTo(-radius, 0); c.lineTo(-radius * .18, -radius * .18)
        c.lineTo(0, -radius); c.lineTo(radius * .18, -radius * .18); c.lineTo(radius, 0)
        c.lineTo(radius * .18, radius * .18); c.lineTo(0, radius); c.lineTo(-radius * .18, radius * .18); c.closePath(); c.fill()
      } else { c.beginPath(); c.arc(0, 0, radius * .19, 0, TAU); c.fill() }
    }
    c.restore()
  }

  // Hero particles give each character its own material: icy feather shards
  // for the angel; molten fragments with branching flame for the devil.
  for (let i = 0; i < 8; i++) {
    const p = clamp((age - 28 - (i % 3) * 12) / 380)
    if (age < 28 + (i % 3) * 12 || p >= 1) continue
    const { angle, cosine, sine } = directions.heroes[i], reach = .10 + p * (.28 + (i % 3) * .1)
    c.save(); c.translate(cosine * reach, sine * reach * .7 + (angel ? -.12 : .13) * p * p)
    c.rotate(angle + p * (i % 2 ? 2 : -2)); c.globalAlpha = (1 - p) ** 1.5
    const length = .032 + (i % 3) * .012
    c.fillStyle = i % 2 ? accent : vivid
    c.beginPath(); c.moveTo(-length, 0)
    if (angel) {
      c.quadraticCurveTo(0, -length * .55, length, 0); c.quadraticCurveTo(0, length * .38, -length, 0)
    } else {
      c.lineTo(-length * .1, -length * .36); c.lineTo(length * .45, -length * .18)
      c.lineTo(length, 0); c.lineTo(0, length * .42)
    }
    c.closePath(); c.fill(); c.strokeStyle = light; c.lineWidth = .0025
    c.beginPath(); c.moveTo(-length * .6, 0); c.lineTo(length * .8, 0); c.stroke()
    c.restore()
  }
  if (!angel && age < 160) {
    c.globalAlpha = (1 - age / 160) * .85; c.strokeStyle = '#ffb7c3'; c.lineWidth = .0035
    for (let i = 0; i < 4; i++) {
      c.save(); c.rotate(i * 1.63 + seed)
      c.beginPath(); c.moveTo(.03, 0); c.lineTo(.13, -.027); c.lineTo(.115, .013); c.lineTo(.24, -.021); c.lineTo(.31, .01); c.stroke(); c.restore()
    }
  }
  const flash = (1 - clamp(age / 85)) ** 1.3
  if (flash > 0) {
    c.globalAlpha = flash; c.rotate(direction * -.55); c.fillStyle = light
    for (const rotation of [0, Math.PI / 2]) {
      c.save(); c.rotate(rotation); c.beginPath(); c.moveTo(-.26 * flash, 0)
      c.lineTo(-.023, -.012); c.lineTo(0, -.035); c.lineTo(.023, -.012)
      c.lineTo(.26 * flash, 0); c.lineTo(.023, .012); c.lineTo(0, .035); c.lineTo(-.023, .012); c.closePath(); c.fill(); c.restore()
    }
  }
  c.restore()
}

type Burst = { side: FighterSide; at: number; x: number; y: number; size: number; seed: number; directions: BurstDirections }
/** Keep the previous hit's debris alive through the next 240ms attack. A strict
 * four-burst cap bounds work even with rapid alternating winks. */
export const createDuelEffects = () => {
  const bursts: Burst[] = []
  let sequence = 0
  return {
    emit(side: FighterSide, at: number, x: number, y: number, size: number) {
      if (bursts.some(b => b.at === at && b.side === side)) return
      if (bursts.length === 4) bursts.shift()
      const seed = sequence++
      // Directions stay fixed for the hit's entire lifetime. Reuse the exact
      // same doubles; count, trajectories, timing and particle paints are unchanged.
      bursts.push({ side, at, x, y, size, seed, directions: directionsFor(side, seed) })
    },
    draw(c: CanvasRenderingContext2D, now: number) {
      for (let i = bursts.length - 1; i >= 0; i--) if (now - bursts[i].at >= DUEL_EFFECT_DURATION || now < bursts[i].at) bursts.splice(i, 1)
      for (const b of bursts) {
        c.save(); c.translate(b.x, b.y); drawDuelImpact(c, b.side, now - b.at, b.size, b.seed, b.directions); c.restore()
      }
    },
    reset() { bursts.length = 0; sequence = 0 },
  }
}
