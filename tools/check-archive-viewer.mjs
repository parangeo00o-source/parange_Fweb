import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output=await mkdtemp(join(tmpdir(),'parange-viewer-'))
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:1100},reducedMotion:'reduce'})
 await context.route('https://www.instagram.com/**',r=>r.fulfill({status:200,contentType:'text/html',body:'<title>Instagram fixture</title>'}))
 const page=await context.newPage(),errors=[],requests=[]
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()))
 await page.goto((process.env.REVIEW_URL||'https://localhost:5173')+'/#archive')
 await page.waitForFunction(()=>document.querySelector('.ar-product-ready')?.getAttribute('aria-busy')==='false')
 assert.equal(await page.locator('.ar-heading,.ar-toolbar').count(),0)
 assert.equal(await page.locator('.ar-product-canvas').getAttribute('data-interior'),'cyan-webcam-monitor')
 assert.ok(!requests.some(r=>r.includes('alpine-panorama')))
 await page.getByRole('button',{name:'Come out — summon robot'}).click()
 await page.waitForFunction(()=>document.querySelector('canvas.ar-product-canvas').dataset.arrival==='arrived')
 await page.screenshot({path:join(output,'closed-front.png')})
 const contained=async()=>{
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
   const focused=await page.locator('.ar-product-canvas').getAttribute('data-focus')
   const b=JSON.parse(await page.locator('.ar-product-canvas').getAttribute(focused==='cassette-closeup'?'data-cassette-bounds':'data-model-bounds'))
   assert.ok(b.minX>=-.91 && b.maxX<=.91 && b.minY>=-.91 && b.maxY<=.91,JSON.stringify(b))
 }
 // Inspect the assembled body from both other sides before opening.
 for(let i=0;i<2;i++){
   const b=await page.locator('.ar-cabinet-wrap').boundingBox()
   await page.mouse.move(b.x+b.width*.85,b.y+b.height*.7);await page.mouse.down()
   await page.mouse.move(b.x+b.width*.15,b.y+b.height*.7,{steps:16});await page.mouse.up()
   await contained();await page.screenshot({path:join(output,`closed-orbit-${i}.png`)})
 }
 await page.getByRole('button',{name:'Open archive case'}).click()
 await page.waitForFunction(()=>document.querySelector('.ar-cabinet-wrap').dataset.caseState==='open')
 assert.equal(await page.locator('.ar-top').count(),0)
 assert.equal(await page.locator('.ar-catalog').isVisible(),false)
 assert.equal(await page.locator('.ar-caption').isVisible(),false)
 assert.equal(await page.locator('.ar-catalog').evaluate(e=>e.inert),true)
 assert.equal(await page.locator('.ar-cabinet-wrap').getAttribute('aria-modal'),'true')
 assert.equal(await page.locator('.ar-product-canvas').evaluate(e=>getComputedStyle(e).maskImage),'none')
 await contained();await page.screenshot({path:join(output,'open-front.png')})
 for(let i=0;i<24;i++){
   await page.keyboard.press('ArrowLeft');await contained()
   if(i%6===5)await page.screenshot({path:join(output,`open-orbit-${i}.png`)})
 }
 await page.keyboard.press('Home')
 for(let i=0;i<6;i++)await page.keyboard.press('ArrowDown')
 await contained();await page.screenshot({path:join(output,'open-underside.png')})
 assert.ok(Number(await page.locator('.ar-product-canvas').getAttribute('data-polar'))>Math.PI/2)
 await page.keyboard.press('Home')
 const popupPromise=context.waitForEvent('page')
 await page.locator('.ar-card').first().click()
 const popup=await popupPromise;await popup.waitForLoadState();assert.match(popup.url(),/instagram.com\/p\/Def-k32FIrW/);await popup.close()
 for(const [width,height] of [[390,844],[320,740],[844,390]]){
   await page.setViewportSize({width,height});await contained()
   const box=await page.locator('.ar-cabinet-wrap').boundingBox()
   assert.deepEqual([Math.round(box.x),Math.round(box.y),Math.round(box.width),Math.round(box.height)],[0,0,width,height])
   assert.equal(await page.locator('.archive-screen').evaluate(e=>e.clientWidth===e.scrollWidth),true)
   await page.screenshot({path:join(output,`viewer-${width}.png`)})
 }
 await page.keyboard.press('Escape')
 await page.waitForFunction(()=>!document.querySelector('.archive-screen').classList.contains('ar-viewer-active'))
 assert.equal(new URL(page.url()).hash,'#archive')
 assert.equal(await page.locator('.ar-back').isVisible(),true)
 assert.equal(await page.locator('.ar-catalog').evaluate(e=>e.inert),false)
 await page.getByRole('button',{name:'Open archive case'}).click()
 await page.waitForFunction(()=>document.querySelector('.ar-cabinet-wrap').dataset.caseState==='open')
 await page.locator('.ar-next').click()
 await page.waitForFunction(()=>document.querySelector('.ar-product-canvas').dataset.cards==='4')
 assert.equal(await page.locator('.ar-card').count(),4)
 await page.getByRole('button',{name:'Close archive case'}).click()
 await page.waitForFunction(()=>!document.querySelector('.archive-screen').classList.contains('ar-viewer-active'))
 assert.deepEqual(errors,[])
 console.log(`PASS: full-viewport viewer, 360°/underside cassette containment, UI removal, no mountain asset, Escape/close restoration, 29-project pagination, native link popup. Screenshots: ${output}`)
}finally{await browser.close()}
