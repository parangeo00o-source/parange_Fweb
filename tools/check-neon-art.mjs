// Authored-art inspection: all scenery, both character directions, and cache bounds.
import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const output=await mkdtemp(join(tmpdir(),'parange-neon-art-'))
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1280,height:1100},deviceScaleFactor:1})
  const errors=[];page.on('pageerror',e=>errors.push(String(e)))
  await page.goto(process.env.REVIEW_URL||'https://localhost:5173');await page.waitForLoadState('networkidle')
  const result=await page.evaluate(async()=>{
    const {drawNeonScenery,sceneryTileBounds:frame}=await import('/src/neon-scenery.ts')
    const kinds=['home','market','park','signal','dock','broadleaf','fruit-tree','palm','swings','slide','bench','seesaw','sandbox','fence','gate','bridge','sign','star-marker']
    const sheet=document.createElement('canvas');sheet.id='art-review';sheet.width=1280;sheet.height=1100
    Object.assign(sheet.style,{position:'fixed',inset:0,zIndex:999999,width:'1280px',height:'1100px'});document.body.append(sheet)
    const c=sheet.getContext('2d');c.fillStyle='#fffdf3';c.fillRect(0,0,1280,1100)
    const hashes=[],bounds=[]
    for(let i=0;i<kinds.length;i++){
      c.save();c.translate(110+(i%6)*210,270+Math.floor(i/6)*340);c.scale(1.7,1.7);drawNeonScenery(c,kinds[i],i);c.restore()
      c.font='12px sans-serif';c.fillStyle='#44354f';c.textAlign='center';c.fillText(kinds[i],110+(i%6)*210,300+Math.floor(i/6)*340)
    }
    // Detect clipping before a high-DPI world tile is generated. Test all palette variants.
    for(const kind of kinds)for(let variant=0;variant<12;variant++){
      const tile=document.createElement('canvas');tile.width=360;tile.height=320
      const tc=tile.getContext('2d');tc.translate(180,270);tc.scale(2,2);drawNeonScenery(tc,kind,variant)
      if(!variant)hashes.push(tile.toDataURL())
      const pixels=tc.getImageData(0,0,360,320).data;let minX=360,maxX=0,minY=320,maxY=0
      for(let y=0;y<320;y++)for(let x=0;x<360;x++)if(pixels[(y*360+x)*4+3]>10){minX=Math.min(x,minX);maxX=Math.max(x,maxX);minY=Math.min(y,minY);maxY=Math.max(y,maxY)}
      const b={kind,variant,left:(minX-180)/2,right:(maxX-180)/2,top:(minY-270)/2,bottom:(maxY-270)/2}
      if(b.left<frame.left||b.right>frame.left+frame.width||b.top<frame.top||b.bottom>frame.top+frame.height)bounds.push(b)
    }
    window.drawCharacterSheet=async()=>{
      const {loadResidentArtwork}=await import('/src/neon-illustration.ts');if(!await loadResidentArtwork())throw Error('Native character artwork unavailable')
      const {drawNeonResident}=await import('/src/neon-illustration.ts'),{residentDesigns}=await import('/src/resident-designs.ts')
      c.fillStyle='#fffdf3';c.fillRect(0,0,1280,1100)
      const unique=[]
      for(let i=0;i<16;i++){
        const x=160+(i%4)*320,y=226+Math.floor(i/4)*270
        for(const [offset,yaw] of [[-64,0],[64,Math.PI]]){c.save();c.translate(x+offset,y);c.scale(1.3,1.3);drawNeonResident(c,i,0,yaw);c.restore()}
        c.font='12px sans-serif';c.fillStyle='#44354f';c.fillText(residentDesigns[i].kind,x,y+25)
        const t=document.createElement('canvas');t.width=240;t.height=280;const ctx=t.getContext('2d');ctx.translate(120,265);ctx.scale(1.7,1.7);drawNeonResident(ctx,i);unique.push(t.toDataURL())
      }
      return new Set(unique).size
    }
    return {sceneryCount:new Set(hashes).size,clippedVariants:bounds}
  })
  await page.locator('#art-review').screenshot({path:join(output,'scenery.png')})
  const characters=await page.evaluate(()=>drawCharacterSheet())
  await page.locator('#art-review').screenshot({path:join(output,'character-front-back.png')})
  assert.equal(result.sceneryCount,18);assert.equal(characters,16);assert.deepEqual(result.clippedVariants,[]);assert.deepEqual(errors,[])
  console.log(JSON.stringify({...result,characters,errors,output},null,2))
}finally{await browser.close()}
