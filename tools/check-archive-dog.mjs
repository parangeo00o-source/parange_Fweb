import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output=await mkdtemp(join(tmpdir(),'parange-dog-'))
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1440,height:1100},reducedMotion:'no-preference'}),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.goto((process.env.REVIEW_URL||'https://localhost:5173')+'/#archive')
 await page.getByRole('button',{name:'Come out — summon robot'}).waitFor()
 assert.equal(await page.locator('.ar-product-canvas').getAttribute('data-vehicle'),'robot-dog-carrier')
 const nav=await page.locator('.ar-bottom-actions').evaluate(e=>{const b=e.querySelector('.ar-back').getBoundingClientRect(),w=e.querySelector('.ar-section-nav').getBoundingClientRect();return{back:b.x,works:w.x,width:innerWidth}})
 assert.ok(nav.back<nav.width/2&&nav.works>nav.width/2)
 await page.getByRole('button',{name:'Come out — summon robot'}).click()
 await page.waitForFunction(()=>document.querySelector('.ar-product-canvas').dataset.arrival==='walking')
 assert.equal(await page.getByRole('button',{name:'Robot arriving'}).isDisabled(),true)
 await page.waitForFunction(()=>Number(document.querySelector('.ar-product-canvas').dataset.arrivalProgress)>.7)
 await page.screenshot({path:join(output,'walking.png')})
 await page.waitForFunction(()=>document.querySelector('.ar-product-canvas').dataset.arrival==='settling')
 assert.equal(await page.getByRole('button',{name:'Robot arriving'}).isDisabled(),true)
 await page.waitForFunction(()=>document.querySelector('.ar-product-canvas').dataset.arrival==='arrived')
 assert.equal(await page.locator('.ar-product-canvas').getAttribute('data-pose'),'sitting')
 await page.screenshot({path:join(output,'sitting.png')})
 const frames=await page.locator('.ar-product-canvas').getAttribute('data-frames')
 await page.waitForTimeout(200);assert.equal(await page.locator('.ar-product-canvas').getAttribute('data-frames'),frames)
 const host=await page.locator('.ar-cabinet-wrap').boundingBox(),hit=JSON.parse(await page.locator('.ar-product-canvas').getAttribute('data-case-center'))
 await page.mouse.click(host.x+hit.x,host.y+hit.y)
 await page.waitForFunction(()=>document.querySelector('.ar-cabinet-wrap').dataset.caseState==='open')
 assert.equal(await page.locator('.ar-card:visible').count(),25)
 await page.screenshot({path:join(output,'open.png')})
 await page.getByRole('button',{name:'Close archive case'}).click()
 await page.waitForFunction(()=>document.querySelector('.ar-cabinet-wrap').dataset.caseState==='closed')
 await page.locator('.ar-back').click()
 await page.locator('.dice[data-route="#archive"]').click()
 await page.getByRole('button',{name:'Come out — summon robot'}).click()
 await page.waitForFunction(()=>document.querySelector('.ar-product-canvas').dataset.arrival==='walking')
 await page.keyboard.press('Escape');await page.locator('.archive-screen').waitFor({state:'hidden'})
 const stopped=await page.locator('.ar-product-canvas').getAttribute('data-frames');await page.waitForTimeout(150);assert.equal(await page.locator('.ar-product-canvas').getAttribute('data-frames'),stopped)
 const geometry=await page.evaluate(async()=>{
   const THREE=await import('/node_modules/three/build/three.module.js'),{createArchiveDogCarrier}=await import('/src/archive-robot-dog.ts')
   const model=new THREE.Group(),cargo=new THREE.Group(),gs=new Set(),ms=new Set(),ts=[];model.add(cargo)
   const pet=createArchiveDogCarrier(model,cargo,(w,h,draw)=>{const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'));const t=new THREE.CanvasTexture(c);ts.push(t);return t},(g,m)=>{gs.add(g);ms.add(m)})
   let attached=true,grounded=true,finite=true,solid=true
   const head=model.getObjectByName('dog-head'),paws=[];model.traverse(o=>{if(/^dog-paw-(front|rear)-/.test(o.name))paws.push(o)})
   for(let i=0;i<=24;i++){
     const sit=i/24;pet.walk(i/24*Math.PI*8,1-sit,sit);model.updateMatrixWorld(true)
     const grip=cargo.localToWorld(new THREE.Vector3(0,-.15,6.65)),mouth=head.getObjectByName('dog-handle-grip').getWorldPosition(new THREE.Vector3())
     attached&&=grip.distanceTo(mouth)<.00001
     grounded&&=paws.every(p=>new THREE.Box3().setFromObject(p).min.y>=-6.54)
     pet.bounds()
   }
   pet.walk(0,0,1)
   for(let i=0;i<=24;i++){
     pet.setProgress(i/24);for(const p of pet.bounds())finite&&=Number.isFinite(p.x+p.y+p.z)
     const robot=model.getObjectByName('robot-dog');solid&&=robot.visible
     robot.traverse(o=>{if(o.isMesh)for(const m of [o.material].flat())solid&&=m.opacity===1&&!m.transparent})
   }
   const caseBox=new THREE.Box3().setFromObject(cargo),dogBox=new THREE.Box3().setFromObject(model.getObjectByName('robot-dog'))
   const separated=caseBox.max.x<dogBox.min.x+3 // open case lies in front of the forepaws
   const cranium=head.getObjectByName('dog-cranium');cranium.geometry.computeBoundingBox()
   const headShape=cranium.geometry.boundingBox.getSize(new THREE.Vector3())
   const profile=Math.max(headShape.y,headShape.z)/Math.min(headShape.y,headShape.z)<1.2
   const seamless=!model.getObjectByName('dog-muzzle')&&!model.getObjectByName('dog-lip')
   const optics=[];head.traverse(o=>{if(o.name==='dog-optical-lens')optics.push(o)})
   for(const g of gs){for(const n of g.attributes.position?.array||[])finite&&=Number.isFinite(n);g.dispose()}for(const m of ms)m.dispose();for(const t of ts)t.dispose()
   return{attached,grounded,finite,solid,separated,seamless,lenses:optics.length,paws:paws.length,profile}
 })
 assert.deepEqual(geometry,{attached:true,grounded:true,finite:true,solid:true,separated:true,seamless:true,lenses:6,paws:4,profile:true})
 assert.deepEqual(errors,[])
 console.log(`PASS: right-side navigation, summon/walk/sit, bag click, mouth-handle attachment at 25 poses, four grounded paws, original dog head proportions, opaque robot through opening/zoom, open case clearance, finite geometry, render suspension and exit during arrival. Screenshots: ${output}`)
}finally{await browser.close()}
