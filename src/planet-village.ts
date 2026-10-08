import * as THREE from 'three'
import type { ResidentModel } from './planet-resident'
import { createPlanetSinkhole } from './planet-sinkhole'

export type VillageState = { following: string | null; followingId:string|null; holding: string | null; meeting: boolean; count: number; sinkhole:boolean; overSinkhole:boolean; expelled:{id:string;name:string}|null; latest:{id:string;name:string;portrait:string;trait:string}|null; persistent?:boolean }
export type VillageObstacle = { normal: THREE.Vector3; radius: number }
type Resident = {
  model: ResidentModel; normal: THREE.Vector3; tangent: THREE.Vector3
  turnAt: number; pauseUntil: number; speed: number; lift: number
  meeting: { from: THREE.Vector3; to: THREE.Vector3; started: number; duration: number } | null
}
type Options = {
  canvas: HTMLCanvasElement; world: THREE.Group; camera: THREE.PerspectiveCamera; terrain: THREE.Mesh
  targets: THREE.Object3D[]; radius: number; clearing: THREE.Vector3; obstacles: VillageObstacle[]
  surface: (normal: THREE.Vector3) => { bank: number; height: number }
  select: (id: string) => void; onChange: (state: VillageState) => void
  prepare?: (model:ResidentModel)=>boolean; onRemove?: (model:ResidentModel)=>void
  underlays?:THREE.Mesh[]
}

export function createPlanetVillage(options: Options) {
  const {canvas,world,camera,terrain,targets,radius,clearing,obstacles,surface}=options
  const residents: Resident[]=[]
  const up=new THREE.Vector3(0,1,0), ray=new THREE.Raycaster(), ndc=new THREE.Vector2()
  const meetingRight=new THREE.Vector3().crossVectors(up,clearing).normalize()
  const meetingForward=new THREE.Vector3().crossVectors(clearing,meetingRight).normalize()
  let enabled=true, follow:Resident|null=null, meeting=false, yaw=0, pitch=.33, distance=1.32
  let globeZoom=1, globeTargetZoom=1, transitioning=false, suspendedAt=0, pressTimer=0
  let held:{resident:Resident; origin:THREE.Vector3; valid:THREE.Vector3|null;overSinkhole:boolean}|null=null
  let falling:{resident:Resident;started:number;normal:THREE.Vector3}|null=null
  let expelled:VillageState['expelled']=null
  const sinkhole=createPlanetSinkhole(world,terrain,radius,surface,options.underlays)
  let pointer:{id:number;x:number;y:number;startX:number;startY:number;distance:number;resident:Resident|null;dragging:boolean}|null=null
  const lookTarget=new THREE.Vector3()
  const orientRight=new THREE.Vector3(),orientFrame=new THREE.Matrix4(),nextNormal=new THREE.Vector3()
  const desiredPosition=new THREE.Vector3(),desiredUp=new THREE.Vector3(),desiredTarget=new THREE.Vector3()
  const followNormal=new THREE.Vector3(),followForward=new THREE.Vector3(),followRight=new THREE.Vector3()
  const rotation=new THREE.Quaternion(),interpolatedRotation=new THREE.Quaternion(),forward=new THREE.Vector3(0,0,1)
  const state=():VillageState=>{
    const latest=residents.at(-1)?.model
    return {following:follow?.model.name??null,followingId:follow?.model.id??null,holding:held?.resident.model.name??null,meeting,count:residents.length,
      sinkhole:sinkhole.open,overSinkhole:held?.overSinkhole??false,expelled,
      latest:latest?{id:latest.id!,name:latest.name,portrait:latest.portrait,trait:latest.trait}:null}
  }
  const notify=()=>options.onChange(state())
  const tangentAt=(normal:THREE.Vector3)=>{
    const tangent=new THREE.Vector3(Math.random()-.5,Math.random()-.5,Math.random()-.5).projectOnPlane(normal)
    return tangent.lengthSq()<1e-8 ? meetingRight.clone().projectOnPlane(normal).normalize() : tangent.normalize()
  }
  const spacing=.105
  const safe=(normal:THREE.Vector3,ignore?:Resident,occupied=true)=>surface(normal).bank>.075
    && obstacles.every(item=>normal.distanceTo(item.normal)>item.radius+.047)
    && (!sinkhole.open||ignore===held?.resident||normal.distanceTo(sinkhole.normal)>sinkhole.clearance)
    && (!occupied||residents.every(item=>item===ignore||normal.distanceTo(item.normal)>spacing))
  const nearestSafe=(point:THREE.Vector3,ignore?:Resident)=>{
    if(safe(point,ignore))return point.clone()
    const a=new THREE.Vector3().crossVectors(Math.abs(point.y)>.9?new THREE.Vector3(1,0,0):up,point).normalize()
    const b=new THREE.Vector3().crossVectors(point,a).normalize()
    for(let ring=1;ring<=6;ring++)for(let j=0;j<16;j++){
      const angle=j/16*Math.PI*2
      const candidate=point.clone().addScaledVector(a,Math.cos(angle)*ring*.025).addScaledVector(b,Math.sin(angle)*ring*.025).normalize()
      if(safe(candidate,ignore))return candidate
    }
    return null
  }
  const orient=(resident:Resident)=>{
    resident.tangent.projectOnPlane(resident.normal).normalize()
    if(resident.tangent.lengthSq()<.001)resident.tangent.copy(tangentAt(resident.normal))
    orientRight.crossVectors(resident.normal,resident.tangent).normalize()
    resident.model.group.position.copy(resident.normal).multiplyScalar(radius+surface(resident.normal).height+.012+resident.lift)
    resident.model.group.quaternion.setFromRotationMatrix(orientFrame.makeBasis(orientRight,resident.normal,resident.tangent))
    resident.model.group.scale.setScalar(.24)
  }
  const ringMaterial=new THREE.MeshBasicMaterial({color:'#ffe366',side:THREE.DoubleSide,depthWrite:false,transparent:true,opacity:.85})
  const ring=new THREE.Mesh(new THREE.RingGeometry(.115,.143,48),ringMaterial)
  ring.visible=false;world.add(ring)
  const setRay=(x:number,y:number)=>{
    world.updateMatrixWorld(true);camera.updateMatrixWorld(true)
    const bounds=canvas.getBoundingClientRect()
    ndc.set((x-bounds.left)/bounds.width*2-1,-(y-bounds.top)/bounds.height*2+1);ray.setFromCamera(ndc,camera)
  }
  const pick=(x:number,y:number)=>{
    setRay(x,y)
    const occlusion=ray.intersectObject(terrain,false)[0]?.distance??Infinity
    let chosen:Resident|null=null,nearest=occlusion+.012
    for(const resident of residents){
      const center=resident.model.group.localToWorld(new THREE.Vector3(0,.85,0))
      if(!ray.ray.intersectsSphere(new THREE.Sphere(center,.25)))continue
      const hit=ray.intersectObject(resident.model.group,true)[0]
      if(hit&&hit.distance<nearest){nearest=hit.distance;chosen=resident}
    }
    return chosen
  }
  const setFollow=(resident:Resident|null)=>{
    follow=resident;yaw=0;pitch=.33;distance=1.32;transitioning=true;notify()
  }
  const clearPress=()=>{window.clearTimeout(pressTimer);pressTimer=0}
  const expel=(resident:Resident)=>{
    const index=residents.indexOf(resident);if(index<0)return
    residents.splice(index,1);resident.meeting=null
    if(follow===resident){follow=null;transitioning=true}
    if(!residents.length)meeting=false
    resident.normal.copy(sinkhole.normal)
    expelled={id:resident.model.id!,name:resident.model.name}
    falling={resident,normal:sinkhole.normal.clone(),started:performance.now()}
    options.onRemove?.(resident.model)
  }
  const drop=(cancelled=false)=>{
    if(!held)return
    const {resident,origin,valid,overSinkhole}=held
    if(!cancelled&&overSinkhole){expel(resident);sinkhole.close(650)}
    else{
      resident.normal.copy(cancelled?origin:valid??origin);resident.lift=0
      resident.pauseUntil=performance.now()+800;orient(resident);sinkhole.close()
    }
    held=null;ring.visible=false;canvas.style.cursor='grab';sinkhole.hover(false);notify()
  }
  const resetPointer=(cancelled=false)=>{
    clearPress();const id=pointer?.id;pointer=null;drop(cancelled)
    if(id!==undefined&&canvas.hasPointerCapture(id))canvas.releasePointerCapture(id)
  }
  const grab=(resident:Resident)=>{
    if(falling||!residents.includes(resident))return
    resident.meeting=null
    if(follow){world.quaternion.setFromUnitVectors(resident.normal,new THREE.Vector3(0,0,1));setFollow(null)}
    held={resident,origin:resident.normal.clone(),valid:resident.normal.clone(),overSinkhole:false};resident.lift=.23
    // Search concentric rings around THIS resident, not a fixed screen corner.
    // Keep the complete enlarged rim clear of scenery, coast and other feet.
    // The origin is outside the opening, so a stationary release is harmless.
    const inverse=world.quaternion.clone().invert(),origin=resident.normal
    const right=new THREE.Vector3(1,0,0).applyQuaternion(inverse).projectOnPlane(origin).normalize()
    if(right.lengthSq()<.001)right.copy(meetingRight).projectOnPlane(origin).normalize()
    const around=new THREE.Vector3().crossVectors(origin,right).normalize()
    const rimAngle=sinkhole.outerRadius/(radius+surface(origin).height)
    let spot:THREE.Vector3|null=null,score=Infinity
    for(let ringIndex=0;ringIndex<8&&!spot;ringIndex++)for(let j=0;j<32;j++){
      const angle=j/32*Math.PI*2-.5,offset=rimAngle+.083+ringIndex*.035
      const candidate=origin.clone().addScaledVector(right,Math.cos(angle)*offset).addScaledVector(around,Math.sin(angle)*offset).normalize()
      if(!safe(candidate,resident)||obstacles.some(o=>candidate.distanceTo(o.normal)<o.radius+rimAngle+.018)
        ||residents.some(r=>r!==resident&&r.normal.distanceTo(candidate)<rimAngle+.065))continue
      const worldPoint=candidate.clone().multiplyScalar(radius+surface(candidate).height).applyQuaternion(world.quaternion)
      if(worldPoint.clone().normalize().dot(camera.position.clone().sub(worldPoint).normalize())<.2)continue
      const edgeRight=right.clone().projectOnPlane(candidate).normalize(),edgeUp=new THREE.Vector3().crossVectors(candidate,edgeRight)
      if(Array.from({length:12},(_,k)=>k*Math.PI/6).some(a=>surface(candidate.clone().addScaledVector(edgeRight,Math.cos(a)*rimAngle).addScaledVector(edgeUp,Math.sin(a)*rimAngle).normalize()).bank<.035))continue
      const next=candidate.distanceTo(origin)+.015*(1-Math.cos(angle+.5))
      if(next<score){score=next;spot=candidate}
    }
    if(spot)sinkhole.show(spot)
    canvas.style.cursor='grabbing';ring.visible=true;ringMaterial.color.set('#ffe366');notify()
  }
  const moveHeld=(x:number,y:number)=>{
    if(!held)return
    setRay(x,y);const hit=ray.intersectObject(terrain,false)[0]
    if(!hit){const changed=held.overSinkhole;held.overSinkhole=false;held.valid=null;sinkhole.hover(false);ringMaterial.color.set('#f86e62');if(changed)notify();return}
    const normal=world.worldToLocal(hit.point.clone()).normalize()
    const wasOver=held.overSinkhole;held.overSinkhole=sinkhole.contains(normal)
    held.valid=held.overSinkhole?null:nearestSafe(normal,held.resident)
    held.resident.normal.copy(held.overSinkhole?sinkhole.normal:held.valid??normal)
    ringMaterial.color.set(held.overSinkhole?'#ff674d':held.valid?'#ffe366':'#f86e62');sinkhole.hover(held.overSinkhole)
    if(wasOver!==held.overSinkhole)notify()
  }
  const onDown=(event:PointerEvent)=>{
    if(!enabled||event.button!==0||pointer)return
    const resident=pick(event.clientX,event.clientY)
    pointer={id:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,distance:0,resident,dragging:false}
    canvas.setPointerCapture(event.pointerId)
    if(resident)pressTimer=window.setTimeout(()=>{if(pointer&&!pointer.dragging)grab(resident)},450)
  }
  const onMove=(event:PointerEvent)=>{
    if(!enabled||!pointer||pointer.id!==event.pointerId)return
    const dx=event.clientX-pointer.x,dy=event.clientY-pointer.y
    pointer.distance=Math.max(pointer.distance,Math.hypot(event.clientX-pointer.startX,event.clientY-pointer.startY))
    if(held)moveHeld(event.clientX,event.clientY)
    else if(pointer.distance>7){
      pointer.dragging=true;clearPress()
      if(follow){yaw-=dx*.008;pitch=THREE.MathUtils.clamp(pitch+dy*.006,.08,1.18)}
      else if(Math.hypot(dx,dy)>0)world.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(dy,dx,0).normalize(),Math.hypot(dx,dy)*.006))
    }
    pointer.x=event.clientX;pointer.y=event.clientY
  }
  const onUp=(event:PointerEvent)=>{
    if(!pointer||pointer.id!==event.pointerId)return
    if(held)moveHeld(event.clientX,event.clientY)
    const click=!pointer.dragging&&!held,selected=pointer.resident
    resetPointer()
    if(!click)return
    if(selected){setFollow(follow===selected?null:selected);return}
    setRay(event.clientX,event.clientY);const hit=ray.intersectObjects([terrain,...targets],false)[0]
    if(hit?.object.userData.id)options.select(hit.object.userData.id)
  }
  const onCancel=(event:PointerEvent)=>{if(pointer?.id===event.pointerId)resetPointer(true)}
  const onWheel=(event:WheelEvent)=>{
    event.preventDefault();if(!enabled||held)return
    if(follow)distance=THREE.MathUtils.clamp(distance*Math.exp(event.deltaY*.001),.8,2.8)
    else globeTargetZoom=THREE.MathUtils.clamp(globeTargetZoom*Math.exp(-event.deltaY*.001),.7,2.7)
  }
  canvas.addEventListener('pointerdown',onDown);canvas.addEventListener('pointermove',onMove);canvas.addEventListener('pointerup',onUp)
  canvas.addEventListener('pointercancel',onCancel);canvas.addEventListener('lostpointercapture',onCancel)
  canvas.addEventListener('wheel',onWheel,{passive:false});canvas.addEventListener('contextmenu',event=>event.preventDefault())

  const assignMeeting=()=>{
    const slots:THREE.Vector3[]=[]
    // Unique, staggered concentric slots; all residents face the clearing centre.
    for(let ringIndex=1;ringIndex<16&&slots.length<residents.length;ringIndex++){
      const r=.145+(ringIndex-1)*.122,count=Math.floor(Math.PI*2*r/.132)
      for(let i=0;i<count&&slots.length<residents.length;i++){
        const angle=i/count*Math.PI*2+(ringIndex%2)*.25
        const point=clearing.clone().addScaledVector(meetingRight,Math.cos(angle)*r).addScaledVector(meetingForward,Math.sin(angle)*r).normalize()
        if(safe(point,undefined,false)&&slots.every(slot=>slot.distanceTo(point)>spacing))slots.push(point)
      }
    }
    const now=performance.now()
    residents.forEach((resident,i)=>{
      if(slots[i])resident.meeting={from:resident.normal.clone(),to:slots[i],started:now+i*65,duration:1800+resident.normal.angleTo(slots[i])*1350}
    })
  }
  const toggleMeeting=()=>{
    if(!enabled||!residents.length)return false
    resetPointer(true);meeting=!meeting
    if(meeting){setFollow(null);world.quaternion.setFromUnitVectors(clearing,new THREE.Vector3(0,0,1));globeTargetZoom=1.3;assignMeeting()}
    else residents.forEach(resident=>{
      const trip=resident.meeting
      if(trip){const landing=nearestSafe(resident.normal,resident)??nearestSafe(trip.to,resident)??trip.from;resident.normal.copy(landing)}
      resident.meeting=null;resident.lift=0;resident.turnAt=0;resident.pauseUntil=performance.now()+Math.random()*1300
    })
    notify();return meeting
  }
  const add=(model:ResidentModel,normal:THREE.Vector3)=>{
    if(options.prepare&&!options.prepare(model)){model.dispose();return false}
    model.id??=model.group.uuid
    if(residents.some(r=>r.model.id===model.id))return false
    const resident:Resident={model,normal:normal.clone(),tangent:tangentAt(normal),turnAt:0,pauseUntil:performance.now()+700,speed:.024+Math.random()*.016,lift:0,meeting:null}
    const place=nearestSafe(normal,resident);if(place)resident.normal.copy(place)
    world.add(model.group);residents.push(resident);orient(resident)
    if(meeting)assignMeeting();notify();return true
  }
  const update=(now:number,dt:number,fitDistance:number)=>{
    sinkhole.update(now,dt)
    if(falling){
      const {resident,normal,started}=falling,t=THREE.MathUtils.clamp((now-started)/950,0,1)
      resident.normal.copy(normal);resident.lift=THREE.MathUtils.lerp(.23,-.5,t*t);orient(resident)
      resident.model.group.scale.setScalar(.24*(1-t)**.8)
      resident.model.group.rotateY(t*Math.PI*1.3);resident.model.animate(now,false,'held')
      if(t>=1){resident.model.dispose();falling=null}
    }
    for(const resident of residents){
      let walking=false
      if(held?.resident===resident)resident.lift=.23+Math.sin(now*.012)*.012
      else if(resident.meeting){
        const destination=resident.meeting,t=THREE.MathUtils.clamp((now-destination.started)/destination.duration,0,1)
        if(t<1){
          // A travel hop clears rivers and scenery. Only validated slots land.
          const ease=t*t*(3-2*t)
          rotation.setFromUnitVectors(destination.from,destination.to)
          resident.normal.copy(destination.from).applyQuaternion(interpolatedRotation.identity().slerp(rotation,ease))
          resident.lift=Math.sin(t*Math.PI)*.85
          resident.tangent.copy(destination.to).projectOnPlane(resident.normal).normalize();walking=true
        }else{
          resident.normal.copy(destination.to);resident.lift=0
          resident.tangent.copy(clearing).projectOnPlane(resident.normal).normalize()
          resident.tangent.applyAxisAngle(resident.normal,Math.sin(now*.0007+residents.indexOf(resident))*.08)
        }
      }else{
        if(now>resident.turnAt){resident.tangent.applyAxisAngle(resident.normal,(Math.random()-.5)*1.5);resident.turnAt=now+2000+Math.random()*5500;if(Math.random()<.2)resident.pauseUntil=now+600+Math.random()*1200}
        walking=now>resident.pauseUntil
        if(walking){
          const next=nextNormal.copy(resident.normal).addScaledVector(resident.tangent,dt*resident.speed).normalize()
          if(!safe(next,resident)){resident.tangent.applyAxisAngle(resident.normal,.9+Math.random());walking=false}
          else resident.normal.copy(next)
        }
      }
      orient(resident)
      resident.model.animate(now,walking,held?.resident===resident?'held':resident.meeting&&!walking?'meeting':'normal')
    }
    if(held){ring.position.copy(held.resident.normal).multiplyScalar(radius+surface(held.resident.normal).height+.023);ring.quaternion.setFromUnitVectors(forward,held.resident.normal)}
    globeZoom=THREE.MathUtils.damp(globeZoom,globeTargetZoom,9,dt)
    desiredPosition.set(0,0,fitDistance/globeZoom);desiredUp.copy(up);desiredTarget.set(0,0,0)
    if(follow){
      // Only this parent transform is needed; the renderer updates descendants
      // once later. Traversing the entire planet here doubled follow-mode work.
      world.updateWorldMatrix(true,false)
      const normal=followNormal.copy(follow.normal).applyQuaternion(world.quaternion),forward=followForward.copy(follow.tangent).applyQuaternion(world.quaternion)
      const right=followRight.crossVectors(normal,forward).normalize()
      desiredTarget.copy(follow.model.group.position).applyMatrix4(world.matrixWorld).addScaledVector(normal,.23)
      desiredPosition.copy(desiredTarget).addScaledVector(forward,Math.cos(yaw)*Math.cos(pitch)*distance)
        .addScaledVector(right,Math.sin(yaw)*Math.cos(pitch)*distance).addScaledVector(normal,Math.sin(pitch)*distance)
      desiredUp.copy(normal)
    }
    const mix=1-Math.exp(-dt*(transitioning?7:14))
    camera.position.lerp(desiredPosition,mix)
    // Transitions from the far hemisphere must not cut through the planet.
    if(camera.position.lengthSq()<1e-8)camera.position.copy(desiredPosition).normalize().multiplyScalar(radius+.24)
    else if(camera.position.length()<radius+.24)camera.position.setLength(radius+.24)
    lookTarget.lerp(desiredTarget,mix)
    rotation.setFromUnitVectors(camera.up,desiredUp)
    camera.up.applyQuaternion(interpolatedRotation.identity().slerp(rotation,mix)).normalize();camera.lookAt(lookTarget)
    if(camera.position.distanceTo(desiredPosition)<.015)transitioning=false
  }
  return {
    add,update,toggleMeeting,refresh:notify,
    get residents(){return residents},get state(){return state()},
    get sinkhole(){return sinkhole},
    safePosition:(point:THREE.Vector3)=>nearestSafe(point),
    reset:()=>{resetPointer(true);setFollow(null);globeTargetZoom=1;world.rotation.set(-.08,.30,-.10)},
    setEnabled:(value:boolean)=>{enabled=value;if(!value){resetPointer(true);setFollow(null)}},
    suspend:()=>{resetPointer(true);if(falling){falling.resident.model.dispose();falling=null}sinkhole.hide();setFollow(null);enabled=false;suspendedAt=performance.now()},
    resume:()=>{enabled=true;if(suspendedAt){residents.forEach(r=>{if(r.meeting)r.meeting.started+=performance.now()-suspendedAt});suspendedAt=0}},
  }
}
