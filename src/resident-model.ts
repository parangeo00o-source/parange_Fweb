import * as THREE from 'three'
import { residentDesigns } from './resident-designs'
import type { ResidentDesign } from './resident-designs'
import { headFront, headPoint, residentSculpts } from './resident-sculpt'
import { cacheStaticMeshTransforms } from './planet-performance'
import { residentProfile } from './resident-profile'
import { residentAntlerGeometry } from './resident-antlers'

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
        roughness: finish === 'fur' ? .44 : finish === 'eye' ? .17 : .29,
        envMapIntensity:finish==='eye'?.72:finish==='fur'?.28:.52,
        metalness: 0, clearcoat: finish === 'fur' ? .08 : finish === 'eye' ? .42 : .32, clearcoatRoughness: finish==='eye'?.20:.32 })
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
    const length=curve.getLength(),capStart=Math.min(.16,radius(0)/length),capEnd=Math.min(.16,radius(1)/length)
    const cap=(t:number,span:number)=>span>1e-6&&t<span?Math.sqrt(Math.max(0,1-(1-t/span)**2)):1
    const positions: number[] = [], colors: number[] = [], indices: number[] = []
    for (let i = 0; i <= segments; i++) {
      const t = i / segments, center = curve.getPointAt(t), r = i === 0 || i === segments ? 0 : radius(t)*cap(t,capStart)*cap(1-t,capEnd)
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
    const curve = residentProfile(profile)
    const sampled = curve.getPoints(56).map(point => new THREE.Vector2(Math.max(0,point.x),point.y))
    const geometry = new THREE.LatheGeometry(sampled, 64)
    smoothSculptNormals(geometry)
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
    : [[0,.055],[sculpt.hem-.018,.055],[sculpt.hem,.084],[sculpt.hem,.14],[sculpt.waist,.26],[sculpt.chest,.37],[.151,.438],[0,.45]], .87,
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
  if(!penguin&&design.kind!=='frog')ring('rolled-hem', jacket, design.kind==='mouse'?trim:design.kind==='cat'?cream:trim, sculpt.hem-.003, .006, [0,dress ? -.027 : .09,0], [1,dress?.79:.87,1])
  ellipsoid('neck', jacket, fur, [0,.462,0], [.125,.082,.113])
  if (dress) {
    for (const side of [-1,1]) {
      line('wrap-dress-lapel', jacket, trim, [[side*.115,.424,.10],[side*.06,.325,.143],[0,.267,.152]], .024)
    }
  } else if (design.kind !== 'cat' && !penguin) {
    ring('padded-collar', jacket, suit, .16, .037, [0,.429,0], [1,.82,1])
    if (design.kind==='bear') {
      // Folded hood has its own rear volume and stitched rim.
      sculptedVolume('folded-hood',jacket,suit,[0,.390,-.136],(x,y,z)=>[
        x*.242,y*.115+.043*x*x,z*.141-.034*(1-y*y)])
      sweep('hood-rolled-opening',jacket,suit,[[-.22,.423,-.067],[-.17,.46,-.15],[0,.434,-.257],[.17,.46,-.15],[.22,.423,-.067]],()=>.029,.85)
      line('hood-seam', jacket, trim, [[-.17,.34,-.228],[0,.293,-.243],[.17,.34,-.228]], .004)
    }
    if(design.kind==='capybara'){
      const packShade=surfaceMaterial('capybara-pack',(_x,_y,z)=>suitColor.clone().lerp(trimColor,
        THREE.MathUtils.smoothstep(.12-Math.abs(_x),-.018,.018)*THREE.MathUtils.smoothstep(-z,.15,.4)))
      sculptedVolume('capybara-backpack',jacket,packShade,[0,.31,-.19],(x,y,z)=>[x*.171,y*.184,z*.121])
      for(const side of [-1,1])line('pack-strap',jacket,trim,[[side*.14,.425,-.13],[side*.185,.405,-.03],[side*.18,.335,.09]],.015)
    }
    if (design.kind==='bear') ellipsoid('chest-badge', jacket, gold, [0,.29,sculpt.waist*.87+.008], [.045,.056,.018])
    if (design.kind==='dog') {
      line('dog-chest-frame',jacket,trim,[[-.071,.327,.167],[0,.336,.176],[.071,.327,.167]],.020)
      line('dog-chest-frame',jacket,trim,[[-.071,.327,.167],[-.065,.254,.17],[0,.248,.181],[.065,.254,.17],[.071,.327,.167]],.015)
    }
  }
  if (design.kind === 'penguin') {
    // Broad folded fabric with a real hanging end, not a circular neck tube.
    loft('scarf-wrap',jacket,suit,[[.174,.365],[.237,.364],[.258,.398],[.253,.479],[.225,.503],[.172,.482],[.174,.365]],.87)
    const flap=sculptedVolume('scarf-end',jacket,suit,[-.184,.271,.122],(x,y,z)=>[
      x*.071*(1+.12*y),y*.166,z*.028+.025*Math.sin(y*1.8)])
    flap.rotation.z=-.22
    line('scarf-fold',jacket,material('#079bbb'),[[-.19,.389,.133],[0,.379,.218],[.19,.389,.133]],.004)
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
    }else if(design.kind!=='duck'){
      const mitten=ellipsoid(`${label}-glove`, wrist, design.kind==='frog'&&side>0?fur:gloves, [0,-.041,.019], isWing ? [.111*hand,.14*hand,.077*hand] : [.112*hand,.113*hand,.107*hand])
      if(isWing)mitten.rotation.z=-side*.23
    }
    if(design.kind==='duck'){
      // Three soft feather tips flow into one palm. Authored outline avoids
      // the star-shaped scallops produced by a radial sine displacement.
      const outline=new THREE.Shape()
      outline.moveTo(-.065,.10)
      outline.bezierCurveTo(-.025,.17,.035,.20,.09,.19)
      outline.bezierCurveTo(.15,.18,.17,.12,.105,.095)
      outline.bezierCurveTo(.19,.125,.235,.08,.20,.035)
      outline.bezierCurveTo(.185,.014,.15,.007,.125,.008)
      outline.bezierCurveTo(.205,-.015,.19,-.09,.115,-.108)
      outline.bezierCurveTo(.03,-.16,-.095,-.11,-.10,-.015)
      outline.bezierCurveTo(-.105,.03,-.085,.075,-.065,.10)
      // Inflate both faces around the silhouette. A bevelled extrusion still
      // left a flat cookie-like palm and straight walls in a side view.
      const contour=outline.getSpacedPoints(96),positions:number[]=[],indices:number[]=[]
      for(let row=0;row<=32;row++){
        const angle=row/32*Math.PI,r=Math.sin(angle)
        for(let col=0;col<=96;col++){
          const p=contour[col]
          positions.push(.025+(p.x-.025)*r,.02+(p.y-.02)*r,.085*Math.cos(angle))
          if(row<32&&col<96){
            const a=row*97+col,b=a+97
            indices.push(a,a+1,b,b,a+1,b+1)
          }
        }
      }
      const featherGeometry=new THREE.BufferGeometry()
      featherGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3))
      featherGeometry.setIndex(indices);smoothSculptNormals(featherGeometry)
      const wing=mesh(`${label}-wing-feather`,featherGeometry,cream,wrist,[0,-.055,.025])
      if(side<0)wing.rotation.y=Math.PI
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
      const upper=tallBoot?THREE.MathUtils.smoothstep(y,-.20,1):0
      // Broad, rounded instep/heel. The previous narrow neck + raised upper
      // hemisphere formed a cone and a pinched horizontal highlight band.
      return [x*.129*sw*(1+.065*z)*(1-.10*upper),
        -.018+y*.125*sh+(tallBoot?.018:0)*upper+.010*y*y,
        z*.167*sd*(1-.18*upper)+.046*(1-upper)]
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
  headGeometry.userData.sculptVersion='continuous-volume-v3'
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
  const muzzles:{width:number;height:number;depth:number;y:number;z:number}[]=[]
  const muzzle = (width: number, height: number, depth: number, y = -.115, shade = cream) => {
    muzzles.push({width,height,depth,y,z:hz*.87})
    return ellipsoid('muzzle-volume', head, shade, [0,y,hz*.87], [width,height,depth])
  }
  const nose = (position: XYZ, size: XYZ = [.048,.03,.034]) => {
    const [x,y]=position
    let surface=headFront(sculpt,design.head,x,y)
    for(const m of muzzles){
      const radius=1-(x/m.width)**2-((y-m.y)/m.height)**2
      if(radius>=0)surface=Math.max(surface,m.z+m.depth*Math.sqrt(radius))
    }
    // Seat against the actual cheek/muzzle, not a fixed front Z that leaves
    // the dog's, mouse's and raccoon's nose floating when viewed sideways.
    const result=ellipsoid('nose', head, black, [x,y,surface+size[2]*.5], size)
    result.userData.attachmentSurface=surface
    return result
  }
  const earPivots: THREE.Group[] = []
  const roundEar = (side: number, x: number, y: number, width: number, height: number, inside: THREE.Material, outer = fur) => {
    const ear = pivot(`ear-${side}`, head, [side*x,y,-.04]); ear.rotation.y = side*.2
    const innerColor=(inside as THREE.MeshPhysicalMaterial).color, outerColor=outer.color
    const shade=surfaceMaterial(`round-ear-${innerColor.getHexString()}-${outerColor.getHexString()}`,(x,y,z)=>{
      const scallop=design.kind==='koala'?.075*Math.cos(Math.atan2(y,x)*5):0
      return outerColor.clone().lerp(innerColor,THREE.MathUtils.smoothstep(Math.min(.73+scallop-Math.hypot(x,y+.015),z-.17),-.018,.018))
    })
    // A substantial rear shell and a shallow front bowl, with a continuous
    // rolled rim. Koala's cream tuft stays fuller than the recessed pink ears.
    const cup=design.kind==='koala'?.038:.085
    sculptedVolume('ear-shell',ear,shade,[0,0,0],(x,y,z)=>{
      const tufts=design.kind==='koala'?1+.025*Math.cos(Math.atan2(y,x)*5)*(x*x+y*y)**2:1
      return [x*width*tufts,y*height*tufts,z*.130-(z>0?cup*z**4:0)]
    })
    earPivots.push(ear); return ear
  }
  const pointedEar = (side: number, tall: number, outerColor = furColor) => {
    const ear = pivot(`ear-${side}`, head, [side*(design.kind==='cat'?.255:.211),design.kind==='cat'?.145:.125,-.028]); ear.rotation.z = -side*(design.kind==='cat'?.30:.19)
    // Closed, bowed triangular shells with recessed coloured inner cups.
    const insetColor=design.kind==='cat'?new THREE.Color('#f58ca8'):creamColor
    const shade=surfaceMaterial(`pointed-ear-${outerColor.getHexString()}`,(x,y,z)=>{
      const distance=Math.min(z-.48,1-(x/.61)**2-((y+.03)/.70)**2)
      return outerColor.clone().lerp(insetColor,THREE.MathUtils.smoothstep(distance,-.018,.018))
    })
    sculptedVolume('pointed-ear-shell',ear,shade,[0,0,0],(x,y,z)=>{
      const t=(y+1)/2, section=Math.sqrt(Math.max(0,1-y*y)), sine=Math.max(0,Math.sin(Math.PI*t))
      return [section>1e-6?x/section*.177*(1-t)**.65*sine**.30:0,t*tall,
        (section>1e-6?z/section*.125*sine**.65:0)-.024*t*t-(z>0?.024*z*z*sine:0)]
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
      roundEar(-1,.284,.235,.137,.143,material('#c58249','fur')); roundEar(1,.284,.235,.137,.143,material('#c58249','fur'))
      muzzle(.174,.121,.119,-.113); nose([0,-.068,.383],[.045,.029,.03]); break
    case 'rabbit':
      for (const side of [-1,1]) {
        const ear=pivot(`ear-${side}`,head,[side*.140,.210,-.025]); ear.rotation.z=-side*.27
        const shade=surfaceMaterial('rabbit-ear',(x,y,z)=>furColor.clone().lerp(new THREE.Color('#ef77a5'),
          THREE.MathUtils.smoothstep(Math.min(1-(x/.65)**2-((y-.04)/.76)**2,z-.3),-.025,.025)))
        sculptedVolume('long-ear',ear,shade,[0,.203,0],(x,y,z)=>[x*.145*(1+.16*y),y*.274,z*.128-(z>0?.071*z**4:0)])
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
      roundEar(-1,.370,.141,.226,.226,cream); roundEar(1,.370,.141,.226,.226,cream)
      muzzle(.128,.079,.075,-.130)
      sculptedVolume('nose',head,black,[0,-.006,headFront(sculpt,design.head,0,-.006)+.012],(x,y,z)=>[x*.094*(1-.18*y),y*.124,z*.068]); break
    case 'frog':
      for (const side of [-1,1]) {
        ellipsoid('eye-turret',head,fur,[side*.227,.197,-.002],[.153,.174,.143])
        ellipsoid('eye-sclera',head,cream,[side*.227,.219,.100],[.119,.139,.055])
        eye(side*.227,.242,.147)
      }
      // Cream throat is part of the closed head/colour mask, not an intersecting
      // second flattened ellipsoid with a visible seam around the lower jaw.
      headGeometry.userData.continuousThroat=true
      break
    case 'elephant':
      roundEar(-1,.380,.055,.244,.277,cream); roundEar(1,.380,.055,.244,.277,cream)
      trunk=pivot('trunk-joint',head,[0,-.024,.300])
      sweep('curled-trunk',trunk,fur,[[0,.065,-.075],[0,-.030,.025],[0,-.100,.145],[0,-.076,.252],[0,.018,.335]],
        t=>.102*(1-.43*t)*Math.sqrt(Math.max(0,1-Math.max(0,(t-.88)/.12)**2)),1,undefined,80,32)
      break
    case 'raccoon':
      pointedEar(-1,.29,secondaryColor);pointedEar(1,.29,secondaryColor)
      muzzle(.151,.099,.10,-.134); nose([0,-.086,.369],[.034,.024,.031]); break
    case 'deer':
      for (const side of [-1,1]) {
        const ear=pivot(`ear-${side}`,head,[side*.25,.175,-.025]);ear.rotation.z=-side*.80
        const leafShade=surfaceMaterial('deer-ear',(x,y,z)=>furColor.clone().lerp(creamColor,
          THREE.MathUtils.smoothstep(Math.min(.72-Math.hypot(x,y),z-.24),-.025,.025)))
        sculptedVolume('deer-pointed-ear',ear,leafShade,[0,.095,0],(x,y,z)=>[
          x*.125*(1-.38*y),y*.180,z*.082-.016*Math.max(0,z)**3])
        earPivots.push(ear)
        const antler=pivot(`antler-${side}`,head,[side*.145,.255,-.048])
        const branches=mesh('antler-connected-branches',residentAntlerGeometry(),secondary,antler)
        if(side<0)branches.rotation.y=Math.PI
      }
      muzzle(.112,.091,.075); nose([0,-.07,.318],[.041,.031,.029]); break
    case 'dog':
      for (const side of [-1,1]) {
        const ear=pivot(`ear-${side}`,head,[side*.285,.192,-.025]); ear.rotation.z=side*.22
        sculptedVolume('floppy-ear',ear,secondary,[side*.035,-.180,.006],(x,y,z)=>[
          x*.144*(1-.24*y)+side*.020*(1-y*y),y*.292,z*.112+.038*(1-y*y)])
        earPivots.push(ear)
      }
      headGeometry.userData.continuousMuzzle=true
      nose([0,-.077,.355],[.048,.031,.029]); break
    case 'duck':
      sculptedVolume('upper-bill',head,secondary,[0,-.098,.350],(x,y,z)=>[
        x*.218*(1+.30*z),y*.082*(1-.18*z)+.053*x*x-.023*z+.014*z*z,z*.220])
      sculptedVolume('lower-bill',head,secondary,[0,-.139,.350],(x,y,z)=>[
        x*.212*(1+.24*z),y*.029+.043*x*x-.017*z,z*.211])
      for(let i=0;i<3;i++) {
        const crest=ellipsoid('duck-crest',head,fur,[.016+i*.024,.285+i*.013,-.039-i*.035],[.055,.076,.075]);crest.rotation.x=.55
      }
      break
    case 'sheep': {
      // One closed cloud-like fleece volume, not rows of intersecting balls.
      // Broad lobes join smoothly on the back and around the ears; the cream
      // forehead curls remain individually authored like the original roster.
      const lobes:THREE.Vector3[]=[]
      for(const [latitude,count] of [[-.38,8],[.18,9],[.68,7],[1.1,4]])for(let j=0;j<count;j++){
        const angle=(j+.5*latitude)/count*Math.PI*2
        lobes.push(new THREE.Vector3(Math.sin(angle)*Math.cos(latitude),Math.sin(latitude),Math.cos(angle)*Math.cos(latitude)))
      }
      sculptedVolume('continuous-wool-cap',head,cream,[0,.035,-.025],(x,y,z)=>{
        let relief=0
        for(const lobe of lobes)relief+=Math.exp((x*lobe.x+y*lobe.y+z*lobe.z-1)*38)
        const scale=1+.25*relief,face=THREE.MathUtils.smoothstep(z,.18,.65)*(1-THREE.MathUtils.smoothstep(y,.18,.66))
        return [x*.327*scale,y*.321*scale,z*.290*scale-.105*face]
      })
      for (const side of [-1,1]) {
        const ear=pivot(`ear-${side}`,head,[side*.302,.085,.015]);ear.rotation.z=side*.58
        sculptedVolume('sheep-drooping-ear',ear,pink,[side*.035,-.116,.025],(x,y,z)=>[
          x*.104*(1-.27*y)+side*.019*(1-y*y),y*.188,z*.071+.035*(1-y*y)])
        earPivots.push(ear)
      }
      // The original has large, soft forehead curls, not a tiny bead necklace.
      for(let j=0;j<5;j++)ellipsoid('forehead-wool-curl',head,cream,[(j-2)*.094,.23+(.05-Math.abs(j-2)*.025),.184],[.116,.115,.095])
      for(let j=0;j<3;j++)ellipsoid('crown-wool-curl',head,cream,[(j-1)*.118,.330+(j===1?.027:0),.052],[.132,.122,.125])
      break
    }
    case 'mouse':
      roundEar(-1,.292,.212,.232,.252,pink); roundEar(1,.292,.212,.232,.252,pink)
      muzzle(.120,.077,.087,-.117,fur); nose([0,-.092,.326],[.017,.013,.017]); break
    case 'otter':
      roundEar(-1,.299,.185,.07,.082,secondary); roundEar(1,.299,.185,.07,.082,secondary)
      headGeometry.userData.continuousCheeks=true
      nose([0,-.035,headFront(sculpt,design.head,0,-.035)+.016],[.038,.024,.026]); break
    case 'capybara':
      roundEar(-1,.215,.215,.054,.065,secondary); roundEar(1,.215,.215,.054,.065,secondary)
      // An elongated continuous head with a broad brown muzzle cap, rather
      // than a round bear-like head with an extra brown nose ball.
      for (const side of [-1,1]) {
        const nostril=ellipsoid('nostril',head,seam,[side*.077,.024,headFront(sculpt,design.head,side*.077,.024)+.003],[.010,.019,.008])
        nostril.rotation.z=-side*.35
      }
      // Fur-coloured abdomen remains visible below the cropped green top.
      ellipsoid('capybara-round-belly',pelvis,fur,[0,-.005,.014],[.250,.175,.151])
      break
  }
  if (design.kind === 'otter' || design.kind === 'mouse') for (const side of [-1,1]) for(let j=0;j<3;j++) {
    // Densely follow the curved cheek. A three-point chord cut through the
    // head between its anchors and broke the whisker into dotted fragments.
    const points:XYZ[]=Array.from({length:17},(_,i)=>{
      const t=i/16,x=side*THREE.MathUtils.lerp(.15,design.head[0]*(design.kind==='mouse'?.76:.80),t)
      const y=THREE.MathUtils.lerp(-.096-j*.024,-.056-j*.038,t)-.006*Math.sin(Math.PI*t),d=.0005
      const dx=(headFront(sculpt,design.head,x+d,y)-headFront(sculpt,design.head,x-d,y))/(2*d)
      const dy=(headFront(sculpt,design.head,x,y+d)-headFront(sculpt,design.head,x,y-d))/(2*d)
      const normal=new THREE.Vector3(-dx,-dy,1).normalize()
      return new THREE.Vector3(x,y,headFront(sculpt,design.head,x,y)).addScaledVector(normal,.0025).toArray() as XYZ
    })
    line('whisker',head,seam,points,.004)
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
      sweep('mouse-tail',tail,pink,[[0,0,0],[.05,0,-.17],[.15,.04,-.33],[.13,.14,-.33],[-.01,.20,-.22],[-.08,.29,-.23],[-.07,.35,-.36],[.03,.32,-.43]],
        t=>.027*(1-t*.40),1,undefined,64,18); break
    case 'otter':
      sweep('otter-tail',tail,fur,[[0,0,0],[0,.005,-.20],[0,.067,-.37],[0,.169,-.51]],
        t=>.146*(1-.48*t), .88,undefined,48,28); break
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
      case 'deer': {
        const brow=.74-.92*Math.exp(-((x/.21)**2))-.38*ax*ax
        return blend(fur,cream,brow-y+Math.min(0,z-.48)*2.3)
      }
      case 'dog': {
        const face=1-(x/1.08)**2-((y+.13)/1.18)**2+Math.min(0,z-.50)*2
        const base=blend(fur,cream,face)
        const patch=1-((x-.78)/.48)**2-((y-.42)/.80)**2
        return blend(base,fur,patch)
      }
      case 'mouse': return fur
      case 'capybara': return blend(fur,secondary,z-.79)
      case 'otter': return blend(fur,cream,-.20+ax*.18-y+Math.min(0,z-.48)*1.8)
      case 'sheep': return z>.25 ? new THREE.Color('#efcda4') : cream
      default: return fur
    }
  }
}
