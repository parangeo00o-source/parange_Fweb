type Point = { x: number; y: number }
type StrikeTexture = { key: string; canvas: HTMLCanvasElement; x: number; y: number; width: number; height: number; tip: Point }
export type LightningBolt = { x: number; y: number; length: number; width: number; offset: number; seed: number; texture?: StrikeTexture }
const TAU = Math.PI * 2
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))

// Fractal geometry and soft plasma are rasterized once per strike variant, not
// as dozens of blurred paths on every camera frame.
const prepareStrike = (bolt: LightningBolt, width: number, height: number, variation: number): StrikeTexture => {
  const key = `${width}:${height}:${variation % 3}`
  if (bolt.texture?.key === key) return bolt.texture
  let seed = Math.round(bolt.seed * 104729) + variation % 3 * 8191
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  const jagged = (a: Point, b: Point, amount: number, depth: number): Point[] => {
    if (!depth) return [a, b]
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.max(1, Math.hypot(dx, dy))
    const along = .38 + random() * .24, offset = (random() - .5) * amount
    const mid = { x: a.x + dx * along - dy / length * offset, y: a.y + dy * along + dx / length * offset }
    return [...jagged(a, mid, amount * .55, depth - 1).slice(0, -1), ...jagged(mid, b, amount * .55, depth - 1)]
  }
  const pad = 40, top = height * bolt.y
  const trunk = jagged({ x: width * bolt.x, y: top }, { x: clamp(width * (bolt.x + (random() - .5) * .18), 20, width - 20), y: Math.min(height - 80, top + height * bolt.length) }, Math.min(140, width * .26), 6)
  const paths: { points: Point[]; thickness: number }[] = [{ points: trunk, thickness: 1 }]
  for (const [i, index] of [13, 25, 37, 48].entries()) {
    const start = trunk[index], direction = i % 2 ? 1 : -1
    const end = { x: clamp(start.x + direction * width * (.09 + random() * .10), 10, width - 10), y: Math.min(height - 70, start.y + height * (.06 + random() * .12)) }
    const branch = jagged(start, end, Math.min(45, width * .10), 4)
    paths.push({ points: branch, thickness: .48 })
    const fork = branch[8]
    paths.push({ points: jagged(fork, { x: clamp(fork.x - direction * width * .07, 8, width - 8), y: fork.y + height * .045 }, width * .035, 3), thickness: .22 })
  }
  const points = paths.flatMap(p => p.points)
  const x = Math.floor(Math.min(...points.map(p => p.x)) - pad), y = Math.floor(top - pad)
  const w = Math.ceil(Math.max(...points.map(p => p.x)) - x + pad), h = Math.ceil(Math.max(...points.map(p => p.y)) - y + pad)
  const canvas = document.createElement('canvas'), density = 1.5
  canvas.width = Math.ceil(w * density); canvas.height = Math.ceil(h * density)
  const c = canvas.getContext('2d')!; c.scale(density, density); c.translate(-x, -y)
  c.lineCap = 'round'; c.lineJoin = 'round'
  for (const branch of paths) {
    const path = new Path2D(); path.moveTo(branch.points[0].x, branch.points[0].y)
    for (const p of branch.points.slice(1)) path.lineTo(p.x, p.y)
    const thickness = bolt.width * branch.thickness
    for (const [color, scale, blur, alpha] of [
      ['#4e2047', 7, 25, .48], ['#da225b', 4.2, 16, .8], ['#ff5369', 2.2, 7, 1], ['#ffc5b0', 1, 3, 1], ['#fff4df', .4, 0, 1],
    ] as [string, number, number, number][]) {
      c.globalAlpha = alpha; c.strokeStyle = color; c.shadowColor = color; c.shadowBlur = blur
      c.lineWidth = Math.max(.45, thickness * scale); c.stroke(path)
    }
  }
  // Fine parallel filaments give the main discharge a split plasma edge.
  c.shadowBlur = 3; c.shadowColor = '#ff6592'; c.globalAlpha = .7; c.strokeStyle = '#ff9daf'; c.lineWidth = .75
  for (const direction of [-1, 1]) {
    c.beginPath()
    for (let i = 0; i < trunk.length; i++) {
      const p = trunk[i], dx = direction * (3 + Math.sin(i * 1.8) * 2)
      if (i === 0) c.moveTo(p.x + dx, p.y)
      else c.lineTo(p.x + dx, p.y)
    }
    c.stroke()
  }
  c.shadowBlur = 0; c.globalAlpha = .8; c.strokeStyle = '#ffb2c3'; c.lineWidth = .6
  for (let i = 4; i < trunk.length - 4; i += 7) {
    const p = trunk[i], r = 4 + random() * 5
    c.beginPath(); c.moveTo(p.x - r, p.y); c.lineTo(p.x + r, p.y); c.moveTo(p.x, p.y - r); c.lineTo(p.x, p.y + r); c.stroke()
  }
  bolt.texture = { key, canvas, x, y, width: w, height: h, tip: trunk[trunk.length - 1] }
  return bolt.texture
}

export const drawLightningField = (c: CanvasRenderingContext2D, bolts: LightningBolt[], elapsed: number, fade: number, width: number, height: number) => {
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round'
  for (const bolt of bolts) {
    const time = elapsed + bolt.offset, cycle = Math.floor(time / 1240), age = time % 1240
    if (age > 420) continue
    // A fast leading strike and a weaker after-discharge; never a full-screen flash.
    const primary = Math.exp(-Math.max(0, age - 65) / 190), echo = age > 110 ? Math.exp(-(age - 110) / 80) * .45 : 0
    const alpha = Math.min(1, primary + echo) * fade
    const texture = prepareStrike(bolt, width, height, cycle)
    c.save(); c.beginPath(); c.rect(texture.x, texture.y, texture.width, texture.height * Math.min(1, (age + 14) / 55)); c.clip()
    c.globalAlpha = alpha; c.drawImage(texture.canvas, texture.x, texture.y, texture.width, texture.height); c.restore()
    if (age < 45) continue
    const p = (age - 45) / 375, x = texture.tip.x, y = texture.tip.y
    c.save(); c.translate(x, y)
    const radius = 15 + p * 42, glow = c.createRadialGradient(0, 0, 0, 0, 0, radius * 2)
    glow.addColorStop(0, 'rgba(255,221,174,.8)'); glow.addColorStop(.18, 'rgba(247,86,95,.55)'); glow.addColorStop(1, 'transparent')
    c.globalAlpha = alpha; c.fillStyle = glow; c.fillRect(-radius * 2, -radius * 2, radius * 4, radius * 4)
    c.strokeStyle = '#ff8d9b'; c.lineWidth = 1.5 * (1 - p) + .4
    c.beginPath(); c.ellipse(0, 0, radius, radius * .32, -.15, 0, TAU); c.stroke()
    for (let i = 0; i < 12; i++) {
      const angle = i * 2.399 + bolt.seed, distance = 6 + p * (24 + i % 4 * 12)
      const sx = Math.cos(angle) * distance, sy = Math.sin(angle) * distance - p * 8
      c.strokeStyle = i % 3 ? '#ffbba6' : '#e876ad'; c.lineWidth = i % 3 ? 1.1 : 1.8
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx + Math.cos(angle) * (3 + 7 * (1 - p)), sy + Math.sin(angle) * (3 + 7 * (1 - p))); c.stroke()
    }
    c.restore()
  }
  c.restore()
}
