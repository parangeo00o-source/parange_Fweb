// Browser integration check: real scene, real meshes and real pointer events.
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser=await chromium.launch({channel:process.env.CHROME_CHANNEL || 'chrome',headless:true})
try {
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}})
  const errors=[];page.on('pageerror',error=>errors.push(String(error)))
  await page.goto(process.env.REVIEW_URL || 'https://localhost:5173')
  await page.locator('[data-route="#e"]').click()
  await page.waitForSelector('.planet-screen.is-open')
  await page.locator('.planet-join-primary').click()
  await page.waitForSelector('.planet-studio-heading h2')
  const studio=await page.evaluate(()=>({
    motto:getComputedStyle(document.querySelector('.planet-coordinates')).display,
    font:getComputedStyle(document.querySelector('.planet-studio-heading h2')).fontFamily,
    korean:/[가-힣]/.test(document.querySelector('.planet-studio').innerText),
  }))
  if(studio.motto!=='none'||studio.korean||!studio.font.includes('Planet Lilita'))throw Error(`Studio regression: ${JSON.stringify(studio)}`)
  await page.locator('.planet-studio-close').click()
  if(!await page.locator('.planet-coordinates').isVisible())throw Error('Home motto did not return')
  await page.locator('.planet-close').click()
  // Skip webcam capture for this test, but use the identical production factory
  // and all five landmarks. No network-dependent face recognition is mocked.
  await page.evaluate(async()=>{
    const {createPlanetWorld}=await import('/src/planet-world.ts')
    const {createResidentRig}=await import('/src/resident-model.ts')
    const {residentDesigns,residentEnglish}=await import('/src/resident-designs.ts')
    const T=await import('/node_modules/.vite/deps/three.js')
    document.body.innerHTML='<canvas style="display:block;width:100vw;height:100vh;touch-action:none"></canvas>'
    const spots=[{id:'home',lat:.26,lon:-.22,color:'#ff8b22'},{id:'market',lat:.08,lon:.78,color:'#ffb429'},
      {id:'park',lat:.54,lon:1.36,color:'#ed931e'},{id:'signal',lat:-.36,lon:-.86,color:'#f47b16'},{id:'dock',lat:-.13,lon:-1.74,color:'#de6a12'}]
    const world=createPlanetWorld(document.querySelector('canvas'),spots,()=>{})
    window.reviewWorld=world;window.reviewThree=T;world.open()
    for(let i=0;i<16;i++){
      let normal
      for(let n=0;n<1000;n++){
        normal=world.village.safePosition(new T.Vector3(Math.sin(n*2.399)*.8,Math.cos(n*2.399)*.65,1).normalize())
        if(normal)break
      }
      if(!normal)throw Error('No safe landing position')
      world.village.add({...createResidentRig(i),...residentEnglish[residentDesigns[i].kind],portrait:'',mapped:false},normal)
    }
    world.toggleMeeting()
  })
  await page.waitForFunction(()=>window.reviewWorld.village.residents.every(r=>r.meeting&&r.lift===0&&performance.now()>r.meeting.started+r.meeting.duration),null,{timeout:20000})
  const meeting=await page.evaluate(()=>{
    const rs=window.reviewWorld.village.residents
    let minimum=Infinity
    for(let i=0;i<rs.length;i++)for(let j=i+1;j<rs.length;j++)minimum=Math.min(minimum,rs[i].normal.distanceTo(rs[j].normal))
    return {count:rs.length,minimum,finite:rs.every(r=>r.model.group.matrixWorld.elements.every(Number.isFinite))}
  })
  if(meeting.minimum<.105||!meeting.finite)throw Error(`Meeting failure: ${JSON.stringify(meeting)}`)
  const screenPoint=()=>page.evaluate(()=>{
    const {village,camera}=window.reviewWorld
    // Aim at the selected fox's actual head, so different character proportions
    // do not make this regression test depend on an outdated hard-coded height.
    const p=village.residents[0].model.group.getObjectByName('neck-head').localToWorld(new window.reviewThree.Vector3(0,0,.1)).project(camera)
    return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2}
  })
  let p=await screenPoint();await page.mouse.click(p.x,p.y)
  await page.waitForFunction(()=>window.reviewWorld.village.state.following!==null)
  await page.waitForTimeout(1000)
  const before=await page.evaluate(()=>window.reviewWorld.camera.position.toArray())
  await page.mouse.move(900,600);await page.mouse.down();await page.mouse.move(1040,650,{steps:12});await page.mouse.up()
  await page.waitForTimeout(500)
  const after=await page.evaluate(()=>window.reviewWorld.camera.position.toArray())
  if(before.every((n,i)=>Math.abs(n-after[i])<.02))throw Error('Follow orbit did not move')
  p=await screenPoint();await page.mouse.click(p.x,p.y)
  await page.waitForFunction(()=>window.reviewWorld.village.state.following===null)
  await page.waitForTimeout(1000)
  p=await screenPoint();await page.mouse.move(p.x,p.y);await page.mouse.down();await page.waitForTimeout(650)
  const held=await page.evaluate(()=>({state:window.reviewWorld.village.state,lift:window.reviewWorld.village.residents[0].lift,normal:window.reviewWorld.village.residents[0].normal.toArray()}))
  if(!held.state.holding||held.lift<.2)throw Error('Press did not lift character')
  await page.mouse.move(930,420,{steps:15});await page.mouse.up()
  const dropped=await page.evaluate(()=>({state:window.reviewWorld.village.state,lift:window.reviewWorld.village.residents[0].lift,normal:window.reviewWorld.village.residents[0].normal.toArray()}))
  if(dropped.state.holding||dropped.lift!==0||held.normal.every((n,i)=>Math.abs(n-dropped.normal[i])<.005))throw Error('Drag/drop did not relocate character')
  await page.evaluate(()=>window.reviewWorld.toggleMeeting())
  if(await page.evaluate(()=>window.reviewWorld.village.residents.some(r=>r.meeting)))throw Error('Meeting dismissal failed')
  p=await screenPoint();await page.mouse.click(p.x,p.y)
  await page.waitForFunction(()=>window.reviewWorld.village.state.following!==null)
  await page.waitForTimeout(1200)
  const movingBefore=await page.evaluate(()=>window.reviewWorld.camera.position.toArray())
  await page.waitForTimeout(1500)
  const movingAfter=await page.evaluate(()=>window.reviewWorld.camera.position.toArray())
  if(movingBefore.every((n,i)=>Math.abs(n-movingAfter[i])<.002))throw Error('Camera did not follow walking character')
  p=await screenPoint();await page.mouse.move(p.x,p.y);await page.mouse.down();await page.waitForTimeout(650)
  if(!await page.evaluate(()=>window.reviewWorld.village.state.holding))throw Error('Press from follow failed')
  const cancelOrigin=await page.evaluate(()=>window.reviewWorld.village.residents[0].normal.toArray())
  await page.waitForTimeout(900);await page.mouse.move(0,0,{steps:12});await page.mouse.up()
  const cancelled=await page.evaluate(()=>({state:window.reviewWorld.village.state,normal:window.reviewWorld.village.residents[0].normal.toArray()}))
  if(cancelled.state.holding||cancelOrigin.some((n,i)=>Math.abs(n-cancelled.normal[i])>.003))throw Error('Invalid drop failed to restore position')
  await page.evaluate(()=>window.reviewWorld.toggleMeeting());await page.waitForTimeout(200);await page.evaluate(()=>window.reviewWorld.toggleMeeting())
  if(!await page.evaluate(()=>window.reviewWorld.village.residents.every(r=>!r.meeting&&r.lift===0)))throw Error('Mid-travel dismissal failed')
  await page.evaluate(()=>window.reviewWorld.close())
  if(errors.length)throw Error(errors.join('\n'))
  console.log(JSON.stringify({studio,meeting,follow:true,orbit:true,hold:true,drop:true,invalidDrop:true,dismiss:true,errors},null,2))
} finally {await browser.close()}
