import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' })
  const page = await context.newPage(), errors = []
  await page.addInitScript(() => {
    window.__archiveBufferWrites = 0
    for (const name of ['width', 'height']) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, name)
      Object.defineProperty(HTMLCanvasElement.prototype, name, {
        ...descriptor,
        set(value) {
          if (this.classList.contains('ar-product-canvas')) window.__archiveBufferWrites++
          descriptor.set.call(this, value)
        },
      })
    }
  })
  page.on('pageerror', error => errors.push(error.message))
  await page.goto((process.env.REVIEW_URL || 'https://localhost:5173') + '/#archive')
  await page.waitForFunction(() => document.querySelector('.ar-product-ready')?.getAttribute('aria-busy') === 'false')
  const buffer = () => page.locator('.ar-product-ready canvas').evaluate(c => ({ width: c.width, height: c.height, scale: Number(c.dataset.renderScale), label: c.dataset.labelResolution, cssWidth: c.clientWidth }))
  const initial = await buffer()
  assert.equal(initial.label, '2048×1290')
  assert.ok(initial.scale >= 2)
  const unchangedWrites = await page.evaluate(async () => {
    const before = window.__archiveBufferWrites
    for (let i = 0; i < 24; i++) {
      window.dispatchEvent(new Event('resize'))
      window.visualViewport?.dispatchEvent(new Event('resize'))
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    return window.__archiveBufferWrites - before
  })
  assert.equal(unchangedWrites, 0, 'Repeated zoom/resize notifications must not reallocate an unchanged buffer')
  const writesBeforeRetina = await page.evaluate(() => window.__archiveBufferWrites)
  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 3, mobile: false })
  // CDP changes DPR without the native window event emitted by browser zoom.
  await page.evaluate(() => window.dispatchEvent(new Event('resize')))
  await page.waitForFunction(() => Number(document.querySelector('.ar-product-ready canvas')?.dataset.renderScale) >= 3)
  const retina = await buffer()
  assert.ok(retina.width > initial.width)
  assert.equal(await page.evaluate(() => window.__archiveBufferWrites) - writesBeforeRetina, 2, 'DPR changes resize width and height only once')
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 })
  await page.waitForFunction(() => Number(document.querySelector('.ar-product-ready canvas')?.dataset.renderScale) > 3)
  const zoom = await buffer()
  assert.ok(zoom.width * zoom.height <= 18_000_000)
  assert.ok(zoom.width <= 8192 && zoom.height <= 8192)
  assert.ok(zoom.scale <= 4)
  await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 })
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false })
  await page.evaluate(() => window.dispatchEvent(new Event('resize')))
  await page.waitForFunction(() => Number(document.querySelector('.ar-product-ready canvas')?.dataset.renderScale) === 2)
  await page.getByRole('button', { name: 'INDEX', exact: true }).click()
  assert.ok(await page.locator('.archive-screen').evaluate(el => el.scrollTop > 300))
  assert.equal(new URL(page.url()).hash, '#archive')
  // COME OUT now summons the robot; INDEX remains the section scroll action.
  assert.equal(await page.locator('.ar-case-toggle').textContent(), 'COME OUT')
  assert.deepEqual(errors, [])
  console.log('PASS: 2K labels, DPR 1 → 3 → 1, pinch zoom, adaptive buffer and 18 MP/8192 px limits.', { initial, retina, zoom })
} finally { await browser.close() }
