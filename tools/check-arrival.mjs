// Real 3D reveal + production UI, without webcam/face-model dependencies.
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output=await mkdtemp(join(tmpdir(),'parange-arrival-check-'))
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}})
  const errors=[];page.on('pageerror',e=>errors.push(String(e)))
  await page.goto(process.env.REVIEW_URL || 'https://localhost:5173')
  await page.evaluate(async()=>{
    const {createParangePlanetExperience}=await import('/src/parange-planet.ts')
    const {createPlanetArrival}=await import('/src/planet-arrival.ts')
    window.arrivalApp=createParangePlanetExperience();window.arrivalApp.open()
    document.querySelector('.planet-arrival').remove()
    document.querySelector('.planet-reveal-backdrop').remove()
    window.arrivalUI=createPlanetArrival(document.querySelector('.planet-screen'))
    window.arrivalThree=await import('/node_modules/.vite/deps/three.js')
  })
  const show=async(index,name='Mochi')=>page.evaluate(async({index,name})=>{
    const {createResidentRig}=await import('/src/resident-model.ts')
    const w=window.arrivalApp.world
    w.cancelArrival();window.arrivalUI.hide()
    const model={...createResidentRig(index),designIndex:index,name,customName:true,trait:'A curious little explorer',portrait:'',mapped:false}
    w.prepareResident(model);window.arrivalModel=model;window.arrivalLanded=false
    document.querySelector('.planet-screen').classList.add('is-joining')
    window.arrivalUI.show(model)
    w.presentResident(model,window.arrivalUI.fly,()=>{window.arrivalLanded=true;window.arrivalUI.hide();document.querySelector('.planet-screen').classList.remove('is-joining')},window.arrivalUI.getFrame,window.arrivalUI.update)
  },{index,name})
  const bounds=()=>page.evaluate(()=>{
    const T=window.arrivalThree,w=window.arrivalApp.world,model=window.arrivalModel
    model.group.updateMatrixWorld(true)
    const box=new T.Box3().setFromObject(model.group),points=[]
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
      const p=new T.Vector3(x,y,z).project(w.camera);points.push({x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2})
    }
    const silhouette={left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))}
    const stage=document.querySelector('.planet-reveal-stage').getBoundingClientRect(),caption=document.querySelector('.planet-arrival-caption').getBoundingClientRect()
    const popup=document.querySelector('.planet-arrival-window').getBoundingClientRect(),backdrop=document.querySelector('.planet-reveal-backdrop').getBoundingClientRect()
    if(Math.abs(popup.x+popup.width/2-innerWidth/2)>1||Math.abs(popup.y+popup.height/2-innerHeight/2)>1)throw Error('Unlock popup is not centered')
    if(Math.abs(popup.width-backdrop.width)>1||Math.abs(popup.height-backdrop.height)>1)throw Error('3D backdrop and popup frame disagree')
    const fits=silhouette.left>=stage.left&&silhouette.right<=stage.right&&silhouette.top>=stage.top&&silhouette.bottom<=stage.bottom
    const overlap=silhouette.left<caption.right&&silhouette.right>caption.left&&silhouette.top<caption.bottom&&silhouette.bottom>caption.top
    const sky=getComputedStyle(document.querySelector('.planet-sky'))
    return {fits,overlap,silhouette,background:sky.backgroundImage.includes('conic-gradient'),filter:sky.filter,
      stars:document.querySelectorAll('.planet-reveal-star').length,captionFits:caption.left>=0&&caption.right<=innerWidth&&caption.top>=0&&caption.bottom<=innerHeight}
  })
  for(let i=0;i<16;i++){
    await show(i);await page.waitForTimeout(3450)
    const b=await bounds()
    if(!b.fits||b.overlap||!b.background||b.stars!==8||!b.captionFits)throw Error(`Species ${i}: ${JSON.stringify(b)}`)
    if(i===0)await page.screenshot({path:join(output,'reveal-desktop.png')})
  }
  const layouts=[]
  for(const [width,height] of [[390,844],[320,640],[844,390]]){
    await page.setViewportSize({width,height})
    await show(2,'가나다라마바사아자차카타파하가나다라마바사아자차')
    await page.waitForTimeout(3450)
    const b=await bounds();layouts.push({width,height,...b})
    if(!b.fits||b.overlap||!b.captionFits)throw Error(`Viewport ${width}: ${JSON.stringify(b)}`)
    await page.screenshot({path:join(output,`reveal-${width}.png`)})
  }
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.setViewportSize({width:390,height:844})
  await page.evaluate(()=>window.arrivalApp.world.setNight(true))
  await show(7,'Ellie')
  await page.waitForTimeout(300)
  const reduced=await page.locator('.planet-reveal-star').first().evaluate(el=>getComputedStyle(el).animationName)
  if(reduced!=='none'||!(await bounds()).fits)throw Error('Reduced motion/night reveal failed')
  await page.waitForFunction(()=>document.querySelector('.planet-arrival').classList.contains('is-flying'))
  if(await page.locator('.planet-screen').evaluate(el=>el.classList.contains('is-revealing')))throw Error('Orange backdrop remained during flight')
  await page.waitForFunction(()=>window.arrivalLanded)
  if(await page.locator('.planet-arrival').isVisible())throw Error('Reveal UI remained after landing')
  if(!await page.evaluate(()=>window.arrivalApp.world.village.residents.some(r=>r.model.id===window.arrivalModel.id)))throw Error('Model did not reach village')
  await show(1)
  await page.evaluate(()=>{window.arrivalApp.close();window.arrivalUI.hide()})
  if(await page.locator('.planet-arrival').isVisible())throw Error('Reveal survived cancellation')
  if(errors.length)throw Error(errors.join('\n'))
  console.log(JSON.stringify({species:16,layouts,reducedMotion:true,landed:true,cancelled:true,errors,output},null,2))
}finally{await browser.close()}
