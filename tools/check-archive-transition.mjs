import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output=await mkdtemp(join(tmpdir(),'parange-transition-'))
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000},reducedMotion:'reduce'}), errors=[]
page.on('pageerror',e=>errors.push(e.message))
await page.goto((process.env.REVIEW_URL || 'https://localhost:5173')+'/#archive')
await page.getByRole('button',{name:'Come out — summon robot'}).click()
await page.waitForFunction(()=>document.querySelector('.ar-product-canvas').dataset.arrival==='arrived')
await page.screenshot({path:join(output,'desktop.png')})
await page.emulateMedia({reducedMotion:'no-preference'})
const samples=await page.evaluate(async()=>{
 const c=document.querySelector('.ar-product-canvas'),host=document.querySelector('.ar-cabinet-wrap'),button=document.querySelector('.ar-case-toggle')
 const read=()=>{const p=JSON.parse(c.dataset.caseScreenCenter);return {x:p.x,y:p.y,t:performance.now(),phase:c.dataset.viewTransition||'idle',state:host.dataset.caseState}}
 const values=[read()];button.click()
 await new Promise(resolve=>{function sample(){values.push(read());if(host.dataset.caseState==='open')resolve();else requestAnimationFrame(sample)}requestAnimationFrame(sample)})
 button.click()
 await new Promise(resolve=>{function sample(){values.push(read());if(host.dataset.caseState==='closed')resolve();else requestAnimationFrame(sample)}requestAnimationFrame(sample)})
 return values
})
for(const phase of ['zooming-in','zooming-out']){
 const list=samples.filter(s=>s.phase===phase);assert.ok(list.length>=5,phase)
 const jumps=list.slice(1).map((s,i)=>Math.hypot(s.x-list[i].x,s.y-list[i].y))
 assert.ok(Math.max(...jumps)<70,`${phase}: ${Math.max(...jumps)}`)
 console.log(phase,list.length,'frames, max step',Math.max(...jumps))
}
const first=samples[0],next=samples[1],last=samples.at(-1)
console.log('framing',first,next,last,samples.at(-2))
assert.ok(Math.hypot(first.x-next.x,first.y-next.y)<5,'No entry framing jump')
assert.ok(Math.hypot(first.x-last.x,first.y-last.y)<2,'Returns to exact stage framing')
assert.ok(Math.hypot(last.x-samples.at(-2).x,last.y-samples.at(-2).y)<5,'No exit framing jump')
await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150)
await page.screenshot({path:join(output,'mobile.png')})
await page.getByRole('button',{name:'Open archive case'}).click()
await page.waitForFunction(()=>document.querySelector('.ar-product-canvas').dataset.viewTransition==='zooming-in')
await page.keyboard.press('Escape')
await page.waitForFunction(()=>document.querySelector('.ar-cabinet-wrap').dataset.caseState==='closed')
assert.equal(await page.locator('.ar-wordmark').isVisible(),true)
await page.emulateMedia({reducedMotion:'reduce'})
await page.getByRole('button',{name:'Open archive case'}).click()
await page.waitForFunction(()=>document.querySelector('.ar-cabinet-wrap').dataset.caseState==='open')
await page.keyboard.press('Escape')
await page.waitForFunction(()=>document.querySelector('.ar-cabinet-wrap').dataset.caseState==='closed')
assert.deepEqual(errors,[])
console.log('PASS: smooth entry/exit, no framing jump, exact return, desktop/mobile screenshots')
} finally{await browser.close()}
