// Real move-in controller + renderer, synthetic webcam and a gated face builder.
// No real photos, model downloads, or existing browser storage are used.
import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output=await mkdtemp(join(tmpdir(),'parange-move-in-'))
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']})
try {
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:900}})
  const errors=[];page.on('pageerror',e=>errors.push(String(e)))
  await page.route('**/src/planet-resident.ts*',route=>route.fulfill({contentType:'application/javascript',body:`
    import {createResidentRig} from '/src/resident-model.ts';
    import {selectResidentDesign} from '/src/resident-selection.ts';
    export const prepareResidentModels=async()=>{};
    export const buildResident=async(photo,report,signal,name,existing)=>{
      window.existingDesigns=existing;
      report('Getting your test neighbor ready…');
      await new Promise((resolve,reject)=>{window.pendingBuild={resolve,reject}});
      const designIndex=selectResidentDesign(existing,0,()=>0),rig=createResidentRig(designIndex),dispose=rig.dispose;
      window.testModel={...rig,designIndex,name:name||'Momo',trait:'A curious explorer',mapped:false,portrait:'',
        dispose(){window.disposedModels=(window.disposedModels||0)+1;dispose()}};
      return window.testModel;
    };
  `}))
  await page.goto(process.env.REVIEW_URL || 'https://localhost:5173')
  await page.evaluate(async()=>{
    const {createParangePlanetExperience}=await import('/src/parange-planet.ts')
    window.app=createParangePlanetExperience();window.app.open()
  })
  await page.locator('.planet-join-primary').click()
  await page.waitForFunction(()=>!document.querySelector('.planet-camera-start').disabled)
  await page.clock.install({time:new Date('2026-10-08T00:00:00Z')})
  await page.clock.pauseAt(new Date('2026-10-08T00:00:01Z'))
  const snapshot=()=>page.evaluate(()=>{
    const q=s=>document.querySelector(s),studio=q('.planet-studio'),screen=q('.planet-screen')
    return {
      studio:studio.classList.contains('is-open'),opacity:getComputedStyle(studio).opacity,
      transition:getComputedStyle(studio).transitionDuration,building:!q('.planet-building').hidden,
      presenting:screen.classList.contains('is-presenting'),joining:screen.classList.contains('is-joining'),
      arrival:!q('.planet-arrival').hidden,phase:q('.planet-arrival').dataset.phase,
      canvas:getComputedStyle(q('.planet-canvas')).visibility,world:window.app.world.world.visible,
      brand:getComputedStyle(q('.planet-brand')).visibility,home:getComputedStyle(q('.planet-spot-card')).visibility,
      retry:!q('.planet-studio-retry').hidden,cameraStopped:q('.planet-camera').srcObject===null,
      neighbors:window.app.world.village.residents.length,
    }
  })
  const startBuild=async()=>{
    await page.locator('.planet-camera-start').evaluate(el=>el.click())
    await page.clock.fastForward(5100)
    const state=await snapshot()
    assert.equal(state.studio,true);assert.equal(state.building,true);assert.equal(state.opacity,'1')
    assert.equal(state.transition,'0s');assert.equal(state.canvas,'hidden');assert.equal(state.home,'hidden')
    assert.equal(state.brand,'hidden');assert.equal(state.cameraStopped,true)
  }
  const startAgain=async()=>{
    await page.locator('.planet-join-primary').evaluate(el=>el.click())
    await page.waitForFunction(()=>!document.querySelector('.planet-camera-start').disabled,{},{polling:100})
    await startBuild()
  }
  const resolveBuild=async()=>{
    await page.evaluate(async()=>{window.pendingBuild.resolve();await Promise.resolve();await Promise.resolve()})
    const state=await snapshot()
    assert.equal(state.presenting,true);assert.equal(state.world,false)
    assert.equal(state.studio,true,'Loading cover disappeared before the first capsule render')
    assert.equal(state.building,true);assert.equal(state.opacity,'1')
  }
  const results=[]
  for(const mode of ['day','night-mobile']){
    if(mode==='day')await startBuild()
    else{
      await page.setViewportSize({width:390,height:844})
      await page.locator('.planet-day-toggle').evaluate(el=>el.click())
      await startAgain()
    }
    // Slow generation must retain a complete studio, not expose the home.
    await page.clock.fastForward(2400)
    assert.equal((await snapshot()).studio,true)
    await resolveBuild()
    assert.deepEqual(await page.evaluate(()=>window.existingDesigns),mode==='day'?[]:[0])
    assert.equal(await page.evaluate(()=>window.testModel.designIndex),mode==='day'?0:1)
    await page.screenshot({path:join(output,`${mode}-handoff-covered.png`)})
    await page.clock.fastForward(32)
    const first=await snapshot()
    assert.equal(first.studio,false);assert.equal(first.arrival,true);assert.equal(first.world,false)
    assert.equal(first.phase,'rolling');assert.equal(first.home,'hidden');assert.equal(first.canvas,'visible')
    await page.clock.fastForward(600)
    await page.screenshot({path:join(output,`${mode}-capsule.png`)})
    await page.clock.fastForward(7300)
    const landed=await snapshot()
    assert.equal(landed.joining,false);assert.equal(landed.arrival,false);assert.equal(landed.world,true)
    assert.equal(landed.neighbors,mode==='day'?1:2)
    results.push({mode,coveredUntilFirstRender:true,landed:landed.neighbors})
  }
  // Generation failure stays in the dialog, and retry runs the same capture flow.
  await startAgain()
  await page.evaluate(()=>window.pendingBuild.reject(new Error('Synthetic generation failure')))
  let state=await snapshot()
  assert.equal(state.studio,true);assert.equal(state.retry,true);assert.equal(state.joining,true)
  assert.equal(state.arrival,false);assert.equal(state.canvas,'hidden')
  await page.locator('.planet-studio-retry').evaluate(el=>el.click())
  await page.waitForFunction(()=>!document.querySelector('.planet-camera-start').disabled,{},{polling:100})
  await startBuild()
  // Cancel while generation is pending; a late result must never start a reveal.
  await page.locator('.planet-studio-close').evaluate(el=>el.click())
  await page.evaluate(async()=>{window.pendingBuild.resolve();await Promise.resolve();await Promise.resolve()})
  await page.clock.fastForward(300)
  state=await snapshot()
  assert.equal(state.joining,false);assert.equal(state.arrival,false);assert.equal(state.neighbors,2)
  assert.equal(await page.evaluate(()=>window.disposedModels),1)
  // Cancel after capsule setup but before its first render: no stale ready callback.
  await startAgain();await resolveBuild()
  await page.locator('.planet-studio-close').evaluate(el=>el.click())
  await page.clock.fastForward(32)
  state=await snapshot()
  assert.equal(state.arrival,false);assert.equal(state.world,true);assert.equal(state.joining,false)
  assert.equal(await page.evaluate(()=>window.disposedModels),2)
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({results,retry:true,lateResultCancelled:true,preRenderCancellation:true,errors,output},null,2))
}finally{await browser.close()}
