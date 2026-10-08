import * as THREE from 'three'
import {createPlanetPlayground} from './planet-playground'
import {consoleGroundMaterial,consoleWaterMaterial,islandPathMaterial,moonlitPalette} from './planet-console-materials'
import {islandBank} from './planet-coast'
import {createConsoleArchitecture,landmarkScale} from './planet-console-architecture'
import {createPlanetBiomes} from './planet-biomes'
import {createPlanetStarLamps} from './planet-star-lamps'
import {createPlanetFish} from './planet-fish'
import {cacheStaticMeshTransforms,indexExactGeometry} from './planet-performance'
import type {VillageObstacle} from './planet-village'

export type PlanetLandmark={id:string;lat:number;lon:number;color:string}
export const PLANET_RADIUS=3
const up=new THREE.Vector3(0,1,0)
const direction=(lat:number,lon:number)=>new THREE.Vector3(Math.cos(lat)*Math.sin(lon),Math.sin(lat),Math.cos(lat)*Math.cos(lon))
const smooth=THREE.MathUtils.smoothstep

/** An authored toy-garden planet, independent of the retired cliff/noise world.
 * Ground, paths, props and resident physics share one low-relief radial surface.
 * Terrain colour is continuous object-space colour: no stretched sphere images. */
export function createPlanetEnvironment(world:THREE.Group,landmarks:PlanetLandmark[]) {
  const radius=PLANET_RADIUS,clearing=direction(.46,.08)
  const surface=(normal:THREE.Vector3)=>{
    const bank=islandBank(normal)
    const shore=smooth(bank,-.07,.10)
    const hill=.022+.027*Math.pow(Math.max(0,normal.y),2)+.010*Math.sin(normal.x*4+normal.z*3)*Math.cos(normal.y*5)
    const meadow=THREE.MathUtils.lerp(.025,hill,smooth(normal.distanceTo(clearing),.35,.70))
    // Broad shallow shore ramps and gentle hills, never a terraced height step.
    const height=-.095+shore*.135+meadow*shore*shore
    return {height,bank}
  }
  const terrainGeometry=new THREE.SphereGeometry(radius,192,144),positions=terrainGeometry.attributes.position
  const colors:number[]=[],grass=new THREE.Color('#46a546'),lightGrass=new THREE.Color('#8cc74d'),sand=new THREE.Color('#f0dda7')
  for(let i=0;i<positions.count;i++){
    const n=new THREE.Vector3().fromBufferAttribute(positions,i).normalize(),sample=surface(n)
    const shade=.25+.18*Math.sin(n.x*6+n.z*3)*Math.cos(n.y*5)
    const color=sand.clone().lerp(grass.clone().lerp(lightGrass,shade),smooth(sample.bank,.035,.145))
    colors.push(...color.toArray());positions.setXYZ(i,n.x*(radius+sample.height),n.y*(radius+sample.height),n.z*(radius+sample.height))
  }
  terrainGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));terrainGeometry.computeVertexNormals()
  const terrain=new THREE.Mesh(terrainGeometry,consoleGroundMaterial());terrain.name='garden-ground';terrain.receiveShadow=true;terrain.castShadow=true;world.add(terrain)
  const groundNight=moonlitPalette(terrain.material)
  const lagoon=consoleWaterMaterial()
  const water=new THREE.Mesh(new THREE.SphereGeometry(radius-.046,144,96),lagoon.material)
  water.name='garden-pond-water';water.receiveShadow=true;world.add(water)
  const fish=createPlanetFish(world,radius)
  const obstacles:VillageObstacle[]=[],targets:THREE.Object3D[]=[],underlays:THREE.Mesh[]=[water]
  const primitives={ball:new THREE.SphereGeometry(1,20,14),post:new THREE.CylinderGeometry(1,1,1,16)}
  type Primitive=keyof typeof primitives
  type Batch={geometry:THREE.BufferGeometry;color:string;matrices:THREE.Matrix4[]}
  const batches=new Map<string,Batch>(),dummy=new THREE.Object3D()
  const add=(base:THREE.Matrix4,kind:Primitive,color:string,pos:number[],scale:number[],rot=[0,0,0])=>{
    const key=`${kind}:${color}`;let batch=batches.get(key)
    if(!batch){batch={geometry:primitives[kind],color,matrices:[]};batches.set(key,batch)}
    dummy.position.set(...pos as [number,number,number]);dummy.scale.set(...scale as [number,number,number]);dummy.rotation.set(...rot as [number,number,number]);dummy.updateMatrix()
    batch.matrices.push(new THREE.Matrix4().multiplyMatrices(base,dummy.matrix))
  }
  const baseAt=(normal:THREE.Vector3,spin=0,offset=0)=>new THREE.Matrix4().compose(
    normal.clone().multiplyScalar(radius+surface(normal).height+offset),
    new THREE.Quaternion().setFromUnitVectors(up,normal).multiply(new THREE.Quaternion().setFromAxisAngle(up,spin)),new THREE.Vector3(1,1,1))
  const rod=(base:THREE.Matrix4,a:THREE.Vector3,b:THREE.Vector3,r:number,color:string)=>{
    const delta=b.clone().sub(a),pose=new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(.5),new THREE.Quaternion().setFromUnitVectors(up,delta.clone().normalize()),new THREE.Vector3(r,delta.length(),r))
    const key=`post:${color}`;let batch=batches.get(key);if(!batch){batch={geometry:primitives.post,color,matrices:[]};batches.set(key,batch)}
    batch.matrices.push(new THREE.Matrix4().multiplyMatrices(base,pose))
  }
  const locations:Record<string,THREE.Vector3>={
    home:direction(-.03,-.58),market:direction(.02,.82),park:direction(.66,-1.12),signal:direction(-.24,1.93),dock:direction(-.52,-.65),
  }
  const homeSites=landmarks.map(spot=>({spot,normal:locations[spot.id]??direction(spot.lat,spot.lon),facing:new THREE.Vector3()}))

  // Light stone ribbons follow the globe itself. No UVs, stretched textures,
  // elevation mismatch, or floating flat strips on a spherical surface.
  const pathNormals:THREE.Vector3[]=[]
  const ribbon=(points:THREE.Vector3[],width:number,closed=false)=>{
    const curve=new THREE.CatmullRomCurve3(points,closed),verts:number[]=[],indices:number[]=[],courseUvs:number[]=[]
    const steps=Math.max(70,points.length*50)
    const samples=Array.from({length:steps+1},(_,i)=>curve.getPoint(i/steps).normalize())
    const lengths=[0];for(let i=1;i<=steps;i++)lengths.push(lengths[i-1]+samples[i].distanceTo(samples[i-1])*radius)
    // Continuous ground-space coordinates retain the grain scale on each path.
    const repeats=closed?Math.round(lengths[steps]/width):lengths[steps]/width
    for(let i=0;i<=steps;i++){
      const t=i/steps,n=curve.getPoint(t).normalize(),tangent=curve.getTangent(t).projectOnPlane(n).normalize(),side=new THREE.Vector3().crossVectors(tangent,n).normalize()
      pathNormals.push(n.clone())
      for(const sign of [-1,1]){const p=n.clone().addScaledVector(side,sign*width/radius/2).normalize();verts.push(...p.multiplyScalar(radius+surface(p).height+.006).toArray());courseUvs.push((sign+1)/2,lengths[i]/lengths[steps]*repeats)}
      if(i<steps){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3)}
    }
    // Curve.getTangent uses one-sided finite differences at the endpoints.
    // Weld the last cross-section explicitly so their tiny error cannot split it.
    if(closed)for(let i=0;i<6;i++)verts[verts.length-6+i]=verts[i]
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geometry.setAttribute('courseUv',new THREE.Float32BufferAttribute(courseUvs,2));geometry.setIndex(indices);geometry.computeVertexNormals()
    // Branch junctions overlap the main ribbon. Depth bias avoids flickering
    // where their differently tessellated surfaces meet, without raising paths.
    const mesh=new THREE.Mesh(geometry,islandPathMaterial(!closed));mesh.name='garden-promenade';mesh.userData.closed=closed;mesh.receiveShadow=true;world.add(mesh);underlays.push(mesh)
  }
  ribbon([direction(-.06,-2.5),direction(.02,-1.65),direction(-.17,-.78),direction(-.05,-.12),direction(-.19,.62),direction(-.03,1.4),direction(-.25,2.35),direction(-.44,2.85)],.18,true)
  ribbon([direction(-.05,-.12),direction(.01,-.06),direction(.05,.06)],.20)
  const mainPath=pathNormals.slice()
  for(const {spot,normal,facing} of homeSites){
    let nearest=mainPath[0];for(const candidate of mainPath)if(candidate.distanceTo(normal)<nearest.distanceTo(normal))nearest=candidate
    facing.copy(nearest).projectOnPlane(normal).normalize()
    const entry=normal.clone().addScaledVector(facing,.13*(landmarkScale[spot.id]??.72)).normalize()
    ribbon([entry,entry.clone().lerp(nearest,.5).normalize(),nearest],.12)
  }
  const architecture=createConsoleArchitecture(world,homeSites,radius,surface,obstacles)

  for(const {spot,normal} of homeSites){
    obstacles.push({normal:normal.clone(),radius:.18})
    const size=landmarkScale[spot.id]??.72
    const target=new THREE.Mesh(new THREE.SphereGeometry(.49*size,12,8),new THREE.MeshBasicMaterial({visible:false}));target.position.copy(normal).multiplyScalar(radius+surface(normal).height+.44*size);target.userData.id=spot.id;world.add(target);targets.push(target)
  }

  const biomes=createPlanetBiomes(world,radius,surface,clearing,pathNormals,homeSites.map(s=>s.normal),obstacles,underlays)
  // Small candy-colour gateways borrow the loop silhouettes of console courses.
  for(const [lat,lon,spin] of [[.15,-1.55,.3],[-.16,1.20,-.3],[.0,2.12,.2]]){
    const n=direction(lat,lon),base=baseAt(n,spin),gate=new THREE.Group();gate.name='garden-rainbow-gate';gate.applyMatrix4(base);world.add(gate)
    for(let stripe=0;stripe<4;stripe++){
      const arch=new THREE.Mesh(new THREE.TorusGeometry(.23+stripe*.035,.021,8,36,Math.PI),new THREE.MeshPhongMaterial({color:['#f94343','#ffa019','#ffe321','#05a9b8'][stripe],shininess:80}))
      arch.position.y=.15;arch.castShadow=true;gate.add(arch)
    }
    for(const x of [-.28,.28])add(base,'post','#fff0c9',[x,.075,0],[.045,.15,.045])
    obstacles.push({normal:n,radius:.105})
  }
  // A tethered trio sits beside (not inside) the clear meeting space.
  const balloonNormal=direction(.84,.5),balloonBase=baseAt(balloonNormal)
  for(let i=0;i<3;i++){
    const top=new THREE.Vector3((i-1)*.12,.72+(i%2)*.17,0)
    rod(balloonBase,new THREE.Vector3(0,.02,0),top,.0035,'#fff2c8')
    add(balloonBase,'ball',['#f33470','#ffca14','#078de3'][i],top.toArray(),[.105,.13,.105])
  }
  obstacles.push({normal:balloonNormal,radius:.055})
  const playground=createPlanetPlayground(world,clearing,radius,surface,obstacles);underlays.push(playground.court)
  const materials=new Map<string,THREE.MeshPhongMaterial>()
  for(const batch of batches.values()){
    const key=batch.color
    let material=materials.get(key);if(!material){material=new THREE.MeshPhongMaterial({color:batch.color,shininess:38,specular:'#536e49'});materials.set(key,material)}
    const mesh=new THREE.InstancedMesh(batch.geometry,material,batch.matrices.length);mesh.name='garden-scenery-batch'
    batch.matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=true;mesh.receiveShadow=true;world.add(mesh)
  }
  world.userData.environmentVersion='island-coast-v4'
  const starLamps=createPlanetStarLamps(world,radius,surface,clearing,pathNormals,obstacles)
  // Ripples and individual droplets animate their own transforms. Everything
  // else moves through parent Groups or vertex shaders, not local mesh TRS.
  cacheStaticMeshTransforms(world,new Set(fish.fish.flatMap(f=>[f.ripple,...f.drops.children])))
  const geometries=new Set<THREE.BufferGeometry>()
  world.traverse(node=>{if(node instanceof THREE.Mesh)geometries.add(node.geometry)})
  geometries.forEach(indexExactGeometry)
  return {terrain,clearing,obstacles,targets,underlays,surface,fish,setNight:(value:boolean)=>{
    fish.setNight(value);starLamps.setNight(value);architecture.setNight(value);lagoon.setNight(value);biomes.setNight(value);groundNight(value)
  },update:(now:number)=>{playground.update(now);fish.update(now);lagoon.update(now);architecture.update(now);biomes.update(now);starLamps.update(now)}}
}
