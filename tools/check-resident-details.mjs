// Species-specific acceptance checks for the original-roster detail pass.
import assert from 'node:assert/strict'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
  const page=await browser.newPage({ignoreHTTPSErrors:true})
  const errors=[];page.on('pageerror',e=>errors.push(String(e)))
  await page.goto(`${process.env.REVIEW_URL||'https://localhost:5173'}/tools/resident-preview.html`)
  await page.waitForLoadState('networkidle')
  const result=await page.evaluate(async()=>{
    const T=await import('/node_modules/.vite/deps/three.js')
    const {createResidentRig}=await import('/src/resident-model.ts')
    const {residentDesigns}=await import('/src/resident-designs.ts')
    const {residentSculpts}=await import('/src/resident-sculpt.ts')
    const check=(ok,message)=>{if(!ok)throw Error(message)}
    const box=o=>{o.geometry.computeBoundingBox();return o.geometry.boundingBox.getSize(new T.Vector3()).multiply(o.scale)}
    const report=[]
    for(const [i,d]of residentDesigns.entries()){
      const rig=createResidentRig(i),get=n=>rig.group.getObjectByName(n)
      if(['bear','cat','penguin','koala','elephant','mouse','otter'].includes(d.kind))
        check(d.head[0]/d.head[1]>1.19,`${d.kind}: larger horizontal head lost`)
      if(d.kind==='capybara'){
        check(residentSculpts.capybara.body[2]<1,'Capybara torso is stretched in depth')
        check(d.head[2]>.43&&box(get('capybara-round-belly')).z<.32,'Capybara elongated head/compact belly distinction lost')
      }
      if(d.kind==='dog'){
        check(get('sculpted-head').geometry.userData.continuousMuzzle&&!get('muzzle-volume'),'Dog muzzle must be integrated')
        check(box(get('floppy-ear')).y>.57,'Dog ears must droop well below their roots')
      }
      if(d.kind==='otter'){
        const p=get('otter-tail').geometry.attributes.position
        const center=new T.Vector3(),ring=41
        for(let j=0;j<28;j++)center.add(new T.Vector3().fromBufferAttribute(p,ring*29+j))
        center.divideScalar(28)
        let radius=0
        for(let j=0;j<28;j++)radius=Math.max(radius,center.distanceTo(new T.Vector3().fromBufferAttribute(p,ring*29+j)))
        check(radius>.065,'Otter tail becomes needle-thin before its rounded tip')
      }
      if(d.kind==='mouse'){
        const p=get('mouse-tail').geometry.attributes.position,centers=[]
        for(let r=0;r<=64;r++){
          const c=new T.Vector3()
          for(let j=0;j<18;j++)c.add(new T.Vector3().fromBufferAttribute(p,r*19+j))
          centers.push(c.divideScalar(18))
        }
        const zs=centers.map(c=>c.z)
        check(zs.slice(15,30).some(z=>z<-.30)&&zs.slice(35,48).some(z=>z>-.26)&&zs.at(-1)<-.40,'Mouse tail must reverse direction into an S in profile')
      }
      if(d.kind==='deer'){
        const g=get('antler-connected-branches').geometry,p=g.attributes.position
        const ids=new Map(),edges=new Map(),vertices=[]
        for(let j=0;j<p.count;j++){
          const key=[p.getX(j),p.getY(j),p.getZ(j)].map(v=>Math.round(v*1e6)).join('/')
          if(!ids.has(key))ids.set(key,ids.size)
          vertices.push(ids.get(key))
        }
        for(let j=0;j<vertices.length;j+=3){
          const tri=vertices.slice(j,j+3)
          if(new Set(tri).size<3)continue
          for(let k=0;k<3;k++){
            const a=tri[k],b=tri[(k+1)%3],key=a<b?`${a}/${b}`:`${b}/${a}`
            edges.set(key,(edges.get(key)||0)+1)
          }
        }
        check([...edges.values()].every(n=>n===2),'Antler union has an open/non-manifold edge')
        check(g.userData.connectedBranches&&!get('antler-rounded-tip'),'Antler tips must be part of the joined volume')
      }
      if(d.kind==='duck'){
        check(get('left-wing-feather')&&!get('left-glove'),'Duck wing must be a sculpted feather silhouette')
        const g=get('right-wing-feather').geometry
        check(g.attributes.normal.getZ(0)>.99&&box(get('right-wing-feather')).z>.15,'Duck wing must be inflated with outward-facing normals')
      }
      if(d.kind==='sheep')check(get('crown-wool-curl')&&get('continuous-wool-cap'),'Sheep cloud crown is missing')
      if(d.kind==='penguin')check(get('scarf-end')&&get('scarf-fold')&&!get('padded-collar'),'Penguin scarf was replaced by a neck ring')
      if(d.kind==='bear')check(get('hood-rolled-opening')&&get('folded-hood'),'Bear hoodie volume missing')
      report.push(d.kind);rig.dispose()
    }
    return report
  })
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({passed:result.length,species:result,errors},null,2))
}finally{await browser.close()}
