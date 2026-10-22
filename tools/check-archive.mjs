import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.REVIEW_URL || 'https://localhost:5173'
const output = await mkdtemp(join(tmpdir(), 'parange-archive-'))
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' })
  await context.route('https://www.instagram.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Mock Instagram post</title>' }))
  const page = await context.newPage()
  const errors = [], unwanted = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('request', request => { if (/guestbook_entries|guestbook_postcard|vintage-v1|print-v4|print-v5/.test(request.url())) unwanted.push(request.url()) })
  await page.goto(origin)
  const die = page.locator('.dice[data-route="#archive"]')
  await die.waitFor({state:'visible'})
  assert.equal(await die.count(), 1)
  await die.focus()
  await page.keyboard.press('Enter')
  await page.locator('.archive-screen').waitFor({ state: 'visible' })
  assert.equal(new URL(page.url()).hash, '#archive')
  assert.match(await page.title(), /Selected works/)
  assert.equal(await page.locator('.ar-card').count(), 25)
  assert.equal(await page.locator('.ar-index-item').count(), 25)
  assert.equal(await page.locator('.archive-screen form, .archive-screen textarea').count(), 0)
  assert.equal(await page.locator('.ar-instagram').getAttribute('href'), 'https://www.instagram.com/parange.oo/')
  assert.ok(await page.locator('.ar-prev').isDisabled())
  assert.equal(await page.locator('.ar-next').isDisabled(), false)
  assert.equal(await page.locator('.ar-heading,.ar-toolbar').count(), 0)
  assert.equal(await page.locator('.ar-index-title').nth(1).textContent(), 'Louis Vuitton Dosan Pop-up')
  const expectedCodes = ['Def-k32FIrW','Dd_NkxCAqx6','DYEGW9wmVZm','DYEHTmYlOx0','DXyaT4OAjcH','DY-gtx4k4Jf','DVHG3nLEnY0','DY4qHcFARs4','DeDqZOpFG0m','DeDqhEWlMpP','DeDqvHPlPy2','DKbow8Av6Fh','C1zqGXPPDVz','DJjHDUsv1e2','DVHIsHUE096','DVLfaEkj-Gd','DeLb1wZFJBe','DONmcavjxdd','DTGN7LOEh1W','DWvnTJRlLs9','DVJjvKNEuEV','DKL9vBDPiMg','C-2h9o9vq1F','C-2ilgPP46n','C-2ixSpv0yK','DB-eKXzv3Gc','DG5AganvIvM','DHc2C1gviq9','DHc2zEfPAAd']
  const slides = new Set([1,3,4,6,9,10,11,15,16,17,18,20,24,25,26,29])
  const expectedDrawers = [
    ['01','02','03','04','05','06','07','15','16','08','09','10','11','12','13','14','17','18','19','20','21','22','23','24','25'],
    ['26','27','28','29'],
  ]
  assert.equal(await page.locator('.ar-cell').count(), 25)
  assert.equal(await page.locator('.ar-wall-row').count(), 6)
  assert.equal(await page.locator('.ar-wall-column').count(), 6)
  assert.equal(await page.locator('.ar-cabinet > .ar-card-stage').count(), 1, 'Cards must share the cabinet depth with its dividers')
  const ready = async () => {
    await page.waitForFunction(() => {
      const host = document.querySelector('.ar-product-ready')
      return host?.getAttribute('aria-busy') === 'false' && Number(host.querySelector('canvas')?.dataset.cards) === document.querySelectorAll('.ar-card').length
    })
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  }
  await ready()
  const navStyle=await page.locator('.ar-bottom-actions').evaluate(el=>{
    const buttons=[el.querySelector('.ar-back'),el.querySelector('.ar-case-toggle'),...el.querySelectorAll('.ar-section-nav button')]
    const rects=buttons.map(b=>b.getBoundingClientRect())
    return {ordered:rects[0].right<rects[1].left && rects[1].right<rects[2].left,
      aligned:Math.max(...rects.map(r=>r.top+r.height/2))-Math.min(...rects.map(r=>r.top+r.height/2))<12,
      fonts:buttons.concat(el.querySelector('.ar-instagram')).map(b=>getComputedStyle(b).fontFamily)}
  })
  assert.ok(navStyle.ordered && navStyle.aligned, 'Bottom actions must form one row')
  assert.ok(navStyle.fonts.every(f=>f.includes('Archive Mono')), 'Bottom controls share the archive typeface')
  assert.equal(await page.locator('.ar-status').textContent(), '')
  await page.getByRole('button', { name: 'Come out — summon robot' }).click()
  await page.waitForFunction(() => document.querySelector('.ar-product-canvas').dataset.arrival === 'arrived')
  assert.equal(await page.locator('.ar-cabinet-wrap').getAttribute('data-case-state'), 'closed')
  assert.equal(await page.locator('.ar-grid').evaluate(el => el.inert), true)
  assert.equal(await page.locator('.ar-card').first().isVisible(), false)
  assert.equal(await page.getByRole('button', { name: 'Open archive case' }).getAttribute('aria-expanded'), 'false')
  // Clicking the physical cover opens the case; it must not activate a hidden print.
  const closedView = await page.locator('.ar-cabinet-wrap').boundingBox()
  const hit = JSON.parse(await page.locator('.ar-product-canvas').getAttribute('data-case-center'))
  await page.mouse.click(closedView.x + hit.x, closedView.y + hit.y)
  await page.waitForFunction(() => document.querySelector('.ar-cabinet-wrap').dataset.caseState === 'open')
  assert.equal(await page.locator('.ar-product-canvas').getAttribute('data-focus'), 'cassette-closeup')
  assert.equal(await page.locator('.archive-screen').evaluate(el=>el.classList.contains('ar-viewer-active')),true)
  assert.equal(await page.locator('.ar-grid').evaluate(el => el.inert), false)
  assert.equal(await page.locator('.ar-product-canvas').getAttribute('data-lid-angle'), '106')
  assert.equal(await page.getByRole('button', { name: 'Close archive case' }).getAttribute('aria-expanded'), 'true')
  assert.equal(await page.locator('.ar-product-canvas').getAttribute('data-compartments'), '25')
  assert.equal(await page.locator('.ar-product-canvas').getAttribute('data-objects'), 'cassettes')
  assert.equal(await page.locator('.ar-grid').getAttribute('aria-label'), 'Project cassette tapes')
  assert.equal(await page.locator('.ar-product-canvas').evaluate(el => !!el.getContext('webgl2')), true)
  // Native projected links track the real 3D print on hover and keyboard focus.
  await page.mouse.move(0, 0)
  const firstCard = page.locator('.ar-card').first()
  const label = page.locator('.ar-product-label')
  assert.equal(await label.isVisible(), false)
  await firstCard.hover()
  await label.waitFor({state:'visible'})
  assert.equal(await firstCard.getAttribute('title'),null,'Use the styled tooltip without a duplicate native tooltip')
  assert.deepEqual(await label.evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color})),{background:'rgb(255, 228, 81)',color:'rgb(17, 17, 17)'})
  assert.equal(await page.locator('.ar-product-canvas').getAttribute('data-active-cassette'),await firstCard.getAttribute('data-project'))
  await page.mouse.move(0, 0)
  await firstCard.focus()
  await label.waitFor({state:'visible'})
  await firstCard.evaluate(el => el.blur())
  // Rotating the product must reproject links, and Reset must restore the view.
  const beforeRotation = await firstCard.boundingBox()
  const view = await page.locator('.ar-product-canvas').boundingBox()
  await page.mouse.move(view.x + view.width * .82, view.y + view.height * .1)
  await page.mouse.down()
  await page.mouse.move(view.x + view.width * .65, view.y + view.height * .13, { steps: 8 })
  await page.mouse.up()
  await ready()
  assert.ok(Math.abs((await firstCard.boundingBox()).x - beforeRotation.x) > 2, 'Dragging must rotate the scene and its targets')
  for (const card of await page.locator('.ar-card').all()) await card.click({ trial: true })
  await page.keyboard.press('Home')
  await page.mouse.move(0, 0)
  await ready()
  assert.ok(Math.abs((await firstCard.boundingBox()).x - beforeRotation.x) < 2)
  const seen = []
  const seenArt = []
  for (let drawer = 0; drawer < 2; drawer++) {
    await ready()
    await page.locator('.ar-card-art img').evaluateAll(images => Promise.all(images.map(image => image.decode())))
    assert.equal(await page.locator('.ar-card-art img').evaluateAll(images => images.every(image => {
      // Computed values preserve subpixel dimensions on tiny mobile cards;
      // integer clientWidth/clientHeight can falsely imply image distortion.
      const style = getComputedStyle(image)
      return image.naturalWidth > 0 && (!image.getClientRects().length || Math.abs(parseFloat(style.width) / parseFloat(style.height) - image.naturalWidth / image.naturalHeight) < .01)
    })), true, 'Print images must load and retain their original proportions')
    const artwork = await page.locator('.ar-card-art img').evaluateAll(images => images.map(image => image.src))
    assert.equal(new Set(artwork).size, artwork.length, 'Each visible card needs a distinct design')
    seenArt.push(...artwork)
    const cards = await page.locator('.ar-card').evaluateAll(elements => elements.map(el => ({ id: el.dataset.project, href: el.href, title: el.dataset.tooltip || el.title, tag: el.tagName })))
    const index = await page.locator('.ar-index-item').evaluateAll(elements => elements.map(el => ({ id: el.dataset.project, href: el.href, title: el.dataset.tooltip || el.title, tag: el.tagName })))
    assert.deepEqual(cards, index)
    assert.deepEqual(cards.map(card => card.id), expectedDrawers[drawer])
    assert.equal(await page.locator('.ar-page').textContent(), `0${drawer + 1} / 02`)
    for (const card of cards) {
      const n = Number(card.id)
      assert.equal(card.href, `https://www.instagram.com/p/${expectedCodes[n - 1]}/${slides.has(n) ? '?img_index=1' : ''}`)
      assert.equal(card.tag, 'A')
      assert.doesNotMatch(card.title, /[가-힣]/)
      seen.push(card.id)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.locator('.archive-screen').evaluate(el => el.scrollWidth === el.clientWidth), true)
    // Long project titles must be present as text, not parsed as HTML or clipped.
    assert.equal(await page.locator('.ar-index-title').evaluateAll(elements => elements.every(el => el.scrollHeight <= el.clientHeight)), true)
    if (drawer < 1) await page.locator('.ar-next').click()
  }
  assert.equal(new Set(seen).size, 29)
  assert.equal(new Set(seenArt).size, 29, 'No artwork repeats across the full collection')
  assert.ok(await page.locator('.ar-next').isDisabled())
  await page.locator('.ar-prev').click()
  await ready()
  const actualPopupPromise = context.waitForEvent('page')
  await page.locator('.ar-card').first().click()
  const actualPopup = await actualPopupPromise
  await actualPopup.waitForLoadState()
  assert.equal(actualPopup.url(), 'https://www.instagram.com/p/Def-k32FIrW/?img_index=1')
  await actualPopup.close()
  for (const [width, height] of [[1440, 1400], [390, 844], [320, 740], [844, 390]]) {
    await page.setViewportSize({ width, height })
    await ready()
    const dimensions = await page.locator('.archive-screen').evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }))
    assert.equal(dimensions.width, dimensions.scroll, `Horizontal overflow at ${width}px`)
    await page.locator('.archive-screen').evaluate(el => { el.scrollTop = 0 })
    await ready()
    const contained = await page.locator('.ar-card').evaluateAll(cards => cards.every(card => {
      const view = document.querySelector('.ar-product-canvas').getBoundingClientRect()
      const rect = card.getBoundingClientRect()
      return rect.width > 8 && rect.height > 4 && rect.left >= view.left && rect.right <= view.right && rect.top >= view.top && rect.bottom <= view.bottom
    }))
    assert.ok(contained, `Projected links must stay inside the product view at ${width}px`)
    for (const card of await page.locator('.ar-card').all()) await card.click({ trial: true })
    await page.mouse.move(0, 0)
    await page.locator('.archive-screen').evaluate(el => { el.scrollTop = 0 })
    await page.screenshot({ path: join(output, `archive-${width}.png`) })
    await page.getByRole('button', { name: 'Close archive case' }).click()
    await page.locator('.ar-index-item').last().scrollIntoViewIfNeeded()
    assert.ok(await page.locator('.ar-index-item').last().isVisible())
    await page.getByRole('button', { name: 'Open archive case' }).click()
  }
  await page.getByRole('button', { name: 'Close archive case' }).focus()
  await page.keyboard.press('Enter')
  await page.waitForFunction(() => document.querySelector('.ar-cabinet-wrap').dataset.caseState === 'closed')
  assert.equal(await page.locator('.ar-grid').evaluate(el => el.inert), true)
  await page.getByRole('button', { name: 'Open archive case' }).focus()
  await page.keyboard.press('Space')
  await page.waitForFunction(() => document.querySelector('.ar-cabinet-wrap').dataset.caseState === 'open')
  await page.keyboard.press('Escape')
  await page.waitForFunction(()=>!document.querySelector('.archive-screen').classList.contains('ar-viewer-active'))
  await page.keyboard.press('Escape')
  await page.locator('.archive-screen').waitFor({ state: 'hidden' })
  await page.waitForURL(url => !url.hash)
  assert.equal(await die.evaluate(el => el === document.activeElement), true)
  assert.equal(await page.locator('.stage').evaluate(el => el.inert), false)
  const stoppedFrames = await page.locator('.ar-product-canvas').getAttribute('data-frames')
  await page.waitForTimeout(120)
  assert.equal(await page.locator('.ar-product-canvas').getAttribute('data-frames'), stoppedFrames, 'Closed archive must stop rendering')
  await page.goForward()
  await page.locator('.archive-screen').waitFor({ state: 'visible' })
  await page.goto(`${origin}/#guestbook`)
  await page.locator('.archive-screen').waitFor({ state: 'visible' })
  await page.locator('.ar-back').click()
  await page.waitForURL(url => !url.hash)
  assert.equal(await page.locator('.archive-screen').count(), 1)
  assert.deepEqual(unwanted, [])
  assert.deepEqual(errors, [])

  // In-memory fixtures cover escaping, ungrouped overflow and safe URLs independently of the owner data.
  const linked = await context.newPage()
  linked.on('pageerror', error => errors.push(error.message))
  await linked.route('**/src/archive-projects.ts*', async route => {
    const response = await route.fetch()
    const fixture = `\narchiveProjects.splice(0, archiveProjects.length, ...Array.from({ length: 26 }, (_, i) => ({ id: 'test-' + i, title: i === 0 ? '<Test & Project>' : 'Project ' + (i + 1), artwork: i % 12, instagramUrl: 'https://www.instagram.com/p/test_' + i + '/' })));`
    await route.fulfill({ response, body: (await response.text()) + fixture })
  })
  await linked.goto(origin)
  await linked.evaluate(async () => {
    const { instagramPostUrl } = await import('/src/archive-projects.ts')
    const cases = [null, 'javascript:alert(1)', 'https://instagram.com.evil.test/p/a/', 'https://www.instagram.com/parange.oo/', 'http://instagram.com/p/a/', 'https://instagram.com/p/']
    for (const value of cases) if (instagramPostUrl(value) !== null) throw Error(`Unsafe URL accepted: ${value}`)
    if (instagramPostUrl('https://www.instagram.com/p/test_01/?img_index=2&igsh=example') !== 'https://www.instagram.com/p/test_01/?img_index=2') throw Error('Carousel slide was lost')
    if (instagramPostUrl('https://www.instagram.com/p/test_01/?igsh=example') !== 'https://www.instagram.com/p/test_01/') throw Error('Post URL normalization failed')
  })
  await linked.locator('.dice[data-route="#archive"]').click()
  await linked.locator('.archive-screen').waitFor({ state: 'visible' })
  await linked.waitForFunction(() => document.querySelector('.ar-product-ready')?.getAttribute('aria-busy') === 'false')
  await linked.getByRole('button', { name: 'Come out — summon robot' }).click()
  await linked.waitForFunction(() => document.querySelector('.ar-product-canvas').dataset.arrival === 'arrived')
  await linked.getByRole('button', { name: 'Open archive case' }).click()
  await linked.waitForFunction(() => document.querySelector('.ar-cabinet-wrap').dataset.caseState === 'open')
  assert.equal(await linked.locator('a.ar-card').count(), 25)
  assert.equal(await linked.locator('.ar-card-title').first().textContent(), '<Test & Project>')
  assert.equal(await linked.locator('.ar-card').first().getAttribute('rel'), 'noopener noreferrer')
  assert.equal(await linked.locator('.ar-card').first().getAttribute('target'), '_blank')
  assert.equal(await linked.locator('.ar-index-item').first().getAttribute('href'), 'https://www.instagram.com/p/test_0/')
  await context.route('https://www.instagram.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Mock Instagram post</title>' }))
  const popupPromise = context.waitForEvent('page')
  await linked.locator('.ar-card').first().click()
  const popup = await popupPromise
  await popup.waitForLoadState()
  assert.equal(popup.url(), 'https://www.instagram.com/p/test_0/')
  await popup.close()
  assert.equal(new URL(linked.url()).hash, '#archive')
  await linked.locator('.ar-next').click()
  assert.equal(await linked.locator('.ar-card').count(), 1)
  assert.equal(await linked.locator('.ar-index-title').textContent(), 'Project 26')
  assert.equal(await linked.locator('.ar-page').textContent(), '02 / 02')
  assert.ok(await linked.locator('.ar-next').isDisabled())
  await linked.locator('.ar-prev').click()
  assert.equal(await linked.locator('.ar-card').count(), 25)
  assert.deepEqual(errors, [])
  // WebGL failure must leave the original usable cabinet and native links.
  const fallback = await context.newPage()
  await fallback.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null
      return original.call(this, type, ...args)
    }
  })
  await fallback.goto(`${origin}/#archive`)
  await fallback.locator('.ar-card').first().waitFor()
  await fallback.waitForTimeout(700)
  assert.equal(await fallback.locator('.ar-product-ready').count(), 0)
  assert.equal(await fallback.locator('.ar-card').count(), 25)
  await fallback.locator('.ar-card').first().hover()
  assert.equal(await fallback.locator('.ar-card-meta').first().evaluate(el => getComputedStyle(el).opacity), '1')
  await fallback.close()
  console.log(`PASS: R navigation, legacy route, back/forward, keyboard, 4 responsive sizes, WebGL case, cover click, keyboard open/close, orbit/reset, hover/focus, idle suspension, 29 unique cassette designs loaded without distortion, no guestbook requests, all 29 owner links/titles, project grouping, carousel slides, safe post links/new tab, pagination. Screenshots: ${output}`)
} finally { await browser.close() }
