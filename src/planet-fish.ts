import * as THREE from 'three'
import {islandBank} from './planet-coast'
import {WATER_LEVEL,waterSwell} from './planet-water'

const up=new THREE.Vector3(0,1,0),forward=new THREE.Vector3(0,0,1)
const direction=(lat:number,lon:number)=>new THREE.Vector3(Math.cos(lat)*Math.sin(lon),Math.sin(lat),Math.cos(lat)*Math.cos(lon))

/** Real fish volumes below translucent water; no silhouettes pasted on the sky
 * or ground. Closed patrols are checked against the same coast as navigation. */
export function createPlanetFish(world:THREE.Group,radius:number) {
  const group=new THREE.Group();group.name='coastal-fish';world.add(group)
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)')
  const ball=new THREE.SphereGeometry(1,16,10)
  const silhouette=new THREE.MeshBasicMaterial({color:'#073b49'})
  const scales=new THREE.MeshStandardMaterial({color:'#70babe',roughness:.42,metalness:.16})
  const finShade=new THREE.MeshStandardMaterial({color:'#e6ad55',roughness:.55})
  const eyes=new THREE.MeshBasicMaterial({color:'#152c40'})
  const splashShade=new THREE.MeshBasicMaterial({color:'#d1fff2',transparent:true,opacity:.8,depthWrite:false})
  const finGeometry=new THREE.BufferGeometry()
  // A thick, closed forked tail, readable even when submerged.
  finGeometry.setAttribute('position',new THREE.Float32BufferAttribute([
    0,0,0, -.032,0,-.040, 0,.006,-.030, .032,0,-.040, 0,-.006,-.030,
  ],3));finGeometry.setIndex([0,1,2,0,2,3,0,3,4,0,4,1,1,4,2,2,4,3]);finGeometry.computeVertexNormals()
  const ellipse=(name:string,parent:THREE.Object3D,shade:THREE.Material,p:number[],s:number[])=>{
    const mesh=new THREE.Mesh(ball,shade);mesh.name=name;mesh.position.set(...p as [number,number,number]);mesh.scale.set(...s as [number,number,number]);parent.add(mesh);return mesh
  }
  const fish:Array<{
    root:THREE.Group;tail:THREE.Group;parts:THREE.Mesh[];ripple:THREE.Mesh<THREE.RingGeometry,THREE.MeshBasicMaterial>;
    drops:THREE.Group;normal:THREE.Vector3;east:THREE.Vector3;north:THREE.Vector3;phase:number;speed:number;
  }>=[]
  for(let i=0;i<14;i++){
    // Ten fish spread along the front bay, four in the far-side lagoon.
    const normal=i<10?direction(-.88-(i%3)*.075,(i-4.5)*.105):direction(.16+(i%2)*.065,2.77+Math.floor((i-10)/2)*.10)
    const east=new THREE.Vector3().crossVectors(up,normal).normalize(),north=new THREE.Vector3().crossVectors(normal,east).normalize()
    const point=(t:number)=>normal.clone().addScaledVector(east,.053*Math.cos(t)).addScaledVector(north,.035*Math.sin(t)).normalize()
    if(Array.from({length:96},(_,j)=>islandBank(point(j/96*Math.PI*2))).some(bank=>bank>-.075))continue
    const root=new THREE.Group();root.name=`coastal-fish-${i}`;group.add(root)
    const body=ellipse('fish-body',root,silhouette,[0,0,0],[.020,.010,.052])
    const tail=new THREE.Group();tail.position.z=-.043;root.add(tail)
    const fin=new THREE.Mesh(finGeometry,silhouette);fin.name='fish-tail';tail.add(fin)
    const parts=[body,fin]
    for(const side of [-1,1]){
      const pectoral=ellipse('fish-fin',root,silhouette,[side*.018,-.002,-.003],[.011,.003,.016]);pectoral.rotation.y=side*.7;parts.push(pectoral)
      const eye=ellipse('fish-eye',root,eyes,[side*.012,.006,.033],[.003,.003,.003]);parts.push(eye)
    }
    const ripple=new THREE.Mesh(new THREE.RingGeometry(.93,1,48),new THREE.MeshBasicMaterial({color:'#d1fff2',transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false}))
    ripple.name='fish-landing-ripple';ripple.visible=false;group.add(ripple)
    const drops=new THREE.Group();drops.name='fish-splash';drops.visible=false;group.add(drops)
    for(let j=0;j<8;j++)ellipse('water-droplet',drops,splashShade,[0,0,0],[.006,.011,.006])
    fish.push({root,tail,parts,ripple,drops,normal,east,north,phase:i*2.39996,speed:.22+(i%4)*.025})
  }
  const pointAt=(f:typeof fish[number],t:number)=>{
    const a=f.phase+t*f.speed+.10*Math.sin(t*.31+f.phase)
    return f.normal.clone().addScaledVector(f.east,.053*Math.cos(a)).addScaledVector(f.north,.035*Math.sin(a)).normalize()
  }
  const frame=new THREE.Matrix4(),right=new THREE.Vector3(),tangent=new THREE.Vector3()
  const update=(now:number)=>{
    const time=reduced.matches?0:now*.001,cycle=Math.floor(time/12),beat=time%12
    fish.forEach((f,index)=>{
      const first=cycle%fish.length,second=cycle%3===0&&(first+5)%fish.length===index
      const selected=index===first||second,jumpTime=beat-(second?4.30:4)
      const jumping=!reduced.matches&&selected&&jumpTime>=0&&jumpTime<1.12
      const u=THREE.MathUtils.clamp(jumpTime/1.12,0,1),lift=jumping?.255*Math.sin(Math.PI*u):0
      const n=pointAt(f,time),p=n.clone().multiplyScalar(radius+WATER_LEVEL)
      const waterRadius=radius+WATER_LEVEL+waterSwell(p.x,p.y,p.z,time)
      f.root.position.copy(n).multiplyScalar(waterRadius-.023+lift)
      tangent.copy(pointAt(f,time+.04)).sub(n).projectOnPlane(n).normalize()
      right.crossVectors(n,tangent).normalize();frame.makeBasis(right,n,tangent);f.root.quaternion.setFromRotationMatrix(frame)
      if(jumping)f.root.rotateX(-.65*Math.cos(Math.PI*u))
      f.tail.rotation.y=Math.sin(time*5.5+f.phase)*.32
      const above=lift>.023
      f.parts.forEach(part=>{part.material=above?(part.name==='fish-body'?scales:part.name==='fish-eye'?eyes:finShade):silhouette})
      f.root.userData.underwater=!above;f.root.userData.bank=islandBank(n)
      // Absolute-time splash events cannot accumulate when tabs sleep or modes change.
      const afterLanding=jumpTime-1.12
      const age=afterLanding>=0?afterLanding:jumpTime
      const splashing=!reduced.matches&&selected&&age>=0&&age<1.05&&(afterLanding>=0||jumpTime<.40)
      f.ripple.visible=splashing;f.drops.visible=splashing&&age<.52
      if(splashing){
        const eventTime=time-age,site=pointAt(f,eventTime),base=site.clone().multiplyScalar(radius+WATER_LEVEL)
        f.ripple.position.copy(site).multiplyScalar(radius+WATER_LEVEL+.006+waterSwell(base.x,base.y,base.z,time))
        f.ripple.quaternion.setFromUnitVectors(forward,site);f.ripple.scale.setScalar(.025+age*.15);f.ripple.material.opacity=(1-age/1.05)*.58
        f.drops.position.copy(site).multiplyScalar(radius+WATER_LEVEL+.006);f.drops.quaternion.setFromUnitVectors(up,site)
        f.drops.children.forEach((drop,j)=>{
          const angle=j*Math.PI/4,spread=age*(.09+(j%3)*.035)
          drop.position.set(Math.cos(angle)*spread,Math.max(0,age*(.46+(j%2)*.15)-1.15*age*age),Math.sin(angle)*spread)
          drop.scale.set(.006*(1-age),.011*(1-age),.006*(1-age))
        })
      }
    })
  }
  update(0)
  return {group,fish,pointAt,update,setNight:(night:boolean)=>{
    silhouette.color.set(night?'#245a70':'#073b49');scales.color.set(night?'#6baac9':'#70babe')
    splashShade.color.set(night?'#6bd8ec':'#d1fff2');fish.forEach(f=>f.ripple.material.color.copy(splashShade.color))
  }}
}
