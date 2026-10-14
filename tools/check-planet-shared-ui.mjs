import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const output=await mkdtemp(join(tmpdir(),'parange-shared-ui-'))
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
  const page=await browser.newPage({ignoreHTTPSErrors:true}),errors=[]
  page.on('pageerror',e=>errors.push(String(e)))
  await page.goto('https://localhost:5173');await page.waitForLoadState('networkidle')
  await page.evaluate(async()=>{const {createParangePlanetExperience}=await import('/src/parange-planet.ts');window.app=createParangePlanetExperience();app.open()})
  const layouts=[]
  for(const [width,height] of [[1440,1000],[390,844],[320,640],[844,390]]){
    await page.setViewportSize({width,height})
    for(const mode of ['day','night','neon']){
      await page.locator(`[data-mode=${mode}]`).click();await page.waitForTimeout(200)
      const layout=await page.evaluate(()=>{
        const screen=document.querySelector('.planet-screen'),tabs=screen.querySelector('.planet-mode-tabs').getBoundingClientRect(),meeting=screen.querySelector('.planet-meeting').getBoundingClientRect()
        const title=screen.querySelector('.planet-brand').getBoundingClientRect()
        const walker=document.createTreeWalker(screen,NodeFilter.SHOW_TEXT),korean=[]
        while(walker.nextNode()){const node=walker.currentNode;if(/[가-힣]/.test(node.textContent))korean.push(node.textContent)}
        return {tabs:{left:tabs.left,right:tabs.right,bottom:tabs.bottom},meeting:{top:meeting.top,right:meeting.right},title:{left:title.left,right:title.right},korean,removed:!screen.querySelector('.planet-coordinates'),logoSize:parseFloat(getComputedStyle(screen.querySelector('.planet-logo-row')).fontSize),sloganSize:parseFloat(getComputedStyle(screen.querySelector('.planet-spot-card h2')).fontSize)}
      })
      assert.deepEqual(layout.korean,[]);assert.equal(layout.removed,true)
      assert.ok(layout.tabs.left>=0&&layout.tabs.right<=width,JSON.stringify(layout))
      assert.ok(layout.meeting.top>=layout.tabs.bottom+10,JSON.stringify(layout))
      assert.ok(layout.title.left>=0&&layout.title.right<width,JSON.stringify(layout))
      assert.ok(layout.logoSize>=34&&layout.sloganSize<=46)
      await page.screenshot({path:join(output,`${mode}-${width}.png`)})
      layouts.push({mode,width,...layout})
    }
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({layouts,errors,output},null,2))
}finally{await browser.close()}
