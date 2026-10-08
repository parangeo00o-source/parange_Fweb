// Visual/layout checks. Synthetic webcam only; no real photos or user storage.
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output=await mkdtemp(join(tmpdir(),'parange-retro-ui-'))
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']})
try {
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000},reducedMotion:'reduce'})
  const errors=[];page.on('pageerror',error=>errors.push(String(error)))
  await page.goto(process.env.REVIEW_URL || 'https://localhost:5173')
  await page.evaluate(async()=>{
    const {createParangePlanetExperience}=await import('/src/parange-planet.ts')
    window.retroApp=createParangePlanetExperience();window.retroApp.open()
  })
  const layouts=[]
  for(const [width,height] of [[1440,1000],[1280,720],[390,844],[320,640],[844,390]]) {
    await page.setViewportSize({width,height})
    await page.locator('.planet-join-primary').click()
    await page.waitForFunction(()=>!document.querySelector('.planet-camera-start').disabled)
    await page.evaluate(()=>document.querySelector('.planet-studio').scrollTop=0)
    await page.screenshot({path:join(output,`studio-${width}.png`)})
    const layout=await page.locator('.planet-studio').evaluate(el=>{
      const card=el.querySelector('.planet-name-entry').getBoundingClientRect(),camera=el.querySelector('.planet-studio-panels').getBoundingClientRect()
      return {overflow:el.scrollWidth>el.clientWidth+1,overlap:card.left<camera.right&&card.right>camera.left&&card.top<camera.bottom&&card.bottom>camera.top,
        font:getComputedStyle(el.querySelector('h2')).fontFamily,motto:getComputedStyle(document.querySelector('.planet-coordinates')).display}
    })
    if(layout.overflow||layout.overlap||!layout.font.includes('Planet Lilita')||layout.motto!=='none')throw Error(`Studio layout ${width}: ${JSON.stringify(layout)}`)
    await page.locator('.planet-neighbor-name').fill('별빛 모찌')
    await page.locator('.planet-camera-start').scrollIntoViewIfNeeded()
    await page.screenshot({path:join(output,`player-card-${width}.png`)})
    await page.locator('.planet-camera-start').click()
    await page.waitForSelector('.planet-countdown:not([hidden])')
    await page.keyboard.press('Escape')
    await page.locator('.planet-studio').waitFor({state:'hidden'})
    if(!await page.evaluate(()=>document.querySelector('.planet-camera').srcObject===null))throw Error('Camera stream not released')
    layouts.push({width,height,...layout})
  }
  // Exercise the real dialogue component with the longest allowed name and line.
  await page.evaluate(async()=>{
    const {createPlanetDialogue}=await import('/src/planet-dialogue.ts')
    const {residentLines}=await import('/src/resident-lines.ts')
    window.retroDialogue=createPlanetDialogue(document.querySelector('.planet-screen'),()=>{})
    window.retroDialogue.setResident({id:'layout-only',name:'가나다라마바사아자차카타파하가나다라마바사아자차'})
    document.querySelector('.planet-dialogue:not([hidden]) .planet-dialogue-text').textContent=[...residentLines].sort((a,b)=>b.length-a.length)[0]
  })
  for(const [width,height] of [[1440,1000],[390,844],[320,640],[844,390]]) {
    await page.setViewportSize({width,height})
    const bubble=page.locator('.planet-dialogue:not([hidden])'),bounds=await bubble.boundingBox()
    if(bounds.x<0||bounds.y<0||bounds.x+bounds.width>width||bounds.y+bounds.height>height)throw Error(`Dialogue overflows at ${width}`)
    const overlaps=await bubble.evaluate(el=>{
      const name=el.querySelector('.planet-dialogue-name').getBoundingClientRect(),text=el.querySelector('.planet-dialogue-text').getBoundingClientRect()
      return name.bottom>text.top
    })
    if(overlaps)throw Error(`Long name covers dialogue at ${width}`)
    const koreanUI=await bubble.evaluate(el=>{
      const text=el.querySelector('.planet-dialogue-text')
      return text.lang==='ko'&&/[가-힣]/.test(text.textContent)&&
        getComputedStyle(text).fontFamily.startsWith('"Planet Jua"')&&
        [...el.querySelectorAll('.planet-dialogue-name,button')].every(node=>getComputedStyle(node).fontFamily.startsWith('"Planet Lilita"'))&&
        text.scrollWidth<=text.clientWidth+1&&el.scrollWidth<=el.clientWidth+1&&
        getComputedStyle(text).wordBreak==='keep-all'
    })
    if(!koreanUI)throw Error(`Korean dialogue typography/overflow at ${width}`)
    await page.screenshot({path:join(output,`dialogue-long-${width}.png`)})
  }
  if(errors.length)throw Error(errors.join('\n'))
  console.log(JSON.stringify({layouts,longName:true,errors,output},null,2))
}finally{await browser.close()}
