import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output=await mkdtemp(join(tmpdir(),'parange-moonlight-'))
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}})
  const errors=[];page.on('pageerror',e=>errors.push(String(e)))
  page.on('console',m=>{if(m.type()==='error'&&/THREE.WebGLProgram|Shader Error/.test(m.text()))errors.push(m.text())})
  await page.goto(process.env.REVIEW_URL || 'https://localhost:5173')
  await page.evaluate(async()=>{
    const {createParangePlanetExperience}=await import('/src/parange-planet.ts')
    window.nightApp=createParangePlanetExperience();window.nightApp.open()
    window.T=await import('/node_modules/.vite/deps/three.js')
    const scene=window.nightApp.world.world.parent
    window.dayState=scene.children.filter(c=>c.isLight).map(c=>({name:c.name,color:c.color.getHex(),intensity:c.intensity,position:c.position.toArray(),ground:c.groundColor?.getHex()}))
    window.uiDayState=['.planet-join-primary','.planet-resident-card','.planet-guide','.planet-day-toggle'].map(selector=>{
      const style=getComputedStyle(document.querySelector(selector));return {selector,color:style.color,background:style.backgroundImage}
    })
  })
  await page.waitForTimeout(900)
  await page.screenshot({path:join(output,'day.png')})
  await page.locator('.planet-day-toggle').click();await page.waitForTimeout(900)
  const night=await page.evaluate(()=>{
    const w=window.nightApp.world,scene=w.world.parent,sky=scene.getObjectByName('moonlit-night-sky')
    if(!sky?.visible||sky.material.transparent||sky.material.depthWrite)throw Error('Night sky depth/lifecycle is incorrect')
    if(sky.parent===w.world)throw Error('Sky must not rotate with the globe')
    if(getComputedStyle(document.querySelector('.planet-sky-game.is-night .planet-sky')).filter!=='none')throw Error('Night still relies on CSS dimming')
    const key=scene.getObjectByName('planet-sun-moon-key'),hemi=scene.getObjectByName('planet-hemisphere')
    if(key.position.x<0||key.color.b<=key.color.r||hemi.groundColor.b<=hemi.groundColor.g)throw Error('Moonlight direction/colour has not changed')
    let windows=0,pools=0,lights=0
    w.world.traverse(o=>{
      if(o.material?.userData.nightEmitter&&o.material.emissiveIntensity>0)windows++
      if(o.name==='warm-doorway-pool'&&o.visible)pools++
      if(o.name==='porch-night-light'&&o.intensity>0)lights++
    })
    if(windows<10||pools!==5||lights!==2)throw Error(`Missing warm nighttime lights: ${windows}/${pools}/${lights}`)
    const water=w.world.getObjectByName('garden-pond-water').material
    const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>\n#include <emissivemap_fragment>\n#include <clipping_planes_fragment>'}
    water.onBeforeCompile(shader,{})
    if(shader.uniforms.uConsoleNight.value!==1||!shader.uniforms.uSinkCos)throw Error('Night water/sinkhole shaders do not compose')
    if(water.specularIntensity!==0||water.clearcoat!==0||water.envMapIntensity!==0)throw Error('Night water brought back specular flare')
    if(!shader.fragmentShader.includes('totalEmissiveRadiance+=uConsoleNight*coastalGlow'))throw Error('Coast glow does not follow the night-only shoreline field')
    if(shader.uniforms.uCoastGlowStrength?.value!==2.3)throw Error('Stronger night coast glow has regressed')
    const starGarden=w.world.getObjectByName('moonlit-star-garden')
    if(!starGarden.visible||starGarden.children.length<18)throw Error('Night star garden is missing')
    for(const root of starGarden.children){
      const n=new window.T.Vector3(...root.userData.groundNormal),star=root.getObjectByName('night-star-lantern')
      if(w.environment.surface(n).bank<.09||n.distanceTo(w.environment.clearing)<.55)throw Error('Stars obstruct the water/meeting court')
      if(star.geometry.type!=='ExtrudeGeometry'||star.material.emissiveIntensity<.8||Math.abs(star.rotation.x+Math.PI/2)>.1)throw Error('Star must be solid, luminous and face outward')
    }
    for(const saved of window.uiDayState){
      const style=getComputedStyle(document.querySelector(saved.selector))
      if(style.color===saved.color&&style.backgroundImage===saved.background)throw Error(`Night UI colours did not change: ${saved.selector}`)
    }
    const buttonGradient=getComputedStyle(document.querySelector('.planet-join-primary')).backgroundImage
    const firstColour=buttonGradient.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)?.slice(1).map(Number)
    if(!firstColour||firstColour[0]>90||firstColour[1]>140||firstColour[2]<firstColour[0]*1.5)throw Error('Night controls have reverted to washed-out pastel colours')
    const leaves=w.world.getObjectByName('biome-forest-leaves'),g=leaves.geometry
    for(const material of [leaves.material,w.environment.terrain.material]){
      const palette={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <clipping_planes_fragment>'}
      material.onBeforeCompile(palette,{})
      if(palette.uniforms.uMoonPalette?.value!==1||!palette.fragmentShader.includes('diffuseColor.b*.95+.085'))throw Error('Moonlit vegetation palette is missing')
    }
    if(g.userData.foliageStructure!=='closed-drooping-leaf'||g.attributes.position.count!==90||g.index.count!==528)throw Error('Leaves are no longer closed layered volumes')
    const matrix=new window.T.Matrix4(),rotation=new window.T.Quaternion(),position=new window.T.Vector3(),scale=new window.T.Vector3()
    for(let i=0;i<46;i++){
      leaves.getMatrixAt(i,matrix);matrix.decompose(position,rotation,scale)
      // Every leaf in a branch spray shares its tree's local-up; no random
      // spherical-normal rotations that cause the sticker appearance.
      const normal=new window.T.Vector3(0,1,0).applyQuaternion(rotation)
      if(i===0)window.leafUp=normal
      else if(normal.dot(window.leafUp)<.999)throw Error('Leaves are randomly pasted onto the crown again')
    }
    return {warmWindows:windows,doorwayPools:pools,localLights:lights,leaves:leaves.count,closedLeafTriangles:g.index.count/3,starLanterns:starGarden.children.length,nightUI:true,coastGlow:true}
  })
  await page.waitForFunction(()=>window.nightApp.world.world.parent.getObjectByName('moonlit-night-sky').material.uniforms.uMeteors.value>.15,null,{timeout:15000})
  await page.evaluate(()=>{
    const w=window.nightApp.world
    if(w.bubbles.visible||w.world.parent.getObjectByName('sky-bubble-bursts').visible)throw Error('Integrated night mode did not finish the bubble-to-meteor transition')
  })
  await page.screenshot({path:join(output,'night.png')})
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(600)
  await page.screenshot({path:join(output,'night-mobile.png')})
  await page.evaluate(()=>{window.nightApp.world.world.visible=false})
  await page.waitForTimeout(150)
  if(await page.evaluate(()=>window.nightApp.world.world.parent.getObjectByName('moonlit-night-sky').visible))throw Error('Night sky covers the resident reveal')
  await page.evaluate(()=>{window.nightApp.world.world.visible=true})
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.waitForTimeout(150)
  if(await page.evaluate(()=>window.nightApp.world.world.parent.getObjectByName('moonlit-night-sky').material.uniforms.uTime.value!==0))throw Error('Reduced motion does not freeze the sky')
  await page.locator('.planet-day-toggle').click();await page.waitForTimeout(200)
  await page.waitForTimeout(200)
  await page.evaluate(()=>{
    const scene=window.nightApp.world.world.parent
    if(scene.getObjectByName('moonlit-night-sky').visible)throw Error('Sky remains in day mode')
    if(scene.getObjectByName('moonlit-star-garden').visible)throw Error('Star lanterns remain visible during day')
    for(const saved of window.uiDayState){
      const style=getComputedStyle(document.querySelector(saved.selector))
      if(style.color!==saved.color||style.backgroundImage!==saved.background)throw Error('Day UI palette did not restore')
    }
    for(const saved of window.dayState){
      const light=scene.children.find(c=>c.isLight&&c.name===saved.name)
      if(light.color.getHex()!==saved.color||light.intensity!==saved.intensity||light.position.toArray().some((n,i)=>n!==saved.position[i])||light.groundColor?.getHex()!==saved.ground)throw Error('Day lighting did not restore')
    }
    scene.traverse(o=>{if(o.name==='warm-doorway-pool'&&o.visible||o.name==='porch-night-light'&&o.intensity>0||o.material?.userData.nightEmitter)throw Error('Night-only lighting persists during day')})
    const shader={uniforms:{},vertexShader:'#include <begin_vertex>',fragmentShader:'#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <clipping_planes_fragment>'}
    window.nightApp.world.environment.terrain.material.onBeforeCompile(shader,{})
    if(shader.uniforms.uMoonPalette.value!==0)throw Error('Day vegetation colours did not restore')
  })
  // Closeups use the actual authored scene/materials under the night lighting.
  await page.setViewportSize({width:1100,height:850})
  await page.evaluate(()=>{
    const w=window.nightApp.world,T=window.T;w.close();w.setNight(true);w.world.rotation.set(0,0,0)
    const scene=w.world.parent.clone(true);scene.background=new T.Color('#121f43')
    scene.getObjectByName('moonlit-night-sky').visible=false;scene.getObjectByName('island-sky-bubbles').visible=false
    const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight)
    renderer.toneMapping=T.NeutralToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap
    Object.assign(renderer.domElement.style,{position:'fixed',inset:0,zIndex:9999999});document.body.append(renderer.domElement)
    window.nightDetail={scene,renderer,camera:new T.PerspectiveCamera(38,innerWidth/innerHeight,.05,30)}
  })
  for(const id of ['home','forest']){
    await page.evaluate(id=>{
      const {scene,renderer,camera}=window.nightDetail,T=window.T,g=scene.getObjectByName(id==='forest'?'woodland-root-arch':`garden-landmark-${id}`)
      scene.updateMatrixWorld(true)
      const center=g.getWorldPosition(new T.Vector3()),up=new T.Vector3(0,1,0).applyQuaternion(g.quaternion),front=new T.Vector3(0,0,1).applyQuaternion(g.quaternion),right=new T.Vector3(1,0,0).applyQuaternion(g.quaternion)
      camera.position.copy(center).addScaledVector(up,1.55).addScaledVector(front,1.95).addScaledVector(right,1.05)
      camera.up.copy(up);camera.lookAt(center.clone().addScaledVector(up,.50));renderer.render(scene,camera)
    },id)
    await page.screenshot({path:join(output,`night-${id}.png`)})
  }
  if(errors.length)throw Error(errors.join('\n'))
  console.log(JSON.stringify({night,dayRestored:true,reducedMotion:true,errors,output},null,2))
} finally {await browser.close()}
