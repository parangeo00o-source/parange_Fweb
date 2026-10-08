import * as THREE from 'three'
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js'
import type {VillageObstacle} from './planet-village'
import {paintedFinish,moonlitPalette} from './planet-console-materials'

type Surface=(n:THREE.Vector3)=>{height:number;bank:number}
const up=new THREE.Vector3(0,1,0)
const direction=(lat:number,lon:number)=>new THREE.Vector3(Math.cos(lat)*Math.sin(lon),Math.sin(lat),Math.cos(lat)*Math.cos(lon))

/** Layered, authored vegetation: tapered branches, folded individual leaves,
 * shaded crown volumes, understory, grass and coastal props. No image cards. */
export function createPlanetBiomes(world:THREE.Group,radius:number,surface:Surface,clearing:THREE.Vector3,
  paths:THREE.Vector3[],sites:THREE.Vector3[],obstacles:VillageObstacle[],underlays:THREE.Mesh[]) {
  let seed=28614
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}
  // Shuffle BEFORE applying a population quota: scanning a Fibonacci sphere
  // from its north pole fills that quota before the south is ever considered.
  const candidates=(count:number)=>{
    const points=Array.from({length:count},(_,i)=>{
      const y=1-(i+.5)*2/count,a=i*2.39996323
      return new THREE.Vector3(Math.sqrt(1-y*y)*Math.cos(a),y,Math.sqrt(1-y*y)*Math.sin(a))
    })
    for(let i=count-1;i>0;i--){const j=Math.floor(random()*(i+1));[points[i],points[j]]=[points[j],points[i]]}
    return points
  }
  const placements:{kind:string;normal:number[];size:number}[]=[]
  const batches=new Map<string,{geometry:THREE.BufferGeometry;material:THREE.Material;matrices:THREE.Matrix4[];tints:number[]}>()
  const materials=new Map<string,THREE.MeshStandardMaterial>()
  const material=(color:string,roughness=.85,vertexColors=false)=>{
    const key=color+roughness+vertexColors
    if(!materials.has(key)){
      const mat=new THREE.MeshStandardMaterial({color,roughness,vertexColors,side:THREE.DoubleSide})
      if(['#bc8b4c','#a27740','#bd8e57','#94704a'].includes(color))paintedFinish(mat,'wood')
      if(color==='#b5bba5')paintedFinish(mat,'stone')
      materials.set(key,mat)
    }
    return materials.get(key)!
  }
  const put=(key:string,geometry:THREE.BufferGeometry,mat:THREE.Material,base:THREE.Matrix4,pos:number[],scale:number[],rotation=new THREE.Quaternion(),tint=1)=>{
    let batch=batches.get(key);if(!batch){batch={geometry,material:mat,matrices:[],tints:[]};batches.set(key,batch)}
    const local=new THREE.Matrix4().compose(new THREE.Vector3(...pos as [number,number,number]),rotation,new THREE.Vector3(...scale as [number,number,number]))
    batch.matrices.push(new THREE.Matrix4().multiplyMatrices(base,local));batch.tints.push(tint)
  }
  const pose=(n:THREE.Vector3,spin=0)=>new THREE.Matrix4().compose(n.clone().multiplyScalar(radius+surface(n).height),
    new THREE.Quaternion().setFromUnitVectors(up,n).multiply(new THREE.Quaternion().setFromAxisAngle(up,spin)),new THREE.Vector3(1,1,1))
  const sphere=new THREE.SphereGeometry(1,18,12)
  const leaf=new THREE.BufferGeometry(),lv:number[]=[],lc:number[]=[],li:number[]=[]
  for(let i=0;i<=6;i++)for(let side=-1;side<=1;side++){
    const t=i/6,width=Math.pow(Math.sin(t*Math.PI),.8)*.28
    lv.push(side*width,Math.sin(t*Math.PI)*.17-Math.abs(side)*width*.32,t-.5)
    lc.push(...new THREE.Color(side===0?'#b2e577':side<0?'#75be52':'#4f9b42').toArray())
    if(i<6&&side<1){const j=i*3+side+1;li.push(j,j+3,j+1,j+1,j+3,j+4)}
  }
  leaf.setAttribute('position',new THREE.Float32BufferAttribute(lv,3));leaf.setAttribute('color',new THREE.Float32BufferAttribute(lc,3));leaf.setIndex(li);leaf.computeVertexNormals()
  const leafMat=material('#ffffff',.86,true)
  const windTime={value:0},reduced=window.matchMedia('(prefers-reduced-motion: reduce)')
  const leafWind=(mat:THREE.Material)=>{
    mat.onBeforeCompile=shader=>{
      shader.uniforms.uBiomeWind=windTime
      shader.vertexShader='uniform float uBiomeWind;\n'+shader.vertexShader
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
        float phase=0.0;
        #ifdef USE_INSTANCING
          phase=instanceMatrix[3].x*4.0+instanceMatrix[3].z*3.0;
        #endif
        transformed.y+=sin(uBiomeWind+phase+position.z*2.0)*.032*pow(max(0.0,position.z+.5),2.0);
      `)
    }
    mat.customProgramCacheKey=()=> 'storybook-leaf-wind-v1'
  }
  leafWind(leafMat)
  const leafDepth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});leafWind(leafDepth)
  const crown=new THREE.SphereGeometry(1,24,16),cp=crown.attributes.position,cc:number[]=[]
  for(let i=0;i<cp.count;i++){
    const n=new THREE.Vector3().fromBufferAttribute(cp,i),lobe=1+.045*Math.sin(n.x*15+n.z*8)*Math.sin(n.y*11)
    cp.setXYZ(i,n.x*lobe,n.y*lobe,n.z*lobe)
    cc.push(...new THREE.Color('#176640').lerp(new THREE.Color('#78c448'),THREE.MathUtils.smoothstep(n.y,-.8,.9)).toArray())
  }
  crown.setAttribute('color',new THREE.Float32BufferAttribute(cc,3));crown.computeVertexNormals()
  const crownMat=material('#ffffff',.96,true)
  // Closed, curved leaf volumes. These grow out of concentric branch sprays;
  // they are not randomly oriented decals on the outside of a sphere.
  const boughLeaf=new THREE.BufferGeometry(),bv:number[]=[],bc:number[]=[],bi:number[]=[]
  const rows=8,columns=4,stride=columns+1,layerSize=(rows+1)*stride
  for(let layer=0;layer<2;layer++)for(let row=0;row<=rows;row++)for(let col=0;col<=columns;col++){
    const t=row/rows,s=col/columns*2-1,width=.012+.34*Math.pow(Math.sin(t*Math.PI),.72)
    const arch=Math.sin(t*Math.PI)*.17-t*t*.36
    const rib=(1-s*s)*Math.sin(t*Math.PI)*.10
    bv.push(s*width,arch+rib+(layer===0?1:-1)*(.012+.016*Math.sin(t*Math.PI)),t-.5)
    const tint=layer===0?new THREE.Color('#287444').lerp(new THREE.Color('#85bc50'),.24+.50*(1-Math.abs(s))+.22*t):new THREE.Color('#246442')
    bc.push(...tint.toArray())
    if(row<rows&&col<columns){const j=layer*layerSize+row*stride+col
      if(layer===0)bi.push(j,j+stride,j+1,j+1,j+stride,j+stride+1)
      else bi.push(j,j+1,j+stride,j+1,j+stride+1,j+stride)
    }
  }
  const closeEdge=(a:number,b:number)=>bi.push(a,b,a+layerSize,b,b+layerSize,a+layerSize)
  for(let row=0;row<rows;row++){closeEdge(row*stride,(row+1)*stride);closeEdge((row+1)*stride+columns,row*stride+columns)}
  for(let col=0;col<columns;col++){closeEdge(col+1,col);closeEdge(rows*stride+col,rows*stride+col+1)}
  boughLeaf.setAttribute('position',new THREE.Float32BufferAttribute(bv,3));boughLeaf.setAttribute('color',new THREE.Float32BufferAttribute(bc,3));boughLeaf.setIndex(bi);boughLeaf.computeVertexNormals()
  boughLeaf.userData.foliageStructure='closed-drooping-leaf'
  const tube=(points:THREE.Vector3[],width:number)=>{
    const curve=new THREE.CatmullRomCurve3(points),geometry=new THREE.TubeGeometry(curve,14,width,9,false),p=geometry.attributes.position,colors:number[]=[]
    // Tube rings taper toward the branch tips instead of using straight cones.
    for(let i=0;i<p.count;i++){
      const ring=Math.floor(i/10),t=ring/14,center=curve.getPointAt(t),v=new THREE.Vector3().fromBufferAttribute(p,i).sub(center).multiplyScalar(1-t*.58).add(center)
      p.setXYZ(i,v.x,v.y,v.z)
      const tint=.38+.24*Math.sin((i%10)*1.7)+.24*t
      colors.push(...new THREE.Color('#79502c').lerp(new THREE.Color('#d4a660'),tint).toArray())
    }
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();return geometry
  }
  const trunkPieces=[tube([new THREE.Vector3(0,0,0),new THREE.Vector3(-.055,.32,.02),new THREE.Vector3(.025,.66,0),new THREE.Vector3(.11,.95,0)],.072)]
  for(let i=0;i<3;i++){
    const a=i*Math.PI*2/3
    trunkPieces.push(tube([new THREE.Vector3(0,.34,0),new THREE.Vector3(Math.sin(a)*.10,.59,Math.cos(a)*.10),new THREE.Vector3(Math.sin(a)*.24,.82,Math.cos(a)*.24)],.038))
    trunkPieces.push(tube([new THREE.Vector3(Math.sin(a)*.16,-.007,Math.cos(a)*.16),new THREE.Vector3(Math.sin(a)*.08,.04,Math.cos(a)*.08),new THREE.Vector3(0,.20,0)],.044))
  }
  const trunk=mergeGeometries(trunkPieces)!;trunkPieces.forEach(g=>g.dispose())
  const barkMat=material('#ffffff',.9,true)
  paintedFinish(barkMat,'wood')
  const foliage=(base:THREE.Matrix4,center:THREE.Vector3,size:number,count:number,key='forest')=>{
    // Shadowed branch masses stay inside the overlapping leaves, never forming
    // a visible ball with a scattering of unrelated scales on its surface.
    put(`${key}-crown`,crown,crownMat,base,center.toArray(),[size*.72,size*.48,size*.72])
    const rings=count>=80?[18,16,12]:count>=30?[10,8,6]:[6,5,4]
    const leafCount=rings.reduce((a,b)=>a+b,0)
    for(let i=0;i<count;i++){
      // Keep the placement RNG consumption stable: changing canopy detail must
      // not reshuffle the island's established tree/fruit/palm distribution.
      const jitter=random(),turn=random(),stretch=random(),pigment=random()
      if(i>=leafCount)continue
      const tier=i<rings[0]?0:i<rings[0]+rings[1]?1:2
      const index=i-(tier===0?0:tier===1?rings[0]:rings[0]+rings[1])
      const angle=(index+.5*(tier%2))/rings[tier]*Math.PI*2+(turn-.5)*.16
      const length=size*([.74,.70,.63][tier]+stretch*.10)
      const rootRadius=size*[.36,.27,.08][tier],radial=rootRadius+length*.5
      const at=center.clone().add(new THREE.Vector3(Math.sin(angle)*radial,size*[-.18,.14,.43][tier]+(jitter-.5)*size*.07,Math.cos(angle)*radial))
      const q=new THREE.Quaternion().setFromAxisAngle(up,angle)
      const width=count>=80?1:1.4
      put(`${key}-leaves`,boughLeaf,leafMat,base,at.toArray(),[length*width,length,length],q,.80+tier*.085+pigment*.035)
    }
  }
  const blocked=(n:THREE.Vector3,pad=.07)=>n.distanceTo(clearing)<.62||n.distanceTo(direction(.52,1.17))<.42||n.distanceTo(direction(.12,-1.06))<.21
    ||n.distanceTo(direction(-.59,-.32))<.22||n.distanceTo(direction(-.70,.50))<.14
    ||sites.some(s=>s.distanceTo(n)<.29)||obstacles.some(o=>o.normal.distanceTo(n)<o.radius+pad)||paths.some(p=>p.distanceTo(n)<pad)
  const trees:THREE.Vector3[]=[]
  const treeSectors=[0,0,0,0]
  // Larger clusters have a recognisable forest silhouette, with deliberate gaps
  // around the settlement and clearings. Selection is stable across reloads.
  const treeCandidates=candidates(1100)
  for(let i=0;i<treeCandidates.length&&trees.length<36;i++){
    const n=treeCandidates[i]
    const sector=Math.min(3,Math.floor((Math.atan2(n.x,n.z)+Math.PI)/Math.PI*2))
    if(treeSectors[sector]>=12||surface(n).bank<.16||blocked(n,.085)||trees.some(t=>t.distanceTo(n)<.20)||random()>.78)continue
    const size=.54+random()*.32,base=pose(n,random()*6.28)
    // Compress the whole tree in local-up space, including branches and fruit.
    // Its roots stay on the shared ground surface and crowns keep their width.
    base.scale(new THREE.Vector3(.94,.70,.94))
    put('branching-trunks',trunk,barkMat,base,[0,0,0],[size,size,size])
    foliage(base,new THREE.Vector3(-.14,.70,.02).multiplyScalar(size),size*.34,88)
    foliage(base,new THREE.Vector3(.12,.91,0).multiplyScalar(size),size*.36,100)
    if(i%4===0)for(let f=0;f<3;f++)put('orchard-fruit',sphere,material('#f59325',.45),base,[(f-1)*size*.15,size*.72,.28*size],[.038,.041,.037])
    trees.push(n);treeSectors[sector]++;placements.push({kind:i%4===0?'fruit-tree':'broadleaf',normal:n.toArray(),size});obstacles.push({normal:n,radius:.067})
  }
  const palmTrunk=tube([new THREE.Vector3(),new THREE.Vector3(.04,.3,0),new THREE.Vector3(.16,.70,.02),new THREE.Vector3(.19,.90,0)],.054)
  const palmLeaf=leaf.clone(),pp=palmLeaf.attributes.position
  for(let i=0;i<pp.count;i++){const t=pp.getZ(i)+.5;pp.setXYZ(i,pp.getX(i)*.38,Math.sin(t*Math.PI)*.24-t*t*.27,t)}palmLeaf.computeVertexNormals()
  const palms:THREE.Vector3[]=[]
  for(const n of candidates(1500)){
    if(palms.length>=21)break
    const bank=surface(n).bank
    if(bank<.065||bank>.48||blocked(n,.065)||palms.some(t=>t.distanceTo(n)<.18))continue
    const s=.62+random()*.29,base=pose(n,random()*6.28)
    base.scale(new THREE.Vector3(.92,.68,.92))
    put('curved-palm-trunks',palmTrunk,barkMat,base,[0,0,0],[s,s,s])
    for(let j=0;j<9;j++){
      const a=j*Math.PI*2/9,q=new THREE.Quaternion().setFromAxisAngle(up,a)
      put('palm-fronds',palmLeaf,leafMat,base,[.19*s,.90*s,0],[s*.76,s*.8,s*.80],q)
      for(let f=1;f<=5;f++)for(const side of [-1,1]){
        const t=f/7,r=t*.80,w=Math.sin(t*Math.PI)*.065,height=(Math.sin(t*Math.PI)*.24-t*t*.27)*.8
        put('palm-leaflets',leaf,leafMat,base,[(.19+Math.sin(a)*r+Math.cos(a)*side*w)*s,(.90+height)*s,(Math.cos(a)*r-Math.sin(a)*side*w)*s],
          [s*.15,s*.12,s*.20],new THREE.Quaternion().setFromAxisAngle(up,a+side*.90))
      }
    }
    for(let j=0;j<3;j++)put('coconuts',sphere,material('#8e592a'),base,[.19*s+Math.sin(j*2.1)*.04,.86*s,Math.cos(j*2.1)*.04],[.038,.049,.038])
    palms.push(n);placements.push({kind:'palm',normal:n.toArray(),size:s});obstacles.push({normal:n,radius:.065})
  }

  // Understory is concentrated at groves and path edges, not uniformly dotted.
  for(let i=0;i<780;i++){
    const y=1-(i+.5)*2/780,a=i*2.39996323,n=new THREE.Vector3(Math.sqrt(1-y*y)*Math.cos(a),y,Math.sqrt(1-y*y)*Math.sin(a))
    if(surface(n).bank<.16||blocked(n,.045)||random()>.30)continue
    const nearTree=trees.some(t=>t.distanceTo(n)<.24)
    if(!nearTree&&random()>.22)continue
    const base=pose(n,random()*6.28),size=.10+random()*.055
    foliage(base,new THREE.Vector3(0,size*.62,0),size,36,'understory')
    obstacles.push({normal:n,radius:.028})
  }

  // Moss-covered root arch: real wood volume, with growth layered on the outside.
  const archNormal=direction(.12,-1.06),archBase=pose(archNormal,.18)
  const arch=new THREE.TorusGeometry(.31,.095,12,40,Math.PI)
  put('woodland-arch',arch,material('#bc8b4c'),archBase,[0,.13,0],[1,1,1])
  const post=new THREE.CylinderGeometry(.082,.10,.15,14)
  for(const x of [-.31,.31])put('arch-roots',post,material('#a27740'),archBase,[x,.06,0],[1,1,1])
  for(let i=0;i<12;i++)for(const z of [-.052,0,.052]){
    const a=i/11*Math.PI
    foliage(archBase,new THREE.Vector3(Math.cos(a)*.36,.13+Math.sin(a)*.36,z),.078,16,'arch-moss')
  }
  obstacles.push({normal:archNormal,radius:.155})
  const archTag=new THREE.Group();archTag.name='woodland-root-arch';archTag.applyMatrix4(archBase);world.add(archTag)

  const pierNormal=direction(-.59,-.32),pierBase=pose(pierNormal,.15),plank=new THREE.BoxGeometry(1,1,1)
  for(let i=0;i<9;i++)put('pier-planks',plank,material('#bd8e57'),pierBase,[0,.055,.05+i*.071],[.23,.025,.064])
  for(const x of [-.10,.10])for(const z of [.06,.56]){
    put('pier-posts',post,material('#94704a'),pierBase,[x,-.035,z],[.25,2,.25])
    put('pier-caps',sphere,material('#dfc798'),pierBase,[x,.13,z],[.030,.012,.030])
  }
  obstacles.push({normal:pierNormal,radius:.22})
  const beachNormal=direction(-.70,.50),beachBase=pose(beachNormal,-.35)
  put('parasol-pole',post,material('#f1e2b7'),beachBase,[0,.19,0],[.12,2.7,.12])
  for(let sector=0;sector<10;sector++){
    const canopy=new THREE.SphereGeometry(.17,4,4,sector*Math.PI/5,Math.PI/5,0,Math.PI*.34)
    put(`parasol-${sector}`,canopy,material(sector%2?'#fff1c6':'#e98361',.60),beachBase,[0,.30,0],[1,.5,1])
  }
  put('beach-mat',plank,material('#64bfc1'),beachBase,[.09,.01,.05],[.14,.012,.27])
  obstacles.push({normal:beachNormal,radius:.075})

  // Several sizes of rounded shoreline stones, clover, shells and flower heads.
  const rock=new THREE.IcosahedronGeometry(1,2),rockMat=material('#b5bba5',.97)
  for(let i=0;i<820;i++){
    const y=1-(i+.5)*2/820,a=i*2.39996323,n=new THREE.Vector3(Math.sqrt(1-y*y)*Math.cos(a),y,Math.sqrt(1-y*y)*Math.sin(a)),bank=surface(n).bank
    if(bank<.035||bank>.105||blocked(n,.045)||random()>.60)continue
    const s=.035+random()*.065,base=pose(n,random()*6.28)
    put('shore-stones',rock,rockMat,base,[0,s*.28,0],[s,s*.56,s*.82]);obstacles.push({normal:n,radius:s/radius})
  }
  const petal=new THREE.SphereGeometry(1,8,6)
  for(let i=0;i<1600;i++){
    const y=1-(i+.5)*2/1600,a=i*2.39996323,n=new THREE.Vector3(Math.sqrt(1-y*y)*Math.cos(a),y,Math.sqrt(1-y*y)*Math.sin(a))
    if(surface(n).bank<.15||blocked(n,.047)||random()>.20)continue
    const base=pose(n),color=['#fff7c2','#ffda45','#58cbdc','#fba1ba'][i%4]
    for(let f=0;f<3;f++){
      const x=(f-1)*.043,z=(f%2)*.035
      for(let p=0;p<5;p++)put(`petals-${color}`,petal,material(color,.68),base,[x+Math.sin(p*1.257)*.017,.035,z+Math.cos(p*1.257)*.017],[.016,.007,.016])
      put('flower-centers',sphere,material('#f4b824'),base,[x,.040,z],[.008,.008,.008])
    }
  }
  // Grass is a folded 3D tuft with darker roots and lighter tips. Keep a separate
  // material so the sinkhole can clip its instanced, planet-local positions.
  const grassParts:THREE.BufferGeometry[]=[]
  for(let i=0;i<5;i++){
    const blade=new THREE.BufferGeometry(),a=i*2.4,h=.034+(i%3)*.008,x=Math.sin(a)*.012,z=Math.cos(a)*.012
    blade.setAttribute('position',new THREE.Float32BufferAttribute([x-.005,0,z,x,0,z+.003,x+.005,0,z,x,h*.6,z+.003,x+Math.sin(a)*.014,h,z+Math.cos(a)*.014],3))
    blade.setAttribute('color',new THREE.Float32BufferAttribute([.08,.27,.05,.11,.33,.05,.08,.27,.05,.28,.57,.09,.47,.75,.19],3))
    blade.setIndex([0,1,3,1,2,3,0,3,4,3,2,4]);blade.computeVertexNormals();grassParts.push(blade)
  }
  const grass=mergeGeometries(grassParts)!,grassMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide});grassParts.forEach(g=>g.dispose())
  grassMat.userData.biomeGrass=true
  for(let i=0;i<10500;i++){
    const y=1-(i+.5)*2/10500,a=i*2.39996323,n=new THREE.Vector3(Math.sqrt(1-y*y)*Math.cos(a),y,Math.sqrt(1-y*y)*Math.sin(a))
    if(surface(n).bank<.13||blocked(n,.029)||random()>.45)continue
    const s=.65+random()*.55
    put('meadow-grass',grass,grassMat,pose(n,random()*6.28),[0,.003,0],[s,s,s])
  }
  let leaves=0,grassCount=0
  for(const [name,batch] of batches){
    const mesh=new THREE.InstancedMesh(batch.geometry,batch.material,batch.matrices.length);mesh.name=`biome-${name}`
    batch.matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;mesh.receiveShadow=true;mesh.castShadow=!['meadow-grass','flower-centers'].includes(name)&&!name.startsWith('petals')
    // Solid crown volumes cast the forest's soft silhouette. Re-rendering every
    // tiny leaf into the shadow map adds cost and unstable speckles on phones.
    if(batch.material===leafMat&&name!=='palm-fronds')mesh.castShadow=false
    if(batch.tints.some(t=>t!==1)){batch.tints.forEach((t,i)=>mesh.setColorAt(i,new THREE.Color().setRGB(t,t,t)));mesh.instanceColor!.needsUpdate=true}
    if(batch.material===leafMat)mesh.customDepthMaterial=leafDepth
    world.add(mesh)
    if(name==='meadow-grass'){underlays.push(mesh);grassCount=batch.matrices.length}
    if(name.includes('leaves')||name==='palm-fronds'||name==='palm-leaflets')leaves+=batch.matrices.length
  }
  world.userData.biomeStats={trees:trees.length,palms:palms.length,leaves,grass:grassCount}
  world.userData.biomePlacements=placements
  const moonMaterials=[leafMat,crownMat,grassMat].map(m=>moonlitPalette(m))
  return {setNight:(night:boolean)=>moonMaterials.forEach(set=>set(night)),update:(now:number)=>{windTime.value=reduced.matches?0:now*.0008}}
}
