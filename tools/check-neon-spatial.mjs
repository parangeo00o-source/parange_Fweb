import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const output=await mkdtemp(join(tmpdir(),'parange-neon-spatial-'))
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:900}})
  const errors=[];page.on('pageerror',e=>errors.push(String(e)))
  await page.goto(process.env.REVIEW_URL||'https://localhost:5173');await page.waitForLoadState('networkidle')
  const geometry=await page.evaluate(async()=>{
    const T=await import('/node_modules/.vite/deps/three.js'),{surfaceAngle,sphereOccludes,clippedScreenPolygon,neonGroundPoint,neonGroundRadius}=await import('/src/neon-projection.ts')
    for(let i=0;i<360;i++){
      const n=new T.Vector3(Math.sin(i),Math.cos(i),Math.sin(i*.7)).normalize()
      if(Math.abs(neonGroundPoint(n).length()-neonGroundRadius)>1e-10)throw Error('Ground anchor floats above the illustrated surface')
      for(const lift of [0,.23,.85,-.2])if(Math.abs(neonGroundPoint(n,lift).length()-neonGroundRadius-lift)>1e-10)throw Error('Intentional holding/hopping lift was lost')
    }
    let alignmentError=0
    for(let i=0;i<360;i++){const a=i*Math.PI/180,up={x:Math.sin(a),y:-Math.cos(a)},angle=surfaceAngle({x:0,y:0},up);alignmentError=Math.max(alignmentError,Math.abs(1-(Math.sin(angle)*up.x-Math.cos(angle)*up.y)))}
    if(alignmentError>1e-10)throw Error('Surface-up direction is clamped or inverted')
    const eye=new T.Vector3(0,0,5),n=new T.Vector3(Math.sqrt(.75),0,.5)
    if(!sphereOccludes(n.clone().multiplyScalar(3.03),eye)||sphereOccludes(n.clone().multiplyScalar(4.2),eye))throw Error('Horizon must hide the root without hiding a visible crown')
    const camera=new T.PerspectiveCamera(34,1280/900,.1,80);camera.updateMatrixWorld(true)
    const clipped=clippedScreenPolygon([new T.Vector3(-2,-1,-2),new T.Vector3(2,-1,-2),new T.Vector3(0,2,.5)],camera,1280,900)
    if(clipped.length<3||clipped.some(p=>!Number.isFinite(p.x+p.y)||p.x<-.001||p.y<-.001||p.x>1280.001||p.y>900.001))throw Error('Near-plane clipping produced invalid/off-screen vertices')
    const {createParangePlanetExperience}=await import('/src/parange-planet.ts'),{createPlanetNeon}=await import('/src/planet-neon.ts'),{createResidentRig}=await import('/src/resident-model.ts')
    window.app=createParangePlanetExperience();app.open();app.world.close()
    for(let i=0;i<16;i++)app.world.village.add({...createResidentRig(i),designIndex:i,name:'Review '+i,portrait:'',trait:'',mapped:false},new T.Vector3((i%4-1.5)*.3,(Math.floor(i/4)-1.5)*.25,1).normalize())
    app.world.world.rotation.set(0,0,0);app.world.world.updateMatrixWorld(true)
    window.art=createPlanetNeon(document.querySelector('.planet-canvas'),app.world.world,app.world.camera,app.world.environment.surface);art.resize();art.setVisible(true)
    const {loadResidentArtwork}=await import('/src/neon-illustration.ts');if(!await loadResidentArtwork())throw Error('Native character artwork unavailable')
    document.querySelector('.planet-screen').classList.add('is-neon','planet-acid-ui')
    window.reviewFrame=(position,target,time=5000)=>{app.world.camera.position.set(...position);app.world.camera.up.set(0,1,0);app.world.camera.lookAt(...target);app.world.camera.updateMatrixWorld(true);art.render(time,app.world.village.residents,null,app.world.village.sinkhole,null)}
    window.reviewClose=(distance)=>{
      const w=app.world,r=w.village.residents[0],n=r.normal.clone(),tangent=new T.Vector3().crossVectors(new T.Vector3(0,1,0),n).normalize(),base=r.model.group.getWorldPosition(new T.Vector3())
      w.camera.position.copy(base).addScaledVector(n,.42).addScaledVector(tangent,distance);w.camera.up.copy(n);w.camera.lookAt(base.clone().addScaledVector(n,.20));w.camera.updateMatrixWorld(true)
      art.render(5000,w.village.residents.filter(x=>x!==r),null,w.village.sinkhole,null);const empty=art.layer.toDataURL()
      art.render(5000,w.village.residents,null,w.village.sinkhole,r.model.id);if(empty===art.layer.toDataURL())throw Error('Focused resident vanished at close distance '+distance)
    }
    // Raising a 3D origin must no longer raise its Neon illustration. A deliberate
    // simulation lift must still move it (meeting hops and drag-and-hold).
    const r=app.world.village.residents[0],saved=r.model.group.position.clone(),savedNormal=r.normal.clone()
    r.normal.set(0,0,1);r.model.group.position.set(0,0,3.1);r.model.group.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),r.normal)
    const renderOne=()=>{app.world.camera.position.set(3,0,16);app.world.camera.up.set(0,1,0);app.world.camera.lookAt(0,0,0);app.world.camera.updateMatrixWorld(true);art.render(5000,[r],null,app.world.village.sinkhole,null);return art.layer.toDataURL()}
    renderOne();const grounded=renderOne();r.model.group.position.z+=.8
    if(renderOne()!==grounded)throw Error('Neon still inherits the raised 3D terrain origin')
    r.lift=.23;if(renderOne()===grounded)throw Error('Holding lift was flattened onto the ground')
    r.lift=0;r.normal.copy(savedNormal);r.model.group.position.copy(saved)
    r.model.group.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),r.normal)
    return {alignmentError,nearPlaneVertices:clipped.length,horizonCrownVisible:true,groundedRadius:neonGroundRadius,terrainIndependent:true,intentionalLiftPreserved:true}
  })
  for(const [name,position,target] of [['globe',[0,0,16],[0,0,0]],['close',[0,.6,3.8],[0,0,3]],['extreme-close',[0,.12,3.26],[0,0,3.05]],['grazing',[2.8,.4,2.6],[0,0,2.8]]]){
    if(name==='close'||name==='extreme-close')await page.evaluate(distance=>reviewClose(distance),name==='close'?1.2:.5)
    else await page.evaluate(({position,target})=>reviewFrame(position,target),{position,target})
    await page.screenshot({path:join(output,name+'.png')})
  }
  const art=await page.evaluate(async()=>{
    const {createNeonBackground,drawSkyFish,skyFishDesigns}=await import('/src/neon-background.ts')
    const bg=createNeonBackground();await bg.ready
    const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=600;canvas.id='fish-review';Object.assign(canvas.style,{position:'fixed',inset:0,zIndex:99999,width:'100vw',background:'#eaf7f6'});document.body.append(canvas)
    const c=canvas.getContext('2d'),hashes=[]
    for(let i=0;i<skyFishDesigns.length;i++){const tile=document.createElement('canvas');tile.width=300;tile.height=300;const tc=tile.getContext('2d');tc.translate(150,150);tc.scale(2,2);drawSkyFish(tc,i);hashes.push(tile.toDataURL());c.save();c.translate(250+i%2*500,150+Math.floor(i/2)*300);c.scale(1.7,1.7);drawSkyFish(c,i);c.restore()}
    if(new Set(hashes).size!==skyFishDesigns.length)throw Error('Fish patterns are not distinct')
    bg.resize(300,200);const tile=document.createElement('canvas');tile.width=300;tile.height=200;const tc=tile.getContext('2d');bg.render(tc,0);const first=tile.toDataURL();bg.render(tc,9000);const second=tile.toDataURL();bg.render(tc,0);if(first===second||first!==tile.toDataURL())throw Error('Background motion/reduced-motion determinism failed')
    reviewFrame([0,0,16],[0,0,0]);const start=performance.now();for(let i=0;i<20;i++)reviewFrame([0,0,16],[0,0,0],10000+i*16)
    return {fishDesigns:[...skyFishDesigns],backgroundMotion:true,deterministicReducedMotion:true,meanCachedRenderMs:(performance.now()-start)/20}
  })
  await page.locator('#fish-review').screenshot({path:join(output,'illustrated-sky-fish.png')})
  assert.deepEqual(errors,[]);console.log(JSON.stringify({geometry,art,errors,output},null,2))
}finally{await browser.close()}
