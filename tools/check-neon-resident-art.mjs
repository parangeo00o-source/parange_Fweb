import assert from 'node:assert/strict'
import {mkdtemp,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const manifest=JSON.parse(await readFile('src/assets/planet/neon-original-rigs/manifest.json','utf8'))
assert.equal(manifest.records.length,16)
assert.ok(manifest.records.every(record=>record.changedAlpha===0),'Native material baking must preserve the original silhouette')
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const output=await mkdtemp(join(tmpdir(),'parange-native-neon-'))
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1600,height:1400}}),errors=[],requests=[]
  page.on('request',r=>{if(r.url().includes('neon-residents-')&&r.resourceType()==='image')requests.push(r.url())})
  page.on('pageerror',e=>errors.push(String(e)))
  await page.goto('https://localhost:5173');await page.waitForLoadState('networkidle')
  const result=await page.evaluate(async()=>{
    const {drawNeonResident,neonResidentPortrait,loadResidentArtwork,residentArtStatus}=await import('/src/neon-illustration.ts')
    const {residentDesigns}=await import('/src/resident-designs.ts')
    await loadResidentArtwork([])
    if(residentArtStatus().some(s=>s.ready))throw Error('Empty village loaded character textures')
    await loadResidentArtwork([0])
    if(residentArtStatus().filter(s=>s.ready).length!==1)throw Error('Loading one species fetched unrelated artwork')
    if(!await loadResidentArtwork())throw Error('Missing native artwork')
    if(residentArtStatus().some(s=>!s.ready))throw Error('Missing species')
    const tile=document.createElement('canvas');tile.width=300;tile.height=360;const tc=tile.getContext('2d',{willReadFrequently:true})
    function frame(index,time=0,yaw=0,walk=false){
      tc.setTransform(1,0,0,1,0,0);tc.clearRect(0,0,300,360);tc.translate(150,340);tc.scale(2,2)
      drawNeonResident(tc,index,time,yaw,walk);return tile.toDataURL()
    }
    const fronts=[],views=[]
    for(let i=0;i<16;i++){
      fronts.push(frame(i))
      const angles=Array.from({length:8},(_,j)=>frame(i,0,j*Math.PI/4))
      if(new Set(angles).size!==8)throw Error('Missing direction: '+i)
      views.push(angles.length)
      if(frame(i,100,0,true)===frame(i,450,0,true))throw Error('Walking frozen: '+i)
      frame(i,700);if(frame(i)!==fronts[i])throw Error('Non-deterministic still: '+i)
      if(neonResidentPortrait(i)!==neonResidentPortrait(i))throw Error('Unstable portrait cache')
    }
    const sheet=document.createElement('canvas');sheet.id='resident-materials';sheet.width=1600;sheet.height=1400
    Object.assign(sheet.style,{position:'fixed',inset:0,zIndex:999999,width:'1600px',height:'1400px'});document.body.append(sheet)
    const c=sheet.getContext('2d');c.fillStyle='#fffdf9';c.fillRect(0,0,1600,1400)
    for(let i=0;i<16;i++){
      const x=200+(i%4)*400,y=280+Math.floor(i/4)*345
      for(const [offset,yaw] of [[-85,0],[85,Math.PI]]){c.save();c.translate(x+offset,y);c.scale(2.1,2.1);drawNeonResident(c,i,0,yaw);c.restore()}
      c.fillStyle='#55485e';c.font='14px sans-serif';c.textAlign='center';c.fillText(residentDesigns[i].kind,x,y+27)
    }
    return {species:new Set(fronts).size,views,motion:true,deterministic:true,lazySpeciesLoading:true}
  })
  await page.locator('#resident-materials').screenshot({path:join(output,'native-designs-neon-finish.png')})
  assert.equal(result.species,16);assert.deepEqual(errors,[]);assert.deepEqual(requests,[])
  console.log(JSON.stringify({...result,nativeSilhouettesPreserved:16,archivedAtlasRequests:requests.length,errors,output},null,2))
}finally{await browser.close()}
