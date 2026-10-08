import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output=await mkdtemp(join(tmpdir(),'parange-coastal-fish-'))
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1200,height:900}})
  const errors=[];page.on('pageerror',e=>errors.push(String(e)))
  page.on('console',m=>{if(m.type()==='error'&&/THREE.WebGLProgram|Shader Error/.test(m.text()))errors.push(m.text())})
  await page.goto(process.env.REVIEW_URL || 'https://localhost:5173')
  const checks=await page.evaluate(async()=>{
    const {createParangePlanetExperience}=await import('/src/parange-planet.ts')
    const T=await import('/node_modules/.vite/deps/three.js')
    const {waterSwell}=await import('/src/planet-water.ts')
    const app=createParangePlanetExperience();app.open();const w=app.world;w.close()
    window.fishReview={app,w,T}
    if(!document.querySelector('.planet-day-toggle').textContent.includes('햇살 산책'))throw Error('Old day label')
    const e=w.environment,f=e.fish
    if(f.fish.length<10)throw Error(`Too few validated fish patrols: ${f.fish.length}`)
    let maxAirborne=0,sawDuet=false,sawSingle=false,sawSplash=false,maxSpeed=0
    for(let time=0;time<120;time+=.05){
      f.update(time*1000)
      const airborne=f.fish.filter(f=>!f.root.userData.underwater).length
      maxAirborne=Math.max(maxAirborne,airborne);sawDuet ||= airborne===2;sawSingle ||= airborne===1
      sawSplash ||= f.fish.some(f=>f.ripple.visible&&f.drops.visible)
      for(const swimmer of f.fish){
        const n=f.pointAt(swimmer,time),bank=e.surface(n).bank
        if(bank>-.075)throw Error('Fish swims onto sand')
        const speed=n.distanceTo(f.pointAt(swimmer,time+.01))*3/.01;maxSpeed=Math.max(speed,maxSpeed)
        if(speed>.10)throw Error('Fish swims too fast')
        const floor=3+e.surface(n).height
        if(swimmer.root.position.length()-.013<floor)throw Error('Fish clips through sea bed')
        if(swimmer.root.userData.underwater&&swimmer.parts.some(p=>!p.material.isMeshBasicMaterial))throw Error('Underwater fish not a silhouette')
      }
    }
    if(maxAirborne>2||!sawSingle||!sawDuet||!sawSplash)throw Error('Invalid jump/splash choreography')
    const material=w.world.getObjectByName('garden-pond-water').material
    const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>\n#include <emissivemap_fragment>\n#include <clipping_planes_fragment>'}
    material.onBeforeCompile(shader,{})
    if(!material.transparent||material.opacity>.85||material.depthWrite)throw Error('Opaque water hides swimmers')
    if(!shader.vertexShader.includes('transformed+=')||!shader.uniforms.uSinkCos||shader.uniforms.uCoastGlowStrength.value!==2.3)throw Error('Wave, sinkhole or coast glow composition lost')
    if(Math.abs(waterSwell(.3,.1,2,0)-waterSwell(.3,.1,2,1))<.0001)throw Error('No geometric wave motion')
    return {count:f.fish.length,maxAirborne,sawSingle,sawDuet,sawSplash,maxSpeed}
  })
  await page.evaluate(()=>{
    const {w,T}=window.fishReview;w.world.rotation.set(0,0,0)
    const scene=w.world.parent;scene.getObjectByName('moonlit-night-sky').visible=false;scene.getObjectByName('island-sky-bubbles').visible=false
    const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.toneMapping=T.NeutralToneMapping
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap
    Object.assign(renderer.domElement.style,{position:'fixed',inset:0,zIndex:9999999});document.body.append(renderer.domElement)
    const camera=new T.PerspectiveCamera(38,innerWidth/innerHeight,.05,30)
    const n=new T.Vector3(0,Math.sin(-.91),Math.cos(-.91)),north=new T.Vector3(0,Math.cos(-.91),-Math.sin(-.91)),east=new T.Vector3(1,0,0)
    const center=n.clone().multiplyScalar(2.96)
    camera.position.copy(center).addScaledVector(n,2.1).addScaledVector(north,-1.55).addScaledVector(east,.45)
    camera.up.copy(north);camera.lookAt(center)
    Object.assign(window.fishReview,{scene,renderer,camera})
  })
  for(const [name,time,night] of [['day-swim',2000,false],['day-jump',4600,false],['day-splash',5300,false],['night-swim',2000,true]]){
    await page.evaluate(({time,night})=>{
      const {w,T,scene,renderer,camera}=window.fishReview;w.setNight(night);w.environment.update(time)
      scene.background=new T.Color(night?'#101c39':'#abd9e8');renderer.render(scene,camera)
    },{time,night})
    await page.screenshot({path:join(output,`${name}.png`)})
  }
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.evaluate(()=>{
    const {w}=window.fishReview,f=w.environment.fish
    f.update(1000);const before=f.fish.map(f=>f.root.position.toArray().join())
    f.update(4600)
    f.fish.forEach((f,i)=>{if(before[i]!==f.root.position.toArray().join()||!f.root.userData.underwater||f.ripple.visible||f.drops.visible)throw Error('Reduced motion fish still animate')})
    w.setNight(false);f.update(0)
    if(f.fish[0].parts[0].material.color.getHexString()!=='073b49')throw Error('Day fish palette did not restore')
  })
  if(errors.length)throw Error(errors.join('\n'))
  console.log(JSON.stringify({checks,reducedMotion:true,errors,output},null,2))
} finally {await browser.close()}
