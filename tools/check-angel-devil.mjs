// Synthetic camera/tracker: rendering and wink integration, not model accuracy.
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output = await mkdtemp(join(tmpdir(), 'parange-wink-rig-'))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } })
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
        artwork() { return {angel: angel.src, devil: devil.src}; },
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
    window.__duelSprites = []; window.__blink = [0,0]
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
  let clock = 10000
  for (const [width, height] of [[1280, 800], [390, 844], [320, 640], [844, 390]]) {
    await page.setViewportSize({ width, height })
    await page.evaluate(now => { __duelReview.toggleDuelMode(now); __duelReview.settle(now); __duelReview.anchorTop() }, clock)
    const rest = await page.evaluate(now => { __duelReview.render(now); return __duelReview.pixels() }, clock + 500)
    const sceneRest = await page.evaluate(() => __duelReview.scenePixels())
    const later = await page.evaluate(now => { __duelReview.render(now); return __duelReview.pixels() }, clock + 5000)
    assert.equal(later, rest, 'No wink: characters AND cloud must be pixel-identical over time')
    for (const [index, side] of ['angel', 'devil'].entries()) {
      const start = clock + 6000 + index * 4000
      await page.evaluate(({side, now}) => { __duelReview.releaseWink(); __duelReview.triggerFight(side, now) }, { side, now: start })
      const opponent = side === 'angel' ? 'devil' : 'angel'
      let still = null
      for (const offset of [0, 35, 95, 190, 300]) {
        const frame = await page.evaluate(now => __duelReview.render(now), start + offset)
        assert.equal(frame.sprites.length, 2)
        const inactive = frame.sprites.find(sprite => sprite.side === opponent)
        if (!still) still = inactive
        assert.deepEqual(inactive, still, 'Non-winking character must remain stationary')
        if (offset === 95) {
          const active = frame.sprites.find(sprite => sprite.side === side)
          assert.ok(active.pose.punch > .9, 'Articulated punch reaches full extension')
          assert.equal(frame.lastImpactSide, side)
          assert.equal(frame.vitals[opponent].hp, 92, 'Contact reduces the receiving fighter’s displayed HP')
        }
        if ([35,95].includes(offset)) await page.screenshot({ path: join(output, `${width}-${side}-${offset}.png`) })
      }
      const recovered = await page.evaluate(now => { __duelReview.render(now); return __duelReview.scenePixels() }, start + 1600)
      assert.equal(recovered, sceneRest, 'After one attack, characters and cloud return to rest; the HUD retains damage')
    }
    await page.evaluate(now => { __duelReview.toggleDuelMode(now); __duelReview.settle(now) }, clock + 14000)
    clock += 20000
  }
  // Real updateTracking route with controlled blendshape values.
  await page.evaluate(now => { __duelReview.toggleDuelMode(now); __duelReview.settle(now) }, clock)
  const blinkResult = await page.evaluate(now => {
    for (const [left,right] of [[0,0],[.95,.72],[.9,.9]]) { __duelReview.observe(left,right,now); __duelReview.render(now); now+=100 }
    return __duelReview.render(now)
  }, clock + 500)
  assert.equal(blinkResult.lastImpactSide, null, 'Normal two-eye blinking must not attack')
  await page.evaluate(now => { for (let i=0;i<5;i++) __duelReview.observe(0,0,now+i*66) }, clock+1000)
  const held = await page.evaluate(now => {
    const hits=[]; let previous=0
    for (let t=0;t<2400;t+=66) {
      __duelReview.observe(0,.9,now+t)
      const state=__duelReview.render(now+t)
      if(state.lastImpactAt!==previous){hits.push(state.lastImpactSide);previous=state.lastImpactAt}
    }
    return hits
  }, clock+1500)
  assert.ok(held.length >= 9 && held.every(side => side === 'devil'), 'Holding one eye chains only that fighter’s attacks')
  const stopped = await page.evaluate(now => { __duelReview.observe(0,0,now); __duelReview.render(now); const frame=__duelReview.render(now+500); return frame.sprites.map(s=>s.pose) }, clock+4000)
  assert.ok(stopped.every(p => p.punch===0 && p.kick===0 && p.windup===0), 'Opening eyes stops continuous attacks')
  const rapid = await page.evaluate(now => {
    const hits = []
    for (const offset of [0, 150]) {
      __duelReview.observe(0, 0, now + offset)
      __duelReview.observe(.9, 0, now + offset + 33)
      const hit = __duelReview.render(now + offset + 128)
      hits.push({ side: hit.lastImpactSide, at: hit.lastImpactAt })
    }
    return hits
  }, clock + 4500)
  assert.ok(rapid.every(hit => hit.side === 'angel'))
  assert.ok(Math.abs(rapid[1].at - rapid[0].at - 150) < 1, 'Reopened eyes immediately rearm a rapid second wink')
  const specialtyMetrics=[]
  for(const [width,height] of [[1280,800],[390,844],[844,390]]) {
    await page.setViewportSize({width,height})
    for(const side of ['angel','devil']) {
      await page.evaluate(({side,now})=>{__duelReview.releaseWink();__duelReview.special(side,now);__duelReview.render(now+180)}, {side,now:clock+7000})
      await page.screenshot({path:join(output,`${width}-${side}-special.png`)})
      const ms=await page.evaluate(now=>{const start=performance.now();for(let i=0;i<20;i++)__duelReview.render(now+i*16);return (performance.now()-start)/20},clock+7200)
      specialtyMetrics.push({width,side,renderMs:ms})
    }
  }
  // Win by actual unilateral attacks, without using the held-wink special effect.
  await page.setViewportSize({width:390,height:844})
  const victoryReview = await page.evaluate(now => {
    __duelReview.toggleDuelMode(now); __duelReview.toggleDuelMode(now + 1); __duelReview.settle(now + 1); __duelReview.anchorTop()
    let winAt = 0, hitCount = 0, result
    for (let i = 0; i < 40; i++) {
      const at = now + 500 + i * 400
      __duelReview.releaseWink(); __duelReview.triggerFight('devil', at)
      result = __duelReview.render(at + 95); hitCount++
      if (result.vitals.winner) {winAt = at + 95; break}
    }
    if (!winAt) throw new Error('Devil never reached a knockout')
    const alive = __duelReview.render(winAt + 300)
    return {winAt, hitCount, winner:result.vitals.winner, hp:result.vitals.angel.hp, active:alive.devilVictoryActive}
  },clock + 15000)
  assert.equal(victoryReview.winner, 'devil'); assert.equal(victoryReview.hp, 0)
  assert.ok(victoryReview.active, 'A knockout starts the devil celebration even without a long wink')
  await page.screenshot({path:join(output,'390-devil-victory.png')})
  const afterVictory = await page.evaluate(now => {
    const tail = __duelReview.render(now + 1700)
    const next = __duelReview.render(now + 1900)
    return {expired:!tail.devilVictoryActive, noRestart:!next.devilVictoryActive, round:next.vitals.round, hp:next.vitals.angel.hp}
  },victoryReview.winAt)
  assert.ok(afterVictory.expired && afterVictory.noRestart, 'Victory plays once and expires before the next round')
  assert.equal(afterVictory.round, 2); assert.equal(afterVictory.hp, 100)
  const victoryLifecycle = await page.evaluate(async () => {
    const {createDevilVictoryEffect} = await import('/src/angel-devil-celebration.ts')
    const canvas = document.createElement('canvas'); canvas.width = 390; canvas.height = 844
    const c = canvas.getContext('2d'), effect = createDevilVictoryEffect()
    const visible = () => c.getImageData(0,0,390,844).data.some((v,i) => i%4===3 && v>0)
    effect.start(1000,{x:.5,y:.25}); effect.draw(c,1300,390,844,true)
    const reducedEmpty = !visible()
    effect.draw(c,1300,390,844,false)
    const visibleBurst = visible()
    const headerClear = c.getImageData(0,0,390,68).data.every(v => v === 0)
    effect.reset(); c.clearRect(0,0,390,844); effect.draw(c,1300,390,844,false)
    return {reducedEmpty,visibleBurst,headerClear,resetEmpty:!visible() && !effect.active(1300)}
  })
  assert.ok(Object.values(victoryLifecycle).every(Boolean), 'Victory respects reduced motion, clears on reset and leaves the HUD untouched')
  await page.locator('.angel-devil-close').click()
  await page.waitForFunction(() => document.querySelector('.angel-devil-screen').getAttribute('aria-hidden') === 'true')
  assert.ok(await page.evaluate(() => __duelStream.getTracks().every(track => track.readyState === 'ended')))

  // Large contact sheet makes independent arm/leg articulation reviewable.
  await page.setViewportSize({width:1280,height:820})
  const rigReview = await page.evaluate(async () => {
    const {createFighterRigRenderer}=await import('/src/angel-devil-rig.ts')
    const {createDuelChoreography,restingFighterPose}=await import('/src/angel-devil-motion.ts')
    const {drawFighterWeapon,drawFighterGrip,drawWeaponSwing}=await import('/src/angel-devil-weapons.ts')
    const rig=createFighterRigRenderer(), sheet=document.createElement('canvas'); sheet.width=1250;sheet.height=700;sheet.id='rig-review'
    Object.assign(sheet.style,{position:'fixed',inset:'0',zIndex:99999,width:'1250px',height:'700px'});document.body.append(sheet)
    const c=sheet.getContext('2d');c.fillStyle='#b8bdca';c.fillRect(0,0,1250,700)
    const labels=['REST','WINDUP','PUNCH','RECOVERY','KICK']; let renderMs=0
    for(const [row,side] of ['angel','devil'].entries()){
      const image=new Image();image.src=__duelReview.artwork()[side];await image.decode()
      const motion=createDuelChoreography();motion.reset(0);motion.requestAttack(side,0)
      const poses=[restingFighterPose(),motion.sample(35)[side],motion.sample(95)[side],motion.sample(190)[side]]
      motion.sample(600);motion.releaseWink();motion.requestAttack(side,1000);motion.sample(1600);motion.releaseWink();motion.requestAttack(side,2000);poses.push(motion.sample(2095)[side])
      for(let col=0;col<5;col++){
        const before=performance.now();const skin=rig.draw(image,side,poses[col]);renderMs+=performance.now()-before
        c.save();c.translate(col*250+125,row*350+216);
        const paintBody=()=>c.drawImage(skin,-125,-186,250,300);
        drawWeaponSwing(c,side,poses[col],250/1.5,300/1.5,1);paintBody();
        drawFighterWeapon(c,side,poses[col],250/1.5,300/1.5,1);
        drawFighterGrip(c,side,poses[col],250/1.5,300/1.5,paintBody);c.restore();
        c.fillStyle='#25303a';c.font='14px sans-serif';c.fillText(side+' / '+labels[col],col*250+20,row*350+25)
      }
    }
    // Reusing a pose must avoid uploads; mutating it or switching fighters must
    // redraw the shared surface. Check actual pixels as well as native GPU calls.
    const glProto=WebGLRenderingContext.prototype,upload=glProto.bufferSubData
    let uploads=0
    glProto.bufferSubData=function(...args){uploads++;return upload.apply(this,args)}
    const cacheChecks={}
    try {
      const angel=new Image(),devil=new Image()
      const artwork=__duelReview.artwork();angel.src=artwork.angel;devil.src=artwork.devil
      await Promise.all([angel.decode(),devil.decode()])
      const pose={...restingFighterPose(),punch:.8,twist:.8}
      const first=rig.draw(angel,'angel',pose).toDataURL(),before=uploads
      cacheChecks.identical=rig.draw(angel,'angel',pose).toDataURL()===first
      cacheChecks.noDuplicateUpload=uploads===before
      pose.punch=.4;pose.twist=.4
      const moved=rig.draw(angel,'angel',pose).toDataURL()
      cacheChecks.poseInvalidates=moved!==first
      rig.draw(devil,'devil',pose)
      cacheChecks.sideInvalidates=rig.draw(angel,'angel',pose).toDataURL()===moved
    } finally {glProto.bufferSubData=upload;rig.dispose()}
    return {renderMs,cacheChecks}
  })
  assert.ok(Object.values(rigReview.cacheChecks).every(Boolean),'Rig cache preserves pixels and invalidates for changing poses/fighters')
  await page.locator('#rig-review').screenshot({path:join(output,'articulated-poses.png')})
  const effectReview = await page.evaluate(async () => {
    const {drawDuelImpact,createDuelEffects,DUEL_EFFECT_DURATION}=await import('/src/angel-devil-effects.ts')
    document.querySelector('#rig-review').remove()
    const sheet=document.createElement('canvas');sheet.width=1250;sheet.height=500;sheet.id='effects-review'
    Object.assign(sheet.style,{position:'fixed',inset:'0',zIndex:99999,width:'1250px',height:'500px'});document.body.append(sheet)
    const c=sheet.getContext('2d');c.fillStyle='#28303f';c.fillRect(0,0,1250,500)
    for(const [row,side] of ['angel','devil'].entries())for(const [col,age] of [20,80,160,280,430].entries()){
      c.save();c.translate(col*250+125,row*250+135);drawDuelImpact(c,side,age,165,2);c.restore()
      c.fillStyle='#e1e7ef';c.font='14px sans-serif';c.fillText(side+' / '+age+'ms',col*250+18,row*250+25)
    }
    const probe=document.createElement('canvas');probe.width=probe.height=300
    const p=probe.getContext('2d'),effects=createDuelEffects()
    const pixels=()=>probe.toDataURL(),visible=()=>p.getImageData(0,0,300,300).data.some((v,i)=>i%4===3&&v>0)
    effects.emit('angel',0,150,150,150);effects.draw(p,280)
    const tailVisible=visible()
    effects.emit('devil',240,150,150,150);p.clearRect(0,0,300,300);effects.draw(p,280);const overlap=pixels()
    effects.reset();p.clearRect(0,0,300,300);effects.emit('devil',240,150,150,150);effects.draw(p,280)
    const overlapPreserved=overlap!==pixels()
    effects.reset();p.clearRect(0,0,300,300);effects.draw(p,280);const resetEmpty=!visible()
    effects.emit('angel',1000,150,150,150);effects.draw(p,1000+DUEL_EFFECT_DURATION);const expiredEmpty=!visible()
    return{tailVisible,overlapPreserved,resetEmpty,expiredEmpty}
  })
  assert.ok(Object.values(effectReview).every(Boolean), 'Particle tails overlap across hits, reset cleanly and expire completely')
  await page.locator('#effects-review').screenshot({path:join(output,'impact-particle-timeline.png')})
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ passed: true, camera: 'synthetic', tracking: 'controlled blendshapes', screenshots: output, rigReview, effectReview, specialtyMetrics, victoryReview, afterVictory, victoryLifecycle }))
} finally { await browser.close() }
