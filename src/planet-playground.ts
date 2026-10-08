import * as THREE from 'three'
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js'
import {paintedFinish} from './planet-console-materials'
import type {VillageObstacle} from './planet-village'

/** A ground-following toy playground. Furniture stays outside the meeting circle;
 * every raised prop registers a navigation/drop/sinkhole exclusion. */
export function createPlanetPlayground(world:THREE.Group,center:THREE.Vector3,radius:number,
  surface:(p:THREE.Vector3)=>{height:number},obstacles:VillageObstacle[]) {
  const playground=new THREE.Group();playground.name='neighborhood-playground';world.add(playground)
  const up=new THREE.Vector3(0,1,0),right=new THREE.Vector3().crossVectors(up,center).normalize(),forward=new THREE.Vector3().crossVectors(center,right).normalize()
  const point=(x:number,z:number)=>center.clone().addScaledVector(right,x/radius).addScaledVector(forward,z/radius).normalize()
  const materials=new Map<string,THREE.MeshPhysicalMaterial>()
  const mat=(color:string)=>{
    if(!materials.has(color)){
      const material=new THREE.MeshPhysicalMaterial({color,roughness:.35,clearcoat:.38,clearcoatRoughness:.30})
      paintedFinish(material,'paint');materials.set(color,material)
    }
    return materials.get(color)!
  }
  const sphere=new THREE.SphereGeometry(1,24,16),cube=new RoundedBoxGeometry(1,1,1,3,.12)
  const mesh=(parent:THREE.Object3D,geometry:THREE.BufferGeometry,color:string,pos:number[],scale=[1,1,1])=>{
    const item=new THREE.Mesh(geometry,mat(color));item.position.set(...pos as [number,number,number]);item.scale.set(...scale as [number,number,number]);item.castShadow=true;item.receiveShadow=true;parent.add(item);return item
  }
  const rod=(parent:THREE.Object3D,a:number[],b:number[],r:number,color:string)=>{
    const from=new THREE.Vector3(...a as [number,number,number]),to=new THREE.Vector3(...b as [number,number,number]),d=to.clone().sub(from)
    const m=mesh(parent,new THREE.CylinderGeometry(r,r,d.length(),20),color,from.add(to).multiplyScalar(.5).toArray());m.quaternion.setFromUnitVectors(up,d.normalize());return m
  }
  const station=(name:string,x:number,z:number,footprint:number,angle=0)=>{
    const normal=point(x,z),group=new THREE.Group();group.name=name
    const size=name==='playground-slide'?.72:name==='playground-swings'?.84:name==='playground-sign'?.80:1
    group.scale.setScalar(size);group.userData.propScale=size
    group.userData.groundNormal=normal.toArray();group.userData.footprint=footprint/radius
    group.position.copy(normal).multiplyScalar(radius+surface(normal).height+.012)
    const facing=center.clone().projectOnPlane(normal).normalize(),side=new THREE.Vector3().crossVectors(normal,facing).normalize()
    group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side,normal,facing));group.rotateY(angle);playground.add(group)
    obstacles.push({normal,radius:footprint/radius});return group
  }
  // Paint is conformed to the same ground used by the residents, not a floating
  // platform. Flat triangles keep the chunky console-era course silhouette.
  const vertices:number[]=[],colors:number[]=[],indices:number[]=[],uvs:number[]=[]
  const rings=28,segments=96,outer=1.65,extent=1.82
  for(let ring=0;ring<=rings;ring++)for(let i=0;i<=segments;i++){
    const a=i/segments*Math.PI*2,r=outer*(1+.055*Math.sin(a*3)+.035*Math.cos(a*5))*ring/rings,x=Math.cos(a)*r,z=Math.sin(a)*r,p=point(x,z)
    vertices.push(...p.multiplyScalar(radius+surface(p).height+.007).toArray())
    uvs.push((x/extent+1)/2,(z/extent+1)/2)
    const tint=ring===rings?'#b89864':'#ffffff'
    colors.push(...new THREE.Color(tint).toArray())
  }
  for(let r=0;r<rings;r++)for(let i=0;i<segments;i++){const a=r*(segments+1)+i,b=a+segments+1;indices.push(a,b,a+1,b,b+1,a+1)}
  const ground=new THREE.BufferGeometry();ground.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));ground.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));ground.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));ground.setIndex(indices);ground.computeVertexNormals()
  const floorCanvas=document.createElement('canvas');floorCanvas.width=floorCanvas.height=768
  const floor=floorCanvas.getContext('2d')!
  const uv=(x:number,z:number)=>[(x/extent+1)*384,(1-z/extent)*384]
  floor.fillStyle='#cbb486';floor.fillRect(0,0,768,768)
  // Sand/compacted earth in the open meeting area, poured-rubber safety islands
  // below the equipment. The grain is procedural material detail, not a photo.
  const patch=(x:number,z:number,rx:number,rz:number,color:string)=>{const [u,v]=uv(x,z);floor.fillStyle=color;floor.beginPath();floor.ellipse(u,v,rx/extent*384,rz/extent*384,-.2,0,Math.PI*2);floor.fill()}
  patch(-1.03,.66,.52,.62,'#c76d49');patch(.81,.83,.61,.41,'#4e9991');patch(1.12,-.47,.39,.48,'#bf9650')
  floor.strokeStyle='#e4ce9d';floor.lineWidth=54;floor.lineCap='round';floor.beginPath();floor.moveTo(...uv(.10,-1.70) as [number,number]);floor.bezierCurveTo(...[...uv(-.12,-.90),...uv(-.38,-.45),...uv(-.34,.12)] as [number,number,number,number,number,number]);floor.stroke()
  let seed=167;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}
  for(let i=0;i<42000;i++){floor.fillStyle=i%3===0?'#fff2cc36':'#694c2826';const s=.4+random()*1.4;floor.fillRect(random()*768,random()*768,s,s)}
  // Painted hopscotch near the entrance, away from the gathering rings.
  floor.strokeStyle='#fff0c6';floor.lineWidth=2.5;floor.font='bold 12px Arial';floor.textAlign='center'
  for(let i=0;i<5;i++){const [u,v]=uv(-.38+(i%2)*.13,-1.20+i*.10);floor.strokeRect(u-10,v-10,20,20);floor.fillStyle='#fff0c6';floor.fillText(String(i+1),u,v+4)}
  const floorTexture=new THREE.CanvasTexture(floorCanvas);floorTexture.colorSpace=THREE.SRGBColorSpace;floorTexture.anisotropy=4
  const court=new THREE.Mesh(ground,new THREE.MeshStandardMaterial({map:floorTexture,vertexColors:true,roughness:.98,side:THREE.DoubleSide}));court.name='playground-court';court.receiveShadow=true;playground.add(court)

  const slide=station('playground-slide',-1.12,.75,.46,-.20)
  for(const x of [-.14,.14])for(const z of [-.12,.12])rod(slide,[x,0,z],[x,.48,z],.025,'#138bc5')
  mesh(slide,cube,'#ffce38',[0,.49,0],[.35,.055,.32])
  for(let i=0;i<4;i++)rod(slide,[-.14,.10+i*.10,-.18],[.14,.10+i*.10,-.18],.018,'#fff4d4')
  for(const x of [-.19,.19])rod(slide,[x,.49,-.14],[x,.78,-.14],.021,'#ef5750')
  rod(slide,[-.19,.78,-.14],[.19,.78,-.14],.027,'#ef5750')
  for(const x of [-.18,.18])for(const z of [-.14,.14])rod(slide,[x,.48,z],[x,.84,z],.022,'#edc37b')
  const roof=mesh(slide,new THREE.ConeGeometry(.32,.23,4),'#277db6',[0,.91,0]);roof.rotation.y=Math.PI/4
  // Pitched-roof seams, contrasting fascia and rounded bolt heads make this a
  // modelled play structure, rather than an unadorned cone and plank.
  for(const x of [-.22,.22])for(const z of [-.22,.22]){
    rod(slide,[x,.797,z],[0,1.025,0],.008,'#7ee1f0')
    mesh(slide,sphere,'#ffdc26',[x,.795,z],[.026,.026,.026])
  }
  for(const z of [-.22,.22])rod(slide,[-.22,.798,z],[.22,.798,z],.018,'#075aa3')
  for(const x of [-.22,.22])rod(slide,[x,.798,-.22],[x,.798,.22],.018,'#075aa3')
  const slidePath=new THREE.CatmullRomCurve3([new THREE.Vector3(0,.51,.10),new THREE.Vector3(0,.43,.25),new THREE.Vector3(0,.16,.46),new THREE.Vector3(0,.067,.59),new THREE.Vector3(0,.06,.70)])
  const chuteVertices:number[]=[],chuteIndices:number[]=[],chuteSteps=40
  for(let i=0;i<=chuteSteps;i++){
    const p=slidePath.getPoint(i/chuteSteps)
    for(const [x,y] of [[-.15,0],[.15,0],[.15,-.027],[-.15,-.027]])chuteVertices.push(x,p.y+y,p.z)
    if(i<chuteSteps)for(let side=0;side<4;side++){
      const a=i*4+side,b=i*4+(side+1)%4
      chuteIndices.push(a,a+4,b,b,a+4,b+4)
    }
  }
  chuteIndices.push(0,1,2,0,2,3)
  const end=chuteSteps*4;chuteIndices.push(end,end+2,end+1,end,end+3,end+2)
  const chuteGeometry=new THREE.BufferGeometry();chuteGeometry.setAttribute('position',new THREE.Float32BufferAttribute(chuteVertices,3));chuteGeometry.setIndex(chuteIndices);chuteGeometry.computeVertexNormals()
  const chute=mesh(slide,chuteGeometry,'#ffcc27',[0,0,0]);chute.name='rounded-slide-chute'
  for(const x of [-.17,.17]){
    const path=new THREE.CatmullRomCurve3(slidePath.points.map(p=>new THREE.Vector3(x,p.y+.035,p.z)))
    mesh(slide,new THREE.TubeGeometry(path,40,.027,12,false),'#f7663b',[0,0,0])
    mesh(slide,sphere,'#f7663b',[x,.095,.70],[.027,.027,.027])
  }
  mesh(slide,sphere,'#ffcc27',[0,.045,.70],[.17,.033,.09])

  const swing=station('playground-swings',.75,1.07,.39,.05)
  for(const x of [-.28,.28])for(const z of [-.17,.17])rod(swing,[x,0,z],[x,.64,0],.033,'#ed564d')
  rod(swing,[-.34,.65,0],[.34,.65,0],.044,'#ffca32')
  for(const x of [-.34,.34])mesh(swing,sphere,'#0769ba',[x,.65,0],[.053,.054,.054])
  for(const x of [-.28,.28])for(const z of [-.17,.17])mesh(swing,sphere,'#ffce25',[x,.021,z],[.060,.030,.060])
  const seats:THREE.Group[]=[]
  for(const x of [-.14,.14]){
    const pivot=new THREE.Group();pivot.position.set(x,.61,0);swing.add(pivot);seats.push(pivot)
    for(const side of [-.065,.065])rod(pivot,[side,0,0],[side,-.40,0],.009,'#e3f8ff')
    mesh(pivot,cube,'#128dcd',[0,-.42,0],[.18,.04,.14])
  }
  const seesaw=station('playground-seesaw',1.18,-.40,.34,.95)
  mesh(seesaw,new THREE.CylinderGeometry(.04,.12,.18,12),'#ffbf2e',[0,.09,0])
  const plank=mesh(seesaw,cube,'#aa61d9',[0,.20,0],[.57,.04,.13]);plank.rotation.z=.13
  for(const side of [-1,1]){
    mesh(seesaw,sphere,'#f6d537',[side*.24,.22+side*.03,0],[.095,.025,.08])
    rod(seesaw,[side*.18,.22+side*.03,0],[side*.18,.34+side*.03,0],.017,'#f1fff4')
    rod(seesaw,[side*.18,.34+side*.03,-.065],[side*.18,.34+side*.03,.065],.017,'#f1fff4')
  }
  for(const [x,z,angle] of [[-.91,-1.04,.12],[-.42,-1.38,-.08]]){
    const bench=station('playground-bench',x,z,.25,angle)
    for(let i=0;i<3;i++)mesh(bench,cube,i%2?'#087e88':'#16a1ae',[0,.13,-.055+i*.055],[.42,.045,.043])
    for(let i=0;i<2;i++)mesh(bench,cube,i%2?'#087e88':'#16a1ae',[0,.215+i*.07,-.065],[.42,.055,.04])
    for(const s of [-1,1])rod(bench,[s*.15,0,0],[s*.15,.14,0],.023,'#fff3c6')
    for(const s of [-1,1])for(const y of [.215,.285])mesh(bench,sphere,'#ffca2b',[s*.16,y,-.039],[.009,.009,.007])
  }
  const sandbox=station('playground-sandbox',-1.34,-.17,.29,.18)
  mesh(sandbox,cube,'#ead29c',[0,.018,0],[.42,.035,.36])
  for(const z of [-.20,.20])rod(sandbox,[-.25,.04,z],[.25,.04,z],.034,'#ac7746')
  for(const x of [-.25,.25])rod(sandbox,[x,.04,-.2],[x,.04,.2],.034,'#ac7746')
  mesh(sandbox,new THREE.CylinderGeometry(.045,.035,.08,12),'#e85845',[.09,.075,.06])
  mesh(sandbox,new THREE.ConeGeometry(.067,.10,12),'#d6b87b',[-.07,.07,0])
  const sign=station('playground-sign',.73,-1.31,.16,0)
  for(const x of [-.24,.24])rod(sign,[x,0,0],[x,.65,0],.032,'#fff0b8')
  const board=mesh(sign,cube,'#176cbd',[0,.60,0],[.67,.22,.07])
  for(const side of [-1,1])mesh(sign,sphere,'#ffce38',[side*.36,.60,0],[.050,.056,.050])
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='#176cbd';ctx.fillRect(0,0,512,128);ctx.fillStyle='#fff5b3';ctx.font='900 58px Arial';ctx.textAlign='center';ctx.fillText('PLAY CLUB',256,85)
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace
  const label=new THREE.Mesh(new THREE.PlaneGeometry(.62,.17),new THREE.MeshBasicMaterial({map:texture}));label.position.set(0,.60,.038);sign.add(label);board.castShadow=true
  // A short back fence defines the play zone; the front remains an open entrance.
  for(let i=0;i<5;i++){
    const a=.72+i*.17,x=Math.cos(a)*1.66,z=Math.sin(a)*1.66,fence=station('playground-fence',x,z,.08,0)
    for(const side of [-1,1])rod(fence,[side*.09,0,0],[side*.09,.20,0],.018,'#eee0ac')
    rod(fence,[-.12,.12,0],[.12,.12,0],.016,'#d7b97c')
  }
  return {group:playground,court,update:(now:number)=>seats.forEach((seat,i)=>{seat.rotation.x=Math.sin(now*.0013+i)*.12})}
}
