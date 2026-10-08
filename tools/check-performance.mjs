// Deterministic visual/per-frame work baseline. Instrumentation is test-only.
import {mkdtemp,writeFile,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,dirname} from 'node:path'
import assert from 'node:assert/strict'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output=await mkdtemp(join(tmpdir(),'parange-performance-'))
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']})
try {
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:900}})
  const errors=[];page.on('pageerror',error=>errors.push(String(error)))
  await page.route('**/src/planet-world.ts*',async route=>{
    const response=await route.fetch(),source=await response.text()
    assert.ok(source.includes('renderer.setPixelRatio('))
    await route.fulfill({response,body:source.replace('renderer.setPixelRatio(',`
      window.__renderer=renderer;
      const originalRender=renderer.render.bind(renderer);
      renderer.render=(...args)=>{
        const start=window.__realNow();originalRender(...args);
        const m=window.__metrics;m.renderMs+=window.__realNow()-start;m.frames++;
        m.calls=renderer.info.render.calls;m.triangles=renderer.info.render.triangles;
        if(window.__capture){
          const gl=renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
          gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
          let hash=2166136261;for(const value of pixels){hash=Math.imul(hash^value,16777619)>>>0}
          window.__image={hash,png:renderer.domElement.toDataURL()};window.__capture=false;
        }
      };
      renderer.setPixelRatio(`)})
  })
  await page.goto(process.env.REVIEW_URL || 'https://localhost:5173')
  await page.evaluate(()=>{window.__realNow=performance.now.bind(performance);window.__metrics={frames:0,matrices:0,renderMs:0}})
  await page.clock.install({time:new Date('2026-10-08T00:00:00Z')})
  await page.clock.pauseAt(new Date('2026-10-08T00:00:01Z'))
  await page.evaluate(async()=>{
    let seed=3137;Math.random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296}
    const T=await import('/node_modules/.vite/deps/three.js')
    const update=T.Object3D.prototype.updateMatrix
    T.Object3D.prototype.updateMatrix=function(){window.__metrics.matrices++;return update.call(this)}
    const {createParangePlanetExperience}=await import('/src/parange-planet.ts')
    window.app=createParangePlanetExperience();window.app.open();window.T=T
  })
  const results=[]
  const sample=async label=>{
    await page.clock.runFor(32)
    await page.evaluate(()=>{window.__metrics={frames:0,matrices:0,renderMs:0};window.__capture=true;window.__image=null})
    await page.clock.runFor(160)
    const data=await page.evaluate(()=>{
      const geometries=new Set();window.app.world.world.parent.traverse(o=>{if(o.geometry)geometries.add(o.geometry)})
      let geometryBytes=0,vertices=0
      for(const g of geometries){for(const a of Object.values(g.attributes))geometryBytes+=a.array.byteLength;geometryBytes+=g.index?.array.byteLength??0;vertices+=g.attributes.position.count}
      return {metrics:window.__metrics,image:window.__image,geometryBytes,vertices,
        pixelRatio:window.__renderer.getPixelRatio(),shadowSize:window.app.world.world.parent.getObjectByName('planet-sun-moon-key').shadow.mapSize.toArray()}
    })
    if(data.image)await writeFile(join(output,`${label}.png`),Buffer.from(data.image.png.split(',')[1],'base64'))
    const {frames,matrices,renderMs,calls,triangles}=data.metrics
    results.push({label,frames,matrices,matricesPerFrame:frames?matrices/frames:matrices,renderMsPerFrame:frames?renderMs/frames:0,calls,triangles,hash:data.image?.hash??null,pixelRatio:data.pixelRatio,shadowSize:data.shadowSize,geometryBytes:data.geometryBytes,vertices:data.vertices})
  }
  await sample('empty-day')
  await page.evaluate(async()=>{
    const {createResidentRig}=await import('/src/resident-model.ts')
    for(let i=0;i<16;i++){
      const n=new window.T.Vector3(Math.sin(i*2.4)*.75,.3+Math.cos(i*1.5)*.35,Math.cos(i*2.4)*.75).normalize()
      window.app.world.village.add({...createResidentRig(i),designIndex:i,name:'Neighbor '+i,portrait:'',trait:'',mapped:false},n)
    }
    // Isolate rendering from random wandering/async startup timing in snapshots.
    for(const r of window.app.world.village.residents){r.pauseUntil=Infinity;r.turnAt=Infinity}
  })
  await sample('sixteen-day')
  await page.locator('.planet-day-toggle').evaluate(el=>el.click())
  await page.clock.runFor(2500)
  await sample('sixteen-night')
  await page.locator('.planet-join-primary').evaluate(el=>el.click())
  await sample('covered-studio')
  await page.locator('.planet-studio-close').evaluate(el=>el.click())
  await sample('restored-night')
  await page.evaluate(()=>window.app.close())
  await page.evaluate(()=>{window.__metrics={frames:0,matrices:0,renderMs:0}})
  await page.clock.runFor(160)
  assert.equal(await page.evaluate(()=>window.__metrics.frames),0,'Closed experience still renders')
  await page.evaluate(async()=>{
    const {indexExactGeometry,cacheStaticMeshTransforms}=await import('/src/planet-performance.ts'),T=window.T
    const geometry=new T.TorusGeometry(1,.2,12,24).toNonIndexed(),before=geometry.clone()
    geometry.addGroup(0,24,1);geometry.setDrawRange(3,90)
    indexExactGeometry(geometry)
    if(!geometry.index||geometry.attributes.position.count>=before.attributes.position.count)throw Error('Geometry was not indexed')
    for(const [name,old] of Object.entries(before.attributes)){
      const next=geometry.attributes[name],a=new Uint32Array(old.array.buffer),b=new Uint32Array(next.array.buffer)
      for(let i=0;i<old.count;i++)for(let c=0;c<old.itemSize;c++){
        if(a[i*old.itemSize+c]!==b[geometry.index.getX(i)*old.itemSize+c])throw Error(`Lossy vertex change: ${name}/${i}/${c}`)
      }
    }
    if(geometry.groups[0].count!==24||geometry.drawRange.start!==3||geometry.drawRange.count!==90)throw Error('Draw ranges/groups changed')
    const joint=new T.Group(),fixed=new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial()),moving=fixed.clone()
    fixed.position.set(.1,.2,.3);joint.add(fixed,moving)
    cacheStaticMeshTransforms(joint,new Set([moving]));joint.rotation.y=.71;moving.rotation.x=.42;joint.updateMatrixWorld(true)
    const expected=new T.Matrix4().multiplyMatrices(joint.matrixWorld,new T.Matrix4().makeTranslation(.1,.2,.3))
    if(fixed.matrixAutoUpdate||!joint.matrixAutoUpdate||!moving.matrixAutoUpdate||!fixed.matrixWorld.equals(expected))throw Error('Cached meshes no longer inherit live animation')
    geometry.dispose();before.dispose();fixed.geometry.dispose();fixed.material.dispose()
  })
  assert.deepEqual(errors,[])
  if(process.env.PERF_BASELINE){
    const baseline=JSON.parse(await readFile(process.env.PERF_BASELINE,'utf8'))
    for(const result of results){
      const before=baseline.results.find(item=>item.label===result.label)
      assert.equal(result.pixelRatio,before.pixelRatio);assert.deepEqual(result.shadowSize,before.shadowSize)
      if(result.label==='covered-studio'){assert.equal(result.frames,0);continue}
      assert.equal(result.hash,before.hash,`Rendered pixels changed: ${result.label}`)
      assert.ok((await readFile(join(output,`${result.label}.png`))).equals(await readFile(join(dirname(process.env.PERF_BASELINE),`${result.label}.png`))),`Captured image changed: ${result.label}`)
      assert.equal(result.calls,before.calls);assert.equal(result.triangles,before.triangles)
      assert.ok(result.matricesPerFrame<before.matricesPerFrame,`Matrix work not reduced: ${result.label}`)
      assert.ok(result.geometryBytes<before.geometryBytes,`Geometry buffers not reduced: ${result.label}`)
    }
  }
  const report={results,errors,output}
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2))
  console.log(JSON.stringify(report,null,2))
}finally{await browser.close()}
