import * as THREE from 'three'
import type {ResidentModel} from './planet-resident'
import {createPlanetVillage} from './planet-village'
import type {VillageState} from './planet-village'
import {createResidentStore,normalizeResidentName} from './resident-store'
import {residentDesigns,residentEnglish} from './resident-designs'
import {createResidentRig} from './resident-model'
import {residentPortrait} from './resident-portrait'
import {createPlanetEnvironment,PLANET_RADIUS,type PlanetLandmark} from './planet-environment'
import {createPlanetBubbles} from './planet-bubbles'
import {createPlanetNight} from './planet-night'
import {createArrivalCapsule,capsulePose,arrivalDuration,type CapsulePose} from './planet-capsule'
import {createIslandReflection,islandPixelRatio} from './planet-art-direction'
import {createNeonBackgroundLayer} from './planet-neon-background-layer'
import {createNeonMaterialStyle} from './planet-neon-materials'
export type PlanetMode='day'|'night'|'neon'

const R=PLANET_RADIUS,up=new THREE.Vector3(0,1,0),clamp=THREE.MathUtils.clamp

// Scene/lifecycle and resident persistence stay independent of environment art.
export const createPlanetWorld = (canvas:HTMLCanvasElement,landmarks:PlanetLandmark[],select:(id:string)=>void,onChange:(state:VillageState)=>void=()=>{}) => {
  let seed=93472
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.1,80)
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true})
  renderer.setPixelRatio(islandPixelRatio(window.innerWidth,window.innerHeight,window.devicePixelRatio||1));renderer.setClearColor(0x000000,0)
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NeutralToneMapping;renderer.toneMappingExposure=1
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap
  const world=new THREE.Group();world.name='parange-storybook-world';world.rotation.set(-.08,.30,-.10);scene.add(world)
  const ambient=new THREE.HemisphereLight('#dcefff','#8aafa8',1.12)
  ambient.name='planet-hemisphere'
  const sun=new THREE.DirectionalLight('#fff4df',2.65);sun.position.set(-4,7,6);sun.castShadow=true
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-4.4,right:4.4,top:4.4,bottom:-4.4,near:1,far:22})
  sun.shadow.normalBias=.012;sun.shadow.bias=-.0001;sun.shadow.radius=4
  sun.name='planet-sun-moon-key'
  const fill=new THREE.DirectionalLight('#c2e3ff',1.05);fill.position.set(3,2,7);scene.add(ambient,sun,fill)
  const environmentLight=createIslandReflection(renderer)
  scene.environment=environmentLight.texture;scene.environmentIntensity=.48
  const environment=createPlanetEnvironment(world,landmarks)
  const bubbles=createPlanetBubbles(scene,camera)
  const nightSky=createPlanetNight(scene,camera)
  const {terrain,clearing,obstacles,targets,underlays,surface:field}=environment
  let mode:PlanetMode='day',neon:ReturnType<typeof createNeonBackgroundLayer>|null=null
  let neonMaterials:ReturnType<typeof createNeonMaterialStyle>|null=null
  const store=createResidentStore()
  let restoring=true,lastSaved=0
  const prepareResident=(model:ResidentModel)=>{
    model.designIndex??=residentDesigns.findIndex(d=>`resident-${d.kind}`===model.group.name)
    if(model.designIndex<0||model.designIndex>=residentDesigns.length)return false
    if(model.id&&store.isExpelled(model.id))return false
    const defaultName=residentEnglish[residentDesigns[model.designIndex].kind].name
    const name=normalizeResidentName(model.name||'')
    if(!model.id)Object.assign(model,store.identity(model.customName||name!==defaultName?name:''))
    else if(!name)model.name=store.identity('').name
    else model.name=name
    model.group.userData.residentId=model.id
    neonMaterials?.include(model.group)
    return true
  }
  const persist=()=>{
    store.save(village.residents.map(({model,normal})=>({id:model.id!,name:model.name,designIndex:model.designIndex!,normal:normal.toArray() as [number,number,number]})))
    lastSaved=performance.now()
  }
  const village=createPlanetVillage({canvas,world,camera,terrain,targets,radius:R,clearing,obstacles,surface:field,select,underlays,
    prepare:prepareResident,onRemove:model=>store.expel(model.id!),onChange:state=>{
      if(!restoring)persist()
      onChange({...state,persistent:store.available})
    }})
  for(const saved of store.records){
    const model:ResidentModel={...createResidentRig(saved.designIndex),...saved,trait:residentEnglish[residentDesigns[saved.designIndex].kind].trait,portrait:'',mapped:false}
    village.add(model,new THREE.Vector3(...saved.normal).normalize())
    void residentPortrait(saved.designIndex).then(portrait=>{
      if(village.residents.some(r=>r.model===model)){model.portrait=portrait;village.refresh()}
    }).catch(()=>{ /* A portrait failure must not prevent restoring a 3D neighbor. */ })
  }
  restoring=false;village.refresh()
  type RevealFrame = {left:number;top:number;width:number;height:number}
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)')
  let arrival: { model: ResidentModel; normal: THREE.Vector3; started: number; onLand: () => void; onFlight: () => void; flying: boolean;
    capsule:ReturnType<typeof createArrivalCapsule>;onPose?:(pose:CapsulePose)=>void;onReady?:()=>void;
    center:THREE.Vector3;size:THREE.Vector3;getFrame?:()=>RevealFrame;flightStart?:THREE.Vector3;flightScale?:number } | null = null
  const findLanding = () => {
    const front = new THREE.Vector3(0,0,1).applyQuaternion(world.quaternion.clone().invert())
    for(let i=0;i<250;i++){
      const p=front.clone().add(new THREE.Vector3((random()-.5)*.8,(random()-.5)*.65,(random()-.5)*.5)).normalize()
      const safe=village.safePosition(p)
      if(safe)return safe
    }
    return village.safePosition(clearing)??clearing.clone()
  }
  const presentResident = (model: ResidentModel, onFlight: () => void, onLand: () => void, getFrame?:()=>RevealFrame,onPose?:(pose:CapsulePose)=>void,onReady?:()=>void) => {
    if(!prepareResident(model)){model.dispose();return false}
    if(arrival){arrival.capsule.dispose();scene.remove(arrival.model.group);arrival.model.dispose()}
    village.setEnabled(false);camera.position.set(0,0,fitDistance);camera.up.copy(up);camera.lookAt(0,0,0)
    // Keep the authored fur, clothing and eye finishes under the world lights.
    model.group.position.set(0,0,0);model.group.rotation.set(0,0,0);model.group.scale.setScalar(1)
    model.animate(performance.now(),false);model.group.updateMatrixWorld(true)
    const bounds=new THREE.Box3().setFromObject(model.group)
    arrival={model,normal:findLanding(),started:performance.now(),onLand,onFlight,flying:false,capsule:createArrivalCapsule(scene),onPose,onReady,
      center:bounds.getCenter(new THREE.Vector3()),size:bounds.getSize(new THREE.Vector3()),getFrame}
    if(neonMaterials)neonMaterials.include(scene)
    model.group.visible=false;scene.add(model.group);world.visible=false
    return true
  }
  const cancelArrival = () => {
    if(arrival){arrival.capsule.dispose();scene.remove(arrival.model.group);arrival.model.dispose();arrival=null}
    world.visible=true;village.setEnabled(true)
  }

  let active=false, covered=false, frame=0, fitDistance=14
  const resize=()=>{
    const width=canvas.clientWidth||window.innerWidth,height=canvas.clientHeight||window.innerHeight
    const pixelRatio=islandPixelRatio(width,height,window.devicePixelRatio||1)
    // Apply size and density together: raising DPR on the old large viewport
    // first would briefly request an oversized drawing buffer during resize.
    renderer.setDrawingBufferSize(width,height,pixelRatio);camera.aspect=width/height
    // Bounding sphere includes the tallest trees; initial view always has margin.
    const limitingFov=Math.min(THREE.MathUtils.degToRad(34/2),Math.atan(Math.tan(THREE.MathUtils.degToRad(34/2))*camera.aspect))
    fitDistance=4.08/Math.sin(limitingFov)/.80
    camera.updateProjectionMatrix()
    neon?.resize()
  }
  let lastTime=0
  const render=(now:number)=>{
    if(!active)return
    const dt=Math.min((now-lastTime)/1000||0,.05);lastTime=now
    if(!arrival)village.update(now,dt,fitDistance)
    if(now-lastSaved>5000&&village.residents.length)persist()
    if(arrival){
      // Start the premiere on its first rendered frame, even after a slow build
      // or a background tab. The studio covers the old canvas until then.
      if(arrival.onReady)arrival.started=now
      const age=now-arrival.started, model=arrival.model,reduced=reducedMotion.matches
      const pose=capsulePose(age,reduced),duration=arrivalDuration(reduced)
      arrival.onPose?.(pose)
      model.animate(now,false)
      // Fit the full 3D silhouette inside the UI's dedicated stage instead of
      // putting a fixed-size model behind the heading. Includes yaw/depth margin.
      const viewport=canvas.getBoundingClientRect(), stage=arrival.getFrame?.()??{left:viewport.left,top:viewport.top+viewport.height*.18,width:viewport.width,height:viewport.height*.57}
      const planeHeight=8*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),planeWidth=planeHeight*camera.aspect
      const depthMargin=1+arrival.size.z/Math.max(arrival.size.y,1)*.25
      const stageWidth=planeWidth*stage.width/viewport.width,stageHeight=planeHeight*stage.height/viewport.height
      const radius=Math.min(stageWidth,stageHeight)*.37
      // Fit the complete 3D bound, including ears/tails, inside the closed ball.
      // Keep that scale through the reveal so there is no sudden inflation.
      const scale=Math.min(.78*Math.min(stageWidth/Math.hypot(arrival.size.x,arrival.size.z),stageHeight/arrival.size.y)/depthMargin,
        radius*.86/(arrival.size.length()*.5))
      const rotation=new THREE.Quaternion().setFromAxisAngle(up,pose.turn)
      rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),pose.wobble*.35*(1-pose.release)))
      const stageCenter=new THREE.Vector3(((stage.left-viewport.left+stage.width/2)/viewport.width-.5)*planeWidth,
        (.5-(stage.top-viewport.top+stage.height/2)/viewport.height)*planeHeight,camera.position.z-4)
      const seat=arrival.capsule.update(age,pose,stageCenter,radius,-planeWidth/2,reduced)
      const start=seat.clone().sub(arrival.center.clone().applyQuaternion(rotation).multiplyScalar(scale))
      if(age<duration){model.group.visible=true;model.group.position.copy(start);model.group.scale.setScalar(scale);model.group.quaternion.copy(rotation)}
      else{
        if(!arrival.flying){
          // Freeze the visible pose before the caption changes height for flight.
          arrival.flightStart=model.group.position.clone();arrival.flightScale=model.group.scale.x
          arrival.flying=true;model.group.visible=true;arrival.capsule.dispose();world.visible=true;arrival.onFlight()
        }
        const t=clamp((age-duration)/2200,0,1), ease=t*t*(3-2*t)
        const end=arrival.normal.clone().multiplyScalar(R+field(arrival.normal).height+.02).applyQuaternion(world.quaternion)
        model.group.position.lerpVectors(arrival.flightStart!,end,ease);model.group.position.y+=Math.sin(t*Math.PI)*.45
        model.group.scale.setScalar(THREE.MathUtils.lerp(arrival.flightScale!,.24,ease))
        const finalRotation=world.quaternion.clone().multiply(new THREE.Quaternion().setFromUnitVectors(up,arrival.normal))
        model.group.quaternion.slerp(finalRotation,.06)
        if(t>=1){village.add(model,arrival.normal);village.setEnabled(true);const landed=arrival.onLand;arrival=null;landed()}
      }
    }
    // These visual effects are absolute-time functions, so catch up exactly on
    // the next visible frame. Keep village simulation/persistence running.
    if(world.visible&&(!covered||arrival))environment.update(now)
    // Neon already has its own illustrated sky objects; do not double them
    // with the basic edition's glass bubbles and night-sky particles.
    bubbles.update(now,world.visible&&mode!=='neon')
    nightSky.update(now,world.visible&&mode!=='neon',bubbles.burstComplete)
    // An opaque capture/build screen needs no GPU work. Keep simulation/time
    // intact, and always render arrivals for the first-frame cover handoff.
    if(!covered||arrival){
      if(mode==='neon'&&world.visible)neon!.render(now)
      renderer.render(scene,camera)
      const ready=arrival?.onReady
      if(arrival)arrival.onReady=undefined
      ready?.()
    }
    frame=requestAnimationFrame(render)
  }
  window.addEventListener('resize',()=>{if(active)resize()},{passive:true})
  const syncVisibility=()=>{
    if(document.hidden){if(arrival)arrival.model.group.userData.revealPausedAt=performance.now();village.suspend();persist();cancelAnimationFrame(frame);frame=0}
    else if(active&&!frame){village.resume();if(arrival){village.setEnabled(false);const paused=arrival.model.group.userData.revealPausedAt;if(paused){arrival.started+=performance.now()-paused;delete arrival.model.group.userData.revealPausedAt}}lastTime=performance.now();frame=requestAnimationFrame(render)}
  }
  document.addEventListener('visibilitychange',syncVisibility)
  window.addEventListener('pagehide',persist)
  const setNight=(night:boolean)=>{
    ambient.intensity=night?.62:1.12;ambient.color.set(night?'#668cd5':'#dcefff');ambient.groundColor.set(night?'#233556':'#8aafa8')
    sun.intensity=night?1.65:2.65;sun.color.set(night?'#8fb6ff':'#fff4df');sun.position.set(night?5:-4,7,night?2:6)
    scene.environmentIntensity=night?.10:.48;fill.intensity=night?.28:1.05;fill.color.set(night?'#718cd7':'#c2e3ff')
    environment.setNight(night);bubbles.setNight(night);nightSky.setNight(night)
  }
  const setMode=(value:PlanetMode)=>{
    mode=value
    if(value==='neon'&&!neon){
      neon=createNeonBackgroundLayer(canvas);neon.resize()
      neonMaterials=createNeonMaterialStyle();neonMaterials.include(world)
    }
    neon?.setVisible(value==='neon');setNight(value==='night')
    neonMaterials?.setEnabled(value==='neon')
    if(value==='neon'){
      ambient.color.set('#fffdf4');ambient.groundColor.set('#d8cce4');ambient.intensity=1.7
      sun.color.set('#fff9ee');sun.intensity=1.9
      fill.color.set('#e6faf5');fill.intensity=.8;scene.environmentIntensity=.12
    }
  }
  return {
    open:()=>{active=true;lastTime=performance.now();resize();camera.position.set(0,0,fitDistance);village.resume();cancelAnimationFrame(frame);frame=document.hidden?0:requestAnimationFrame(render)},
    close:()=>{active=false;cancelAnimationFrame(frame);frame=0;cancelArrival();village.suspend();persist()},
    setNight:(night:boolean)=>setMode(night?'night':'day'),
    setMode,
    get mode(){return mode},
    presentResident,
    prepareResident,
    cancelArrival,
    reset:village.reset,
    toggleMeeting:village.toggleMeeting,
    setInteractionEnabled:village.setEnabled,
    setCovered:(value:boolean)=>{covered=value},
    // Read-only scene access is useful to the camera-free development review.
    get village(){return village},
    get camera(){return camera},
    get world(){return world},
    get environment(){return environment},
    get bubbles(){return bubbles.group},
  }
}
