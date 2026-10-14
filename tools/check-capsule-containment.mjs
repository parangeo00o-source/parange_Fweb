import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const output=await mkdtemp(join(tmpdir(),'parange-capsule-containment-'))
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:900}}),errors=[]
  page.on('pageerror',e=>errors.push(String(e)))
  page.on('console',m=>{if(m.type()==='error'&&/Shader Error|THREE.WebGLProgram/.test(m.text()))errors.push(m.text())})
  await page.goto(process.env.REVIEW_URL||'https://localhost:5173')
  await page.clock.install();await page.clock.pauseAt(new Date())
  await page.evaluate(async()=>{
    const {createParangePlanetExperience}=await import('/src/parange-planet.ts'),{createPlanetArrival}=await import('/src/planet-arrival.ts')
    window.app=createParangePlanetExperience();app.open()
    document.querySelector('.planet-arrival').remove();document.querySelector('.planet-reveal-backdrop').remove()
    window.ui=createPlanetArrival(document.querySelector('.planet-screen'))
  })
  const results=[]
  for(const [mode,width,height] of [['day',1280,900],['night',390,844],['neon',390,844]]){
    await page.setViewportSize({width,height})
    await page.locator(`[data-mode=${mode}]`).evaluate(el=>el.click())
    for(let i=0;i<16;i++){
      await page.evaluate(async index=>{
        const {createResidentRig}=await import('/src/resident-model.ts')
        app.world.cancelArrival();ui.hide()
        window.model={...createResidentRig(index),designIndex:index,name:'Neighbor',trait:'Curious explorer',portrait:'',mapped:false}
        document.querySelector('.planet-screen').classList.add('is-joining')
        ui.show(model);app.world.presentResident(model,ui.fly,()=>ui.hide(),ui.getFrame,ui.update)
      },i)
      await page.clock.fastForward(1400)
      const contained=await page.evaluate(async()=>{
        const T=await import('/node_modules/.vite/deps/three.js'),scene=app.world.world.parent
        scene.updateMatrixWorld(true)
        const capsule=scene.getObjectByName('arrival-capsule'),center=capsule.children[0].getWorldPosition(new T.Vector3()),box=new T.Box3().setFromObject(model.group)
        let max=0
        for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])max=Math.max(max,new T.Vector3(x,y,z).distanceTo(center)/capsule.scale.x)
        return {visible:model.group.visible,max,scale:model.group.scale.x}
      })
      assert.equal(contained.visible,true);assert.ok(contained.max<.96,`${mode} ${i}: limbs outside closed capsule (${contained.max})`)
      if(i===2)await page.screenshot({path:join(output,`${mode}-inside.png`)})
      for(const step of [900,200,350,500]){
        await page.clock.fastForward(step)
        assert.equal(await page.evaluate(()=>model.group.visible),true)
        assert.ok(Math.abs(await page.evaluate(()=>model.group.scale.x)-contained.scale)<1e-6,`${mode} ${i}: reveal size popped`)
      }
      if(i===2)await page.screenshot({path:join(output,`${mode}-released.png`)})
      await page.evaluate(()=>{app.world.cancelArrival();ui.hide();document.querySelector('.planet-screen').classList.remove('is-joining')})
    }
    results.push({mode,species:16,contained:true,constantSize:true})
  }
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.evaluate(async()=>{
    const {createResidentRig}=await import('/src/resident-model.ts')
    window.model={...createResidentRig(2),designIndex:2,name:'Bunny',trait:'Curious explorer',portrait:'',mapped:false}
    ui.show(model);window.landed=false;app.world.presentResident(model,ui.fly,()=>{window.landed=true;ui.hide()},ui.getFrame,ui.update)
  })
  await page.clock.fastForward(32)
  assert.equal(await page.evaluate(()=>model.group.visible),true)
  assert.equal(await page.evaluate(()=>app.world.world.parent.getObjectByName('arrival-capsule').children[0].visible),false)
  await page.clock.fastForward(4900)
  assert.equal(await page.evaluate(()=>window.landed),true)
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({results,reducedMotion:true,errors,output},null,2))
}finally{await browser.close()}
