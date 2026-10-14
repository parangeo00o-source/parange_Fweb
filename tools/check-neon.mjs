import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const output=await mkdtemp(join(tmpdir(),'parange-neon-'))
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000},deviceScaleFactor:2})
  const errors=[];page.on('pageerror',e=>errors.push(String(e)))
  page.on('console',message=>{if(message.type()==='error'&&/THREE.WebGLProgram|Shader Error|VALIDATE_STATUS/.test(message.text()))errors.push(message.text())})
  await page.route('**/src/planet-world.ts*',async route=>{const response=await route.fetch(),body=await response.text();await route.fulfill({response,body:body.replace('renderer.setPixelRatio(','window.neonRenderer=renderer;renderer.setPixelRatio(')})})
  await page.goto(process.env.REVIEW_URL||'https://localhost:5173');await page.waitForLoadState('networkidle')
  await page.evaluate(async()=>{
    const {createParangePlanetExperience}=await import('/src/parange-planet.ts'),{createResidentRig}=await import('/src/resident-model.ts'),T=await import('/node_modules/.vite/deps/three.js')
    window.app=createParangePlanetExperience();app.open()
    for(let i=0;i<16;i++)app.world.village.add({...createResidentRig(i),designIndex:i,name:'Friend '+i,portrait:'',trait:'Curious explorer',mapped:false},new T.Vector3((i%4-1.5)*.3,(Math.floor(i/4)-1.5)*.25,1).normalize())
    window.ids=app.world.village.residents.map(r=>r.model.id)
    window.dayLights=app.world.world.parent.children.filter(o=>o.isLight).map(o=>[o.uuid,o.intensity,o.color.getHex()])
    window.originalGeometry=[];app.world.world.traverse(o=>{if(o.isMesh)originalGeometry.push([o.uuid,o.geometry.uuid,o.geometry.attributes.position.count,o.isInstancedMesh?o.count:0])})
  })
  assert.deepEqual(await page.locator('[role=tab]').allTextContents(),['☼Sunlight Walk','☾Moonlight Walk','✳Neon Walk3D'])
  await page.locator('[data-mode=night]').click();assert.equal(await page.evaluate(()=>app.world.mode),'night')
  await page.locator('[data-mode=neon]').click();await page.waitForTimeout(900)
  await page.evaluate(async()=>{const {loadResidentArtwork}=await import('/src/neon-illustration.ts');if(!await loadResidentArtwork())throw Error('Native character artwork unavailable')})
  assert.equal(await page.evaluate(()=>app.world.mode),'neon')
  const frame=await page.evaluate(()=>neonRenderer.info.render.frame);await page.waitForTimeout(150)
  assert.ok(await page.evaluate(()=>neonRenderer.info.render.frame)>frame,'Neon must render the original 3D world')
  await page.evaluate(()=>{
    const current=[];app.world.world.traverse(o=>{if(o.isMesh)current.push([o.uuid,o.geometry.uuid,o.geometry.attributes.position.count,o.isInstancedMesh?o.count:0])})
    if(JSON.stringify(current)!==JSON.stringify(originalGeometry))throw Error('Neon replaced or changed the original 3D geometry')
    const sky=document.querySelector('.planet-neon-canvas'),world=document.querySelector('.planet-canvas')
    if(!(sky.compareDocumentPosition(world)&Node.DOCUMENT_POSITION_FOLLOWING)||getComputedStyle(world).opacity!=='1')throw Error('Illustrated sky must stay behind the visible 3D canvas')
  })
  assert.equal(await page.locator('.planet-neon-canvas').isVisible(),true)
  await page.screenshot({path:join(output,'neon-desktop.png')})
  const drawings=await page.evaluate(async()=>{
    const {neonResidentPortrait,drawNeonResident}=await import('/src/neon-illustration.ts')
    const images=new Set(Array.from({length:16},(_,i)=>neonResidentPortrait(i)));if(images.size!==16)throw Error('Not 16 distinct illustrations')
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=700;canvas.id='neon-roster-review';Object.assign(canvas.style,{position:'fixed',inset:'0',zIndex:'99999',width:'100vw',height:'auto',background:'#fffbee'});document.body.append(canvas)
    const c=canvas.getContext('2d');for(let i=0;i<16;i++){c.save();c.translate(150+(i%4)*300,165+Math.floor(i/4)*175);drawNeonResident(c,i);c.restore()}
    return images.size
  })
  await page.locator('#neon-roster-review').screenshot({path:join(output,'neon-16-characters.png')});await page.locator('#neon-roster-review').evaluate(e=>e.remove())
  // Pick the actual 3D face; the same raycast now serves every edition.
  const target=await page.evaluate(async()=>{const T=await import('/node_modules/.vite/deps/three.js'),w=app.world,r=w.village.residents[0];r.pauseUntil=performance.now()+10000;w.world.updateMatrixWorld(true);const p=r.model.group.getObjectByName('neck-head').localToWorld(new T.Vector3(0,0,.1)).project(w.camera);return{x:(p.x*.5+.5)*innerWidth,y:(.5-p.y*.5)*innerHeight}})
  await page.mouse.click(target.x,target.y);await page.waitForTimeout(800)
  assert.ok(await page.evaluate(()=>app.world.village.state.following),'Illustrated resident click must follow')
  await page.screenshot({path:join(output,'neon-follow.png')})
  await page.evaluate(()=>app.world.reset());await page.waitForTimeout(500)
  await page.locator('.planet-meeting').click();assert.equal(await page.evaluate(()=>app.world.village.state.meeting),true)
  await page.locator('.planet-meeting').click()
  for(const [width,height] of [[390,844],[320,640],[844,390]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(300)
    const tabs=await page.locator('.planet-mode-tabs').boundingBox();assert.ok(tabs.x>=0&&tabs.x+tabs.width<=width)
    assert.ok(await page.evaluate(()=>{const c=document.querySelector('.planet-neon-canvas');return c.width*c.height<=4_000_000}))
    await page.screenshot({path:join(output,`neon-${width}.png`)})
  }
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'})
  await page.evaluate(async()=>{
    const {createResidentRig}=await import('/src/resident-model.ts'),{createPlanetArrival}=await import('/src/planet-arrival.ts')
    document.querySelector('.planet-arrival').remove();document.querySelector('.planet-reveal-backdrop').remove()
    const ui=createPlanetArrival(document.querySelector('.planet-screen')),model={...createResidentRig(2),designIndex:2,name:'Neon Bunny',portrait:'',trait:'Little explorer',mapped:false}
    app.world.prepareResident(model);ui.show(model);document.querySelector('.planet-screen').classList.add('is-joining');window.landed=false
    app.world.presentResident(model,ui.fly,()=>{window.landed=true;ui.hide();document.querySelector('.planet-screen').classList.remove('is-joining')},ui.getFrame,ui.update)
  })
  await page.waitForTimeout(350);await page.screenshot({path:join(output,'neon-capsule-reduced.png')})
  await page.waitForFunction(()=>window.landed)
  assert.equal(await page.evaluate(()=>app.world.village.residents.length),17)
  await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:1440,height:1000})
  await page.evaluate(async()=>{
    const {createResidentRig}=await import('/src/resident-model.ts'),{createPlanetArrival}=await import('/src/planet-arrival.ts')
    document.querySelector('.planet-arrival').remove();document.querySelector('.planet-reveal-backdrop').remove()
    const ui=createPlanetArrival(document.querySelector('.planet-screen')),model={...createResidentRig(0),designIndex:0,name:'Neon Fox',portrait:'',trait:'Little explorer',mapped:false}
    app.world.prepareResident(model);ui.show(model);document.querySelector('.planet-screen').classList.add('is-joining');window.landed=false
    app.world.presentResident(model,ui.fly,()=>{window.landed=true;ui.hide();document.querySelector('.planet-screen').classList.remove('is-joining')},ui.getFrame,ui.update)
  })
  await page.waitForTimeout(700);await page.screenshot({path:join(output,'neon-capsule-roll.png')})
  await page.waitForTimeout(1700);await page.screenshot({path:join(output,'neon-capsule-open.png')})
  await page.waitForTimeout(1500);await page.screenshot({path:join(output,'neon-capsule-turn.png')})
  await page.waitForFunction(()=>window.landed)
  assert.equal(await page.evaluate(()=>app.world.village.residents.length),18)
  await page.locator('[data-mode=day]').click();await page.waitForTimeout(300)
  assert.equal(await page.locator('.planet-neon-canvas').isVisible(),false)
  await page.evaluate(()=>{if(JSON.stringify(app.world.world.parent.children.filter(o=>o.isLight).map(o=>[o.uuid,o.intensity,o.color.getHex()]))!==JSON.stringify(dayLights))throw Error('Basic edition lighting changed');if(ids.some(id=>!app.world.village.residents.some(r=>r.model.id===id)))throw Error('Resident lost across editions')})
  await page.locator('[data-mode=day]').focus();await page.keyboard.press('ArrowLeft');assert.equal(await page.evaluate(()=>app.world.mode),'neon')
  await page.evaluate(()=>app.close());assert.equal(await page.locator('.planet-screen').getAttribute('aria-hidden'),'true')
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({drawings,statePreserved:true,original3DGeometryPreserved:true,neonWebGLRendering:true,follow:true,meeting:true,reducedArrivalLanded:true,regularArrivalLanded:true,mobile:true,keyboard:true,errors,output},null,2))
}finally{await browser.close()}
