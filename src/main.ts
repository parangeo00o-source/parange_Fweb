import './style.css'
import { createCameraCapture } from './camera-capture'

type SymbolType = 'pip' | 'letter' | 'heart' | 'clover' | 'arrow' | 'double' | 'star' | 'paw' | 'lemon' | 'droplet' | 'balloon' | 'shampoo'
type Destination = { route: string; label: string }
type Dice = { id: string; color: string; markColor: string; texture: string; symbol: SymbolType; value: number | string; tilt: number; rounding: string; navigable: boolean } & Destination

const destinations: Destination[] = [
  { route: '#about', label: 'About' },
  { route: '#products', label: 'Products' },
  { route: '#work', label: 'Work' },
  { route: '#contact', label: 'Contact' },
]

// Fixed row order sampled from the reference: lavender, pale pink, charcoal,
// mustard, olive, mint, wine, navy, cream, teal, and a few saturated accents.
// This deliberately avoids local colour-clustering or runtime randomisation.
const shuffledColors = [
  '#A692DD', '#D7B8D3', '#302B2A', '#E2D553', '#8B7C20', '#B4D7C6', '#AC71A7', '#EAE7E1',
  '#626A7E', '#713323', '#5C50C6', '#4B3F36', '#8B1431', '#C58EAD', '#D6CAE8', '#41334D',
  '#A98CE4', '#D49CCA', '#CB8ECC', '#D6A1D0', '#C997D0', '#AC71BD', '#EEEBE7', '#79609B',
  '#8A1630', '#193341', '#A9CDBD', '#6E2BDC', '#35333A', '#286A35', '#DED6EB', '#A76BC2',
  '#8B1A2D', '#D4D163', '#235B71', '#581B3A', '#8A182A', '#AD765C', '#E8E5E1', '#4B61BB',
  '#29373C', '#116C64', '#095951', '#D3D2E4', '#E9D244', '#D0178E', '#F0EEE9', '#948DD5',
]

const lightMarkColors = ['#fff8e9', '#f2f8ff', '#ffdff0', '#e2fff0', '#fff1c7']
const darkMarkColors = ['#211b42', '#183e54', '#5a1d42', '#274938', '#59420f']
const luminance = (color: string) => {
  const channels = color.match(/[\da-f]{2}/gi)?.map((channel) => Number.parseInt(channel, 16) / 255) ?? [0, 0, 0]
  const [red, green, blue] = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4))
  return red * 0.2126 + green * 0.7152 + blue * 0.0722
}
const markColorFor = (diceColor: string, index: number) => {
  const palette = luminance(diceColor) < 0.28 ? lightMarkColors : darkMarkColors
  return palette[(index * 3 + 1) % palette.length]
}

const symbols: Array<{ type: SymbolType; value: number | string }> = [
  { type: 'pip', value: 4 }, { type: 'letter', value: '' }, { type: 'heart', value: '♥' }, { type: 'pip', value: 6 },
  { type: 'letter', value: '' }, { type: 'double', value: '' }, { type: 'clover', value: '✣' }, { type: 'arrow', value: '↗' },
  { type: 'letter', value: '' }, { type: 'pip', value: 3 }, { type: 'letter', value: '' }, { type: 'heart', value: '♥' },
  { type: 'pip', value: 5 }, { type: 'letter', value: '' }, { type: 'clover', value: '✣' }, { type: 'arrow', value: '⌁' },
  { type: 'letter', value: '' }, { type: 'pip', value: 2 },
]

// The reference is primarily polished acrylic, with only occasional satin,
// translucent, and pearlescent pieces for variation.
const textureNames = ['gloss', 'gloss', 'gel', 'gloss', 'pearl', 'matte']
// Kept as shared profiles for every face of one die, so the soft cube silhouette
// stays continuous while the amount of roundness varies across the grid.
const roundingProfiles = [
  '7px 8px 7px 8px', '8px 7px 9px 7px', '8px 9px 7px 9px',
  '9px 8px 10px 7px', '7px 10px 8px 9px', '10px 8px 9px 10px',
  '7px 9px 7px 9px', '9px 7px 10px 8px',
]
const seededShuffle = <T,>(items: T[], seed: number) => {
  const shuffled = [...items]
  let state = seed
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = (state * 1664525 + 1013904223) >>> 0
    const swapIndex = state % (index + 1)
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}

// Exactly seven former text dice carry the PARANGE letters. Their locations and
// letter order are shuffled once, while all remaining text slots become icons.
const letterDiceCandidates = Array.from({ length: 48 }, (_, index) => index).filter((index) => {
  const symbol = symbols[(index * 7 + 3) % symbols.length]
  return symbol.type === 'letter' || symbol.type === 'double'
})
const selectedLetterDice = seededShuffle(letterDiceCandidates, 241).slice(0, 7)
const parangeLetters = seededShuffle(['P', 'A', 'R', 'A', 'N', 'G', 'E'], 709)
const parangeLetterByDice = new Map(selectedLetterDice.map((index, letterIndex) => [index, parangeLetters[letterIndex]]))
// Keep Lemonade on its original shuffled die, and place a separate E die at
// column 2, row 3 for its own destination.
const originalEIndex = [...parangeLetterByDice.entries()].find(([, letter]) => letter === 'E')?.[0]
const bluefishDiceIndex = [...parangeLetterByDice.entries()].find(([, letter]) => letter === 'P')?.[0]
const lemonadeDiceIndex = originalEIndex ?? 25
if (originalEIndex !== undefined) parangeLetterByDice.delete(originalEIndex)
parangeLetterByDice.set(17, 'E')
const graphicSymbols: Array<{ type: Extract<SymbolType, 'heart' | 'clover' | 'star' | 'paw'>; value: string }> = [
  { type: 'heart', value: '♥' },
  { type: 'paw', value: '🐾' },
  { type: 'star', value: '✦' },
  { type: 'clover', value: '☘' },
]
const dice: Dice[] = Array.from({ length: 48 }, (_, index) => {
  const symbol = symbols[(index * 7 + 3) % symbols.length]
  // The upper A is the tooth-jewel camera entry; retain the lower A's
  // existing drawing-board destination.
  const isToothGemDie = index === 4
  const isElephantDrawingDie = parangeLetterByDice.get(index) === 'A' && !isToothGemDie
  const isFramingBlueprintDie = parangeLetterByDice.get(index) === 'R'
  const destination = isToothGemDie
    ? { route: '#tooth-gem', label: 'Tooth Gem' }
    : isFramingBlueprintDie
    ? { route: '#framing-blueprint', label: 'Framing Blueprint' }
    : isElephantDrawingDie
    ? { route: '#elephant-drawing', label: 'Elephant Drawing' }
    : index === 47
    ? { route: '#watertouch', label: 'WaterTouch' }
    : index === 39
      ? { route: '#balloon', label: 'Balloon' }
    : index === bluefishDiceIndex
      ? { route: '#bluefish', label: 'Bluefish' }
    : index === lemonadeDiceIndex
    ? { route: '#lemonade', label: 'Lemonade' }
    : index === 17
      ? { route: '#e', label: 'PARANGE PLANET' }
    : destinations[index % destinations.length]
  const isTextSlot = symbol.type === 'letter' || symbol.type === 'double'
  const replacement = isTextSlot && !parangeLetterByDice.has(index)
    ? graphicSymbols[(index * 5 + 2) % graphicSymbols.length]
    : null
  const isWaterTouchDie = index === 47
  // G is reserved for the glass-bird camera experience.
  const isBirdImpactDie = parangeLetterByDice.get(index) === 'G'
  // The N in the shuffled PARANGE set is the entry to the wink duel. Resolve
  // it from its letter instead of freezing a position in the shuffled grid.
  const isAngelDevilDie = parangeLetterByDice.get(index) === 'N'
  const isBalloonDie = index === 39
  const isLemonadeDie = index === lemonadeDiceIndex
  // The first die is the entry point for Shampoo.
  const isShampooDie = index === 0
  // The upper-right die is the entry point for the new camera experiment.
  const isRubberHumanDie = index === 7
  const rubberHumanDestination = { route: '#rubber-human', label: '고무 인간' }
  const shampooDestination = { route: '#shampoo', label: 'Shampoo' }
  const angelDevilDestination = { route: '#angel-devil', label: 'Heaven vs Hell' }
  const birdImpactDestination = { route: '#bird-impact', label: 'Glass Bird' }
  const resolvedDestination = isBirdImpactDie ? birdImpactDestination : isAngelDevilDie ? angelDevilDestination : isShampooDie ? shampooDestination : isRubberHumanDie ? rubberHumanDestination : destination
  const diceSymbol = isShampooDie ? 'shampoo' : isWaterTouchDie ? 'droplet' : isBalloonDie ? 'balloon' : isLemonadeDie ? 'lemon' : replacement?.type ?? (isTextSlot ? 'letter' : symbol.type)
  const value = replacement?.value ?? parangeLetterByDice.get(index) ?? symbol.value
  const navigable = parangeLetterByDice.has(index) || isBirdImpactDie || isAngelDevilDie || isToothGemDie || isLemonadeDie || isWaterTouchDie || isBalloonDie || isRubberHumanDie || isShampooDie || index === bluefishDiceIndex
  return { id: `dice_${String(index + 1).padStart(2, '0')}`, color: shuffledColors[index], markColor: markColorFor(shuffledColors[index], index), texture: textureNames[(index * 5 + 1) % textureNames.length], symbol: diceSymbol, value, tilt: ((index * 17) % 9) - 4, rounding: roundingProfiles[(index * 3 + 1) % roundingProfiles.length], navigable, ...resolvedDestination }
})

const renderPips = (count: number) => Array.from({ length: count }, () => '<i class="pip"></i>').join('')
const renderPaw = () => `<span class="symbol symbol-paw" aria-hidden="true"><i></i><i></i><i></i><i></i><b></b></span>`
const renderLemon = () => `<span class="dice-icon dice-icon-lemon" aria-hidden="true"><svg viewBox="0 0 64 64"><ellipse cx="29" cy="35" rx="20" ry="16" fill="currentColor"/><path d="M41 20c2-8 8-11 14-9-1 7-6 11-14 11v-2Z" fill="currentColor"/></svg></span>`
const renderDroplet = () => `<span class="dice-icon dice-icon-droplet" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M32 6C25 18 14 28 14 40c0 10 8 18 18 18s18-8 18-18C50 28 39 18 32 6Z" fill="currentColor"/></svg></span>`
const renderBalloon = () => `<span class="dice-icon dice-icon-balloon" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none"><ellipse cx="32" cy="27" rx="18" ry="21" fill="currentColor"/><path d="M26 46h12l-6 8-6-8Z" fill="currentColor"/><path d="M32 54c-5 3 5 5 0 9" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M25 18c-4 4-5 9-4 12" stroke="rgba(255,255,255,.58)" stroke-width="3.5" stroke-linecap="round"/></svg></span>`
const renderShampoo = () => `<span class="dice-icon dice-icon-shampoo" aria-hidden="true"><svg viewBox="0 0 64 64"><circle cx="27" cy="36" r="17" fill="currentColor"/><circle cx="43" cy="19" r="9" fill="currentColor"/><path d="M17 31c2-5 6-8 10-8" fill="none" stroke="rgba(255,255,255,.72)" stroke-width="3.2" stroke-linecap="round"/><path d="M39 17c1.1-2.2 2.8-3.6 4.9-4.1" fill="none" stroke="rgba(255,255,255,.68)" stroke-width="2.2" stroke-linecap="round"/></svg></span>`
const renderSymbol = (item: Dice) => item.symbol === 'pip'
  ? `<span class="pips pips-${item.value}">${renderPips(Number(item.value))}</span>`
  : item.symbol === 'paw'
    ? renderPaw()
    : item.symbol === 'lemon'
      ? renderLemon()
      : item.symbol === 'droplet'
        ? renderDroplet()
        : item.symbol === 'balloon'
          ? renderBalloon()
          : item.symbol === 'shampoo'
            ? renderShampoo()
    : `<span class="symbol symbol-${item.symbol}">${item.value}</span>`
const renderFace = (face: string, item: Dice) => `<div class="dice-face ${face}"><div class="dice-surface">${renderSymbol(item)}</div></div>`

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="stage">
    <div class="dice-grid" aria-label="Interactive dice grid">
      ${dice.map((item, index) => `<div class="dice dice-${item.texture}${item.navigable ? ' dice-nav' : ''}" data-index="${index}"${item.navigable ? ` data-route="${item.route}" role="button" tabindex="0" aria-label="이동: ${item.label} 페이지"` : ''} style="--dice-color: ${item.color}; --mark-color: ${item.markColor}; --tilt: ${item.tilt}deg; --cube-radius: ${item.rounding}"><div class="dice-cube">${renderFace('dice-front', item)}${renderFace('dice-back', item)}${renderFace('dice-top', item)}${renderFace('dice-bottom', item)}${renderFace('dice-side', item)}${renderFace('dice-left', item)}</div></div>`).join('')}
    </div>
  </main>
  <div class="cat-cursor" aria-hidden="true"><img src="${import.meta.env.BASE_URL}black-cat-cursor-optimized.png" alt=""></div>
  <section class="color-screen" aria-hidden="true">
    <button class="color-screen-close" type="button" aria-label="주사위 화면으로 돌아가기">×</button>
    <p class="color-screen-label"></p>
  </section>
`

const diceElements = [...document.querySelectorAll<HTMLElement>('.dice')]
const colorScreen = document.querySelector<HTMLElement>('.color-screen')!
const colorScreenLabel = document.querySelector<HTMLElement>('.color-screen-label')!
const colorScreenClose = document.querySelector<HTMLButtonElement>('.color-screen-close')!
const catCursor = document.querySelector<HTMLElement>('.cat-cursor')!
type Experience = {
  open: () => void
  close: () => void
  getRecordingStream?: () => MediaStream | null
  getRecordingCanvas?: () => HTMLCanvasElement | null
}
type ExperienceLoader = () => Promise<Experience>
// The home page does not need camera, WebGL, or MediaPipe code. Split each
// destination at its boundary and keep the imported module alive after first
// use, preserving its existing behaviour on subsequent visits.
const experienceLoaders: Record<string, ExperienceLoader> = {
  Lemonade: async () => (await import('./lemonade')).createLemonadeExperience(),
  'PARANGE PLANET': async () => (await import('./parange-planet')).createParangePlanetExperience(),
  WaterTouch: async () => (await import('./water-touch')).createWaterTouchExperience(),
  Balloon: async () => (await import('./balloon')).createBalloonExperience(),
  'Glass Bird': async () => (await import('./bird-impact')).createBirdImpactExperience(),
  Bluefish: async () => (await import('./bluefish')).createBluefishExperience(),
  'Elephant Drawing': async () => (await import('./elephant-drawing')).createElephantDrawingExperience(),
  'Framing Blueprint': async () => (await import('./framing-blueprint')).createFramingBlueprintExperience(),
  '고무 인간': async () => (await import('./rubber-human')).createRubberHumanExperience(),
  Shampoo: async () => (await import('./shampoo')).createShampooExperience(),
  'Tooth Gem': async () => (await import('./tooth-gem')).createToothGemExperience(),
  'Heaven vs Hell': async () => (await import('./angel-devil')).createAngelDevilExperience(),
}
const loadedExperiences = new Map<string, Promise<Experience>>()
const loadExperience = (label: string) => {
  const loader = experienceLoaders[label]
  if (!loader) return null
  let experience = loadedExperiences.get(label)
  if (!experience) {
    experience = loader()
    loadedExperiences.set(label, experience)
  }
  return experience
}
let activeExperience: Experience | null = null
let experienceRequest = 0
const cameraCapture = createCameraCapture()
cameraCapture.setRecordingStreamSource(() => activeExperience?.getRecordingStream?.() ?? null)
cameraCapture.setPhotoCanvasSource(() => activeExperience?.getRecordingCanvas?.() ?? null)
// Camera experiences are loaded independently, so manage the hardware source
// once at the application boundary. A hidden tab must not keep the sensor
// producing frames (and warming a mobile device); tracks resume in place when
// the user comes back without asking for permission again.
const updateCameraTrackVisibility = () => {
  const enabled = !document.hidden
  document.querySelectorAll<HTMLVideoElement>('video').forEach((video) => {
    const source = video.srcObject
    if (source instanceof MediaStream) source.getVideoTracks().forEach((track) => { track.enabled = enabled })
  })
}
document.addEventListener('visibilitychange', updateCameraTrackVisibility)
let frame = 0
let lastPointer: { x: number; y: number } | null = null
let pendingRoll = { x: 0, y: 0 }
let lastRollStartedAt = 0
let idleRollTimer: number | null = null
let hoveredDie: HTMLElement | null = null
let pointerDown: { x: number; y: number; element: HTMLElement } | null = null
let navigating = false
let colorScreenOpen = false
const finePointer = window.matchMedia('(pointer: fine)')
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
// Keep the same interaction on capable hardware, while avoiding a sustained
// compositor workload on entry-level phones and tablets.
const deviceNavigator = navigator as Navigator & { deviceMemory?: number }
const constrainedDevice = (navigator.hardwareConcurrency || 4) <= 4 || (deviceNavigator.deviceMemory ?? 4) <= 2
const shouldAnimateHome = () => !document.hidden && !reducedMotion.matches
document.documentElement.classList.toggle('is-constrained-device', constrainedDevice)
let catCursorFrame = 0
let pendingCatCursor: { x: number; y: number } | null = null
const hideCatCursor = () => {
  if (catCursorFrame) cancelAnimationFrame(catCursorFrame)
  catCursorFrame = 0
  pendingCatCursor = null
  catCursor.classList.remove('is-visible')
}
const renderCatCursor = () => {
  catCursorFrame = 0
  if (!pendingCatCursor || colorScreenOpen) return
  const { x, y } = pendingCatCursor
  pendingCatCursor = null
  // Anchor the pointer near the leading front paw so the cat reads as the
  // cursor, rather than as a sticker offset from it.
  catCursor.style.transform = `translate3d(${x - 16}px, ${y - 58}px, 0)`
  catCursor.classList.add('is-visible')
}
const moveCatCursor = (event: PointerEvent) => {
  if (event.pointerType !== 'mouse' || !finePointer.matches || colorScreenOpen) {
    hideCatCursor()
    return
  }
  // A display can receive mouse events far faster than it can paint. Keep only
  // the newest point and update once per paint frame for identical movement.
  pendingCatCursor = { x: event.clientX, y: event.clientY }
  if (!catCursorFrame) catCursorFrame = requestAnimationFrame(renderCatCursor)
}
window.addEventListener('pointermove', moveCatCursor, { passive: true })
window.addEventListener('blur', hideCatCursor)
document.addEventListener('mouseleave', hideCatCursor)
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
type DiceState = {
  rollX: number; rollY: number; targetRollX: number; targetRollY: number
  pushX: number; pushY: number; targetPushX: number; targetPushY: number
  rollDirectionX: number; rollDirectionY: number; isReturning: boolean; hovered: boolean; lastRollAt: number; collisionUntil: number; clickStartedAt: number | null; clickScale: number; clickSpin: number
}
const diceStates = new Map<HTMLElement, DiceState>(diceElements.map((element) => [element, {
  rollX: 0,
  rollY: 0,
  targetRollX: 0,
  targetRollY: 0,
  pushX: 0,
  pushY: 0,
  targetPushX: 0,
  targetPushY: 0,
  rollDirectionX: 0,
  rollDirectionY: 0,
  isReturning: false,
  hovered: false,
  lastRollAt: 0,
  collisionUntil: 0,
  clickStartedAt: null,
  clickScale: 1,
  clickSpin: 0,
}]))
// Only dice with a pending visual change are advanced on each animation frame.
// Keeping the resting cubes out of the frame loop avoids needless paint work.
const activeDice = new Set<HTMLElement>()

type DiceCenter = { x: number; y: number }
const diceCenters = new Map<HTMLElement, DiceCenter>()
const measureDiceCenters = () => {
  // Centers do not change while a cube rotates around its own origin.
  diceElements.forEach((element) => {
    const bounds = element.getBoundingClientRect()
    diceCenters.set(element, { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 })
  })
}

type VisualBounds = { left: number; right: number; top: number; bottom: number }
const limitPush = (value: number) => clamp(value, -28, 28)
const boundsFor = (element: HTMLElement, state: DiceState): VisualBounds => {
  // A transformed parent does not always include its preserve-3d descendants
  // in its DOMRect. For a rolling die, union its six visible planes instead.
  if (!state.lastRollAt) {
    const rect = element.getBoundingClientRect()
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
  }
  const faces = element.querySelectorAll<HTMLElement>('.dice-face')
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity
  faces.forEach((face) => {
    const rect = face.getBoundingClientRect()
    left = Math.min(left, rect.left); right = Math.max(right, rect.right)
    top = Math.min(top, rect.top); bottom = Math.max(bottom, rect.bottom)
  })
  return { left, right, top, bottom }
}
const shiftBounds = (bounds: VisualBounds, x: number, y: number) => {
  bounds.left += x; bounds.right += x; bounds.top += y; bounds.bottom += y
}
let lastCollisionCheck = 0
const resolveDiceCollisions = (now: number) => {
  // Measuring six planes is more accurate than a radius estimate. It runs at
  // 30fps only during a roll; ordinary resting dice never enter this path.
  if (now - lastCollisionCheck < 33) return
  lastCollisionCheck = now
  const states = new Map(diceElements.map((element) => [element, diceStates.get(element)!]))
  const engaged = new Set(diceElements.filter((element) => Boolean(states.get(element)?.lastRollAt)))
  if (!engaged.size) return
  const bounds = new Map(diceElements.map((element) => [element, boundsFor(element, states.get(element)!)]))
  for (let pass = 0; pass < 4; pass += 1) {
    for (let firstIndex = 0; firstIndex < diceElements.length; firstIndex += 1) {
      const first = diceElements[firstIndex]
      for (let secondIndex = firstIndex + 1; secondIndex < diceElements.length; secondIndex += 1) {
        const second = diceElements[secondIndex]
        if (!engaged.has(first) && !engaged.has(second)) continue
        const a = bounds.get(first)!, b = bounds.get(second)!
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left)
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        if (overlapX <= 0 || overlapY <= 0) continue
        const firstState = states.get(first)!, secondState = states.get(second)!
        const horizontal = overlapX < overlapY
        const firstCenter = horizontal ? (a.left + a.right) / 2 : (a.top + a.bottom) / 2
        const secondCenter = horizontal ? (b.left + b.right) / 2 : (b.top + b.bottom) / 2
        const direction = firstCenter <= secondCenter ? -1 : 1
        // Split the correction between both dice. The newly displaced die is
        // then included in the same pass, so a dense row opens like a soft
        // chain rather than forcing the rotating cube through a neighbour.
        const correction = (horizontal ? overlapX : overlapY) / 2 + 1
        if (horizontal) {
          firstState.targetPushX = limitPush(firstState.targetPushX + direction * correction)
          secondState.targetPushX = limitPush(secondState.targetPushX - direction * correction)
          shiftBounds(a, direction * correction, 0); shiftBounds(b, -direction * correction, 0)
        } else {
          firstState.targetPushY = limitPush(firstState.targetPushY + direction * correction)
          secondState.targetPushY = limitPush(secondState.targetPushY - direction * correction)
          shiftBounds(a, 0, direction * correction); shiftBounds(b, 0, -direction * correction)
        }
        firstState.collisionUntil = now + 460
        secondState.collisionUntil = now + 460
        engaged.add(first); engaged.add(second)
        activeDice.add(first); activeDice.add(second)
      }
    }
  }
}

const renderTransform = (element: HTMLElement, now: number) => {
  const state = diceStates.get(element)
  if (!state) return false
  if (state.clickStartedAt !== null) {
    const progress = clamp((now - state.clickStartedAt) / 440, 0, 1)
    if (progress < 0.22) {
      state.clickScale = 1 - 0.14 * (progress / 0.22)
    } else {
      const rebound = (progress - 0.22) / 0.78
      state.clickScale = 0.86 + 0.14 * rebound + 0.075 * Math.sin(Math.PI * rebound)
    }
    state.clickSpin = 360 * (1 - Math.pow(1 - progress, 3))
  }
  // Keep every animated value on the same element and in one transform string.
  // This prevents the cursor tilt from being overwritten by click feedback.
  const scale = state.clickScale * (state.hovered && state.clickStartedAt === null ? 1.06 : 1)
  // Keep the resting grid fully aligned. Only dice selected by cursor motion
  // receive a rotation value, avoiding a whole-grid movement on first entry.
  // Perspective is defined once on the grid. Keeping it out of each changing
  // transform prevents nested 3D compositor layers from flashing on WebKit.
  element.style.transform = `translate3d(${state.pushX}px, ${state.pushY}px, 0) rotateX(${state.rollX}deg) rotateY(${state.rollY}deg) rotateZ(${state.clickSpin}deg) scale(${scale})`
  const isAnimating = Math.abs(state.targetRollX - state.rollX) > 0.05 || Math.abs(state.targetRollY - state.rollY) > 0.05 || Math.abs(state.targetPushX - state.pushX) > 0.05 || Math.abs(state.targetPushY - state.pushY) > 0.05 || state.clickStartedAt !== null || (state.lastRollAt > 0 && now - state.lastRollAt < 460) || state.collisionUntil > now
  element.classList.toggle('is-animating', isAnimating)
  return isAnimating
}

let previousFrameTime = performance.now()
const continueToFullTurn = (value: number, direction: number) => {
  if (direction > 0) return Math.ceil(value / 360) * 360
  if (direction < 0) return Math.floor(value / 360) * 360
  return 0
}

const updateDice = () => {
  const now = performance.now()
  const delta = Math.min(now - previousFrameTime, 40)
  previousFrameTime = now
  let animationActive = false
  activeDice.forEach((element) => {
    const state = diceStates.get(element)
    if (!state) return
    if (state.lastRollAt && now - state.lastRollAt >= 460 && !state.isReturning) {
      // Complete the turn in its current direction rather than unwinding backward.
      state.targetRollX = continueToFullTurn(state.targetRollX, state.rollDirectionX)
      state.targetRollY = continueToFullTurn(state.targetRollY, state.rollDirectionY)
      state.isReturning = true
    }
    if (!state.lastRollAt && state.collisionUntil <= now) {
      state.targetPushX = 0
      state.targetPushY = 0
    }
    // Cursor rolls remain responsive; the return-to-rest portion is deliberately softer.
    const smoothing = 1 - Math.exp(-delta / (state.isReturning ? 420 : 190))
    state.rollX += (state.targetRollX - state.rollX) * smoothing
    state.rollY += (state.targetRollY - state.rollY) * smoothing
    state.pushX += (state.targetPushX - state.pushX) * smoothing
    state.pushY += (state.targetPushY - state.pushY) * smoothing
    if (Math.abs(state.targetRollX - state.rollX) <= 0.05 && Math.abs(state.targetRollY - state.rollY) <= 0.05) {
      state.rollX = state.targetRollX %= 360
      state.rollY = state.targetRollY %= 360
      if (state.lastRollAt && now - state.lastRollAt >= 460) {
        state.lastRollAt = 0
        state.isReturning = false
      }
    }
    if (renderTransform(element, now)) animationActive = true
    else activeDice.delete(element)
  })
  resolveDiceCollisions(now)
  if (activeDice.size) animationActive = true
  frame = 0
  if (animationActive) scheduleUpdate()
}

const scheduleUpdate = () => {
  if (!frame) frame = requestAnimationFrame(updateDice)
}

const activateDice = (element: HTMLElement) => {
  activeDice.add(element)
  scheduleUpdate()
}

const startCursorRoll = (x: number, y: number, cursorX: number, cursorY: number) => {
  if (!shouldAnimateHome()) return false
  const movementDistance = Math.hypot(x, y)
  if (movementDistance < 0.1) return false
  const nearbyDice = diceElements
    .map((element) => {
      const center = diceCenters.get(element)
      return { element, center, distance: center ? Math.hypot(cursorX - center.x, cursorY - center.y) : Infinity }
    })
    .sort((first, second) => first.distance - second.distance)
  if (!nearbyDice.length) return false

  const influenceRadius = 180
  const localCount = nearbyDice.filter((item) => item.distance < influenceRadius).length
  const selectedCount = Math.min(localCount, constrainedDevice ? 3 : 3 + Math.floor(Math.random() * 4))
  const selectedDice = nearbyDice.slice(0, selectedCount)
  selectedDice.forEach(({ element, center, distance }) => {
    const state = diceStates.get(element)
    if (!state || !center) return
    const proximity = clamp(1 - distance / influenceRadius, 0, 1)
    // Begin in the cursor's direction, then separate any dice whose expanded
    // rolling silhouettes meet. The following solver turns this into a small,
    // readable collision response instead of overlapping transforms.
    state.targetPushX = limitPush((x / movementDistance) * (5 + proximity * 5))
    state.targetPushY = limitPush((y / movementDistance) * (5 + proximity * 5))
    // A horizontal cursor movement rolls the cube around Y; vertical movement around X.
    const rollAmount = 180 + 120 * proximity * proximity
    // Do not stack unlimited full turns during fast pointer movement. A bounded
    // queue keeps every cube readable and avoids compositor flashes.
    const maxQueuedTurn = 540
    const nextRollX = state.targetRollX + (y / movementDistance) * rollAmount
    const nextRollY = state.targetRollY - (x / movementDistance) * rollAmount
    state.targetRollX = state.rollX + clamp(nextRollX - state.rollX, -maxQueuedTurn, maxQueuedTurn)
    state.targetRollY = state.rollY + clamp(nextRollY - state.rollY, -maxQueuedTurn, maxQueuedTurn)
    state.isReturning = false
    if (Math.abs(y) > 0.1) state.rollDirectionX = Math.sign(y)
    if (Math.abs(x) > 0.1) state.rollDirectionY = -Math.sign(x)
    state.lastRollAt = performance.now()
    activeDice.add(element)
  })
  scheduleUpdate()
  return true
}

const clearIdleRoll = () => {
  if (idleRollTimer !== null) window.clearTimeout(idleRollTimer)
  idleRollTimer = null
}

const settleDice = () => {
  const now = performance.now()
  activeDice.forEach((element) => {
    const state = diceStates.get(element)
    if (!state) return
    // Keep collision checks alive while the cube completes its current turn,
    // then ease every translation back to its grid coordinate.
    if (state.lastRollAt) {
      state.targetRollX = continueToFullTurn(state.targetRollX, state.rollDirectionX)
      state.targetRollY = continueToFullTurn(state.targetRollY, state.rollDirectionY)
      state.lastRollAt = now - 460
    }
    state.isReturning = true
    state.collisionUntil = 0
    state.targetPushX = 0
    state.targetPushY = 0
  })
  if (activeDice.size) scheduleUpdate()
}

const scheduleIdleRoll = () => {
  clearIdleRoll()
}

const handleMouseMove = (event: MouseEvent) => {
  if (!lastPointer) {
    lastPointer = { x: event.clientX, y: event.clientY }
    return
  }
  const movementX = event.clientX - lastPointer.x
  const movementY = event.clientY - lastPointer.y
  lastPointer = { x: event.clientX, y: event.clientY }
  const activeDie = event.target instanceof Element ? event.target.closest<HTMLElement>('.dice') : null
  if (!activeDie) {
    pendingRoll = { x: 0, y: 0 }
    hoveredDie = null
    clearIdleRoll()
    settleDice()
    return
  }
  hoveredDie = activeDie
  pendingRoll.x += movementX
  pendingRoll.y += movementY
  const distance = Math.hypot(pendingRoll.x, pendingRoll.y)
  const now = performance.now()
  if (distance >= 12 && now - lastRollStartedAt >= 140) {
    if (startCursorRoll(pendingRoll.x, pendingRoll.y, event.clientX, event.clientY)) {
      pendingRoll = { x: 0, y: 0 }
      lastRollStartedAt = now
    }
  }
  scheduleIdleRoll()
}

window.addEventListener('mousemove', handleMouseMove)
window.addEventListener('mouseleave', () => {
  lastPointer = null
  pendingRoll = { x: 0, y: 0 }
  hoveredDie = null
  clearIdleRoll()
  settleDice()
})
let resizeFrame = 0
window.addEventListener('resize', () => {
  if (resizeFrame) return
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = 0
    measureDiceCenters()
    scheduleUpdate()
  })
})
window.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    clearIdleRoll()
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    return
  }
  if (activeDice.size) scheduleUpdate()
  if (hoveredDie) scheduleIdleRoll()
})
const handleMotionPreferenceChange = () => {
  clearIdleRoll()
  if (reducedMotion.matches) {
    activeDice.forEach((element) => {
      const state = diceStates.get(element)
      if (!state) return
      state.targetRollX = state.rollX
      state.targetRollY = state.rollY
      state.targetPushX = 0
      state.targetPushY = 0
      state.lastRollAt = 0
      state.collisionUntil = 0
      state.isReturning = false
    })
  } else if (hoveredDie) scheduleIdleRoll()
}
// Safari versions that support prefers-reduced-motion but predate EventTarget
// MediaQueryList methods still receive the same lightweight behaviour.
if (typeof reducedMotion.addEventListener === 'function') reducedMotion.addEventListener('change', handleMotionPreferenceChange)
else reducedMotion.addListener(handleMotionPreferenceChange)

const openColorScreen = (destination: Dice) => {
  hideCatCursor()
  const experience = loadExperience(destination.label)
  if (experience) {
    colorScreenOpen = true
    const request = ++experienceRequest
    void experience.then((loadedExperience) => {
      // The user may have closed the page while its on-demand code loaded.
      if (!colorScreenOpen || request !== experienceRequest) return
      activeExperience = loadedExperience
      loadedExperience.open()
    }).catch((error: unknown) => {
      if (request === experienceRequest) {
        console.error('Unable to load experience:', error)
        colorScreenOpen = false
      }
    })
    return
  }
  colorScreen.style.setProperty('--screen-color', destination.color)
  colorScreenLabel.textContent = destination.label
  colorScreen.classList.add('is-open')
  colorScreen.setAttribute('aria-hidden', 'false')
  colorScreenOpen = true
  colorScreenClose.focus()
}

const closeColorScreen = (restoreHistory = false) => {
  if (!colorScreenOpen) return
  experienceRequest += 1
  activeExperience?.close()
  activeExperience = null
  colorScreen.classList.remove('is-open')
  colorScreen.setAttribute('aria-hidden', 'true')
  colorScreenOpen = false
  document.title = 'Dice Field'
  if (restoreHistory && history.state?.diceId) history.back()
}

colorScreenClose.addEventListener('click', () => closeColorScreen(true))
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeColorScreen(true)
})
window.addEventListener('popstate', () => closeColorScreen())

const navigateTo = (element: HTMLElement) => {
  if (navigating) return
  const destination = dice[Number(element.dataset.index)]
  const state = diceStates.get(element)
  if (!destination?.navigable || !state) return
  navigating = true
  hideCatCursor()
  element.classList.add('is-animating')
  state.clickStartedAt = performance.now()
  activateDice(element)

  const finishNavigation = () => {
    // This is SPA-style navigation: consumers can listen for this event to render
    // the matching view without forcing a full page reload.
    history.pushState({ diceId: destination.id }, '', destination.route)
    window.dispatchEvent(new CustomEvent('dice:navigate', { detail: destination }))
    document.title = `${destination.label} | Dice Field`
    openColorScreen(destination)
    state.clickStartedAt = null
    state.clickScale = 1
    state.clickSpin = 0
    navigating = false
    activateDice(element)
  }
  // Camera permission is requested from the original N-die interaction so the
  // new face effect opens with the camera already active, not after its roll.
  if (destination.label === 'Heaven vs Hell' || destination.label === 'Glass Bird') finishNavigation()
  else window.setTimeout(finishNavigation, 440)
}

measureDiceCenters()

diceElements.forEach((element) => {
  element.addEventListener('pointerenter', (event) => {
    const state = diceStates.get(element)
    if (!state) return
    const diceData = dice[Number(element.dataset.index)]
    // Hovering an entry starts a quiet module prefetch. This usually makes the
    // destination instant while still keeping unused experiences off the home
    // page's initial download.
    if (diceData?.navigable) void loadExperience(diceData.label)?.catch(() => { /* Navigation reports a real load error. */ })
    if (event.pointerType === 'mouse') {
      hoveredDie = element
      lastPointer = { x: event.clientX, y: event.clientY }
      scheduleIdleRoll()
    }
    if (!diceData?.navigable) return
    state.hovered = true
    activateDice(element)
  })
  element.addEventListener('pointerleave', () => {
    const state = diceStates.get(element)
    if (!state) return
    state.hovered = false
    if (hoveredDie === element) {
      hoveredDie = null
      pendingRoll = { x: 0, y: 0 }
      clearIdleRoll()
      settleDice()
    }
    activateDice(element)
  })
  element.addEventListener('pointerdown', (event) => {
    const diceData = dice[Number(element.dataset.index)]
    if (event.button !== 0 || !diceData?.navigable) return
    pointerDown = { x: event.clientX, y: event.clientY, element }
    element.setPointerCapture(event.pointerId)
  })
  element.addEventListener('pointerup', (event) => {
    const diceData = dice[Number(element.dataset.index)]
    if (!diceData?.navigable) return
    if (!pointerDown || pointerDown.element !== element) return
    const distance = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y)
    if (distance <= 8) navigateTo(element)
    pointerDown = null
  })
  element.addEventListener('pointercancel', () => { pointerDown = null })
  element.addEventListener('keydown', (event) => {
    const diceData = dice[Number(element.dataset.index)]
    if (!diceData?.navigable) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      navigateTo(element)
    }
  })
})

scheduleUpdate()
