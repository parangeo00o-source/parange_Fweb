import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const output=await mkdtemp(join(tmpdir(),'parange-neon-3d-'))
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:900}}),errors=[]
  page.on('pageerror',e=>errors.push(String(e)))
  page.on('console',m=>{if(m.type()==='error'&&/THREE.WebGLProgram|Shader Error/.test(m.text()))errors.push(m.text())})
  await page.route('**/src/planet-world.ts*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace('renderer.setPixelRatio(','window.reviewRenderer=renderer;renderer.setPixelRatio(')})})
  await page.goto('https://localhost:5173');await page.waitForLoadState('networkidle')
  const result=await page.evaluate(async()=>{
    const {createParangePlanetExperience}=await import('/src/parange-planet.ts'),{createResidentRig}=await import('/src/resident-model.ts'),T=await import('/node_modules/.vite/deps/three.js')
    window.app=createParangePlanetExperience();app.open();app.world.close()
    const w=app.world
    for(let i=0;i<16;i++)w.village.add({...createResidentRig(i),designIndex:i,name:'Neighbor '+i,portrait:'',trait:'',mapped:false},new T.Vector3((i%4-1.5)*.22,(Math.floor(i/4)-1.5)*.22,1).normalize())
    w.world.rotation.set(-.08,.3,-.1);w.world.updateMatrixWorld(true)
    w.camera.position.set(0,0,16);w.camera.up.set(0,1,0);w.camera.lookAt(0,0,0);w.camera.updateMatrixWorld(true)
    w.bubbles.visible=false
    const signature=()=>{const values=[];w.world.traverse(o=>{if(o.isMesh)values.push([o.uuid,o.geometry.uuid,o.geometry.attributes.position.version,o.geometry.index?.version,o.isInstancedMesh?o.instanceMatrix.version:0,...o.position.toArray(),...o.scale.toArray()])});return JSON.stringify(values)}
    const geometry=signature(),scene=w.world.parent
    const draw=()=>{reviewRenderer.render(scene,w.camera);return reviewRenderer.domElement.toDataURL()}
    const day=draw(),drawCalls=reviewRenderer.info.render.calls
    w.setMode('neon');const neon=draw(),neonCalls=reviewRenderer.info.render.calls
    if(day===neon)throw Error('Neon material did not change the 3D render')
    if(signature()!==geometry)throw Error('Material edition changed geometry or object placements')
    if(neonCalls!==drawCalls)throw Error('Neon adds duplicate geometry/outline passes')
    w.setMode('day');if(draw()!==day)throw Error('Daylight image did not restore pixel-for-pixel')
    w.setMode('night');const night=draw();w.setMode('neon');draw();w.setMode('night')
    if(draw()!==night)throw Error('Moonlight image did not restore pixel-for-pixel')
    w.setMode('neon')
    document.querySelector('.planet-screen').classList.add('is-neon','planet-acid-ui')
    const tabs=[...document.querySelectorAll('[data-mode]')];tabs.forEach(t=>t.setAttribute('aria-selected',String(t.dataset.mode==='neon')))
    window.reviewAngle=(angle)=>{w.world.rotation.y=angle;w.world.updateMatrixWorld(true);draw()}
    window.reviewClose=()=>{const r=w.village.residents[0],n=r.normal.clone().transformDirection(w.world.matrixWorld),p=r.model.group.getWorldPosition(new T.Vector3());w.camera.position.copy(p).addScaledVector(n,.4).add(new T.Vector3(.6,0,1));w.camera.up.copy(n);w.camera.lookAt(p.clone().addScaledVector(n,.22));w.camera.updateMatrixWorld(true);draw()}
    return {sameGeometry:true,samePlacement:true,dayPixelRestore:true,nightPixelRestore:true,drawCalls,neonCalls}
  })
  // Material identity test uses frozen frames. Let the app paint the retained
  // illustrated sky, then freeze again for the turntable screenshots.
  await page.evaluate(()=>app.world.open());await page.waitForTimeout(300);await page.evaluate(()=>app.world.close())
  for(const [name,angle] of [['front',.3],['side',1.3],['back',3.3],['other-side',4.8]]){
    await page.evaluate(angle=>reviewAngle(angle),angle)
    await page.screenshot({path:join(output,name+'.png')})
  }
  await page.evaluate(()=>{reviewAngle(.3);reviewClose()});await page.screenshot({path:join(output,'close.png')})
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({...result,angles:4,closeup:true,errors,output},null,2))
}finally{await browser.close()}
