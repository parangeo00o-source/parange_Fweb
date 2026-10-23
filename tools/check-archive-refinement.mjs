import assert from 'node:assert/strict'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:900},reducedMotion:'no-preference'}),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.addInitScript(()=>{
  window.__archivePrograms=0
  const create=WebGL2RenderingContext.prototype.createProgram
  WebGL2RenderingContext.prototype.createProgram=function(...args){window.__archivePrograms++;return create.apply(this,args)}
 })
 await page.route('**/src/archive-product.ts*',async route=>{
  const response=await route.fetch()
  const source=(await response.text()).replace(/return \{\s+setCards,/,`window.__archiveRefinement={
   sample(){
    const a=model.getObjectByName('dog-collar-socket'),b=model.getObjectByName('dog-neck-upper-socket');
    return {time:motionTime,progress:(motionTime-entranceStart-150)/5400,distance:travel.position.length(),neck:a.position.distanceTo(b.position),state:canvas.dataset.arrival}
   },
   longFrame(){
    const before=motionTime;draw((lastDrawTime??performance.now())+1000);cancelAnimationFrame(frame);frame=0;lastDrawTime=undefined;request();
    return motionTime-before
   },
   async geometry(){
    const {indexCassetteGeometry}=await import('/src/archive-cassette.ts');
    const seen=new Set();let sourceBytes=0,indexedBytes=0,exact=true;
    for(const print of prints)for(const mesh of print.group.children){
     if(!mesh.geometry?.index||seen.has(mesh.geometry))continue;seen.add(mesh.geometry);
     const expanded=mesh.geometry.toNonIndexed(),indexed=indexCassetteGeometry(expanded.clone());
     for(const [name,a] of Object.entries(expanded.attributes)){
      const b=indexed.attributes[name];sourceBytes+=a.array.byteLength;indexedBytes+=b.array.byteLength;
      const raw=new Uint32Array(a.array.buffer),packed=new Uint32Array(b.array.buffer);
      for(let i=0;i<a.count;i++)for(let c=0;c<a.itemSize;c++)if(raw[i*a.itemSize+c]!==packed[indexed.index.getX(i)*a.itemSize+c])exact=false;
     }
     indexedBytes+=indexed.index.array.byteLength;expanded.dispose();indexed.dispose();
    }
    return {exact,sourceBytes,indexedBytes}
   }
  };return {setCards,`)
  await route.fulfill({response,body:source})
 })
 await page.goto((process.env.REVIEW_URL||'https://localhost:5173')+'/#archive')
 await page.waitForFunction(()=>document.querySelector('.ar-product-canvas')?.dataset.graphicsReady==='true')
 const programs=await page.evaluate(()=>window.__archivePrograms)
 const samples=await page.evaluate(async()=>{
  const samples=[];document.querySelector('.ar-case-toggle').click()
  await new Promise(resolve=>{const sample=()=>{const state=window.__archiveRefinement.sample();samples.push(state);if(state.state==='arrived')resolve();else requestAnimationFrame(sample)};requestAnimationFrame(sample)})
  return samples
 })
 const walking=samples.filter(s=>s.progress>.05&&s.progress<.98),speeds=[]
 for(let i=1;i<walking.length;i++){
  const dt=walking[i].time-walking[i-1].time
  if(dt>0)speeds.push((walking[i-1].distance-walking[i].distance)/dt)
 }
 assert.ok(speeds.length>20)
 assert.ok(Math.max(...speeds)-Math.min(...speeds)<1e-9,'Walking speed must not jump at the former 82% boundary')
 assert.ok(samples.every(s=>s.neck>.25&&s.neck<1.1),'Neck remains a compact seated joint throughout walking and sitting')
 assert.equal(await page.evaluate(()=>window.__archivePrograms),programs,'Walking must not compile new shaders')
 await page.getByRole('button',{name:'Open archive case'}).click()
 await page.waitForFunction(()=>document.querySelector('.ar-product-canvas').dataset.viewTransition==='zooming-in')
 const advanced=await page.evaluate(()=>window.__archiveRefinement.longFrame())
 assert.ok(advanced<=50,'A one-second dropped frame must not skip one second of camera motion')
 await page.waitForFunction(()=>document.querySelector('.ar-cabinet-wrap').dataset.caseState==='open')
 assert.equal(await page.evaluate(()=>window.__archivePrograms),programs,'The first close-up must not compile new shaders')
 const geometry=await page.evaluate(()=>window.__archiveRefinement.geometry())
 assert.equal(geometry.exact,true,'Indexed cassette attributes must reconstruct every original bit')
 assert.ok(geometry.indexedBytes<geometry.sourceBytes*.75,'Exact indexing must reduce geometry storage')
 assert.deepEqual(errors,[])
 console.log('PASS: constant arrival speed, compact neck through all poses, no first-use shader compilation, bounded dropped-frame motion, exact cassette indexing.',{samples:speeds.length,neckRange:[Math.min(...samples.map(s=>s.neck)),Math.max(...samples.map(s=>s.neck))],programs,geometry})
}finally{await browser.close()}
