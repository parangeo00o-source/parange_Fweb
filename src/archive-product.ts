import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createArchiveDogCarrier, archiveCaseMotion, archiveCasePhase, archiveCaseDuration } from './archive-robot-dog'
import { createCassette, createCassetteSurfaceMaps } from './archive-cassette'
import { drawCassetteLabel, cassetteTypographyReady } from './archive-cassette-art'
import { createArchiveMonitor } from './archive-monitor'
import type { DogExpression } from './archive-dog-led'
import { cacheArchiveTransforms } from './archive-transforms'

interface Print {
  id: string
  anchor: HTMLElement
  group: THREE.Group
  width: number
  height: number
  baseY: number
  frontZ: number
  glow: THREE.ShaderMaterial
}

/** Real product geometry. The existing anchors are projected over the print faces
 * for native links, keyboard navigation and screen readers. CSS is the fallback. */
export function createArchiveProduct(host: HTMLElement) {
  const screen = host.closest<HTMLElement>('.archive-screen')!
  let focused = false, fitting = false, stageScrollTop = 0
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
  renderer.setPixelRatio(1)
  renderer.transmissionResolutionScale = .6
  renderer.shadowMap.enabled = true
  renderer.shadowMap.autoUpdate = false
  let shadowDirty = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = .86
  const canvas = renderer.domElement
  canvas.className = 'ar-product-canvas'
  canvas.setAttribute('aria-hidden', 'true')
  host.prepend(canvas)
  const scene = new THREE.Scene()
  // Update the scene once before projections; the main and overscan passes
  // share those exact matrices instead of rebuilding the hierarchy per pass.
  scene.matrixWorldAutoUpdate = false
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 400)
  const controls = new OrbitControls(camera, canvas)
  controls.enablePan = false
  controls.enableZoom = false
  controls.minPolarAngle = .12
  controls.maxPolarAngle = Math.PI-.12
  controls.minAzimuthAngle = -Infinity
  controls.maxAzimuthAngle = Infinity
  controls.target.set(0, .5, 0)
  controls.rotateSpeed = .35
  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  const environment = pmrem.fromScene(room, .04)
  scene.environment = environment.texture
  scene.environmentIntensity = .7
  room.dispose()
  pmrem.dispose()
  scene.add(new THREE.HemisphereLight(0xe5eeff, 0x63707b, .85))
  const key = new THREE.DirectionalLight(0xfff8ed, 3)
  key.position.set(-16, 32, 18)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  Object.assign(key.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: .1, far: 120 })
  key.shadow.bias = -.00035
  key.shadow.normalBias = .025
  key.shadow.radius = 3
  scene.add(key, key.target)
  const fill = new THREE.DirectionalLight(0xb9d7ff, .9)
  fill.position.set(9, 8, -7)
  scene.add(fill)
  const model = new THREE.Group()
  model.scale.setScalar(1)
  const cargo = new THREE.Group(); cargo.name = 'dog-carried-case'; model.add(cargo)
  const travel = new THREE.Group(); travel.name = 'dog-arrival'; travel.visible = false
  travel.add(model); scene.add(travel)
  let summoned = false, arrived = false, assetsReady = false, entranceStart: number | undefined
  let entranceDistance = 0, motionTime = 0, lastDrawTime: number | undefined
  const entranceDirection = new THREE.Vector3()
  canvas.dataset.vehicle = 'robot-dog-carrier'; canvas.dataset.arrival = 'waiting'
  let frame = 0, visible = false, inViewport = true, disposed = false, active = '', generation = 0
  let prints: Print[] = []
  let width = 0, height = 0, renderWidth = 0, renderHeight = 0, canvasOffset = 0, canvasPad = 0
  let stageDockHeight = 0
  let resolutionDirty = true
  const rendererSize = new THREE.Vector2()
  let lidProgress = 0, lidTarget = 0, frontBlend = 0
  let inspection: 'tapes' | 'monitor' = 'tapes'
  type ViewPose = { center: THREE.Vector3; rotation: THREE.Quaternion; distance: number; viewport: { fullWidth: number; fullHeight: number; offsetX: number; offsetY: number; width: number; height: number } }
  let viewAnimation: { from: ViewPose; to: ViewPose; start: number; closing: boolean; inspection?: boolean } | undefined
  let lidAnimation: { from: number; to: number; start: number; duration: number } | undefined
  const cardGrid = host.querySelector<HTMLElement>('.ar-grid')!
  cardGrid.id = 'ar-case-card-grid'
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  let caseExpression: DogExpression = 'loading', smiling = false, smileTimer: number | undefined, eyesTimer: number | undefined
  function stopEyesTimer() { window.clearTimeout(eyesTimer);eyesTimer=undefined }
  function stopSmile() {
    window.clearTimeout(smileTimer); smileTimer=undefined; smiling=false
  }
  function canSmile() { return visible && inViewport && !disposed && !document.hidden && arrived && caseExpression!=='loading' && !lidAnimation && !viewAnimation }
  function scheduleSmile() {
    if(smileTimer!==undefined || !canSmile())return
    // Sleep between occasional expressions; never keep an idle render loop.
    smileTimer=window.setTimeout(()=>{
      smileTimer=undefined
      if(!canSmile())return
      smiling=true;request()
      smileTimer=window.setTimeout(()=>{smileTimer=undefined;smiling=false;request()},1800)
    },10000+Math.random()*16000)
  }
  function caseEyes() { stopSmile();caseExpression=lidTarget?'star':'heart' }
  function closedCaseEyes() {
    if(!visible||disposed||caseExpression!=='heart'||lidTarget||lidProgress>0||lidAnimation||viewAnimation)return
    // Show the farewell smile once the return to the stage has finished, so
    // it remains visible for a moment before resuming the loading pattern.
    stopSmile();caseExpression='loading';smiling=true
    smileTimer=window.setTimeout(()=>{smileTimer=undefined;smiling=false;request()},2200)
  }
  function expressionsVisibilityChanged() {
    stopSmile();stopEyesTimer();lastDrawTime=undefined
    if(document.hidden){cancelAnimationFrame(frame);frame=0}else request()
  }
  function expressionPreferencesChanged() { stopSmile();stopEyesTimer();request() }
  document.addEventListener('visibilitychange',expressionsVisibilityChanged)
  reduced.addEventListener('change',expressionPreferencesChanged)
  const cassetteGeometryCache = new Map<string,THREE.BufferGeometry>()
  const textures = new Map<string, THREE.Texture>()
  const ownedTextures: THREE.Texture[] = []
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const chrome = new THREE.MeshStandardMaterial({ color: '#d9e0e1', metalness: .97, roughness: .16 })
  const divider = new THREE.MeshPhysicalMaterial({ color: '#91a3ba', metalness: .45, roughness: .36, clearcoat: .5 })
  const liner = new THREE.MeshStandardMaterial({ color: '#61768e', roughness: .94 })
  const dark = new THREE.MeshStandardMaterial({ color: '#152a31', roughness: .8 })

  function texture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
    const surface = document.createElement('canvas')
    surface.width = w; surface.height = h
    draw(surface.getContext('2d')!)
    const result = new THREE.CanvasTexture(surface)
    result.colorSpace = THREE.SRGBColorSpace
    result.anisotropy = renderer.capabilities.getMaxAnisotropy()
    ownedTextures.push(result)
    return result
  }
  const cassetteSurfaces = createCassetteSurfaceMaps(texture)
  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = cargo) {
    geometries.add(geometry); materials.add(material)
    const item = new THREE.Mesh(geometry, material)
    item.position.set(x, y, z)
    item.castShadow = item.receiveShadow = true
    parent.add(item)
    return item
  }
  function box(w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material, radius = .06, parent: THREE.Object3D = cargo) {
    return mesh(new RoundedBoxGeometry(w, h, d, 3, radius), material, x, y, z, parent)
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ color: '#4e5b70', opacity: .23 }))
  floor.rotation.x = -Math.PI / 2; floor.position.y = -6.53; floor.receiveShadow = true; scene.add(floor)
  geometries.add(floor.geometry); materials.add(floor.material)

  // Exactly five rows and five columns. The lining and physical divider walls
  // receive both print and casing shadows; no painted perspective is involved.
  for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) {
    const x = (col - 2) * 2.4, z = (row - 2) * 2
    box(2.26, .09, 1.85, x, .805, z, liner, .045)
    // Finger groove at the front of each compartment.
    box(.7, .035, .07, x, .864, z + .62, dark, .017)
  }
  for (let i = 0; i < 6; i++) {
    const x = -6 + i * 2.4, z = -5 + i * 2
    box(.105, .55, 10.12, x, 1.105, 0, divider, .048)
    box(12.12, .55, .105, 0, 1.105, z, divider, .048)
    box(.13, .065, 10.15, x, 1.408, 0, chrome, .03)
    box(12.15, .065, .13, 0, 1.41, z, chrome, .03)
  }
  const lid = createArchiveDogCarrier(model, cargo, texture, (geometry, material) => {
    geometries.add(geometry); materials.add(material)
  })
  const eyeLights:THREE.Mesh[]=[]
  model.traverse(object=>{if(object instanceof THREE.Mesh&&object.name==='dog-eye-led')eyeLights.push(object)})
  const eyeFrustum=new THREE.Frustum(),eyeProjection=new THREE.Matrix4()
  const monitor = createArchiveMonitor(lid.pivot,host,texture,(g,m)=>{geometries.add(g);materials.add(m)},request)
  const pagination = screen.querySelector<HTMLElement>('.ar-pagination')!
  const paginationHome = pagination.parentElement!
  const activateMonitor=()=>{if(lidProgress>.999&&lidTarget){void monitor.start();setInspection('monitor')}}
  const activateTapes=()=>{monitor.stop();setInspection('tapes')}
  monitor.button.addEventListener('click',activateMonitor)
  canvas.dataset.interior = 'cyan-webcam-monitor'
  const raycaster = new THREE.Raycaster()
  const pointer = new THREE.Vector2()
  let pointerDown: { x: number; y: number } | undefined
  function hitsLid(event: PointerEvent) {
    if (!arrived) return false
    const rect = canvas.getBoundingClientRect()
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
    raycaster.setFromCamera(pointer, camera)
    const first = raycaster.intersectObjects(model.children, true).find(hit => hit.object.visible)
    let object: THREE.Object3D | null = first?.object ?? null
    while (object) { if (object === lid.pivot || (!lidTarget && object === cargo)) return true; object = object.parent }
    return false
  }
  canvas.addEventListener('pointerdown', event => { pointerDown = { x: event.clientX, y: event.clientY } })
  canvas.addEventListener('pointerup', event => {
    if (pointerDown && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) < 6 && hitsLid(event)) {if(lidTarget&&lidProgress>.999)activateMonitor();else if(!lidTarget)toggleCase()}
    pointerDown = undefined
  })
  canvas.addEventListener('pointercancel', () => { pointerDown = undefined })
  // The archive's cheese cursor applies to the entire canvas. Raycast only on
  // an actual click, not on every pointer sample over this detailed model.

  const label = document.createElement('div')
  label.hidden = true
  label.className = 'ar-product-label'; label.setAttribute('aria-hidden', 'true')
  host.append(label)
  const gesture = host.querySelector<HTMLElement>('.ar-product-controls')!
  const toggle = gesture.querySelector<HTMLButtonElement>('.ar-case-toggle')!
  function summonRobot() {
    if (!assetsReady || summoned) return
    summoned = true; entranceStart = undefined
    syncCase(); request()
  }
  function activateCase() {
    if (!summoned) summonRobot()
    else toggleCase()
  }
  toggle.addEventListener('click', activateCase)
  function syncCase() {
    host.classList.toggle('ar-awaiting-summon', !summoned)
    const open = arrived && lidTarget === 1 && lidProgress > .999
    cardGrid.inert = !open || inspection==='monitor' || !!viewAnimation
    host.classList.toggle('ar-monitor-focused',inspection==='monitor')
    host.classList.toggle('ar-inspection-moving',!!viewAnimation)
    monitor.setAvailable(open && visible)
    host.classList.toggle('ar-case-locked', !open)
    host.dataset.caseState = (lidAnimation || (viewAnimation && !viewAnimation.inspection)) ? (lidTarget ? 'opening' : 'closing') : (lidTarget ? 'open' : 'closed')
    canvas.dataset.lidAngle = String(Math.round(archiveCaseMotion(lidProgress).lid * 1060) / 10)
    toggle.setAttribute('aria-expanded', String(lidTarget === 1))
    const arriving = summoned && !arrived
    toggle.setAttribute('aria-label', !summoned ? 'Come out — summon robot' : arriving ? 'Robot arriving' : lidTarget ? 'Close archive case' : 'Open archive case')
    toggle.setAttribute('aria-busy', String(arriving))
    toggle.disabled = !assetsReady || arriving
    toggle.textContent = focused ? '×' : !summoned ? 'COME OUT' : arriving ? 'ARRIVING…' : 'OPEN CASE'
    controls.enabled = arrived && !viewAnimation && !lidAnimation
    if(arrived)closedCaseEyes()
  }
  function setInspection(value: 'tapes' | 'monitor') {
    if(!focused || !lidTarget || lidProgress<.999 || (inspection===value && !viewAnimation))return
    const from=cameraPose();active='';label.hidden=true;inspection=value;resetCamera()
    viewAnimation={from,to:cameraPose(),start:0,closing:false,inspection:true}
    applyViewAnimation(motionTime);syncCase();request()
    toggle.focus({preventScroll:true})
  }
  function cameraPose(): ViewPose {
    return { center: controls.target.clone(), rotation: camera.quaternion.clone(), distance: camera.position.distanceTo(controls.target), viewport: { ...camera.view! } }
  }
  // Express a stage camera in the fullscreen viewport without changing its pixels.
  function fullscreenPose(pose: ViewPose, rect: DOMRect): ViewPose {
    const full = host.getBoundingClientRect()
    return { ...pose, viewport: { fullWidth: rect.width, fullHeight: rect.height, offsetX: full.x-rect.x, offsetY: full.y-rect.y, width: full.width, height: full.height } }
  }

  function applyViewAnimation(now: number) {
    if (!viewAnimation) return
    const t = reduced.matches ? 1 : viewAnimation.start ? THREE.MathUtils.clamp((now-viewAnimation.start)/850,0,1) : 0
    const ease = THREE.MathUtils.smootherstep(t,0,1), {from,to} = viewAnimation
    fitting = true
    const a=from.viewport,b=to.viewport,lerp=(x:number,y:number)=>THREE.MathUtils.lerp(x,y,ease)
    camera.setViewOffset(lerp(a.fullWidth,b.fullWidth),lerp(a.fullHeight,b.fullHeight),lerp(a.offsetX,b.offsetX),lerp(a.offsetY,b.offsetY),lerp(a.width,b.width),lerp(a.height,b.height))
    controls.target.copy(from.center).lerp(to.center,ease)
    camera.quaternion.copy(from.rotation).slerp(to.rotation,ease)
    camera.position.copy(controls.target).addScaledVector(new THREE.Vector3(0,0,1).applyQuaternion(camera.quaternion),from.distance*Math.pow(to.distance/from.distance,ease))
    controls.update(); camera.updateMatrixWorld(); fitting = false
    canvas.dataset.viewTransition = viewAnimation.closing ? 'zooming-out' : 'zooming-in'
    canvas.dataset.viewProgress = t.toFixed(3)
    return t
  }
  function startLidAnimation() {
    lidAnimation = { from: lidProgress, to: lidTarget, start: motionTime, duration: Math.max(500,Math.abs(lidTarget-lidProgress)*archiveCaseDuration) }
  }
  function returnToStage() {
    const from = cameraPose()
    // Measure the current responsive stage in the same frame, before any paint.
    focused = false; screen.classList.remove('ar-viewer-active'); screen.scrollTop=stageScrollTop; resize()
    const rect = host.getBoundingClientRect(), stage = cameraPose()
    focused = true; screen.classList.add('ar-viewer-active'); resize()
    viewAnimation = { from, to: fullscreenPose(stage,rect), start: 0, closing: true }
    applyViewAnimation(motionTime)
  }
  function toggleCase() {
    if (!arrived) return
    if(lidTarget && (inspection==='monitor' || viewAnimation?.inspection)){
      const from=cameraPose();lidTarget=0;inspection='tapes';viewAnimation=undefined
      caseEyes()
      monitor.stop();active='';label.hidden=true;resetCamera()
      viewAnimation={from,to:cameraPose(),start:0,closing:false}
      applyViewAnimation(motionTime);toggle.focus({preventScroll:true});syncCase();request();return
    }
    lidTarget = lidTarget ? 0 : 1
    caseEyes()
    active = ''; label.hidden = true
    if(!lidTarget)monitor.stop()
    if (cardGrid.contains(document.activeElement) || (!lidTarget && host.contains(document.activeElement))) toggle.focus({ preventScroll: true })
    if (lidTarget && !focused) {
      const rect = host.getBoundingClientRect(), from = cameraPose()
      setFocus(true)
      viewAnimation = { from: fullscreenPose(from,rect), to: cameraPose(), start: 0, closing: false }
      applyViewAnimation(motionTime)
    } else if (viewAnimation) {
      viewAnimation = undefined
      if (lidTarget) {
        const from = cameraPose(); resetCamera()
        viewAnimation = { from, to: cameraPose(), start: 0, closing: false }
        applyViewAnimation(motionTime)
      } else returnToStage()
    } else startLidAnimation()
    syncCase(); request()
  }
  function setFocus(value:boolean){
    if(focused===value)return
    if(value)stageScrollTop=screen.scrollTop
    focused=value
    screen.classList.toggle('ar-viewer-active',value)
    if(value){host.append(pagination);pagination.classList.add('ar-viewer-pagination')}
    else{paginationHome.append(pagination);pagination.classList.remove('ar-viewer-pagination');screen.scrollTop=stageScrollTop}
    for(const sibling of host.parentElement!.children){
      if(sibling===host || !(sibling instanceof HTMLElement))continue
      sibling.inert=value
    }
    if(value){host.setAttribute('role','dialog');host.setAttribute('aria-modal','true');host.setAttribute('aria-label','Cassette collection — drag to rotate');toggle.focus({preventScroll:true})}
    else {host.removeAttribute('role');host.removeAttribute('aria-modal');host.removeAttribute('aria-label')}
    resize()
  }
  function viewerKeys(event:KeyboardEvent){
    if(!focused || !visible)return
    if(event.key==='Escape'){
      event.preventDefault();event.stopImmediatePropagation()
      if(inspection==='monitor')activateTapes()
      else if(lidTarget)toggleCase()
    }else if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home'].includes(event.key)){
      event.preventDefault();event.stopImmediatePropagation()
      if(viewAnimation || lidAnimation)return
      if(event.key==='Home')resetCamera()
      else {
        const spherical=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target))
        if(event.key==='ArrowLeft')spherical.theta-=Math.PI/12
        if(event.key==='ArrowRight')spherical.theta+=Math.PI/12
        if(event.key==='ArrowUp')spherical.phi=Math.max(.12,spherical.phi-Math.PI/12)
        if(event.key==='ArrowDown')spherical.phi=Math.min(Math.PI-.12,spherical.phi+Math.PI/12)
        fitCamera(new THREE.Vector3().setFromSpherical(spherical).normalize())
      }
      request()
    }else if(event.key==='Tab'){
      const items=[...host.querySelectorAll<HTMLElement>('.ar-card, .ar-case-toggle, .ar-monitor-control, .ar-pagination button:not(:disabled)')].filter(el=>!el.closest('[inert]') && !el.hasAttribute('disabled') && el.getClientRects().length && getComputedStyle(el).visibility!=='hidden')
      const current=items.indexOf(document.activeElement as HTMLElement)
      if(event.shiftKey && current<=0){event.preventDefault();items.at(-1)?.focus()}
      else if(!event.shiftKey && (current<0 || current===items.length-1)){event.preventDefault();items[0]?.focus()}
    }
  }
  window.addEventListener('keydown',viewerKeys,true)
  function cassetteBounds(){
    cargo.updateWorldMatrix(true,false)
    return [-6.4,6.4].flatMap(x=>[.7,2.65].flatMap(y=>[-5.35,5.35].map(z=>new THREE.Vector3(x,y,z).applyMatrix4(cargo.matrixWorld))))
  }
  function fitCamera(direction = camera.position.clone().sub(controls.target).normalize()) {
    if(fitting)return
    fitting=true
    const points=lid.bounds(),tapes=cassetteBounds(),detail=inspection==='monitor'?monitor.bounds():tapes,zoom=archiveCaseMotion(lidProgress).zoom
    camera.position.copy(direction);camera.lookAt(0,0,0)
    const inverse=camera.quaternion.clone().invert()
    const tanY=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),tanX=tanY*camera.aspect
    // Reserve space for the bottom controls and center the dog in the free stage.
    const topInset=focused?0:Math.min(42,Math.max(24,height*.05)),bottomInset=focused?0:stageDockHeight+topInset
    const verticalSpan=focused?.86:Math.max(.35,1-(topInset+bottomInset)/height)*.88
    const stageOffset=focused?0:(bottomInset-topInset)/height
    const cameraUp=new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion)
    function framing(vertices:THREE.Vector3[]){
      const center=new THREE.Box3().setFromPoints(vertices).getCenter(new THREE.Vector3())
      const p=new THREE.Vector3()
      let distance=0
      for(const point of vertices){
        p.copy(point).sub(center).applyQuaternion(inverse)
        distance=Math.max(distance,p.z+Math.abs(p.x)/(tanX*(focused ? Math.min(.89,Math.max(.5,1-84/width)) : .92)),p.z+Math.abs(p.y)/(tanY*verticalSpan))
      }
      center.addScaledVector(cameraUp,-stageOffset*tanY*distance)
      return {center,distance}
    }
    const overview=framing(points),closeup=framing(detail)
    const center=overview.center.lerp(closeup.center,zoom)
    const distance=overview.distance*Math.pow(closeup.distance/overview.distance,zoom)
    controls.target.copy(center)
    camera.position.copy(center).addScaledVector(direction,distance)
    canvas.dataset.focus=zoom>.999?(inspection==='monitor'?'monitor-closeup':'cassette-closeup'):focused?'opening-overview':'vehicle'
    canvas.dataset.zoomProgress=zoom.toFixed(3)
    canvas.dataset.cameraDistance=distance.toFixed(3)
    controls.update();camera.updateMatrixWorld()
    function projectedBounds(vertices:THREE.Vector3[]){
      const p=new THREE.Vector3()
      let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity
      for(const vertex of vertices){
        p.copy(vertex).project(camera)
        minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x)
        minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y)
      }
      return JSON.stringify({minX,maxX,minY,maxY})
    }
    canvas.dataset.modelBounds=projectedBounds(points)
    canvas.dataset.cassetteBounds=projectedBounds(tapes)
    canvas.dataset.monitorBounds=projectedBounds(monitor.bounds())
    canvas.dataset.azimuth=controls.getAzimuthalAngle().toFixed(3)
    canvas.dataset.polar=controls.getPolarAngle().toFixed(3)
    fitting=false
  }
  function resetCamera(){
    if(inspection==='monitor' && lidProgress>.999){fitCamera(monitor.direction());return}
    const turn=archiveCaseMotion(lidProgress).turn
    const exterior=new THREE.Vector3(-24,10,28).lerp(new THREE.Vector3(-32,9,0),frontBlend).normalize()
    fitCamera(exterior.lerp(new THREE.Vector3(0,26,28).normalize(),turn).normalize())
  }
  syncCase()
  function request() { if (visible && inViewport && !disposed && !document.hidden && !frame) frame = requestAnimationFrame(draw) }
  function project(point: THREE.Vector3) {
    point.project(camera)
    return { x: (point.x * .5 + .5) * renderWidth - canvasOffset, y: (-point.y * .5 + .5) * renderHeight - canvasPad }
  }
  function draw(now = performance.now()) {
    stopEyesTimer()
    frame = 0
    if (!visible || !inViewport || disposed || document.hidden) return
    // Keep a long shader/OS stall from skipping visible animation poses. Normal
    // frames retain real-time speed; idle time never advances a new transition.
    if(lastDrawTime!==undefined)motionTime+=Math.min(50,Math.max(0,now-lastDrawTime))
    lastDrawTime=now
    let moving = false
    if (assetsReady && summoned && !arrived) {
      shadowDirty=true
      if(entranceStart===undefined){
        entranceStart=motionTime
        entranceDistance=Math.max(28,camera.position.distanceTo(controls.target)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*renderWidth/height+10)
        entranceDirection.set(1,0,0).applyQuaternion(camera.quaternion);entranceDirection.y=0
      }
      const elapsed = motionTime - entranceStart
      const t = reduced.matches ? 1 : THREE.MathUtils.clamp((elapsed - 150) / 5400, 0, 1)
      const rest = reduced.matches ? 1 : THREE.MathUtils.clamp((elapsed - 5550) / 1400, 0, 1)
      travel.visible = reduced.matches || elapsed >= 150
      // One fixed path and a linear stride phase: no late acceleration and no
      // camera-dependent speed changes as the robot reaches its seat.
      const distance = (1-t)*entranceDistance
      travel.position.copy(entranceDirection).multiplyScalar(distance)
      key.position.copy(travel.position).add(new THREE.Vector3(-16,32,18))
      key.target.position.copy(travel.position)
      travel.rotation.y = -.7*(1-THREE.MathUtils.smoothstep(t,.78,1))
      const phase = t * entranceDistance / 3.69 * Math.PI * 2
      lid.walk(phase, Math.min(1,(1-t)*10),rest)
      canvas.dataset.pose = rest === 1 ? 'sitting' : t === 1 ? 'sitting-down' : 'walking'
      canvas.dataset.arrival = rest === 1 ? 'arrived' : t === 1 ? 'settling' : travel.visible ? 'walking' : 'waiting'
      canvas.dataset.arrivalProgress = t.toFixed(3)
      canvas.dataset.restProgress = rest.toFixed(3)
      canvas.dataset.walkPhase = phase.toFixed(3)
      canvas.dataset.travelDistance = distance.toFixed(4)
      frontBlend=THREE.MathUtils.smootherstep(rest,0,1)
      if(t===1)resetCamera()
      if (rest === 1) {
        arrived = true; travel.position.set(0,0,0); travel.rotation.set(0,0,0); lid.walk(0,0,1); resetCamera(); syncCase()
        if (document.activeElement === document.body || document.activeElement === toggle) toggle.focus({preventScroll:true})
      } else moving = true
    }
    if (viewAnimation) {
      viewAnimation.start ||= motionTime
      if (applyViewAnimation(motionTime) === 1) {
        const closing = viewAnimation.closing, inspecting=viewAnimation.inspection
        viewAnimation = undefined; canvas.dataset.viewTransition = 'idle'
        if (closing) setFocus(false)
        else if(!inspecting)startLidAnimation()
        else resetCamera()
        syncCase()
      } else moving = true
    }
    if (lidAnimation) {
      const previousPose = archiveCaseMotion(lidProgress)
      const t = reduced.matches ? 1 : Math.min(1, (motionTime - lidAnimation.start) / lidAnimation.duration)
      lidProgress = THREE.MathUtils.lerp(lidAnimation.from, lidAnimation.to, t)
      const pose = archiveCaseMotion(lidProgress)
      // The pauses and final zoom move only the camera. Reuse the unchanged
      // casing pose and shadow map through those phases, in both directions.
      if (pose.lower !== previousPose.lower || pose.tip !== previousPose.tip || pose.lid !== previousPose.lid) {
        lid.setProgress(lidProgress)
        shadowDirty=true
      }
      resetCamera()
      if (t === 1) {lidAnimation = undefined;if(!lidTarget){returnToStage();moving=true}}
      else moving = true
      canvas.dataset.casePhase = archiveCasePhase(lidProgress)
      syncCase()
    }
    for (const print of prints) {
      const shown=archiveCaseMotion(lidProgress).lid > .015
      if(print.group.visible!==shown)shadowDirty=true
      print.group.visible = shown
      const target = print.baseY + (print.id === active ? .52 : 0)
      const oldY=print.group.position.y
      print.group.position.y = reduced.matches ? target : THREE.MathUtils.lerp(print.group.position.y, target, .19)
      if(oldY!==print.group.position.y)shadowDirty=true
      if (Math.abs(print.group.position.y - target) > .001) moving = true
      print.glow.uniforms.strength.value = print.id === active ? 1.25 : .8
    }
    const expression:DogExpression=!summoned?'off':!arrived?'loading':smiling?'smile':caseExpression
    const animateEyes=expression==='loading'||expression==='star'||expression==='heart'
    const eyesMoving=lid.updateEyes(expression,now,animateEyes,reduced.matches)
    canvas.dataset.eyeExpression=expression;canvas.dataset.eyeAnimating=String(eyesMoving)
    scene.updateMatrixWorld()
    camera.updateMatrixWorld()
    eyeFrustum.setFromProjectionMatrix(eyeProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse))
    const eyesInView=travel.visible&&eyeLights.some(eye=>eyeFrustum.intersectsObject(eye))
    canvas.dataset.eyesInView=String(eyesInView)
    const stageRect = host.getBoundingClientRect()
    if(monitor.update(performance.now()))moving=true
    monitor.button.hidden=!(focused && lidTarget && lidProgress>.999 && !viewAnimation && monitor.facing(camera))
    if(!monitor.button.hidden){
      const corners=monitor.surface().map(project)
      const minX=Math.max(0,Math.min(...corners.map(p=>p.x))),minY=Math.max(0,Math.min(...corners.map(p=>p.y)))
      const w=Math.max(0,Math.min(width,Math.max(...corners.map(p=>p.x)))-minX),h=Math.max(0,Math.min(height,Math.max(...corners.map(p=>p.y)))-minY)
      if(w<1||h<1)monitor.button.hidden=true
      Object.assign(monitor.button.style,{left:`${minX}px`,top:`${minY}px`,width:`${w}px`,height:`${h}px`,clipPath:`polygon(${corners.map(p=>`${(p.x-minX)/w*100}% ${(p.y-minY)/h*100}%`).join(',')})`})
    }
    if(focused && inspection==='tapes'){
      const edges=[-6.8,6.8].flatMap(x=>[-5.6,5.6].map(z=>project(new THREE.Vector3(x,1.7,z).applyMatrix4(cargo.matrixWorld))))
      const left=Math.min(...edges.map(p=>p.x)),right=Math.max(...edges.map(p=>p.x))
      const y=THREE.MathUtils.clamp(edges.reduce((n,p)=>n+p.y,0)/edges.length,50,height-50)
      const prev=pagination.querySelector<HTMLElement>('.ar-prev')!,next=pagination.querySelector<HTMLElement>('.ar-next')!
      prev.style.left=`${Math.max(22,left-25)}px`;next.style.left=`${Math.min(width-22,right+25)}px`
      prev.style.top=next.style.top=`${y}px`
    }
    const caseCenter=project(new THREE.Vector3(0,2.9,0).applyMatrix4(cargo.matrixWorld))
    canvas.dataset.caseCenter=JSON.stringify(caseCenter)
    canvas.dataset.caseScreenCenter=JSON.stringify({x:caseCenter.x+stageRect.x,y:caseCenter.y+stageRect.y})
    for (const print of prints) {
      if (!arrived || lidProgress < .999) continue
      // The hit area stops above the lip. Real walls still render in front of
      // the print below it, with no invisible link laid over the metal hardware.
      // Keep the native hit target at the resting face so a small cassette
      // cannot oscillate between hover and leave while its mesh lifts.
      const liftOffset = new THREE.Vector3(0, print.group.position.y-print.baseY, 0).applyMatrix3(new THREE.Matrix3().setFromMatrix4(cargo.matrixWorld))
      const center = new THREE.Vector3(0, 0, .18).applyMatrix4(print.group.matrixWorld).sub(liftOffset)
      const normal=new THREE.Vector3(0,0,1).transformDirection(print.group.matrixWorld)
      const facing=normal.dot(camera.position.clone().sub(center))>0
      print.anchor.style.visibility=facing?'visible':'hidden'
      if(!facing)continue
      const up = new THREE.Vector3(0, 1, 0).transformDirection(print.group.matrixWorld)
      const wall = new THREE.Vector3(0,1.45,print.frontZ).applyMatrix4(cargo.matrixWorld)
      const wallTop = wall.y
      const frontZ = wall.z
      const c = camera.position
      const a = up.y * (c.z - frontZ) + (wallTop - c.y) * up.z
      const b = center.y * (c.z - frontZ) + (wallTop - c.y) * center.z + c.y * frontZ - wallTop * c.z
      const low = THREE.MathUtils.clamp(-b / a + .035, -print.height / 2, print.height / 2 - .1)
      const corners = [[-print.width / 2, print.height / 2], [print.width / 2, print.height / 2], [print.width / 2, low], [-print.width / 2, low]].map(([x, y]) => project(new THREE.Vector3(x, y, .18).applyMatrix4(print.group.matrixWorld).sub(liftOffset)))
      const minX = Math.min(...corners.map(p => p.x)), minY = Math.min(...corners.map(p => p.y))
      const w = Math.max(...corners.map(p => p.x)) - minX, h = Math.max(...corners.map(p => p.y)) - minY
      Object.assign(print.anchor.style, { left: `${minX}px`, top: `${minY}px`, width: `${w}px`, height: `${h}px`, clipPath: `polygon(${corners.map(p => `${(p.x - minX) / w * 100}% ${(p.y - minY) / h * 100}%`).join(',')})` })
      if (active === print.id) {
        label.textContent = (print.anchor.dataset.tooltip || print.anchor.title) + ' ↗'
        label.style.left = `${minX + w / 2}px`; label.style.top = `${minY + h + 6}px`
      }
    }
    label.hidden = !active || lidProgress < .999 || !lidTarget
    if (resolutionDirty) { resolutionDirty = false; syncResolution() }
    // Render the product only inside its stage. Reuse that shadow map to draw
    // the receiver in the overscan strips, so shadows continue below the stage
    // without the enlarged canopy covering the navigation or heading.
    renderer.autoClear = false
    renderer.setScissorTest(false)
    renderer.clear()
    renderer.setScissor(0,canvasPad,renderWidth,height)
    renderer.setScissorTest(true)
    renderer.shadowMap.needsUpdate=shadowDirty
    renderer.render(scene,camera)
    shadowDirty=false
    const wasVisible=travel.visible
    travel.visible=false
    if(canvasPad>0){
      renderer.setScissor(0,0,renderWidth,canvasPad);renderer.render(scene,camera)
      renderer.setScissor(0,canvasPad+height,renderWidth,canvasPad);renderer.render(scene,camera)
    }
    travel.visible=wasVisible
    renderer.setScissorTest(false)
    canvas.dataset.activeCassette = active
    canvas.dataset.frames = String(Number(canvas.dataset.frames || 0) + 1)
    if (moving) request()
    else {
      lastDrawTime=undefined;scheduleSmile()
      // Keep the LED patterns alive after the mechanical action finishes.
      // Sleep between light-only frames; retain full RAF cadence for movement.
      if(eyesMoving&&eyesInView)eyesTimer=window.setTimeout(()=>{eyesTimer=undefined;request()},1000/30)
    }
  }
  function syncResolution() {
    if (!width || !height || disposed) return
    const maxSide = Math.min(8192, renderer.capabilities.maxTextureSize)
    const density = Math.max(2, window.devicePixelRatio * (window.visualViewport?.scale || 1))
    const ratio = Math.min(density, 4, maxSide / Math.max(renderWidth, renderHeight), Math.sqrt(18_000_000 / (renderWidth * renderHeight)))
    const currentRatio = renderer.getPixelRatio()
    const nextRatio = Math.abs(currentRatio - ratio) > .01 ? ratio : currentRatio
    renderer.getSize(rendererSize)
    if (rendererSize.x !== renderWidth || rendererSize.y !== renderHeight || nextRatio !== currentRatio) {
      renderer.setDrawingBufferSize(renderWidth, renderHeight, nextRatio)
    }
    canvas.dataset.renderScale = ratio.toFixed(2)
  }
  function requestResolution() { resolutionDirty = true; request() }
  function resize() {
    if (!host.clientWidth) return
    width = host.clientWidth; height = host.clientHeight
    // Measure only on resize, never during the animation's camera fitting loop.
    if (!focused) stageDockHeight = host.querySelector<HTMLElement>('.ar-bottom-actions')?.offsetHeight ?? 0
    // Extend the actual drawing surface to the page edges, preserving the host's
    // framing with an off-axis projection. No internal rectangle clips the walk.
    const screen = host.closest<HTMLElement>('.archive-screen')!
    canvasOffset = host.getBoundingClientRect().left - screen.getBoundingClientRect().left
    renderWidth = screen.clientWidth
    // Reserve vertical overscan for the ground shadow, too. The shadow map and
    // receiver already follow the vehicle; the CSS stage must not slice them.
    canvasPad = focused ? 0 : Math.min(180, Math.max(100, height * .2))
    renderHeight = height + canvasPad * 2
    canvas.style.top = `${-canvasPad}px`; canvas.style.height = `${renderHeight}px`
    canvas.dataset.shadowOverscan = String(canvasPad)
    // Feather the close-up into the surrounding page instead of exposing a
    // hard crop across the canopy or the outer edge of a soft ground shadow.
    canvas.style.maskImage = focused ? 'none' : `linear-gradient(to bottom, transparent ${canvasPad}px, #000 ${canvasPad+42}px, #000 calc(100% - 32px), transparent)`
    canvas.style.left = `${-canvasOffset}px`; canvas.style.width = `${renderWidth}px`
    requestResolution()
    camera.setViewOffset(width, height, -canvasOffset, -canvasPad, renderWidth, renderHeight)
    camera.updateProjectionMatrix()
    resetCamera(); if(viewAnimation)applyViewAnimation(motionTime); request()
  }
  // Browser zoom, moving between Retina displays, and mobile pinch zoom can
  // change pixel density without changing the element's CSS dimensions.
  let densityQuery: MediaQueryList
  function densityChanged() {
    densityQuery?.removeEventListener('change', densityChanged)
    densityQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    densityQuery.addEventListener('change', densityChanged)
    requestResolution()
  }
  densityChanged()
  window.visualViewport?.addEventListener('resize', requestResolution)
  window.addEventListener('resize', requestResolution)
  controls.addEventListener('change', () => {if(!fitting)fitCamera();request()})
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(host)
  // Include the shadow overscan: suspend only once the whole drawing surface
  // has left the scroll viewport, and resume at the same mechanical pose.
  const intersectionObserver = new IntersectionObserver(([entry]) => {
    if (inViewport === entry.isIntersecting) return
    inViewport = entry.isIntersecting
    lastDrawTime = undefined
    if (inViewport) request()
    else { cancelAnimationFrame(frame); frame = 0; stopEyesTimer(); stopSmile() }
  })
  intersectionObserver.observe(canvas)
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); monitor.stop();monitor.setAvailable(false);setFocus(false); host.classList.remove('ar-product-ready', 'ar-product-host', 'ar-case-locked'); cardGrid.inert = false; visible = false; label.hidden = true; toggle.disabled = true
    for (const print of prints) for (const key of ['left', 'top', 'width', 'height', 'clip-path', 'visibility']) print.anchor.style.removeProperty(key)
  })
  canvas.addEventListener('webglcontextrestored', () => { shadowDirty=true; host.classList.add('ar-product-ready', 'ar-product-host'); visible = !host.closest<HTMLElement>('.archive-screen')!.hidden; syncCase(); resize() })

  async function setCards(anchors: HTMLElement[]) {
    const version = ++generation
    assetsReady=false
    canvas.dataset.graphicsReady='false'
    active = ''
    label.hidden = true
    host.classList.add('ar-product-loading')
    host.setAttribute('aria-busy', 'true')
    syncCase()
    shadowDirty=true
    const sharedGeometries=new Set(cassetteGeometryCache.values())
    for (const print of prints) {
      cargo.remove(print.group)
      print.group.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return
        if(!sharedGeometries.has(object.geometry)){object.geometry.dispose(); geometries.delete(object.geometry)}
        object.material.dispose(); materials.delete(object.material)
      })
    }
    prints = []
    await cassetteTypographyReady
    if (version !== generation || disposed) return
    anchors.forEach((anchor, i) => {
      // Use the styled label; native title tooltips cannot be coloured.
      anchor.dataset.tooltip = anchor.dataset.tooltip || anchor.title
      anchor.removeAttribute('title')
      const edition = Number(anchor.dataset.edition || 0)
      const cacheKey = `cassette-label-${edition}`
      let labelMap = textures.get(cacheKey)
      if (!labelMap) {
        labelMap = texture(2048, 1290, ctx => drawCassetteLabel(ctx, edition))
        textures.set(cacheKey, labelMap)
      }
      const group = createCassette(edition, labelMap, (g, m) => { geometries.add(g); materials.add(m) }, cassetteSurfaces, cassetteGeometryCache)
      const w = 2.7, actualHeight = 1.7
      const baseY = 1.59
      group.position.set((i % 5 - 2) * 2.4, baseY, (Math.floor(i / 5) - 2) * 2 + .03)
      group.rotation.set(-.72, [-.025, .018, -.012, .023, .01][i % 5], 0)
      group.scale.x = 1 / 1.28
      cargo.add(group)
      const glow = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, uniforms: { size: { value: new THREE.Vector2(w, actualHeight) }, strength: { value: .8 } },
        vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: 'varying vec2 vUv; uniform vec2 size; uniform float strength; void main(){ vec2 p=abs((vUv-.5)*(size+1.1))-size*.5; float d=length(max(p,0.))+min(max(p.x,p.y),0.); float outside=max(d,0.); float core=exp(-outside*29.); float bloom=.62*exp(-outside*7.5); float fade=1.-smoothstep(.30,.54,outside); float a=(core+bloom)*smoothstep(-.012,.008,d)*fade*strength; gl_FragColor=vec4(.76,.91,1.,min(a,.96)); }',
      })
      const halo = mesh(new THREE.PlaneGeometry(w + 1.1, actualHeight + 1.1), glow, 0, 0, .18, group); halo.castShadow = false; halo.name = 'cassette-hover-glow'
      prints.push({ id: anchor.dataset.project!, anchor, group, width: w, height: actualHeight, baseY, frontZ: (Math.floor(i / 5) - 2) * 2 + 1.06, glow })
    })
    canvas.dataset.cards = String(prints.length)
    canvas.dataset.objects = 'cassettes'
    canvas.dataset.labelResolution = '2048×1290'
    canvas.dataset.editions = anchors.map(a => a.dataset.edition).join(',')
    canvas.dataset.compartments = '25'
    cacheArchiveTransforms(scene)
    // Prepare hidden cassette shaders, texture uploads and geometry before the
    // user starts moving the model, instead of on the first visible zoom frame.
    await renderer.compileAsync(scene,camera)
    if(version!==generation||disposed)return
    for(const map of ownedTextures)renderer.initTexture(map)
    const autoClear=renderer.autoClear,scissorTest=renderer.getScissorTest()
    const travelVisible=travel.visible,printVisibility=prints.map(print=>print.group.visible)
    const culled:THREE.Object3D[]=[]
    try{
      travel.visible=true;prints.forEach(print=>print.group.visible=true)
      scene.traverse(object=>{if(object.frustumCulled){culled.push(object);object.frustumCulled=false}})
      scene.updateMatrixWorld(true)
      // Use the actual output path: an offscreen target compiles different
      // tone-mapping programs and leaves the first on-screen frame unprepared.
      renderer.setScissorTest(false);renderer.autoClear=true
      renderer.shadowMap.needsUpdate=true
      renderer.render(scene,camera)
    }finally{
      renderer.setScissorTest(scissorTest);renderer.autoClear=autoClear
      travel.visible=travelVisible;prints.forEach((print,i)=>print.group.visible=printVisibility[i])
      culled.forEach(object=>object.frustumCulled=true)
      shadowDirty=true
    }
    assetsReady = true
    canvas.dataset.graphicsReady='true'
    host.classList.add('ar-product-ready')
    host.classList.remove('ar-product-loading')
    host.setAttribute('aria-busy', 'false')
    syncCase(); resize(); request()
    // Replace the warm-up image with the real state before the browser paints.
    if(visible){cancelAnimationFrame(frame);frame=0;draw()}
  }
  return {
    setCards,
    setActive(id: string) { active = lidProgress > .999 && lidTarget ? id : ''; request() },
    setVisible(value: boolean) {
      if(!value){stopSmile();stopEyesTimer();monitor.stop();monitor.setAvailable(false);viewAnimation=undefined;canvas.dataset.viewTransition='idle';setFocus(false)}
      if (value && !visible) {
        stopSmile();stopEyesTimer();caseExpression='loading';lid.updateEyes('off',motionTime,false,true)
        shadowDirty=true
        summoned = false; arrived = false; inspection='tapes'; entranceStart = undefined; travel.visible = false
        lidProgress = lidTarget = frontBlend = 0; lidAnimation = undefined; viewAnimation = undefined; lid.setProgress(0); lid.walk(0,0,0)
        canvas.dataset.arrival = 'waiting'; syncCase()
      }
      visible = value
      if (value) { resize(); request() } else { cancelAnimationFrame(frame); frame = 0; lastDrawTime=undefined }
    },
    dispose() {
      stopSmile();stopEyesTimer();document.removeEventListener('visibilitychange',expressionsVisibilityChanged);reduced.removeEventListener('change',expressionPreferencesChanged)
      monitor.button.removeEventListener('click',activateMonitor);monitor.dispose();setFocus(false);window.removeEventListener('keydown',viewerKeys,true)
      densityQuery.removeEventListener('change', densityChanged)
      window.visualViewport?.removeEventListener('resize', requestResolution)
      window.removeEventListener('resize', requestResolution)
      disposed = true; generation++; cancelAnimationFrame(frame); resizeObserver.disconnect(); intersectionObserver.disconnect(); controls.dispose()
      for (const geometry of geometries) geometry.dispose()
      for (const material of materials) material.dispose()
      for (const tex of new Set([...ownedTextures, ...textures.values()])) tex.dispose()
      environment.dispose(); renderer.dispose(); canvas.remove(); label.remove(); toggle.removeEventListener('click',activateCase); toggle.disabled = true; toggle.textContent = 'COME OUT'; toggle.setAttribute('aria-label','Come out — summon robot'); toggle.setAttribute('aria-expanded','false'); toggle.setAttribute('aria-busy','false')
      host.classList.remove('ar-product-ready', 'ar-product-loading', 'ar-case-locked', 'ar-awaiting-summon')
      cardGrid.inert = false
      delete host.dataset.caseState
      host.removeAttribute('aria-busy')
      for (const print of prints) for (const key of ['left', 'top', 'width', 'height', 'clip-path', 'visibility']) print.anchor.style.removeProperty(key)
    },
  }
}
