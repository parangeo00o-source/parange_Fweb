import type { FighterSide } from './angel-devil-motion'
const clamp = (n: number) => Math.max(0, Math.min(1, n))
export type Vital = { hp: number; before: number; hitAt: number; damage: number }
export type DuelVitals = { angel: Vital; devil: Vital; winner: FighterSide | null; round: number }
const fresh = (): Vital => ({ hp: 100, before: 100, hitAt: -Infinity, damage: 0 })

export const createDuelVitals = () => {
  let state: DuelVitals = { angel: fresh(), devil: fresh(), winner: null, round: 1 }
  let finishedAt = -Infinity
  return {
    hit(attacker: FighterSide, amount: number, now: number) {
      const target = attacker === 'angel' ? 'devil' : 'angel', v = state[target]
      if (state.winner || now === v.hitAt || amount <= 0) return null
      const damage = Math.min(v.hp, amount)
      v.before = v.hp; v.hp -= damage; v.damage = damage; v.hitAt = now
      if (v.hp === 0) { state.winner = attacker; finishedAt = now }
      return { target, damage } as const
    },
    update(now: number) {
      if (state.winner && now - finishedAt >= 1800) {
        state = { angel: fresh(), devil: fresh(), winner: null, round: state.round + 1 }
        finishedAt = -Infinity
      }
    },
    snapshot: () => state,
    reset() { state = { angel: fresh(), devil: fresh(), winner: null, round: 1 }; finishedAt = -Infinity },
  }
}

const hudFont = (size: number, italic = false) => `${italic ? 'italic ' : ''}800 ${size}px Arial, sans-serif`
const outlinedText = (c: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center') => {
  c.textAlign = align; c.font = hudFont(size, true); c.lineJoin = 'round'
  c.lineWidth = Math.max(2, size * .10); c.strokeStyle = '#192331'; c.strokeText(text, x, y)
  c.fillStyle = color; c.fillText(text, x, y)
}

// Resample each large source sprite once, rather than during every combat frame.
const portraitCache = new WeakMap<HTMLImageElement, HTMLCanvasElement>()
const fighterPortrait = (image: HTMLImageElement, side: FighterSide) => {
  if (!image.complete || image.naturalWidth === 0) return null
  const cached = portraitCache.get(image)
  if (cached) return cached
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 144
  const context = canvas.getContext('2d')!
  const crop = side === 'angel' ? { x: .41, y: .19, size: .54 } : { x: .15, y: .20, size: .50 }
  const size = Math.min(image.naturalWidth, image.naturalHeight) * crop.size
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'
  context.drawImage(image, image.naturalWidth * crop.x, image.naturalHeight * crop.y, size, size, 0, 0, 144, 144)
  portraitCache.set(image, canvas)
  return canvas
}

type MeterCell = { body: Path2D; fold: Path2D; glint: Path2D }
const meterLayouts = new Map<number, MeterCell[]>()
const meterCells = (width: number) => {
  const cached = meterLayouts.get(width)
  if (cached) return cached
  const cells: MeterCell[] = [], bx = 49, by = 11, bh = 12, lean = 4.8
  for (let x = bx - lean; x < bx + width + 4; x += 6.2) {
    const body = new Path2D(), fold = new Path2D(), glint = new Path2D()
    body.moveTo(x + lean + 1, by + .5); body.lineTo(x + lean + 3.1, by + .5)
    body.quadraticCurveTo(x + lean + 4.1, by + .5, x + lean + 3.6, by + 1.7)
    body.lineTo(x + 3.6, by + bh - 1.5)
    body.quadraticCurveTo(x + 3.2, by + bh - .4, x + 2.2, by + bh - .4)
    body.lineTo(x + .8, by + bh - .4)
    body.quadraticCurveTo(x - .2, by + bh - .4, x + .3, by + bh - 1.6)
    body.lineTo(x + lean + .2, by + 1.5)
    body.quadraticCurveTo(x + lean + .5, by + .5, x + lean + 1, by + .5); body.closePath()
    fold.moveTo(x + lean + 3.8, by + 1.5); fold.lineTo(x + 3.8, by + bh - 1.5)
    glint.moveTo(x + lean + 1.2, by + 1.2)
    glint.quadraticCurveTo(x + lean + .2, by + 3, x + 1, by + bh - 2)
    cells.push({ body, fold, glint })
  }
  // Retain only a few recent viewport widths, including portrait/landscape.
  if (meterLayouts.size >= 4) meterLayouts.delete(meterLayouts.keys().next().value!)
  meterLayouts.set(width, cells)
  return cells
}

// Fixed color stops are shared rather than rebuilding nested arrays every frame.
const hudStops: Record<string, readonly (readonly [number, string])[]> = {
  metal: [[0, '#ffffff'], [.16, '#edf5df'], [.27, '#9daea6'], [.4, '#344b55'], [.5, '#b9cbc4'], [.59, '#f8fbe9'], [.72, '#9cafac'], [.87, '#e4ede1'], [1, '#526771']],
  stageRim: [[0, '#c5c7ed'], [.4, '#8f90c2'], [.72, '#454578'], [1, '#b6b1dd']],
  stageFace: [[0, '#59529a'], [.35, '#413b81'], [.66, '#35235f'], [1, '#652959']],
  stageHeader: [[0, '#6b65a5'], [.5, '#4c4784'], [1, '#38366a']],
  angelRail: [[0, '#d9f8e5'], [.12, '#46c8a4'], [.4, '#184b60'], [.68, '#347b9b'], [1, '#b4e9e7']],
  devilRail: [[0, '#ffc5df'], [.12, '#e82c7e'], [.4, '#29142e'], [.68, '#8b2536'], [1, '#f98da2']],
  emptyMeter: [[0, '#05091d'], [.55, '#111831'], [1, '#26354b']],
  angelMeter: [[0, '#d2ffec'], [.25, '#73e4c5'], [.5, '#4fa8b5'], [.76, '#8bd4de'], [1, '#c5f1e8']],
  devilMeter: [[0, '#ffd4de'], [.25, '#e9658d'], [.5, '#ae3553'], [.76, '#d65a79'], [1, '#f9a6b6']],
  angelHatch: [[0, '#f2fff2'], [.2, '#b4f3dd'], [.48, '#73dabc'], [.68, '#68b6c8'], [.84, '#a9e4dd'], [1, '#7abecf']],
  devilHatch: [[0, '#fff1f6'], [.2, '#f9b3c8'], [.48, '#df628e'], [.68, '#ba3b5e'], [.84, '#ed9ab0'], [1, '#d6657f']],
  angelName: [[0, '#248f79'], [.45, '#235a70'], [1, '#203d52']],
  devilName: [[0, '#bd2069'], [.45, '#842337'], [1, '#321334']],
  portraitRim: [[0, '#fafbeb'], [.22, '#dde4d5'], [.46, '#a8b6ae'], [.65, '#586b70'], [.84, '#c5d2c3'], [1, '#eff5df']],
}

type HudPaints = { width: number; transform: DOMMatrix; linear: CanvasGradient[]; radial: CanvasGradient[] }
const hudPaintCache = new WeakMap<CanvasRenderingContext2D, HudPaints>()
const paintsFor = (c: CanvasRenderingContext2D, width: number) => {
  const transform = c.getTransform(), previous = hudPaintCache.get(c)
  if (previous && previous.width === width &&
    previous.transform.a === transform.a && previous.transform.b === transform.b &&
    previous.transform.c === transform.c && previous.transform.d === transform.d &&
    previous.transform.e === transform.e && previous.transform.f === transform.f) return previous
  // Gradients retain their creation transform. Rebuild on resize/DPR/translation
  // changes, retaining only one layout per context rather than an unbounded map.
  const paints: HudPaints = { width, transform, linear: [], radial: [] }
  hudPaintCache.set(c, paints)
  return paints
}

/** Compact arcade ribbon with softly beveled diagonal cells, character portraits
 * and an integrated stage plate. All details share the same logical scale. */
export const drawDuelHud = (c: CanvasRenderingContext2D, state: DuelVitals, now: number, width: number, height: number, opacity: number, reducedMotion: boolean, portraits: Record<FighterSide, HTMLImageElement>) => {
  if (opacity < .04) return
  const paints = paintsFor(c, width)
  let linearIndex = 0
  const scale = width < 500 ? 1 : 1.18, total = Math.min(width - 12, 1100)
  const w = total / scale, stageWidth = width < 500 ? 54 : 64
  const center = w / 2, panelWidth = (w - stageWidth) / 2 + 4, top = 6
  c.save(); c.globalAlpha = opacity; c.translate((width - total) / 2, top); c.scale(scale, scale)
  c.textBaseline = 'middle'; c.lineJoin = 'round'; c.lineCap = 'round'
  const gradient = (y: number, h: number, stops: readonly (readonly [number, string])[]) => {
    const index = linearIndex++, cached = paints.linear[index]
    if (cached) return cached
    const g = c.createLinearGradient(0, y, 0, y + h)
    for (const [at, color] of stops) g.addColorStop(at, color)
    paints.linear[index] = g
    return g
  }
  const polygon = (points: number[][]) => {
    c.beginPath(); points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath()
  }
  const metal = gradient(4, 28, hudStops.metal)
  const sx = center - stageWidth / 2
  const crest = (inset: number) => {
    c.beginPath(); c.moveTo(sx + 9 + inset, 1 + inset)
    c.lineTo(sx + stageWidth - 9 - inset, 1 + inset)
    c.quadraticCurveTo(sx + stageWidth - 5 - inset, 1 + inset, sx + stageWidth - 4 - inset, 5 + inset)
    c.lineTo(sx + stageWidth + 3 - inset, 29 - inset)
    c.quadraticCurveTo(sx + stageWidth + 4 - inset, 33 - inset, sx + stageWidth - inset, 33 - inset)
    c.lineTo(sx + inset, 33 - inset)
    c.quadraticCurveTo(sx - 4 + inset, 33 - inset, sx - 3 + inset, 29 - inset)
    c.lineTo(sx + 4 + inset, 5 + inset)
    c.quadraticCurveTo(sx + 5 + inset, 1 + inset, sx + 9 + inset, 1 + inset); c.closePath()
  }
  // A low, softly chamfered plate links both rails instead of standing above them.
  crest(0); c.shadowColor = 'rgba(8,15,35,.35)'; c.shadowBlur = 2; c.shadowOffsetY = 1
  c.fillStyle = gradient(1, 32, hudStops.stageRim); c.fill(); c.shadowBlur = 0; c.shadowOffsetY = 0
  c.strokeStyle = '#9598c8'; c.lineWidth = .8; c.stroke()
  crest(1.6); c.fillStyle = gradient(2, 30, hudStops.stageFace); c.fill()
  c.strokeStyle = '#bab4db'; c.lineWidth = .65; c.stroke()
  polygon([[sx + 9, 3], [sx + stageWidth - 9, 3], [sx + stageWidth - 6, 13], [sx + 6, 13]])
  c.fillStyle = gradient(3, 10, hudStops.stageHeader); c.fill()
  c.strokeStyle = '#aaa9cf'; c.lineWidth = .6
  c.beginPath(); c.moveTo(sx + 1, 31.5); c.lineTo(sx + stageWidth - 1, 31.5); c.stroke()
  // Small inset bevels give the indigo plate the reference's layered finish.
  c.strokeStyle = '#28234e'; c.lineWidth = .65
  c.beginPath(); c.moveTo(sx + 6, 13.5); c.lineTo(sx + stageWidth - 6, 13.5); c.stroke()
  c.strokeStyle = '#ffffff'
  c.beginPath(); c.moveTo(sx + 7, 14.5); c.lineTo(sx + stageWidth - 7, 14.5); c.stroke()
  c.beginPath(); c.moveTo(sx + 10, 3.2); c.lineTo(sx + stageWidth - 10, 3.2); c.stroke()

  for (const side of ['angel', 'devil'] as const) {
    const angel = side === 'angel', v = state[side], elapsed = now - v.hitAt
    const hit = clamp(1 - elapsed / 240)
    c.save(); c.translate(angel ? 0 : w, 0); c.scale(angel ? 1 : -1, 1)
    // The slim shared rail keeps a restrained slope at the center.
    const housing = (inset: number) => {
      c.beginPath(); c.moveTo(27, 7 + inset); c.lineTo(panelWidth - 4, 7 + inset)
      c.quadraticCurveTo(panelWidth + 1 - inset, 7 + inset, panelWidth - 1 - inset, 12 + inset)
      c.lineTo(panelWidth - 6 - inset, 27 - inset)
      c.quadraticCurveTo(panelWidth - 7 - inset, 31 - inset, panelWidth - 11, 31 - inset)
      c.lineTo(27, 31 - inset); c.closePath()
    }
    housing(0); c.shadowColor = '#142037'; c.shadowBlur = 2; c.shadowOffsetY = 1
    c.fillStyle = metal; c.fill(); c.shadowBlur = 0; c.shadowOffsetY = 0
    c.strokeStyle = angel ? '#247f70' : '#9b165f'; c.lineWidth = .85; c.stroke()
    housing(1.5); c.fillStyle = gradient(8, 23, angel
      ? hudStops.angelRail
      : hudStops.devilRail); c.fill()
    housing(3.3); c.fillStyle = '#080d27'; c.fill()
    c.strokeStyle = angel ? '#29576b' : '#661946'; c.lineWidth = .8; c.stroke()

    const bx = 49, by = 11, bw = panelWidth - 59, bh = 12
    c.save()
    polygon([[bx, by], [bx + bw + 4, by], [bx + bw - 2, by + bh], [bx, by + bh]]); c.clip()
    c.fillStyle = gradient(by, bh, hudStops.emptyMeter); c.fillRect(bx, by, bw + 4, bh)
    const cells = meterCells(bw)
    c.fillStyle = '#3e4958'
    for (const cell of cells) c.fill(cell.body)
    const chip = reducedMotion ? v.hp : v.hp + (v.before - v.hp) * (1 - clamp((elapsed - 100) / 330))
    c.save(); c.beginPath(); c.rect(bx, by, (bw + 4) * chip / 100, bh); c.clip()
    c.fillStyle = angel ? '#e4fff4' : '#ffd0d8'; c.fillRect(bx, by, bw + 4, bh)
    c.restore()
    c.save(); c.beginPath(); c.rect(bx, by, (bw + 4) * v.hp / 100, bh); c.clip()
    c.fillStyle = gradient(by, bh, angel
      ? hudStops.angelMeter
      : hudStops.devilMeter); c.fillRect(bx, by, bw + 4, bh)
    const hatchInk = gradient(by, bh, angel
      ? hudStops.angelHatch
      : hudStops.devilHatch)
    for (const cell of cells) {
      c.fillStyle = hatchInk; c.fill(cell.body)
      c.strokeStyle = angel ? 'rgba(10,77,76,.55)' : 'rgba(108,30,54,.55)'; c.lineWidth = .6; c.stroke(cell.fold)
      c.strokeStyle = angel ? 'rgba(240,255,222,.7)' : 'rgba(255,229,241,.65)'; c.lineWidth = .65; c.stroke(cell.glint)
    }
    // Narrow glass reflection and luminous lower edge preserve the fine striping.
    c.fillStyle = 'rgba(255,255,255,.16)'; c.fillRect(bx, by + .5, bw + 4, 1.2)
    c.fillStyle = angel ? '#ceffe4' : '#ffcfd7'; c.fillRect(bx, by + bh - 1, bw + 4, .65)
    c.restore()
    if (hit && !reducedMotion) { c.save(); c.globalAlpha *= hit * .42; c.fillStyle = '#ffffff'; c.fillRect(bx, by, bw + 4, bh); c.restore() }
    c.restore()
    // Recessed top seam and a compact enamel name strip recall the arcade fascia.
    c.strokeStyle = '#091723'; c.lineWidth = .65
    c.beginPath(); c.moveTo(bx, by - .7); c.lineTo(panelWidth - 6, by - .7); c.stroke()
    const nameEnd = Math.min(panelWidth - 11, 116)
    polygon([[49, 24], [nameEnd, 24], [nameEnd - 5, 30], [49, 30]])
    c.fillStyle = gradient(24, 6, angel
      ? hudStops.angelName
      : hudStops.devilName); c.fill()
    c.strokeStyle = angel ? '#a9edda' : '#f9a3b2'; c.lineWidth = .55
    c.beginPath(); c.moveTo(50, 24.3); c.lineTo(nameEnd - 1, 24.3); c.lineTo(nameEnd - 5, 29.5); c.stroke()
    // Long, hairline highlights define the polished metal bevel.
    c.strokeStyle = angel ? '#ddffe8' : '#ffdce6'; c.lineWidth = .7
    c.beginPath(); c.moveTo(48, 8.5); c.lineTo(panelWidth - 4, 8.5); c.stroke()
    c.strokeStyle = angel ? '#71bfae' : '#d65b70'
    c.beginPath(); c.moveTo(48, 29.5); c.lineTo(panelWidth - 10, 29.5); c.stroke()
    c.restore()

    c.save(); c.textAlign = angel ? 'left' : 'right'; c.font = hudFont(7, true)
    c.fillStyle = angel ? '#d4ffdf' : '#ffe0ea'
    c.fillText(angel ? 'A N G E L' : 'D E V I L', angel ? 54 : w - 54, 27); c.restore()

    // Health remains live, tucked inside the bar instead of adding another panel.
    const hpX = angel ? panelWidth - 13 : w - panelWidth + 13
    c.save(); c.textAlign = angel ? 'right' : 'left'; c.font = hudFont(8.5, true)
    c.lineWidth = 2.7; c.strokeStyle = '#101928'; c.fillStyle = '#f5fbff'
    c.strokeText(`${v.hp}`, hpX, 17.6); c.fillText(`${v.hp}`, hpX, 17.6); c.restore()

    // A wider circular aperture shows the actual fighter's eyes and expression.
    // Crop the source sprite at draw time so the profile always matches the battle art.
    const badgeX = angel ? 26 : w - 26, badgeY = 23
    c.save(); c.translate(badgeX, badgeY)
    c.beginPath(); c.arc(0, 0, 25, 0, Math.PI * 2)
    c.shadowColor = 'rgba(5,14,32,.4)'; c.shadowBlur = 2.5; c.shadowOffsetY = 1
    c.fillStyle = gradient(-25, 50, hudStops.portraitRim); c.fill()
    c.shadowBlur = 0; c.shadowOffsetY = 0; c.strokeStyle = angel ? '#338775' : '#a52268'; c.lineWidth = .9; c.stroke()
    c.beginPath(); c.arc(0, 0, 23, 0, Math.PI * 2)
    c.fillStyle = angel ? '#4bc4a3' : '#e63b84'; c.fill()
    c.save(); c.beginPath(); c.arc(0, 0, 21.8, 0, Math.PI * 2); c.clip()
    const portraitIndex = angel ? 0 : 1
    let backdrop = paints.radial[portraitIndex]
    if (!backdrop) {
      backdrop = c.createRadialGradient(angel ? 5 : -5, -5, 2, 0, 0, 28)
      backdrop.addColorStop(0, angel ? '#62a9be' : '#b44879')
      backdrop.addColorStop(1, angel ? '#274b60' : '#35213b')
      paints.radial[portraitIndex] = backdrop
    }
    c.fillStyle = backdrop; c.fillRect(-23, -23, 46, 46)
    const portrait = fighterPortrait(portraits[side], side)
    if (portrait) c.drawImage(portrait, -22, -22, 44, 44)
    c.restore()
    c.beginPath(); c.arc(0, 0, 22.2, 0, Math.PI * 2)
    c.strokeStyle = angel ? '#b5edda' : '#f9a6b6'; c.lineWidth = .65; c.stroke()
    c.beginPath(); c.arc(0, 0, 24, Math.PI * 1.08, Math.PI * 1.85)
    c.strokeStyle = 'rgba(244,251,255,.75)'; c.lineWidth = .8; c.stroke()
    c.beginPath(); c.arc(0, 0, 23.8, .12, Math.PI * .85)
    c.strokeStyle = angel ? '#358773' : '#a7374e'; c.lineWidth = .65; c.stroke()
    c.restore()
  }

  // Gold and warm-white lettering echo the arcade reference stage plate.
  c.textAlign = 'center'; c.font = hudFont(7.5); c.fillStyle = '#ffe576'
  c.fillText('STAGE', center, 8.6)
  const mod100 = state.round % 100, suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][state.round % 10] ?? 'th'
  c.font = hudFont(15, true); c.strokeStyle = '#36254f'; c.lineWidth = 1.6
  c.strokeText(`${state.round}${suffix}`, center, 23)
  c.fillStyle = '#fff3db'; c.fillText(`${state.round}${suffix}`, center, 23)
  if (state.winner) {
    const winY = Math.min(height * .45, 109) / scale
    outlinedText(c, `${state.winner === 'angel' ? 'ANGEL' : 'DEVIL'} WINS!`, center, winY, Math.min(29, width * .065) / scale, state.winner === 'angel' ? '#d6ffed' : '#ff8abd')
  }
  c.restore()
}

type DamageNumber = { side: FighterSide; damage: number; at: number; x: number; y: number; size: number }
export const createDamageNumbers = () => {
  const entries: DamageNumber[] = []
  return {
    emit(side: FighterSide, damage: number, at: number, x: number, y: number, size: number) {
      if (entries.length >= 6) entries.shift()
      entries.push({ side, damage, at, x, y, size })
    },
    draw(c: CanvasRenderingContext2D, now: number, reducedMotion: boolean) {
      for (let i = entries.length - 1; i >= 0; i--) if (now - entries[i].at >= 700 || now < entries[i].at) entries.splice(i, 1)
      for (const entry of entries) {
        const t = (now - entry.at) / 700, pop = reducedMotion ? 1 : 1 + .25 * Math.exp(-t * 12)
        c.save(); c.globalAlpha = 1 - clamp((t - .45) / .55)
        c.translate(entry.x + (reducedMotion ? 0 : (entry.side === 'angel' ? -1 : 1) * t * 14), entry.y - (reducedMotion ? 0 : t * 35)); c.scale(pop, pop)
        const size = Math.max(20, Math.min(30, entry.size * .2))
        const ink = c.createLinearGradient(0, -size / 2, 0, size / 2)
        const angelAttack = entry.side === 'devil'
        ink.addColorStop(0, angelAttack ? '#ffffff' : '#ffcfd7'); ink.addColorStop(.46, angelAttack ? '#a3efd0' : '#df3276'); ink.addColorStop(1, angelAttack ? '#6aa8cd' : '#bb354b')
        c.font = hudFont(size, true); c.textAlign = 'center'; c.textBaseline = 'middle'
        c.lineJoin = 'round'; c.lineWidth = 3; c.strokeStyle = '#182249'; c.strokeText(`−${entry.damage}`, 0, 0)
        c.lineWidth = 1; c.strokeStyle = angelAttack ? '#effff7' : '#ffc1cd'; c.strokeText(`−${entry.damage}`, 0, 0); c.fillStyle = ink; c.fillText(`−${entry.damage}`, 0, 0)
        outlinedText(c, 'HIT!', 0, size * .8, size * .47, angelAttack ? '#d8ffed' : '#ff8abd', 'center')
        c.restore()
      }
    },
    reset() { entries.length = 0 },
  }
}
