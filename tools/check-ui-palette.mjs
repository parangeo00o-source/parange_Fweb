import assert from 'node:assert/strict'
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const output=await mkdtemp(join(tmpdir(),'parange-ui-palette-'))
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']})
const paper='rgb(255, 253, 239)',ink='rgb(56, 38, 79)',yellow='rgb(244, 244, 74)',mint='rgb(140, 233, 181)'
const luminance=color=>{
  const channels=color.match(/\d+/g).slice(0,3).map(n=>{const c=Number(n)/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4})
  return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722
}
const contrast=(a,b)=>{const values=[luminance(a),luminance(b)].sort((a,b)=>b-a);return (values[0]+.05)/(values[1]+.05)}
try {
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1440,height:1000}}),errors=[]
  page.on('pageerror',e=>errors.push(String(e)))
  await page.goto('https://localhost:5173');await page.waitForLoadState('networkidle')
  await page.evaluate(async()=>{
    const {createParangePlanetExperience}=await import('/src/parange-planet.ts')
    window.paletteApp=createParangePlanetExperience();paletteApp.open()
  })
  const results=[]
  // Revisit the original editions after Neon to catch palette leakage on tab changes.
  for(const mode of ['day','night','neon','day','night','neon']) {
    await page.locator(`[data-mode=${mode}]`).click();await page.waitForTimeout(700)
    const result=await page.evaluate(()=>{
      const screen=document.querySelector('.planet-screen'),get=s=>screen.querySelector(s)
      const sample=s=>{const c=getComputedStyle(get(s));return {color:c.color,bg:c.backgroundColor,image:c.backgroundImage,border:c.borderColor}}
      const selectors=['.planet-brand','.planet-mode-tabs','.planet-meeting','.planet-join-primary','.planet-resident-card','.planet-spot-card']
      const rects=()=>selectors.map(s=>{const r=get(s).getBoundingClientRect();return [r.x,r.y,r.width,r.height]})
      const active=screen.classList.contains('planet-acid-ui')
      const colors={panel:sample('.planet-resident-card'),selected:sample('[aria-selected=true]'),tab:sample('[aria-selected=false]'),name:sample('.planet-resident-name'),guide:sample('.planet-guide')}
      const paletteRects=rects(),sky=sample('.planet-sky')
      screen.classList.remove('planet-acid-ui');const originalRects=rects(),originalSky=sample('.planet-sky')
      screen.classList.toggle('planet-acid-ui',active)
      return {active,paletteRects,originalRects,sky,originalSky,...colors}
    })
    assert.deepEqual(result.paletteRects,result.originalRects,'Color edit changed layout')
    assert.deepEqual(result.sky,result.originalSky,'Color edit changed world background')
    assert.equal(result.active,mode==='neon','Print palette must be exclusive to Neon Walk')
    if(mode==='neon'){
      assert.equal(result.panel.bg,paper);assert.equal(result.name.color,ink);assert.equal(result.selected.bg,yellow)
      assert.ok(contrast(result.tab.color,paper)>=4.5);assert.ok(contrast(result.guide.color,result.guide.bg)>=4.5)
    }else{
      assert.equal(result.name.color,mode==='day'?'rgb(24, 87, 140)':'rgb(229, 237, 248)')
      assert.equal(result.selected.bg,mode==='day'?'rgb(255, 223, 102)':'rgb(83, 103, 143)')
    }
    await page.screenshot({path:join(output,`${mode}-main.png`)})
    await page.locator('.planet-join-primary').click()
    await page.waitForSelector('.planet-studio[aria-hidden=false]')
    await page.waitForTimeout(350)
    const studio=await page.evaluate(()=>{
      const color=s=>{const c=getComputedStyle(document.querySelector(s));return {color:c.color,bg:c.backgroundColor}}
      return {status:color('.planet-studio-status'),input:color('.planet-neighbor-name'),privacy:color('.planet-studio-privacy'),header:color('.planet-studio-panels header')}
    })
    if(mode==='neon'){
      assert.equal(studio.status.color,ink);assert.equal(studio.header.bg,mint)
      assert.ok(contrast(studio.status.color,studio.status.bg)>=4.5)
      assert.ok(contrast(studio.input.color,studio.input.bg)>=4.5)
      assert.ok(contrast(studio.privacy.color,paper)>=4.5)
    }else{
      assert.equal(studio.header.bg,'rgb(155, 222, 212)')
      assert.equal(studio.input.color,mode==='day'?'rgb(56, 45, 41)':'rgb(8, 15, 32)')
    }
    await page.screenshot({path:join(output,`${mode}-studio.png`)})
    await page.locator('.planet-studio-close').click()
    await page.waitForTimeout(500)
    // Exercise the actual dialogue component in an isolated preview; no resident save changes.
    await page.evaluate(async()=>{
      const {createPlanetDialogue}=await import('/src/planet-dialogue.ts')
      window.paletteDialogue=createPlanetDialogue(document.querySelector('.planet-screen'),()=>paletteDialogue.setResident(null))
      paletteDialogue.setResident({id:'palette-review',name:'Neighbor 1'})
    })
    const bubble=page.locator('.planet-dialogue:not([hidden])')
    await bubble.locator('.planet-dialogue-next').click()
    const chat=await bubble.evaluate(el=>{
      const read=e=>{const c=getComputedStyle(e);return {color:c.color,bg:c.backgroundColor}}
      return {bubble:read(el),name:read(el.querySelector('.planet-dialogue-name')),next:read(el.querySelector('.planet-dialogue-next')),text:el.querySelector('.planet-dialogue-text').textContent}
    })
    if(mode==='neon'){
      assert.equal(chat.bubble.bg,paper);assert.equal(chat.bubble.color,ink);assert.equal(chat.name.bg,yellow)
      assert.ok(contrast(chat.next.color,chat.next.bg)>=4.5)
    }else{
      assert.equal(chat.bubble.bg,mode==='day'?'rgb(255, 249, 231)':'rgb(16, 29, 52)')
    }
    assert.ok(/[가-힣]/.test(chat.text),'Resident spoken text changed language')
    await page.screenshot({path:join(output,`${mode}-dialogue.png`)})
    await page.evaluate(()=>paletteDialogue.dispose())
    results.push({mode,layoutUnchanged:true,worldBackgroundUnchanged:true,palette:mode==='neon'?'reference-print':'original'})
  }
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({results,errors,output},null,2))
}finally{await browser.close()}
