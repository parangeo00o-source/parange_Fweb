import referenceUrl from './assets/bird-impact/halftone-fireworks-reference-v1.png'

// Contours traced in the reference's 1360 × 1158 coordinate system. Each cut
// follows the visible motif, including its spikes and concave edges, not a disk.
const CONTOURS = [
  [[560,570],[590,625],[650,607],[664,655],[734,646],[700,705],[744,762],[676,760],[678,831],[622,789],[553,866],[545,788],[470,815],[490,742],[423,717],[498,679],[494,605]],
  [[122,573],[170,600],[227,553],[231,632],[297,639],[250,690],[263,771],[198,739],[154,808],[136,731],[61,746],[93,677],[48,628],[121,628]],
  [[1098,173],[1144,221],[1180,224],[1277,160],[1261,248],[1300,286],[1340,290],[1313,349],[1353,404],[1302,424],[1307,472],[1249,464],[1210,559],[1176,493],[1118,507],[1121,458],[1066,457],[1070,394],[1007,326],[1061,289],[1080,230]],
  [[603,17],[648,125],[674,177],[659,228],[693,266],[639,301],[646,364],[567,327],[527,375],[476,319],[417,333],[440,270],[390,230],[425,174],[393,132],[484,113],[523,58],[551,57]],
  [[710,77],[760,109],[797,55],[824,116],[892,102],[900,164],[946,198],[918,247],[937,300],[871,310],[832,359],[786,319],[730,346],[728,287],[672,261],[703,209],[677,150]],
  [[273,704],[321,735],[365,700],[389,759],[464,753],[437,817],[478,858],[415,879],[406,938],[350,906],[308,945],[290,889],[233,874],[263,825],[226,771],[282,778]],
  [[1024,669],[1060,647],[1100,682],[1086,721],[1142,750],[1107,798],[1132,844],[1081,875],[1050,944],[1009,915],[967,936],[942,892],[912,873],[928,818],[893,783],[928,742],[962,743],[978,700]],
  [[46,115],[77,134],[109,82],[132,125],[170,120],[156,167],[194,199],[152,225],[154,267],[109,253],[80,292],[65,246],[24,252],[36,205],[5,176],[40,153]],
  [[565,345],[587,371],[624,367],[623,400],[648,423],[618,449],[604,473],[568,459],[542,474],[523,448],[514,419],[534,398],[529,374]],
  [[392,891],[428,923],[481,882],[491,936],[552,958],[510,995],[501,1059],[453,1036],[411,1087],[403,1034],[342,1010],[375,967],[348,932]],
  [[1020,803],[1047,804],[1063,818],[1069,846],[1050,867],[1021,872],[1001,851],[995,825]],
  [[309,0],[331,61],[350,71],[370,109],[406,130],[368,150],[348,203],[334,249],[318,210],[300,162],[277,138],[247,129],[283,108],[295,70]],
  [[842,433],[878,465],[929,438],[940,490],[998,495],[974,544],[1056,567],[1011,602],[1035,658],[976,647],[959,714],[909,678],[868,728],[851,679],[798,699],[801,644],[755,626],[782,579],[742,542],[798,520],[794,472]],
  [[447,280],[479,316],[537,307],[516,355],[540,393],[498,411],[490,465],[447,435],[404,474],[399,422],[349,414],[382,370],[363,329],[418,332]],
]

const shapes = CONTOURS.map(points => {
  const minX = Math.min(...points.map(p => p[0])), minY = Math.min(...points.map(p => p[1]))
  const w = Math.max(...points.map(p => p[0])) - minX, h = Math.max(...points.map(p => p[1])) - minY
  const scale = 240 / Math.max(w, h)
  const left = (256 - w * scale) / 2 - minX * scale, top = (256 - h * scale) / 2 - minY * scale
  return { points, scale, left, top }
})

/** Normalized boundaries are shared by the dotted edge mask and ignition. */
export const FIREWORK_OUTLINES = shapes.map(({ points, scale, left, top }) =>
  points.map(([x, y]) => ({ x: (x * scale + left - 128) / 256, y: (y * scale + top - 128) / 256 })))

// Build once per sprite: the original silhouette dissolves into increasingly
// sparse pixel dots. Interior pixels remain untouched; there is no circular mask.
const createDottedEdgeMask = (outline: { x: number; y: number }[], index: number) => {
  const mask = document.createElement('canvas'); mask.width = mask.height = 256
  const c = mask.getContext('2d')!
  const points = outline.map(p => ({ x: p.x * 256 + 128, y: p.y * 256 + 128 }))
  const cell = 3
  for (let y = 0; y < 256; y += cell) for (let x = 0; x < 256; x += cell) {
    const px = x + cell / 2, py = y + cell / 2
    let inside = false, distanceSquared = Infinity
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[j], b = points[i], dx = b.x - a.x, dy = b.y - a.y
      if ((a.y > py) !== (b.y > py) && px < (b.x - a.x) * (py - a.y) / (b.y - a.y) + a.x) inside = !inside
      const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy || 1)))
      distanceSquared = Math.min(distanceSquared, (px - a.x - t * dx) ** 2 + (py - a.y - t * dy) ** 2)
    }
    const distance = Math.sqrt(distanceSquared) * (inside ? 1 : -1)
    if (distance <= -7) continue
    if (distance >= 14) { c.globalAlpha = 1; c.fillStyle = '#fff'; c.fillRect(x, y, cell, cell); continue }
    const u = (distance + 7) / 21, density = u * u * (3 - 2 * u)
    // Stable spatial noise avoids both a regular cut edge and animation flicker.
    let hash = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ Math.imul(index + 1, 1274126177)
    hash = Math.imul(hash ^ (hash >>> 13), 1274126177)
    const noise = ((hash ^ (hash >>> 16)) >>> 0) / 4294967296
    if (noise > density) continue
    const size = density > .93 ? cell : .9 + density * 2.1
    c.globalAlpha = .2 + .8 * density; c.fillStyle = '#fff'
    c.fillRect(px - size / 2, py - size / 2, size, size)
  }
  return mask
}

export const prepareFireworkArt = async () => {
  const image = new Image()
  image.decoding = 'async'; image.src = referenceUrl
  await image.decode()
  const sprites = shapes.map(({ scale, left, top }, index) => {
    const sprite = document.createElement('canvas'); sprite.width = sprite.height = 256
    const c = sprite.getContext('2d')!
    c.imageSmoothingQuality = 'high'
    c.setTransform(scale, 0, 0, scale, left, top)
    c.drawImage(image, 0, 0, 1360, 1158)
    const mask = createDottedEdgeMask(FIREWORK_OUTLINES[index], index)
    c.resetTransform(); c.globalCompositeOperation = 'destination-in'
    c.drawImage(mask, 0, 0)
    c.globalCompositeOperation = 'source-over'
    mask.width = mask.height = 0
    return sprite
  })
  image.src = ''
  return sprites
}
