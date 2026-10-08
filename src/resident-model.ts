import * as THREE from 'three'
import { residentDesigns } from './resident-designs'
import type { ResidentDesign } from './resident-designs'
import { headFront, headPoint, residentSculpts } from './resident-sculpt'
import { cacheStaticMeshTransforms } from './planet-performance'

type XYZ = [number, number, number]
type Paint = (x: number, y: number, z: number) => THREE.Color
type Limb = { upper: THREE.Group; lower: THREE.Group; end: THREE.Group }
export type ResidentRig = {
  group: THREE.Group
  animate: (time: number, walking: boolean, mood?: 'normal' | 'held' | 'meeting') => void
  dispose: () => void
}

/** Closed, shaded geometry only. No camera-facing cards or turnaround textures. */
export function createResidentRig(index: number): ResidentRig {
  const design = residentDesigns[index]
  if (!design) throw new RangeError(`Unknown resident: ${index}`)
  const sculpt = residentSculpts[design.kind]
  const root = new THREE.Group(), motionRoot = new THREE.Group()
  root.name = `resident-${design.kind}`
  root.add(motionRoot)
  const geometryPool = new Set<THREE.BufferGeometry>()
  const texturePool = new Set<THREE.Texture>()
  const materialPool = new Map<string, THREE.MeshPhysicalMaterial>()
  const furFinish=(shade:THREE.MeshPhysicalMaterial)=>{
    // Subtle moulded/felt grain; palette stays on a fully volumetric surface.
    shade.onBeforeCompile=shader=>{
      shader.vertexShader='varying vec3 vResidentSurface;\n'+shader.vertexShader
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvResidentSurface=position;')
      shader.fragmentShader='varying vec3 vResidentSurface;\n'+shader.fragmentShader
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        float pigment=fract(sin(dot(floor(vResidentSurface*420.0),vec3(127.1,311.7,74.7)))*43758.5453);
        float detail=1.0-smoothstep(.0015,.009,length(fwidth(vResidentSurface)));
        diffuseColor.rgb*=mix(1.0,mix(.955,1.025,pigment),detail);
      `)
    }
    shade.customProgramCacheKey=()=> 'resident-sculpt-fur-v2'
  }
  const material = (color: string, finish: 'fur' | 'plastic' | 'eye' = 'plastic', painted = false) => {
    const key = `${color}/${finish}/${painted}`
    let result = materialPool.get(key)
    if (!result) {
      result = new THREE.MeshPhysicalMaterial({ color, vertexColors: painted,
        roughness: finish === 'fur' ? .39 : finish === 'eye' ? .24 : .38,
        envMapIntensity:finish==='eye'?.12:.30,
        metalness: 0, clearcoat: finish === 'fur' ? .10 : finish === 'eye' ? .02 : .12, clearcoatRoughness: .40 })
      if(finish==='fur')furFinish(result)
      materialPool.set(key, result)
    }
    return result
  }
  const fur = material(design.fur, 'fur'), cream = material(design.cream, 'fur')
  const secondary = material(design.secondary, 'fur'), suit = material(design.suit)
  const trim = material(design.trim), gloves = material(design.gloves), boots = material(design.boots)
  const black = material('#100f16', 'eye'), pink = material('#f68daf', 'fur')
  const gold = material('#ffd324'), seam = material('#3b2730', 'fur')
  const sphere = new THREE.SphereGeometry(1, 32, 24)
  geometryPool.add(sphere)
  const mesh = (name: string, geometry: THREE.BufferGeometry, shade: THREE.Material, parent: THREE.Object3D,
    position: XYZ = [0,0,0], scale: XYZ = [1,1,1]) => {
    geometryPool.add(geometry)
    const result = new THREE.Mesh(geometry, shade)
    result.name = name; result.position.set(...position); result.scale.set(...scale)
    result.castShadow = true; result.receiveShadow = true; parent.add(result)
    return result
  }
  const ellipsoid = (name: string, parent: THREE.Object3D, shade: THREE.Material, position: XYZ, scale: XYZ) => mesh(name, sphere, shade, parent, position, scale)
  const pivot = (name: string, parent: THREE.Object3D, position: XYZ) => {
    const result = new THREE.Group(); result.name = name; result.position.set(...position); parent.add(result); return result
  }
  const colored = material('#ffffff', 'fur', true)
  const furColor = new THREE.Color(design.fur), creamColor = new THREE.Color(design.cream)
  const secondaryColor = new THREE.Color(design.secondary)
  const suitColor = new THREE.Color(design.suit), trimColor = new THREE.Color(design.trim)

  // Analytic, wrap-around colour masks. They contain no reference photographs:
  // UVs simply keep crisp facial markings on the sculpted surface at every angle.
  // Sampling per texel instead of per vertex avoids saw-toothed mask boundaries.
  const surfaceMaterial = (name:string, paint:Paint, finish:'fur'|'plastic' = 'fur', projection?:(u:number,v:number)=>XYZ) => {
    const cached=materialPool.get(`surface-${name}`)
    if(cached)return cached
    const width=512, height=256, pixels=new Uint8Array(width*height*4)
    for(let row=0;row<height;row++)for(let col=0;col<width;col++){
      const u=(col+.5)/width,v=(row+.5)/height, phi=u*Math.PI*2, theta=(1-v)*Math.PI
      const xyz:XYZ=projection?projection(u,v):[-Math.cos(phi)*Math.sin(theta),Math.cos(theta),Math.sin(phi)*Math.sin(theta)]
      const c=paint(...xyz).clone().convertLinearToSRGB()
      const offset=(row*width+col)*4
      pixels[offset]=Math.round(c.r*255);pixels[offset+1]=Math.round(c.g*255);pixels[offset+2]=Math.round(c.b*255);pixels[offset+3]=255
    }
    const texture=new THREE.DataTexture(pixels,width,height,THREE.RGBAFormat)
    texture.name=`authored-mask-${name}`;texture.colorSpace=THREE.SRGBColorSpace
    texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter
    texture.wrapS=THREE.RepeatWrapping;texture.needsUpdate=true;texturePool.add(texture)
    const shade=material('#ffffff',finish).clone();shade.map=texture;if(finish==='fur')furFinish(shade);materialPool.set(`surface-${name}`,shade)
    return shade
  }
  const sculptedVolume = (name:string,parent:THREE.Object3D,shade:THREE.Material,position:XYZ,
    transform:(x:number,y:number,z:number)=>XYZ) => {
    const geometry=new THREE.SphereGeometry(1,64,48), positions=geometry.getAttribute('position')
    for(let i=0;i<positions.count;i++)positions.setXYZ(i,...transform(positions.getX(i),positions.getY(i),positions.getZ(i)))
    smoothSculptNormals(geometry);return mesh(name,geometry,shade,parent,position)
  }

  // A swept tube with a varying elliptical section: tails, trunks, ears and
  // antlers retain their thickness at all angles. Both ends close to a point.
  const sweep = (name: string, parent: THREE.Object3D, shade: THREE.Material, points: XYZ[],
    radius: (t: number) => number, flatten = 1, paint?: (t: number, angle: number) => THREE.Color,
    segments = 36, sides = 20) => {
    const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)))
    const frames = curve.computeFrenetFrames(segments, false)
    const positions: number[] = [], colors: number[] = [], indices: number[] = []
    for (let i = 0; i <= segments; i++) {
      const t = i / segments, center = curve.getPointAt(t), r = i === 0 || i === segments ? 0 : radius(t)
      for (let j = 0; j <= sides; j++) {
        const angle = j / sides * Math.PI * 2
        const point = center.clone().addScaledVector(frames.normals[i], Math.cos(angle) * r)
          .addScaledVector(frames.binormals[i], Math.sin(angle) * r * flatten)
        positions.push(point.x, point.y, point.z)
        if (paint) { const color = paint(t, angle); colors.push(color.r, color.g, color.b) }
        if (i < segments && j < sides) {
          const a = i * (sides + 1) + j, b = a + sides + 1
          indices.push(a, a+1, b, b, a+1, b+1)
        }
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    if (paint) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setIndex(indices); smoothSculptNormals(geometry)
    return mesh(name, geometry, shade, parent)
  }
  const line = (name: string, parent: THREE.Object3D, shade: THREE.Material, points: XYZ[], radius = .007) =>
    sweep(name, parent, shade, points, () => radius, 1, undefined, 18, 8)
  const ring = (name: string, parent: THREE.Object3D, shade: THREE.Material, radius: number, tube: number, position: XYZ, scale: XYZ = [1,1,1]) => {
    const result = mesh(name, new THREE.TorusGeometry(radius, tube, 10, 48), shade, parent, position, scale)
    result.rotation.x = Math.PI / 2; return result
  }
  const loft = (name: string, parent: THREE.Object3D, shade: THREE.Material, profile: Array<[number,number]>, depth: number, paint?: Paint) => {
    const curve = new THREE.SplineCurve(profile.map(([radius,y]) => new THREE.Vector2(radius,y)))
    const sampled = curve.getPoints(56).map(point => new THREE.Vector2(Math.max(0,point.x),point.y))
    const geometry = new THREE.LatheGeometry(sampled, 64)
    if (paint) {
      // The same spline supplies the garment UV colour mask and real volume.
      // Neck opening, armhole trim and waist bands remain continuous on the back.
      const rows=Array.from({length:256},(_,i)=>curve.getPoint((i+.5)/256))
      shade=surfaceMaterial(name,paint,'plastic',(u,v)=>{
        const point=rows[Math.min(255,Math.floor(v*256))]
        return [Math.sin(u*Math.PI*2)*point.x,point.y,Math.cos(u*Math.PI*2)*point.x]
      })
    }
    return mesh(name, geometry, shade, parent, [0,0,0], [1,1,depth])
  }

  const pelvis = pivot('hips', motionRoot, [0,.4*sculpt.leg[1],0])
  const torso = pivot('spine', pelvis, [0,0,0])
  // Scale garment geometry, not the articulated spine: non-uniform parent
  // scales otherwise squash heads and mittens when their joints rotate.
  const jacket=pivot('garment',torso,[0,0,0]);jacket.scale.set(...sculpt.body)
  const hipShade=['cat','elephant','deer','sheep','mouse','otter','raccoon','koala','duck'].includes(design.kind)?suit:design.kind==='fox'?secondary:fur
  if(design.kind!=='penguin')ellipsoid('hip-volume', pelvis, hipShade, [0,.015,0], [.21*sculpt.body[0],design.kind==='capybara'?.17:.125,.169*sculpt.body[2]])
  // A continuous garment shell, including the back and the rolled hem.
  const dress = design.kind === 'rabbit'
  const penguin = design.kind === 'penguin'
  if(penguin){
    const belly=new THREE.SphereGeometry(1,80,56)
    const bellyShade=surfaceMaterial('penguin-bib',(x,y,z)=>{
      const bib=1-(x/.75)**2-((y+.05)/1.12)**2
      const base=furColor.clone().lerp(creamColor,THREE.MathUtils.smoothstep(Math.min(bib,z-.08),-.03,.03))
      const blue=1-(x/(.43-.10*y))**2-((y+.04)/.79)**2
      return base.lerp(suitColor,THREE.MathUtils.smoothstep(Math.min(blue,z-.22),-.025,.025))
    },'plastic')
    mesh('penguin-round-belly',belly,bellyShade,jacket,[0,.155,0],[.273,.32,.231])
  }else loft('garment-shell', jacket, suit, dress
    ? [[0,-.052],[sculpt.hem,-.052],[sculpt.hem+.008,-.022],[sculpt.hem,.035],[sculpt.waist,.25],[sculpt.chest,.38],[.145,.44],[0,.448]]
    : [[0,.055],[sculpt.hem-.018,.055],[sculpt.hem,.084],[sculpt.hem,.14],[sculpt.waist,.26],[sculpt.chest,.37],[.151,.438],[0,.45]], .79,
    (x,y,z) => {
      if (dress) return y < .025 ? trimColor : suitColor
      if (design.kind === 'frog') return z > .045 && Math.abs(x) < .14 && y>.15 ? trimColor : suitColor
      if (y < .123) return design.kind==='mouse'?new THREE.Color('#332f3a'):trimColor
      if (design.kind === 'cat') return new THREE.Color('#ffe036')
      if (design.kind === 'fox') return z > 0 && (Math.abs(x) < .054 || y < .16) ? trimColor : suitColor
      if (design.kind === 'penguin') return z > .065 && Math.abs(x) < .18 ? suitColor : furColor
      if (design.kind === 'duck') return y>.30&&z>.03 ? trimColor : suitColor
      // The rounded white armhole inset follows the shell, not a plane.
      const armhole=1-((Math.abs(x)-sculpt.chest-.01)/.070)**2-((y-.345)/.112)**2
      return suitColor.clone().lerp(trimColor,THREE.MathUtils.smoothstep(Math.min(armhole,Math.abs(z)-.045),-.012,.012))
    })
  if(!penguin&&design.kind!=='frog')ring('rolled-hem', jacket, design.kind==='mouse'?trim:design.kind==='cat'?cream:trim, sculpt.hem-.003, .006, [0,dress ? -.027 : .09,0], [1,.79,1])
  ellipsoid('neck', jacket, fur, [0,.462,0], [.125,.082,.113])
  if (dress) {
    for (const side of [-1,1]) {
      line('wrap-dress-lapel', jacket, trim, [[side*.115,.424,.10],[side*.06,.325,.143],[0,.267,.152]], .024)
    }
  } else if (design.kind !== 'cat') {
    ring('padded-collar', jacket, suit, .16, .037, [0,.429,0], [1,.82,1])
    if (design.kind==='bear') {
      // Folded hood has its own rear volume and stitched rim.
      ellipsoid('folded-hood', jacket, suit, [0,.378,-.139], [.223,.082,.092])
      line('hood-seam', jacket, trim, [[-.17,.38,-.188],[0,.342,-.221],[.17,.38,-.188]], .005)
    }
    if(design.kind==='capybara'){
      const packShade=surfaceMaterial('capybara-pack',(_x,_y,z)=>suitColor.clone().lerp(trimColor,
        THREE.MathUtils.smoothstep(.12-Math.abs(_x),-.018,.018)*THREE.MathUtils.smoothstep(-z,.15,.4)))
      sculptedVolume('capybara-backpack',jacket,packShade,[0,.31,-.19],(x,y,z)=>[x*.171,y*.184,z*.121])
      for(const side of [-1,1])line('pack-strap',jacket,trim,[[side*.14,.425,-.13],[side*.185,.405,-.03],[side*.18,.335,.09]],.015)
    }
    if (design.kind==='bear') ellipsoid('chest-badge', jacket, gold, [0,.29,sculpt.waist*.79+.008], [.045,.056,.018])
    if (design.kind==='dog') {
      line('dog-chest-frame',jacket,trim,[[-.071,.327,.167],[0,.336,.176],[.071,.327,.167]],.020)
      line('dog-chest-frame',jacket,trim,[[-.071,.327,.167],[-.065,.254,.17],[0,.248,.181],[.065,.254,.17],[.071,.327,.167]],.015)
    }
  }
  if (design.kind === 'penguin') {
    ring('scarf-wrap', jacket, suit, .203, .046, [0,.443,0], [1,.85,1])
    const flap = ellipsoid('scarf-end', jacket, suit, [-.15,.327,-.176], [.061,.155,.028]); flap.rotation.z = -.32
  }

  const limbs: Limb[] = [], legs: Limb[] = []
  for (const side of [-1,1]) {
    const label = side < 0 ? 'left' : 'right'
    const shoulder = pivot(`${label}-shoulder`, torso, [side*(sculpt.chest+.014)*sculpt.body[0],.345*sculpt.body[1],0])
    shoulder.scale.set(...sculpt.arm)
    shoulder.rotation.z = side*(design.kind==='capybara'?.46:.54)
    const isWing = penguin || design.kind === 'duck'
    if(penguin)shoulder.rotation.z=side*.62
    const bare=dress||penguin
    const sleeveShade=design.kind==='elephant'?trim:bare?fur:design.kind==='mouse'?trim:suit
    if(!penguin)loft(`${label}-upper-sleeve`, shoulder, sleeveShade,
      [[0,-.195],[.066,-.177],[.08,-.13],[.084,-.045],[.076,.018],[.047,.041],[0,.045]],1)
    const elbow = pivot(`${label}-elbow`, shoulder, [0,-.164,0])
    if(!penguin)ellipsoid(`${label}-forearm`, elbow, bare ? fur : design.kind==='mouse'?trim:design.kind==='elephant'?trim:suit, [0,-.022,0], [.077,.102,.08])
    if (!dress&&!penguin&&design.kind!=='duck') loft(`${label}-cuff`,elbow,design.kind==='cat'||design.kind==='frog'?gold:trim,
      [[0,-.094],[.083,-.094],[.091,-.083],[.09,-.035],[.08,-.027],[0,-.027]],1)
    const wrist = pivot(`${label}-wrist`, elbow, [0,-.112,.012])
    const hand=sculpt.hand
    if(penguin){
      // A single continuous paddle, not three visible sleeve/joint/glove balls.
      sculptedVolume(`${label}-flipper`,shoulder,fur,[0,-.174,.02],(x,y,z)=>[
        x*.118*(1-.22*y),y*.225,z*.086+.025*(1-y*y)])
    }else{
      const mitten=ellipsoid(`${label}-glove`, wrist, design.kind==='frog'&&side>0?fur:gloves, [0,-.041,.019], isWing ? [.111*hand,.14*hand,.077*hand] : [.112*hand,.113*hand,.107*hand])
      if(isWing)mitten.rotation.z=-side*.23
    }
    if(design.kind==='duck')for(let feather=0;feather<3;feather++){
      const plume=ellipsoid(`${label}-wing-feather`,wrist,cream,[side*(.045+feather*.020),-.064+feather*.055,.041],[.097,.047,.056])
      plume.rotation.z=-side*.3
    }
    if (!isWing&&design.kind==='fox') ellipsoid(`${label}-thumb`, wrist, gloves, [-side*.085,-.014,.073], [.041,.059,.039])
    limbs.push({ upper: shoulder, lower: elbow, end: wrist })
    const stance=Math.max(sculpt.stance,.132*sculpt.shoe[0]*sculpt.leg[0]+.006)
    const hip = pivot(`${label}-hip`, pelvis, [side*stance,-.015,0])
    hip.scale.set(...sculpt.leg)
    if(!penguin)ellipsoid(`${label}-thigh`, hip, design.kind === 'cat' ? gold : ['bear','frog','rabbit','capybara','dog'].includes(design.kind) ? fur : suit, [0,-.058,0], [.083,.111,.09])
    const knee = pivot(`${label}-knee`, hip, [0,-.137,0])
    if(!penguin)ellipsoid(`${label}-shin`, knee, dress || design.kind==='frog'||design.kind==='duck' ? fur : design.kind === 'cat' ? gold : suit, [0,-.035,0], [.086,.103,.085])
    const ankle = pivot(`${label}-ankle`, knee, [0,-.117,0])
    // Each shoe is a rounded last with a substantial toe and heel, not a thin
    // sphere under a stack of exposed joint balls. Everything follows the ankle.
    const [sw,sh,sd]=sculpt.shoe
    const shoeShade=['fox','dog'].includes(design.kind)?surfaceMaterial(`${design.kind}-toecap`,(_x,y,z)=>
      new THREE.Color(design.boots).lerp(creamColor,THREE.MathUtils.smoothstep(Math.min(z-.43,.28-y),-.025,.025)),'plastic')
      :['bear','rabbit','koala','elephant','raccoon','deer','sheep','otter'].includes(design.kind)
        ?surfaceMaterial(`${design.kind}-boot-stripe`,(_x,y,z)=>new THREE.Color(design.boots).lerp(trimColor,
          THREE.MathUtils.smoothstep(.14-Math.abs(y-.45-z*.18),-.015,.015)),'plastic'):design.kind==='frog'&&side<0?fur:boots
    const tallBoot=!['duck','penguin','frog','capybara'].includes(design.kind)
    sculptedVolume(`${label}-boot`,ankle,shoeShade,[0,0,0],(x,y,z)=>{
      const upper=tallBoot?THREE.MathUtils.smoothstep(y,0,1):0
      // One closed last flows from the broad toe into the ankle; no intersecting shaft.
      return [x*.129*sw*(1+.10*z)*(1-.22*upper),
        -.045+y*.105*sh+(y<0?.013*y*y:0)+(.185-.105*sh)*upper,
        z*.167*sd*(1-.45*upper)+.058*(1-upper)]
    })
    // The rounded last already closes underneath. A second thin sole and a
    // separate ankle torus made every species look like stacked toy parts.
    legs.push({ upper: hip, lower: knee, end: ankle })
  }

  const head = pivot('neck-head', torso, [0,.443*sculpt.body[1]+design.head[1]*.91,0])
  const hz = design.head[2]
  const headGeometry = new THREE.SphereGeometry(1, 80, 64)
  const vertices = headGeometry.getAttribute('position')
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), y = vertices.getY(i), z = vertices.getZ(i)
    const point=headPoint(sculpt,design.head,x,y,z)
    vertices.setXYZ(i,point.x,point.y,point.z)
  }
  smoothSculptNormals(headGeometry)
  mesh('sculpted-head', headGeometry, surfaceMaterial(`${design.kind}-face`,headPaint(design)), head)
  const eyes: THREE.Group[] = []
  const eye = (x: number, y: number, z: number, size = 1, parent: THREE.Object3D = head) => {
    const eyePivot = pivot('eye', parent, [x,y,z])
    if(design.kind!=='frog'){
      const step=.001,dx=(headFront(sculpt,design.head,x+step,y)-headFront(sculpt,design.head,x-step,y))/(2*step)
      const dy=(headFront(sculpt,design.head,x,y+step)-headFront(sculpt,design.head,x,y-step))/(2*step)
      eyePivot.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(-dx,-dy,1).normalize())
    }
    ellipsoid('eye-gloss', eyePivot, black, [0,0,0], [sculpt.eyes[2]*size,sculpt.eyes[3]*size,.015*size])
    eyes.push(eyePivot)
  }
  if (design.kind !== 'frog') for (const side of [-1,1]) {
    const x = side*sculpt.eyes[0], y=sculpt.eyes[1]
    eye(x,y,headFront(sculpt,design.head,x,y)+.002)
  }
  const muzzle = (width: number, height: number, depth: number, y = -.115, shade = cream) =>
    ellipsoid('muzzle-volume', head, shade, [0,y,hz*.87], [width,height,depth])
  const nose = (position: XYZ, size: XYZ = [.048,.03,.034]) => ellipsoid('nose', head, black, position, size)
  const earPivots: THREE.Group[] = []
  const roundEar = (side: number, x: number, y: number, width: number, height: number, inside: THREE.Material, outer = fur) => {
    const ear = pivot(`ear-${side}`, head, [side*x,y,-.04]); ear.rotation.y = side*.2
    const innerColor=(inside as THREE.MeshPhysicalMaterial).color, outerColor=outer.color
    const shade=surfaceMaterial(`round-ear-${innerColor.getHexString()}-${outerColor.getHexString()}`,(x,y,z)=>{
      const scallop=design.kind==='koala'?.075*Math.cos(Math.atan2(y,x)*5):0
      return outerColor.clone().lerp(innerColor,THREE.MathUtils.smoothstep(Math.min(.73+scallop-Math.hypot(x,y+.015),z-.17),-.018,.018))
    })
    sculptedVolume('ear-shell',ear,shade,[0,0,0],(x,y,z)=>[
      x*width,y*height,z*.118-(z>0?.025*(1-x*x-y*y)**2:0)])
    earPivots.push(ear); return ear
  }
  const pointedEar = (side: number, tall: number, outerColor = furColor) => {
    const ear = pivot(`ear-${side}`, head, [side*.211,.125,-.028]); ear.rotation.z = -side*.19
    // Closed, bowed triangular shells with recessed coloured inner cups.
    const insetColor=design.kind==='cat'?new THREE.Color('#f58ca8'):creamColor
    const shade=surfaceMaterial(`pointed-ear-${outerColor.getHexString()}`,(x,y,z)=>{
      const distance=Math.min(z-.48,1-(x/.61)**2-((y+.03)/.70)**2)
      return outerColor.clone().lerp(insetColor,THREE.MathUtils.smoothstep(distance,-.018,.018))
    })
    sculptedVolume('pointed-ear-shell',ear,shade,[0,0,0],(x,y,z)=>{
      const t=(y+1)/2, section=Math.sqrt(Math.max(0,1-y*y)), sine=Math.max(0,Math.sin(Math.PI*t))
      return [section>1e-6?x/section*.177*(1-t)**.65*sine**.30:0,t*tall,
        (section>1e-6?z/section*.108*sine**.65:0)-.024*t*t-(z>0?.024*(1-x*x)*sine:0)]
    })
    earPivots.push(ear)
  }
  let trunk: THREE.Group | null = null
  switch (design.kind) {
    case 'fox': {
      pointedEar(-1,.40); pointedEar(1,.40)
      // Cheeks and projecting muzzle are now part of the continuous head
      // surface (resident-sculpt), not a crescent stuck onto a round head.
      nose([0,-.040,headFront(sculpt,design.head,0,-.040)+.012],[.035,.021,.023]); break
    }
    case 'bear':
      roundEar(-1,.256,.24,.13,.14,cream); roundEar(1,.256,.24,.13,.14,cream)
      muzzle(.174,.121,.119,-.113); nose([0,-.068,.383],[.045,.029,.03]); break
    case 'rabbit':
      for (const side of [-1,1]) {
        const ear=pivot(`ear-${side}`,head,[side*.140,.210,-.025]); ear.rotation.z=-side*.27
        const shade=surfaceMaterial('rabbit-ear',(x,y,z)=>furColor.clone().lerp(new THREE.Color('#ef77a5'),
          THREE.MathUtils.smoothstep(Math.min(1-(x/.65)**2-((y-.04)/.76)**2,z-.3),-.025,.025)))
        sculptedVolume('long-ear',ear,shade,[0,.203,0],(x,y,z)=>[x*.124*(1+.13*y),y*.270,z*.101-(z>0?.027*(1-x*x-y*y)**2:0)])
        earPivots.push(ear)
      }
      break
    case 'cat':
      pointedEar(-1,.335,secondaryColor); pointedEar(1,.335,furColor)
      nose([0,-.079,.306],[.021,.014,.018])
      for (const side of [-1,1]) for (let i=0;i<2;i++) line('cat-whisker-mark',head,seam,
        [[side*.20,-.045-i*.05,headFront(sculpt,design.head,side*.20,-.045-i*.05)+.005],
        [side*.248,-.035-i*.05,headFront(sculpt,design.head,side*.248,-.035-i*.05)+.005],
        [side*.285,-.04-i*.05,headFront(sculpt,design.head,side*.285,-.04-i*.05)+.005]],.009)
      break
    case 'penguin':
      sculptedVolume('penguin-beak',head,gold,[0,-.085,.302],(x,y,z)=>[x*.088*(1-z*.25),y*.045,z*.089])
      sweep('penguin-crest',head,fur,[[0,.25,-.06],[.01,.345,-.06],[.055,.358,-.097]],t=>.038*Math.sin(Math.PI*t))
      break
    case 'koala':
      roundEar(-1,.332,.141,.222,.224,cream); roundEar(1,.332,.141,.222,.224,cream)
      muzzle(.128,.079,.075,-.130)
      sculptedVolume('nose',head,black,[0,-.006,.313],(x,y,z)=>[x*.094*(1-.18*y),y*.124,z*.068]); break
    case 'frog':
      for (const side of [-1,1]) {
        ellipsoid('eye-turret',head,fur,[side*.227,.197,-.002],[.153,.174,.143])
        ellipsoid('eye-sclera',head,cream,[side*.227,.219,.100],[.119,.139,.055])
        eye(side*.227,.242,.147)
      }
      sculptedVolume('frog-throat',head,cream,[0,-.070,.085],(x,y,z)=>[x*.346,y*.113,z*.244])
      line('frog-smile',head,secondary,[[-.28,-.03,.197],[0,-.057,.307],[.28,-.03,.197]],.0035)
      break
    case 'elephant':
      roundEar(-1,.335,.055,.238,.277,cream); roundEar(1,.335,.055,.238,.277,cream)
      trunk=pivot('trunk-joint',head,[0,-.024,.275])
      sweep('curled-trunk',trunk,fur,[[0,.065,-.075],[0,-.045,.015],[0,-.130,.098],[0,-.146,.181],[0,-.112,.254],[0,-.054,.301],[0,.018,.319]],
        t=>.109*(1-.42*t)*Math.sqrt(Math.max(0,1-Math.max(0,(t-.88)/.12)**2)),1,undefined,80,32)
      break
    case 'raccoon':
      pointedEar(-1,.29,secondaryColor);pointedEar(1,.29,secondaryColor)
      muzzle(.151,.099,.10,-.134); nose([0,-.086,.369],[.034,.024,.031]); break
    case 'deer':
      for (const side of [-1,1]) {
        const ear=roundEar(side,.287,.163,.157,.087,cream); ear.rotation.z=side*.42
        const antler=pivot(`antler-${side}`,head,[side*.145,.255,-.048])
        sweep('antler-main',antler,secondary,[[0,0,0],[side*.025,.10,0],[side*.06,.195,0],[side*.044,.255,-.008]],t=>.049*(1-.24*t))
        sweep('antler-branch',antler,secondary,[[side*.018,.078,0],[side*.09,.116,0],[side*.13,.176,.004]],t=>.040*(1-.35*t))
        sweep('antler-inner-tine',antler,secondary,[[side*.032,.132,0],[-side*.019,.170,.005],[-side*.027,.212,.004]],t=>.030*(1-.3*t))
        ellipsoid('antler-rounded-tip',antler,secondary,[side*.044,.246,-.008],[.037,.044,.037])
        ellipsoid('antler-rounded-tip',antler,secondary,[side*.125,.171,.004],[.028,.035,.028])
        ellipsoid('antler-rounded-tip',antler,secondary,[-side*.027,.207,.004],[.022,.029,.022])
      }
      muzzle(.112,.091,.075); nose([0,-.07,.318],[.041,.031,.029]); break
    case 'dog':
      for (const side of [-1,1]) {
        const ear=pivot(`ear-${side}`,head,[side*.253,.201,-.025]); ear.rotation.z=side*.30
        sculptedVolume('floppy-ear',ear,secondary,[side*.031,-.151,.006],(x,y,z)=>[
          x*.118*(1-.22*y),y*.252,z*.099+.035*(1-y*y)])
        earPivots.push(ear)
      }
      muzzle(.156,.10,.075,-.128); nose([0,-.077,.355],[.048,.031,.029]); break
    case 'duck':
      sculptedVolume('upper-bill',head,secondary,[0,-.09,.325],(x,y,z)=>[x*.219*(1+.22*z),y*.078+.025*z*z-.014*z,z*.216])
      ellipsoid('lower-bill',head,secondary,[0,-.136,.347],[.202,.022,.178])
      line('bill-mouth',head,material('#b06b12'),[[-.19,-.133,.378],[0,-.137,.528],[.19,-.133,.378]],.003)
      for(let i=0;i<3;i++) {
        const crest=ellipsoid('duck-crest',head,fur,[.016+i*.024,.285+i*.013,-.039-i*.035],[.055,.076,.075]);crest.rotation.x=.55
      }
      break
    case 'sheep': {
      // Full wool cap: the back is wool too, not just five frontal decorations.
      for (let ringIndex=0;ringIndex<4;ringIndex++) {
        const latitude=.24+ringIndex*.38, count=ringIndex===3?5:9
        for(let j=0;j<count;j++) {
          const angle=j/count*Math.PI*2+(ringIndex%2)*.22
          const x=Math.sin(angle)*Math.cos(latitude)*.30, y=Math.sin(latitude)*.30, z=Math.cos(angle)*Math.cos(latitude)*.26
          if(z>.14 && Math.abs(x)<.245 && y<.18) continue
          ellipsoid('wool-lock',head,cream,[x,y,z],[.113,.115,.107])
        }
      }
      for (const side of [-1,1]) {
        const ear=pivot(`ear-${side}`,head,[side*.302,.07,.015]);ear.rotation.z=side*.40
        ellipsoid('sheep-drooping-ear',ear,pink,[side*.054,-.105,.025],[.101,.167,.074]);earPivots.push(ear)
      }
      for(let j=0;j<9;j++) {
        const a=(j/8)*Math.PI+Math.PI/2
        ellipsoid('back-wool-lock',head,cream,[Math.sin(a)*.29,-.076,Math.cos(a)*.258],[.09,.13,.1])
      }
      // The original has large, soft forehead curls, not a tiny bead necklace.
      for(let j=0;j<5;j++)ellipsoid('forehead-wool-curl',head,cream,[(j-2)*.094,.23+(.05-Math.abs(j-2)*.025),.184],[.116,.115,.095])
      break
    }
    case 'mouse':
      roundEar(-1,.263,.239,.232,.252,pink); roundEar(1,.263,.239,.232,.252,pink)
      muzzle(.120,.077,.087,-.117,fur); nose([0,-.092,.326],[.017,.013,.017]); break
    case 'otter':
      roundEar(-1,.249,.185,.07,.082,secondary); roundEar(1,.249,.185,.07,.082,secondary)
      sculptedVolume('otter-cheeks',head,cream,[0,-.105,.168],(x,y,z)=>[x*.290,y*.143,z*.154])
      nose([0,-.035,.335],[.038,.024,.026]); break
    case 'capybara':
      roundEar(-1,.215,.215,.054,.065,secondary); roundEar(1,.215,.215,.054,.065,secondary)
      // An elongated continuous head with a broad brown muzzle cap, rather
      // than a round bear-like head with an extra brown nose ball.
      for (const side of [-1,1]) {
        const nostril=ellipsoid('nostril',head,seam,[side*.077,.024,headFront(sculpt,design.head,side*.077,.024)+.003],[.010,.019,.008])
        nostril.rotation.z=-side*.35
      }
      // Fur-coloured abdomen remains visible below the cropped green top.
      ellipsoid('capybara-round-belly',pelvis,fur,[0,-.005,.027],[.260,.175,.190])
      break
  }
  if (design.kind === 'otter' || design.kind === 'mouse') for (const side of [-1,1]) for(let j=0;j<3;j++) {
    const spread=design.kind==='otter'?1.17:1
    line('whisker',head,seam,[[side*.16,-.096-j*.024,.288],[side*.226*spread,-.075-j*.03,.30],[side*.29*spread,-.056-j*.038,.29]],.004)
  }

  const tail = pivot('tail-base', pelvis, [0,.135,-.145])
  switch (design.kind) {
    case 'fox':
      sweep('fox-brush',tail,colored,[[0,0,0],[-.055,.064,-.23],[-.17,.29,-.43],[-.22,.59,-.44],[-.25,.80,-.36]],
        t=>.226*Math.sin(Math.PI*t)**.57,.90,
        (t,a)=>furColor.clone().lerp(creamColor,THREE.MathUtils.smoothstep(t-(.68+.035*Math.cos(a*5)),-.006,.006)),72,40); break
    case 'cat':
      sweep('curled-cat-tail',tail,colored,[[0,0,0],[0,.025,-.20],[.10,.16,-.32],[.17,.39,-.33],[.135,.53,-.28]],
        t=>.112*Math.sin(Math.PI*t)**.3,1,(t)=>t>.67?secondaryColor:t>.40?creamColor:furColor,48,24); break
    case 'raccoon':
      sweep('striped-raccoon-tail',tail,colored,[[0,0,0],[0,.08,-.20],[.01,.23,-.40],[.025,.39,-.62]],
        t=>.205*Math.sin(Math.PI*t)**.45,1,t=>Math.floor(t*6)%2===0?secondaryColor:furColor,72,32); break
    case 'mouse':
      sweep('mouse-tail',tail,pink,[[0,0,0],[0,-.022,-.19],[.058,.057,-.34],[.086,.264,-.37],[.067,.333,-.32]],
        t=>.024*(1-t*.66),1,undefined,48,14); break
    case 'otter':
      sweep('otter-tail',tail,fur,[[0,0,0],[0,-.008,-.21],[0,.054,-.37],[0,.173,-.50]],
        t=>.116*(1-t)**.7, .76,undefined,40,24); break
    case 'dog':
      sweep('dog-tail',tail,fur,[[0,0,0],[0,.012,-.17],[0,.098,-.29],[0,.185,-.3]],t=>.066*(1-t)**.5); break
    case 'deer':
      sweep('deer-tail',tail,colored,[[0,0,0],[0,.1,-.11],[0,.23,-.16]],t=>.078*Math.sin(Math.PI*t),.65,
        (t)=>t>.54?creamColor:furColor)
      for(const side of [-1,1]) for(let j=0;j<3;j++) ellipsoid('deer-tail-spot',tail,cream,[side*.048,.09+j*.027,-.135],[.012,.014,.008])
      break
    case 'elephant':
      sweep('elephant-tail',tail,fur,[[0,0,0],[0,-.068,-.078],[0,-.161,-.105]],t=>.019*(1-.4*t))
      ellipsoid('tail-tip',tail,secondary,[0,-.157,-.105],[.032,.038,.032]); break
    default:
      ellipsoid('short-tail',tail,design.kind==='rabbit'||design.kind==='sheep'?cream:fur,[0,.012,-.018],
        design.kind==='rabbit'?[.104,.103,.105]:[.065,.067,.069])
  }

  const restEars = earPivots.map(ear=>ear.rotation.clone())
  // Bake species proportions into geometry, never into rotating ancestors.
  // Non-uniform shoulder/hip scales otherwise shear the wrist/boot as an elbow
  // or knee bends. Preserve joint offsets and the authored rest silhouette.
  for(const limb of [...limbs,...legs]){
    const stretch=limb.upper.scale.clone(),matrix=new THREE.Matrix4().makeScale(stretch.x,stretch.y,stretch.z)
    limb.upper.traverse(node=>{
      if(node===limb.upper)return
      node.position.multiply(stretch)
      if(node instanceof THREE.Mesh){
        const local=new THREE.Matrix4().compose(new THREE.Vector3(),node.quaternion,node.scale)
        const geometry=node.geometry.clone().applyMatrix4(matrix.clone().multiply(local))
        geometryPool.add(geometry);node.geometry=geometry
        node.rotation.set(0,0,0);node.scale.setScalar(1)
      }
    })
    limb.upper.scale.setScalar(1)
  }
  const bounds = new THREE.Box3().setFromObject(motionRoot)
  // Keep the sole on local y=0, which planet-world aligns with the surface.
  const floorOffset = -bounds.min.y
  motionRoot.position.y = floorOffset
  let lastTime: number | undefined, locomotion = 0, phase = 0
  const animate = (time: number, walking: boolean, mood: 'normal' | 'held' | 'meeting' = 'normal') => {
    const delta = lastTime === undefined ? 0 : THREE.MathUtils.clamp((time-lastTime)/1000,0,.05)
    lastTime = time
    locomotion = THREE.MathUtils.damp(locomotion,walking?1:0,9,delta)
    const pace = design.motion === 'scurry' ? 12.5 : design.motion === 'amble' ? 7.5 : 9.5
    phase += delta * pace * (.25+.75*locomotion)
    const hop = design.motion === 'hop', waddle = design.motion === 'waddle'
    const bounce = hop ? Math.max(0,Math.sin(phase))*.105 : (1-Math.cos(phase*2))*.011
    motionRoot.position.y = floorOffset + bounce*locomotion + Math.sin(time*.0019)*.004*(1-locomotion)
    motionRoot.rotation.z = Math.sin(phase)*(waddle?.075:.028)*locomotion
    torso.rotation.y = Math.sin(phase)*.045*locomotion
    torso.rotation.x = -.028*locomotion
    for(let i=0;i<2;i++) {
      const step = Math.sin(phase+(hop?0:i*Math.PI)), lift = Math.max(0,step)
      legs[i].upper.rotation.x = step*(hop?.32:.46)*locomotion
      legs[i].lower.rotation.x = -lift*.57*locomotion
      legs[i].end.rotation.x = (-step*.15+lift*.27)*locomotion
      limbs[i].upper.rotation.x = -step*.42*locomotion
      limbs[i].lower.rotation.x = -.10-lift*.23*locomotion
      limbs[i].end.rotation.z = Math.sin(time*.002+i)*.035
    }
    head.rotation.y = Math.sin(time*.0008+index)*.075*(1-locomotion)+Math.sin(phase)*.035*locomotion
    head.rotation.z = Math.sin(time*.0015+index)*.023
    head.rotation.x = Math.sin(phase*2)*.026*locomotion
    earPivots.forEach((ear,i)=>{
      ear.rotation.x = restEars[i].x+Math.sin(phase-.7+i*.2)*.07*locomotion
      ear.rotation.z = restEars[i].z+Math.sin(time*.003+i)*.018
    })
    tail.rotation.y = Math.sin(time*(design.kind==='dog'?.014:.0038))*(design.kind==='dog'?.48:.15)
    tail.rotation.x = Math.sin(phase-.8)*.065*locomotion
    if (trunk) trunk.rotation.x = Math.sin(time*.0028)*.055
    const blinkTime = (time+index*719)%4700
    const blink = blinkTime < 160 ? Math.max(.08,Math.abs(blinkTime-80)/80) : 1
    eyes.forEach(item=>{item.scale.y=blink})
    if(mood==='held'){
      motionRoot.rotation.z=Math.sin(time*.015+index)*.11
      torso.rotation.x=.07+Math.sin(time*.017)*.035
      limbs.forEach((limb,i)=>{limb.upper.rotation.x=Math.sin(time*.021+i*Math.PI)*.9;limb.lower.rotation.x=-.65+Math.sin(time*.025+i)*.25})
      legs.forEach((limb,i)=>{limb.upper.rotation.x=Math.sin(time*.024+i*Math.PI)*.65;limb.lower.rotation.x=-.35-Math.max(0,Math.sin(time*.024+i*Math.PI))*.4})
      head.rotation.z=Math.sin(time*.012)*.07
    }else if(mood==='meeting'){
      torso.rotation.y=Math.sin(time*.0017+index)*.06
      head.rotation.y=Math.sin(time*.0012+index*1.3)*.18
      head.rotation.x=Math.sin(time*.0025+index)*.045
      limbs[0].upper.rotation.x=-.12+Math.sin(time*.002+index)*.09
      limbs[1].lower.rotation.x=-.18-Math.max(0,Math.sin(time*.0014+index))*.22
    }
  }
  // Animation moves joint Groups (including eyelids), not the authored meshes.
  cacheStaticMeshTransforms(root)
  let disposed = false
  return { group: root, animate, dispose: () => {
    if (disposed) return
    disposed = true; geometryPool.forEach(item=>item.dispose()); materialPool.forEach(item=>item.dispose());texturePool.forEach(item=>item.dispose())
    root.removeFromParent(); root.clear()
  } }
}

// Preserve UV seams while sharing their shading normals. Recomputing normals
// after sculpting a sphere otherwise leaves a visible crease along the duplicate
// UV vertices, and slightly different normals at its coincident pole vertices.
function smoothSculptNormals(geometry:THREE.BufferGeometry) {
  geometry.computeVertexNormals()
  const positions=geometry.getAttribute('position'), normals=geometry.getAttribute('normal')
  const groups=new Map<string,{normal:THREE.Vector3;indices:number[]}>()
  for(let i=0;i<positions.count;i++){
    const key=[positions.getX(i),positions.getY(i),positions.getZ(i)].map(n=>Math.round(n*1e6)).join('/')
    let group=groups.get(key)
    if(!group){group={normal:new THREE.Vector3(),indices:[]};groups.set(key,group)}
    group.normal.x+=normals.getX(i);group.normal.y+=normals.getY(i);group.normal.z+=normals.getZ(i);group.indices.push(i)
  }
  for(const {normal,indices} of groups.values())if(indices.length>1){
    normal.normalize()
    for(const i of indices)normals.setXYZ(i,normal.x,normal.y,normal.z)
  }
}

// Analytic UV colour masks on the closed head, not projected reference images.
// Lighting, occlusion and silhouette all come from the authored 3D surface.
function headPaint(design: ResidentDesign): Paint {
  const fur = new THREE.Color(design.fur), cream = new THREE.Color(design.cream)
  const secondary = new THREE.Color(design.secondary)
  const blend = (base: THREE.Color, color: THREE.Color, distance: number) =>
    base.clone().lerp(color,THREE.MathUtils.smoothstep(distance,-.023,.023))
  return (x,y,z) => {
    if(design.kind==='cat')return blend(fur,cream,.12+.73*Math.exp(-(((x+.09)/.28)**2))*Math.max(0,z)-y)
    if (z < .06) return fur
    const ax = Math.abs(x)
    switch (design.kind) {
      case 'fox': return blend(fur,cream,Math.min(-.20+.50*ax*ax+.13*Math.exp(-((x/.35)**2))-y,z-.09))
      case 'penguin': {
        const lobe=1-((ax-.34)/.48)**2-((y+.15)/.84)**2
        return blend(fur,cream,Math.min(lobe,z-.35))
      }
      case 'frog': return blend(fur,cream,-.13-y)
      case 'raccoon': {
        const upper=.48*Math.exp(-(((ax-.39)/.29)**2))-.08-.24*ax, lower=-.44+.34*ax
        const border=blend(fur,cream,Math.min(upper+.12-y,y-lower+.13))
        return blend(border,secondary,Math.min(upper-y,y-lower))
      }
      case 'deer': return blend(fur,cream,1-((ax-.41)/.27)**2-((y+.04)/.65)**2)
      case 'dog': return blend(fur,cream,Math.min(.10+.30*Math.exp(-(((y+.53)/.45)**2))-x,.85-.22*(x+.2)**2-y,z-.1))
      case 'mouse': return fur
      case 'capybara': return blend(fur,secondary,z-.79)
      case 'otter': return blend(fur,cream,-.20+ax*.18-y)
      case 'sheep': return z>.25 ? new THREE.Color('#efcda4') : cream
      default: return fur
    }
  }
}
