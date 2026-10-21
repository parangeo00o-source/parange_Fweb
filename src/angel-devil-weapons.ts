import type { FighterPose, FighterSide } from './angel-devil-motion'
import { fighterHandGrip } from './angel-devil-rig'

export const fighterWeaponPlacement = (side: FighterSide, pose: FighterPose) => {
  const grip = fighterHandGrip(side, pose)
  const direction = side === 'angel' ? 1 : -1
  const extension = Math.max(pose.punch, pose.kick)
  const angle = grip.angle + direction * (.4 - pose.windup * .65 + extension * 1.02)
  return { grip, angle, length: side === 'angel' ? .43 : .51 }
}

// Bake continuous material shading once; geometry still defines the arcade bevels.
const artwork = new Map<FighterSide, HTMLCanvasElement>()
const paintWeapon = (c: CanvasRenderingContext2D, side: FighterSide) => {
  const angel = side === 'angel'
  const outline = angel ? '#557f73' : '#29162a'
  const metal = c.createLinearGradient(-.06, 0, .06, 0)
  for (const [at, color] of (angel
    ? [[0, '#608fa5'], [.24, '#a7d6d1'], [.48, '#edf5ed'], [.64, '#c5e3e3'], [.82, '#91bfce'], [1, '#527e98']]
    : [[0, '#351a33'], [.24, '#8e2c49'], [.48, '#f18aa7'], [.64, '#ce466e'], [.82, '#882435'], [1, '#32172e']]) as [number, string][]) metal.addColorStop(at, color)
  const surface = (highlight: string, midtone: string, shadow: string) => {
    const gradient = c.createLinearGradient(-.035, -.45, .05, .12)
    gradient.addColorStop(0, highlight); gradient.addColorStop(.48, midtone); gradient.addColorStop(1, shadow)
    return gradient
  }
  const shape = (path: string, fill: string | CanvasGradient = metal, stroke = outline, width = .0035) => {
    const p = new Path2D(path); c.fillStyle = fill; c.strokeStyle = stroke; c.lineWidth = width; c.fill(p); c.stroke(p)
  }
  const line = (path: string, color: string, width = .002) => {
    c.strokeStyle = color; c.lineWidth = width; c.stroke(new Path2D(path))
  }
  c.lineJoin = 'bevel'; c.lineCap = 'butt'
  if (angel) {
    // Forged pearl blade: two bevels, recessed fuller and a small etched rune.
    shape('M0 -.43 L.037 -.335 L.031 -.079 L.019 -.054 L-.019 -.054 L-.031 -.079 L-.037 -.335 Z')
    shape('M0 -.425 L.003 -.076 L-.018 -.061 L-.024 -.326 Z', surface('#f1f8ef', '#d6ede5', '#b8ddd9'), '#aac6d4', .001)
    shape('M0 -.425 L.029 -.333 L.023 -.084 L.004 -.066 Z', surface('#d0eae4', '#add8da', '#8ebdce'), '#84b0be', .001)
    line('M0 -.411 L-.002 -.086', '#fcfaf0', .003)
    line('M.015 -.316 L.012 -.112', '#4b8bae', .002)
    line('M.012 -.262 L.022 -.246 L.011 -.231 L.002 -.247 Z M.011 -.231 L.011 -.199', '#d8f5e5', .0025)
    // Leather binding sits below a layered feather guard.
    shape('M-.018 -.041 L.018 -.041 L.016 .105 Q0 .119 -.016 .105 Z', '#9bc7b3')
    for (let y = -.02; y < .095; y += .018) {
      line(`M-.016 ${y} Q0 ${y + .012} .016 ${y + .006}`, '#557e99', .004)
      line(`M-.015 ${y - .003} Q0 ${y + .007} .014 ${y + .002}`, '#e0e8df', .002)
    }
    for (const d of [-1, 1]) {
      c.save(); c.scale(d, 1)
      shape('M.008 -.061 Q.059 -.054 .114 -.12 Q.12 -.072 .078 -.038 Q.04 -.012 .009 -.031 Z')
      for (let feather = 0; feather < 4; feather++) {
        const x = .028 + feather * .019, y = -.044 - feather * .012
        shape(`M${x - .014} ${y + .018} Q${x + .008} ${y - .008} ${x + .029} ${y - .032} Q${x + .026} ${y + .007} ${x} ${y + .022} Z`, surface('#edf5ed', '#c7e4db', '#a5cdd5'), '#7493a5', .0018)
        line(`M${x} ${y + .012} L${x + .02} ${y - .016}`, '#eef1e9', .002)
      }
      c.restore()
    }
    shape('M0 -.079 L.028 -.043 L0 -.007 L-.028 -.043 Z', '#718e9b')
    shape('M0 -.07 L.019 -.043 L0 -.018 L-.019 -.043 Z', '#55c7a0', '#e5ebe3', .0025)
    shape('M0 -.067 L0 -.02 L-.016 -.043 Z', '#b8efda', '#8cd0b5', .001)
    line('M0 -.067 L.016 -.043 L0 -.02', '#3481a9', .002)
    shape('M0 .136 L.025 .111 L.015 .094 L-.015 .094 L-.025 .111 Z')
    shape('M0 .125 L.011 .11 L0 .10 L-.011 .11 Z', '#8ed3b9', '#537e96', .002)
  } else {
    // Charcoal steel, ember channels and horn-like hooked prongs.
    shape('M-.014 -.426 L.014 -.426 L.015 .176 L0 .196 L-.015 .176 Z')
    line('M-.006 -.4 L-.006 .162', '#ed8abc', .003)
    shape('M-.014 -.28 C-.108 -.286 -.105 -.345 -.093 -.408 L-.124 -.389 Q-.115 -.442 -.087 -.478 Q-.066 -.441 -.048 -.399 L-.074 -.412 Q-.088 -.329 -.013 -.32 L-.013 -.434 L-.039 -.417 L0 -.51 L.039 -.417 L.013 -.434 L.013 -.32 Q.088 -.329 .074 -.412 L.048 -.399 Q.066 -.441 .087 -.478 Q.115 -.442 .124 -.389 L.093 -.408 C.105 -.345 .108 -.286 .014 -.28 Z')
    for (const d of [-1, 1]) {
      c.save(); c.scale(d, 1)
      shape('M.087 -.471 L.087 -.417 L.115 -.399 Z', '#d85b70', '#a92c41', .001)
      line('M.087 -.447 L.088 -.401 Q.098 -.323 .018 -.302', '#f69baa', .003)
      line('M.077 -.389 Q.079 -.337 .023 -.327', '#4c1724', .005)
      line('M.03 -.306 L.046 -.32 M.045 -.302 L.06 -.318 M.062 -.308 L.075 -.328', '#581a3d', .002)
      // Small swept collar spikes echo the character's horns.
      shape('M.01 -.197 Q.043 -.211 .047 -.237 Q.051 -.205 .02 -.177 Z', '#8b245d')
      c.restore()
    }
    shape('M0 -.504 L0 -.422 L-.025 -.43 Z', surface('#f48aad', '#d74b7b', '#a32e4e'), '#b63174', .001)
    shape('M0 -.504 L.025 -.43 L0 -.422 Z', surface('#d04a74', '#a42d4e', '#782331'), '#661d44', .001)
    line('M0 -.408 L0 -.337', '#f98da2', .003)
    shape('M0 -.291 L.029 -.261 L.018 -.218 L0 -.207 L-.018 -.218 L-.029 -.261 Z', '#3d2038')
    shape('M0 -.28 L.017 -.257 L0 -.227 L-.017 -.257 Z', '#e52a79', '#a81360', .002)
    shape('M0 -.277 L0 -.23 L-.013 -.257 Z', '#ff9dca', '#df556c', .001)
    shape('M-.018 -.028 L.018 -.028 L.018 .104 L-.018 .104 Z', '#332b36')
    for (let y = -.025; y < .10; y += .018) {
      line(`M-.016 ${y} L.016 ${y + .012}`, '#a65a67', .005)
      line(`M-.015 ${y + .004} L.015 ${y + .016}`, '#1f1e29', .0025)
    }
    for (const y of [-.04, .112]) shape(`M-.022 ${y} L.022 ${y} L.022 ${y + .012} L-.022 ${y + .012} Z`)
    shape('M0 .211 L.028 .173 L.016 .148 L0 .16 L-.016 .148 L-.028 .173 Z')
    line('M0 .202 L.006 .177 L0 .168', '#ee79b0', .003)
  }

}
const getArtwork = (side: FighterSide) => {
  let canvas = artwork.get(side)
  if (!canvas) {
    canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 640
    const c = canvas.getContext('2d')!
    c.translate(160, 448); c.scale(800, 800); paintWeapon(c, side)
    artwork.set(side, canvas)
  }
  return canvas
}

export const drawFighterWeapon = (c: CanvasRenderingContext2D, side: FighterSide, pose: FighterPose, size: number, height: number, opacity: number) => {
  if (opacity <= 0) return
  const { grip, angle } = fighterWeaponPlacement(side, pose)
  c.save(); c.globalAlpha *= opacity
  c.translate((grip.x - .5) * size, (grip.y - .68) * height); c.rotate(angle)
  c.shadowOffsetY = size * .006; c.shadowBlur = size * .009; c.shadowColor = 'rgba(19,25,39,.38)'
  c.drawImage(getArtwork(side), -size * .2, -size * .56, size * .4, size * .8)
  c.restore()
}

/** Reuse the actual deformed hand texture for three curled fingers and a thumb.
 * Only these small grip patches cover the weapon; its blade and guard stay in front. */
export const drawFighterGrip = (c: CanvasRenderingContext2D, side: FighterSide, pose: FighterPose, size: number, height: number, paintBody: () => void) => {
  const { grip, angle } = fighterWeaponPlacement(side, pose)
  c.save()
  const bodyTransform = c.getTransform()
  c.translate((grip.x - .5) * size, (grip.y - .68) * height); c.rotate(angle); c.scale(size, size)
  c.beginPath()
  for (const y of [-.012, .005, .022]) { c.moveTo(.023, y); c.ellipse(-.002, y, .025, .007, -.12, 0, Math.PI * 2) }
  c.moveTo(.035, -.018); c.ellipse(.026, -.018, .009, .021, -.38, 0, Math.PI * 2)
  c.clip(); c.setTransform(bodyTransform); c.shadowBlur = 0; c.shadowOffsetY = 0
  paintBody(); c.restore()
  c.save(); c.translate((grip.x - .5) * size, (grip.y - .68) * height); c.rotate(angle); c.scale(size, size)
  c.shadowBlur = 0; c.shadowOffsetY = 0
  c.strokeStyle = side === 'angel' ? 'rgba(74,116,96,.4)' : 'rgba(13,17,26,.65)'; c.lineWidth = .0018
  for (const y of [-.004, .013]) { c.beginPath(); c.moveTo(-.016, y); c.quadraticCurveTo(.003, y + .004, .018, y - .002); c.stroke() }
  c.restore()
}

export const drawWeaponSwing = (c: CanvasRenderingContext2D, side: FighterSide, pose: FighterPose, size: number, height: number, opacity: number) => {
  if (pose.trail < .025 || opacity <= 0) return
  const { grip, angle, length } = fighterWeaponPlacement(side, pose), d = side === 'angel' ? 1 : -1
  c.save(); c.translate((grip.x - .5) * size, (grip.y - .68) * height)
  c.rotate(angle - Math.PI / 2); c.scale(1, d)
  c.globalAlpha *= opacity * pose.trail * 1.5
  const radius = size * length
  const glow = c.createRadialGradient(0, 0, radius * .5, 0, 0, radius * 1.08)
  glow.addColorStop(0, 'transparent'); glow.addColorStop(.65, side === 'angel' ? 'rgba(110,190,232,.04)' : 'rgba(165,22,93,.04)')
  glow.addColorStop(.9, side === 'angel' ? 'rgba(156,255,211,.75)' : 'rgba(239,70,98,.65)'); glow.addColorStop(1, 'transparent')
  c.shadowBlur = 0; c.shadowOffsetY = 0; c.fillStyle = glow
  c.beginPath(); c.arc(0, 0, radius * 1.08, -1.55, .06); c.quadraticCurveTo(radius * .6, -radius * .1, 0, -radius * .62); c.closePath(); c.fill()
  c.strokeStyle = side === 'angel' ? '#d5f3ff' : '#ffb0be'; c.lineCap = 'round'; c.lineWidth = Math.max(.8, size * .008)
  c.beginPath(); c.arc(0, 0, radius, -.95, .02); c.stroke()
  c.strokeStyle = side === 'angel' ? '#78ebbc' : '#ee438f'; c.lineWidth = Math.max(1, size * .018)
  c.beginPath(); c.arc(0, 0, radius * .94, -.7, -.03); c.stroke()
  c.strokeStyle = side === 'angel' ? '#f2fff8' : '#ffe1ea'; c.lineWidth = Math.max(.6, size * .004)
  c.beginPath(); c.arc(0, 0, radius * .96, -.65, .01); c.stroke()
  // Flecks travel with the sweep, rather than floating while the fighter rests.
  c.fillStyle = side === 'angel' ? '#daffeb' : '#ff9cad'
  for (let i = 0; i < 7; i++) {
    const a = -1.5 + i * .19 + pose.punch * .16, r = radius * (1.06 + (i % 3) * .06)
    const x = Math.cos(a) * r, y = Math.sin(a) * r, dot = Math.max(.6, size * .004) * (1 + i % 2)
    c.beginPath(); c.ellipse(x, y, dot * 1.6, dot * .55, a, 0, Math.PI * 2); c.fill()
  }
  c.globalAlpha *= .45; c.lineWidth = Math.max(.7, size * .003)
  for (const r of [.84, 1.11]) { c.beginPath(); c.arc(0, 0, radius * r, -1.3, -.25); c.stroke() }
  c.restore()
}
