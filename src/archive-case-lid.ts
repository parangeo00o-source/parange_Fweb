import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { caseFootprint } from './archive-case-dimensions'

type Track = (geometry: THREE.BufferGeometry, material: THREE.Material) => void
type Surface = (w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => THREE.Texture

/** A hollow cast-metal cover with a threaded blue bow and a formed inner panel. */
export function createArchiveCaseLid(model: THREE.Group, metal: THREE.Material, chrome: THREE.Material, dark: THREE.Material, makeTexture: Surface, track: Track) {
  const pivot = new THREE.Group()
  pivot.name = 'case-lid'
  pivot.position.set(0, 1.84, -5.55)
  model.add(pivot)
  // Use the same material instance as the lower body, including machining maps.
  const silver = metal
  const pewter = metal
  function part(g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = pivot) {
    track(g, m)
    const item = new THREE.Mesh(g, m)
    item.position.set(x, y, z); item.castShadow = item.receiveShadow = true
    parent.add(item); return item
  }
  function box(w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material, radius = .045, parent: THREE.Object3D = pivot) {
    return part(new RoundedBoxGeometry(w, h, d, 3, radius), material, x, y, z, parent)
  }
  function roundedPath(w: number, h: number, r: number) {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r)
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r)
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y)
    return s
  }
  function shell(w: number, d: number, radius: number, thickness: number, y: number, mat: THREE.Material, inset = 0, apertures: [number, number][] = []) {
    const shape = roundedPath(w, d, radius)
    if (inset) shape.holes.push(roundedPath(w - inset * 2, d - inset * 2, Math.max(.12, radius - inset)))
    for (const [x, z] of apertures) {
      const hole = new THREE.Path(); hole.absarc(x, 5.55 - z, .245, 0, Math.PI * 2, true); shape.holes.push(hole)
    }
    const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .035, bevelThickness: .025, curveSegments: 16 })
    const positions = g.getAttribute('position'), normals = g.getAttribute('normal'), uv = g.getAttribute('uv')
    for (let i = 0; i < uv.count; i++) {
      // Side walls need their own UV axis; collapsed side UVs cause a white
      // anisotropic reflection that makes identical silver look mismatched.
      if (Math.abs(normals.getZ(i)) > .65) uv.setXY(i, positions.getX(i) / w + .5, positions.getY(i) / d + .5)
      else uv.setXY(i, Math.abs(normals.getX(i)) > .5 ? positions.getY(i) / d + .5 : positions.getX(i) / w + .5, positions.getZ(i) / thickness)
    }
    const item = part(g, mat, 0, y, 5.55); item.rotation.x = -Math.PI / 2
    return item
  }
  // Continuous rounded casting and a recessed seal replace the riveted patchwork.
  // Extrusion adds .035 on each edge; compensate so the closed lid's outer
  // contour matches the lower chassis exactly, including its tighter corners.
  const { width, depth, radius } = caseFootprint
  shell(width - .07, depth - .07, radius - .035, .68, -.04, silver, .27)
  shell(width - .23, depth - .23, .12, .045, -.085, dark, .13)
  shell(width - .07, depth - .07, radius - .035, .22, .66, pewter)
  shell(width - .1, depth - .1, .18, .075, .88, chrome, .14)
  shell(12.68, 10.98, .18, .035, .89, dark, .065)
  // A threaded outer face: actual apertures in the metal veneer, backed by
  // recessed ferrules. The inner liner remains sealed from the cassette bay.
  const stitchRows = [6.0, 4.45, 2.9, 1.35]
  const apertures: [number, number][] = stitchRows.flatMap(z =>
    [-.66, .66].flatMap(x => [[x, z - .43], [x, z + .43]] as [number, number][]))
  shell(12.36, 10.66, .16, .055, .9, silver, 0, apertures)
  const ribbon = new THREE.Group(); ribbon.name = 'case-blue-ribbon'; pivot.add(ribbon)
  // Saturated cyan-blue, rounded and softly glossy like the reference's cord.
  const blue = new THREE.MeshPhysicalMaterial({ color: '#008dcc', roughness: .3, metalness: 0, clearcoat: .45, clearcoatRoughness: .23, specularIntensity: .35, envMapIntensity: .4 })
  const endBlue = new THREE.MeshPhysicalMaterial({ color: '#008dbd', roughness: .3, metalness: .18, clearcoat: .65 })
  const V = (x:number,y:number,z:number) => new THREE.Vector3(x,y,z)
  function cord(points: THREE.Vector3[], radius: number, name: string, closed = false) {
    const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal')
    const item = part(new THREE.TubeGeometry(curve, Math.max(64, points.length * 18), radius, 16, closed), blue, 0, 0, 0, ribbon)
    item.name = name
    if (!closed) for (const p of [points[0], points[points.length - 1]]) {
      part(new THREE.SphereGeometry(radius, 24, 16), blue, p.x, p.y, p.z, ribbon)
    }
    return curve
  }
  for (const [x,z] of apertures) {
    const recess = part(new THREE.CylinderGeometry(.24,.24,.025,32), dark, x,.905,z,ribbon)
    recess.name = 'case-lacing-recess'
    const rim = part(new THREE.TorusGeometry(.265,.035,12,40), chrome,x,.967,z,ribbon)
    rim.rotation.x = Math.PI/2; rim.name = 'case-lacing-eyelet'
  }
  // Two generous asymmetric loops. The returning strands rise above the
  // outgoing strands; the centre binding wraps around both instead of flattening.
  cord([V(-.2,1.24,8.55),V(-2,1.27,9.05),V(-3.5,1.3,10.02),V(-4.55,1.27,9.6),V(-4.65,1.25,8.58),V(-3.85,1.28,7.98),V(-2.4,1.35,8.1),V(-.15,1.65,8.7)],.19,'case-bow-left')
  cord([V(.15,1.25,8.55),V(2.05,1.3,9.15),V(3.55,1.32,10.04),V(4.55,1.28,9.55),V(4.6,1.25,8.5),V(3.75,1.27,7.95),V(2.25,1.38,8.12),V(.2,1.65,8.7)],.19,'case-bow-right')
  cord(Array.from({length:28},(_,i)=>{
    const a=i/28*Math.PI*2
    return V(Math.sin(a)*.06,1.48+Math.cos(a)*.41,8.6+Math.sin(a)*.4)
  }),.2,'case-bow-knot',true)
  const tails = [
    [V(-.25,1.26,8.4),V(-1.8,1.27,7.55),V(-2.9,1.24,6.15),V(-3.25,1.21,4.65),V(-3.05,1.2,3.65)],
    [V(.3,1.27,8.4),V(1.85,1.28,7.9),V(2.9,1.25,7.15),V(3.35,1.22,6.05),V(3.15,1.2,5.12)],
  ]
  for (const [i,points] of tails.entries()) {
    const curve=cord(points,.18,`case-bow-tail-${i}`)
    const tip=curve.getPoint(1), tangent=curve.getTangent(1)
    const sleeve=part(new THREE.CylinderGeometry(.184,.184,.24,24),endBlue,tip.x,tip.y,tip.z,ribbon)
    sleeve.quaternion.setFromUnitVectors(V(0,1,0),tangent)
  }
  // Four X stitches: the upper diagonal clears the lower one at every crossing.
  for (const [i,z] of stitchRows.entries()) {
    cord([V(-.66,.91,z+.43),V(-.48,1.12,z+.31),V(0,1.16,z),V(.48,1.12,z-.31),V(.66,.91,z-.43)],.14,`case-stitch-under-${i}`)
    cord([V(.66,.91,z+.43),V(.48,1.22,z+.31),V(0,1.46,z),V(-.48,1.22,z-.31),V(-.66,.91,z-.43)],.14,`case-stitch-over-${i}`)
  }
  // Small etched maker mark leaves the bow and lacing as the main graphic.
  const mark = makeTexture(768, 192, ctx => {
    ctx.fillStyle = '#475156'; ctx.font = '500 72px Arial'; ctx.fillText('PARANGE', 20, 95)
    ctx.font = '22px monospace'; ctx.fillText('R—29  /  SOUND ARCHIVE', 24, 149)
  })
  const signature = part(new THREE.PlaneGeometry(1.6,.4),new THREE.MeshStandardMaterial({map:mark,transparent:true,depthWrite:false,roughness:.65,metalness:.35}),4.35,.967,1.05,ribbon)
  signature.rotation.x=-Math.PI/2;signature.castShadow=false

  // Plain folded aluminium liner; no scenic image or unlit photo plane.
  box(12.5, .075, 10.6, 0, .585, 5.55, dark, .035)
  box(12.12, .06, 10.1, 0, .53, 5.55, silver, .06).name = 'case-inner-liner'
  for (const x of [-6.17, 6.17]) box(.13, .085, 10.52, x, .49, 5.55, silver, .02)
  for (const z of [.34, 10.76]) box(12.44, .085, .13, 0, .49, z, silver, .02)
  for (const x of [-5.9,5.9]) for (const z of [.65,10.45]) {
    part(new THREE.CylinderGeometry(.07,.07,.035,6),chrome,x,.47,z)
  }

  // Real pin hinges aligned to the rotation axis on the back of the base.
  for (const x of [-4.6, 0, 4.6]) {
    box(1.45, .07, .5, x, 1.81, -5.54, chrome, .025, model)
    for (let i = 0; i < 5; i++) {
      const hinge = part(new THREE.CylinderGeometry(.13, .13, .27, 16), i % 2 ? silver : chrome, x - .56 + i * .28, 1.84, -5.55, model)
      hinge.rotation.z = Math.PI / 2
    }
  }
  // Front draw latches bridge the lid seam. Handles release before the lid lifts.
  const latches: THREE.Group[] = []
  for (const x of [-3.5, 3.5]) {
    box(.7, .59, .08, x, 1.43, 5.86, chrome, .065, model)
    const latch = new THREE.Group(); latch.position.set(x, 1.65, 5.92); model.add(latch)
    box(.44, .47, .09, 0, -.2, 0, silver, .04, latch)
    box(.27, .065, .12, 0, -.35, .06, dark, .025, latch)
    latches.push(latch)
    box(.66, .25, .13, x, .12, 11.39, chrome, .06)
  }
  // Slim articulated lid stays. Endpoints are solved from the live hinge pose.
  const stays = [-6.05, 6.05].map(x => {
    const a = new THREE.Vector3(x, 1.3, -3.75)
    const rod = part(new THREE.CylinderGeometry(.035, .035, 1, 10), chrome, 0, 0, 0, model)
    return { x, a, rod }
  })
  function setProgress(progress: number) {
    pivot.rotation.x = -THREE.MathUtils.degToRad(106) * progress
    pivot.updateMatrixWorld(true)
    for (const latch of latches) latch.rotation.x = -.85 * Math.min(progress * 6, 1)
    for (const stay of stays) {
      const b = model.worldToLocal(pivot.localToWorld(new THREE.Vector3(stay.x, .32, 2.7)))
      const delta = b.clone().sub(stay.a)
      stay.rod.position.copy(stay.a).add(b).multiplyScalar(.5)
      stay.rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.clone().normalize())
      stay.rod.scale.y = delta.length()
      stay.rod.visible = progress > .04
    }
  }
  function bounds() {
    pivot.updateMatrixWorld(true)
    return [-6.85, 6.85].flatMap(x => [-.1, 1.85].flatMap(y => [-.3, 11.55].map(z => pivot.localToWorld(new THREE.Vector3(x, y, z)))))
  }
  setProgress(0)
  return { pivot, setProgress, bounds }
}
