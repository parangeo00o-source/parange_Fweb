// Run after npm run build + vite preview on port 4183.
// Google is mocked: QA does not send visits to the live Analytics property.
import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  for (const blocked of [false, true]) {
    const page = await browser.newPage({ ignoreHTTPSErrors: true })
    const errors = [], tags = []
    page.on('pageerror', error => errors.push(String(error)))
    await page.route('https://www.googletagmanager.com/**', route => {
      tags.push(route.request().url())
      return blocked ? route.abort('blockedbyclient') : route.fulfill({ contentType: 'application/javascript', body: '/* Analytics is mocked for QA. */' })
    })
    await page.route('https://*.supabase.co/rest/v1/**', route => route.fulfill({ json: [] }))
    await page.goto(process.env.PREVIEW_URL || 'https://127.0.0.1:4183')
    await page.waitForFunction(() => Boolean(window.dataLayer?.length))
    assert.deepEqual(tags, ['https://www.googletagmanager.com/gtag/js?id=G-PPPHDDBFC3'])
    assert.ok(await page.locator('script[src*="googletagmanager.com/gtag/js"]').evaluate(script => script.async))
    const commands = () => page.evaluate(() => window.dataLayer.map(command => Array.from(command)))
    const first = await commands()
    assert.equal(first.length, 2)
    assert.equal(first[0][0], 'js')
    assert.deepEqual(first[1], ['config', 'G-PPPHDDBFC3'])
    assert.equal(await page.locator('.dice').count(), 48)
    await page.locator('.dice[data-route="#guestbook"]').click()
    await page.waitForFunction(() => document.querySelector('.gb-status')?.textContent.includes('first hello'))
    await page.locator('.gb-back').click()
    await page.waitForFunction(() => location.hash === '')
    assert.deepEqual(await commands(), first, 'No duplicate config or manual page_view alongside Enhanced Measurement')
    assert.deepEqual(errors, [], 'An unavailable tag must not break the app')
    await page.close()
  }
  const dev = await browser.newPage({ ignoreHTTPSErrors: true })
  const devTags = []
  await dev.route('https://www.googletagmanager.com/**', route => { devTags.push(route.request().url()); return route.abort() })
  await dev.goto(process.env.DEV_URL || 'https://localhost:5173')
  await dev.locator('.dice').first().waitFor()
  assert.equal(await dev.locator('script[src*="googletagmanager.com"]').count(), 0)
  assert.deepEqual(devTags, [])
  assert.equal(await dev.evaluate(() => window.dataLayer), undefined)
  console.log('PASS: production GA4 ID, async tag, single initialization, no duplicate manual tracking, navigation with blocked tag, no dev analytics; no real Google events sent')
} finally { await browser.close() }
