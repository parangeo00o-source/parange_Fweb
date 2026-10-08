// Optional visual review companion to check-residents.mjs. Screenshots are
// generated artifacts in a fresh temp directory, never replacements for art.
import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output=await mkdtemp(join(tmpdir(),'parange-resident-views-'))
const browser=await chromium.launch({channel:process.env.CHROME_CHANNEL || 'chrome',headless:true})
try {
  const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1440,height:1080}})
  const errors=[];page.on('pageerror',error=>errors.push(String(error)))
  await page.goto(`${process.env.REVIEW_URL || 'https://localhost:5173'}/tools/resident-preview.html`)
  await page.evaluate(async()=>{const {preview}=await import('/src/resident-preview.ts');preview.pause()})
  const views=[['front',0],['front-right',Math.PI/4],['side',Math.PI/2],['rear-right',3*Math.PI/4],['back',Math.PI],['rear-left',5*Math.PI/4],['left',3*Math.PI/2],['front-left',7*Math.PI/4]]
  for(const [name,angle] of views){
    await page.evaluate(async angle=>{const {preview}=await import('/src/resident-preview.ts');preview.setGallery(true);preview.setAngle(angle);preview.render()},angle)
    await page.screenshot({path:join(output,`roster-${name}.png`)})
  }
  const kinds=['fox','bear','rabbit','cat','penguin','koala','frog','elephant','raccoon','deer','dog','duck','sheep','mouse','otter','capybara']
  for(const [index,kind] of kinds.entries()){
    await page.evaluate(async index=>{
      const {preview}=await import('/src/resident-preview.ts')
      const {residentPortrait}=await import('/src/resident-portrait.ts')
      preview.setGallery(false);preview.select(index);preview.setAngle(.55)
      await residentPortrait(index);await new Promise(requestAnimationFrame);preview.render()
    },index)
    await page.screenshot({path:join(output,`${String(index+1).padStart(2,'0')}-${kind}.png`)})
  }
  if(errors.length)throw Error(errors.join('\n'))
  console.log(JSON.stringify({output,views:views.length,residents:kinds.length,errors}))
} finally {await browser.close()}
