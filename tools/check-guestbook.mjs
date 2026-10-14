import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const output = await mkdtemp(join(tmpdir(), 'parange-guestbook-'))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('pageerror', e => errors.push(String(e)))
  let entries = []
  let failRead = false, failWrite = false, missingRpc = false, failDelete = false, postCount = 0, deleteCount = 0
  const attempts = []
  const keys = new Map()
  await page.route('https://*.supabase.co/rest/v1/**', async route => {
    const req = route.request(), url = new URL(req.url())
    assert.ok(req.headers().apikey.startsWith('sb_publishable_'))
    if (url.pathname.endsWith('/delete_guestbook_postcard')) {
      deleteCount++
      if (failDelete) return route.fulfill({ status: 503, json: {} })
      const draft = req.postDataJSON()
      const allowed = keys.get(draft.p_id) === draft.p_delete_key
      if (allowed) { entries = entries.filter(e => e.id !== draft.p_id); keys.delete(draft.p_id) }
      return route.fulfill({ json: allowed })
    }
    if (url.pathname.endsWith('/create_guestbook_postcard')) {
      postCount++
      attempts.push(req.postDataJSON())
      if (missingRpc) return route.fulfill({ status: 404, json: { code: 'PGRST202' } })
      if (failWrite) return route.fulfill({ status: 503, json: { message: 'Unavailable' } })
      const data = req.postDataJSON()
      assert.match(data.p_delete_key, /^[a-f0-9]{64}$/)
      const draft = { id: data.p_id, name: data.p_name, message: data.p_message, paper: data.p_paper }
      const existing = entries.find(e => e.id === draft.id)
      const entry = { ...draft, created_at: new Date().toISOString() }
      if (!existing) { entries.unshift(entry); keys.set(draft.id, data.p_delete_key) }
      return route.fulfill({ status: 200, json: [existing || entry] })
    }
    if (failRead) return route.fulfill({ status: 404, json: { code: 'PGRST205' } })
    const id = url.searchParams.get('id')?.replace('eq.', '')
    const offset = Number(url.searchParams.get('offset') || 0)
    return route.fulfill({ json: id ? entries.filter(e => e.id === id) : entries.slice(offset, offset + 26) })
  })
  const origin = process.env.REVIEW_URL || 'https://localhost:5173'
  await page.goto(origin)
  const guestbookDie = page.locator('.dice[data-route="#guestbook"]')
  await guestbookDie.waitFor()
  assert.equal(await guestbookDie.count(), 1)
  assert.equal(await guestbookDie.locator('.dice-front').textContent(), 'R')
  assert.equal(await page.locator('.guestbook-link').count(), 0, 'Old home symbol is removed')
  assert.equal(await page.locator('.dice[data-route="#framing-blueprint"]').count(), 0, 'Old R destination is removed')
  assert.equal(await page.locator('.dice').count(), 48)
  await page.screenshot({ path: join(output, 'home.png') })
  await guestbookDie.click()
  await page.waitForFunction(() => document.querySelector('.gb-status')?.textContent.includes('first hello'))
  assert.equal(await page.locator('.framing-blueprint-screen').count(), 0, 'R must not initialize its former experience')
  assert.equal(await page.locator('.gb-wall-row').count(), 6)
  assert.equal(await page.locator('.gb-wall-column').count(), 6)
  assert.equal(await page.locator('.gb-cabinet').evaluate(e => getComputedStyle(e).transformStyle), 'preserve-3d')
  assert.ok(await page.evaluate(() => !/[가-힣]/.test(document.querySelector('.guestbook-screen').textContent)), 'All authored UI is English')
  assert.equal(await page.locator('.gb-cell').count(), 25)
  assert.ok(!(await page.locator('.guestbook-screen').textContent()).includes('A CABINET OF LITTLE MEMORIES'))
  assert.ok(!(await page.locator('.gb-top').textContent()).includes('PARANGE'))
  assert.equal(await page.locator('.gb-top').evaluate(e => getComputedStyle(e).borderBottomWidth), '0px')
  assert.equal(await page.locator('.gb-postcard').count(), 0)
  assert.equal(await page.locator('.gb-empty-invite svg').count(), 0, 'Old mouse illustration is replaced')
  assert.equal(await page.locator('.gb-empty-invite img').getAttribute('src'), await page.locator('.gb-title-mark img').getAttribute('src'), 'Invitation paper uses the new title mark')
  await page.locator('.gb-empty-invite img').evaluate(img => img.decode())
  await page.screenshot({ path: join(output, 'empty.png') })
  await page.locator('.gb-empty-invite').click()
  await page.locator('[name=name]').fill('  윤지  ')
  await page.locator('[name=message]').fill('  좋은 하루의 조각을 두고 갑니다.\n다음 산책에서 또 만나요!  ')
  assert.equal(await page.locator('input[name=paper]').count(), 25)
  assert.equal(new Set(await page.locator('.gb-paper-choice img').evaluateAll(imgs => imgs.map(i => i.src))).size, 25)
  await page.locator('input[name=paper][value="24"]').check()
  await page.locator('.gb-selected-print img').evaluate(img => img.decode())
  assert.ok((await page.locator('.gb-selected-print figcaption').textContent()).includes('Moonlit Teddy'))
  await page.screenshot({ path: join(output, 'compose.png') })
  await page.locator('.gb-submit').click()
  await page.waitForFunction(() => document.querySelectorAll('.gb-postcard').length === 1)
  assert.equal(entries[0].name, '윤지')
  assert.equal(entries[0].paper, 24)
  assert.equal(postCount, 1)
  await page.locator('.gb-postcard').click()
  assert.equal(await page.locator('.gb-read-message').textContent(), entries[0].message)
  await page.locator('.gb-read-art img').evaluate(img => img.decode())
  assert.ok((await page.locator('.gb-read-art img').getAttribute('src')).includes('card-25'))
  await page.screenshot({ path: join(output, 'read.png') })
  await page.keyboard.press('Escape')
  assert.ok(await page.locator('.guestbook-screen').isVisible(), 'Escape closes only the dialog')
  await page.reload()
  await page.locator('.gb-postcard').waitFor()
  await page.locator('.gb-back').click()
  await page.waitForFunction(() => location.hash === '')
  assert.ok(await guestbookDie.evaluate(e => e === document.activeElement))
  await page.goForward()
  await page.locator('.gb-postcard').waitFor()
  await page.locator('.gb-postcard').click()
  assert.ok(await page.locator('.gb-delete').isVisible(), 'Ownership survives reload')
  await page.locator('.gb-delete').click()
  await page.locator('.gb-delete-cancel').click()
  assert.equal(deleteCount, 0)
  await page.locator('.gb-delete').click()
  failDelete = true
  await page.locator('.gb-delete-yes').click()
  await page.waitForFunction(() => document.querySelector('.gb-delete-status').textContent.includes('could not process'))
  assert.equal(entries.length, 1, 'Failed deletion preserves record')
  failDelete = false
  await page.locator('.gb-delete-yes').click()
  await page.waitForFunction(() => document.querySelector('.gb-status').textContent.includes('Postcard deleted'))
  assert.equal(entries.length, 0)
  assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('parange:guestbook:delete:')).length), 0)

  // The test's artwork/data is exclusively mocked; no sample posts reach Supabase.
  const messages = ['오늘의 작은 행복을 모아.', 'A little hello from here.', '구름 너머에서 만나요.', 'What a lovely little world.', '다음 산책도 함께 해요.', 'Keep a little wonder.']
  entries = Array.from({ length: 28 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, name: ['Yoonji', 'Min', 'Hana', 'Jules', 'Sora', 'Noah'][i % 6], message: messages[i % 6], paper: i % 25, created_at: '2026-10-14T00:00:00Z' }))
  await page.locator('.gb-refresh').click()
  await page.waitForFunction(() => document.querySelectorAll('.gb-postcard').length === 25)
  await page.setViewportSize({ width: 1366, height: 768 })
  await page.locator('.gb-card-art img').evaluateAll(imgs => Promise.all(imgs.map(img => img.decode())))
  assert.equal(new Set(await page.locator('.gb-card-art img').evaluateAll(imgs => imgs.map(i => i.src))).size, 25)
  const assertLandscapeCards = async () => {
    const cards = await page.locator('.gb-postcard').evaluateAll(nodes => nodes.map(card => {
      const style = getComputedStyle(card)
      return { ratio: parseFloat(style.width) / parseFloat(style.height), imageTransform: getComputedStyle(card.querySelector('img')).transform }
    }))
    assert.ok(cards.every(card => Math.abs(card.ratio - 1.5) < .03), 'Cabinet cards rest on their long edge')
    assert.ok(cards.every(card => card.imageTransform.startsWith('matrix(0, 1, -1, 0,')), 'Portrait art rotates sideways without cropping')
  }
  await assertLandscapeCards()
  const assertCompartmentClearance = async () => {
    const corners = await page.locator('.gb-postcard').evaluateAll(cards => cards.map(card => {
      const style = getComputedStyle(card), cell = card.parentElement
      const w = parseFloat(style.width), h = parseFloat(style.height)
      const matrix = new DOMMatrix(style.transform)
      const [ox, oy] = style.transformOrigin.split(' ').map(parseFloat)
      const points = [[0, 0], [w, 0], [0, h], [w, h]].map(([x, y]) => {
        const p = matrix.transformPoint(new DOMPoint(x - ox, y - oy, 0))
        return { x: p.x + card.offsetLeft + ox, y: p.y + card.offsetTop + oy, z: p.z }
      })
      return { points, width: cell.clientWidth, height: cell.clientHeight }
    }))
    assert.ok(corners.every(({ points, width, height }) => points.every(p => p.x > 3 && p.x < width - 3 && p.y > 3 && p.y < height - 3 && p.z >= -.1)), '3D card corners remain inside their compartment walls and above the floor')
  }
  await assertCompartmentClearance()
  await page.locator('.gb-postcard').last().hover()
  await page.waitForFunction(() => new DOMMatrix(getComputedStyle([...document.querySelectorAll('.gb-postcard')].at(-1)).transform).m43 > 6.9)
  await assertCompartmentClearance()
  await page.screenshot({ path: join(output, 'hover-clearance.png') })
  await page.mouse.move(5, 5)
  const cabinet = await page.locator('.gb-cabinet').boundingBox()
  const front = await page.locator('.gb-front').boundingBox()
  assert.ok(cabinet.y > 0 && front.y + front.height < 768, 'Cabinet fits the opening desktop viewport')
  await page.screenshot({ path: join(output, 'filled.png') })
  await page.locator('.gb-postcard').first().click()
  assert.ok(await page.locator('.gb-delete').isHidden(), 'Legacy and other authors cannot be deleted')
  await page.keyboard.press('Escape')
  await page.locator('.gb-next').click()
  await page.waitForFunction(() => document.querySelector('.gb-page').textContent === '02')
  assert.equal(await page.locator('.gb-postcard').count(), 3)
  await page.locator('.gb-prev').click()
  await page.waitForFunction(() => document.querySelector('.gb-page').textContent === '01')
  for (const [width, height] of [[390, 844], [320, 640], [844, 390]]) {
    await page.setViewportSize({ width, height })
    await assertLandscapeCards()
    await assertCompartmentClearance()
    await page.screenshot({ path: join(output, `mobile-${width}.png`) })
    assert.ok(await page.locator('.guestbook-screen').evaluate(e => e.scrollWidth <= e.clientWidth + 1), 'No horizontal overflow')
    await page.locator('.gb-postcard').first().click()
    assert.ok(await page.locator('.gb-read').isVisible())
    await page.keyboard.press('Escape')
    if (width === 320) {
      await page.locator('.gb-write').click()
      await page.locator('input[name=paper][value="24"]').check()
      assert.equal(await page.locator('input[name=paper]:checked').inputValue(), '24')
      assert.ok(await page.locator('.gb-compose').evaluate(e => e.scrollWidth <= e.clientWidth + 1), '25-card picker fits narrow phones')
      await page.locator('.gb-selected-print img').evaluate(img => img.decode())
      await page.screenshot({ path: join(output, 'mobile-picker.png') })
      await page.keyboard.press('Escape')
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.locator('.gb-write').click()
  await page.locator('[name=name]').fill('<img src=x onerror=alert(1)>')
  await page.locator('[name=message]').fill('<script>window.XSS = true</script>')
  failWrite = true
  await page.locator('.gb-submit').click()
  await page.waitForFunction(() => document.querySelector('.gb-form-status').textContent.includes('could not process'))
  assert.equal(await page.locator('[name=message]').inputValue(), '<script>window.XSS = true</script>')
  failWrite = false
  missingRpc = true
  await page.locator('.gb-submit').click()
  await page.waitForFunction(() => document.querySelector('.gb-form-status').textContent.includes('guestbook-repair.sql'))
  assert.equal(await page.locator('[name=message]').inputValue(), '<script>window.XSS = true</script>')
  assert.equal(await page.locator('.gb-submit').isEnabled(), true)
  assert.deepEqual(attempts.at(-1), attempts.at(-2), 'Failed saves reuse the draft and ownership key')
  const entriesBeforeRetry = entries.length
  missingRpc = false
  await page.locator('.gb-submit').click()
  await page.waitForFunction(() => !document.querySelector('.gb-compose').open)
  assert.equal(entries.length, entriesBeforeRetry + 1, 'A retry after repair saves one postcard')
  assert.deepEqual(attempts.at(-1), attempts.at(-2))
  await page.locator('.gb-postcard').first().click()
  assert.equal(await page.locator('.gb-read-message script').count(), 0)
  assert.equal(await page.evaluate(() => window.XSS), undefined)
  await page.keyboard.press('Escape')
  failRead = true
  await page.locator('.gb-refresh').click()
  await page.waitForFunction(() => document.querySelector('.gb-status').textContent.includes('guestbook-repair.sql'))
  assert.equal(await page.locator('.gb-postcard').count(), 25, 'A load failure does not destroy existing cards')
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => document.querySelector('.guestbook-screen').hidden)
  assert.equal(await page.locator('.stage').evaluate(e => e.inert), false)
  assert.deepEqual(errors, [])
  // Live connectivity check is read-only: never add QA records to the real table.
  const live = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1100 } })
  live.on('pageerror', e => errors.push(String(e)))
  await live.goto(`${origin}/#guestbook`)
  await live.waitForFunction(() => document.querySelector('.gb-status')?.textContent.includes('Pick a postcard') || document.querySelector('.gb-status')?.textContent.includes('first hello'))
  const liveCards = await live.locator('.gb-postcard').count()
  await live.screenshot({ path: join(output, 'live-drawer.png') })
  if (liveCards) {
    await live.locator('.gb-postcard').first().click()
    assert.ok((await live.locator('.gb-read-message').textContent()).length > 0)
    await live.keyboard.press('Escape')
  }
  await live.close()
  assert.deepEqual(errors, [])
  console.log(JSON.stringify({ output, liveCards, checks: 'home, English UI, CSS 3D cabinet, 25 unique loaded card images, 25-option picker, portrait preview, design 25 save/read (mock), desktop/mobile fit, navigation, create/read/delete (mock), ownership, deletion errors, legacy protection, live Supabase read, reload, pagination, XSS, draft preservation', errors }, null, 2))
} finally { await browser.close() }
