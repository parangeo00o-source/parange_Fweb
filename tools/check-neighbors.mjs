import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output=await mkdtemp(join(tmpdir(),'parange-neighbor-check-'))
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']})
try {
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}})
  const errors=[];page.on('pageerror',e=>errors.push(String(e)))
  page.on('console',m=>{if(m.type()==='error'&&/THREE.WebGLProgram|Shader Error/.test(m.text()))errors.push(m.text())})
  await page.goto(process.env.REVIEW_URL||'https://localhost:5173')
  const setup=async()=>page.evaluate(async()=>{
    const {createParangePlanetExperience}=await import('/src/parange-planet.ts')
    window.testThree=await import('/node_modules/.vite/deps/three.js')
    window.testApp=createParangePlanetExperience();window.testApp.open()
  })
  await page.evaluate(()=>localStorage.setItem('parange.planet.residents.v1',JSON.stringify({version:1,nextNumber:1,expelled:[],residents:[
    {id:'old-1',name:'',designIndex:0,normal:[-.5,.6,.6]},{id:'old-2',designIndex:1,normal:[.5,.3,.8]},
  ]})))
  await setup()
  const initial=await page.evaluate(async()=>{
    const {residentLines,createDialogueDeck}=await import('/src/resident-lines.ts')
    if(residentLines.length!==100||new Set(residentLines).size!==100)throw Error('Dialogue must contain exactly 100 unique lines')
    if(residentLines.some(line=>!/[가-힣]/.test(line)||/[a-z]/i.test(line)))throw Error('Dialogue must be fully localized into Korean')
    const next=createDialogueDeck(),cycle=Array.from({length:100},next)
    if(new Set(cycle).size!==100||next()===cycle[99])throw Error('Dialogue repeats within its shuffled cycle')
    const village=window.testApp.world.village
    if(village.residents.map(r=>r.model.name).join()!=='주민 1,주민 2')throw Error('Legacy names not migrated')
    const {createResidentRig}=await import('/src/resident-model.ts')
    const model={...createResidentRig(2),name:'  Mochi  ',customName:true,trait:'A little explorer',mapped:false,portrait:''}
    village.add(model,village.safePosition(new window.testThree.Vector3(.1,.8,.7).normalize()))
    if(model.name!=='Mochi'||!model.id)throw Error('Custom name/identity was not assigned')
    return {names:village.residents.map(r=>r.model.name),lines:residentLines.length}
  })
  const faceFront=async(index=0)=>{
    await page.evaluate(index=>{
      const w=window.testApp.world,T=window.testThree;w.reset()
      w.world.quaternion.setFromUnitVectors(w.village.residents[index].normal,new T.Vector3(0,0,1))
      w.village.residents.forEach(r=>{r.pauseUntil=performance.now()+60000;r.turnAt=performance.now()+60000})
    },index)
    await page.waitForTimeout(900)
  }
  const point=()=>page.evaluate(()=>{
    const w=window.testApp.world,p=w.village.residents[0].model.group.getObjectByName('neck-head').localToWorld(new window.testThree.Vector3(0,0,.1)).project(w.camera)
    return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2}
  })
  const hold=async()=>{await faceFront();const p=await point();await page.mouse.move(p.x,p.y);await page.mouse.down();await page.waitForTimeout(750)}
  const overHole=async()=>{
    const p=await page.evaluate(()=>{
      const w=window.testApp.world,p=w.world.getObjectByName('resident-sinkhole').getWorldPosition(new window.testThree.Vector3()).project(w.camera)
      return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2}
    })
    await page.mouse.move(p.x,p.y,{steps:14});await page.waitForTimeout(100)
    if(!await page.evaluate(()=>window.testApp.world.village.state.overSinkhole))throw Error('Sinkhole was not hit by pointer ray')
  }
  await faceFront()
  let p=await point();await page.mouse.click(p.x,p.y)
  await page.waitForSelector('.planet-dialogue:not([hidden])')
  const first=await page.locator('.planet-dialogue-text').innerText()
  await page.waitForTimeout(350)
  const growing=await page.locator('.planet-dialogue-text').innerText()
  if(growing.length<=first.length)throw Error('Typewriter did not advance')
  // On a busy GPU the line can finish before Playwright dispatches the click;
  // Only invoke the complete-line action while the component is actually typing.
  if(await page.locator('.planet-dialogue').evaluate(el=>el.classList.contains('is-typing')))
    await page.locator('.planet-dialogue-next').click()
  if(await page.locator('.planet-dialogue').evaluate(el=>el.classList.contains('is-typing')))
    await page.locator('.planet-dialogue-next').click()
  const full=await page.locator('.planet-dialogue-text').innerText()
  if(!await page.evaluate(async text=>(await import('/src/resident-lines.ts')).residentLines.includes(text),full))throw Error('Read-all did not complete dialogue')
  if(!(await page.locator('.planet-dialogue-next').innerText()).includes('TELL ME MORE'))throw Error('Original dialogue action was not preserved')
  await page.screenshot({path:join(output,'dialogue-desktop.png')})
  await page.locator('.planet-dialogue-next').click();await page.locator('.planet-dialogue-next').click()
  if(await page.locator('.planet-dialogue-text').innerText()===full)throw Error('Next dialogue repeated')
  await page.locator('.planet-dialogue-exit').click()
  if(await page.locator('.planet-dialogue').isVisible())throw Error('Dialogue did not hide on globe view')
  await hold()
  // A hold followed by release in place is never consent to permanent expulsion.
  const stationaryCount=await page.evaluate(()=>window.testApp.world.village.residents.length)
  await page.mouse.up();await page.waitForTimeout(1100)
  if(!await page.evaluate(count=>window.testApp.world.village.residents.length===count&&!window.testApp.world.village.sinkhole.visible,stationaryCount))throw Error('Stationary release expelled a resident or left the hole open')
  await hold()
  const before=await page.evaluate(()=>{
    const w=window.testApp.world,v=w.village
    if(!v.state.holding||!v.sinkhole.open)throw Error('Holding did not create a sinkhole')
    const distance=v.sinkhole.normal.distanceTo(v.residents[0].normal)
    if(distance<.2||distance>.5)throw Error(`Sinkhole must be safely beside this resident: ${distance}`)
    if(v.sinkhole.outerRadius<.4||w.world.getObjectByName('resident-sinkhole').scale.x<1.7)throw Error('Sinkhole is not enlarged')
    if(v.sinkhole.contains(v.residents[0].normal)||!v.sinkhole.contains(v.sinkhole.normal))throw Error('Enlarged sinkhole hit area is incorrect')
    const pad=v.sinkhole.outerRadius/(3+w.environment.surface(v.sinkhole.normal).height)
    if(w.environment.obstacles.some(o=>o.normal.distanceTo(v.sinkhole.normal)<o.radius+pad))throw Error('Large sinkhole overlaps scenery')
    return {count:v.residents.length,id:v.residents[0].model.id,normal:v.residents[0].normal.toArray(),sinkholeDistance:distance,diameter:v.sinkhole.outerRadius*2}
  })
  await page.screenshot({path:join(output,'sinkhole-nearby.png')})
  await overHole();await page.screenshot({path:join(output,'sinkhole-hover.png')})
  await page.locator('.planet-canvas').dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up()
  const cancelOK=await page.evaluate(before=>{
    const v=window.testApp.world.village
    return v.residents.length===before.count&&!v.state.holding&&v.residents[0].normal.distanceTo(new window.testThree.Vector3(...before.normal))<.001
  },before)
  if(!cancelOK)throw Error('Pointer cancellation accidentally expelled or moved a resident')
  await page.waitForTimeout(1200)
  if(await page.evaluate(()=>window.testApp.world.village.sinkhole.visible))throw Error('Cancelled drop left a visible hole')
  await hold();await overHole();await page.mouse.up()
  const expelled=await page.evaluate(()=>JSON.parse(localStorage.getItem('parange.planet.residents.v1')))
  if(expelled.residents.length!==before.count-1||!expelled.expelled.includes(before.id))throw Error('Expulsion was not durably recorded')
  await page.waitForTimeout(1500)
  if(await page.evaluate(()=>window.testApp.world.village.sinkhole.visible))throw Error('Sinkhole did not close after expulsion')
  await page.reload();await setup()
  const restored=await page.evaluate(async id=>{
    const v=window.testApp.world.village
    if(v.residents.length!==2||v.residents.some(r=>r.model.id===id))throw Error('Expelled resident returned after reload')
    const {createResidentRig}=await import('/src/resident-model.ts')
    const stale={...createResidentRig(0),id,designIndex:0,name:'Stale copy',portrait:'',trait:'',mapped:false}
    if(v.add(stale,new window.testThree.Vector3(0,0,1))!==false||stale.group.children.length)throw Error('Tombstone did not reject/dispose stale resident')
    return v.residents.map(r=>r.model.name)
  },before.id)
  const storageEdges=await page.evaluate(async()=>{
    const {createResidentStore,normalizeResidentName}=await import('/src/resident-store.ts')
    const key='parange.planet.residents.v1',backup=localStorage.getItem(key)
    try {
      localStorage.setItem(key,JSON.stringify({version:1,nextNumber:1,residents:[],expelled:[]}))
      const first=createResidentStore(),identity=first.identity('Test')
      const record={...identity,designIndex:0,normal:[0,0,1]}
      first.save([record]);const stale=createResidentStore();first.expel(identity.id);stale.save([record])
      const latest=createResidentStore()
      if(latest.records.length||!latest.isExpelled(identity.id))throw Error('Stale save resurrected an expelled resident')
      const original=Storage.prototype.setItem
      try {
        Storage.prototype.setItem=()=>{throw new DOMException('Full','QuotaExceededError')}
        const blocked=createResidentStore();blocked.identity('No quota')
        if(blocked.available)throw Error('Storage failure was not detected')
      }finally{Storage.prototype.setItem=original}
      if(normalizeResidentName('  별빛\n  모찌  ')!=='별빛 모찌')throw Error('Name whitespace is not normalized')
      return {staleSave:true,quotaFailure:true}
    }finally{localStorage.setItem(key,backup)}
  })
  await page.setViewportSize({width:390,height:844});await faceFront()
  p=await point();await page.mouse.click(p.x,p.y);await page.waitForSelector('.planet-dialogue:not([hidden])')
  await page.locator('.planet-dialogue-next').click()
  await page.waitForTimeout(1200)
  const mobile=await page.locator('.planet-dialogue').boundingBox()
  if(mobile.x<0||mobile.x+mobile.width>390||mobile.y+mobile.height>844)throw Error('Mobile dialogue overflows viewport')
  await page.screenshot({path:join(output,'dialogue-mobile.png')})
  await page.locator('.planet-dialogue-exit').click()
  await page.emulateMedia({reducedMotion:'reduce'})
  await faceFront();p=await point();await page.mouse.click(p.x,p.y)
  await page.waitForSelector('.planet-dialogue:not([hidden])')
  if(await page.locator('.planet-dialogue').evaluate(el=>el.classList.contains('is-typing')))throw Error('Reduced motion still animates text')
  const autoLine=await page.locator('.planet-dialogue-text').innerText()
  await page.waitForTimeout(8500)
  if(await page.locator('.planet-dialogue-text').innerText()===autoLine)throw Error('Dialogue did not advance automatically')
  await page.locator('.planet-dialogue-exit').click()
  await page.locator('.planet-join-primary').click()
  const input=page.locator('.planet-neighbor-name')
  await input.fill('abcdefghijklmnopqrstuvwxyz123456')
  if(Array.from(await input.inputValue()).length!==24)throw Error('Name length is not limited to 24')
  await input.fill('별빛 모찌')
  await page.waitForFunction(()=>!document.querySelector('.planet-camera-start').disabled)
  await page.waitForTimeout(5200)
  if(await page.locator('.planet-countdown').isVisible())throw Error('Camera starts before user finishes naming')
  await page.screenshot({path:join(output,'name-mobile.png')})
  await page.locator('.planet-camera-start').click()
  await page.waitForSelector('.planet-countdown:not([hidden])')
  if(!await input.isDisabled())throw Error('Name remained editable after starting capture')
  await page.locator('.planet-studio-close').click()
  if(await page.locator('.planet-dialogue').isVisible())throw Error('Dialogue timer leaked into cancelled studio')
  if(errors.length)throw Error(errors.join('\n'))
  console.log(JSON.stringify({initial,restored,storageEdges,typewriter:true,cancelSafe:true,permanentExpulsion:true,mobile:true,manualCapture:true,reducedMotion:true,autoDialogue:true,output,errors},null,2))
} finally {await browser.close()}
