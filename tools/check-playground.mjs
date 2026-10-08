import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output=await mkdtemp(join(tmpdir(),'parange-playground-'))
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}})
  const errors=[];page.on('pageerror',e=>errors.push(String(e)))
  page.on('console',m=>{if(m.type()==='error'&&/THREE.WebGLProgram|Shader Error/.test(m.text()))errors.push(m.text())})
  await page.goto(process.env.REVIEW_URL || 'https://localhost:5173')
  await page.evaluate(async()=>{
    const {createParangePlanetExperience}=await import('/src/parange-planet.ts')
    window.parkApp=createParangePlanetExperience();window.parkApp.open()
    window.parkThree=await import('/node_modules/.vite/deps/three.js')
  })
  await page.waitForTimeout(1500)
  await page.screenshot({path:join(output,'planet-day.png')})
  await page.evaluate(async()=>{
    const {createResidentRig}=await import('/src/resident-model.ts'),T=window.parkThree,w=window.parkApp.world
    for(let i=0;i<16;i++){
      let normal
      for(let n=0;n<1000&&!normal;n++)normal=w.village.safePosition(new T.Vector3(Math.sin(n*2.399)*.8,Math.cos(n*2.399)*.65,1).normalize())
      if(!normal)throw Error('No safe position')
      w.village.add({...createResidentRig(i),designIndex:i,name:`Neighbor ${i+1}`,customName:true,trait:'A little adventurer',portrait:'',mapped:false},normal)
    }
    w.toggleMeeting()
  })
  await page.waitForFunction(()=>window.parkApp.world.village.residents.every(r=>r.meeting&&performance.now()>r.meeting.started+r.meeting.duration),null,{timeout:30000})
  const result=await page.evaluate(()=>{
    const T=window.parkThree,w=window.parkApp.world,park=w.world.getObjectByName('neighborhood-playground'),rs=w.village.residents
    const stations=park.children.filter(c=>c.userData.groundNormal)
    if(park.getObjectByName('playground-slide').scale.y!==.72||park.getObjectByName('playground-swings').scale.y!==.84)throw Error('Play equipment sizing regressed')
    const chute=park.getObjectByName('rounded-slide-chute')
    if(!chute||chute.geometry.attributes.position.count<100)throw Error('Curved slide replaced by a flat plank')
    for(const name of ['playground-slide','playground-swings','playground-seesaw','playground-sandbox','playground-bench','playground-sign','playground-fence'])
      if(!stations.some(s=>s.name===name))throw Error(`Missing playground facility: ${name}`)
    const clearance=Math.min(...rs.flatMap(r=>stations.map(s=>r.normal.distanceTo(new T.Vector3(...s.userData.groundNormal))-s.userData.footprint)))
    if(clearance<.047)throw Error(`Meeting overlaps furniture: ${clearance}`)
    const minimum=Math.min(...rs.flatMap((r,i)=>rs.slice(i+1).map(other=>r.normal.distanceTo(other.normal))))
    if(minimum<.105)throw Error('Residents overlap')
    const court=park.getObjectByName('playground-court')
    if(court.material.roughness<.9)throw Error('Playground ground should use a matte sand/rubber material')
    const gates=w.world.children.filter(child=>child.name==='garden-rainbow-gate').length
    if(gates<3)throw Error('Missing course landmarks')
    if(court.material.customProgramCacheKey()!=='planet-sinkhole-v1')throw Error('Play court does not share sinkhole clipping')
    return {residents:rs.length,stations:stations.map(s=>s.name),clearance,minimum,gates}
  })
  await page.screenshot({path:join(output,'meeting-globe.png')})
  // Zoom in via the actual wheel control, to review furniture and ground detail.
  await page.mouse.move(740,460);await page.mouse.wheel(0,-700);await page.waitForTimeout(1200)
  await page.screenshot({path:join(output,'playground-close.png')})
  await page.evaluate(()=>{
    const w=window.parkApp.world,p=w.world.getObjectByName('playground-court').geometry.attributes.position
    w.village.sinkhole.show(new window.parkThree.Vector3(p.getX(0),p.getY(0),p.getZ(0)).normalize())
  })
  await page.waitForTimeout(500);await page.screenshot({path:join(output,'playground-sinkhole.png')})
  await page.evaluate(()=>window.parkApp.world.village.sinkhole.close());await page.waitForTimeout(1300)
  if(await page.evaluate(()=>window.parkApp.world.village.sinkhole.visible))throw Error('Playground sinkhole did not close')
  await page.locator('.planet-day-toggle').click();await page.waitForTimeout(900)
  await page.screenshot({path:join(output,'playground-night.png')})
  if(errors.length)throw Error(errors.join('\n'))
  console.log(JSON.stringify({...result,errors,output},null,2))
}finally{await browser.close()}
