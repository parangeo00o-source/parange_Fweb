import './archive.css'
import './archive-skin.css'
import './archive-product.css'
import './archive-pop.css'
import './archive-type.css'
import { pageReady, trackEvent } from './analytics'
import { archiveArtwork } from './archive-art'
import { archiveProjects, instagramPostUrl, instagramProfile, projectDrawers } from './archive-projects'
import type { ArchiveProject } from './archive-projects'

const number = (value: number) => String(value).padStart(2, '0')
const cabinetPartitions = (axis: 'row' | 'column', count: number) => Array.from({ length: count + 1 }, (_, division) =>
  `<i class="ar-wall-${axis}" style="--division:${division}" aria-hidden="true"></i><i class="ar-rim-${axis}" style="--division:${division}" aria-hidden="true"></i>`
).join('')

export function createArchiveExperience(onBack: () => void) {
  const screen = document.createElement('section')
  screen.className = 'archive-screen'
  screen.hidden = true
  screen.setAttribute('aria-label', 'Parange project archive')
  screen.innerHTML = `
    <div class="ar-atmosphere" aria-hidden="true"></div>
    <div class="ar-shell">
      <div class="ar-cabinet-wrap">
      <div class="ar-cabinet">
        <div class="ar-cabinet-top"><i class="ar-screw"></i><span>PARANGE® &nbsp; — &nbsp; ARCHIVE STORAGE SYSTEM</span><i class="ar-screw"></i></div>
        <div class="ar-floor-grid" aria-hidden="true">${Array.from({ length: 25 }, (_, i) => `<div class="ar-cell"><span class="ar-slot-number">${number(i + 1)}</span></div>`).join('')}</div>
        <div class="ar-card-stage"><div class="ar-grid" aria-label="Project cassette tapes"></div></div>
        ${cabinetPartitions('row', 5)}${cabinetPartitions('column', 5)}
        ${Array.from({ length: 36 }, (_, i) => `<i class="ar-joint" style="--joint-x:${i % 6};--joint-y:${Math.floor(i / 6)}" aria-hidden="true"></i>`).join('')}
        <i class="ar-outer-side ar-outer-left" aria-hidden="true"></i><i class="ar-outer-side ar-outer-right" aria-hidden="true"></i>
        <div class="ar-cabinet-front"><span class="ar-plate">R — <span class="ar-front-number">01</span><small>SELECTED WORKS</small></span><span class="ar-handle" aria-hidden="true"></span><span class="ar-front-note">HANDLE WITH CURIOSITY <span>✳</span></span></div>
      </div>
      <div class="ar-product-controls ar-bottom-actions">
        <button class="ar-back" type="button"><span aria-hidden="true">↖</span> BACK TO PLAY</button>
        <button type="button" class="ar-case-toggle" aria-controls="ar-case-card-grid" aria-expanded="false" aria-label="Come out — summon robot" disabled>COME OUT</button>
        <div class="ar-bottom-links">
          <nav class="ar-section-nav" aria-label="Archive sections"><button type="button" data-scroll=".ar-index-heading">INDEX</button></nav>
          <a class="ar-instagram" href="${instagramProfile}" target="_blank" rel="noopener noreferrer"><span class="ar-instagram-label">@parange.oo</span> <span class="ar-instagram-arrow" aria-hidden="true">↗</span><span class="ar-sr"> (opens in a new tab)</span></a>
        </div>
      </div>
      </div>
      <div class="ar-below"><nav class="ar-pagination" aria-label="Browse archive drawers"><button type="button" class="ar-prev" aria-label="Previous drawer">←</button><span class="ar-page"></span><button type="button" class="ar-next" aria-label="Next drawer">→</button></nav></div>
      <section class="ar-catalog" aria-label="Project index"><div class="ar-index-heading"><span>PROJECT INDEX</span><span class="ar-index-hint">SELECT A CASSETTE TO EXPLORE ↗</span></div>
      <div class="ar-directory" aria-label="Project names"></div>
      <p class="ar-status" role="status" aria-live="polite"></p></section>
      <footer class="ar-footer"><span class="ar-footer-brand">PARANGE<small>INDEPENDENT<br>CREATIVE ARCHIVE</small></span><span class="ar-footer-edition">WORKS<sup>R—29</sup></span></footer>
    </div>`
  document.body.append(screen)
  const get = <T extends HTMLElement>(selector: string) => screen.querySelector<T>(selector)!
  screen.querySelectorAll<HTMLButtonElement>('[data-scroll]').forEach(button => button.addEventListener('click', () => {
    get(button.dataset.scroll!).scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })
  }))
  const grid = get('.ar-grid')
  const directory = get('.ar-directory')
  const status = get('.ar-status')
  const previous = get<HTMLButtonElement>('.ar-prev')
  const next = get<HTMLButtonElement>('.ar-next')
  const drawers = projectDrawers(archiveProjects, 25)
  const pages = drawers.length
  let page = 0
  let product: ReturnType<typeof import('./archive-product').createArchiveProduct> | undefined
  let productLoading = false
  const cabinetHost = get('.ar-cabinet-wrap')
  const updateProduct = () => product?.setCards([...grid.querySelectorAll<HTMLElement>('.ar-card')]).catch(() => {
    product?.dispose(); product = undefined
    cabinetHost.classList.remove('ar-product-host')
  })
  async function prepareProduct() {
    if (product || productLoading) return
    productLoading = true
    cabinetHost.classList.add('ar-vehicle-preparing')
    try {
      const { createArchiveProduct } = await import('./archive-product')
      product = createArchiveProduct(cabinetHost)
      cabinetHost.classList.add('ar-product-host')
      product.setVisible(!screen.hidden)
      await updateProduct()
    } catch {
      product?.dispose(); product = undefined
      cabinetHost.classList.remove('ar-product-host')
    } finally { productLoading = false; cabinetHost.classList.remove('ar-vehicle-preparing') }
  }

  function control(project: ArchiveProject, className: string): HTMLAnchorElement | HTMLButtonElement {
    const url = instagramPostUrl(project.instagramUrl)
    const element = url ? document.createElement('a') : document.createElement('button')
    element.className = className
    element.dataset.project = project.id
    element.title = project.title
    element.setAttribute('aria-label', `${project.title}${url ? ' — view Instagram post (new tab)' : ' — design preview, post not connected'}`)
    if (element instanceof HTMLAnchorElement && url) {
      element.href = url
      element.target = '_blank'
      element.rel = 'noopener noreferrer'
      element.addEventListener('click', () => trackEvent('experience_interaction', { page_id: 'archive', action: 'instagram_post_open' }))
    } else if (element instanceof HTMLButtonElement) {
      element.type = 'button'
      element.addEventListener('click', () => {
        status.textContent = `${project.title} — Design preview. The Instagram post is not connected yet.`
        screen.querySelectorAll('.is-selected').forEach(item => item.classList.remove('is-selected'))
        screen.querySelectorAll<HTMLElement>('[data-project]').forEach(item => item.classList.toggle('is-selected', item.dataset.project === project.id))
      })
    }
    const highlight = (active: boolean) => {
      product?.setActive(active ? project.id : '')
      screen.querySelectorAll<HTMLElement>('[data-project]').forEach(item => {
        if (item.dataset.project === project.id) item.classList.toggle('is-highlighted', active)
      })
    }
    element.addEventListener('pointerenter', () => highlight(true))
    element.addEventListener('pointerleave', () => highlight(false))
    element.addEventListener('focus', () => highlight(true))
    element.addEventListener('blur', () => highlight(false))
    return element
  }

  function render() {
    const projects = drawers[page]
    const offset = drawers.slice(0, page).reduce((total, drawer) => total + drawer.length, 0)
    const hasPreviews = projects.some(project => project.preview)
    grid.replaceChildren()
    directory.replaceChildren()
    projects.forEach((project, index) => {
      const slot = document.createElement('div')
      slot.className = 'ar-slot'
      const card = control(project, 'ar-card')
      card.dataset.edition = String(project.artwork)
      card.style.setProperty('--turn', `${[-3, 2, -2, 3, 2, -3, 3, -2, -2, 2, -3, 2][index % 12]}deg`)
      card.innerHTML = `<span class="ar-card-art">${archiveArtwork(project.artwork)}</span><span class="ar-card-meta"><span class="ar-card-title"></span><span class="ar-card-arrow" aria-hidden="true">${instagramPostUrl(project.instagramUrl) ? '↗' : '○'}</span></span>`
      const print = card.querySelector('img')!
      const portrait = print.width < print.height
      card.classList.toggle('ar-card-portrait', portrait)
      // File prints on their long edge as in the original drawer. Rotate the
      // complete artwork rather than crop or stretch it into a landscape slot.
      const printRatio = portrait ? print.height / print.width : print.width / print.height
      card.style.setProperty('--print-ratio', String(printRatio))
      // Give square and portrait editions the same maximum standing height as
      // landscape cards, so they cannot cover the cards in the row behind them.
      card.style.setProperty('--card-width', `${68 * Math.min(1, printRatio / 1.5)}%`)
      card.querySelector('.ar-card-title')!.textContent = project.title
      slot.append(card)
      grid.append(slot)
      const entry = control(project, 'ar-index-item')
      entry.innerHTML = `<span class="ar-index-number">${number(offset + index + 1)}</span><span class="ar-index-title"></span><span class="ar-index-arrow" aria-hidden="true">${instagramPostUrl(project.instagramUrl) ? '↗' : '○'}</span>`
      entry.querySelector('.ar-index-title')!.textContent = project.title
      directory.append(entry)
    })
    screen.querySelectorAll('.ar-slot-number').forEach((label, index) => { label.textContent = number(offset + index + 1) })
    get('.ar-front-number').textContent = number(page + 1)
    get('.ar-page').textContent = `${number(page + 1)} / ${number(pages)}`
    get('.ar-index-hint').textContent = hasPreviews ? 'PREVIEW TITLES / POSTS TO BE CONNECTED' : 'SELECT A CASSETTE TO EXPLORE ↗'
    void updateProduct()
    previous.disabled = page === 0
    next.disabled = page >= pages - 1
    status.textContent = hasPreviews ? 'Design previews · Project titles and post links coming soon' : projects.length ? '' : 'New work is on the way.'
  }
  previous.addEventListener('click', () => { if (page > 0) { page--; render() } })
  next.addEventListener('click', () => { if (page < pages - 1) { page++; render() } })
  get('.ar-back').addEventListener('click', onBack)
  render()
  return {
    open() { screen.hidden = false; get('.ar-back').focus({ preventScroll: true }); product?.setVisible(true); void prepareProduct(); pageReady('Archive') },
    close() { screen.hidden = true; product?.setVisible(false) },
  }
}
