// Production material/retina checks. Output remains outside the repository.
import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output=await mkdtemp(join(tmpdir(),'parange-art-direction-'))
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:900},deviceScaleFactor:2})
  const errors=[]
  page.on('pageerror',e=>errors.push(String(e)))
  page.on('console',m=>{if(m.type()==='error'&&/THREE.WebGLProgram|Shader Error/.test(m.text()))errors.push(m.text())})
  await page.route('**/src/planet-world.ts*',async route=>{
    const response=await route.fetch(),body=await response.text()
    assert.ok(body.includes('renderer.setPixelRatio('))
    await route.fulfill({response,body:body.replace('renderer.setPixelRatio(','window.artRenderer=renderer;renderer.setPixelRatio(')})
  })
  await page.goto(process.env.REVIEW_URL || 'https://localhost:5173')
  const materials=await page.evaluate(async()=>{
    const {createParangePlanetExperience}=await import('/src/parange-planet.ts')
    const {createResidentRig}=await import('/src/resident-model.ts')
    const {islandPixelRatio}=await import('/src/planet-art-direction.ts')
    const T=await import('/node_modules/.vite/deps/three.js')
    const app=window.artApp=createParangePlanetExperience();app.open()
    const scene=app.world.world.parent
    if(scene.environment.name!=='island-soft-daylight-hdr'||scene.environment.type!==T.HalfFloatType)throw Error('Missing filtered HDR reflection probe')
    if(!app.world.environment.terrain.geometry.userData.bakedIslandContact)throw Error('Contact pigment is not baked into terrain')
    const colors=app.world.environment.terrain.geometry.attributes.color.array
    if(!colors.every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw Error('Invalid terrain pigment')
    for(const [width,height,dpr] of [[390,844,3],[1440,1000,2],[3840,2160,2],[1920,1080,1]]){
      const ratio=islandPixelRatio(width,height,dpr)
      if(width*height*ratio*ratio>4_000_001||ratio>2||ratio<=0)throw Error('Unbounded render target')
    }
    if(islandPixelRatio(390,844,3)!==2)throw Error('Mobile retina detail is missing')
    const finishes=new Set(),eyes=[]
    for(let i=0;i<16;i++){
      const rig=createResidentRig(i)
      rig.group.traverse(o=>{
        if(!o.isMesh)return
        if(o.material.transparent||o.material.opacity!==1)throw Error('Resident became translucent')
        finishes.add(o.material.roughness)
        if(o.name.includes('eye')&&o.material.color?.getHexString()==='100f16')eyes.push(o.material)
      })
      const n=new T.Vector3(Math.sin(i*2.4)*.75,.3+Math.cos(i*1.5)*.35,Math.cos(i*2.4)*.75).normalize()
      app.world.village.add({...rig,designIndex:i,name:'Neighbor '+i,portrait:'',trait:'',mapped:false},n)
    }
    if(![.17,.29,.44].every(v=>finishes.has(v)))throw Error('Fur, paint and eyes lost their separate finishes')
    if(!eyes.length||eyes.some(m=>m.clearcoat<.4||m.envMapIntensity<.7))throw Error('Eyes do not catch broad physical highlights')
    window.dayArtState=scene.children.filter(o=>o.isLight).map(o=>[o.uuid,o.intensity,o.color.getHex(),o.groundColor?.getHex()])
    return {residents:16,finishes:[...finishes],hdrProbe:true,bakedContacts:true,renderPixelBudget:4_000_000}
  })
  const checkSize=async()=>{
    await page.waitForTimeout(300)
    return page.evaluate(()=>{
      const r=window.artRenderer,c=r.domElement
      if(c.width*c.height>4_000_000||r.getPixelRatio()>2)throw Error(`Drawing buffer exceeds budget: ${c.width}x${c.height}`)
      return {width:c.width,height:c.height,pixelRatio:r.getPixelRatio()}
    })
  }
  const desktop=await checkSize()
  await page.screenshot({path:join(output,'retina-day.png')})
  await page.setViewportSize({width:390,height:844})
  const mobile=await checkSize();assert.equal(mobile.pixelRatio,2)
  await page.screenshot({path:join(output,'retina-mobile-day.png')})
  await page.locator('.planet-day-toggle').click();await page.waitForTimeout(2600)
  await page.screenshot({path:join(output,'retina-mobile-night.png')})
  await page.locator('[data-mode="day"]').click()
  await page.evaluate(()=>{
    const scene=window.artApp.world.world.parent
    const now=scene.children.filter(o=>o.isLight).map(o=>[o.uuid,o.intensity,o.color.getHex(),o.groundColor?.getHex()])
    if(JSON.stringify(now)!==JSON.stringify(window.dayArtState)||scene.environmentIntensity!==.48)throw Error('Day lighting does not restore exactly')
  })
  await page.setViewportSize({width:1920,height:1080})
  const large=await checkSize()
  await page.setViewportSize({width:390,height:844})
  const restoredMobile=await checkSize();assert.equal(restoredMobile.pixelRatio,2)
  assert.deepEqual(errors,[])
  await page.evaluate(()=>window.artApp.close())
  console.log(JSON.stringify({materials,desktop,mobile,large,restoredMobile,errors,output},null,2))
}finally{await browser.close()}
