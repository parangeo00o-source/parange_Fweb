import assert from 'node:assert/strict'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:390,height:700},reducedMotion:'reduce'}),errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.route('**/src/archive-product.ts*',async route=>{
  const response=await route.fetch()
  const source=(await response.text()).replace('renderer.setPixelRatio(1)',`renderer.setPixelRatio(1);
   window.__archiveRaycasts=0;
   const intersect=THREE.Raycaster.prototype.intersectObjects;
   THREE.Raycaster.prototype.intersectObjects=function(...args){window.__archiveRaycasts++;return intersect.apply(this,args)};
  `)
  await route.fulfill({response,body:source})
 })
 await page.goto((process.env.REVIEW_URL||'https://localhost:5173')+'/#archive')
 await page.getByRole('button',{name:'Come out — summon robot'}).click()
 await page.waitForFunction(()=>document.querySelector('.ar-product-canvas')?.dataset.arrival==='arrived')
 const matrices=await page.evaluate(async()=>{
  const THREE=await import('/node_modules/three/build/three.module.js')
  const {cacheArchiveTransforms}=await import('/src/archive-transforms.ts')
  const a=new THREE.Group(),b=new THREE.Group(),c=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial())
  a.add(b);b.add(c);a.updateMatrixWorld(true)
  const copy=a.clone(true);cacheArchiveTransforms(copy)
  for(let i=0;i<12;i++){
   for(const root of [a,copy]){
    root.position.x=i;root.rotation.y=i*.13
    root.children[0].scale.set(1+i*.01,1,1)
    // Updating just an ancestor must not leave a descendant with stale data.
    root.updateWorldMatrix(true,false)
    root.children[0].getWorldPosition(new THREE.Vector3())
    root.updateMatrixWorld()
   }
   if(!a.children[0].children[0].matrixWorld.equals(copy.children[0].children[0].matrixWorld))return false
  }
  c.geometry.dispose();c.material.dispose();return true
 })
 assert.equal(matrices,true,'Cached transforms must preserve parent-only update semantics')
 await page.mouse.move(60,200);await page.mouse.move(330,500,{steps:30})
 assert.equal(await page.evaluate(()=>window.__archiveRaycasts),0,'Hover must not raycast the robot')
 await page.emulateMedia({reducedMotion:'no-preference'})
 const frames=()=>page.locator('.ar-product-canvas').getAttribute('data-frames')
 const first=await frames();await page.waitForTimeout(300)
 assert.notEqual(await frames(),first,'Visible LEDs still animate')
 await page.locator('.archive-screen').evaluate(element=>{element.scrollTop=element.scrollHeight})
 await page.waitForFunction(()=>document.querySelector('.ar-product-canvas').getBoundingClientRect().bottom<0)
 await page.waitForTimeout(200)
 const outside=await frames();await page.waitForTimeout(500)
 assert.equal(await frames(),outside,'Fully offscreen robot must stop rendering')
 await page.locator('.archive-screen').evaluate(element=>{element.scrollTop=0})
 await page.waitForFunction(previous=>document.querySelector('.ar-product-canvas').dataset.frames!==previous,outside)
 await page.emulateMedia({reducedMotion:'reduce'})
 await page.getByRole('button',{name:'Open archive case'}).click()
 await page.waitForFunction(()=>document.querySelector('.ar-cabinet-wrap').dataset.caseState==='open')
 await page.keyboard.press('Escape')
 await page.waitForFunction(()=>document.querySelector('.ar-cabinet-wrap').dataset.caseState==='closed')
 assert.deepEqual(errors,[])
 console.log('PASS: exact cached parent transforms, no hover raycasts, LED animation, offscreen suspension/resume and fullscreen entry/exit.')
} finally { await browser.close() }
