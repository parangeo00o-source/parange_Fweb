import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { cassetteEdition } from './archive-cassette-art'

type TextureFactory = (w:number,h:number,draw:(ctx:CanvasRenderingContext2D)=>void)=>THREE.CanvasTexture
export function createCassetteSurfaceMaps(make:TextureFactory) {
  let seed=4281
  const random=()=>{seed=seed*16807%2147483647;return seed/2147483647}
  const grain=make(512,512,ctx=>{
    const data=ctx.createImageData(512,512)
    for(let i=0;i<data.data.length;i+=4){const v=100+Math.floor(random()*55);data.data[i]=data.data[i+1]=data.data[i+2]=v;data.data[i+3]=255}
    ctx.putImageData(data,0,0)
  })
  const clear=make(1024,1024,ctx=>{
    ctx.fillStyle='#c7c7c7';ctx.fillRect(0,0,1024,1024)
    ctx.lineWidth=.45
    for(let i=0;i<270;i++){const x=random()*1024,y=random()*1024;ctx.strokeStyle=`rgba(255,255,255,${.03+random()*.13})`;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+4+random()*45,y+random()*9);ctx.stroke()}
    // Mold texture is concentrated at the exposed perimeter, leaving the window clear.
    ctx.strokeStyle='#a8a8a8';ctx.lineWidth=.6
    for(let i=0;i<1024;i+=6){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,70);ctx.moveTo(i,800);ctx.lineTo(i,1024);ctx.stroke()}
  })
  for(const map of [grain,clear]){map.colorSpace=THREE.NoColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping}
  grain.repeat.set(4,3)
  return {grain,clear}
}
type CassetteSurfaces = ReturnType<typeof createCassetteSurfaceMaps>

/** Molded cassette shell, actual reels and hardware; only the paper label is printed. */
export function createCassette(index:number, label:THREE.Texture, track:(g:THREE.BufferGeometry,m:THREE.Material)=>void, surfaces?:CassetteSurfaces, geometryCache?:Map<string,THREE.BufferGeometry>) {
  const d=cassetteEdition(index), group=new THREE.Group()
  group.name=`cassette-${String(index+1).padStart(2,'0')}-${d.brand}`
  const shell=new THREE.MeshPhysicalMaterial({color:d.body,metalness:0,roughness:d.clear?.12:.61,roughnessMap:d.clear?surfaces?.clear:surfaces?.grain,bumpMap:d.clear?surfaces?.clear:surfaces?.grain,bumpScale:d.clear?.0007:.0025,clearcoat:d.clear?.65:.12,clearcoatRoughness:.2,envMapIntensity:d.clear?.3:.7,specularIntensity:d.clear?.35:.65,transmission:d.clear?.35:0,transparent:d.clear,opacity:d.clear?.3:1,depthWrite:!d.clear,thickness:.055,ior:1.46,attenuationColor:new THREE.Color(d.body),attenuationDistance:.45})
  const edge=new THREE.MeshPhysicalMaterial({color:d.body,metalness:.08,roughness:d.clear?.23:.48,bumpMap:surfaces?.grain,bumpScale:.001,clearcoat:.35})
  const brown=new THREE.MeshStandardMaterial({color:'#110e0c',roughness:.56,metalness:.06,bumpMap:surfaces?.grain,bumpScale:.0006})
  const hub=new THREE.MeshStandardMaterial({color:d.layout===8?'#84d2db':'#e1e4d4',roughness:.32,metalness:0})
  const chrome=new THREE.MeshStandardMaterial({color:'#adb5b2',metalness:.95,roughness:.22})
  const shadow=new THREE.MeshStandardMaterial({color:'#172326',roughness:.73})
  const paper=new THREE.MeshBasicMaterial({map:label,transparent:true,alphaTest:.15,toneMapped:false})
  const slots={shell,edge,hub,brown,shadow,paper,chrome}
  const geometryKey=(slot:string)=>`${slot}:${slot==='brown'?index%3:0}`
  const finish=()=>{group.userData={edition:index,brand:d.brand,model:d.model,transparent:d.clear};return group}
  const attach=(geometry:THREE.BufferGeometry,material:THREE.Material)=>{
    track(geometry,material);const mesh=new THREE.Mesh(geometry,material)
    mesh.castShadow=!material.transparent && !(material instanceof THREE.MeshPhysicalMaterial && material.transmission>0)
    mesh.receiveShadow=true;group.add(mesh)
  }
  // Every edition shares the exact authored shell/hardware; only three tape
  // pack fill levels differ. Materials and printed labels remain per edition.
  if(geometryCache && Object.keys(slots).every(slot=>geometryCache.has(geometryKey(slot)))){
    for(const [slot,material] of Object.entries(slots))attach(geometryCache.get(geometryKey(slot))!,material)
    return finish()
  }
  const batches=new Map<THREE.Material,THREE.BufferGeometry[]>()
  const matrix=new THREE.Matrix4(), quat=new THREE.Quaternion()
  function add(g:THREE.BufferGeometry,m:THREE.Material,x=0,y=0,z=0,rx=0,ry=0,rz=0){
    quat.setFromEuler(new THREE.Euler(rx,ry,rz));matrix.compose(new THREE.Vector3(x,y,z),quat,new THREE.Vector3(1,1,1));g.applyMatrix4(matrix)
    const plain=g.index?g.toNonIndexed():g;if(plain!==g)g.dispose()
    if(!plain.getAttribute('uv'))plain.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(plain.getAttribute('position').count*2),2))
    const batch=batches.get(m)||[];batch.push(plain);batches.set(m,batch)
  }
  function box(w:number,h:number,t:number,x:number,y:number,z:number,m:THREE.Material,r=.012){add(new RoundedBoxGeometry(w,h,t,3,r),m,x,y,z)}
  function path(w:number,h:number,r:number){const s=new THREE.Shape(),x=-w/2,y=-h/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s}
  function hole(s:THREE.Shape,x:number,y:number,r:number){const p=new THREE.Path();p.absarc(x,y,r,0,Math.PI*2,true);s.holes.push(p)}
  const front=path(2.7,1.7,.085)
  for(const x of [-.5076,.5076])hole(front,x,.056,.204)
  const aperture=new THREE.Path();aperture.moveTo(-.22,-.012);aperture.lineTo(-.22,.15);aperture.lineTo(.22,.15);aperture.lineTo(.22,-.012);aperture.closePath();front.holes.push(aperture)
  for(const x of [-.69,-.4,.4,.69])hole(front,x,-.71,.045)
  const extrude={depth:.038,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.009,bevelThickness:.006,curveSegments:48}
  const face=new THREE.ExtrudeGeometry(front,extrude)
  const uv=face.getAttribute('uv')
  for(let i=0;i<uv.count;i++)uv.setXY(i,(uv.getX(i)+1.35)/2.7,(uv.getY(i)+.85)/1.7)
  add(face,shell,0,0,.065)
  add(new THREE.ExtrudeGeometry(front,extrude),edge,0,0,-.14)
  // Shell seam, perimeter lips and locating tabs.
  for(const y of [-.82,.82]){box(2.52,.045,.22,0,y,-.012,edge);box(2.47,.012,.018,0,y,.117,hub,.004)}
  for(const x of [-1.32,1.32])box(.04,1.5,.22,x,0,-.012,edge)
  for(const x of [-.96,.96])box(.19,.045,.06,x,.84,.08,edge)
  // Two tape packs have different fill levels, visible through clear ABS.
  for(const [i,x] of [-.5076,.5076].entries()){
    const radius=i===0?.56+(index%3)*.012:.4-(index%3)*.01
    const pack=new THREE.Shape();pack.absarc(0,0,radius,0,Math.PI*2,false);hole(pack,0,0,.18)
    add(new THREE.ExtrudeGeometry(pack,{depth:.065,bevelEnabled:false,curveSegments:48}),brown,x,.056,-.062)
    for(let k=0;k<12;k++)add(new THREE.TorusGeometry(radius-k*.019,.0009,3,96),brown,x,.056,.005)
    add(new THREE.CircleGeometry(.137,32),shadow,x,.056,.035)
    const reel=new THREE.Shape();reel.absarc(0,0,.238,0,Math.PI*2,false);const spindle=new THREE.Path()
    for(let k=0;k<=60;k++){const a=-k*Math.PI/30,r=k%10>=3&&k%10<=6?.114:.138;const x=Math.cos(a)*r,y=Math.sin(a)*r;if(k===0)spindle.moveTo(x,y);else spindle.lineTo(x,y)}
    spindle.closePath();reel.holes.push(spindle)
    for(let k=0;k<12;k++){const a=k*Math.PI/6;hole(reel,Math.sin(a)*.193,Math.cos(a)*.193,.013)}
    add(new THREE.ExtrudeGeometry(reel,{depth:.026,bevelEnabled:true,bevelSize:.002,bevelThickness:.002,bevelSegments:2,curveSegments:32}),hub,x,.056,.088)
    add(new THREE.TorusGeometry(.226,.008,10,64),hub,x,.056,.121)
    add(new THREE.TorusGeometry(.151,.003,8,64),hub,x,.056,.117)

  }
  box(.45,.025,.018,0,-.057,.018,brown,.004)
  // Paper sits on top of the molding; its die-cut window exposes the hubs.
  add(new THREE.PlaneGeometry(2.7,1.7),paper,0,0,.139)
  // Raised trapezoid protects the magnetic head and capstan openings.
  const lower=new THREE.Shape();lower.moveTo(-.94,-.82);lower.lineTo(-.82,-.48);lower.lineTo(.82,-.48);lower.lineTo(.94,-.82);lower.closePath()
  for(const x of [-.69,-.4,.4,.69])hole(lower,x,-.71,.047)
  add(new THREE.ExtrudeGeometry(lower,{...extrude,depth:.045}),shell,0,0,.109)
  box(.32,.1,.025,0,-.755,.12,shadow,.01);box(.2,.045,.03,0,-.749,.142,chrome,.003)
  for(let i=0;i<7;i++)box(1.3,.004,.004,0,-.555-i*.014,.166,edge,.001)
  // Five metal screws with inset slotted heads.
  for(const [x,y] of [[-1.24,.75],[1.24,.75],[-1.24,-.75],[1.24,-.75],[0,-.52]]){
    add(new THREE.CircleGeometry(.047,32),shadow,x,y,.153)
    add(new THREE.CylinderGeometry(.03,.036,.018,32),chrome,x,y,.162,Math.PI/2)
    add(new THREE.BoxGeometry(.05,.008,.006),shadow,x,y,.174,0,0,.6)
  }
  // Fine injection ribs and the head-edge's two guide rollers.
  for(let i=0;i<15;i++)for(const x of [-1.265,1.265])box(.025,.011,.008,x,-.4+i*.063,.115,edge,.003)
  for(const x of [-1.04,1.04]){add(new THREE.RingGeometry(.025,.07,20),hub,x,-.68,.126);add(new THREE.TorusGeometry(.06,.008,6,20),edge,x,-.68,.145)}
  for(const [m,gs] of batches){
    const merged=mergeGeometries(gs,false)!;gs.forEach(g=>g.dispose())
    const slot=Object.entries(slots).find(([,material])=>material===m)![0],key=geometryKey(slot)
    let geometry=geometryCache?.get(key)
    if(geometry)merged.dispose()
    else{geometry=merged;geometryCache?.set(key,geometry)}
    attach(geometry,m)
  }
  return finish()
}
