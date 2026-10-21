export type BirdFingerTarget = { key: string; x: number; y: number; horizontal: boolean; direction: number; palmX?: number; palmY?: number; span?: number; perchPath?: { x: number; y: number }[] }
type GatheringBird = { at: number; arrivalDuration: number; departureAt: number; departureDuration: number; x: number; y: number; fromX: number; fromY: number; size: number; color: number; phase: number; slot: number; targetKey: string }
type PerchGeometry = { points: { x: number; y: number }[]; lengths: number[]; total: number }
const PERCH_FLUTTER = [5, 6, 5, 4, 5, 6, 5]

// Every pose shares the seated bird's body, face, palette and dotted plumage.
// Only wings and feet change; the body stays at the same atlas anchor.
const paintBird = (c: CanvasRenderingContext2D, frame: number) => {
  if (frame !== 4) {
    const angle = [-1.1, -.35, .75, -.35, 0, .65, .15][frame]
    for (const far of [true, false]) {
      c.save(); c.translate(184, 166); c.rotate(angle + (far ? -.2 : 0)); c.scale(far ? .75 : 1, far ? .8 : 1)
      if (frame >= 5) c.scale(.65, .65)
      const wing = new Path2D('M0 0 Q-5 -46 36 -90 Q48 -98 42 -78 L59 -92 Q70 -94 60 -73 L75 -83 Q86 -83 74 -62 L86 -68 Q95 -65 81 -47 L91 -48 Q101 -42 81 -28 Q52 1 0 0Z')
      const ink = c.createLinearGradient(0, -90, 60, 0)
      ink.addColorStop(0, '#e0fff4'); ink.addColorStop(.4, '#45ffdd'); ink.addColorStop(1, '#05c6c4')
      c.fillStyle = ink; c.fill(wing)
      c.clip(wing); c.fillStyle = '#b530ff'
      for (let y = -90; y < 15; y += 17) for (let x = 0; x < 100; x += 18) {
        c.beginPath(); c.arc(x + (y % 34 ? 8 : 0), y, 4.6, 0, Math.PI * 2); c.fill()
      }
      c.restore()
    }
  }
  const body = new Path2D('M154 162 C127 158 117 132 132 116 C149 97 177 108 182 132 C211 137 229 162 231 189 L281 228 Q247 230 223 211 C207 233 168 229 153 207 C145 194 147 175 154 162Z')
  const ink = c.createLinearGradient(135, 110, 235, 225)
  ink.addColorStop(0, '#ddffef'); ink.addColorStop(.38, '#45ffdd'); ink.addColorStop(1, '#05c6c4')
  c.fillStyle = ink; c.fill(body)
  c.save(); c.clip(body); c.fillStyle = '#b530ff'
  for (let y = 120; y < 240; y += 18) for (let x = 126; x < 285; x += 18) {
    c.beginPath(); c.arc(x + (y % 36 ? 8 : 0), y, 4.6, 0, Math.PI * 2); c.fill()
  }
  c.restore()
  c.fillStyle = '#80ffec'; c.beginPath(); c.moveTo(128, 135); c.lineTo(110, 144); c.lineTo(132, 147); c.fill()
  c.fillStyle = '#17255a'; c.beginPath(); c.arc(144, 131, 3.5, 0, Math.PI * 2); c.fill()
  c.strokeStyle = '#c1fff3'; c.lineWidth = 4; c.lineCap = 'round'
  c.beginPath(); c.moveTo(182, 153); c.quadraticCurveTo(166, 189, 215, 205); c.stroke()
  c.strokeStyle = '#ffdc66'; c.lineWidth = 3
  for (const x of [174, 198]) {
    const footY = frame >= 4 ? 248 : 231
    c.beginPath(); c.moveTo(x, 220); c.lineTo(x, footY); c.lineTo(x - 9, footY + 2); c.moveTo(x, footY); c.lineTo(x + 7, footY + 2); c.stroke()
  }
}

const hues = [0, 65, 130, 190, 245, 315]
export const createBirdFlock = () => {
  let sprites: HTMLCanvasElement[][] = []
  let flights: GatheringBird[] = []
  let targets: BirdFingerTarget[] = [], gathering = false
  let perches: PerchGeometry[] = [], geometryDirty = true, geometryWidth = 0, geometryHeight = 0
  const prepare = () => {
    if (sprites.length) return Promise.resolve()
    sprites = hues.map(hue => Array.from({ length: 7 }, (_, frame) => {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 384
      const c = canvas.getContext('2d')!
      c.filter = `hue-rotate(${hue}deg) saturate(1.45) brightness(1.25)`
      paintBird(c, frame)
      return canvas
    }))
    return Promise.resolve()
  }
  return {
    prepare,
    gather(now: number, anchors: BirdFingerTarget[]) {
      if (!anchors.length) return
      targets = anchors.slice(0, 2).sort((a, b) => a.key.localeCompare(b.key))
      geometryDirty = true
      if (gathering) return
      gathering = true
      const previous = flights
      flights = Array.from({ length: 18 }, (_, i) => {
        const returning = previous.find(bird => bird.slot === i && now < bird.departureAt + bird.departureDuration)
        const fromX = returning?.x ?? (i % 2 ? 1.14 : -.14), fromY = returning?.y ?? (.15 + (i % 6) * .13)
        return { at: now + (returning ? 0 : i % 6 * 95 + Math.floor(i / 6) * 80),
          arrivalDuration: returning ? 700 : 950 + (i * 7 % 5) * 100, departureAt: Infinity, departureDuration: 0,
          x: fromX, y: fromY, fromX, fromY,
          size: .58 + (i % 5) * .085, color: i % hues.length, phase: i * 2.4, slot: i, targetKey: '' }
      })
      flights.sort((a, b) => a.size - b.size)
    },
    release(now: number) {
      if (!gathering) return
      gathering = false
      for (const bird of flights) {
        bird.fromX = bird.x; bird.fromY = bird.y
        // Each bird reacts, lifts off and leaves at its own pace.
        bird.departureAt = now + (now < bird.at ? 0 : bird.slot * 7 % 18 * 44)
        bird.departureDuration = now < bird.at ? 0 : 1200 + (bird.slot * 11 % 7) * 150
      }
    },
    active: (now: number) => flights.some(bird => gathering || now < bird.departureAt + bird.departureDuration),
    draw(c: CanvasRenderingContext2D, now: number, width: number, height: number, reducedMotion: boolean) {
      if (!sprites.length) return
      if (!gathering && flights.every(bird => now >= bird.departureAt + bird.departureDuration)) { flights = []; return }
      const baseSize = Math.max(120, Math.min(245, Math.min(width, height) * .34)) * .42
      if (geometryDirty || geometryWidth !== width || geometryHeight !== height) {
        perches = targets.map(anchor => {
          const path = anchor.perchPath ?? [{ x: anchor.x, y: anchor.y },
            { x: anchor.palmX ?? anchor.x - anchor.direction * .2, y: anchor.palmY ?? anchor.y }]
          const points = path.map(p => ({ x: Math.max(0, Math.min(width, p.x * width)), y: Math.max(0, Math.min(height, p.y * height)) }))
          const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y))
          return { points, lengths, total: lengths.reduce((a, b) => a + b, 0) }
        })
        geometryDirty = false; geometryWidth = width; geometryHeight = height
      }
      for (const bird of flights) {
        if (!gathering && now >= bird.departureAt + bird.departureDuration) continue
        const anchor = targets[bird.slot % targets.length]
        const identity = `${anchor.key}:${anchor.horizontal}:${targets.length}`
        if (gathering && bird.targetKey !== identity) {
          if (bird.targetKey) { bird.at = now; bird.arrivalDuration = 650; bird.fromX = bird.x; bird.fromY = bird.y }
          bird.targetKey = identity
        }
        if (now < bird.at) continue
        const age = (now - bird.at) / 1000
        const beat = now / 1000 * 2.8 + bird.phase
        const groupSize = 18 / targets.length, rank = Math.floor(bird.slot / targets.length)
        const atTip = !anchor.horizontal && rank < 2
        const resting = atTip || bird.slot % 4 === 0
        const perched = gathering && (anchor.horizontal || resting) && age * 1000 >= (reducedMotion ? 150 : bird.arrivalDuration)
        const flutter = (now / 1000 + bird.phase) % (2.8 + bird.slot % 3 * .6)
        const perchFrame = reducedMotion || flutter > .56 ? 4 : PERCH_FLUTTER[Math.min(6, Math.floor(flutter / .08))]
        const frame = perched ? perchFrame : reducedMotion ? 1 : Math.floor(beat * 4) % 4
        const size = baseSize * bird.size
        const orbit = bird.phase + (reducedMotion ? 0 : now * (.00032 + bird.slot % 5 * .00007))
        const unit = Math.min(width, height)
        const handSize = Math.max(unit * .09, Math.min(unit * .22, (anchor.span ?? .14) * unit))
        const radius = handSize * (.65 + bird.slot % 3 * .32)
        const palmX = anchor.palmX ?? anchor.x, palmY = anchor.palmY ?? anchor.y + handSize * .5 / height
        const localX = resting ? Math.sin(bird.phase) * handSize * .5 : Math.cos(orbit) * radius
        const localY = resting ? -(bird.slot % 3) * handSize * .28
          : Math.sin(orbit) * radius * .65 - handSize * .35 + (reducedMotion ? 0 : Math.sin(now * .0012 + bird.phase) * handSize * .13)
        const perch = perches[bird.slot % targets.length]
        // Fill from fingertip inward, then continue over the hand and wrist.
        // Reserve room at both ends so the last bird does not sit beyond the limb.
        const margin = Math.min(baseSize * .16, perch.total * .1)
        const spacing = Math.min(baseSize * .34, Math.max(0, perch.total - margin * 2) / (groupSize - 1))
        let seat = perch.points[0]
        if (anchor.horizontal) {
          let distance = margin + rank * spacing
          for (let i = 0; i < perch.lengths.length; i++) {
            const length = perch.lengths[i]
            if (distance <= length || i === perch.lengths.length - 1) {
              const t = length ? Math.min(1, distance / length) : 0
              seat = { x: perch.points[i].x + (perch.points[i + 1].x - perch.points[i].x) * t,
                y: perch.points[i].y + (perch.points[i + 1].y - perch.points[i].y) * t }
              break
            }
            distance -= length
          }
        }
        const targetX = anchor.horizontal ? seat.x / width
          : atTip ? Math.max(size / width, Math.min(1 - size / width, anchor.x + (rank - .5) * unit * .025 / width))
          : Math.max(size / width, Math.min(1 - size / width, palmX + localX / width))
        const targetY = anchor.horizontal ? (seat.y - 2) / height
          : atTip ? Math.max(size / height, anchor.y - .008 - rank * unit * .015 / height)
          : Math.max(size / height, Math.min(1 - size / height, palmY + localY / height))
        const progress = Math.min(1, age * 1000 / (reducedMotion ? 150 : bird.arrivalDuration))
        const ease = progress * progress * (3 - 2 * progress)
        if (gathering) {
          bird.x = bird.fromX + (targetX - bird.fromX) * ease
          bird.y = bird.fromY + (targetY - bird.fromY) * ease - (reducedMotion ? 0 : Math.sin(progress * Math.PI) * (.025 + bird.slot % 4 * .012))
        } else {
          const exit = Math.max(0, Math.min(1, (now - bird.departureAt) / bird.departureDuration))
          const travel = exit * .22 + exit * exit * .78
          const endX = bird.slot % 2 ? 1.15 : -.15
          bird.x = bird.fromX + (endX - bird.fromX) * travel
          bird.y = bird.fromY - (.18 + bird.slot % 5 * .065) * travel - (reducedMotion ? 0 : Math.sin(exit * Math.PI) * .045)
        }
        const facing = perched ? (anchor.direction < 0 ? 1 : -1) : gathering ? (bird.x > anchor.x ? 1 : -1) : (bird.slot % 2 ? -1 : 1)
        c.save()
        c.globalAlpha = 1
        c.translate(bird.x * width, bird.y * height + (perched || reducedMotion ? 0 : Math.sin(beat * Math.PI * 2) * size * .025))
        c.rotate(reducedMotion ? 0 : perched ? Math.sin(now * .0016 + bird.phase) * .022 : Math.sin(orbit) * .12)
        c.scale(facing, 1)
        c.drawImage(sprites[bird.color][frame], -size * .5, -size * (250 / 384), size, size)
        c.restore()
      }
    },
    reset() { flights = []; gathering = false; perches = []; geometryDirty = true },
    dispose() {
      flights = []; gathering = false; perches = []; geometryDirty = true
      for (const palette of sprites) for (const sprite of palette) { sprite.width = 0; sprite.height = 0 }
      sprites = []
    },
  }
}
