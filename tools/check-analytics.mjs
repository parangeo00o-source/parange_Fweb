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
    let entries = []
    await page.route('https://*.supabase.co/rest/v1/**', route => {
      const req = route.request()
      if (req.url().includes('create_guestbook_postcard')) {
        const data = req.postDataJSON()
        entries = [{ id: data.p_id, name: data.p_name, message: data.p_message, paper: data.p_paper, created_at: new Date().toISOString() }]
        return route.fulfill({ json: entries })
      }
      if (req.url().includes('delete_guestbook_postcard')) { entries = []; return route.fulfill({ json: true }) }
      return route.fulfill({ json: entries })
    })
    await page.goto(process.env.PREVIEW_URL || 'https://127.0.0.1:4183')
    await page.waitForFunction(() => Boolean(window.dataLayer?.length))
    assert.deepEqual(tags, ['https://www.googletagmanager.com/gtag/js?id=G-PPPHDDBFC3'])
    assert.ok(await page.locator('script[src*="googletagmanager.com/gtag/js"]').evaluate(script => script.async))
    const commands = () => page.evaluate(() => window.dataLayer.map(command => Array.from(command)))
    const first = await commands()
    assert.equal(first.filter(c => c[0] === 'config').length, 1)
    assert.equal(first[0][0], 'js')
    assert.deepEqual(first[1], ['config', 'G-PPPHDDBFC3'])
    assert.equal(await page.locator('.dice').count(), 48)
    const events = async name => (await commands()).filter(c => c[0] === 'event' && c[1] === name).map(c => c[2])
    assert.deepEqual((await events('page_start')).map(e => e.page_id), ['home'])
    await page.locator('.dice[data-route="#guestbook"]').click()
    await page.waitForFunction(() => document.querySelector('.gb-status')?.textContent.includes('first hello'))
    assert.deepEqual((await events('page_start')).map(e => e.page_id), ['home', 'guestbook'])
    assert.equal((await events('page_ready')).at(-1).page_id, 'guestbook')
    await page.locator('.gb-write').click()
    await page.locator('[name=name]').fill('PRIVATE_TEST_NAME')
    await page.locator('[name=message]').fill('PRIVATE_TEST_MESSAGE')
    await page.locator('input[name=paper][value="24"]').check()
    await page.locator('.gb-submit').click()
    await page.locator('.gb-postcard').waitFor()
    assert.deepEqual((await events('postcard_submit')).map(e => e.status), ['attempt', 'success'])
    assert.equal((await events('postcard_design_select')).at(-1).design_id, 25)
    await page.locator('.gb-postcard').click()
    await page.locator('.gb-delete').click()
    await page.locator('.gb-delete-yes').click()
    await page.waitForFunction(() => !document.querySelector('.gb-read').open)
    assert.equal((await events('postcard_delete')).at(-1).status, 'success')
    assert.equal((await events('postcard_read')).length, 1)
    await page.locator('.gb-back').click()
    await page.waitForFunction(() => location.hash === '')
    assert.deepEqual((await events('page_start')).map(e => e.page_id), ['home', 'guestbook', 'home'])
    assert.deepEqual((await events('page_end')).map(e => e.page_id), ['home', 'guestbook'])
    assert.ok((await events('page_end')).every(e => e.duration_ms >= e.visible_time_ms && e.visible_time_ms >= 0))
    assert.equal((await events('page_view')).length, 0, 'No manual page_view alongside Enhanced Measurement')
    assert.equal((await commands()).filter(c => c[0] === 'config').length, 1)
    assert.ok(!JSON.stringify(await commands()).includes('PRIVATE_TEST'), 'No author name or message in analytics')
    await page.locator('.dice[data-route="#e"]').click()
    await page.locator('.planet-mode-tab[data-mode="neon"]').click()
    assert.deepEqual((await events('planet_mode_change')).map(e => [e.previous_mode, e.mode]), [['day', 'neon']])
    await page.locator('.planet-mode-tab[data-mode="neon"]').click()
    assert.equal((await events('planet_mode_change')).length, 1, 'No duplicate mode-change event')
    await page.locator('.planet-close').click()
    await page.waitForFunction(() => location.hash === '')
    if (!blocked) {
      // Exercise every camera destination without accessing actual hardware.
      await page.evaluate(() => {
        navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('QA: no camera access', 'NotAllowedError') }
      })
      const routes = ['#lemonade', '#watertouch', '#balloon', '#bird-impact', '#bluefish', '#elephant-drawing', '#rubber-human', '#shampoo', '#tooth-gem', '#angel-devil']
      for (const route of routes) {
        const die = page.locator(`.dice[data-route="${route}"]`)
        assert.equal(await die.count(), 1, `Missing test route ${route}`)
        const before = (await events('page_start')).length
        await die.click()
        await page.waitForFunction(count => window.dataLayer.filter(c => c[0] === 'event' && c[1] === 'page_start').length > count, before)
        const currentPage = (await events('page_start')).at(-1).page_id
        await page.waitForFunction(id => window.dataLayer.some(c => c[0] === 'event' && c[1] === 'camera_access' && c[2].page_id === id && c[2].status === 'failed'), currentPage)
        const access = (await events('camera_access')).filter(e => e.page_id === currentPage)
        assert.equal(access[0].status, 'requested')
        assert.equal(access.at(-1).reason, 'not_allowed')
        await page.goBack()
        await page.waitForFunction(() => location.hash === '')
        assert.equal((await events('page_end')).at(-1).page_id, currentPage)
      }
    }
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
  console.log('PASS: production GA4, all 12 experience lifecycle hooks, camera permission failures, postcard save/read/delete, design selection, mode changes, privacy, blocked tag, no dev analytics or real Google traffic')
} finally { await browser.close() }
