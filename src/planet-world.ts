import * as THREE from 'three'
import { createOrangeCar } from './planet-orange-car'
import type { ResidentModel } from './planet-resident'

type Landmark = { id: string; lat: number; lon: number; color: string }
const R = 3
const up = new THREE.Vector3(0, 1, 0)
const clamp = THREE.MathUtils.clamp
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t) }
const direction = (lat: number, lon: number) => new THREE.Vector3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon))
// Continuous 3D fields have no longitude seam and no repeated map tiles.
const field = (p: THREE.Vector3) => {
  const { x, y, z } = p
  const river = Math.abs(x + .25 * Math.sin(y * 5 + z * 3) + .14 * Math.sin(z * 8 - y * 2) - .12)
  const lake = Math.hypot(x + .29, y - .2, z - .91)
  const lake2 = Math.hypot(x - .64, y + .48, z + .55)
  const bank = Math.min(river - (.036 + .014 * Math.sin(y * 12)), lake - .18, lake2 - .17)
  const hill = .05 + .055 * Math.sin(x * 7 + z * 4) * Math.cos(y * 6 - z * 3) + .023 * Math.sin(x * 21 + y * 16 + z * 13)
  const height = -.105 + smooth(-.02, .022, bank) * .20 + hill * smooth(.01, .11, bank)
  return { bank, height, biome: Math.sin(x * 4 - z * 3) + Math.cos(y * 5 + z * 2) }
}

export const createPlanetWorld = (canvas: HTMLCanvasElement, landmarks: Landmark[], select: (id: string) => void) => {
  let seed = 93472
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 80)
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  const world = new THREE.Group()
  scene.add(world)
  world.rotation.set(.12, -.3, -.10)
  const ambient = new THREE.HemisphereLight('#d9f8ff', '#607452', 1.4)
  const sun = new THREE.DirectionalLight('#fff2d8', 2.7)
  sun.position.set(-5, 8, 7)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  Object.assign(sun.shadow.camera, { left: -4.1, right: 4.1, top: 4.1, bottom: -4.1, near: 1, far: 22 })
  sun.shadow.normalBias = .022
  sun.shadow.bias = -.00015
  sun.shadow.radius = 3
  const fill = new THREE.DirectionalLight('#b6eaff', 1.1)
  fill.position.set(5, 1, -4)
  scene.add(ambient, sun, fill)

  // Broad sky highlights give the rounded pieces a glossy console-game finish.
  const reflectionCanvas = document.createElement('canvas')
  reflectionCanvas.width = 512; reflectionCanvas.height = 256
  const reflection = reflectionCanvas.getContext('2d')!
  const skyGradient = reflection.createLinearGradient(0, 0, 0, 256)
  skyGradient.addColorStop(0, '#318ad5'); skyGradient.addColorStop(.35, '#c8f2ff')
  skyGradient.addColorStop(.5, '#ffffff'); skyGradient.addColorStop(.64, '#8ebbb2'); skyGradient.addColorStop(1, '#537355')
  reflection.fillStyle = skyGradient; reflection.fillRect(0, 0, 512, 256)
  const reflectionTexture = new THREE.CanvasTexture(reflectionCanvas)
  reflectionTexture.colorSpace = THREE.SRGBColorSpace
  reflectionTexture.mapping = THREE.EquirectangularReflectionMapping
  const pmrem = new THREE.PMREMGenerator(renderer)
  const environment = pmrem.fromEquirectangular(reflectionTexture)
  scene.environment = environment.texture
  scene.environmentIntensity = .55
  reflectionTexture.dispose(); pmrem.dispose()

  // Fine, neutral orange-peel detail; body paint supplies the saturated color.
  const groundCanvas = document.createElement('canvas')
  groundCanvas.width = 1536; groundCanvas.height = 768
  const ctx = groundCanvas.getContext('2d')!
  ctx.fillStyle = '#fff6dc'; ctx.fillRect(0, 0, 1536, 768)
  for (let i = 0; i < 115000; i++) {
    const x = random() * 1536, y = random() * 768
    ctx.fillStyle = ['#eedbb8', '#fff7e3', '#f4e6c8', '#ffffff'][i % 4]
    ctx.globalAlpha = .10 + random() * .16
    ctx.beginPath(); ctx.ellipse(x, y, .5 + random() * 2, .4 + random() * 1.3, random() * 3, 0, Math.PI * 2); ctx.fill()
  }
  const peelTexture = new THREE.CanvasTexture(groundCanvas)
  peelTexture.colorSpace = THREE.SRGBColorSpace
  peelTexture.wrapS = THREE.RepeatWrapping
  const terrainGeometry = new THREE.SphereGeometry(R, 256, 192)
  const positions = terrainGeometry.attributes.position
  const terrainColors = new Float32Array(positions.count * 3)
  const meadow = new THREE.Color('#75c53a'), meadowDark = new THREE.Color('#62b630')
  const hilltop = new THREE.Color('#a2d753'), sand = new THREE.Color('#ffd18a'), earth = new THREE.Color('#c77b3c')
  for (let i = 0; i < positions.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(positions, i).normalize()
    const sample = field(p)
    positions.setXYZ(i, p.x * (R + sample.height), p.y * (R + sample.height), p.z * (R + sample.height))
    // Low-contrast checker turf echoes the reference's playful game courses.
    const lon = Math.atan2(p.x, p.z), lat = Math.asin(p.y)
    const checker = (Math.floor((lon + Math.PI) / (Math.PI / 18)) + Math.floor((lat + Math.PI / 2) / (Math.PI / 18))) & 1
    const color = (checker ? meadow : meadowDark).clone().lerp(hilltop, smooth(.11, .19, sample.height) * .32)
    if (sample.bank < .026) color.copy(earth).lerp(sand, smooth(-.01, .026, sample.bank))
    else color.lerp(sand, 1 - smooth(.026, .048, sample.bank))
    color.toArray(terrainColors, i * 3)
  }
  terrainGeometry.setAttribute('color', new THREE.BufferAttribute(terrainColors, 3))
  terrainGeometry.computeVertexNormals()
  const terrain = new THREE.Mesh(terrainGeometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .82, metalness: 0 }))
  terrain.receiveShadow = true
  terrain.castShadow = true
  world.add(terrain)
  const waterMaterial = new THREE.MeshPhysicalMaterial({ color: '#16b6e7', roughness: .19, metalness: .10, clearcoat: 1, clearcoatRoughness: .14 })
  const water = new THREE.Mesh(new THREE.SphereGeometry(R - .022, 144, 96), waterMaterial)
  world.add(water)
  const rippleMaterial = new THREE.MeshBasicMaterial({ color: '#d4ffff', transparent: true, opacity: .6, depthWrite: false })
  const ripples = new THREE.Group()
  for (let i = 0; i < 1200; i++) {
    const y = 1 - (i + .5) / 600, a = i * 2.39996323
    const p = new THREE.Vector3(Math.sqrt(1-y*y)*Math.cos(a), y, Math.sqrt(1-y*y)*Math.sin(a))
    if (field(p).bank > -.045 || i % 3) continue
    const ripple = new THREE.Mesh(new THREE.TorusGeometry(.025+random()*.026,.0014,3,16,Math.PI*1.3),rippleMaterial)
    ripple.position.copy(p.clone().multiplyScalar(R-.019))
    ripple.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),p)
    ripple.rotateZ(random()*Math.PI*2)
    ripples.add(ripple)
  }
  world.add(ripples)

  const sphere = new THREE.SphereGeometry(1, 18, 12)
  const cylinder = new THREE.CylinderGeometry(.72, 1, 1, 9)
  const box = new THREE.BoxGeometry(1, 1, 1)
  const rock = new THREE.IcosahedronGeometry(1, 1)
  // A folded, pointed leaf with a central vein in its silhouette.
  const leaf = new THREE.BufferGeometry()
  leaf.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -.5, .22, .12, -.39, .64, .15, 0, 1, 0, .39, .64, .15, .5, .22, .12, 0, .4, .28], 3))
  leaf.setAttribute('uv', new THREE.Float32BufferAttribute([.5,0,0,.22,.11,.64,.5,1,.89,.64,1,.22,.5,.4], 2))
  leaf.setIndex([0,1,6,1,2,6,2,3,6,3,4,6,4,5,6,5,0,6]); leaf.computeVertexNormals()
  const leafMat = new THREE.MeshStandardMaterial({ roughness: .55, side: THREE.DoubleSide })
  const toyMaterial = new THREE.MeshStandardMaterial({ roughness: .38, metalness: 0 })
  const woodMaterial = new THREE.MeshStandardMaterial({ roughness: .70 })
  const pineGeometry = new THREE.LatheGeometry([
    new THREE.Vector2(0, -.45), new THREE.Vector2(.72, -.45), new THREE.Vector2(.95, -.37),
    new THREE.Vector2(1, -.25), new THREE.Vector2(.84, -.09), new THREE.Vector2(.63, .14),
    new THREE.Vector2(.39, .40), new THREE.Vector2(.12, .69), new THREE.Vector2(0, .76),
  ], 20)
  type Batch = { geometry: THREE.BufferGeometry; mat: THREE.Material; matrices: THREE.Matrix4[]; colors: THREE.Color[] }
  const batches = new Map<string, Batch>()
  const dummy = new THREE.Object3D()
  dummy.rotation.order = 'YXZ'
  const add = (kind: string, base: THREE.Matrix4, position: number[], scale: number[], tint: string | THREE.Color, rotation: number[] = [0,0,0]) => {
    let batch = batches.get(kind)
    if (!batch) {
      batch = { geometry: kind === 'leaf' ? leaf : kind === 'trunk' ? cylinder : kind === 'box' ? box : kind === 'rock' ? rock : kind === 'pine' ? pineGeometry : sphere, mat: kind === 'leaf' ? leafMat : kind === 'trunk' || kind === 'box' ? woodMaterial : toyMaterial, matrices: [], colors: [] }
      batches.set(kind, batch)
    }
    dummy.position.set(position[0], position[1], position[2]); dummy.scale.set(scale[0], scale[1], scale[2]); dummy.rotation.set(rotation[0], rotation[1], rotation[2]); dummy.updateMatrix()
    batch.matrices.push(new THREE.Matrix4().multiplyMatrices(base, dummy.matrix)); batch.colors.push(new THREE.Color(tint))
  }
  const baseAt = (p: THREE.Vector3, extra = 0, spin = random() * Math.PI * 2) => {
    const q = new THREE.Quaternion().setFromUnitVectors(up, p)
    q.multiply(new THREE.Quaternion().setFromAxisAngle(up, spin))
    return new THREE.Matrix4().compose(p.clone().multiplyScalar(R + field(p).height + extra), q, new THREE.Vector3(1,1,1))
  }
  // Rounded, readable toy silhouettes instead of the blueprint's fine leafwork.
  const makeTree = (p: THREE.Vector3, pine: boolean, size: number) => {
    const base = baseAt(p)
    add('trunk',base,[0,size*.36,0],[size*.10,size*.72,size*.10],'#ab602b')
    for(let j=0;j<3;j++){const a=j*Math.PI*2/3;add('sphere',base,[Math.sin(a)*size*.065,.025,Math.cos(a)*size*.065],[size*.13,size*.07,size*.08],'#b37436',[0,-a,0])}
    if(pine){
      for(let tier=0;tier<3;tier++){
        const radius=size*(.37-tier*.085),y=size*(.42+tier*.24)
        add('pine',base,[0,y,0],[radius,size*.38,radius],['#239e61','#31b971','#55c982'][tier])
      }
    }else{
      const greens = ['#47b932', '#70ce3b', '#8ad84a']
      add('sphere',base,[0,size*.83,0],[size*.32,size*.34,size*.31],greens[1])
      for(let k=0;k<5;k++){const a=k*Math.PI*2/5;add('sphere',base,[Math.sin(a)*size*.21,size*(.69+(k%2)*.09),Math.cos(a)*size*.21],[size*.23,size*.24,size*.23],greens[k%3])}
      if(p.z<.45)for(let k=0;k<3;k++){const a=k*Math.PI*2/3;add('sphere',base,[Math.sin(a)*size*.35,size*.69,Math.cos(a)*size*.35],[size*.066,size*.073,size*.066],'#ff8e21')}
    }
  }
  const flower = (base: THREE.Matrix4, x: number, z: number, tint: string, s = 1) => {
    const h = (.065 + random() * .035) * s
    add('trunk', base, [x,h*.5,z],[.007*s,h,.007*s],'#498545')
    add('leaf', base, [x,h*.3,z],[.05*s,.05*s,.045*s],'#61a64d',[.8,random()*6,0])
    for (let petal = 0; petal < 5; petal++) { const a = petal*Math.PI*.4; add('sphere',base,[x+Math.cos(a)*.021*s,h,z+Math.sin(a)*.021*s],[.025*s,.012*s,.024*s],tint) }
    add('sphere',base,[x,h+.009*s,z],[.012*s,.013*s,.012*s],'#f7c84f')
  }

  // A single Fibonacci distribution covers both hemispheres, then local fields
  // form different low flower meadows and rocky regions without tiling.
  for (let i = 0; i < 1800; i++) {
    const y = 1 - (i + .5) * 2 / 1800, angle = i * 2.39996323 + (random()-.5)*.025
    const p = new THREE.Vector3(Math.sqrt(1-y*y)*Math.cos(angle),y,Math.sqrt(1-y*y)*Math.sin(angle))
    const sample = field(p)
    if (sample.bank < .04 || landmarks.some(s => p.distanceTo(direction(s.lat,s.lon)) < .17)) continue
    const base = baseAt(p)
    const chance = random()
    const forest = .12 + .045*Math.sin(p.x*9+p.y*6)*Math.sin(p.z*8-p.y*4)
    if (chance < forest && sample.bank > .09) {
      makeTree(p,sample.biome<-.3,.30+random()*.28)
    } else if (chance < .33) {
      const tint = sample.biome > .5 ? '#fff5cd' : sample.biome < -.7 ? '#bca0f6' : '#ff79a6'
      for (let j = 0; j < 3 + Math.floor(random()*4); j++) flower(base,(random()-.5)*.14,(random()-.5)*.14,tint,.65+random()*.45)
    } else if (chance < .38) {
      for (let j = 0; j < 2; j++) add('rock',base,[(random()-.5)*.1,.025,0],[.035+random()*.065,.045+random()*.07,.04+random()*.04],['#a1abc4','#c3bdcb','#919fbd'][i%3],[0,random()*6,0])
    } else if (chance < .41) {
      add('trunk',base,[0,.03,0],[.016,.06,.016],'#f0dfb7')
      add('sphere',base,[0,.068,0],[.052,.025,.05],'#f35b4e')
      add('sphere',base,[.014,.09,.008],[.009,.003,.008],'#f7e8c8')
    } else {
      for (let j = 0; j < 3; j++) add('leaf',base,[(j-1)*.018,.002,0],[.018,.034+random()*.04,.024], i%2 ? '#48a63c':'#8bd545',[(random()-.5)*.6,j*2,0])
    }
  }

  // Re-skin the same five destinations as citrus-car cottages: peel bodywork,
  // amber wraparound windows, charcoal trim, wheels and a leafy roof crown.
  const targets: THREE.Object3D[] = []
  const homePositions = new Map<string, THREE.Vector3>()
  for (const spot of landmarks) {
    let p = direction(spot.lat,spot.lon)
    for(let step=0;field(p).bank<.11 && step<40;step++) p=direction(spot.lat,spot.lon+(step+1)*.018)
    homePositions.set(spot.id,p.clone())
    const base = baseAt(p, .025, 0)
    const car = createOrangeCar(spot.color, peelTexture, landmarks.indexOf(spot) + 1)
    const scale = spot.id === 'market' ? .78 : spot.id === 'signal' ? .75 : .70
    car.scale.setScalar(scale); car.updateMatrix(); car.applyMatrix4(base); world.add(car)
    add('sphere',base,[0,0,0],[.40,.018,.40],'#ffe5a5')
    for (let j=0;j<5;j++) add('rock',base,[0,.006,.40+j*.075],[.05,.012,.028],j%2?'#ffeec4':'#f4c780',[0,j*.4,0])
    const target = new THREE.Mesh(new THREE.SphereGeometry(.44,12,8),new THREE.MeshBasicMaterial({visible:false}))
    target.position.copy(p.multiplyScalar(R+field(p.clone().normalize()).height+.35)); target.userData.id=spot.id
    world.add(target); targets.push(target)
  }
  // Two distinct timber crossings, aligned with the local river gradient.
  for (const lat of [.61,-.70]) {
    let lon = 0, best = Infinity
    for (let i=0;i<600;i++) { const test=-.8+i/600*1.5; const d=Math.abs(field(direction(lat,test)).bank+.04); if(d<best){best=d;lon=test} }
    const p = direction(lat,lon), base=baseAt(p, .17, Math.PI/2)
    for (let j=0;j<13;j++) add('box',base,[0,.02,(j-6)*.048],[.22,.032,.044],j%2?'#e59933':'#f4b150')
    for (const side of [-1,1]) {
      add('box',base,[side*.105,.13,0],[.019,.025,.69],'#fff1cf')
      for(const z of [-.29,0,.29]) add('trunk',base,[side*.105,.08,z],[.017,.20,.017],'#fff1cf')
    }
  }
  for (const batch of batches.values()) {
    const mesh=new THREE.InstancedMesh(batch.geometry,batch.mat,batch.matrices.length)
    batch.matrices.forEach((matrix,i)=>{mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,batch.colors[i])})
    mesh.instanceMatrix.needsUpdate=true; if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true
    mesh.castShadow=true;mesh.receiveShadow=true
    world.add(mesh)
  }

  type Resident = { model: ResidentModel; normal: THREE.Vector3; tangent: THREE.Vector3; turnAt: number; pauseUntil: number; speed: number }
  const residents: Resident[] = []
  let arrival: { model: ResidentModel; normal: THREE.Vector3; started: number; onLand: () => void; onFlight: () => void; flying: boolean } | null = null
  const tangentAt = (normal: THREE.Vector3) => new THREE.Vector3(random()-.5,random()-.5,random()-.5).projectOnPlane(normal).normalize()
  const findLanding = () => {
    const front = new THREE.Vector3(0,0,1).applyQuaternion(world.quaternion.clone().invert())
    for(let i=0;i<250;i++){
      const p=front.clone().add(new THREE.Vector3((random()-.5)*.8,(random()-.5)*.65,(random()-.5)*.5)).normalize()
      if(field(p).bank>.12 && residents.every(r=>r.normal.distanceTo(p)>.10))return p
    }
    return homePositions.get('home')!.clone()
  }
  const orientResident = (resident: Resident, now: number) => {
    const { model, normal, tangent } = resident
    model.group.position.copy(normal).multiplyScalar(R+field(normal).height+.016+Math.abs(Math.sin(now*.005))*.009)
    const right=new THREE.Vector3().crossVectors(normal,tangent).normalize()
    model.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,normal,tangent))
    model.group.scale.setScalar(.24)
  }
  const presentResident = (model: ResidentModel, onFlight: () => void, onLand: () => void) => {
    if(arrival){scene.remove(arrival.model.group);arrival.model.dispose()}
    // Preserve the resident's photographed colors and UVs in the toy-world light.
    model.group.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      materials.forEach(material => { if (material instanceof THREE.MeshStandardMaterial) material.roughness = .55 })
    })
    arrival={model,normal:findLanding(),started:performance.now(),onLand,onFlight,flying:false}
    scene.add(model.group);world.visible=false
  }
  const cancelArrival = () => {
    if(arrival){scene.remove(arrival.model.group);arrival.model.dispose();arrival=null}
    world.visible=true
  }

  let active=false, frame=0, zoom=1, targetZoom=1, fitDistance=14
  let pointer: {id:number;x:number;y:number;distance:number}|null=null
  const rotation=new THREE.Quaternion()
  const resize=()=>{
    const width=canvas.clientWidth||window.innerWidth,height=canvas.clientHeight||window.innerHeight
    renderer.setSize(width,height,false);camera.aspect=width/height
    // Bounding sphere includes the tallest trees; initial view always has margin.
    const limitingFov=Math.min(THREE.MathUtils.degToRad(34/2),Math.atan(Math.tan(THREE.MathUtils.degToRad(34/2))*camera.aspect))
    fitDistance=3.85/Math.sin(limitingFov)/.80
    camera.updateProjectionMatrix()
  }
  let lastTime=0
  const render=(now:number)=>{
    if(!active)return
    const dt=Math.min((now-lastTime)/1000||0,.05);lastTime=now
    zoom+=(targetZoom-zoom)*.14
    camera.position.set(0,0,fitDistance/zoom);camera.lookAt(0,0,0)
    for(const resident of residents){
      if(now>resident.turnAt){resident.tangent.applyAxisAngle(resident.normal,(random()-.5)*1.5);resident.turnAt=now+2000+random()*5500;if(random()<.2)resident.pauseUntil=now+600+random()*1200}
      const walking=now>resident.pauseUntil
      if(walking){
        const next=resident.normal.clone().addScaledVector(resident.tangent,dt*resident.speed).normalize()
        if(field(next).bank<.08 || residents.some(other=>other!==resident&&other.normal.distanceTo(next)<.045))resident.tangent.applyAxisAngle(resident.normal,1.3+random())
        else {resident.normal.copy(next);resident.tangent.projectOnPlane(next).normalize()}
      }
      orientResident(resident,now);resident.model.animate(now,walking)
    }
    if(arrival){
      const age=now-arrival.started, model=arrival.model
      model.animate(now,false)
      const start=new THREE.Vector3(0,-.72,camera.position.z-4)
      if(age<4200){model.group.position.copy(start);model.group.scale.setScalar(1.08);model.group.rotation.set(0,Math.sin(age*.00085)*.42,0)}
      else{
        if(!arrival.flying){arrival.flying=true;world.visible=true;arrival.onFlight()}
        const t=clamp((age-4200)/2200,0,1), ease=t*t*(3-2*t)
        const end=arrival.normal.clone().multiplyScalar(R+field(arrival.normal).height+.02).applyQuaternion(world.quaternion)
        model.group.position.lerpVectors(start,end,ease);model.group.position.y+=Math.sin(t*Math.PI)*.45
        model.group.scale.setScalar(THREE.MathUtils.lerp(1.08,.24,ease))
        const finalRotation=world.quaternion.clone().multiply(new THREE.Quaternion().setFromUnitVectors(up,arrival.normal))
        model.group.quaternion.slerp(finalRotation,.06)
        if(t>=1){const resident:Resident={model,normal:arrival.normal,tangent:tangentAt(arrival.normal),turnAt:now+2500,pauseUntil:now+500,speed:.024+random()*.018};world.add(model.group);residents.push(resident);orientResident(resident,now);const landed=arrival.onLand;arrival=null;landed()}
      }
    }
    rippleMaterial.opacity=.49+Math.sin(now*.001)*.06
    renderer.render(scene,camera);frame=requestAnimationFrame(render)
  }
  canvas.addEventListener('pointerdown',event=>{if(event.button!==0||pointer||arrival)return;pointer={id:event.pointerId,x:event.clientX,y:event.clientY,distance:0};canvas.setPointerCapture(event.pointerId)})
  canvas.addEventListener('pointermove',event=>{
    if(!pointer||pointer.id!==event.pointerId)return
    const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y;pointer.distance+=Math.hypot(dx,dy)
    const length=Math.hypot(dx,dy)
    if(length){rotation.setFromAxisAngle(new THREE.Vector3(dy,dx,0).normalize(),length*.006);world.quaternion.premultiply(rotation)}
    pointer.x=event.clientX;pointer.y=event.clientY
  })
  canvas.addEventListener('pointerup',event=>{
    if(!pointer||pointer.id!==event.pointerId)return
    const clicked=pointer.distance<5;pointer=null
    if(clicked){const bounds=canvas.getBoundingClientRect();const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-bounds.left)/bounds.width*2-1,-(event.clientY-bounds.top)/bounds.height*2+1),camera);const hit=ray.intersectObjects([terrain,...targets],false)[0];if(hit?.object.userData.id)select(hit.object.userData.id)}
  })
  const cancel=(event:PointerEvent)=>{if(pointer?.id===event.pointerId)pointer=null}
  canvas.addEventListener('pointercancel',cancel);canvas.addEventListener('lostpointercapture',cancel)
  canvas.addEventListener('wheel',event=>{event.preventDefault();if(!arrival)targetZoom=clamp(targetZoom*Math.exp(-event.deltaY*.001),.7,2.7)},{passive:false})
  window.addEventListener('resize',()=>{if(active)resize()},{passive:true})
  const syncVisibility=()=>{
    if(document.hidden){cancelAnimationFrame(frame);frame=0}
    else if(active&&!frame){lastTime=performance.now();frame=requestAnimationFrame(render)}
  }
  document.addEventListener('visibilitychange',syncVisibility)
  return {
    open:()=>{active=true;lastTime=performance.now();resize();cancelAnimationFrame(frame);frame=document.hidden?0:requestAnimationFrame(render)},
    close:()=>{active=false;pointer=null;cancelAnimationFrame(frame);frame=0;cancelArrival()},
    setNight:(night:boolean)=>{ambient.intensity=night?.65:1.4;sun.intensity=night?1.1:2.7;sun.color.set(night?'#a6c8ff':'#fff2d8');scene.environmentIntensity=night?.25:.55},
    presentResident,
    cancelArrival,
    reset:()=>{targetZoom=1;world.rotation.set(.12,-.3,-.10)},
  }
}
