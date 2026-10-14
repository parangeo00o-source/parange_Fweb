import './guestbook.css'
import { guestbookMouse } from './guestbook-mark'
import { DRAWER_SIZE, loadPostcards, savePostcard, canDeletePostcard, deletePostcard } from './guestbook-api'
import { postcardArtwork, printNames } from './guestbook-art'
import type { Postcard, PostcardDraft } from './guestbook-api'

const papers = printNames
// Independent CSS 3D planes, from floor z=0 to divider tops z=--depth.
const partitions = Array.from({ length: 6 }, (_, i) => `<i class="gb-wall-row" style="--division:${i}" aria-hidden="true"></i><i class="gb-rim-row" style="--division:${i}" aria-hidden="true"></i><i class="gb-wall-column" style="--division:${i}" aria-hidden="true"></i><i class="gb-rim-column" style="--division:${i}" aria-hidden="true"></i>`).join('')
const dateLabel = (value: string) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))

export function createGuestbookExperience(onBack: () => void) {
  const screen = document.createElement('section')
  screen.className = 'guestbook-screen'
  screen.hidden = true
  screen.setAttribute('aria-label', 'Guestbook')
  screen.innerHTML = `
    <header class="gb-top"><button type="button" class="gb-back">← Back home</button><button type="button" class="gb-refresh">Refresh ↻</button></header>
    <div class="gb-workspace"><aside class="gb-heading"><h1>Leave a<br>little hello.</h1><button type="button" class="gb-write">Leave a postcard <span>↗</span></button><p class="gb-status" role="status" aria-live="polite"></p></aside>
    <div class="gb-collection">
    <div class="gb-cabinet-wrap"><div class="gb-cabinet"><div class="gb-cabinet-cap"><i></i><span>LITTLE HELLOS</span><i></i></div><div class="gb-grid" aria-label="Postcard cabinet"></div>${partitions}<i class="gb-outer-side gb-outer-left" aria-hidden="true"></i><i class="gb-outer-side gb-outer-right" aria-hidden="true"></i><div class="gb-front"><span class="gb-brass-label">No. 01</span><span class="gb-handle" aria-hidden="true"></span></div></div></div>
    <footer class="gb-caption"><strong class="gb-drawer-label">Drawer 01</strong><nav aria-label="Browse drawers"><button type="button" class="gb-prev" aria-label="Previous drawer">←</button><span class="gb-page">01</span><button type="button" class="gb-next" aria-label="Next drawer">→</button></nav></footer>
    <div class="gb-directory" aria-label="Postcard authors"></div>
    </div></div>
    <dialog class="gb-dialog gb-compose" aria-labelledby="gb-compose-title"><button class="gb-dialog-close" type="button" aria-label="Close">×</button><span class="gb-eyebrow">TO OUR LITTLE WORLD</span><h2 id="gb-compose-title">A few words to keep.</h2><form>
      <div class="gb-compose-fields"><label>Your name <input name="name" maxlength="40" required autocomplete="nickname" placeholder="How shall we remember you?"></label>
      <label>Your message <textarea name="message" maxlength="500" required rows="5" placeholder="A little story, a passing thought, a kind hello…"></textarea></label><span class="gb-counter">0 / 500</span>
      <figure class="gb-selected-print"><span>${postcardArtwork(0, true)}</span><figcaption>01 / ${papers[0]}</figcaption></figure></div>
      <fieldset><legend>Choose your postcard <span>25 illustrated editions</span></legend><div class="gb-paper-options">${papers.map((label, i) => `<label title="${label}"><input type="radio" name="paper" aria-label="${String(i + 1).padStart(2, '0')} ${label}" value="${i}" ${i === 0 ? 'checked' : ''}><span class="gb-paper-choice">${postcardArtwork(i)}</span><small>${String(i + 1).padStart(2, '0')} · ${label}</small></label>`).join('')}</div></fieldset>
      <div class="gb-compose-footer"><p class="gb-privacy">Your name and message will be public. Keep personal details private. Keep this browser’s data to delete your postcard later.</p><p class="gb-form-status" role="status" aria-live="polite"></p><button type="submit" class="gb-submit">Send a postcard ↗</button></div>
    </form></dialog>
    <dialog class="gb-dialog gb-read" aria-labelledby="gb-read-name"><button class="gb-dialog-close" type="button" aria-label="Close">×</button><div class="gb-read-spread"><figure class="gb-read-art"></figure><div class="gb-read-paper"><div class="gb-read-header"><span>POST CARD<br><small>PARANGE POSTAL SERVICE</small></span></div><p class="gb-read-message"></p><div class="gb-read-footer"><h2 id="gb-read-name"></h2><time></time></div></div></div><div class="gb-read-actions"><button type="button" class="gb-delete" hidden>Delete postcard</button><div class="gb-delete-confirm" hidden><p>Delete this postcard permanently?</p><button type="button" class="gb-delete-cancel">Keep it</button><button type="button" class="gb-delete-yes">Delete permanently</button></div><p class="gb-delete-status" role="status" aria-live="polite"></p></div></dialog>`
  document.body.append(screen)
  const get = <T extends HTMLElement>(selector: string) => screen.querySelector<T>(selector)!
  const grid = get<HTMLDivElement>('.gb-grid')
  const status = get<HTMLParagraphElement>('.gb-status')
  const compose = get<HTMLDialogElement>('.gb-compose')
  const read = get<HTMLDialogElement>('.gb-read')
  const form = get<HTMLFormElement>('form')
  const name = form.elements.namedItem('name') as HTMLInputElement
  const message = form.elements.namedItem('message') as HTMLTextAreaElement
  const submit = get<HTMLButtonElement>('.gb-submit')
  const prev = get<HTMLButtonElement>('.gb-prev')
  const next = get<HTMLButtonElement>('.gb-next')
  const refresh = get<HTMLButtonElement>('.gb-refresh')
  let page = 0
  let entries: Postcard[] = []
  let hasNext = false
  let controller: AbortController | null = null
  let saving = false
  let pending: PostcardDraft | null = null
  let requestId = 0
  let opened = false
  let selected: Postcard | null = null
  let deleting = false
  let newPostcardId: string | null = null

  const openCompose = () => { compose.showModal(); name.focus() }
  const openPostcard = (entry: Postcard) => {
    if (deleting) return
    selected = entry
    get('.gb-delete').hidden = !canDeletePostcard(entry.id)
    get('.gb-delete-confirm').hidden = true
    get('.gb-delete-status').textContent = ''
    get('.gb-read-art').innerHTML = postcardArtwork(entry.paper, true)
    get('.gb-read-paper').className = `gb-read-paper gb-paper-${entry.paper}`
    get('.gb-read-message').textContent = entry.message
    get('#gb-read-name').textContent = `From, ${entry.name}`
    get<HTMLTimeElement>('.gb-read time').dateTime = entry.created_at
    get('.gb-read time').textContent = dateLabel(entry.created_at)
    read.showModal()
  }

  const render = () => {
    grid.replaceChildren()
    const directory = get('.gb-directory')
    directory.replaceChildren()
    for (let index = 0; index < DRAWER_SIZE; index++) {
      const entry = entries[index]
      const cell = document.createElement('div')
      cell.className = 'gb-cell'
      const number = document.createElement('span')
      number.className = 'gb-cell-number'
      number.textContent = String(page * DRAWER_SIZE + index + 1).padStart(2, '0')
      cell.append(number)
      if (entry) {
        const card = document.createElement('button')
        card.type = 'button'
        card.className = `gb-postcard gb-paper-${entry.paper}${entry.id === newPostcardId ? ' is-new' : ''}`
        card.style.setProperty('--card-turn', `${[-5, 3, -2, 5, -3][index % 5]}deg`)
        card.setAttribute('aria-label', `Read a postcard from ${entry.name}`)
        card.innerHTML = `<span class="gb-card-art">${postcardArtwork(entry.paper)}</span><span class="gb-card-name"></span>`
        card.querySelector('.gb-card-name')!.textContent = entry.name
        card.addEventListener('click', () => openPostcard(entry))
        cell.append(card)
        const item = document.createElement('button')
        item.type = 'button'
        item.textContent = `${number.textContent} — ${entry.name}`
        item.addEventListener('click', () => openPostcard(entry))
        directory.append(item)
      } else if (index === entries.length) {
        const invite = document.createElement('button')
        invite.type = 'button'
        invite.className = 'gb-empty-invite'
        invite.innerHTML = `${guestbookMouse}<em>Your hello<br>belongs here.</em><span>Leave a note +</span>`
        invite.addEventListener('click', openCompose)
        cell.append(invite)
      }
      grid.append(cell)
    }
    const n = String(page + 1).padStart(2, '0')
    get('.gb-drawer-label').textContent = `Drawer ${n}`
    get('.gb-brass-label').textContent = `No. ${n}`
    get('.gb-page').textContent = n
    prev.disabled = page === 0
    next.disabled = !hasNext
    newPostcardId = null
  }

  const load = async (target = page) => {
    controller?.abort()
    controller = new AbortController()
    const id = ++requestId
    status.textContent = 'Opening the drawer…'
    grid.setAttribute('aria-busy', 'true')
    prev.disabled = next.disabled = refresh.disabled = true
    try {
      const result = await loadPostcards(target, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]))
      if (id !== requestId || !opened) return
      if (target > 0 && result.entries.length === 0) { await load(target - 1); return }
      page = target
      entries = result.entries
      hasNext = result.hasNext
      render()
      status.textContent = entries.length ? 'Pick a postcard to read its story.' : 'An empty drawer, waiting for the first hello.'
    } catch (error) {
      if (id !== requestId || !opened || controller.signal.aborted) return
      status.textContent = error instanceof Error ? error.message : 'We could not open the drawer. Please try again.'
    } finally {
      if (id === requestId) {
        grid.removeAttribute('aria-busy')
        prev.disabled = page === 0
        next.disabled = !hasNext
        refresh.disabled = false
      }
    }
  }

  get('.gb-back').addEventListener('click', onBack)
  get('.gb-write').addEventListener('click', openCompose)
  refresh.addEventListener('click', () => void load())
  prev.addEventListener('click', () => void load(page - 1))
  next.addEventListener('click', () => void load(page + 1))
  get('.gb-delete').addEventListener('click', () => {
    get('.gb-delete-confirm').hidden = false
    get('.gb-delete').hidden = true
    get('.gb-delete-cancel').focus()
  })
  get('.gb-delete-cancel').addEventListener('click', () => {
    get('.gb-delete-confirm').hidden = true
    get('.gb-delete').hidden = false
    get('.gb-delete').focus()
  })
  get('.gb-delete-yes').addEventListener('click', async () => {
    if (!selected || deleting) return
    const id = selected.id
    deleting = true
    read.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = true })
    get('.gb-delete-status').textContent = 'Removing your postcard…'
    try {
      await deletePostcard(id)
      read.close()
      if (opened) { await load(); status.textContent = `Postcard deleted. ${status.textContent}` }
    } catch (error) {
      get('.gb-delete-status').textContent = error instanceof Error ? error.message : 'Could not delete your postcard. Please try again.'
    } finally {
      deleting = false
      read.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = false })
    }
  })
  message.addEventListener('input', () => { get('.gb-counter').textContent = `${message.value.length} / 500` })
  const updatePrintPreview = () => {
    const paper = Number(new FormData(form).get('paper'))
    get('.gb-selected-print span').innerHTML = postcardArtwork(paper, true)
    get('.gb-selected-print figcaption').textContent = `${String(paper + 1).padStart(2, '0')} / ${papers[paper]}`
  }
  form.querySelectorAll<HTMLInputElement>('[name=paper]').forEach(input => input.addEventListener('change', updatePrintPreview))
  for (const dialog of [compose, read]) {
    dialog.querySelector('button')!.addEventListener('click', () => dialog.close())
    dialog.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.stopPropagation(); if (dialog === read && deleting) event.preventDefault() } })
    dialog.addEventListener('click', (event) => { if (event.target === dialog && !(dialog === read && deleting)) { const box = dialog.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close() } })
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (saving) return
    const notice = get('.gb-form-status')
    const author = name.value.trim()
    const text = message.value.trim()
    if (!author || !text) { notice.textContent = 'Please add your name and a message.'; return }
    const paper = Number(new FormData(form).get('paper'))
    if (!pending || pending.name !== author || pending.message !== text || pending.paper !== paper) pending = { id: crypto.randomUUID(), name: author, message: text, paper }
    saving = true
    submit.disabled = true
    name.readOnly = message.readOnly = true
    submit.textContent = 'Keeping your postcard…'
    notice.textContent = ''
    try {
      const saved = await savePostcard(pending)
      newPostcardId = saved.id
      pending = null
      form.reset()
      updatePrintPreview()
      get('.gb-counter').textContent = '0 / 500'
      compose.close()
      if (opened) { await load(0); status.textContent = `Your postcard is safely kept. ${status.textContent}` }
    } catch (error) {
      notice.textContent = error instanceof Error ? error.message : 'We could not save your postcard. Please try again.'
      notice.scrollIntoView({ block: 'nearest' })
    } finally {
      saving = false
      submit.disabled = false
      name.readOnly = message.readOnly = false
      submit.textContent = 'Send a postcard ↗'
    }
  })

  render()
  return {
    open() { opened = true; screen.hidden = false; get('.gb-back').focus(); void load() },
    close() { opened = false; controller?.abort(); requestId++; compose.close(); read.close(); screen.hidden = true },
  }
}
