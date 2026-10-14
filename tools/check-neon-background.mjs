import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const output=await mkdtemp(join(tmpdir(),'parange-neon-background-'))
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:900},deviceScaleFactor:2})
  const errors=[],requests=[];page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>requests.push(r.url()))
  await page.goto(process.env.REVIEW_URL||'https://localhost:5173');await page.waitForLoadState('networkidle')
  const articulated=await page.evaluate(async()=>{
    const {createNeonBackground,drawSkyFish,skyFishDesigns}=await import('/src/neon-background.ts')
    const {drawSkyBird,fishBend,wingAngle,loadSkyArtwork,drawPearlWing}=await import('/src/neon-sky-art.ts')
    const {skyLayout}=await import('/src/neon-sky-layout.ts')
    const {pearlWingLayout}=await import('/src/neon-backdrop.ts')
    for(const [w,h] of [[1280,900],[390,844],[844,390]]){
      const pair=pearlWingLayout(w,h)
      if(Math.abs(pair.left+pair.right-w)>1e-8||pair.width>w*.357||pair.width>h*.495)throw Error('Planet wings must remain a bounded centred pair')
    }
    await loadSkyArtwork()
    const canvas=document.createElement('canvas');canvas.id='background-review'
    Object.assign(canvas.style,{position:'fixed',inset:0,width:'100vw',height:'100vh',zIndex:999999});document.body.append(canvas)
    const bg=createNeonBackground();if(!await bg.ready)throw Error('Artwork loading failed')
    window.reviewBackground=(time=0)=>{
      const d=Math.min(devicePixelRatio,2,Math.sqrt(4e6/(innerWidth*innerHeight)))
      canvas.width=Math.floor(innerWidth*d);canvas.height=Math.floor(innerHeight*d)
      const c=canvas.getContext('2d',{willReadFrequently:true});c.scale(d,d);bg.resize(innerWidth,innerHeight)
      bg.render(c,time);const first=canvas.toDataURL(),before=c.getImageData(0,0,canvas.width,canvas.height).data;bg.render(c,time+900);const moved=canvas.toDataURL()!==first;bg.render(c,time)
      const deterministic=canvas.toDataURL()===first
      const after=c.getImageData(0,0,canvas.width,canvas.height).data;let maxDiff=0,diffCount=0;const samples=[]
      for(let i=0;i<before.length;i++)if(before[i]!==after[i]){maxDiff=Math.max(maxDiff,Math.abs(before[i]-after[i]));diffCount++;if(samples.length<10)samples.push([Math.floor(i/4)%canvas.width,Math.floor(i/4/canvas.width),before[i],after[i]])}
      const start=performance.now();for(let i=0;i<40;i++)bg.render(c,time+i*16);const meanMs=(performance.now()-start)/40;bg.render(c,time)
      const pixels=c.getImageData(0,0,canvas.width,canvas.height).data;let opaque=true
      for(let i=3;i<pixels.length;i+=4)if(pixels[i]!==255){opaque=false;break}
      return {moved,deterministic,opaque,meanMs,backingPixels:canvas.width*canvas.height,maxDiff,diffCount,samples}
    }
    const tile=document.createElement('canvas');tile.width=400;tile.height=400
    const c=tile.getContext('2d');c.translate(200,200);c.scale(2,2)
    const frame=(paint,t)=>{c.clearRect(-100,-100,200,200);paint(t);return tile.toDataURL()}
    const fishHashes=skyFishDesigns.map((_,i)=>frame(t=>drawSkyFish(c,i,t),0))
    const wide=skyLayout(1280,900),tall=skyLayout(390,844)
    if(wide.fish.some((f,i)=>Math.abs(f[3]-[1.6,1.85,1.3,2][i]*.55)>1e-8)||tall.fish.some((f,i)=>Math.abs(f[3]-[1.35,1.6,1.05,1.65][i]*.55)>1e-8))throw Error('All fish must use 55% of their original size (27% smaller than the previous version)')
    const sizes=wide.fish.map(f=>154*f[3]),motifs=wide.motifs.map(m=>m[3])
    return {uniqueFish:new Set(fishHashes).size,fishArticulates:frame(t=>drawSkyFish(c,0,t),0)!==frame(t=>drawSkyFish(c,0,t),450),birdArticulates:frame(t=>drawSkyBird(c,t,0),0)!==frame(t=>drawSkyBird(c,t,0),190),noseStable:fishBend(1,720,0)===0,wingChanges:wingAngle(0,0)!==wingAngle(190,0),pearlWingLoaded:drawPearlWing(c,100),scaleHierarchy:Math.max(...sizes)<180&&Math.min(...sizes)>100&&Math.max(...motifs)>Math.min(...motifs)*3,portraitRecomposed:!wide.portrait&&tall.portrait&&wide.fish[1][1]!==tall.fish[1][1],bubbleClusters:wide.bubbles.length>=4&&tall.bubbles.length>=4}
  })
  assert.equal(articulated.uniqueFish,4);for(const [key,value] of Object.entries(articulated))if(key!=='uniqueFish')assert.equal(value,true,key)
  const results=[]
  for(const [width,height] of [[1280,900],[390,844],[844,390]]){
    await page.setViewportSize({width,height});const result=await page.evaluate(()=>reviewBackground());results.push({width,height,...result})
    assert.ok(result.moved&&result.deterministic&&result.opaque,JSON.stringify(result));assert.ok(result.backingPixels<=4e6)
    await page.locator('#background-review').screenshot({path:join(output,`background-${width}.png`)})
  }
  await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>reviewBackground(16000))
  await page.locator('#background-review').screenshot({path:join(output,'background-later.png')})
  await page.locator('#background-review').evaluate(e=>e.remove())
  await page.evaluate(async()=>{
    const {createParangePlanetExperience}=await import('/src/parange-planet.ts'),{createResidentRig}=await import('/src/resident-model.ts'),T=await import('/node_modules/.vite/deps/three.js')
    window.app=createParangePlanetExperience();app.open()
    for(let i=0;i<8;i++)app.world.village.add({...createResidentRig(i),designIndex:i,name:'Friend '+i,portrait:'',trait:'',mapped:false},new T.Vector3((i%4-1.5)*.3,(Math.floor(i/4)-.5)*.3,1).normalize())
  })
  await page.locator('[data-mode=neon]').click();await page.waitForTimeout(600)
  await page.screenshot({path:join(output,'neon-desktop.png')})
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300)
  await page.screenshot({path:join(output,'neon-mobile.png')})
  assert.ok(!requests.some(url=>/neon-print-.*\.jpg/.test(url)),'Old print plates must not load')
  const failed=await browser.newPage({ignoreHTTPSErrors:true});await failed.route('**/neon-*.png',route=>route.abort())
  await failed.goto(process.env.REVIEW_URL||'https://localhost:5173');await failed.waitForLoadState('networkidle')
  const fallback=await failed.evaluate(async()=>{
    const {createNeonBackground}=await import('/src/neon-background.ts'),bg=createNeonBackground(),loaded=await bg.ready
    const tile=document.createElement('canvas');tile.width=320;tile.height=640;bg.resize(320,640);bg.render(tile.getContext('2d'),0)
    return {loaded,alpha:tile.getContext('2d').getImageData(20,20,1,1).data[3]}
  });assert.deepEqual(fallback,{loaded:false,alpha:255});await failed.close()
  assert.deepEqual(errors,[]);console.log(JSON.stringify({articulated,results,fallback,errors,output},null,2))
}finally{await browser.close()}
