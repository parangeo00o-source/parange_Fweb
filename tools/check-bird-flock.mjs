// Synthetic camera + landmarks exercise the complete G-die page without webcam access.
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output = await mkdtemp(join(tmpdir(), 'parange-flock-'))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 } })
  const errors = [], requests = []
  page.on('pageerror', error => errors.push(String(error)))
  page.on('request', request => requests.push(request.url()))
  await page.route('**/@mediapipe_tasks-vision.js*', route => route.fulfill({ contentType: 'text/javascript', body: `
    export const FilesetResolver={forVisionTasks:async()=>({})};
    export class HandLandmarker {
      static async createFromOptions(){return new HandLandmarker()}
      detectForVideo(video,now){(window.__modelCalls??=[]).push({type:'hand',at:now});return {landmarks:window.__hands || (window.__hand ? [window.__hand] : []), handedness:(window.__handLabels||['Left','Right']).map(categoryName=>[{categoryName}])}}close(){}
    }
    export class PoseLandmarker {
      static async createFromOptions(){window.__poseLive=(window.__poseLive||0)+1;return new PoseLandmarker()}
      detectForVideo(video,now){
        (window.__modelCalls??=[]).push({type:'pose',at:now});
        window.__poseCalls=(window.__poseCalls||0)+1;
        if(window.__poseOverride)return {landmarks:[window.__poseOverride]};
        const hands=window.__hands||(window.__hand?[window.__hand]:[]);
        const pose=Array.from({length:33},()=>({x:0,y:0,z:0,visibility:0}));
        hands.forEach((hand,i)=>{pose[15+i]={...hand[0],visibility:1};pose[13+i]={x:hand[0].x+.18,y:Math.min(.95,hand[0].y+.1),z:0,visibility:1}});
        return {landmarks:[pose]}
      }close(){window.__poseLive--}
    }
    export class FaceLandmarker {
      static async createFromOptions(){return new FaceLandmarker()}
      detectForVideo(video,now){
        (window.__modelCalls??=[]).push({type:'face',at:now});
        const span=.15*window.__faceScale,cy=.42,pitch=window.__facePitch;
        const face=Array.from({length:478},()=>({x:.5,y:cy,z:0}));
        face[33]={x:.5-span/2,y:cy};face[263]={x:.5+span/2,y:cy};
        face[1]={x:.5,y:cy+span*1280/720*pitch};face[10]={x:.5,y:cy-.12};
        return {faceLandmarks:[face]};
      }close(){}
    }` }))
  await page.route('**/src/bird-impact.ts*', async route => {
    const response = await route.fetch(), body = await response.text()
    assert.ok(body.includes('const render = (now) => {'))
    await route.fulfill({ response, body: body.replace('const render = (now) => {', `window.__flockReview={
      pause(){cancelAnimationFrame(animation);animation=0;},
      observe(scale,pitch,now){window.__faceScale=scale;window.__facePitch=pitch;lastVideoTime=-1;lastInferenceAt=-Infinity;inferFace(now);},
      reset(){flock.reset();dizzy.reset();graphic.reset();resetFinger();headSpan=.2;},
      hand(now){
        lastHandVideoTime=-1;lastHandInferenceAt=-Infinity;lastPoseVideoTime=-1;inferPose(now);
        const original=flock.gather;let anchors=[];
        flock.gather=(at,targets)=>{anchors=targets;return original(at,targets)};
        try{inferHand(now);return anchors}finally{flock.gather=original}
      },
      dizzyActive:dizzy.active,
      graphicActive:graphic.active,
      burst(now){triggerImpact({x:width*.5,y:height*.35},now);},
      render(now){drawScene(now);return flock.active(now);},
      pixels(){return canvas.toDataURL();},
      layerOrder(now){
        const order=[], originalFlock=flock.draw,originalGraphic=graphic.draw,originalDizzy=dizzy.draw;
        flock.draw=(...args)=>{order.push('birds');return originalFlock(...args)};
        graphic.draw=(...args)=>{order.push('graphic');return originalGraphic(...args)};
        dizzy.draw=(...args)=>{order.push('halo');return originalDizzy(...args)};
        try{drawScene(now);return order}finally{flock.draw=originalFlock;graphic.draw=originalGraphic;dizzy.draw=originalDizzy}
      },
      running(){return animation!==0;}
    };const render = (now) => {`) })
  })
  await page.addInitScript(() => {
    window.__faceScale = 1; window.__facePitch = .2; window.__streams = []
    navigator.mediaDevices.getUserMedia = async () => {
      if (window.__holdCamera) await new Promise(resolve => { window.__releaseCamera = resolve })
      const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720
      const c = canvas.getContext('2d'); c.fillStyle = '#89969e'; c.fillRect(0, 0, 1280, 720)
      c.fillStyle = '#64717b'; for(let x=0;x<1280;x+=160)c.fillRect(x,0,2,720)
      c.fillStyle = '#a5b0b5'; c.fillRect(0,500,1280,220)
      const stream = canvas.captureStream(30); window.__streams.push(stream); return stream
    }
  })
  await page.goto(process.env.REVIEW_URL || 'https://localhost:5173')
  const die = page.locator('.dice[data-route="#bird-impact"]')
  assert.equal(await die.locator('.dice-front').innerText(), 'G')
  await die.click()
  await page.locator('.bird-impact-screen.is-tracking').waitFor()
  await page.waitForTimeout(400)
  const inferenceBudget=await page.evaluate(()=>{
    const calls=window.__modelCalls||[]
    return calls.length>2&&new Set(calls.map(call=>call.at)).size===calls.length
  })
  assert.ok(inferenceBudget,'At most one model inference per animation frame')
  await page.evaluate(() => { __flockReview.pause(); __flockReview.reset() })
  const idle = await page.evaluate(() => { __flockReview.render(1000); return __flockReview.pixels() })
  await page.evaluate(() => { for(let t=1000;t<=2000;t+=50)__flockReview.observe(1,.2,t) })
  assert.equal(await page.evaluate(() => __flockReview.render(2000)), false)
  assert.notEqual(await page.evaluate(() => __flockReview.pixels()), idle)
  assert.equal(await page.evaluate(() => __flockReview.dizzyActive(2000)), true, 'Halo appears before any impact')
  await page.evaluate(() => __flockReview.observe(1.26,.2,2050))
  assert.equal(await page.evaluate(() => __flockReview.graphicActive(2050)), false, 'Head motion cannot trigger fireworks')
  await page.evaluate(() => __flockReview.burst(2050))
  assert.equal(await page.evaluate(() => __flockReview.render(2200)), false)
  assert.equal(await page.evaluate(() => __flockReview.dizzyActive(2200)), false)
  assert.equal(await page.evaluate(() => __flockReview.graphicActive(2200)), true)
  await page.locator('.bird-impact-canvas').screenshot({ path: join(output, 'desktop-graphic.png') })
  assert.equal(await page.evaluate(() => __flockReview.dizzyActive(2300)), false, 'Halo is hidden during the fireworks')
  assert.equal(await page.evaluate(() => __flockReview.render(2700)), false)
  assert.equal(await page.evaluate(() => __flockReview.dizzyActive(2700)), false, 'Halo stays hidden until the last firework expires')
  assert.notEqual(await page.evaluate(() => __flockReview.pixels()), idle)
  assert.deepEqual(await page.evaluate(() => __flockReview.layerOrder(2700)), ['birds','graphic','halo'], 'Birds must be composited behind the graphic')
  await page.locator('.bird-impact-canvas').screenshot({ path: join(output, 'desktop-flock.png') })
  assert.equal(await page.evaluate(() => __flockReview.render(3800)), false, 'Head impacts no longer release birds')
  assert.equal(await page.evaluate(() => __flockReview.graphicActive(3800)), false)
  assert.equal(await page.evaluate(() => __flockReview.dizzyActive(3800)), true, 'Halo resumes as soon as fireworks end')
  await page.evaluate(() => { for(let t=2100;t<=5900;t+=50)__flockReview.observe(1.26,.2,t) })
  assert.equal(await page.evaluate(() => __flockReview.render(5900)), false, 'Birds eventually leave while the halo continues')
  assert.equal(await page.evaluate(() => __flockReview.dizzyActive(5900)), true)
  assert.notEqual(await page.evaluate(() => __flockReview.pixels()), idle)
  await page.locator('.bird-impact-canvas').screenshot({ path: join(output, 'desktop-dizzy.png') })
  await page.evaluate(() => { for(let t=5950;t<=10000;t+=50)__flockReview.observe(1.26,.2,t) })
  assert.equal(await page.evaluate(() => __flockReview.render(10000)), false, 'Held head pose cannot spawn endless birds')
  assert.equal(await page.evaluate(() => __flockReview.dizzyActive(10000)), true)
  assert.notEqual(await page.evaluate(() => __flockReview.pixels()), idle, 'Halo remains visible after the impact effects expire')
  await page.evaluate(() => { __flockReview.observe(1,.2,10050); __flockReview.observe(1.26,.2,10100) })
  assert.equal(await page.evaluate(() => __flockReview.render(10600)), false)
  assert.equal(await page.evaluate(() => __flockReview.dizzyActive(10600)), true, 'Repeated head movement does not hide the halo')
  for (const [width,height] of [[390,844],[844,390]]) {
    await page.setViewportSize({ width,height })
    await page.evaluate(() => { __flockReview.reset(); __flockReview.render(10000); __flockReview.burst(10000); __flockReview.render(10700) })
    await page.locator('.bird-impact-canvas').screenshot({ path: join(output, `${width}-flock.png`) })
    assert.equal(await page.evaluate(() => __flockReview.render(13900)), false)
    assert.equal(await page.evaluate(() => __flockReview.dizzyActive(13900)), true)
    await page.locator('.bird-impact-canvas').screenshot({ path: join(output, `${width}-dizzy.png`) })
    assert.equal(await page.evaluate(() => __flockReview.render(17000)), false)
    assert.equal(await page.evaluate(() => __flockReview.dizzyActive(17000)), true)
  }
  // Index gesture calls birds independently of head impacts; a held pose is bounded.
  const fingerChecks = await page.evaluate(async () => {
    const {isBirdCallingFinger,isBirdVictoryHand}=await import('/src/bird-finger.ts')
    const hand=Array.from({length:21},()=>({x:.5,y:.65}))
    hand[0]={x:.5,y:.8}
    for(const base of [5,9,13,17]) {
      hand[base]={x:.42+(base-5)*.01,y:.6}
      hand[base+1]={x:hand[base].x,y:.5}
      hand[base+2]={x:hand[base].x,y:.6}
      hand[base+3]={x:hand[base].x,y:.67}
    }
    hand[7]={x:.42,y:.4};hand[8]={x:.42,y:.3}
    const index=isBirdCallingFinger(hand)
    const horizontalHand=hand.map(p=>({x:.5+(.8-p.y)*720/1280,y:.65+(p.x-.5)*1280/720}))
    const detectsHorizontal=isBirdCallingFinger(horizontalHand,1280/720)
    const palm=hand.map(p=>({...p}))
    for(const base of [9,13,17]) palm[base+3].y=.3
    const rejectsPalm=!isBirdCallingFinger(palm)
    const fist=hand.map(p=>({...p}));fist[8].y=.67
    const rejectsFist=!isBirdCallingFinger(fist)
    __flockReview.reset();window.__hand=hand
    __flockReview.hand(20000);const debounced=!__flockReview.render(20000)
    __flockReview.hand(20100);const called=__flockReview.render(20700)
    for(let t=20200;t<25000;t+=100)__flockReview.hand(t)
    const held=__flockReview.render(25000)
    const poseIdle=(window.__poseCalls||0)===0
    window.__hand=null;__flockReview.hand(25000)
    const toleratesDropout=__flockReview.render(25100)
    __flockReview.hand(25300);__flockReview.render(25800)
    const departs=!__flockReview.render(28300)
    window.__hand=hand;__flockReview.hand(27000);__flockReview.hand(27100)
    const recalls=__flockReview.render(27800)
    window.__hand=null
    __flockReview.reset()
    const secondHand=hand.map(p=>({...p,x:p.x+.2}))
    window.__hands=[horizontalHand,secondHand]
    __flockReview.hand(28000);const targets=__flockReview.hand(28100)
    const trackedPerchPath=targets.length===2&&targets.every(t=>t.perchPath.length===(t.horizontal?6:5)&&Math.abs(t.perchPath[0].x-t.x)<.001&&Math.abs(t.perchPath[0].y-t.y)<.001)
    const twoHands=targets.length===2&&targets.find(t=>t.key==='Left').horizontal&&!targets.find(t=>t.key==='Right').horizontal
    window.__hands=[secondHand,horizontalHand];window.__handLabels=['Right','Left']
    const reordered=__flockReview.hand(28200)
    const stableIdentity=reordered.find(t=>t.key==='Left').horizontal&&!reordered.find(t=>t.key==='Right').horizontal
    const pose=Array.from({length:33},()=>({x:0,y:0,z:0,visibility:0}))
    pose[15]={...horizontalHand[0],visibility:1};pose[13]={x:horizontalHand[0].x-.2,y:.45,visibility:1}
    window.__hands=[horizontalHand];window.__handLabels=['Left'];window.__poseOverride=pose
    let bent
    for(let t=28400;t<=29800;t+=200)bent=__flockReview.hand(t)
    const elbowPoint=bent[0].perchPath.at(-1)
    // Current viewport is 844 × 390; mirrored cover crop maps camera coordinates.
    const scale=Math.max(innerWidth/1280,innerHeight/720)
    const expectedX=1-((innerWidth-1280*scale)/2+pose[13].x*1280*scale)/innerWidth
    const expectedY=((innerHeight-720*scale)/2+pose[13].y*720*scale)/innerHeight
    const followsElbow=bent[0].perchPath.length===6&&Math.abs(elbowPoint.x-expectedX)<.01&&Math.abs(elbowPoint.y-expectedY)<.01
    pose[13].visibility=.1
    const bridgedElbow=__flockReview.hand(30000)[0].perchPath.length===6
    const hiddenElbow=__flockReview.hand(30400)[0].perchPath.length===5
    window.__poseOverride=null;window.__hands=null;window.__handLabels=null
    const vHand=hand.map(p=>({...p}));vHand[11]={x:.52,y:.4};vHand[12]={x:.56,y:.3}
    const vClassified=isBirdVictoryHand(vHand)&&!isBirdCallingFinger(vHand)
    __flockReview.reset();window.__hand=hand
    __flockReview.hand(30000);__flockReview.hand(30100);__flockReview.render(31000)
    window.__hand=vHand;__flockReview.hand(31100);__flockReview.hand(31200)
    const oneVDoesNotFire=!__flockReview.graphicActive(31200)
    window.__hands=[vHand,vHand.map(p=>({...p,x:p.x+.2}))]
    __flockReview.hand(31300);__flockReview.hand(31400)
    const twoVFires=__flockReview.graphicActive(31401)&&!__flockReview.dizzyActive(31401)
    const birdsDepart=__flockReview.render(31600)&&!__flockReview.render(34000)
    for(let t=31500;t<=35000;t+=100)__flockReview.hand(t)
    const noHeldRepeat=!__flockReview.graphicActive(35000)
    window.__hands=null;window.__hand=hand
    __flockReview.hand(35100);__flockReview.hand(35400)
    window.__hands=[vHand,vHand.map(p=>({...p,x:p.x+.2}))]
    __flockReview.hand(35500);__flockReview.hand(35600)
    const rearmed=__flockReview.graphicActive(35601)
    window.__hands=null;window.__hand=hand
    __flockReview.hand(35700);__flockReview.hand(36000)
    const noRecallDuringFireworks=__flockReview.hand(36700).length===0
    __flockReview.hand(37300);__flockReview.hand(37400)
    const recallAfterFireworks=__flockReview.render(38000)
    window.__hand=null
    return {bridgedElbow,poseIdle,followsElbow,hiddenElbow,vClassified,oneVDoesNotFire,twoVFires,birdsDepart,noHeldRepeat,rearmed,noRecallDuringFireworks,recallAfterFireworks,trackedPerchPath,twoHands,stableIdentity,index,detectsHorizontal,rejectsPalm,rejectsFist,debounced,called,held,toleratesDropout,departs,recalls}
  })
  assert.ok(Object.values(fingerChecks).every(Boolean),JSON.stringify(fingerChecks))
  await page.locator('.bird-impact-canvas').screenshot({path:join(output,'finger-flock.png')})
  const armChecks=await page.evaluate(async()=>{
    const {findBirdElbow,createBirdArmTracker}=await import('/src/bird-arm.ts')
    const hand=Array.from({length:21},()=>({x:.3,y:.4}));hand[9]={x:.3,y:.3}
    const pose=Array.from({length:33},()=>({x:0,y:0,visibility:0}))
    pose[15]={x:.3,y:.4,visibility:1};pose[13]={x:.1,y:.7,visibility:1}
    pose[16]={x:.75,y:.4,visibility:1};pose[14]={x:.9,y:.65,visibility:1}
    const used=new Set();const elbow=findBirdElbow(hand,pose,1.8,used)
    const bentArm=elbow===pose[13]
    const noDuplicate=findBirdElbow(hand,pose,1.8,used)===null
    pose[13].visibility=.2
    const lowConfidence=findBirdElbow(hand,pose,1.8,new Set())===null
    pose[13].visibility=1;pose[13].x=1.2
    const offscreen=findBirdElbow(hand,pose,1.8,new Set())===null
    pose[13]={x:.1,y:.7,visibility:1}
    const tracker=createBirdArmTracker()
    const first=tracker.sample('left',hand,pose,1.8,1000,1000,new Set())
    pose[13]={x:.108,y:.706,visibility:.45};pose[15].visibility=.4
    const retained=tracker.sample('left',hand,pose,1.8,1140,1140,new Set())
    const confidenceHysteresis=!!retained
    const jitterReduced=retained.x>.1&&retained.x<.108&&retained.y<.706
    const shortOcclusion=tracker.sample('left',hand,[],1.8,1260,1260,new Set())!==null
    const staleCleared=tracker.sample('left',hand,[],1.8,1600,1600,new Set())===null
    pose[13]={x:.1,y:.7,visibility:1};pose[15].visibility=1
    tracker.sample('left',hand,pose,1.8,1800,1800,new Set())
    const movedHand=hand.map(p=>({...p,x:p.x+.3}))
    const noGhostArm=tracker.sample('left',movedHand,[],1.8,1900,1900,new Set())===null
    tracker.reset()
    const reset=tracker.sample('left',hand,[],1.8,1910,1910,new Set())===null
    return {bentArm,noDuplicate,lowConfidence,offscreen,confidenceHysteresis,jitterReduced,shortOcclusion,staleCleared,noGhostArm,reset,acquires:!!first}
  })
  assert.ok(Object.values(armChecks).every(Boolean),JSON.stringify(armChecks))
  const flockChecks=await page.evaluate(async()=>{
    const {createBirdFlock}=await import('/src/bird-flock.ts')
    const flock=createBirdFlock();await flock.prepare()
    const canvas=document.createElement('canvas');canvas.width=390;canvas.height=844
    const c=canvas.getContext('2d');let positions=[],count=0,images=[]
    const translate=c.translate.bind(c),draw=c.drawImage.bind(c)
    c.translate=(x,y)=>{positions.push({x,y});translate(x,y)}
    c.drawImage=(...args)=>{count++;images.push(args[0]);draw(...args)}
    const capture=(now,reduced=false)=>{positions=[];count=0;images=[];c.clearRect(0,0,390,844);flock.draw(c,now,390,844,reduced);return positions.slice()}
    flock.gather(1000,[{key:'left',x:.5,y:.6,palmX:.5,palmY:.72,horizontal:false,direction:1}]);const incoming=capture(1100)
    const entering=capture(1350),arriving=capture(1600)
    const staggeredArrival=incoming.length<entering.length&&entering.length<arriving.length&&arriving.length<18
    const settled=capture(3000)
    const fingertipBirds=settled.filter(p=>Math.abs(p.x-195)<12&&Math.abs(p.y-844*.6)<18).length===2
    const aroundHand=settled.length===18&&settled.some(p=>p.y>844*.6)&&settled.some(p=>p.y<844*.6)
      &&Math.max(...settled.map(p=>p.x))-Math.min(...settled.map(p=>p.x))>100
    const later=capture(3400)
    const restingAndFlying=later.some((p,i)=>Math.hypot(p.x-settled[i].x,p.y-settled[i].y)<.01)
      &&later.some((p,i)=>Math.hypot(p.x-settled[i].x,p.y-settled[i].y)>5)
    for(let t=3000;t<6000;t+=80)flock.gather(t,[{key:'left',x:.75,y:.5,horizontal:false,direction:1}])
    const moved=capture(6000)
    const bounded=count===18
    const follows=moved.reduce((sum,p,i)=>sum+p.x-settled[i].x,0)/18>65&&moved.reduce((sum,p,i)=>sum+p.y-settled[i].y,0)/18 < -50
    const approaching=incoming.some(p=>p.x<0||p.x>390)
    const left={key:'left',x:.25,y:.6,horizontal:false,direction:1}
    const right={key:'right',x:.75,y:.6,horizontal:false,direction:-1}
    flock.gather(6100,[left,right]);capture(6100);const split=capture(7200)
    const twoGroups=split.filter(p=>p.x<195).length===9&&split.filter(p=>p.x>195).length===9
    flock.gather(7300,[{...left,horizontal:true},right]);capture(7300);const mixed=capture(8400)
    const row=mixed.filter(p=>p.x<195),hover=mixed.filter(p=>p.x>195)
    const horizontalRow=row.length===9&&Math.max(...row.map(p=>p.y))-Math.min(...row.map(p=>p.y))<.01
    const independent=hover.length===9&&Math.max(...hover.map(p=>p.y))-Math.min(...hover.map(p=>p.y))>10
    flock.gather(8500,[{...left,horizontal:true},{...right,horizontal:true}]);capture(8500);const rows=capture(9600)
    const bothRows=rows.length===18&&Math.max(...rows.map(p=>p.y))-Math.min(...rows.map(p=>p.y))<.01
    window.__flockRows=canvas.toDataURL()
    const beforeFrames=images.slice();capture(9780)
    const changed=images.filter((source,i)=>source!==beforeFrames[i]).length
    const staggeredFlutter=changed>0&&changed<18
    capture(9800,true);const reducedBefore=canvas.toDataURL();capture(10000,true)
    const reducedStable=canvas.toDataURL()===reducedBefore
    flock.release(10100)
    const departureStart=capture(10100),departing=capture(10300)
    const individualTakeoffs=departing.some((p,i)=>Math.hypot(p.x-departureStart[i].x,p.y-departureStart[i].y)<2)
      &&departing.some((p,i)=>Math.hypot(p.x-departureStart[i].x,p.y-departureStart[i].y)>5)
    const earlyExit=capture(11700).length,lateExit=capture(12300).length
    const staggeredExit=earlyExit>lateExit&&lateExit>0
    capture(13000)
    const cleansUp=!flock.active(13000)&&count===0
    flock.gather(13000,[left,right]);capture(15000);flock.release(15100)
    const beforeRecall=capture(15500)
    flock.gather(15500,[left,right]);const afterRecall=capture(15500)
    const continuousRecall=afterRecall.length===beforeRecall.length&&afterRecall.every((p,i)=>Math.hypot(p.x-beforeRecall[i].x,p.y-beforeRecall[i].y)<2)
    const limb=[{x:.75,y:.6},{x:.68,y:.6},{x:.60,y:.6},{x:.52,y:.6},{x:.42,y:.68},{x:.2,y:.8}]
    flock.gather(16000,[{key:'left',x:.75,y:.6,horizontal:true,direction:1,perchPath:limb}]);capture(16000)
    const limbSeats=capture(17500)
    const segmentDistance=(p,a,b)=>{
      const dx=(b.x-a.x)*390,dy=(b.y-a.y)*844
      const t=Math.max(0,Math.min(1,((p.x-a.x*390)*dx+(p.y+2-a.y*844)*dy)/(dx*dx+dy*dy)))
      return Math.hypot(p.x-a.x*390-t*dx,p.y+2-a.y*844-t*dy)
    }
    const onLimb=limbSeats.length===18&&limbSeats.every(p=>limb.slice(1).some((b,i)=>segmentDistance(p,limb[i],b)<.01))
    const fingerThenArm=limbSeats.some(p=>p.x>.52*390)&&limbSeats.some(p=>p.x<.42*390)
    const noPastTip=limbSeats.every(p=>p.x<.75*390&&p.x>.2*390)
    window.__flockLimb=canvas.toDataURL()
    flock.dispose()
    return {onLimb,fingerThenArm,noPastTip,fingertipBirds,staggeredArrival,individualTakeoffs,staggeredExit,continuousRecall,aroundHand,restingAndFlying,staggeredFlutter,reducedStable,bounded,follows,approaching,twoGroups,horizontalRow,independent,bothRows,cleansUp}
  })
  assert.ok(Object.values(flockChecks).every(Boolean),JSON.stringify(flockChecks))
  await writeFile(join(output,'perched-rows.png'),Buffer.from((await page.evaluate(()=>window.__flockRows)).split(',')[1],'base64'))
  await writeFile(join(output,'limb-perches.png'),Buffer.from((await page.evaluate(()=>window.__flockLimb)).split(',')[1],'base64'))
  const haloChecks = await page.evaluate(async () => {
    const {createBirdDizzy} = await import('/src/bird-dizzy.ts')
    const halo=createBirdDizzy(), canvas=document.createElement('canvas')
    canvas.width=390;canvas.height=844
    const c=canvas.getContext('2d')
    const render=(now,reduced=false)=>{c.clearRect(0,0,390,844);halo.draw(c,now,390,844,reduced);return canvas.toDataURL()}
    halo.show(1000,{x:.5,y:.3,span:.3})
    const reducedStable=render(1800,true)===render(2200,true)
    const animated=render(1800)!==render(2200)
    const before=render(1800)
    for(let i=0;i<12;i++)halo.follow({x:.7,y:.4,span:.3})
    const followsHead=render(1800)!==before
    const persistent=halo.active(60000)
    halo.hideUntil(4000)
    halo.show(2200,{x:.5,y:.3,span:.3})
    const rescheduled=!halo.active(2200)&&halo.active(4300)
    halo.reset()
    const reset=!halo.active(4300)
    halo.dispose()
    return {reducedStable,animated,followsHead,persistent,rescheduled,reset}
  })
  assert.ok(Object.values(haloChecks).every(Boolean), 'Halo supports motion reduction, tracking, rescheduling and cleanup')
  const graphicChecks = await page.evaluate(async () => {
    const {createBirdImpactGraphic}=await import('/src/bird-impact-graphic.ts')
    const graphic=createBirdImpactGraphic(),canvas=document.createElement('canvas');canvas.width=390;canvas.height=844
    await graphic.prepare()
    const c=canvas.getContext('2d')
    const render=(now,reduced=false)=>{c.clearRect(0,0,390,844);graphic.draw(c,now,390,844,reduced);return canvas.toDataURL()}
    const empty=render(0)
    graphic.burst({x:195,y:280},1000,390,844)
    const visible=render(1500)!==empty
    const animated=render(1100)!==render(1500)
    let images=[],strokes=0,sparkMarks=0,finiteSparks=true
    const sources=new Set()
    const original=c.drawImage,originalStroke=c.stroke,originalRect=c.fillRect
    c.fillRect=function(...args){sparkMarks++;finiteSparks&&=args.every(Number.isFinite);return originalRect.apply(this,args)}
    c.drawImage=function(image,x,y,w,h){images.push({image,x:x+w/2,y:y+h/2,w,alpha:this.globalAlpha});sources.add(image);return original.call(this,image,x,y,w,h)}
    c.stroke=function(...args){strokes++;return originalStroke.apply(this,args)}
    const capture=(now,reduced=false)=>{images=[];sparkMarks=0;render(now,reduced);return images.slice()}
    const first=capture(1040),second=capture(1160),middle=capture(1500)
    const fireworks=sparkMarks>100&&sparkMarks<1800&&finiteSparks
    const clearOutside=c.getImageData(0,700,390,144).data.every(v=>v===0)
    const all=capture(1900)
    const overlappingBlooms=capture(1650).filter(p=>p.alpha>.4).length>=9
    const peak=capture(1200)[0],afterglow=capture(1700)[0]
    const quickBloom=peak.w>first[0].w*1.5&&afterglow.w<peak.w*1.25
    const printBurnsOut=afterglow.alpha<peak.alpha*.2&&sparkMarks>100
    const fading=capture(2300),late=capture(2400),last=capture(2500)
    const individualExpiry=fading.length>late.length&&late.length>last.length&&last.length<all.length
      &&fading.every(p=>all.some(a=>a.image===p.image))
    const compactEnding=capture(2600).length===0&&!graphic.active(2600)&&sparkMarks===0
    const reducedEarly=capture(1800,true),reducedLater=capture(1900,true)
    const reducedFixedGeometry=reducedEarly.every(p=>reducedLater.some(a=>a.image===p.image&&a.x===p.x&&a.y===p.y&&a.w===p.w))
    const sizes=capture(1900,true).map(p=>p.w)
    const variedSizes=Math.max(...sizes)/Math.min(...sizes)>4&&new Set(sizes.map(w=>Math.round(w))).size>=10
    const sequential=first.length===1&&second.length>first.length&&middle.length>second.length&&all.length===14
    const independentMotifs=new Set(all.map(p=>p.image)).size===14&&new Set(all.map(p=>`${p.x},${p.y}`)).size===14
    const onlyGraphic=strokes===0&&all.every(p=>p.image!==canvas&&p.image.width===256)
    const anchoredToImpact=Math.abs(first[0].x-195)<.01&&first[0].y<280
    const framesHead=all.some(p=>p.x<150)&&all.some(p=>p.x>240)&&all.some(p=>p.y<240)
      &&all.every(p=>Math.abs(p.x-195)>40||p.y<280)
    graphic.burst({x:85,y:420},3000,390,844)
    const moved=capture(3500)
    const repositions=moved.length===middle.length&&moved.every((p,i)=>Math.abs(p.x-middle[i].x+110)<.01&&Math.abs(p.y-middle[i].y-140)<.01)
    capture(3500,true)
    const reducedNoSparks=sparkMarks===0
    const fixed=capture(3500,true)
    for(let i=0;i<20;i++)graphic.follow({x:.6,y:.45,span:.3})
    const followed=capture(3500,true)
    const followsHead=followed[0].x>fixed[0].x+100&&followed[0].w>fixed[0].w*1.4
    c.drawImage=original;c.stroke=originalStroke;c.fillRect=originalRect
    const expired=render(6000)===empty&&!graphic.active(6000)
    graphic.burst({x:195,y:280},7000,390,844);graphic.reset()
    const reset=render(7200)===empty
    graphic.dispose()
    const released=[...sources].every(source=>source.width===0&&source.height===0)
    await graphic.prepare()
    graphic.burst({x:195,y:280},8000,390,844)
    const reopens=render(8500)!==empty
    graphic.dispose()
    return {visible,animated,sequential,overlappingBlooms,individualExpiry,compactEnding,quickBloom,printBurnsOut,independentMotifs,variedSizes,framesHead,followsHead,fireworks,reducedNoSparks,reducedFixedGeometry,onlyGraphic,anchoredToImpact,clearOutside,repositions,expired,reset,released,reopens}
  })
  assert.ok(Object.values(graphicChecks).every(Boolean), 'Individual dot fireworks ignite sequentially at the impact, expire and clean up')
  assert.ok(!requests.some(url => /glass-bird-impact|wing-impact-|bird-glass\.ts/.test(url)), 'Glass renderer and photographic textures are not downloaded')
  await page.evaluate(() => { Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange')) })
  assert.equal(await page.evaluate(() => __flockReview.running()), false)
  assert.equal(await page.evaluate(() => __streams.at(-1).getVideoTracks()[0].enabled), false)
  await page.evaluate(() => { Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));__flockReview.pause() })
  assert.equal(await page.evaluate(() => __streams.at(-1).getVideoTracks()[0].enabled), true)
  await page.locator('.bird-impact-close').click()
  await page.waitForFunction(() => document.querySelector('.bird-impact-screen').getAttribute('aria-hidden') === 'true')
  assert.ok(await page.evaluate(() => __streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))))
  // A late permission result must not resurrect the page or leak a camera track.
  await page.evaluate(() => { window.__holdCamera = true })
  await die.click()
  await page.waitForFunction(() => Boolean(window.__releaseCamera))
  await page.evaluate(() => history.back())
  await page.waitForFunction(() => document.querySelector('.bird-impact-screen').getAttribute('aria-hidden') === 'true')
  await page.evaluate(() => { window.__releaseCamera();window.__holdCamera=false })
  await page.waitForFunction(() => __streams.length === 2 && __streams[1].getTracks().every(t=>t.readyState==='ended'))
  await die.click(); await page.locator('.bird-impact-screen.is-tracking').waitFor()
  await page.locator('.bird-impact-close').click()
  await page.waitForFunction(() => __streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')))
  assert.equal(await page.evaluate(()=>window.__poseLive),0,'Pose model closes with the camera')
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ passed:true, output, camera:'synthetic', inferenceBudget, armChecks, fingerChecks, flockChecks, haloChecks, graphicChecks, checks:['G route','head gesture disabled','two-hand V fireworks','persistent idle halo','no held repeats','rearm','halo hidden only during fireworks','offscreen cleanup','mobile/landscape','standalone dot graphic','hidden pause','track cleanup','late permission cancellation','reopen'] }))
} finally { await browser.close() }
