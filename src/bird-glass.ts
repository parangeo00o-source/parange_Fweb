import { BIRD_EFFECT_COLORS as colors } from './bird-effect-palette'
import { createGlassImpactArtwork } from './bird-glass-artwork'

type Point = { x: number; y: number }
type Shard = {
  points: Point[]; front: Point[]; back: Point[]; depth: number; thickness: number; z: number; light: number; fall: number; trig: number[]; frontFacing: boolean
  print: { sx: number; sy: number; w: number; h: number; x: number; y: number } | null
  x: number; y: number; color: number; delay: number; ring: number
  vx: number; vy: number; rotation: number; tilt: number; pitch: number
}
const TAU = Math.PI * 2
const DURATION = 2350

/** Keep the neon artwork, with impact-driven fractures and ballistic
 * shards. Geometry and flight parameters are prepared only when hit. */
export const createBirdGlass = () => {
  let startedAt = -Infinity, shards: Shard[] = []
  let sourceWidth = 1, sourceHeight = 1, origin: Point = { x: 0, y: 0 }
  let paint: CanvasGradient | null = null, paintKey = '', paintContext: CanvasRenderingContext2D | null = null
  const scene = document.createElement('canvas')
  const sceneContext = scene.getContext('2d')!
  let artwork: HTMLCanvasElement | null = null, printScale = 1
  const trace = (c: CanvasRenderingContext2D, points: Point[]) => {
    c.beginPath(); c.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length; i++) c.lineTo(points[i].x, points[i].y)
    c.closePath()
  }
  // Project both surfaces of a real, thin prism with independent X/Y/Z rotation.
  const project = (shard: Shard, x: number, y: number, z: number, out: Point) => {
    const t = shard.fall, [sx, cx, sy, cy, sz, cz] = shard.trig
    const ax = x * cy + z * sy, az = -x * sy + z * cy
    const ay = y * cx - az * sx, depth = y * sx + az * cx + shard.z
    const focal = Math.max(sourceWidth, sourceHeight) * 1.8
    const scale = focal / Math.max(focal * .35, focal + depth)
    out.x = shard.x + shard.vx * t + (ax * cz - ay * sz) * scale
    out.y = shard.y + shard.vy * t + 820 * t * t + (ax * sz + ay * cz) * scale
  }
  const printA: Point = { x: 0, y: 0 }, printB: Point = { x: 0, y: 0 }, printC: Point = { x: 0, y: 0 }
  const active = (now: number) => now >= startedAt && now < startedAt + DURATION
  const reset = () => { startedAt = -Infinity; shards = [] }
  return {
    active, reset,
    dispose() {
      reset(); scene.width = 0; scene.height = 0; paint = null; paintContext = null
      if (artwork) { artwork.width = artwork.height = 0; artwork = null }
    },
    burst(point: Point, now: number, width: number, height: number) {
      startedAt = now; sourceWidth = width; sourceHeight = height
      origin = { x: Math.max(20, Math.min(width - 20, point.x)), y: Math.max(20, Math.min(height - 20, point.y)) }
      artwork ??= createGlassImpactArtwork()
      printScale = Math.min(660, Math.min(width, height) * 1.02) / artwork.width
      const printLeft = origin.x - artwork.width * printScale / 2
      const printTop = origin.y - artwork.height * printScale / 2
      const count = 14, turn = Math.random() * TAU
      const rays = Array.from({ length: count }, (_, i) => {
        const a = turn + i * TAU / count + (Math.random() - .5) * .12
        const dx = Math.cos(a), dy = Math.sin(a)
        const reach = Math.min(dx > 0 ? (width - origin.x) / dx : -origin.x / dx,
          dy > 0 ? (height - origin.y) / dy : -origin.y / dy)
        return [.045, .15, .36, .68, 1.22].map((fraction, ring) => {
          const angle = a + (ring < 4 ? (Math.random() - .5) * .09 : 0)
          const r = reach * fraction * (ring < 4 ? .72 + Math.random() * .56 : 1)
          return { x: origin.x + Math.cos(angle) * r, y: origin.y + Math.sin(angle) * r }
        })
      })
      shards = []
      const edgeCache = new Map<string, Point[]>()
      // Adjacent pieces share the same tiny, irregular fracture edge.
      const fractureEdge = (a: Point, b: Point) => {
        const forward = a.x < b.x || (a.x === b.x && a.y < b.y)
        const from = forward ? a : b, to = forward ? b : a
        const key = `${from.x},${from.y}/${to.x},${to.y}`
        let points = edgeCache.get(key)
        if (!points) {
          const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy) || 1
          points = [from, ...[.34, .68].map(t => {
            const nick = (Math.random() - .5) * Math.min(2.6, length * .03)
            return { x: from.x + dx * t - dy / length * nick, y: from.y + dy * t + dx / length * nick }
          }), to]
          edgeCache.set(key, points)
        }
        return forward ? points : [...points].reverse()
      }
      for (let ring = 0; ring < 5; ring++) for (let i = 0; i < count; i++) {
        const next = (i + 1) % count
        const points = ring === 0 ? [origin, rays[i][0], rays[next][0]]
          : [rays[i][ring - 1], rays[i][ring], rays[next][ring], rays[next][ring - 1]]
        const x = points.reduce((sum, p) => sum + p.x, 0) / points.length
        const y = points.reduce((sum, p) => sum + p.y, 0) / points.length
        const brokenOutline = points.flatMap((point, index) => fractureEdge(point, points[(index + 1) % points.length]).slice(0, -1))
        const localPoints = brokenOutline.map(p => ({ x: p.x - x, y: p.y - y }))
        // A single continuous print is cut by the fracture geometry. Its origin
        // follows this hit, so there is no screen-centred or per-shard dot scatter.
        const sx = Math.max(0, (Math.min(...brokenOutline.map(p => p.x)) - printLeft) / printScale)
        const sy = Math.max(0, (Math.min(...brokenOutline.map(p => p.y)) - printTop) / printScale)
        const ex = Math.min(artwork.width, (Math.max(...brokenOutline.map(p => p.x)) - printLeft) / printScale)
        const ey = Math.min(artwork.height, (Math.max(...brokenOutline.map(p => p.y)) - printTop) / printScale)
        const print = ex > sx && ey > sy ? { sx, sy, w: ex - sx, h: ey - sy,
          x: printLeft + sx * printScale - x, y: printTop + sy * printScale - y } : null
        const distance = Math.hypot(x - origin.x, y - origin.y) || 1
        const impulse = (75 + Math.random() * 135) / (1 + ring * .28)
        shards.push({ points: localPoints, front: brokenOutline.map(p => ({ ...p })), back: brokenOutline.map(p => ({ ...p })),
          depth: (Math.random() - .4) * 2, thickness: .9 + Math.random() * 1.3, z: 0, light: 1, fall: 0, trig: [0, 1, 0, 1, 0, 1], frontFacing: true,
          print, x, y, color: (i + ring) % colors.length,
          // Small fragments eject first; the surrounding pane loses support next.
          ring, delay: ring * 32 + Math.random() * 75,
          vx: (x - origin.x) / distance * impulse,
          vy: (y - origin.y) / distance * impulse - 65 - Math.random() * 85,
          rotation: (Math.random() - .5) * 3.8,
          tilt: (Math.random() - .5) * 6, pitch: (Math.random() - .5) * 5 })
      }
      return now + DURATION
    },
    draw(c: CanvasRenderingContext2D, now: number, width: number, height: number, reducedMotion: boolean) {
      if (!active(now)) { if (now >= startedAt + DURATION) reset(); return }
      const age = now - startedAt
      // One bounded snapshot of camera + birds, before any glass is painted.
      // Every facet samples this same live background, never a previous glass frame.
      const density = Math.min(1, 1440 / Math.max(c.canvas.width, c.canvas.height))
      const sw = Math.max(1, Math.round(c.canvas.width * density)), sh = Math.max(1, Math.round(c.canvas.height * density))
      if (scene.width !== sw || scene.height !== sh) { scene.width = sw; scene.height = sh }
      sceneContext.clearRect(0, 0, sw, sh)
      sceneContext.drawImage(c.canvas, 0, 0, sw, sh)
      c.save(); c.scale(width / sourceWidth, height / sourceHeight)
      c.lineJoin = 'miter'; c.lineCap = 'butt'; c.miterLimit = 2
      const m = c.getTransform(), key = `${sourceWidth}/${sourceHeight}/${m.a}/${m.b}/${m.c}/${m.d}/${m.e}/${m.f}`
      if (!paint || paintKey !== key || paintContext !== c) {
        paint = c.createLinearGradient(0, 0, sourceWidth * .8, sourceHeight)
        paint.addColorStop(0, '#f6feff'); paint.addColorStop(.24, '#bde9f4')
        paint.addColorStop(.5, '#f4d7f4'); paint.addColorStop(.74, '#596f91'); paint.addColorStop(1, '#e8fcff')
        paintKey = key; paintContext = c
      }
      for (const shard of shards) {
        shard.fall = reducedMotion ? 0 : Math.max(0, age - 170 - shard.delay) / 1000
        shard.z = shard.fall * shard.depth * 150
        const rx = shard.fall * shard.pitch, ry = shard.fall * shard.tilt
        const rz = shard.fall * shard.rotation, m = shard.trig
        m[0] = Math.sin(rx); m[1] = Math.cos(rx); m[2] = Math.sin(ry); m[3] = Math.cos(ry); m[4] = Math.sin(rz); m[5] = Math.cos(rz)
        shard.frontFacing = m[1] * m[3] >= 0
        shard.light = Math.abs(m[1] * m[3] * .75 - m[2] * .45 + m[0] * .3)
        for (let i = 0; i < shard.points.length; i++) {
          const p = shard.points[i]
          project(shard, p.x, p.y, -shard.thickness / 2, shard.front[i])
          project(shard, p.x, p.y, shard.thickness / 2, shard.back[i])
        }
      }
      // Distant facets first, so nearer rims visibly pass over them.
      shards.sort((a, b) => b.z - a.z)
      // Finish all background refraction before painting foreground glass.
      // Otherwise a later shard copies birds over an earlier shard's rim/dots,
      // making the flock appear in front of the window at overlaps.
      for (let pass = 0; pass < 2; pass++) for (const shard of shards) {
        const entrance = Math.max(0, Math.min(1, (age - shard.ring * 14) / 35))
        if (!entrance) continue
        const fade = Math.min(1, (DURATION - age) / (reducedMotion ? 550 : 400))
        const opacity = entrance * fade, ink = colors[shard.color]
        const face = shard.frontFacing ? shard.front : shard.back, rear = shard.frontFacing ? shard.back : shard.front
        const facing = Math.abs(shard.trig[1] * shard.trig[3])
        const fresnel = .04 + .96 * Math.pow(1 - facing, 5)
        c.save()
        // Preserve the original colored rims on a thin glass cross-section.
        if (pass === 1) for (let i = 0; i < face.length; i++) {
          const j = (i + 1) % face.length, a = face[i], b = face[j]
          const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
          const edgeLight = ((b.x - a.x) - (b.y - a.y)) / length
          c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y)
          c.lineTo(rear[j].x, rear[j].y); c.lineTo(rear[i].x, rear[i].y); c.closePath()
          c.globalAlpha = opacity * (.3 + fresnel * .42)
          c.fillStyle = edgeLight > .25 ? '#d5f6ff' : '#4b4967'; c.fill()
          c.globalAlpha = opacity * .35; c.fillStyle = ink; c.fill()
        }
        trace(c, face)
        c.save(); c.clip()
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const p of face) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y) }
        minX = Math.max(0, minX - 2); minY = Math.max(0, minY - 2)
        maxX = Math.min(sourceWidth, maxX + 2); maxY = Math.min(sourceHeight, maxY + 2)
        // Subtle, continuously changing displacement of whatever is behind the
        // shard makes the material read as glass instead of a painted polygon.
        const shiftX = shard.trig[2] * shard.thickness * 2.8
        const shiftY = shard.trig[0] * shard.thickness * 2.1
        const sampleX = Math.max(0, Math.min(sourceWidth, minX + shiftX))
        const sampleY = Math.max(0, Math.min(sourceHeight, minY + shiftY))
        const sampleW = Math.min(maxX - minX, sourceWidth - sampleX)
        const sampleH = Math.min(maxY - minY, sourceHeight - sampleY)
        if (pass === 0 && sampleW > 0 && sampleH > 0) {
          c.globalAlpha = opacity * .93
          c.drawImage(scene, sampleX / sourceWidth * sw, sampleY / sourceHeight * sh,
            sampleW / sourceWidth * sw, sampleH / sourceHeight * sh, minX, minY, sampleW, sampleH)
        }
        if (pass === 0) { c.restore(); c.restore(); continue }
        c.globalAlpha = opacity * .055
        c.fillStyle = ink; c.fillRect(minX, minY, Math.max(0, maxX - minX), Math.max(0, maxY - minY))
        c.globalAlpha = opacity * (.12 + shard.light * .13)
        c.fillStyle = paint; c.fillRect(minX, minY, Math.max(0, maxX - minX), Math.max(0, maxY - minY))
        // Cached pixel artwork follows each shard's tilt, clipped to its edges.
        if (shard.print && artwork) {
          const p = shard.print, z = (shard.frontFacing ? -1 : 1) * shard.thickness / 2
          project(shard, p.x, p.y, z, printA)
          project(shard, p.x + p.w * printScale, p.y, z, printB)
          project(shard, p.x, p.y + p.h * printScale, z, printC)
          c.save(); c.globalAlpha = opacity * .94; c.imageSmoothingEnabled = false
          c.transform((printB.x - printA.x) / p.w, (printB.y - printA.y) / p.w,
            (printC.x - printA.x) / p.h, (printC.y - printA.y) / p.h, printA.x, printA.y)
          c.drawImage(artwork, p.sx, p.sy, p.w, p.h, 0, 0, p.w, p.h)
          c.restore()
        }
        c.restore()
        trace(c, face); c.globalAlpha = opacity * .45
        c.strokeStyle = ink; c.lineWidth = 2.6; c.stroke()
        for (let i = 0; i < face.length; i++) {
          const a = face[i], b = face[(i + 1) % face.length]
          const light = Math.max(.05, ((b.x - a.x) - (b.y - a.y)) / (Math.hypot(b.x - a.x, b.y - a.y) || 1) * .45 + .4)
          c.globalAlpha = opacity * Math.min(.88, .12 + light * .55 + fresnel * .3)
          c.strokeStyle = '#f6faf8'; c.lineWidth = .45 + fresnel * .35
          c.beginPath(); c.moveTo(a.x + .4, a.y - .3); c.lineTo(b.x + .4, b.y - .3); c.stroke()
        }
        c.restore()
      }
      c.restore()
    },
  }
}
