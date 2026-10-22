// Test-only instrumentation: WebGL capture comparisons, native draw/triangle counts,
// geometry storage and CPU submission time. Not a hardware temperature test.
import assert from 'node:assert/strict'
import {mkdtemp,writeFile,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,dirname} from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const output=await mkdtemp(join(tmpdir(),'parange-archive-perf-'))
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:900},reducedMotion:'reduce'}),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/src/archive-product.ts*',async route=>{
  const response=await route.fetch();let source=await response.text()
  source=source.replace('renderer.setPixelRatio(1)',`renderer.setPixelRatio(1);
    const metrics={calls:0,triangles:0,matrices:0};
    const gl=renderer.getContext();
    for(const name of ['drawElements','drawArrays']){const original=gl[name];gl[name]=function(...args){metrics.calls++;metrics.triangles+=args[name==='drawElements'?1:2]/3;return original.apply(this,args)}}
    const compose=THREE.Matrix4.prototype.compose;THREE.Matrix4.prototype.compose=function(...args){metrics.matrices++;return compose.apply(this,args)};
  `)
  source=source.replace('monitor.update(performance.now())','monitor.update(12345)')
  source=source.replace(/return \{\s+setCards,/,`window.__archiveReview={
    capture(){draw();cancelAnimationFrame(frame);frame=0;return canvas.toDataURL()},
    render(){draw();cancelAnimationFrame(frame);frame=0},
    measure(){
      for(let i=0;i<3;i++){draw();cancelAnimationFrame(frame);frame=0}
      metrics.calls=metrics.triangles=metrics.matrices=0;
      const start=performance.now();for(let i=0;i<6;i++){draw();cancelAnimationFrame(frame);frame=0}
      const ms=(performance.now()-start)/6;
      const gs=new Set();scene.traverse(o=>{if(o.geometry)gs.add(o.geometry)});
      let bytes=0,vertices=0;for(const g of gs){vertices+=g.attributes.position.count;for(const a of Object.values(g.attributes))bytes+=a.array.byteLength;bytes+=g.index?.array.byteLength||0}
      return {calls:metrics.calls/6,triangles:metrics.triangles/6,matrices:metrics.matrices/6,ms,bytes,vertices,geometries:gs.size,textures:renderer.info.memory.textures,programs:renderer.info.programs.length,ratio:renderer.getPixelRatio(),shadow:key.shadow.mapSize.toArray()}
    }
  };return {\n    setCards,`)
  await route.fulfill({response,body:source})
 })
 await page.goto((process.env.REVIEW_URL||'https://localhost:5173')+'/#archive')
 await page.getByRole('button',{name:'Come out — summon robot'}).click()
 await page.waitForFunction(()=>document.querySelector('.ar-product-canvas').dataset.arrival==='arrived')
 await page.evaluate(()=>document.fonts.ready)
 const results=[]
 async function sample(label){
  await page.mouse.move(0,0);await page.waitForTimeout(150)
  const png=await page.evaluate(()=>window.__archiveReview.capture())
  await writeFile(join(output,label+'.png'),Buffer.from(png.split(',')[1],'base64'))
  const metrics=await page.evaluate(()=>window.__archiveReview.measure())
  await page.screenshot({path:join(output,label+'-page.png')})
  results.push({label,...metrics});console.log(label,JSON.stringify(metrics))
 }
 await sample('closed')
 await page.getByRole('button',{name:'Open archive case'}).click()
 await page.waitForFunction(()=>document.querySelector('.ar-cabinet-wrap').dataset.caseState==='open')
 await sample('tapes')
 await page.keyboard.press('ArrowRight');await sample('tapes-rotated')
 await page.keyboard.press('Home')
 await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError')}})
 await page.getByRole('button',{name:'Focus webcam monitor and start camera'}).click()
 await page.waitForFunction(()=>document.querySelector('.ar-product-canvas').dataset.focus==='monitor-closeup'&&document.querySelector('.ar-product-canvas').dataset.viewTransition==='idle')
 await sample('monitor')
 await page.keyboard.press('Escape')
 await page.waitForFunction(()=>document.querySelector('.ar-product-canvas').dataset.viewTransition==='idle')
 await page.getByRole('button',{name:'Next drawer'}).click()
 await page.waitForFunction(()=>document.querySelector('.ar-product-canvas').dataset.cards==='4')
 await sample('drawer-two')
 await page.getByRole('button',{name:'Previous drawer'}).click()
 await page.waitForFunction(()=>document.querySelector('.ar-product-canvas').dataset.cards==='25')
 await sample('tapes-returned')
 await page.setViewportSize({width:390,height:844});await sample('mobile')
 const before=await page.locator('.ar-product-canvas').getAttribute('data-frames');await page.waitForTimeout(300)
 assert.equal(await page.locator('.ar-product-canvas').getAttribute('data-frames'),before,'Idle archive must not keep rendering')
 assert.deepEqual(errors,[])
 const comparisons=[]
 if(process.env.ARCHIVE_PERF_BASELINE){
  const baseline=JSON.parse(await readFile(process.env.ARCHIVE_PERF_BASELINE,'utf8'))
  for(const after of results){const before=baseline.results.find(x=>x.label===after.label)
   const images=await Promise.all([join(output,after.label+'.png'),join(dirname(process.env.ARCHIVE_PERF_BASELINE),after.label+'.png')].map(async path=>'data:image/png;base64,'+(await readFile(path)).toString('base64')))
   const pixels=await page.evaluate(async sources=>{
    const images=await Promise.all(sources.map(src=>new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image);image.src=src})))
    const canvas=document.createElement('canvas');canvas.width=images[0].width;canvas.height=images[0].height
    if(images[1].width!==canvas.width||images[1].height!==canvas.height)return {match:false,differentPixels:-1,maxChannelDelta:255}
    const ctx=canvas.getContext('2d'),data=images.map(image=>{ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height).data})
    let differentPixels=0,maxChannelDelta=0
    for(let i=0;i<data[0].length;i+=4){let changed=false;for(let c=0;c<4;c++){const delta=Math.abs(data[0][i+c]-data[1][i+c]);maxChannelDelta=Math.max(maxChannelDelta,delta);changed ||= delta>0}if(changed)differentPixels++}
    // Separate Chrome GPU runs can differ by one quantization level at a few
    // antialiased pixels. Never allow a changed silhouette, layout or effect.
    return {match:maxChannelDelta<=1&&differentPixels<=canvas.width*canvas.height*.00001,differentPixels,maxChannelDelta}
   },images)
   comparisons.push({label:after.label,...pixels,callsBefore:before.calls,callsAfter:after.calls,bytesBefore:before.bytes,bytesAfter:after.bytes,msBefore:before.ms,msAfter:after.ms})
   assert.equal(after.ratio,before.ratio);assert.deepEqual(after.shadow,before.shadow)
  }
 }
 const report={output,results,comparisons};await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2))
 assert.ok(comparisons.every(x=>x.match),'Rendered pixels changed')
}finally{await browser.close()}
