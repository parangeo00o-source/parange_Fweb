import * as THREE from 'three'
import { FilesetResolver, ImageSegmenter, InteractiveSegmenter, PoseLandmarker } from '@mediapipe/tasks-vision'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

export type ResidentModel = { group: THREE.Group; animate: (time: number, walking: boolean) => void; dispose: () => void; portrait: string; mapped: boolean }
type Mask = { data: Float32Array; width: number; height: number }
type Bounds = { left: number; top: number; right: number; bottom: number }
const clamp = THREE.MathUtils.clamp
const makeCanvas = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c }
const modelBase = 'https://storage.googleapis.com/mediapipe-models/'
const tick = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()))

// Only model weights are downloaded. Photos remain in browser memory.
let models: Promise<{ object: InteractiveSegmenter; human: ImageSegmenter; pose: PoseLandmarker }> | null = null
export const prepareResidentModels = () => {
  models ??= (async () => {
    const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm')
    const human = await ImageSegmenter.createFromOptions(vision, {
      baseOptions: { modelAssetPath: `${modelBase}image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite` },
      runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false,
    })
    let pose: PoseLandmarker | undefined
    try {
      pose = await PoseLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: `${modelBase}pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task` }, runningMode: 'IMAGE', numPoses: 1, outputSegmentationMasks: true })
      const object = await InteractiveSegmenter.createFromModelPath(vision, `${modelBase}interactive_segmenter_v2/magic_touch/int8/1/interactive_segmentation.task`)
      return { object, human, pose }
    } catch (error) { human.close(); pose?.close(); throw error }
  })().catch(error => { models = null; throw error })
  return models
}

const boundsOf = (mask: Mask): Bounds => {
  let left = mask.width, top = mask.height, right = -1, bottom = -1
  for (let y = 0; y < mask.height; y++) for (let x = 0; x < mask.width; x++) if (mask.data[y * mask.width + x] > .5) {
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
  }
  if (right < left || bottom < top) throw new Error('형체를 찾지 못했어요. 배경과 구분되는 이미지로 다시 시도해 주세요.')
  return { left: left / mask.width, top: top / mask.height, right: (right + 1) / mask.width, bottom: (bottom + 1) / mask.height }
}
const sampleMask = (mask: Mask, x: number, y: number) => mask.data[clamp(Math.floor(y * mask.height), 0, mask.height - 1) * mask.width + clamp(Math.floor(x * mask.width), 0, mask.width - 1)]

const cutPerson = (photo: HTMLCanvasElement, mask: Mask) => {
  const cutout = makeCanvas(photo.width, photo.height), ctx = cutout.getContext('2d')!
  ctx.drawImage(photo, 0, 0)
  const pixels = ctx.getImageData(0, 0, photo.width, photo.height)
  let covered = 0
  for (let y = 0; y < photo.height; y++) for (let x = 0; x < photo.width; x++) {
    const alpha = clamp((sampleMask(mask, x / photo.width, y / photo.height) - .4) / .35, 0, 1)
    pixels.data[(y * photo.width + x) * 4 + 3] = Math.round(alpha * 255)
    if (alpha > .5) covered++
  }
  if (covered < photo.width * photo.height * .015) throw new Error('카메라에서 사람을 찾지 못했어요. 얼굴과 상체가 보이도록 다시 촬영해 주세요.')
  ctx.putImageData(pixels, 0, 0)
  return cutout
}

const validPose = (landmarks: NormalizedLandmark[]) => [0, 11, 12].every(i => landmarks[i] && (landmarks[i].visibility ?? 1) > .45)
const limbSegments = [[11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28]]

// Piecewise transfer follows the uploaded figure's head, torso and limb axes.
// Missing/occluded joints are not fabricated; those pixels use the body crop.
const transferPoint = (u: number, v: number, target: NormalizedLandmark[], source: NormalizedLandmark[], fallback: { x: number; y: number }) => {
  if (!validPose(target) || !validPose(source)) return fallback
  const tw = Math.hypot(target[11].x - target[12].x, target[11].y - target[12].y)
  const sw = Math.hypot(source[11].x - source[12].x, source[11].y - source[12].y)
  const head = target[0], sourceHead = source[0]
  if (v < (target[11].y + target[12].y) * .5 && Math.hypot(u - head.x, v - head.y) < tw * .8) {
    return { x: sourceHead.x + (u - head.x) * sw / Math.max(tw, .03), y: sourceHead.y + (v - head.y) * sw / Math.max(tw, .03) }
  }
  let best = tw * .22, result: { x: number; y: number } | null = null
  for (const [a, b] of limbSegments) {
    if ([target[a], target[b], source[a], source[b]].some(p => !p || (p.visibility ?? 1) < .5)) continue
    const dx = target[b].x - target[a].x, dy = target[b].y - target[a].y, len = Math.hypot(dx, dy)
    const t = clamp(((u - target[a].x) * dx + (v - target[a].y) * dy) / (len * len || 1), 0, 1)
    const dist = Math.hypot(u - target[a].x - t * dx, v - target[a].y - t * dy)
    if (dist < best) {
      best = dist
      const sx = source[b].x - source[a].x, sy = source[b].y - source[a].y, sl = Math.hypot(sx, sy)
      const offset = ((u - target[a].x) * -dy + (v - target[a].y) * dx) / Math.max(len, .001)
      result = { x: source[a].x + sx * t - sy / Math.max(sl, .001) * offset * sw / Math.max(tw, .03), y: source[a].y + sy * t + sx / Math.max(sl, .001) * offset * sw / Math.max(tw, .03) }
    }
  }
  if (result) return result
  const top = (target[11].y + target[12].y) / 2, bottom = (target[23].y + target[24].y) / 2
  const st = (source[11].y + source[12].y) / 2, sb = (source[23].y + source[24].y) / 2
  if ((source[23].visibility ?? 0) > .45 && (source[24].visibility ?? 0) > .45 && v >= top && v <= bottom && Math.abs(u - (target[11].x + target[12].x) / 2) < tw * .6) return { x: (source[11].x + source[12].x) / 2 + (u - (target[11].x + target[12].x) / 2) * sw / Math.max(tw, .03), y: st + (v - top) / Math.max(bottom - top, .03) * (sb - st) }
  return fallback
}

export const buildResident = async (reference: HTMLImageElement, photo: HTMLCanvasElement, report: (message: string) => void, signal: AbortSignal): Promise<ResidentModel> => {
  const check = () => signal.throwIfAborted()
  report('형체와 사람을 알아보는 중이에요…')
  const tasks = await prepareResidentModels(); check(); await tick(); check()
  const source = makeCanvas(Math.round(reference.naturalWidth * Math.min(1, 640 / Math.max(reference.naturalWidth, reference.naturalHeight))), Math.round(reference.naturalHeight * Math.min(1, 640 / Math.max(reference.naturalWidth, reference.naturalHeight))))
  source.getContext('2d')!.drawImage(reference, 0, 0, source.width, source.height)
  const rgba = source.getContext('2d')!.getImageData(0, 0, source.width, source.height).data
  let transparent = 0
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] < 64) transparent++
  let objectMask: Mask
  if (transparent > source.width * source.height * .08) {
    const data = new Float32Array(source.width * source.height)
    for (let i = 0; i < data.length; i++) data[i] = rgba[i * 4 + 3] / 255
    objectMask = { data, width: source.width, height: source.height }
  } else {
    tasks.object.setImage(source)
    // 1 = POSITIVE; tasks-vision 1.0.1 declares but does not export BrushMode.
    const mask = tasks.object.segment([{ brushMode: 1, point: [{ x: .5, y: .48 }], isCompleted: true }])
    objectMask = { data: new Float32Array(mask.getAsFloat32Array()), width: mask.width, height: mask.height }; mask.close()
  }
  const bounds = boundsOf(objectMask)
  const coverage = objectMask.data.reduce((sum, v) => sum + (v > .5 ? 1 : 0), 0) / objectMask.data.length
  if (coverage > .97 || coverage < .008) throw new Error('형체를 분리하기 어려워요. 대상이 중앙에 있는 이미지나 투명 배경 PNG를 사용해 주세요.')
  report('촬영한 사람의 배경을 지우고 있어요…'); await tick(); check()
  const humanResult = tasks.human.segment(photo)
  const humanMaskResult = humanResult.confidenceMasks?.[0]
  if (!humanMaskResult) { humanResult.close(); throw new Error('인물 분리에 실패했어요. 다시 촬영해 주세요.') }
  const humanMask: Mask = { data: new Float32Array(humanMaskResult.getAsFloat32Array()), width: humanMaskResult.width, height: humanMaskResult.height }; humanResult.close()
  const targetResult = tasks.pose.detect(source), targetPose = targetResult.landmarks[0] ?? []; targetResult.close()
  const personResult = tasks.pose.detect(photo), personPose = personResult.landmarks[0] ?? []
  const poseMask = personResult.segmentationMasks?.[0]
  if (poseMask && validPose(personPose)) {
    const refined: Mask = {data: new Float32Array(poseMask.getAsFloat32Array()), width: poseMask.width, height: poseMask.height}
    for(let y=0;y<humanMask.height;y++)for(let x=0;x<humanMask.width;x++)humanMask.data[y*humanMask.width+x]=Math.min(humanMask.data[y*humanMask.width+x],sampleMask(refined,x/humanMask.width,y/humanMask.height))
  }
  personResult.close()
  const cutout = cutPerson(photo, humanMask), humanBounds = boundsOf(humanMask)
  const mapped = validPose(targetPose) && validPose(personPose)
  report(mapped ? '얼굴과 팔다리 위치에 맞춰 옷을 입히고 있어요…' : '둥근 미니어처에 인물 텍스처를 입히고 있어요…'); await tick(); check()

  const textureCanvas = makeCanvas(512, 512), tc = textureCanvas.getContext('2d')!
  const personPixels = cutout.getContext('2d')!.getImageData(0, 0, cutout.width, cutout.height)
  // Nearest-person-pixel dilation fills UV gaps using only segmented person
  // colors, never camera background, while retaining an opaque plush surface.
  const w = cutout.width, h = cutout.height, nearest = new Int32Array(w * h).fill(-1), queue = new Int32Array(w * h)
  let end = 0
  for (let i = 0; i < nearest.length; i++) if (personPixels.data[i * 4 + 3] > 180) { nearest[i] = i; queue[end++] = i }
  for (let head = 0; head < end; head++) {
    const i = queue[head], x = i % w
    for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (n >= 0 && n < nearest.length && nearest[n] < 0) { nearest[n] = nearest[i]; queue[end++] = n }
  }
  const filled = makeCanvas(w, h), filledContext = filled.getContext('2d')!, extended = filledContext.createImageData(w, h)
  for (let i = 0; i < nearest.length; i++) { const at = nearest[i] * 4; for (let c = 0; c < 3; c++) extended.data[i * 4 + c] = personPixels.data[at + c]; extended.data[i * 4 + 3] = 255 }
  filledContext.putImageData(extended, 0, 0)
  const softened = makeCanvas(w, h), softContext = softened.getContext('2d')!
  softContext.filter = 'blur(14px)'; softContext.drawImage(filled, 0, 0)
  const softPixels = softContext.getImageData(0, 0, w, h).data
  const pixels = tc.createImageData(512, 512)
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const u = x / 511, v = y / 511
    const point = transferPoint(bounds.left + u * (bounds.right - bounds.left), bounds.top + v * (bounds.bottom - bounds.top), targetPose, personPose, { x: humanBounds.left + u * (humanBounds.right - humanBounds.left), y: humanBounds.top + v * (humanBounds.bottom - humanBounds.top) })
    const sourceIndex = clamp(Math.round(point.y * (h - 1)), 0, h - 1) * w + clamp(Math.round(point.x * (w - 1)), 0, w - 1)
    const sample = nearest[sourceIndex] * 4, blend = personPixels.data[sourceIndex * 4 + 3] / 255
    const at = (y * 512 + x) * 4
    for (let c = 0; c < 3; c++) pixels.data[at + c] = personPixels.data[sample + c] * blend + softPixels[sourceIndex * 4 + c] * (1 - blend)
    pixels.data[at + 3] = 255
  }
  tc.putImageData(pixels, 0, 0)
  const texture = new THREE.CanvasTexture(textureCanvas); texture.colorSpace = THREE.SRGBColorSpace
  const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: .9, metalness: 0 })

  // Recognized human figures get fully volumetric, articulated toy proportions.
  // Their measurements and texture windows come from the uploaded pose; other
  // objects retain their individual contour through the inflated mesh below.
  if (validPose(targetPose) && (targetPose[23]?.visibility ?? 0) > .5 && (targetPose[24]?.visibility ?? 0) > .5) {
    const group = new THREE.Group(), joints: THREE.Group[] = [], geometries: THREE.BufferGeometry[] = []
    const sw = Math.hypot(targetPose[11].x - targetPose[12].x, targetPose[11].y - targetPose[12].y)
    const rect = (x: number, y: number, width: number, height: number) => ({ left: (x-width/2-bounds.left)/(bounds.right-bounds.left), top: (y-height/2-bounds.top)/(bounds.bottom-bounds.top), right: (x+width/2-bounds.left)/(bounds.right-bounds.left), bottom: (y+height/2-bounds.top)/(bounds.bottom-bounds.top) })
    const part = (parent: THREE.Group, position: number[], scale: number[], area: Bounds) => {
      const geometry = new THREE.SphereGeometry(1, 28, 20), positions = geometry.attributes.position, uv = geometry.attributes.uv
      for (let i=0;i<positions.count;i++) uv.setXY(i,area.left+(positions.getX(i)+1)*.5*(area.right-area.left),1-(area.top+(1-positions.getY(i))*.5*(area.bottom-area.top)))
      geometries.push(geometry); const mesh = new THREE.Mesh(geometry, mat); mesh.position.set(position[0],position[1],position[2]);mesh.scale.set(scale[0],scale[1],scale[2]);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh)
    }
    const shoulders = {x:(targetPose[11].x+targetPose[12].x)/2,y:(targetPose[11].y+targetPose[12].y)/2}, hips = {x:(targetPose[23].x+targetPose[24].x)/2,y:(targetPose[23].y+targetPose[24].y)/2}
    const torsoWidth = clamp(sw / Math.max(hips.y-shoulders.y,.08)*.15,.14,.23)
    part(group,[0,.54,0],[torsoWidth,.235,.13],rect((shoulders.x+hips.x)/2,(shoulders.y+hips.y)/2,sw,Math.abs(hips.y-shoulders.y)*1.12))
    const headWidth = Math.max(Math.abs(targetPose[7].x-targetPose[8].x)*1.5,sw*.50)
    part(group,[0,.94,0],[.20*clamp(headWidth/sw*1.8,.85,1.2),.22,.18],rect(targetPose[0].x,targetPose[0].y-headWidth*.09,headWidth,headWidth*source.width/source.height*1.25))
    for (let side=0;side<2;side++) {
      const a=side===0?11:12,b=side===0?13:14,c=side===0?15:16,sign=targetPose[a].x<shoulders.x?-1:1
      const arm=new THREE.Group();arm.position.set(sign*(torsoWidth+.04),.67,0);arm.rotation.z=sign*.17;group.add(arm);joints.push(arm)
      const upper=targetPose[a],elbow=targetPose[b],hand=targetPose[c]
      part(arm,[0,-.085,0],[.066,.145,.068],rect((upper.x+elbow.x)/2,(upper.y+elbow.y)/2,sw*.22,Math.max(Math.abs(elbow.y-upper.y),sw*.35)))
      part(arm,[0,-.215,.012],[.061,.076,.067],rect(hand.x,hand.y,sw*.25,sw*.25))
      const hip=targetPose[side===0?23:24],knee=targetPose[side===0?25:26],ankle=targetPose[side===0?27:28]
      const leg=new THREE.Group();leg.position.set(sign*torsoWidth*.52,.34,0);group.add(leg);joints.push(leg)
      part(leg,[0,-.12,0],[.086,.15,.089],rect((hip.x+knee.x)/2,(hip.y+knee.y)/2,sw*.33,Math.max(Math.abs(knee.y-hip.y),sw*.4)))
      part(leg,[0,-.275,.035],[.088,.056,.12],rect(ankle.x,ankle.y,sw*.3,sw*.22))
    }
    return {group,mapped,portrait:cutout.toDataURL('image/png'),animate:(time,walking)=>{joints.forEach((joint,i)=>{joint.rotation.x=walking?Math.sin(time*.009+(i<2?0:Math.PI))*(i%2?.48:.28):0});group.children[0].scale.y=.235*(1+Math.sin(time*.002)*.015)},dispose:()=>{geometries.forEach(g=>g.dispose());mat.dispose();texture.dispose()}}
  }

  // Inflate the unique mask as a closed, rounded front/back volume. The grid
  // distance field preserves ears, tails, handles and holes rather than
  // selecting a stock character. UVs retain semantic transfer above.
  const N = 100, M = 112, count = (N + 1) * (M + 1), mask = new Uint8Array(count), distance = new Float32Array(count)
  const bw = bounds.right - bounds.left, bh = bounds.bottom - bounds.top
  for (let y = 0; y <= M; y++) for (let x = 0; x <= N; x++) {
    const i = y * (N + 1) + x
    mask[i] = x > 0 && x < N && y > 0 && y < M && sampleMask(objectMask, bounds.left + x / N * bw, bounds.top + y / M * bh) > .5 ? 1 : 0
    distance[i] = mask[i] ? 1000 : 0
  }
  for (let i = 0; i < count; i++) if (mask[i]) distance[i] = Math.min(distance[i], i % (N + 1) ? distance[i - 1] + 1 : 0, i > N ? distance[i - N - 1] + 1 : 0)
  for (let i = count - 1; i >= 0; i--) if (mask[i]) distance[i] = Math.min(distance[i], i % (N + 1) < N ? distance[i + 1] + 1 : 0, i + N + 1 < count ? distance[i + N + 1] + 1 : 0)
  const pos: number[] = [], uvs: number[] = [], indices: number[] = []
  const aspect = clamp(bw * source.width / (bh * source.height), .42, 1.55)
  for (const side of [1, -1]) for (let y = 0; y <= M; y++) for (let x = 0; x <= N; x++) {
    const u = x / N, v = y / M, d = distance[y * (N + 1) + x]
    const chibiWidth = 1 + .14 * Math.exp(-Math.pow((v - .22) / .28, 2))
    const px = (u - .5) * aspect * chibiWidth, py = (1 - v) * 1.12
    const z = side * (.014 + .21 * Math.sqrt(clamp(d / 22, 0, 1)))
    pos.push(px, py, z); uvs.push(u, 1 - v)
  }
  const activeCells = new Set<number>()
  for (let y = 0; y < M; y++) for (let x = 0; x < N; x++) {
    const a = y * (N + 1) + x, b = a + 1, c = a + N + 1, d = c + 1
    if (mask[a] + mask[b] + mask[c] + mask[d] < 3) continue
    activeCells.add(y * N + x)
    indices.push(a,c,b,b,c,d,a+count,b+count,c+count,b+count,d+count,c+count)
  }
  for (const cell of activeCells) {
    const x = cell % N, y = Math.floor(cell / N), a = y * (N + 1) + x, b = a + 1, c = a + N + 1, d = c + 1
    for (const [neighbor, v1, v2] of [[y>0?cell-N:-1,a,b],[y<M-1?cell+N:-1,d,c],[x>0?cell-1:-1,c,a],[x<N-1?cell+1:-1,b,d]]) if (!activeCells.has(neighbor)) indices.push(v1,v2,v1+count,v2,v2+count,v1+count)
  }
  // Relax voxel-like silhouette edges into a soft sewn-toy surface.
  const neighbors = new Map<number, Set<number>>()
  for (let i=0;i<indices.length;i+=3) for(let j=0;j<3;j++) {
    const a=indices[i+j],b=indices[i+(j+1)%3]
    if(!neighbors.has(a))neighbors.set(a,new Set());if(!neighbors.has(b))neighbors.set(b,new Set())
    neighbors.get(a)!.add(b);neighbors.get(b)!.add(a)
  }
  for(let iteration=0;iteration<4;iteration++) {
    const next=pos.slice()
    for(const [vertex,adjacent] of neighbors) for(let axis=0;axis<3;axis++) {let total=0;for(const n of adjacent)total+=pos[n*3+axis];next[vertex*3+axis]=pos[vertex*3+axis]*.35+total/adjacent.size*.65}
    for(let i=0;i<pos.length;i++)pos[i]=next[i]
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere()
  const mesh = new THREE.Mesh(geometry, mat); mesh.castShadow = true; mesh.receiveShadow = true
  const group = new THREE.Group(); group.add(mesh)
  const original = new Float32Array(pos)
  let lastAnimated = 0
  const animate = (time: number, walking: boolean) => {
    if (time - lastAnimated < 45) return
    lastAnimated = time
    const positions = geometry.attributes.position
    for (let i = 0; i < positions.count; i++) {
      const x = original[i * 3], y = original[i * 3 + 1], z = original[i * 3 + 2]
      const legWeight = clamp((.40 - y) / .30, 0, 1), stride = walking ? Math.sin(time * .010 + (x < 0 ? 0 : Math.PI)) : 0
      positions.setXYZ(i, x, y + Math.max(0, stride) * legWeight * .035, z + stride * legWeight * .085)
    }
    positions.needsUpdate = true
    mesh.rotation.z = walking ? Math.sin(time * .005) * .025 : Math.sin(time * .0015) * .015
  }
  return { group, animate, mapped, portrait: cutout.toDataURL('image/png'), dispose: () => { geometry.dispose(); mat.dispose(); texture.dispose() } }
}
