// Synthetic camera/tracker: rendering and wink integration, not model accuracy.
// Exact PNG comparisons and native call counts are the regression checks.
// Timings include forced readbacks and CPU profiling; they are not live-device
// FPS or thermal measurements (repeated reads can change browser raster backends).
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output = await mkdtemp(join(tmpdir(), 'parange-duel-perf-'))
const captureOnly = process.env.DUEL_PERF_CAPTURE_ONLY === '1'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 })
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.route('**/@mediapipe_tasks-vision.js*', route => route.fulfill({ contentType: 'text/javascript', body: `
    export const FilesetResolver = {forVisionTasks: async () => ({})};
    class Tracker { static async createFromOptions() {return new Tracker()}
      detectForVideo() {
        const points=Array.from({length:478},()=>({x:.5,y:.4,z:0}));
        points[33]={x:.35,y:.4}; points[263]={x:.65,y:.4};
        return {faceLandmarks:[points], faceBlendshapes:[{categories:[{categoryName:'eyeBlinkLeft',score:window.__blink[0]},{categoryName:'eyeBlinkRight',score:window.__blink[1]}]}],landmarks:[],handedness:[]};
      } close() {} }
    export {Tracker as FaceLandmarker, Tracker as HandLandmarker};` }))
  await page.route('**/src/angel-devil.ts*', async route => {
    const response = await route.fetch(), body = await response.text()
    assert.ok(body.includes('const run = (now) => {'))
    const instrumented = body.replace(/const drawSprite = \(([^)]*)\) => \{/, `$&
      window.__duelSprites.push({src: image.src, x, y: y + bob, size, angle, scaleX, scaleY, pose, side});`)
      .replace('const run = (now) => {', `window.__duelReview = {
        prepareCase(kind, now) {
          cancelAnimationFrame(frame); frame=0;
          if(duelMode)toggleDuelMode(now); toggleDuelMode(now);
          duelBlend=1;drawScene(now);
          facePose={x:screen.clientWidth/2,y:screen.clientHeight*.34,scale:.86,angle:0};
          window.__duelSprites=[];
          const random=Math.random;let seed=3137;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
          if(kind==='feathers'||kind==='embers'){prepareLongWinkEffect(kind==='feathers'?'angel':'devil',now);lastLongWinkAt=now;}
          Math.random=random;
          if(kind==='victory')devilVictory.start(now,{x:.57,y:.28});
          if(kind.startsWith('angel')||kind.startsWith('devil')){
            const side=kind.startsWith('angel')?'angel':'devil';
            if(kind.endsWith('kick'))for(let i=0;i<2;i++){choreography.releaseWink();triggerFight(side,now-800+i*400);choreography.sample(now-500+i*400);}
            choreography.releaseWink();triggerFight(side,now);
          }
        },
        capture(){return canvas.toDataURL()},
        flush(){context.getImageData(0,0,1,1)},
        toggleDuelMode, triggerFight, special(side,now) {prepareLongWinkEffect(side,now);lastLongWinkAt=now;}, releaseWink: choreography.releaseWink,
        observe(left, right, now) {window.__blink=[left,right]; lastVideoTime=-1; lastInferenceAt=0; poseFrozenUntil=0; updateTracking(now);},
        settle(now) { cancelAnimationFrame(frame); frame = 0; for (let i = 0; i < 60; i++) drawScene(now); },
        render(now) { window.__duelSprites = []; drawScene(now); return {sprites: window.__duelSprites, lastImpactAt, lastImpactSide, devilVictoryActive: devilVictory.active(now), vitals: JSON.parse(JSON.stringify(vitals.snapshot()))}; },
        pixels() {return canvas.toDataURL();},
        scenePixels() {const c=document.createElement('canvas');c.width=canvas.width;const scale=canvas.width/screen.clientWidth;c.height=canvas.height-74*scale;c.getContext('2d').drawImage(canvas,0,-74*scale);return c.toDataURL();},
        anchorTop() { facePose = {x: screen.clientWidth / 2, y: 0, scale: .86, angle: 0}; }
      }; const run = (now) => {`)
    await route.fulfill({ response, body: instrumented })
  })
  await page.addInitScript(() => {
    window.__duelSprites = []; window.__blink = [0,0]; window.__canvasCounts=null;
    for(const name of ['beginPath','lineTo','quadraticCurveTo','bezierCurveTo','createLinearGradient','createRadialGradient','fill','stroke','drawImage','fillRect']){
      const original=CanvasRenderingContext2D.prototype[name];
      CanvasRenderingContext2D.prototype[name]=function(...args){if(window.__canvasCounts)window.__canvasCounts[name]=(window.__canvasCounts[name]||0)+1;return original.apply(this,args)};
    }
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720
      const context = canvas.getContext('2d'); context.fillStyle = '#b8bdca'; context.fillRect(0, 0, 1280, 720)
      const stream = canvas.captureStream(30); window.__duelStream = stream; return stream
    }
  })
  await page.goto(process.env.REVIEW_URL || 'https://localhost:5173')
  const die = page.locator('.dice[data-route="#angel-devil"]')
  assert.equal(await die.locator('.dice-front').innerText(), 'N')
  await die.click()
  await page.locator('.angel-devil-screen.is-tracking').waitFor()
  await page.waitForFunction(() => !document.querySelector('.angel-devil-screen').classList.contains('is-camera-pending'))
  await page.waitForTimeout(600)
  const results=[]
  const client=await page.context().newCDPSession(page)
  await client.send('Profiler.enable');await client.send('Profiler.setSamplingInterval',{interval:1000});await client.send('Profiler.start')
  for(const [width,height] of [[1280,800],[390,844],[371,701],[844,390]]){
    await page.setViewportSize({width,height})
    for(const [kind,age] of [['rest',500],['angel-windup',35],['angel-punch',95],['devil-punch',95],['devil-kick',95],['feathers',180],['embers',180],['victory',300]]){
      const label=`${width}-${kind}`
      const png=await page.evaluate(({kind,age})=>{__duelReview.prepareCase(kind,10000);__duelReview.render(10000+age);return __duelReview.capture()}, {kind,age})
      await writeFile(join(output,label+'.png'),Buffer.from(png.split(',')[1],'base64'))
      const measurement=captureOnly ? {msPerFrame: null, counts: {}} : await page.evaluate(({kind})=>{
        const samples=[];let counts
        for(let repeat=0;repeat<3;repeat++){
          __duelReview.prepareCase(kind,20000);window.__canvasCounts={};
          const start=performance.now()
          for(let i=0;i<18;i++){
            __duelReview.render(20000+i*8)
            if(i%6===5)__duelReview.flush()
          }
          samples.push((performance.now()-start)/18);counts=window.__canvasCounts;window.__canvasCounts=null
        }
        samples.sort((a,b)=>a-b)
        return {msPerFrame:samples[1],counts}
      },{kind})
      results.push({label,...measurement})
    }
  }
  const {profile}=await client.send('Profiler.stop')
  const names=new Map(profile.nodes.map(n=>[n.id,`${n.callFrame.functionName||'(anonymous)'} ${n.callFrame.url.split('/').pop()}`])),hot={}
  for(const id of profile.samples||[]) {const name=names.get(id);hot[name]=(hot[name]||0)+1}
  const hotFunctions=Object.entries(hot).sort((a,b)=>b[1]-a[1]).slice(0,18)
  const comparisons=[]
  if(process.env.DUEL_PERF_BASELINE){
    const baseline=JSON.parse(await readFile(process.env.DUEL_PERF_BASELINE,'utf8'))
    // Forced readbacks can switch Canvas raster backends. Match measurement
    // mode as well as inputs so backend differences are not mistaken for edits.
    assert.equal(Boolean(baseline.captureOnly),captureOnly,'Baseline must use the same capture/measurement mode')
    for(const result of results){
      const before=baseline.results.find(r=>r.label===result.label)
      const unchanged=(await readFile(join(output,result.label+'.png'))).equals(await readFile(join(dirname(process.env.DUEL_PERF_BASELINE),result.label+'.png')))
      comparisons.push({label:result.label,identical:unchanged,beforeMs:before.msPerFrame,afterMs:result.msPerFrame})
    }
  }
  assert.deepEqual(errors,[])
  const report={output,captureOnly,results,hotFunctions,comparisons}
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report))
  assert.ok(comparisons.every(r=>r.identical),'Rendered pixels changed; inspect the before/after captures')
} finally { await browser.close() }
