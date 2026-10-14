// Every edition must use the same authored image, pose and crop. Neon is a
// colour-only treatment, with no dependency on the retired illustrated rigs.
import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const output=await mkdtemp(join(tmpdir(),'parange-portrait-modes-'))
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:900}}),errors=[],legacyRequests=[]
  page.on('pageerror',e=>errors.push(String(e)))
  await page.route(/neon-original-rigs|neon-residents-\d/,route=>{legacyRequests.push(route.request().url());return route.abort()})
  await page.goto(process.env.REVIEW_URL||'https://localhost:5173')
  await page.evaluate(async()=>{
    const {createParangePlanetExperience}=await import('/src/parange-planet.ts')
    window.app=createParangePlanetExperience();app.open()
    const {createResidentRig}=await import('/src/resident-model.ts'),{residentPortrait}=await import('/src/resident-portrait.ts')
    const T=await import('/node_modules/.vite/deps/three.js')
    window.portraits=await Promise.all(Array.from({length:16},(_,i)=>residentPortrait(i)))
    for(let i=0;i<16;i++)app.world.village.add({...createResidentRig(i),designIndex:i,name:`Neighbor ${i}`,portrait:portraits[i],trait:'Curious explorer',mapped:false},new T.Vector3(0,0,1))
  })
  const results=[]
  for(const mode of ['day','night','neon','day']){
    await page.locator(`[data-mode=${mode}]`).click()
    const checks=await page.evaluate(async()=>{
      const residents=app.world.village.residents,original=residents.slice(),img=document.querySelector('.planet-resident-avatar img'),out=[]
      // Cycle the actual latest-resident state, not a mock image element.
      for(const resident of original){
        residents.splice(residents.indexOf(resident),1);residents.push(resident);app.world.village.refresh()
        await img.decode()
        const c=getComputedStyle(img)
        if(img.src!==portraits[resident.model.designIndex])throw Error(`Portrait replaced for ${resident.model.designIndex}`)
        if(!img.naturalWidth||!img.classList.contains('has-photo'))throw Error('Portrait not loaded')
        out.push({design:resident.model.designIndex,filter:c.filter,fit:c.objectFit,width:c.width,height:c.height})
      }
      return out
    })
    for(const check of checks)assert.equal(check.filter,mode==='neon'?'brightness(1.08) saturate(0.88)':'none')
    if(results.length)assert.deepEqual(checks.map(({filter,...rest})=>rest),results[0].checks.map(({filter,...rest})=>rest),'Portrait crop or dimensions changed')
    await page.locator('.planet-resident-card').screenshot({path:join(output,`${mode}-profile.png`)})
    results.push({mode,checks})
  }
  // Stored residents reload through the same common portrait pipeline in Neon.
  await page.reload()
  await page.evaluate(async()=>{const {createParangePlanetExperience}=await import('/src/parange-planet.ts');window.app=createParangePlanetExperience();app.open()})
  await page.locator('[data-mode=neon]').click()
  await page.waitForFunction(()=>document.querySelector('.planet-resident-avatar img').classList.contains('has-photo'))
  await page.evaluate(async()=>{
    const {residentPortrait}=await import('/src/resident-portrait.ts'),last=app.world.village.residents.at(-1).model
    if(document.querySelector('.planet-resident-avatar img').src!==await residentPortrait(last.designIndex))throw Error('Restored portrait differs')
  })
  assert.deepEqual(errors,[]);assert.deepEqual(legacyRequests,[])
  console.log(JSON.stringify({species:16,modes:results.map(r=>r.mode),sameSourceAndCrop:true,neonColourOnly:true,restored:true,legacyRequests,errors,output},null,2))
}finally{await browser.close()}
