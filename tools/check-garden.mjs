import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output=await mkdtemp(join(tmpdir(),'parange-new-garden-'))
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}})
  const errors=[];page.on('pageerror',e=>errors.push(String(e)))
  page.on('console',m=>{if(m.type()==='error'&&/THREE.WebGLProgram|Shader Error/.test(m.text()))errors.push(m.text())})
  await page.goto(process.env.REVIEW_URL || 'https://localhost:5173')
  await page.evaluate(async()=>{
    const {createParangePlanetExperience}=await import('/src/parange-planet.ts')
    window.gardenApp=createParangePlanetExperience();window.gardenApp.open()
    window.gardenThree=await import('/node_modules/.vite/deps/three.js')
  })
  await page.waitForTimeout(700)
  const geometry=await page.evaluate(()=>{
    const w=window.gardenApp.world,e=w.environment,T=window.gardenThree,pos=e.terrain.geometry.attributes.position,heights=[]
    let worstNeighbor=0
    for(let i=0;i<pos.count;i++){
      const p=new T.Vector3().fromBufferAttribute(pos,i),height=p.length()-3;heights.push(height)
      if(Math.abs(height-e.surface(p.clone().normalize()).height)>.00001)throw Error('Rendered terrain and navigation differ')
      if(i%193&&i>0)worstNeighbor=Math.max(worstNeighbor,Math.abs(height-heights[i-1]))
    }
    const relief=Math.max(...heights)-Math.min(...heights)
    if(relief>.205||worstNeighbor>.055)throw Error(`Ground is too steep: ${relief}, ${worstNeighbor}`)
    if(e.terrain.material.map)throw Error('Retired stretched terrain map still present')
    if(w.world.userData.environmentVersion!=='island-coast-v4')throw Error('Old environment still active')
    const biomes=w.world.userData.biomeStats
    if(!biomes||biomes.leaves<3500||biomes.grass<1000||biomes.trees<20)throw Error(`Missing layered vegetation: ${JSON.stringify(biomes)}`)
    const placements=w.world.userData.biomePlacements,trees=placements.filter(p=>p.kind!=='palm'),palms=placements.filter(p=>p.kind==='palm')
    const southernTrees=trees.filter(p=>p.normal[1]<0).length
    const sectors=[0,0,0,0];for(const p of trees)sectors[Math.min(3,Math.floor((Math.atan2(p.normal[0],p.normal[2])+Math.PI)/Math.PI*2))]++
    const mixedPalms=palms.filter(p=>trees.some(t=>new T.Vector3(...t.normal).distanceTo(new T.Vector3(...p.normal))<.4)).length
    if(southernTrees<7||Math.min(...sectors)<3||Math.max(...sectors)>12||mixedPalms<6)throw Error(`Biomes are segregated: ${JSON.stringify({southernTrees,sectors,mixedPalms})}`)
    if(Math.max(...trees.map(t=>t.size))-Math.min(...trees.map(t=>t.size))<.20)throw Error('Tree sizes lack variation')
    for(const [name,maxHeightScale,ratio] of [['biome-branching-trunks',.61,.70/.94],['biome-curved-palm-trunks',.62,.68/.92]]){
      const trunks=w.world.getObjectByName(name),matrix=new T.Matrix4(),scale=new T.Vector3()
      for(let i=0;i<trunks.count;i++){
        trunks.getMatrixAt(i,matrix);scale.setFromMatrixScale(matrix)
        if(scale.y>maxHeightScale||Math.abs(scale.y/scale.x-ratio)>.00001)throw Error('Trees have reverted to tall proportions')
      }
    }
    const water=w.world.getObjectByName('garden-pond-water').material
    if(water.specularIntensity!==0||water.clearcoat!==0||water.envMapIntensity!==0)throw Error('Water specular flare has returned')
    // Equal-area samples compare with the previous coast, not screen perspective.
    let previousWet=0,currentWet=0
    const lakeCenter=new T.Vector3(Math.cos(.18)*Math.sin(2.82),Math.sin(.18),Math.cos(.18)*Math.cos(2.82))
    for(let i=0;i<10000;i++){
      const y=1-(i+.5)*2/10000,a=i*2.39996323,n=new T.Vector3(Math.sqrt(1-y*y)*Math.cos(a),y,Math.sqrt(1-y*y)*Math.sin(a))
      const bay=.55*Math.exp((n.z/Math.max(.001,Math.hypot(n.x,n.z))-1)*5.2)*(1-T.MathUtils.smoothstep(Math.abs(y),.90,.99))
      const sea=(y+.82-bay)*.7,lake=n.distanceTo(lakeCenter)-.32,h=Math.max(.13-Math.abs(sea-lake),0)/.13
      const oldBank=Math.min(sea,lake)-h*h*.13*.25+.012*Math.sin(n.x*11+n.z*6)*Math.sin(y*9-n.z*4)
      if(oldBank<0)previousWet++;if(e.surface(n).bank<0)currentWet++
    }
    const waterAreaRatio=currentWet/previousWet
    if(waterAreaRatio>.82||waterAreaRatio<.40)throw Error(`Coast resizing is out of range: ${waterAreaRatio}`)
    // Trace the front shore: one crossing per meridian, no pinched cap/bay join.
    const coast=[]
    const direction=(lat,lon)=>new T.Vector3(Math.cos(lat)*Math.sin(lon),Math.sin(lat),Math.cos(lat)*Math.cos(lon))
    for(let i=0;i<=80;i++){
      const lon=-1+i*.025;let crossings=0,last=-1
      for(let j=0;j<=160;j++){
        const sign=Math.sign(e.surface(direction(-1.5+j*.009,lon)).bank)
        if(sign!==last){crossings++;last=sign}
      }
      if(crossings!==1)throw Error('Front coast contains disconnected/overlapping shoreline')
      let lo=-1.5,hi=-.06
      for(let j=0;j<35;j++){const mid=(lo+hi)/2;if(e.surface(direction(mid,lon)).bank<0)lo=mid;else hi=mid}
      coast.push((lo+hi)/2)
    }
    const coastBend=Math.max(...coast.slice(1,-1).map((v,i)=>Math.abs(coast[i]+coast[i+2]-2*v)))
    if(coastBend>.005)throw Error(`Coast has an abrupt join: ${coastBend}`)
    if(w.bubbles.children.length!==7||w.bubbles.parent===w.world||w.bubbles.children.some(b=>b.geometry.type!=='SphereGeometry'||!b.material.transparent||b.material.depthWrite))throw Error('Background bubbles must be transparent 3D spheres behind the island')
    const grass=w.world.getObjectByName('biome-meadow-grass')
    if(!e.underlays.includes(grass)||!grass.material.onBeforeCompile.toString().includes('instanceMatrix'))throw Error('Grass must share planet-space sinkhole clipping')
    const landmarks=w.world.children.filter(c=>c.name.startsWith('garden-landmark-'))
    for(const landmark of landmarks){
      const forward=new T.Vector3(0,0,1).applyQuaternion(landmark.quaternion)
      if(forward.dot(new T.Vector3(...landmark.userData.entranceDirection))<.999)throw Error('Building entrance does not face its path')
    }
    const authoredPieces=landmarks.reduce((sum,g)=>sum+(g.userData.authoredPieces||0),0)
    const buildingHeights={}
    for(const landmark of landmarks){
      landmark.updateMatrixWorld(true)
      const inverse=landmark.matrixWorld.clone().invert(),box=new T.Box3()
      landmark.traverse(child=>{
        if(!child.isMesh||child.name==='warm-doorway-pool')return
        const matrix=inverse.clone().multiply(child.matrixWorld),p=child.geometry.attributes.position
        for(let i=0;i<p.count;i++)box.expandByPoint(new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(matrix))
      })
      const id=landmark.name.replace('garden-landmark-','');buildingHeights[id]=box.max.y
      if(!landmark.userData.buildingScale)throw Error('Building lost its species-scale sizing')
    }
    for(const id of ['home','market','signal'])if(buildingHeights[id]>.65||buildingHeights[id]<.44)throw Error(`Neighbourhood building too tall/small: ${id}`)
    for(const id of ['park','dock'])if(buildingHeights[id]>.91||buildingHeights[id]<.72)throw Error(`Landmark height hierarchy lost: ${id}`)
    if(authoredPieces<450)throw Error('Detailed architecture has been replaced with simple placeholder props')
    if(!w.world.getObjectByName('console-loop-course')||!w.world.getObjectByName('console-arcade-bridge'))throw Error('Missing console stage silhouettes')
    for(const mesh of [e.terrain,...e.underlays].filter(m=>m.material.userData.consoleStyle)){
      const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>\n#include <clipping_planes_fragment>'}
      mesh.material.onBeforeCompile(shader,{})
      if(!shader.uniforms.uSinkCos||!shader.fragmentShader.includes('discard;'))throw Error('Surface detail disabled sinkhole clipping')
      const detail=mesh.name==='garden-promenade'?'vCourse':'consoleNoise'
      if(!shader.fragmentShader.includes(detail))throw Error('Sinkhole clipping removed console surface detail')
    }
    if(e.targets.length!==5)throw Error('Destination selection targets missing')
    w.world.updateMatrixWorld(true)
    for(const target of e.targets){
      const center=target.getWorldPosition(new T.Vector3()),normal=center.clone().normalize()
      const ray=new T.Raycaster(center.clone().addScaledVector(normal,2),normal.negate())
      if(ray.intersectObjects([e.terrain,...e.targets],false)[0]?.object!==target)throw Error(`Destination is not selectable: ${target.userData.id}`)
    }
    let maxRoadGap=0,minRoadBank=Infinity
    for(const road of w.world.children.filter(c=>c.name==='garden-promenade')){
      const p=road.geometry.attributes.position
      for(let i=0;i<p.count;i++){
        const point=new T.Vector3().fromBufferAttribute(p,i),sample=e.surface(point.clone().normalize())
        maxRoadGap=Math.max(maxRoadGap,Math.abs(point.length()-3-sample.height-.006));minRoadBank=Math.min(minRoadBank,sample.bank)
      }
      if(road.material.map)throw Error('Path should be solid geometry, not a distorted UV map')
      if(road.userData.closed)for(let side=0;side<2;side++){
        const first=new T.Vector3().fromBufferAttribute(p,side),last=new T.Vector3().fromBufferAttribute(p,p.count-2+side)
        if(first.distanceTo(last)>.00001)throw Error('Circular promenade has an open seam')
      }
    }
    if(maxRoadGap>.00001)throw Error('Path floats off terrain')
    if(minRoadBank<.075)throw Error('Promenade crosses wet, non-walkable ground')
    return {relief,worstNeighbor,maxRoadGap,minRoadBank,coastBend,waterAreaRatio,buildingHeights,shorterTrees:true,waterGlare:false,destinations:e.targets.length,authoredPieces,biomes,distribution:{southernTrees,sectors,mixedPalms},bubbles:w.bubbles.children.length,composedSurfaceShaders:true}
  })
  for(const [name,rotation] of [['front',[-.08,.30,-.10]],['side',[.1,1.4,0]],['back',[.1,3,0]]]){
    await page.evaluate(r=>window.gardenApp.world.world.rotation.set(...r),rotation);await page.waitForTimeout(400)
    await page.screenshot({path:join(output,`${name}.png`)})
  }
  await page.setViewportSize({width:390,height:844})
  await page.evaluate(()=>window.gardenApp.world.world.rotation.set(-.08,.30,-.10));await page.waitForTimeout(700)
  await page.screenshot({path:join(output,'mobile.png')})
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.evaluate(async()=>{
    const {createPlanetBubbles}=await import('/src/planet-bubbles.ts'),T=window.gardenThree
    const scene=new T.Scene(),camera=new T.PerspectiveCamera(34,1,.1,80);camera.position.z=14;camera.lookAt(0,0,0)
    const bubbles=createPlanetBubbles(scene,camera);bubbles.update(1000,true)
    const before=bubbles.group.children.map(b=>b.position.toArray())
    bubbles.update(10000,true)
    if(bubbles.group.children.some((b,i)=>b.position.toArray().some((n,j)=>n!==before[i][j])))throw Error('Reduced motion still animates bubbles')
    bubbles.setNight(true)
    if(bubbles.group.children[0].material.uniforms.uLight.value!==.65)throw Error('Bubble night tint failed')
    bubbles.update(11000,false);if(bubbles.group.visible)throw Error('Bubbles must hide during the character reveal')
    bubbles.group.children[0].geometry.dispose();bubbles.group.children[0].material.dispose()
  })
  await page.emulateMedia({reducedMotion:'no-preference'})
  const bubbleMotion=await page.evaluate(async()=>{
    const {createPlanetBubbles}=await import('/src/planet-bubbles.ts'),T=window.gardenThree
    const scene=new T.Scene(),camera=new T.PerspectiveCamera(34,1.44,.1,80);camera.position.z=14;camera.lookAt(0,0,0)
    const bubbles=createPlanetBubbles(scene,camera),pixels=()=>bubbles.group.children.map(b=>{
      const p=b.position.clone().project(camera);return new T.Vector2(p.x*720,p.y*500)
    })
    bubbles.update(1000,true);const before=pixels();bubbles.update(3000,true);const after=pixels()
    const averagePixelsInTwoSeconds=after.reduce((sum,p,i)=>sum+p.distanceTo(before[i]),0)/after.length
    if(averagePixelsInTwoSeconds<10||averagePixelsInTwoSeconds>65)throw Error(`Bubble drift is too slow/fast: ${averagePixelsInTwoSeconds}`)
    let last=after,maxFrameStep=0
    for(let i=1;i<=120;i++){
      bubbles.update(3000+i*1000/60,true);const next=pixels()
      maxFrameStep=Math.max(maxFrameStep,...next.map((p,j)=>p.distanceTo(last[j])));last=next
    }
    if(maxFrameStep>2)throw Error('Bubble motion jumps between frames')
    bubbles.group.children[0].geometry.dispose();bubbles.group.children[0].material.dispose()
    return {averagePixelsInTwoSeconds,maxFrameStep}
  })
  // Inspect the actual architecture from a ground-level oblique camera as well
  // as the globe views. Clone the production scene, sharing its real materials.
  await page.setViewportSize({width:1100,height:850})
  await page.evaluate(async()=>{
    const w=window.gardenApp.world,T=window.gardenThree;w.close()
    w.world.rotation.set(0,0,0)
    const scene=w.world.parent.clone(true);scene.background=new T.Color('#32a7cf')
    scene.getObjectByName('island-sky-bubbles').visible=false
    const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight)
    renderer.toneMapping=T.NeutralToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap
    Object.assign(renderer.domElement.style,{position:'fixed',inset:'0',zIndex:'9999999'});document.body.append(renderer.domElement)
    const camera=new T.PerspectiveCamera(38,innerWidth/innerHeight,.05,30)
    const {createResidentRig}=await import('/src/resident-model.ts')
    const rig=createResidentRig(1);rig.group.scale.setScalar(.24);scene.add(rig.group)
    window.gardenDetail={scene,renderer,camera,resident:rig.group}
  })
  for(const id of ['home','park','dock','forest']){
    await page.evaluate(id=>{
      const {scene,renderer,camera,resident}=window.gardenDetail,T=window.gardenThree,g=scene.getObjectByName(id==='forest'?'woodland-root-arch':`garden-landmark-${id}`)
      scene.updateMatrixWorld(true)
      const center=g.getWorldPosition(new T.Vector3()),up=new T.Vector3(0,1,0).applyQuaternion(g.quaternion),front=new T.Vector3(0,0,1).applyQuaternion(g.quaternion),right=new T.Vector3(1,0,0).applyQuaternion(g.quaternion)
      const n=center.clone().addScaledVector(right,.34).addScaledVector(front,.30).normalize()
      resident.visible=id!=='forest';resident.position.copy(n).multiplyScalar(3+window.gardenApp.world.environment.surface(n).height)
      const facing=front.clone().projectOnPlane(n).normalize()
      resident.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(new T.Vector3().crossVectors(n,facing).normalize(),n,facing))
      camera.position.copy(center).addScaledVector(up,1.55).addScaledVector(front,1.95).addScaledVector(right,1.05)
      camera.up.copy(up);camera.lookAt(center.clone().addScaledVector(up,.35));renderer.render(scene,camera)
    },id)
    await page.screenshot({path:join(output,`detail-${id}.png`)})
  }
  if(errors.length)throw Error(errors.join('\n'))
  const render=await page.evaluate(()=>window.gardenDetail.renderer.info.render)
  console.log(JSON.stringify({geometry,bubbleMotion,render,errors,output},null,2))
}finally{await browser.close()}
