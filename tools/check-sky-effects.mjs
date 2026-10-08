import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output=await mkdtemp(join(tmpdir(),'parange-sky-effects-'))
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}})
  const errors=[];page.on('pageerror',e=>errors.push(String(e)))
  page.on('console',m=>{if(m.type()==='error'&&/THREE.WebGLProgram|Shader Error/.test(m.text()))errors.push(m.text())})
  await page.goto(process.env.REVIEW_URL || 'https://localhost:5173')
  await page.evaluate(async()=>{
    const {createParangePlanetExperience}=await import('/src/parange-planet.ts')
    window.fxApp=createParangePlanetExperience();window.fxApp.open()
  })
  await page.waitForTimeout(600)
  await page.evaluate(async()=>{
    const T=await import('/node_modules/.vite/deps/three.js')
    const {createPlanetBubbles}=await import('/src/planet-bubbles.ts'),{createPlanetNight}=await import('/src/planet-night.ts')
    const w=window.fxApp.world;w.close();w.setNight(true)
    const scene=w.world.parent.clone(true),camera=w.camera.clone()
    for(const name of ['island-sky-bubbles','sky-bubble-bursts','moonlit-night-sky'])scene.getObjectByName(name)?.removeFromParent()
    const bubbles=createPlanetBubbles(scene,camera),night=createPlanetNight(scene,camera)
    const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight)
    renderer.toneMapping=T.NeutralToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap
    Object.assign(renderer.domElement.style,{position:'fixed',inset:0,zIndex:9999999});document.body.append(renderer.domElement)
    const tick=(ms,visible=true)=>{bubbles.update(ms,visible);night.update(ms,visible,bubbles.burstComplete);renderer.render(scene,camera)}
    window.fx={scene,camera,bubbles,night,renderer,tick}
    bubbles.update(10000,true);bubbles.setNight(true,10000);night.setNight(true);tick(10000)
    if(!bubbles.group.visible||!bubbles.bursts.visible||bubbles.burstComplete)throw Error('Burst transition did not start')
    if(bubbles.group.children.filter(s=>s.visible).length!==6)throw Error('Bubbles are not staggered')
    tick(10350)
    if(bubbles.group.children.filter(s=>s.visible).length!==3)throw Error('Staggered bubbles did not pop')
    if(night.sky.material.uniforms.uMeteors.value!==-1)throw Error('Meteors begin before the burst finishes')
    if(bubbles.bursts.geometry.instanceCount!==448||!bubbles.bursts.material.depthTest||bubbles.bursts.material.depthWrite)throw Error('Sparkle batching/depth is incorrect')
    const color=bubbles.bursts.geometry.attributes.aColor,unique=new Set()
    for(let i=0;i<color.count;i++)unique.add([color.getX(i),color.getY(i),color.getZ(i)].join(','))
    if(unique.size!==6||bubbles.bursts.material.toneMapped)throw Error('Firework colour palette is being washed out')
  })
  await page.screenshot({path:join(output,'01-burst.png')})
  await page.evaluate(()=>window.fx.tick(10900))
  await page.screenshot({path:join(output,'02-afterglow.png')})
  await page.evaluate(()=>{
    const f=window.fx;f.tick(12400)
    if(f.bubbles.group.visible||f.bubbles.bursts.visible||!f.bubbles.burstComplete)throw Error('Bubbles/particles remain in the night sky')
    if(f.night.sky.material.uniforms.uMeteors.value!==0)throw Error('Meteors did not start after the burst')
    f.tick(13200)
    if(f.night.sky.material.uniforms.uMeteors.value!==.8)throw Error('Meteor animation time is not deterministic')
  })
  await page.screenshot({path:join(output,'03-meteors.png')})
  await page.evaluate(()=>window.fx.tick(14500))
  await page.screenshot({path:join(output,'04-meteor-shower.png')})
  await page.evaluate(()=>{
    const f=window.fx,geometry=f.bubbles.bursts.geometry,material=f.bubbles.bursts.material
    for(let i=0;i<20;i++){
      f.bubbles.setNight(false,15000+i*20);f.night.setNight(false);f.tick(15000+i*20)
      if(f.bubbles.bursts.visible||f.night.sky.visible||!f.bubbles.group.visible||f.bubbles.group.children.some(s=>!s.visible))throw Error('Day reset failed')
      f.bubbles.setNight(true,15010+i*20);f.night.setNight(true);f.tick(15010+i*20)
      if(f.night.sky.material.uniforms.uMeteors.value!==-1)throw Error('Rapid toggle retained old meteor animation')
    }
    if(f.bubbles.bursts.geometry!==geometry||f.bubbles.bursts.material!==material||f.scene.children.filter(c=>c.name==='sky-bubble-bursts').length!==1)throw Error('Toggling allocates extra particle fields')
    f.tick(15500,false)
    if(f.bubbles.group.visible||f.bubbles.bursts.visible||f.night.sky.visible)throw Error('Sky effects cover character reveals')
    f.tick(18000,true);f.tick(18500,true)
  })
  await page.setViewportSize({width:390,height:844})
  await page.evaluate(()=>{
    const f=window.fx;f.camera.aspect=innerWidth/innerHeight;f.camera.updateProjectionMatrix();f.renderer.setSize(innerWidth,innerHeight)
    f.camera.position.set(0,0,4.08/Math.sin(Math.atan(Math.tan(34/2*Math.PI/180)*f.camera.aspect))/.80);f.camera.lookAt(0,0,0)
    f.tick(19300)
  })
  await page.screenshot({path:join(output,'05-mobile-meteors.png')})
  await page.evaluate(()=>{
    const f=window.fx;f.bubbles.setNight(false,20000);f.night.setNight(false);f.tick(20000)
    const before=f.bubbles.group.children.map(s=>s.position.clone().project(f.camera).y)
    if(before.some(y=>y>=-1))throw Error('Day bubbles must enter from below the viewport')
    if(f.bubbles.group.children.some(s=>s.material.uniforms.uVisibility.value!==0))throw Error('Day bubbles pop into view before rising')
    f.tick(21200)
    const midway=f.bubbles.group.children.map(s=>s.position.clone().project(f.camera).y)
    if(midway.some((y,i)=>y<=before[i]))throw Error('Day bubbles do not rise upwards')
    if(f.bubbles.group.children[0].material.uniforms.uVisibility.value<=f.bubbles.group.children[6].material.uniforms.uVisibility.value)throw Error('Bubble entrance is not staggered')
    f.tick(23100)
    if(f.bubbles.group.children.some(s=>s.material.uniforms.uVisibility.value!==1))throw Error('Bubbles did not finish appearing')
    // Interrupt an unfinished sunrise: bursts must originate at the bubbles'
    // actual entering positions, not jump back to their final daytime layout.
    f.bubbles.setNight(true,23200);f.night.setNight(true);f.tick(23200)
    f.bubbles.setNight(false,23300);f.night.setNight(false);f.tick(23700)
    const partial=f.bubbles.group.children[0].position.clone().project(f.camera)
    f.bubbles.setNight(true,23700);f.night.setNight(true);f.tick(23700)
    if(f.bubbles.group.children[0].position.clone().project(f.camera).distanceTo(partial)>.00001)throw Error('Rapid day/night reversal jumps the bubble position')
  })
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.evaluate(()=>{
    const f=window.fx;f.bubbles.setNight(false,20000);f.night.setNight(false)
    f.bubbles.setNight(true,20000);f.night.setNight(true);f.tick(20000);f.tick(22000)
    if(f.bubbles.group.visible||f.bubbles.bursts.visible||f.night.sky.material.uniforms.uMeteors.value!==-1||!f.night.sky.visible)throw Error('Reduced motion still shows bursts/meteors')
  })
  if(errors.length)throw Error(errors.join('\n'))
  console.log(JSON.stringify({staggeredPop:true,sparkles:448,nightBubblesHidden:true,meteorsAfterBurst:true,rapidToggle:true,reducedMotion:true,errors,output},null,2))
} finally {await browser.close()}
