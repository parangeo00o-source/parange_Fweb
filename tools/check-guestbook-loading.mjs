// All records are mocked. No writes are made to Supabase.
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const { chromium, webkit } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output = await mkdtemp(join(tmpdir(), 'parange-drawer-loading-'))
const browser = process.env.BROWSER_ENGINE === 'webkit' ? await webkit.launch({ headless: true }) : await chromium.launch({ channel: 'chrome', headless: true })
const gate = () => { let release; const promise = new Promise(resolve => { release = resolve }); return { promise, release } }
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1366, height: 768 } })
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  const api = gate(), image = gate(), apiStarted = gate(), imageStarted = gate()
  let records = Array.from({ length: 3 }, (_, paper) => ({ id: `qa-${paper}`, name: `Visitor ${paper}`, message: 'Hello', paper, created_at: '2026-10-14T00:00:00Z' }))
  await page.route('https://*.supabase.co/rest/v1/**', async route => {
    assert.equal(route.request().method(), 'GET')
    apiStarted.release()
    await api.promise
    await route.fulfill({ json: records })
  })
  await page.route('**/thumb-*.jpg*', async route => {
    if (route.request().resourceType() !== 'image') return route.continue()
    imageStarted.release()
    await image.promise
    if (route.request().url().includes('thumb-25')) return route.abort('failed')
    await route.continue()
  })
  await page.goto(process.env.REVIEW_URL || 'https://localhost:5173')
  await page.locator('.dice[data-route="#guestbook"]').click()
  await apiStarted.promise
  await page.locator('.guestbook-screen').waitFor({ state: 'attached' })
  assert.equal(await page.locator('.guestbook-screen').isVisible(), false, 'The whole page waits, including its title')
  assert.equal(await page.locator('.gb-title-mark').isVisible(), false)
  assert.equal(await page.locator('.gb-collection').isVisible(), false, 'Do not reveal an empty cabinet before records arrive')
  assert.equal(await page.locator('.gb-collection').evaluate(node => node.inert), true)
  api.release()
  await imageStarted.promise
  assert.equal(await page.locator('.gb-collection').isVisible(), false, 'Wait for actual image decoding, not just the database')
  assert.equal(await page.locator('.gb-postcard').count(), 0, 'Prepared cards stay off-DOM until complete')
  image.release()
  await page.waitForFunction(() => document.querySelector('.gb-status').textContent.startsWith('Pick a postcard'))
  assert.equal(await page.locator('.gb-collection').isVisible(), true)
  assert.equal(await page.locator('.gb-postcard').count(), 3)
  assert.ok(await page.locator('.gb-postcard img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0 && img.loading === 'eager')))
  assert.equal(await page.locator('h1 img').getAttribute('alt'), 'Leave A Little Hello')
  await page.locator('h1 img').evaluate(img => img.decode())
  await page.screenshot({ path: join(output, 'ready.png') })
  const card = page.locator('.gb-postcard').first()
  await page.mouse.move(5, 5)
  const rest = await card.evaluate(node => new DOMMatrix(getComputedStyle(node).transform).m43)
  await card.hover()
  await page.waitForFunction(() => new DOMMatrix(getComputedStyle(document.querySelector('.gb-postcard')).transform).m43 > 6.9)
  const lifted = await card.evaluate(node => new DOMMatrix(getComputedStyle(node).transform).m43)
  assert.ok(lifted - rest > 5, 'Hover retains a visible upward lift')
  await page.screenshot({ path: join(output, 'hover.png') })
  await card.evaluate(node => { window.qaOriginalCard = node })
  await page.locator('.gb-refresh').click()
  await page.waitForFunction(() => !document.querySelector('.gb-refresh').disabled)
  assert.ok(await card.evaluate(node => node === window.qaOriginalCard), 'Unchanged refresh preserves card layers instead of rebuilding them')
  await page.locator('.gb-back').click()
  await page.locator('.dice[data-route="#guestbook"]').click()
  await page.locator('.guestbook-screen').waitFor({ state: 'visible' })
  assert.equal(await page.locator('.gb-postcard').count(), 3, 'Reopening uses the complete cached drawer')
  assert.ok(await card.evaluate(node => node === window.qaOriginalCard))
  // A failed asset must not replace a complete drawer with half-loaded cards.
  records = [{ ...records[0], paper: 24 }]
  await page.locator('.gb-refresh').click()
  await page.waitForFunction(() => document.querySelector('.gb-status').textContent.includes('images could not load'))
  assert.equal(await page.locator('.gb-postcard').count(), 3)
  assert.equal(await page.locator('.gb-collection').isVisible(), true)
  assert.equal(await page.locator('.gb-refresh').isEnabled(), true)
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ output, checks: 'delayed API, delayed images, whole-page atomic reveal, eager decoded thumbnails, title mark, hover lift, unchanged refresh and cached reopen preserve layers, failed image preserves drawer, retry enabled', errors }, null, 2))
} finally { await browser.close() }
