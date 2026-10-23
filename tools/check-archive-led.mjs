import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const output=await mkdtemp(join(tmpdir(),'parange-led-'))
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000},reducedMotion:'no-preference'}),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text())})
 await page.route('**/src/archive-product.ts*',async route=>{
  const response=await route.fetch()
  const source=(await response.text()).replace(/return \{\s+setCards,/,`window.__ledReview={
   optics(){const lenses=[],lights=[];model.traverse(o=>{if(o.name==='dog-optical-lens')lenses.push({color:o.material.color.getHexString(),emissive:o.material.emissive.getHexString(),vertices:o.geometry.attributes.position.count});if(o.name==='dog-eye-led')lights.push(o)});return {lenses,lights:lights.length,shared:lights[0].material===lights[1].material,depthWrite:lights[0].material.depthWrite,shadows:lights.some(o=>o.castShadow||o.receiveShadow)}} ,
   neck(){
    stopSmile();const samples=[],up=new THREE.Vector3(0,1,0),head=model.getObjectByName('dog-head'),body=model.getObjectByName('dog-body'),neck=model.getObjectByName('dog-neck-gimbal'),a=model.getObjectByName('dog-collar-socket'),b=model.getObjectByName('dog-neck-upper-socket');
    for(let i=0;i<=32;i++){
     lid.walk(i/32*Math.PI*8,1-i/32,i/32);
     const axis=up.clone().applyQuaternion(neck.quaternion),direction=head.position.clone().sub(body.position).normalize();
     const shoulder=a.position.clone().sub(body.position).applyQuaternion(body.quaternion.clone().invert()).divide(new THREE.Vector3(9,4.41,4)).normalize().applyQuaternion(body.quaternion);
     const jaw=b.position.clone().sub(head.position).applyQuaternion(head.quaternion.clone().invert()).divide(new THREE.Vector3(3.03**2,2.72**2,2.75**2)).normalize().negate().applyQuaternion(head.quaternion);
     samples.push({gap:a.position.distanceTo(b.position),axis:axis.dot(direction),shoulder:shoulder.dot(up.clone().applyQuaternion(a.quaternion)),jaw:jaw.dot(up.clone().applyQuaternion(b.quaternion))});
    }lid.walk(0,0,1);return samples;
   },
   portrait(expression,walking=false,animated=false,time=50000){
    stopSmile();stopEyesTimer();cancelAnimationFrame(frame);frame=0;lid.walk(.4,walking?1:0,walking?0:1);lid.setProgress(0);travel.position.set(0,0,0);travel.rotation.set(0,0,0);travel.visible=true;
    lid.updateEyes(expression,50000,false,true);scene.updateMatrixWorld(true);
    if(animated)lid.updateEyes(expression,time,true,false);
    const target=model.getObjectByName('dog-head').getWorldPosition(new THREE.Vector3());
    camera.clearViewOffset();camera.aspect=renderWidth/renderHeight;camera.position.copy(target).add(new THREE.Vector3(-12,3,12));camera.lookAt(target);camera.updateProjectionMatrix();camera.updateMatrixWorld();
    renderer.setScissorTest(false);renderer.autoClear=true;renderer.shadowMap.needsUpdate=true;renderer.render(scene,camera);return canvas.toDataURL();
   },
   ledTime(){return model.getObjectByName('dog-eye-led').material.uniforms.time.value},
   pendingSmile(){return smileTimer!==undefined}
  };return {setCards,`)
  assert.notEqual(source,await response.text(),'Review bridge injected')
  await route.fulfill({response,body:source})
 })
 await page.goto((process.env.REVIEW_URL||'https://localhost:5173')+'/#archive')
 await page.waitForFunction(()=>document.querySelector('.ar-product-canvas')?.dataset.graphicsReady==='true')
 const blinks=await page.evaluate(async()=>{
  const {createDogLED}=await import('/src/archive-dog-led.ts'),led=createDogLED(),u=led.material.uniforms,samples=[];
  let clock=1000;
  for(const mode of ['loading','star','heart','smile','heart']){
   led.update(mode,clock,true,false);
   for(const dt of [0,50,125,160,250,350]){led.update(mode,clock+dt,true,false);samples.push({mode,dt,gain:u.gain.value,blend:u.blend.value})}
   clock+=1000;
  }
  led.update('star',clock,true,true);const reduced={gain:u.gain.value,blend:u.blend.value};
  led.material.dispose();return {samples,reduced};
 })
 for(const mode of ['loading','star','heart','smile']){
  const samples=blinks.samples.filter(s=>s.mode===mode)
  assert.ok(samples.filter(s=>s.dt===125||s.dt===160).every(s=>s.gain===0),'Switch while LEDs are dark')
  assert.ok(samples.filter(s=>s.dt===125).every(s=>s.blend===0),'Old pattern dims first')
  assert.ok(samples.filter(s=>s.dt===160).every(s=>s.blend===1),'New pattern appears after blackout')
  assert.ok(samples.filter(s=>s.dt===350).every(s=>s.gain===1),'New pattern lights fully')
 }
 assert.deepEqual(blinks.reduced,{gain:1,blend:1})
 const optics=await page.evaluate(()=>window.__ledReview.optics())
 assert.equal(optics.lenses.length,6);assert.ok(optics.lenses.every(l=>l.color==='83d822'&&l.emissive==='397600'))
 assert.deepEqual({lights:optics.lights,shared:optics.shared,depthWrite:optics.depthWrite,shadows:optics.shadows},{lights:2,shared:true,depthWrite:false,shadows:false})
 const expression=()=>page.locator('.ar-product-canvas').getAttribute('data-eye-expression')
 await page.getByRole('button',{name:'Come out — summon robot'}).click()
 await page.waitForFunction(()=>document.querySelector('.ar-product-canvas').dataset.arrival==='walking')
 assert.equal(await expression(),'loading')
 const time=await page.evaluate(()=>window.__ledReview.ledTime());await page.waitForTimeout(100)
 assert.ok(await page.evaluate(()=>window.__ledReview.ledTime())>time,'Loading LEDs animate')
 await page.waitForFunction(()=>document.querySelector('.ar-product-canvas').dataset.arrival==='arrived')
 await page.waitForTimeout(650)
 assert.equal(await expression(),'loading','Loading persists until the first bag opening')
 assert.equal(await page.evaluate(()=>window.__ledReview.pendingSmile()),false,'A random smile must not interrupt initial loading')
 await page.getByRole('button',{name:'Open archive case'}).click()
 await page.waitForFunction(()=>document.querySelector('.ar-product-canvas').dataset.eyeExpression==='star')
 await page.waitForFunction(()=>document.querySelector('.ar-cabinet-wrap').dataset.caseState==='open')
 assert.equal(await expression(),'star')
 await page.waitForFunction(()=>document.querySelector('.ar-product-canvas').dataset.eyeExpression==='smile',null,{timeout:30000})
 await page.waitForFunction(()=>document.querySelector('.ar-product-canvas').dataset.eyeExpression==='star')
 await page.getByRole('button',{name:'Close archive case'}).click()
 await page.waitForFunction(()=>document.querySelector('.ar-product-canvas').dataset.eyeExpression==='heart')
 await page.waitForFunction(()=>document.querySelector('.ar-cabinet-wrap').dataset.caseState==='closed')
 assert.equal(await expression(),'smile','Finishing the close immediately shows a farewell smile')
 await page.waitForTimeout(800)
 assert.equal(await expression(),'smile','Farewell smile remains visible briefly')
 await page.waitForFunction(()=>document.querySelector('.ar-product-canvas').dataset.eyeExpression==='loading',null,{timeout:5000})
 assert.equal(await page.evaluate(()=>window.__ledReview.pendingSmile()),false,'Closed case returns to sustained loading')
 const frames=Number(await page.locator('.ar-product-canvas').getAttribute('data-frames'));await page.waitForTimeout(350)
 const ledFrames=Number(await page.locator('.ar-product-canvas').getAttribute('data-frames'))-frames
 assert.ok(ledFrames>=2&&ledFrames<=13,'Light-only animation continues at a bounded cadence')
 assert.deepEqual(await page.evaluate(()=>window.__ledReview.optics()),optics,'Original lenses stay unchanged through all expressions')
 // Reversing an opening action immediately switches to the closing expression.
 await page.getByRole('button',{name:'Open archive case'}).click()
 await page.waitForFunction(()=>document.querySelector('.ar-product-canvas').dataset.eyeExpression==='star')
 await page.keyboard.press('Escape')
 await page.waitForFunction(()=>document.querySelector('.ar-product-canvas').dataset.eyeExpression==='heart')
 await page.waitForFunction(()=>document.querySelector('.ar-cabinet-wrap').dataset.caseState==='closed')
 await page.emulateMedia({reducedMotion:'reduce'})
 await page.getByRole('button',{name:'Open archive case'}).click()
 await page.waitForFunction(()=>document.querySelector('.ar-cabinet-wrap').dataset.caseState==='open')
 assert.equal(await expression(),'star')
 assert.equal(await page.evaluate(()=>window.__ledReview.ledTime()),0,'Reduced motion keeps the LED pattern static')
 await page.getByRole('button',{name:'Close archive case'}).click()
 await page.waitForFunction(()=>document.querySelector('.ar-cabinet-wrap').dataset.caseState==='closed')
 assert.equal(await page.evaluate(()=>window.__ledReview.pendingSmile()),true)
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))})
 assert.equal(await page.evaluate(()=>window.__ledReview.pendingSmile()),false,'Background tabs cancel pending smiles')
 const background=await page.locator('.ar-product-canvas').getAttribute('data-frames');await page.waitForTimeout(300)
 assert.equal(await page.locator('.ar-product-canvas').getAttribute('data-frames'),background)
 await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'))})
 await page.waitForFunction(()=>document.querySelector('.ar-product-canvas').dataset.eyeExpression==='loading')
 assert.equal(await page.evaluate(()=>window.__ledReview.pendingSmile()),false)
 await page.getByRole('button',{name:'Open archive case'}).click()
 await page.waitForFunction(()=>document.querySelector('.ar-cabinet-wrap').dataset.caseState==='open')
 await page.getByRole('button',{name:'Close archive case'}).click()
 await page.waitForFunction(()=>document.querySelector('.ar-cabinet-wrap').dataset.caseState==='closed')
 assert.equal(await expression(),'smile')
 // Reopening during the farewell must cancel its return-to-loading timer.
 await page.getByRole('button',{name:'Open archive case'}).click()
 await page.waitForFunction(()=>document.querySelector('.ar-cabinet-wrap').dataset.caseState==='open')
 await page.waitForTimeout(2400)
 assert.equal(await expression(),'star','An old farewell timer must not replace a new opening expression')
 await page.getByRole('button',{name:'Close archive case'}).click()
 await page.waitForFunction(()=>document.querySelector('.ar-cabinet-wrap').dataset.caseState==='closed')
 await page.locator('.ar-back').click()
 assert.equal(await page.evaluate(()=>window.__ledReview.pendingSmile()),false,'Leaving the archive cancels pending smiles')
 await page.locator('.dice[data-route="#archive"]').click()
 await page.getByRole('button',{name:'Come out — summon robot'}).click()
 await page.waitForFunction(()=>document.querySelector('.ar-product-canvas').dataset.arrival==='arrived')
 assert.equal(await expression(),'loading','Returning to the archive resets to loading')
 await page.waitForTimeout(150) // Allow the summon button/layout resize to settle.
 assert.equal(await page.locator('.ar-product-canvas').getAttribute('data-eye-animating'),'false')
 const still=await page.locator('.ar-product-canvas').getAttribute('data-frames');await page.waitForTimeout(300)
 assert.equal(await page.locator('.ar-product-canvas').getAttribute('data-frames'),still,'Reduced-motion loading remains static')
 const neck=await page.evaluate(()=>window.__ledReview.neck())
 assert.ok(neck.every(p=>p.gap>.25&&p.gap<1.1&&p.axis>.999999&&p.shoulder>.999999&&p.jaw>.999999),'Short joint follows head/body direction, each socket sits tangent to its shell')
 for(const mode of ['off','loading','star','heart','smile']){
  await page.evaluate(mode=>window.__ledReview.portrait(mode),mode)
  await page.screenshot({path:join(output,mode+'.png')})
 }
 for(const mode of ['loading','star','heart']){
  const a=await page.evaluate(mode=>window.__ledReview.portrait(mode,false,true,50200),mode)
  await page.screenshot({path:join(output,mode+'-motion-a.png')})
  const b=await page.evaluate(mode=>window.__ledReview.portrait(mode,false,true,50900),mode)
  await page.screenshot({path:join(output,mode+'-motion-b.png')})
  assert.notEqual(a,b,mode+' must visibly animate while its pattern is held')
 }
 // Measure the actual rendered light, rather than accepting any tiny pixel
 // difference as proof that the requested motion is noticeable.
 const motion=await page.evaluate(async()=>{
  async function pixels(mode,time){
   const src=window.__ledReview.portrait(mode,false,true,time),image=new Image();image.src=src;await image.decode();
   const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
   const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height).data;
  }
  const baseline=await pixels('off',0);
  async function lit(mode,time){const data=await pixels(mode,time);let count=0;for(let i=0;i<data.length;i+=4)if(Math.max(Math.abs(data[i]-baseline[i]),Math.abs(data[i+1]-baseline[i+1]),Math.abs(data[i+2]-baseline[i+2]))>32)count++;return count}
  return {heartSmall:await lit('heart',1190),heartLarge:await lit('heart',252),starOutline:await lit('star',162),starFilled:await lit('star',1008),starOff:await lit('star',1620)};
 })
 assert.ok(motion.heartLarge>motion.heartSmall*1.5,'Heartbeat must visibly expand the rendered LED area')
 assert.ok(motion.starFilled>motion.starOutline*1.2,'Star must light its interior, not just modulate its outline')
 assert.ok(motion.starOff<motion.starOutline*.02,'Star must visibly switch off between fills')
 console.log('Rendered LED pixels:',motion)
 for(const [name,mode,time] of [['heart-small','heart',1190],['heart-large','heart',252],['star-outline','star',162],['star-filled','star',1008],['star-off','star',1620]]){
  await page.evaluate(([mode,time])=>window.__ledReview.portrait(mode,false,true,time),[mode,time])
  await page.screenshot({path:join(output,name+'.png')})
 }
 await page.evaluate(()=>window.__ledReview.portrait('loading',true));await page.screenshot({path:join(output,'walking-neck.png')})
 await page.locator('.ar-back').click()
 const hidden=await page.locator('.ar-product-canvas').getAttribute('data-frames');await page.waitForTimeout(2200)
 assert.equal(await page.locator('.ar-product-canvas').getAttribute('data-frames'),hidden)
 assert.deepEqual(errors,[])
 console.log('PASS: persistent initial loading; closing heart → farewell smile → loading; interrupted farewell; blink on all expression changes; animated loading/star/heart; bounded light-only cadence; original optics, random smile, reduced motion and hidden suspension; aligned neck. Screenshots:',output)
}finally{await browser.close()}
