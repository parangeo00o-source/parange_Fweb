import * as THREE from 'three'
import type {VillageObstacle} from './planet-village'

/** Solid bevelled star lanterns, arranged on clear ground, not sky sprites. */
export function createPlanetStarLamps(world:THREE.Group,radius:number,
  surface:(n:THREE.Vector3)=>{height:number;bank:number},clearing:THREE.Vector3,paths:THREE.Vector3[],obstacles:VillageObstacle[]) {
  const group=new THREE.Group();group.name='moonlit-star-garden';group.visible=false;world.add(group)
  const shape=new THREE.Shape()
  for(let i=0;i<10;i++){
    const angle=Math.PI/2+i*Math.PI/5,r=i%2?.48:1
    if(i===0)shape.moveTo(Math.cos(angle)*r,Math.sin(angle)*r);else shape.lineTo(Math.cos(angle)*r,Math.sin(angle)*r)
  }
  shape.closePath()
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:.28,bevelEnabled:true,bevelThickness:.13,bevelSize:.10,bevelSegments:3,curveSegments:12})
  geometry.translate(0,0,-.14)
  const materials=['#ffe68c','#b9f2ff'].map(color=>new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.95,roughness:.48,metalness:0}))
  const canvas=document.createElement('canvas');canvas.width=canvas.height=64
  const context=canvas.getContext('2d')!,gradient=context.createRadialGradient(32,32,0,32,32,32)
  gradient.addColorStop(0,'#ffffffc0');gradient.addColorStop(.22,'#ffffff50');gradient.addColorStop(.6,'#ffffff12');gradient.addColorStop(1,'#ffffff00')
  context.fillStyle=gradient;context.fillRect(0,0,64,64)
  const texture=new THREE.CanvasTexture(canvas)
  const halos=['#ffd567','#89dfff'].map(color=>new THREE.SpriteMaterial({map:texture,color,transparent:true,opacity:.28,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:true}))
  const normals:THREE.Vector3[]=[],lamps:THREE.Group[]=[]
  for(let i=0;i<1800&&lamps.length<24;i++){
    const index=(i*677)%1800,y=1-(index+.5)*2/1800,angle=index*2.39996323
    const n=new THREE.Vector3(Math.sqrt(1-y*y)*Math.cos(angle),y,Math.sqrt(1-y*y)*Math.sin(angle))
    if(surface(n).bank<.09||n.distanceTo(clearing)<.55||paths.some(p=>p.distanceTo(n)<.043)
      ||obstacles.some(o=>o.normal.distanceTo(n)<o.radius+.027)||normals.some(p=>p.distanceTo(n)<.20))continue
    const root=new THREE.Group();root.position.copy(n).multiplyScalar(radius+surface(n).height+.014)
    root.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),n);root.rotateY(index*.71)
    root.userData.groundNormal=n.toArray();group.add(root)
    const lamp=new THREE.Group(),size=lamps.length%4===0?.135:.070+(index%5)*.009
    lamp.position.y=size*1.18;lamp.userData.restHeight=lamp.position.y;root.add(lamp)
    const star=new THREE.Mesh(geometry,materials[lamps.length%3===0?1:0]);star.name='night-star-lantern'
    // Face the local sky so stars read as stars in globe view, rather than
    // becoming luminous edge-on dashes when a randomly spun island rotates.
    star.scale.setScalar(size);star.rotation.x=-Math.PI/2+.08;star.rotation.z=(index%5-2)*.08;lamp.add(star)
    const halo=new THREE.Sprite(halos[lamps.length%3===0?1:0]);halo.name='night-star-halo';halo.scale.setScalar(size*5);lamp.add(halo)
    normals.push(n);lamps.push(lamp)
  }
  group.userData.starCount=lamps.length
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)')
  return {group,setNight:(value:boolean)=>{group.visible=value},update:(now:number)=>{
    if(!group.visible)return
    const t=reduced.matches?0:now*.001
    lamps.forEach((lamp,i)=>{lamp.position.y=lamp.userData.restHeight+(reduced.matches?0:Math.sin(t*.9+i*1.7)*.014);lamp.rotation.y=reduced.matches?0:Math.sin(t*.5+i)*.12})
    materials.forEach((m,i)=>{m.emissiveIntensity=.92+Math.sin(t*.8+i)*.08})
  }}
}
