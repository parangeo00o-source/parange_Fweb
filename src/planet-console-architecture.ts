import * as THREE from 'three'
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js'
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js'
import {consoleCourseMaterial,paintedFinish} from './planet-console-materials'
import type {VillageObstacle} from './planet-village'

type Site={spot:{id:string};normal:THREE.Vector3;facing?:THREE.Vector3}
const up=new THREE.Vector3(0,1,0)
// Short neighbourhood buildings with only two taller skyline accents.
// Shared with destination hit targets; tree crowns span roughly .5–.75 units.
export const landmarkScale:Record<string,number>={home:.68,market:.70,signal:.72,park:.77,dock:.82}
const direction=(lat:number,lon:number)=>new THREE.Vector3(Math.cos(lat)*Math.sin(lon),Math.sin(lat),Math.cos(lat)*Math.cos(lon))

/** Authored, solid console-stage props. Rounded silhouettes are supported by
 * masonry joints, roof tiles, trims, railings and signs, not texture billboards. */
export function createConsoleArchitecture(world:THREE.Group,sites:Site[],radius:number,
  surface:(n:THREE.Vector3)=>{height:number},obstacles:VillageObstacle[]) {
  const materials=new Map<string,THREE.MeshPhysicalMaterial>()
  const nightLights:THREE.PointLight[]=[],pools:THREE.Mesh[]=[]
  const mat=(color:string,stone=false)=>{
    const key=color+stone
    if(!materials.has(key)){
      const material=new THREE.MeshPhysicalMaterial({color,roughness:stone?.74:.34,metalness:0,clearcoat:stone?.06:.38,clearcoatRoughness:.30})
      paintedFinish(material,stone?'stone':'paint');materials.set(key,material)
    }
    return materials.get(key)!
  }
  const sphere=new THREE.SphereGeometry(1,24,16),box=new RoundedBoxGeometry(1,1,1,3,.12),post=new THREE.CylinderGeometry(1,1,1,28)
  const piece=(group:THREE.Object3D,geometry:THREE.BufferGeometry,color:string,pos:number[],scale=[1,1,1],stone=false)=>{
    const mesh=new THREE.Mesh(geometry,mat(color,stone));mesh.position.set(...pos as [number,number,number]);mesh.scale.set(...scale as [number,number,number]);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh
  }
  const rod=(g:THREE.Object3D,a:number[],b:number[],r:number,color:string)=>{
    const start=new THREE.Vector3(...a as [number,number,number]),end=new THREE.Vector3(...b as [number,number,number]),delta=end.clone().sub(start)
    const mesh=piece(g,post,color,start.add(end).multiplyScalar(.5).toArray(),[r,delta.length(),r]);mesh.quaternion.setFromUnitVectors(up,delta.normalize());return mesh
  }
  const pose=(name:string,n:THREE.Vector3,spin=0)=>{
    const group=new THREE.Group();group.name=name;group.position.copy(n).multiplyScalar(radius+surface(n).height)
    group.quaternion.setFromUnitVectors(up,n);group.rotateY(spin);world.add(group);return group
  }
  // Merge static pieces by material inside each prop. Detail need not mean a
  // draw call for each roof tile, rivet, brick, railing or fence slat.
  const batch=(group:THREE.Group)=>{
    group.updateMatrixWorld(true);const inverse=group.matrixWorld.clone().invert(),sets=new Map<THREE.Material,THREE.BufferGeometry[]>(),meshes:THREE.Mesh[]=[]
    group.traverse(child=>{if(child instanceof THREE.Mesh&&!Array.isArray(child.material)){
      const geometry=child.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,child.matrixWorld))
      const set=sets.get(child.material)??[];set.push(geometry);sets.set(child.material,set);meshes.push(child)
    }})
    group.userData.authoredPieces=meshes.length
    for(const mesh of meshes)mesh.removeFromParent()
    for(const [material,geometries] of sets){
      const flat=geometries.map(g=>g.index?g.toNonIndexed():g)
      const geometry=mergeGeometries(flat)!
      const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh)
      new Set([...flat,...geometries]).forEach(g=>g.dispose())
    }
  }
  const ring=(g:THREE.Object3D,r:number,tube:number,y:number,color:string)=>{
    const mesh=piece(g,new THREE.TorusGeometry(r,tube,8,32),color,[0,y,0]);mesh.rotation.x=Math.PI/2;return mesh
  }
  const label=(g:THREE.Object3D,text:string,pos:number[],width:number,bg='#0756b1')=>{
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128
    const ctx=canvas.getContext('2d')!;ctx.fillStyle=bg;ctx.fillRect(0,0,512,128)
    ctx.strokeStyle='#ffdf45';ctx.lineWidth=12;ctx.strokeRect(7,7,498,114)
    ctx.textAlign='center';ctx.font='900 62px Arial';ctx.lineWidth=7;ctx.strokeStyle='#173b69';ctx.strokeText(text,256,87);ctx.fillStyle='#fff7d9';ctx.fillText(text,256,87)
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,width/4),new THREE.MeshBasicMaterial({map:texture}));mesh.position.set(...pos as [number,number,number]);g.add(mesh)
  }
  const brickRing=(g:THREE.Object3D,r:number,y:number,rows:number,count=16,palette=['#c9b688','#b6a175','#ddc997'])=>{
    piece(g,post,'#a49c80',[0,y+rows*.047,0],[r-.006,rows*.094,r-.006],true)
    for(let row=0;row<rows;row++)for(let i=0;i<count;i++){
      const a=(i+(row%2)*.5)*Math.PI*2/count
      const brick=piece(g,box,palette[(i+row)%3],[Math.sin(a)*(r-.025),y+row*.094+.046,Math.cos(a)*(r-.025)],[r*2*Math.PI/count*.97,.090,.073],true);brick.rotation.y=a
    }
  }
  const tiledRoof=(g:THREE.Object3D,r:number,y:number,height:number,color:string)=>{
    // One closed bell-shaped cap with a rolled eave, not a stack of cones or a
    // wire grid. Very shallow shingle joints retain a clean game-prop contour.
    const profile=new THREE.SplineCurve([[0,0],[r-.016,0],[r+.012,.020],[r,.042],[r*.79,height*.32],[r*.53,height*.59],[r*.27,height*.83],[.021,height],[0,height+.014]].map(([x,y])=>new THREE.Vector2(x,y)))
    piece(g,new THREE.LatheGeometry(profile.getPoints(64).map(p=>new THREE.Vector2(Math.max(0,p.x),p.y)),48),color,[0,y,0])
    ring(g,r+.020,.015,y+.019,'#ffce72')
    for(const t of [.50,.64,.77]){
      const p=profile.getPoint(t);ring(g,p.x,.0035,y+p.y,color)
    }
    piece(g,sphere,'#ffcd1b',[0,y+height+.025,0],[.05,.055,.05])
  }
  const porthole=(g:THREE.Object3D,x:number,y:number,z:number,size=.075)=>{
    piece(g,sphere,'#ffc82b',[x,y,z],[size*1.22,size*1.3,.026])
    piece(g,sphere,'#073a68',[x,y,z+.02],[size,size*1.06,.020])
    piece(g,box,'#b4f7ef',[x-size*.25,y+size*.28,z+.036],[size*.28,size*.42,.007])
    // Real mullions retain depth when the window becomes a warm light source.
    piece(g,box,'#ebd8a5',[x,y,z+.042],[size*1.94,.010,.010])
    piece(g,box,'#ebd8a5',[x,y,z+.043],[.010,size*2.02,.010])
    for(const s of [-1,1])piece(g,box,'#fff4c0',[x+s*(size+.03),y,z],[.027,size*2.3,.04])
  }
  for(const {spot,normal,facing} of sites){
    const root=pose(`garden-landmark-${spot.id}`,normal)
    if(facing){
      root.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(normal,facing).normalize(),normal,facing))
      root.userData.entranceDirection=facing.toArray()
    }
    const size=landmarkScale[spot.id]??.72
    root.userData.buildingScale=size
    const g=new THREE.Group();g.position.y=-.105*size;g.scale.setScalar(size);root.add(g)
    brickRing(g,.40,-.04,2)
    piece(g,post,'#dcc88e',[0,.153,0],[.389,.012,.389],true)
    ring(g,.40,.016,.15,'#ebd8a5')
    if(spot.id==='home'){
      piece(g,post,'#ffe4a0',[0,.38,0],[.29,.46,.28]);ring(g,.30,.018,.59,'#ffce45')
      tiledRoof(g,.42,.60,.32,'#ee4916')
      piece(g,box,'#0e797d',[0,.34,.283],[.23,.36,.035]);piece(g,box,'#ffe498',[0,.53,.29],[.29,.042,.05])
      for(const x of [-.132,.132])piece(g,box,'#f8ba32',[x,.34,.29],[.028,.39,.05])
      piece(g,sphere,'#ffcf25',[.070,.32,.32],[.016,.016,.016])
      porthole(g,-.19,.43,.215,.06);porthole(g,.19,.43,.215,.06)
      for(let i=0;i<3;i++)piece(g,box,'#d2bc85',[0,.045+i*.034,.405-i*.041],[.23,.04,.09],true)
      piece(g,box,'#ac5b2d',[-.18,.81,-.10],[.09,.29,.10]);piece(g,box,'#ffde81',[-.18,.955,-.10],[.13,.04,.14])
      for(let i=0;i<3;i++)piece(g,box,'#613e25',[-.18,.74+i*.07,-.042],[.095,.009,.008])
      label(g,'01',[0,.56,.32],.14)
      // Chunky flower boxes give the small house a lived-in toy-town silhouette.
      for(const side of [-1,1]){
        piece(g,box,'#0e797d',[side*.205,.315,.235],[.135,.05,.085])
        for(let i=0;i<3;i++){
          const x=side*.205+(i-1)*.037
          piece(g,sphere,'#3d9f47',[x,.36,.24],[.031,.031,.026])
          piece(g,sphere,i%2?'#fff0aa':'#ff8c93',[x,.384,.259],[.024,.023,.018])
        }
      }
    }else if(spot.id==='market'){
      piece(g,box,'#ffc73c',[0,.39,0],[.58,.47,.35]);piece(g,box,'#13545a',[0,.41,.184],[.49,.25,.025])
      piece(g,box,'#fff1c0',[0,.24,.24],[.66,.055,.19])
      for(let i=0;i<9;i++){
        const mesh=piece(g,box,i%2?'#fff2bf':'#f24b22',[(i-4)*.075,.65,.065],[.073,.055,.55]);mesh.rotation.x=.14
        piece(g,sphere,i%2?'#fff2bf':'#f24b22',[(i-4)*.075,.61,.33],[.036,.052,.025])
      }
      for(const x of [-.30,.30])rod(g,[x,.15,.30],[x,.64,.30],.018,'#136eab')
      for(let crate=0;crate<3;crate++){
        const x=(crate-1)*.18;piece(g,box,'#8f4e1e',[x,.29,.25],[.16,.05,.12])
        for(let i=0;i<4;i++)piece(g,sphere,['#ef6920','#b8df17','#ffcc24'][crate],[x+(i%2-.5)*.062,.325, .23+Math.floor(i/2)*.055],[.032,.033,.032])
      }
      piece(g,box,'#0c65b7',[0,.77,-.06],[.58,.17,.045]);label(g,'MARKET',[0,.77,-.032],.54)
      for(const x of [-.23,.23])rod(g,[x,.58,-.06],[x,.80,-.06],.014,'#ffcb27')
    }else if(spot.id==='park'){
      const keep=new THREE.Group();keep.position.z=-.20;g.add(keep)
      brickRing(keep,.19,.15,7,14,['#e9d6a6','#dcc79a','#f1e1b9'])
      tiledRoof(keep,.26,.82,.29,'#dc6656')
      porthole(keep,0,.71,.19,.055)
      // A readable storybook castle gate, with open arch and crenellated towers.
      for(const x of [-.27,.27]){
        const turret=new THREE.Group();turret.position.x=x;g.add(turret)
        brickRing(turret,.14,.15,5,10);ring(turret,.165,.024,.62,'#f7d97e')
        for(let i=0;i<6;i++){const a=i*Math.PI/3;piece(turret,box,'#e1d2a3',[Math.sin(a)*.12,.70,Math.cos(a)*.12],[.077,.12,.077],true)}
        porthole(turret,0,.47,.139,.045)
        rod(turret,[0,.69,0],[0,1.00,0],.012,'#fff0af')
        const flag=new THREE.Shape();flag.moveTo(0,0);flag.lineTo(.16,-.015);flag.lineTo(.10,-.07);flag.lineTo(0,-.08);flag.closePath()
        piece(turret,new THREE.ExtrudeGeometry(flag,{depth:.009,bevelEnabled:false}),x<0?'#f83d28':'#0072d0',[0,.98,0])
      }
      piece(g,box,'#c4b27e',[0,.63,0],[.42,.12,.18],true)
      const arch=piece(g,new THREE.TorusGeometry(.19,.043,8,24,Math.PI),'#eedb9b',[0,.40,.12]);arch.scale.y=1.15
      for(const x of [-.19,.19])piece(g,box,'#eedb9b',[x,.275,.12],[.087,.25,.09],true)
      const door=new THREE.Shape();door.moveTo(-.155,.15);door.lineTo(-.155,.40);door.absarc(0,.40,.155,Math.PI,0,true);door.lineTo(.155,.15);door.closePath()
      piece(g,new THREE.ExtrudeGeometry(door,{depth:.025,bevelEnabled:true,bevelSize:.008,bevelThickness:.008,bevelSegments:2}),'#95623d',[0,0,.025])
      for(const x of [-.10,-.05,0,.05,.10]){
        const h=.23+Math.sqrt(.155*.155-x*x)
        piece(g,box,'#62412a',[x,.165+h/2,.059],[.004,h,.004])
      }
      for(const x of [-.035,.035])piece(g,new THREE.TorusGeometry(.018,.004,6,16),'#e5ba47',[x,.30,.072])
      piece(g,box,'#d33120',[0,.71,.14],[.35,.11,.06])
      label(g,'PLAY',[0,.71,.176],.32,'#d33120')
    }else if(spot.id==='signal'){
      brickRing(g,.275,.16,3,16);ring(g,.29,.024,.44,'#ffbc21')
      piece(g,new THREE.SphereGeometry(.29,24,12,0,Math.PI*2,0,Math.PI/2),'#0968c9',[0,.46,0])
      ring(g,.29,.02,.47,'#f7dd86')
      for(let i=0;i<12;i++){const a=i*Math.PI/6;piece(g,sphere,'#ffdc46',[Math.sin(a)*.27,.53,Math.cos(a)*.27],[.014,.014,.014])}
      rod(g,[0,.62,.03],[.08,.81,.34],.075,'#ffca26');rod(g,[.08,.81,.32],[.10,.85,.40],.09,'#073f91')
      piece(g,sphere,'#9ee5f5',[.10,.85,.42],[.077,.077,.024]);porthole(g,0,.33,.28,.055)
      label(g,'ORBIT',[0,.20,.287],.24)
    }else{
      brickRing(g,.16,.15,6,12,['#e7ece3','#cddbd6','#f7f5e7'])
      for(const y of [.15,.44,.71])ring(g,.165,.012,y,'#da7264')
      ring(g,.21,.027,.71,'#0d64b6');piece(g,post,'#ffcf2a',[0,.77,0],[.105,.15,.105])
      for(let i=0;i<8;i++){const a=i*Math.PI/4;rod(g,[Math.sin(a)*.16,.69,Math.cos(a)*.16],[Math.sin(a)*.16,.81,Math.cos(a)*.16],.009,'#f7ebac')}
      ring(g,.16,.013,.81,'#fff4c9');piece(g,new THREE.ConeGeometry(.22,.17,24),'#df6757',[0,.93,0])
      for(const x of [-.22,.22])rod(g,[x,.17,.20],[x,.34,.20],.012,'#fff1b8')
      piece(g,sphere,'#f5d941',[0,1.035,0],[.03,.035,.03]);porthole(g,0,.31,.16,.040);porthole(g,0,.55,.16,.035)
    }
    // Small framed porch lantern, not a floating luminous sphere.
    const lampX=spot.id==='market'?-.34:.25,lampY=spot.id==='dock'?.36:.40,lampZ=.33
    rod(g,[lampX,lampY+.10,lampZ-.08],[lampX,lampY+.10,lampZ],.009,'#4a514a')
    piece(g,box,'#ffe7a4',[lampX,lampY,lampZ],[.045,.068,.045])
    for(const x of [-.027,.027])for(const z of [-.027,.027])rod(g,[lampX+x,lampY-.045,lampZ+z],[lampX+x,lampY+.045,lampZ+z],.005,'#4a514a')
    for(const y of [-.049,.049])piece(g,box,'#4a514a',[lampX,lampY+y,lampZ],[.067,.016,.067])
    piece(g,new THREE.ConeGeometry(.05,.038,4),'#4a514a',[lampX,lampY+.075,lampZ])
    batch(root)
    if(spot.id==='home'||spot.id==='market'){
      const light=new THREE.PointLight('#ffbd69',0,1.5,2);light.name='porch-night-light'
      light.position.set(lampX*size,(lampY-.105)*size,(lampZ+.065)*size);root.add(light);nightLights.push(light)
    }
    // Warm pools are conformal to the globe and only cover each doorway.
    root.updateMatrixWorld(true)
    const poolGeometry=new THREE.CircleGeometry(.27,32),positions=poolGeometry.attributes.position
    const localToWorld=root.matrix.clone(),inverse=localToWorld.clone().invert()
    for(let i=0;i<positions.count;i++){
      const n=new THREE.Vector3(positions.getX(i)*size,0,(positions.getY(i)+.49)*size).applyMatrix4(localToWorld).normalize()
      const point=n.clone().multiplyScalar(radius+surface(n).height+.009).applyMatrix4(inverse)
      positions.setXYZ(i,point.x,point.y,point.z)
    }
    poolGeometry.computeVertexNormals()
    const pool=new THREE.Mesh(poolGeometry,new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
      uniforms:{},vertexShader:'varying vec2 vGlow;void main(){vGlow=uv*2.0-1.0;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:'varying vec2 vGlow;void main(){float a=pow(max(0.0,1.0-length(vGlow)),2.0);gl_FragColor=vec4(.95,.46,.10,a*.19);}'
    }));pool.name='warm-doorway-pool';pool.visible=false;root.add(pool);pools.push(pool)
  }

  // One monumental, genuinely three-dimensional loop gives the world a course
  // silhouette, not a collection of tiny garden ornaments. It is scenery only.
  const loopNormal=direction(.52,1.17),loop=pose('console-loop-course',loopNormal,-.62)
  loop.scale.setScalar(.72)
  const loopRadius=.62,trackWidth=.22,points:number[]=[],uvs:number[]=[],indices:number[]=[],steps=144
  for(let i=0;i<=steps;i++){
    const a=i/steps*Math.PI*2
    for(const side of [-1,1]){points.push(Math.sin(a)*loopRadius,loopRadius-Math.cos(a)*loopRadius+.04,side*trackWidth/2);uvs.push((side+1)/2,i/steps*18)}
    if(i<steps){const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2)}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geometry.setAttribute('courseUv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals()
  const track=new THREE.Mesh(geometry,consoleCourseMaterial());track.castShadow=true;track.receiveShadow=true;loop.add(track)
  for(const z of [-.13,.13]){
    const rail=piece(loop,new THREE.TorusGeometry(loopRadius+.018,.027,10,96),'#ffb91e',[0,loopRadius+.04,z]);rail.name='loop-gold-rail'
  }
  for(const x of [-.24,.24]){piece(loop,box,'#0863b3',[x,.06,0],[.16,.12,.38]);piece(loop,sphere,'#ffe54d',[x,.135,0],[.07,.023,.07])}
  obstacles.push({normal:loopNormal,radius:.24})
  loop.userData.groundNormal=loopNormal.toArray();loop.userData.footprint=.24

  // A rear scenic aqueduct is visible as the globe rotates; shallow supports
  // follow the globe and do not alter the resident's low-relief walking surface.
  const bridgeNormal=direction(.35,2.72),bridge=pose('console-arcade-bridge',bridgeNormal,.25)
  for(let i=0;i<3;i++){
    const x=(i-1)*.27
    const arch=piece(bridge,new THREE.TorusGeometry(.12,.035,6,16,Math.PI),'#d1b786',[x,.20,0]);arch.scale.z=2.3
    for(const side of [-1,1])piece(bridge,box,'#9f895e',[x+side*.12,.11,0],[.043,.20,.18],true)
    piece(bridge,box,'#f1d19b',[x,.36,0],[.28,.06,.26],true)
    for(const z of [-.14,.14]){rod(bridge,[x-.13,.49,z],[x+.13,.49,z],.013,'#0a6cba');rod(bridge,[x,.38,z],[x,.49,z],.012,'#ffdb40')}
  }
  obstacles.push({normal:bridgeNormal,radius:.19});batch(bridge)

  const stars:THREE.Group[]=[]
  const starShape=new THREE.Shape()
  for(let i=0;i<10;i++){const a=Math.PI/2+i*Math.PI/5,r=i%2?.040:.085;if(i===0)starShape.moveTo(Math.cos(a)*r,Math.sin(a)*r);else starShape.lineTo(Math.cos(a)*r,Math.sin(a)*r)}
  starShape.closePath()
  const starGeometry=new THREE.ExtrudeGeometry(starShape,{depth:.025,bevelEnabled:true,bevelThickness:.008,bevelSize:.008,bevelSegments:1})
  for(const [lat,lon] of [[-.24,-.35],[-.16,.40],[.12,-1.23],[.0,1.62],[-.42,2.40]]){
    const g=pose('console-star-marker',direction(lat,lon)),star=new THREE.Group();star.position.y=.30;g.add(star)
    piece(star,starGeometry,'#ffcd10',[0,0,0]);stars.push(star)
  }
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)')
  return {setNight:(night:boolean)=>{
    for(const [color,emission,intensity] of [['#073a68','#ffcd78',1.5],['#b4f7ef','#fff0bc',.85],['#ffe7a4','#ffbd65',2.1],['#ffcf2a','#ffdc8a',1.6],['#ffcd10','#ffe184',1.1]] as const){
      const m=mat(color);m.emissive.set(night?emission:'#000000');m.emissiveIntensity=night?intensity:0
      m.color.set(night&&color==='#073a68'?'#ffe6aa':color)
      m.userData.nightEmitter=night
    }
    nightLights.forEach(light=>{light.intensity=night?.24:0});pools.forEach(pool=>{pool.visible=night})
  },update:(now:number)=>{if(!reduced.matches)stars.forEach((star,i)=>{star.rotation.y=now*.00075+i;star.position.y=.30+Math.sin(now*.0018+i)*.025})}}
}
