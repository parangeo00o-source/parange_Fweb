// Geometric continuity, not just a screenshot at the most flattering angle.
import assert from 'node:assert/strict'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
  const page=await browser.newPage({ignoreHTTPSErrors:true})
  const errors=[];page.on('pageerror',e=>errors.push(String(e)))
  await page.goto(`${process.env.REVIEW_URL || 'https://localhost:5173'}/tools/resident-preview.html`)
  await page.waitForLoadState('networkidle')
  const report=await page.evaluate(async()=>{
    const T=await import('/node_modules/.vite/deps/three.js')
    const {residentSculpts,headPoint,headFront}=await import('/src/resident-sculpt.ts')
    const {residentDesigns}=await import('/src/resident-designs.ts')
    const {createResidentRig}=await import('/src/resident-model.ts')
    const {residentProfile}=await import('/src/resident-profile.ts')
    const check=(ok,message)=>{if(!ok)throw Error(message)}
    const results=[]
    for(const [index,design] of residentDesigns.entries()){
      const sculpt=residentSculpts[design.kind],rig=createResidentRig(index)
      const head=rig.group.getObjectByName('sculpted-head'),g=head.geometry,p=g.attributes.position,n=g.attributes.normal
      check(g.userData.sculptVersion==='continuous-volume-v3','Old ring-based head is active')
      let minOutward=1,minPoleNormal=1,maxSeamError=0
      const seams=new Map()
      for(let i=0;i<p.count;i++){
        const point=new T.Vector3().fromBufferAttribute(p,i),normal=new T.Vector3().fromBufferAttribute(n,i)
        check(Math.abs(normal.length()-1)<.0001,`${design.kind}: invalid sculpt normal`)
        minOutward=Math.min(minOutward,normal.dot(point.clone().normalize()))
        if(Math.abs(point.y/design.head[1])>.9999)minPoleNormal=Math.min(minPoleNormal,normal.y*Math.sign(point.y))
        const key=point.toArray().map(v=>Math.round(v*1e6)).join('/')
        if(seams.has(key))maxSeamError=Math.max(maxSeamError,normal.distanceTo(seams.get(key)))
        else seams.set(key,normal)
      }
      check(minOutward>.55,`${design.kind}: folded/inward head surface ${minOutward}`)
      check(minPoleNormal>.995,`${design.kind}: pinched chin/crown ${minPoleNormal}`)
      check(maxSeamError<.00001,`${design.kind}: visible UV shading seam`)
      // Tiny circles around poles must converge to one point from every azimuth,
      // without the old direction-dependent jaw offset surviving at the pole.
      for(const sign of [-1,1])for(const epsilon of [1e-4,1e-6])for(let a=0;a<32;a++){
        const y=sign*(1-epsilon),r=Math.sqrt(1-y*y),angle=a*Math.PI/16
        const point=headPoint(sculpt,design.head,Math.sin(angle)*r,y,Math.cos(angle)*r)
        const ellipse=new T.Vector3(Math.sin(angle)*r*design.head[0],y*design.head[1],Math.cos(angle)*r*design.head[2])
        check(point.distanceTo(ellipse)<epsilon*.8,`${design.kind}: non-convergent pole`)
      }
      let maxCurvatureJump=0
      for(const y of [-.82,-.46,0,.46,.82])for(let a=0;a<16;a++){
        const angle=a*Math.PI/8,h=1e-4
        const at=v=>headPoint(sculpt,design.head,Math.sin(angle)*Math.sqrt(1-v*v),v,Math.cos(angle)*Math.sqrt(1-v*v))
        const left=at(y).add(at(y-2*h)).addScaledVector(at(y-h),-2).multiplyScalar(1/(h*h))
        const right=at(y+2*h).add(at(y)).addScaledVector(at(y+h),-2).multiplyScalar(1/(h*h))
        maxCurvatureJump=Math.max(maxCurvatureJump,left.distanceTo(right))
      }
      check(maxCurvatureJump<.03,`${design.kind}: visible latitude curvature band ${maxCurvatureJump}`)
      if(design.kind!=='frog')head.parent.traverse(o=>{
        if(o.name==='eye')check(Math.abs(o.position.z-headFront(sculpt,design.head,o.position.x,o.position.y)-.002)<1e-7,`${design.kind}: floating eye`)
        if(o.name==='nose'&&o.userData.attachmentSurface!==undefined){
          check(o.position.z-o.scale.z<o.userData.attachmentSurface&&o.position.z+o.scale.z>o.userData.attachmentSurface,`${design.kind}: floating/hidden nose`)
        }
        if(o.name==='whisker'){
          const positions=o.geometry.attributes.position
          for(let ring=0;ring<=18;ring++){
            const center=new T.Vector3()
            for(let side=0;side<8;side++)center.add(new T.Vector3().fromBufferAttribute(positions,ring*9+side))
            center.multiplyScalar(1/8)
            const gap=center.z-headFront(sculpt,design.head,center.x,center.y)
            check(gap>.001&&gap<.015,`${design.kind}: broken/floating whisker ${gap}`)
          }
        }
      })
      const garment=rig.group.getObjectByName('garment-shell')
      if(garment){
        garment.geometry.computeBoundingBox()
        const size=garment.geometry.boundingBox.getSize(new T.Vector3()).multiply(garment.scale)
        check(size.z/size.x>.76,`${design.kind}: flattened garment`)
      }
      const profile=residentProfile([[0,.055],[sculpt.hem-.018,.055],[sculpt.hem,.084],[sculpt.hem,.14],[sculpt.waist,.26],[sculpt.chest,.37],[.151,.438],[0,.45]])
      let previous=-Infinity
      for(let i=0;i<=1000;i++){
        const q=profile.getPoint(i/1000)
        check(q.x>=0&&q.x<=Math.max(sculpt.hem,sculpt.waist,sculpt.chest)&&q.y>=previous,`${design.kind}: garment profile folds/overshoots`)
        previous=q.y
      }
      rig.dispose()
      results.push({kind:design.kind,minOutward,minPoleNormal,maxSeamError,maxCurvatureJump})
    }
    return results
  })
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({passed:report.length,report,errors},null,2))
}finally{await browser.close()}
