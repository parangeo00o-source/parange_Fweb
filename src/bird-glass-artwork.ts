/** A reusable transparent, pixel-halftone illustration centred on the head impact.
 * Painted once and reused throughout the animation. */
export const createGlassImpactArtwork = () => {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 512
  const c = canvas.getContext('2d')!
  let seed = 7919
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  const palette = ['#fa35cb', '#9026cd', '#335cff', '#32e8f4', '#38ed79', '#ecf835', '#ffbe32', '#f44b47']
  const star = (x: number, y: number, radius: number, tips: number, inner: number, turn: number, color: string) => {
    c.beginPath()
    for (let i = 0; i < tips * 2; i++) {
      const a = turn + i * Math.PI / tips, r = radius * (i % 2 ? inner : 1)
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py)
    }
    c.closePath(); c.fillStyle = color; c.fill()
  }
  // Loose halftone halos make the outside dissolve into the live camera.
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI * 2 / 12, r = 95 + random() * 65
    const x = 256 + Math.cos(a) * r, y = 256 + Math.sin(a) * r
    const glow = c.createRadialGradient(x, y, 18, x, y, 100)
    glow.addColorStop(0, palette[i % palette.length] + 'd0')
    glow.addColorStop(1, palette[i % palette.length] + '00')
    c.fillStyle = glow; c.fillRect(x - 100, y - 100, 200, 200)
  }
  const shapes = [
    [160, 108, 68, 7, .55, 5], [305, 111, 81, 8, .63, 7],
    [402, 178, 76, 10, .68, 0], [98, 260, 75, 8, .54, 3],
    [182, 371, 82, 7, .55, 6], [345, 362, 84, 9, .62, 1],
    [266, 240, 118, 10, .63, 2], [195, 215, 78, 7, .52, 4],
    [307, 286, 86, 8, .64, 5], [259, 331, 60, 6, .53, 0],
    [366, 246, 60, 7, .59, 4], [127, 351, 45, 5, .44, 0],
  ]
  for (const [x, y, radius, tips, inner, color] of shapes) {
    star(x, y, radius, tips, inner, random() * 2, palette[color])
    if (tips >= 8) {
      c.beginPath(); c.arc(x, y, radius * .39, 0, Math.PI * 2)
      c.fillStyle = palette[(color + 3) % palette.length]; c.fill()
      star(x, y, radius * .23, 5, .45, -.8, palette[(color + 5) % palette.length])
    }
  }
  for (let i = 0; i < 16; i++) {
    const a = random() * Math.PI * 2, r = 70 + random() * 150
    star(256 + Math.cos(a) * r, 256 + Math.sin(a) * r, 9 + random() * 23,
      5, .46, random() * 3, palette[i % palette.length])
  }
  // Square screen-print dots, staggered like the reference's pixel checkerwork.
  const mask = document.createElement('canvas'); mask.width = mask.height = 512
  const m = mask.getContext('2d')!
  m.fillStyle = '#fff'
  for (let row = 0; row < 103; row++) for (let col = 0; col < 103; col++) {
    m.fillRect(col * 5 + (row % 2 ? 2.5 : 0), row * 5, 2.6, 2.6)
  }
  c.globalCompositeOperation = 'destination-in'; c.drawImage(mask, 0, 0)
  c.globalCompositeOperation = 'source-over'
  // Crisp white pixel glints sit above the coloured halftone print.
  for (const [x, y, length] of [[163, 159, 32], [336, 113, 42], [331, 378, 40], [127, 302, 30]]) {
    c.fillStyle = '#faffee'
    for (let p = -length; p <= length; p += 4) {
      c.fillRect(x + p, y, 2.5, 2.5); c.fillRect(x, y + p, 2.5, 2.5)
    }
    star(x, y, 12, 4, .3, 0, '#ffffff')
  }
  mask.width = mask.height = 0
  return canvas
}
