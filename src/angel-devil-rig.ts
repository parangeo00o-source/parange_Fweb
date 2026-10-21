import type { FighterPose, FighterSide } from './angel-devil-motion'

type Point = [number, number]
type Matrix = [number, number, number, number, number, number]
type Bone = { pivot: Point; region: Point[] }
type Influences = { offsets: Uint16Array; bones: Uint8Array }
type Skin = { vertices: Float32Array; weights: Float32Array; influences: Influences }
type Rig = Skin & { texture: WebGLTexture | null; image: HTMLImageElement; deformedWith?: Matrix[] }
const GRID = 32
const COUNT = (GRID + 1) ** 2
const BONES = 8
const PADDING = .25
const layouts: Record<FighterSide, Bone[]> = {
  angel: [
    { pivot: [.55, .79], region: [] },
    { pivot: [.63, .61], region: [[.18, 0], [.97, 0], [.97, .59], [.78, .64], [.57, .60], [.38, .54], [.18, .38]] },
    { pivot: [.69, .65], region: [[.68, .61], [.79, .60], [.95, .59], [.96, .73], [.80, .75], [.68, .71]] },
    { pivot: [.52, .67], region: [[.46, .63], [.61, .61], [.72, .67], [.70, .77], [.51, .77], [.43, .71]] },
    { pivot: [.57, .78], region: [[.54, .76], [.67, .75], [.81, .85], [.80, .93], [.64, .92], [.54, .84]] },
    { pivot: [.49, .79], region: [[.46, .76], [.56, .81], [.46, .98], [.25, 1], [.21, .92], [.35, .82]] },
    { pivot: [.45, .63], region: [[.03, .43], [.25, .43], [.45, .58], [.45, .75], [.28, .83], [.03, .72]] },
    { pivot: [.5, .8], region: [] },
  ],
  devil: [
    { pivot: [.49, .78], region: [] },
    { pivot: [.43, .60], region: [[.16, 0], [.92, 0], [.92, .44], [.69, .57], [.51, .61], [.30, .60], [.17, .47]] },
    { pivot: [.44, .63], region: [[.12, .55], [.31, .55], [.46, .59], [.44, .68], [.29, .71], [.12, .70]] },
    { pivot: [.53, .64], region: [[.44, .60], [.58, .60], [.65, .66], [.64, .74], [.50, .75], [.42, .69]] },
    { pivot: [.45, .78], region: [[.35, .74], [.50, .76], [.48, .86], [.41, .94], [.21, .94], [.21, .87]] },
    { pivot: [.53, .79], region: [[.51, .75], [.65, .79], [.85, .94], [.84, 1], [.65, 1], [.51, .87]] },
    { pivot: [.62, .61], region: [[.64, .52], [.74, .44], [.91, .50], [.99, .65], [.77, .69], [.63, .65]] },
    { pivot: [.61, .73], region: [[.60, .69], [.78, .71], [.99, .62], [1, .77], [.86, .82], [.64, .78]] },
  ],
}
const smooth = (t: number) => { const v = Math.max(0, Math.min(1, t)); return v * v * (3 - 2 * v) }
const regionWeight = (x: number, y: number, polygon: Point[]) => {
  if (!polygon.length) return 0
  let inside = false, distance = Infinity
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, ay] = polygon[j], [bx, by] = polygon[i]
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside
    const dx = bx - ax, dy = by - ay
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
    distance = Math.min(distance, Math.hypot(x - ax - t * dx, y - ay - t * dy))
  }
  return smooth(.5 + (inside ? distance : -distance) / .22)
}
const matrix = ([px, py]: Point, angle: number, dx = 0, dy = 0): Matrix => {
  const c = Math.cos(angle), s = Math.sin(angle)
  return [c, s, -s, c, px - c * px + s * py + dx, py - s * px - c * py + dy]
}
const compose = (a: Matrix, b: Matrix): Matrix => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
]

/** Separate shoulder, guarding arm, hips, head and appendage transforms. The
 * connected skin keeps the original illustration intact across moving joints. */
type BoneCache = { windup: number; punch: number; kick: number; twist: number; transforms: Matrix[] }
const boneCache: Partial<Record<FighterSide, BoneCache>> = {}
export const fighterBoneTransforms = (side: FighterSide, pose: FighterPose): Matrix[] => {
  const bones = layouts[side], d = side === 'angel' ? 1 : -1
  const { windup: w, punch: p, kick: k, twist: t } = pose
  const cached = boneCache[side]
  if (cached && cached.windup === w && cached.punch === p && cached.kick === k && cached.twist === t) return cached.transforms
  const torso = matrix(bones[0].pivot, d * t * .09, d * t * .015, w * .018)
  const transforms = [
    torso,
    compose(torso, matrix(bones[1].pivot, -d * t * .07)),
    compose(torso, matrix(bones[2].pivot, -d * (w * .30 + p * .12), d * (-w * .035 + p * .10), -w * .012 - p * .015)),
    compose(torso, matrix(bones[3].pivot, d * (w * .3 + p * .23 + k * .28), -d * p * .015, -(p + k) * .025)),
    matrix(bones[4].pivot, -d * (k * .40 - w * .12 + p * .10), d * k * .018, -k * .008),
    matrix(bones[5].pivot, d * (w * .16 + p * .2 - k * .12), -d * p * .02),
    compose(torso, matrix(bones[6].pivot, d * (w * .13 - (p + k) * .16))),
    compose(torso, matrix(bones[7].pivot, -(p + k) * .18 + w * .1)),
  ]
  boneCache[side] = { windup: w, punch: p, kick: k, twist: t, transforms }
  return transforms
}

const pointWeights = (side: FighterSide, x: number, y: number) => {
  const weights = new Float32Array(BONES)
  weights[0] = 1
  for (const bone of [6, 7, 5, 4, 3, 2, 1]) {
    const weight = regionWeight(x, y, layouts[side][bone].region)
    for (let j = 0; j < BONES; j++) weights[j] *= 1 - weight
    weights[bone] += weight
  }
  return weights
}
// Match the centers of the forward fists in the pre-rendered 3D artwork.
const gripPoints: Record<FighterSide, Point> = { angel: [.85, .666], devil: [.278, .656] }
const grips = Object.fromEntries((['angel', 'devil'] as const).map((side) => {
  const [x, y] = gripPoints[side]
  return [side, [pointWeights(side, x, y), pointWeights(side, x + .02, y)]]
})) as Record<FighterSide, [Float32Array, Float32Array]>

/** Use the hand's skin weights, not the whole sprite's origin, for equipment. */
type Grip = { x: number; y: number; angle: number }
const gripCache: Partial<Record<FighterSide, { transforms: Matrix[]; grip: Grip }>> = {}
export const fighterHandGrip = (side: FighterSide, pose: FighterPose) => {
  const transforms = fighterBoneTransforms(side, pose)
  const cached = gripCache[side]
  if (cached?.transforms === transforms) return cached.grip
  const points = grips[side].map((weights, sample) => {
    const x = gripPoints[side][0] + sample * .02, y = gripPoints[side][1]
    let tx = 0, ty = 0
    for (let bone = 0; bone < BONES; bone++) {
      const m = transforms[bone], w = weights[bone]
      tx += (m[0] * x + m[2] * y + m[4]) * w
      ty += (m[1] * x + m[3] * y + m[5]) * w
    }
    return { x: tx, y: ty }
  })
  const grip = { ...points[0], angle: Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x) }
  gripCache[side] = { transforms, grip }
  return grip
}

const skinTemplates: Partial<Record<FighterSide, Skin>> = {}
const skinTemplate = (side: FighterSide): Skin => {
  const cached = skinTemplates[side]
  if (cached) return cached
  const vertices = new Float32Array(COUNT * 4), weights = new Float32Array(COUNT * BONES)
  const offsets = new Uint16Array(COUNT + 1), bones: number[] = []
  for (let row = 0; row <= GRID; row++) for (let col = 0; col <= GRID; col++) {
    const i = row * (GRID + 1) + col, x = col / GRID, y = row / GRID
    vertices.set([x, y, x, y], i * 4)
    // Limbs override torso weights; the head is assigned last so a raised
    // fist cannot pull the neighboring eyes out of shape.
    weights.set(pointWeights(side, x, y), i * BONES)
    offsets[i] = bones.length
    // Preserve the original accumulation order and Float32 weights exactly;
    // omit only the zero-weight joints that cannot affect this vertex.
    for (let bone = 0; bone < BONES; bone++) if (weights[i * BONES + bone] !== 0) bones.push(bone)
  }
  offsets[COUNT] = bones.length
  const template = { vertices, weights, influences: { offsets, bones: new Uint8Array(bones) } }
  skinTemplates[side] = template
  return template
}

export const createFighterSkin = (image: HTMLImageElement, side: FighterSide): Rig => {
  const template = skinTemplate(side)
  // Each renderer owns its mutable vertex/weight data; only immutable lookup
  // tables are shared across reopening the experience.
  return { vertices: template.vertices.slice(), weights: template.weights.slice(), influences: template.influences, image, texture: null }
}

export const deformFighterRig = (rig: Skin, side: FighterSide, pose: FighterPose) => {
  const transforms = fighterBoneTransforms(side, pose)
  const { offsets, bones } = rig.influences
  for (let i = 0; i < COUNT; i++) {
    const x = rig.vertices[i * 4 + 2], y = rig.vertices[i * 4 + 3]
    let tx = 0, ty = 0
    for (let j = offsets[i]; j < offsets[i + 1]; j++) {
      const bone = bones[j]
      const w = rig.weights[i * BONES + bone]
      const m = transforms[bone]
      tx += (m[0] * x + m[2] * y + m[4]) * w
      ty += (m[1] * x + m[3] * y + m[5]) * w
    }
    rig.vertices[i * 4] = tx; rig.vertices[i * 4 + 1] = ty
  }
}

/** One small, reusable offscreen surface. No new frame loop or image assets.
 * WebGL renders the connected texture mesh without cutout seams. */
export const createFighterRigRenderer = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 576; canvas.height = 576
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true, depth: false, stencil: false })
  const rigs = new Map<FighterSide, Rig>()
  const indices = new Uint16Array(GRID * GRID * 6)
  const fallbackIndices = new Uint16Array(GRID * GRID * 6 / 4)
  for (let row = 0, n = 0; row < GRID; row++) for (let col = 0; col < GRID; col++) {
    const a = row * (GRID + 1) + col, b = a + 1, c = a + GRID + 1, d = c + 1
    indices.set([a, b, c, b, d, c], n); n += 6
  }
  for (let row = 0, n = 0; row < GRID; row += 2) for (let col = 0; col < GRID; col += 2) {
    const a = row * (GRID + 1) + col, b = a + 2, c = a + (GRID + 1) * 2, d = c + 2
    fallbackIndices.set([a, b, c, b, d, c], n); n += 6
  }
  let program: WebGLProgram | null = null, vertexBuffer: WebGLBuffer | null = null, indexBuffer: WebGLBuffer | null = null
  if (gl) {
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type)!
      gl.shaderSource(shader, source); gl.compileShader(shader)
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); return null }
      return shader
    }
    const vertex = compile(gl.VERTEX_SHADER, 'attribute vec4 a_vertex; varying vec2 v_uv; void main(){vec2 p=(a_vertex.xy+0.25)/1.5; gl_Position=vec4(p.x*2.0-1.0,1.0-p.y*2.0,0.0,1.0); v_uv=a_vertex.zw;}')
    const fragment = compile(gl.FRAGMENT_SHADER, 'precision mediump float; varying vec2 v_uv; uniform sampler2D u_image; void main(){vec4 c=texture2D(u_image,v_uv); gl_FragColor=vec4(c.rgb*c.a,c.a);}')
    if (vertex && fragment) {
      program = gl.createProgram()!
      gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program)
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); program = null }
    }
    if (vertex) gl.deleteShader(vertex)
    if (fragment) gl.deleteShader(fragment)
    if (program) {
      gl.useProgram(program)
      vertexBuffer = gl.createBuffer(); indexBuffer = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
      gl.bufferData(gl.ARRAY_BUFFER, COUNT * 4 * 4, gl.DYNAMIC_DRAW)
      const location = gl.getAttribLocation(program, 'a_vertex')
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 4, gl.FLOAT, false, 16, 0)
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW)
      gl.uniform1i(gl.getUniformLocation(program, 'u_image'), 0)
      gl.clearColor(0, 0, 0, 0)
    }
  }
  let fallback: HTMLCanvasElement | null = null
  const fallbackSurface = () => {
    if (!fallback) {
      fallback = document.createElement('canvas')
      fallback.width = canvas.width; fallback.height = canvas.height
    }
    return fallback
  }
  let renderedRig: Rig | null = null, renderedTransforms: Matrix[] | null = null
  let renderedSurface: HTMLCanvasElement | null = null
  const prepare = (image: HTMLImageElement, side: FighterSide) => {
    if (!image.complete || !image.naturalWidth || rigs.has(side)) return
    const rig = createFighterSkin(image, side)
    if (gl && program) {
      rig.texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, rig.texture)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
    }
    rigs.set(side, rig)
  }
  const draw = (image: HTMLImageElement, side: FighterSide, pose: FighterPose) => {
    prepare(image, side)
    const rig = rigs.get(side)
    if (!rig) return null
    const transforms = fighterBoneTransforms(side, pose)
    const useWebGL = gl && program && !gl.isContextLost()
    const surface = useWebGL ? canvas : fallbackSurface()
    // The attack's fully extended pose lasts several frames. Keep the exact last
    // surface, but invalidate it when another fighter or rendering backend uses it.
    if (renderedRig === rig && renderedTransforms === transforms && renderedSurface === surface) return surface
    if (rig.deformedWith !== transforms) {
      deformFighterRig(rig, side, pose)
      rig.deformedWith = transforms
    }
    renderedRig = rig; renderedTransforms = transforms; renderedSurface = surface
    if (useWebGL) {
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.bindTexture(gl.TEXTURE_2D, rig.texture)
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer); gl.bufferSubData(gl.ARRAY_BUFFER, 0, rig.vertices)
      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0)
      return canvas
    }
    // Canvas fallback samples the same joints at half grid resolution to
    // limit per-triangle clipping work on devices without WebGL.
    const ctx = surface.getContext('2d')!
    ctx.clearRect(0, 0, surface.width, surface.height)
    const scale = surface.width / (1 + PADDING * 2), v = rig.vertices
    for (let t = 0; t < fallbackIndices.length; t += 3) {
      const a = fallbackIndices[t] * 4, b = fallbackIndices[t + 1] * 4, c = fallbackIndices[t + 2] * 4
      const x0 = (v[a] + PADDING) * scale, y0 = (v[a + 1] + PADDING) * scale
      const x1 = (v[b] + PADDING) * scale, y1 = (v[b + 1] + PADDING) * scale
      const x2 = (v[c] + PADDING) * scale, y2 = (v[c + 1] + PADDING) * scale
      const u0 = v[a + 2], w0 = v[a + 3], u1 = v[b + 2] - u0, w1 = v[b + 3] - w0, u2 = v[c + 2] - u0, w2 = v[c + 3] - w0
      const det = u1 * w2 - u2 * w1
      const m0 = ((x1 - x0) * w2 - (x2 - x0) * w1) / det
      const m1 = ((y1 - y0) * w2 - (y2 - y0) * w1) / det
      const m2 = ((x2 - x0) * u1 - (x1 - x0) * u2) / det
      const m3 = ((y2 - y0) * u1 - (y1 - y0) * u2) / det
      ctx.save(); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.closePath(); ctx.clip()
      ctx.setTransform(m0 / image.naturalWidth, m1 / image.naturalWidth, m2 / image.naturalHeight, m3 / image.naturalHeight, x0 - m0 * u0 - m2 * w0, y0 - m1 * u0 - m3 * w0)
      ctx.drawImage(image, 0, 0); ctx.restore()
    }
    return surface
  }
  const dispose = () => {
    if (gl) {
      for (const rig of rigs.values()) gl.deleteTexture(rig.texture)
      gl.deleteBuffer(vertexBuffer); gl.deleteBuffer(indexBuffer); gl.deleteProgram(program)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
    rigs.clear()
    if (fallback) { fallback.width = 0; fallback.height = 0; fallback = null }
    renderedRig = null; renderedTransforms = null; renderedSurface = null
  }
  return { prepare, draw, dispose }
}
