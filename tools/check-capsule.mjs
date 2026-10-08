import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output=await mkdtemp(join(tmpdir(),'parange-capsule-'))
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}})
  const errors=[];page.on('pageerror',e=>errors.push(String(e)))
  page.on('console',m=>{if(m.type()==='error'&&/THREE.WebGLProgram|Shader Error/.test(m.text()))errors.push(m.text())})
  await page.goto(process.env.REVIEW_URL || 'https://localhost:5173')
  const timeline=await page.evaluate(async()=>{
    const {capsulePose,createArrivalCapsule}=await import('/src/planet-capsule.ts')
    const T=await import('/node_modules/.vite/deps/three.js')
    const scene=new T.Scene(),capsule=createArrivalCapsule(scene),center=new T.Vector3(0,0,0)
    capsule.update(1400,capsulePose(1400),center,1,-3,false)
    const lid=capsule.group.getObjectByName('capsule-lid'),bottom=capsule.group.getObjectByName('capsule-bottom')
    if(lid.material.opacity!==.76||bottom.material.opacity!==.88)throw Error('Dense blue/green capsule opacity was reset by animation')
    if(capsule.group.getObjectByName('capsule-orbit-band')||capsule.group.getObjectByName('capsule-reflection'))throw Error('Painted reflection strips returned')
    if(lid.material.envMap!==bottom.material.envMap||lid.material.envMap?.name!=='capsule-softbox-environment'||lid.material.envMap.type!==T.FloatType||lid.material.envMap.mapping!==T.EquirectangularReflectionMapping)throw Error('Capsule is missing its HDR reflection environment')
    if(!lid.material.envMap.image.data.some(v=>v>1))throw Error('Reflection lighting has no HDR range')
    const resources=new Set(),disposed=new Map()
    capsule.group.traverse(node=>{
      // THREE.Sprite uses an engine-global quad, not an effect-owned geometry.
      if(node.geometry&&!node.isSprite)resources.add(node.geometry)
      if(node.material){resources.add(node.material);if(node.material.map)resources.add(node.material.map);if(node.material.envMap)resources.add(node.material.envMap)}
    })
    for(const resource of resources){disposed.set(resource,0);resource.addEventListener('dispose',()=>disposed.set(resource,disposed.get(resource)+1))}
    let previous=-Infinity,maxAngle=0
    for(let age=0;age<=6500;age+=10){
      const pose=capsulePose(age);capsule.update(age,pose,center,1,-3,false)
      if(age<=1250){const x=capsule.group.children[0].position.x;if(x<previous)throw Error('Capsule reversed during roll');previous=x}
      if(age<=2100&&pose.release!==0)throw Error('Character leaked before shell cleared')
      if(age===2150&&!(pose.release>0&&pose.open<1))throw Error('Character must emerge while the lid is still opening')
      if(pose.release>0&&age<2800){
        capsule.group.updateMatrixWorld(true)
        const shellBounds=new T.Box3().setFromObject(capsule.group.children[0])
        if(shellBounds.max.z>=-1)throw Error('Shell overlaps the character reveal depth')
      }
      if(lid.material.opacity!==.76||bottom.material.opacity!==.88)throw Error('Shell fades through character')
      if(age>=2380&&pose.open!==1)throw Error('Lid not fully opened')
      if(age>=2550&&pose.release!==1)throw Error('Character emergence is delayed')
      maxAngle=Math.max(maxAngle,pose.turn)
      capsule.group.updateMatrixWorld(true);capsule.group.traverse(n=>{if(n.matrixWorld.elements.some(v=>!Number.isFinite(v)))throw Error('Invalid capsule transform')})
    }
    if(Math.abs(maxAngle-Math.PI*2)>1e-8)throw Error('Incomplete character turn')
    const reduced=capsulePose(200,true);capsule.update(200,reduced,center,1,-3,true)
    if(reduced.turn||reduced.burst||!reduced.release||capsule.group.children[0].visible)throw Error('Reduced motion is not calm')
    capsule.dispose();capsule.dispose()
    if(scene.children.length||[...disposed.values()].some(n=>n!==1))throw Error('Capsule resource leak/double dispose')
    return {fullTurn:true,emergesDuringOpening:true,phases:[0,1400,2000,4000,5600].map(t=>capsulePose(t).phase),resources:resources.size,disposedOnce:true}
  })
  await page.clock.install({time:new Date('2026-10-08T00:00:00Z')})
  await page.clock.pauseAt(new Date('2026-10-08T00:00:01Z'))
  await page.evaluate(async()=>{
    const {createParangePlanetExperience}=await import('/src/parange-planet.ts')
    const {createPlanetArrival}=await import('/src/planet-arrival.ts')
    const {createResidentRig}=await import('/src/resident-model.ts')
    window.app=createParangePlanetExperience();window.app.open()
    document.querySelector('.planet-arrival').remove();document.querySelector('.planet-reveal-backdrop').remove()
    const ui=createPlanetArrival(document.querySelector('.planet-screen'))
    const model={...createResidentRig(0),designIndex:0,name:'Momo',customName:true,trait:'A curious explorer',portrait:'',mapped:false}
    window.capsuleUI=ui;window.capsuleModel=model;window.landed=0
    ui.show(model);document.querySelector('.planet-screen').classList.add('is-joining')
    window.app.world.presentResident(model,ui.fly,()=>{window.landed++;ui.hide()},ui.getFrame,ui.update)
  })
  let at=0
  const revealScales=[]
  for(const [phase,time] of [['rolling',600],['settling',1400],['opening',2000],['revealed',2150],['revealed',2400],['revealed',2700]]){
    await page.clock.fastForward(time-at);at=time
    const actual=await page.locator('.planet-arrival').getAttribute('data-phase')
    if(actual!==phase)throw Error(`Expected ${phase}, received ${actual}; ${errors.join('\n')}`)
    const state=await page.evaluate(()=>({visible:window.capsuleModel.group.visible,title:document.querySelector('.planet-arrival h2').textContent}))
    if(['rolling','settling'].includes(phase)&&(state.visible||state.title.includes('Momo')))throw Error('Premature character reveal')
    if(phase==='revealed'&&(!state.visible||!state.title.includes('Momo')))throw Error('Missing character reveal')
    if(phase==='revealed')revealScales.push(await page.evaluate(()=>window.capsuleModel.group.scale.x))
    await page.screenshot({path:join(output,`${phase}-${time}.png`)})
  }
  if(Math.max(...revealScales)-Math.min(...revealScales)>.00001)throw Error('Character grows out of a miniature instead of rising at full size')
  await page.clock.fastForward(3000)
  await page.clock.fastForward(2300)
  if(await page.evaluate(()=>window.landed)!==1)throw Error('Arrival did not land exactly once')
  if(await page.evaluate(()=>!!window.app.world.world.parent.getObjectByName('arrival-capsule')))throw Error('Capsule survived landing')
  // Cancel at the rolling stage; the next arrival must not inherit old effects.
  await page.evaluate(async()=>{
    const {createResidentRig}=await import('/src/resident-model.ts')
    const model={...createResidentRig(2),designIndex:2,name:'Lulu',trait:'A bouncy walker',portrait:'',mapped:false}
    const w=window.app.world;window.capsuleUI.show(model);w.presentResident(model,()=>{},()=>{},window.capsuleUI.getFrame,window.capsuleUI.update)
    w.cancelArrival();window.capsuleUI.hide()
    if(w.world.parent.getObjectByName('arrival-capsule')||!w.world.visible)throw Error('Cancellation leaked capsule or hid planet')
  })
  if(errors.length)throw Error(errors.join('\n'))
  console.log(JSON.stringify({timeline,landedOnce:true,cancelled:true,errors,output},null,2))
}finally{await browser.close()}
