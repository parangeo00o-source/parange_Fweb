import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output = await mkdtemp(join(tmpdir(), 'parange-beetle-'))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1100 }, reducedMotion: 'no-preference' })
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    window.arrivalSamples = []
    window.hingeSamples = []
    new MutationObserver(records => {
      for (const r of records) if (r.attributeName === 'data-case-state') {
        window.hingeSamples.push({ state:r.target.dataset.caseState, inert:document.querySelector('.ar-grid')?.inert })
      } else if (r.attributeName === 'data-arrival') {
        const c = r.target
        window.arrivalSamples.push({ state: c.dataset.arrival, progress: Number(c.dataset.arrivalProgress || 0), phase: Number(c.dataset.walkPhase || 0), disabled: document.querySelector('.ar-case-toggle')?.disabled })
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-arrival', 'data-case-state'] })
  })
  await page.goto((process.env.REVIEW_URL || 'https://localhost:5173') + '/#archive')
  await page.getByRole('button', { name: '곤충차 부르기' }).waitFor()
  await page.waitForFunction(() => !document.querySelector('.ar-summon')?.disabled)
  await page.waitForTimeout(650)
  assert.equal(await page.locator('.ar-product-canvas').getAttribute('data-arrival'), 'waiting', 'Must wait for an explicit summon')
  await page.screenshot({ path: join(output, 'waiting.png') })
  await page.getByRole('button', { name: '곤충차 부르기' }).focus()
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => document.querySelector('.ar-product-canvas')?.dataset.arrival === 'walking')
  assert.equal(await page.getByRole('button', { name: 'Open archive case' }).isDisabled(), true)
  assert.equal(await page.locator('.ar-grid').evaluate(el => el.inert), true)
  const edges = await page.locator('.ar-product-canvas').evaluate(c => { const a=c.getBoundingClientRect(),b=c.closest('.archive-screen').getBoundingClientRect();return {left:a.left-b.left,right:a.right-b.right} })
  assert.ok(Math.abs(edges.left)<1 && Math.abs(edges.right)<1, 'Walking canvas must reach the page edges')
  await page.waitForFunction(() => Number(document.querySelector('.ar-product-canvas').dataset.arrivalProgress) > .3)
  const overscan=await page.locator('.ar-product-canvas').evaluate(c=>{const a=c.getBoundingClientRect(),h=c.parentElement.getBoundingClientRect();return {top:h.top-a.top,bottom:a.bottom-h.bottom}})
  assert.ok(overscan.top>=99 && overscan.bottom>=99, 'Shadow receiver needs room beyond both vertical stage edges')
  await page.screenshot({ path: join(output, 'entering.png') })
  await page.waitForFunction(() => document.querySelector('.ar-product-canvas')?.dataset.arrival === 'arrived')
  const samples = await page.evaluate(() => window.arrivalSamples)
  assert.ok(samples.some(s => s.state === 'waiting'))
  const walking = samples.filter(s => s.state === 'walking')
  assert.ok(walking.length > 2, 'Entrance needs multiple rendered gait poses')
  assert.ok(walking.at(-1).phase > walking[0].phase)
  assert.ok(walking.every(s => s.disabled), 'Cannot open the canopy mid-stride')
  assert.equal(await page.getByRole('button', { name: 'Open archive case' }).isEnabled(), true)
  await page.mouse.move(0, 0)
  await page.screenshot({ path: join(output, 'arrived.png') })
  const frames = await page.locator('.ar-product-canvas').getAttribute('data-frames')
  await page.waitForTimeout(250)
  assert.equal(await page.locator('.ar-product-canvas').getAttribute('data-frames'), frames, 'Arrival must stop its animation loop')
  await page.getByRole('button', { name: 'Open archive case' }).click()
  await page.waitForFunction(() => document.querySelector('.ar-cabinet-wrap').dataset.caseState === 'open')
  assert.ok(await page.evaluate(() => window.hingeSamples.some(s => s.state === 'opening' && s.inert)), 'Opening must keep cassette links inert')
  assert.equal(await page.locator('.ar-card:visible').count(), 25)
  await page.screenshot({ path: join(output, 'open.png') })
  // Reversing an in-flight hinge must settle with no invisible active card links.
  await page.getByRole('button', { name: 'Close archive case' }).click()
  await page.waitForTimeout(160)
  await page.getByRole('button', { name: 'Open archive case' }).click()
  await page.waitForFunction(() => document.querySelector('.ar-cabinet-wrap').dataset.caseState === 'open')
  await page.locator('.ar-back').click()
  await page.locator('.dice[data-route="#archive"]').click()
  await page.getByRole('button', { name: '곤충차 부르기' }).click()
  await page.waitForFunction(() => document.querySelector('.ar-product-canvas').dataset.arrival === 'walking')
  await page.keyboard.press('Escape')
  await page.locator('.archive-screen').waitFor({ state: 'hidden' })
  const paused = await page.locator('.ar-product-canvas').getAttribute('data-frames')
  await page.waitForTimeout(250)
  assert.equal(await page.locator('.ar-product-canvas').getAttribute('data-frames'), paused)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.locator('.dice[data-route="#archive"]').click()
  await page.getByRole('button', { name: '곤충차 부르기' }).click()
  await page.waitForFunction(() => document.querySelector('.ar-product-canvas').dataset.arrival === 'arrived')
  assert.equal(await page.locator('.ar-cabinet-wrap').getAttribute('data-case-state'), 'closed')
  assert.equal(await page.locator('.archive-screen').evaluate(el => el.scrollWidth === el.clientWidth), true)
  await page.screenshot({ path: join(output, 'mobile-arrived.png') })
  await page.getByRole('button', { name: 'Open archive case' }).click()
  await page.waitForFunction(() => document.querySelector('.ar-cabinet-wrap').dataset.caseState === 'open')
  await page.screenshot({ path: join(output, 'mobile-open.png') })
  const geometry = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js')
    const { createArchiveBeetle } = await import('/src/archive-beetle.ts')
    const model = new THREE.Group(), gs = new Set(), ms = new Set(), ts = []
    const vehicle = createArchiveBeetle(model, (w,h,draw) => { const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'));const t=new THREE.CanvasTexture(c);ts.push(t);return t }, (g,m) => { gs.add(g);ms.add(m) })
    const feet = model.children.filter(o => o.name.startsWith('beetle-foot-'))
    vehicle.walk(Math.PI/2, 1)
    const grounded = feet.filter(f => Math.abs(f.position.y + 3.12) < .001).length
    const raised = feet.filter(f => f.position.y > -2.7).length
    const bones=model.children.filter(o=>/^beetle-(femur|tibia)-/.test(o.name)), lengths=bones.map(o=>o.scale.y)
    vehicle.walk(Math.PI*1.3, 1)
    const fixedBones=bones.every((o,i)=>Math.abs(o.scale.y-lengths[i])<.00001)
    let finite = true
    for(const g of gs) for(const value of g.attributes.position.array) if(!Number.isFinite(value)) finite=false
    vehicle.walk(0,0)
    const resting = feet.every(f => Math.abs(f.position.y + 3.12) < .001)
    for(const g of gs)g.dispose();for(const m of ms)m.dispose();for(const t of ts)t.dispose()
    return { count:feet.length, grounded, raised, resting, finite, fixedBones }
  })
  assert.deepEqual(geometry, { count: 6, grounded: 3, raised: 3, resting: true, finite: true, fixedBones: true })
  assert.deepEqual(errors, [])
  console.log(`PASS: offscreen arrival, alternating tripod gait, idle suspension, click/hinge reversal, navigation during arrival, mobile re-entry, six connected legs and finite geometry. Screenshots: ${output}`)
} finally { await browser.close() }
