import { requestCamera, trackEvent } from './analytics'
import { createPlanetWorld } from './planet-world'
import type {PlanetMode} from './planet-world'
import './planet-resident.css'
import './planet-sky.css'
import './planet-retro-ui.css'
import './planet-night-ui.css'
import './planet-capsule-ui.css'
import './planet-neon.css'
import './planet-shared-ui.css'
import './planet-ui-palette.css'
import { buildResident, prepareResidentModels } from './planet-resident'
import { createPlanetDialogue } from './planet-dialogue'
import { createPlanetArrival } from './planet-arrival'

const spots = [
  { id: 'home', name: 'ORANGE HOUSE', subtitle: 'Your little orange home', lat: .26, lon: -.22, color: '#ff8b22' },
  { id: 'market', name: 'MARMALADE MARKET', subtitle: 'Fresh news from the neighborhood', lat: .08, lon: .78, color: '#ffb429' },
  { id: 'park', name: 'CLOUD PARK', subtitle: 'Cloud slides and quiet moments', lat: .54, lon: 1.36, color: '#ed931e' },
  { id: 'signal', name: 'ORBIT SIGNAL', subtitle: 'Watching the planet, day and night', lat: -.36, lon: -.86, color: '#f47b16' },
  { id: 'dock', name: 'BLUE PORT', subtitle: 'Where new friends arrive', lat: -.13, lon: -1.74, color: '#de6a12' },
]

export const createParangePlanetExperience = () => {
  const screen = document.createElement('section')
  screen.className = 'planet-screen planet-sky-game'
  screen.lang = 'en'
  screen.setAttribute('aria-hidden', 'true')
  screen.innerHTML = `
    <div class="planet-sky" aria-hidden="true"></div>
    <canvas class="planet-canvas" aria-label="PARANGE PLANET 3D village"></canvas>
    <div class="planet-grain" aria-hidden="true"></div>
    <header class="planet-header">
      <a class="planet-brand" href="#e" aria-label="PARANGE PLANET — return to globe view"><span class="planet-brand-words" aria-hidden="true"><span class="planet-logo-row">${[...'PARANGE'].map(letter => `<span>${letter}</span>`).join('')}</span><span class="planet-logo-row">${[...'PLANET'].map(letter => `<span>${letter}</span>`).join('')}</span><small>YOUR LITTLE HAPPY PLACE</small></span></a>
      <button class="planet-close" type="button" aria-label="Return to the dice">×</button>
    </header>
    <aside class="planet-guide" aria-label="Planet controls"><p><span><b>↔</b> Drag to orbit</span><span><b>↕</b> Scroll to zoom</span><span><b>◎</b> Click a neighbor to follow</span><span><b>✋</b> Hold and drag to move</span></p></aside>
    <section class="planet-spot-card" aria-live="polite"><span class="planet-card-index">★ WELCOME TO WORLD 01</span><h2>LET’S<br>LIVE A<br><em>LITTLE!</em></h2><p>A small world. A grand adventure.<br>Make yourself at home!</p><span class="planet-spot-sticker" aria-hidden="true">COME ON IN! ↗</span></section>
    <section class="planet-resident-card"><div class="planet-resident-avatar"><span class="planet-resident-empty">★</span><img alt="Your newest neighbor"></div><div><span class="planet-card-index">HELLO, NEIGHBOR!</span><p class="planet-resident-name">Be our first neighbor!</p><small>Meet your own little character.</small></div></section>
    <button class="planet-join-primary" type="button"><span class="planet-join-icon" aria-hidden="true">＋</span><span class="planet-join-label"><small>LET’S PLAY!</small>MOVE IN</span><span class="planet-join-arrow" aria-hidden="true">▶</span></button>
    <div class="planet-mode-tabs" role="tablist" aria-label="Walk editions"><button class="planet-mode-tab" role="tab" type="button" data-mode="day" aria-selected="true" tabindex="0"><i aria-hidden="true">☼</i><span>Sunlight Walk</span></button><button class="planet-mode-tab planet-day-toggle" role="tab" type="button" data-mode="night" aria-selected="false" tabindex="-1"><i aria-hidden="true">☾</i><span>Moonlight Walk</span></button><button class="planet-mode-tab" role="tab" type="button" data-mode="neon" aria-selected="false" tabindex="-1"><i aria-hidden="true">✳</i><span>Neon Walk</span><small>3D</small></button></div>
    <button class="planet-meeting" type="button" aria-pressed="false" disabled><small>NEIGHBORHOOD TIME</small><span>NEIGHBOR MEETING</span></button>
    <div class="planet-follow-status" hidden><strong></strong><span></span><button type="button">GLOBE VIEW</button></div>
    <div class="planet-toast" role="status"></div>
    <section class="planet-studio" role="dialog" aria-modal="true" aria-label="Meet your new neighbor" aria-hidden="true" inert>
      <div class="planet-studio-heading"><span class="planet-card-index">★ PARANGE PLANET · NEW PLAYER</span><h2>READY, SET…<br><em>MOVE IN!</em></h2><p>A little face. A brand-new friend. A big adventure!</p></div>
      <button class="planet-studio-close" type="button" aria-label="Cancel move-in">×</button>
      <div class="planet-studio-console">
      <div class="planet-studio-panels">
        <section class="planet-studio-camera"><header><span>01 · LOOK HERE & SMILE!</span><b><i></i> FACE CHECK</b></header>
          <div class="planet-camera-viewport"><video class="planet-camera" autoplay muted playsinline></video><img class="planet-captured" alt="Your camera snapshot" hidden><div class="planet-camera-frame" aria-hidden="true"></div><div class="planet-camera-empty"><span>◎</span><p>Connecting your camera…</p><button class="planet-camera-retry" type="button" hidden>TRY CAMERA AGAIN</button></div><output class="planet-countdown" aria-live="polite" hidden>5</output><div class="planet-camera-flash"></div></div>
          <footer>Keep your face in the frame. Press READY when you want to start.</footer>
        </section>
      </div>
      <div class="planet-name-entry"><div class="planet-player-stickers" aria-hidden="true"><span>16<br><small>LITTLE FRIENDS</small></span><b>far out!</b><i>★</i></div><p class="planet-player-step">02 / PLAYER CARD</p><label for="planet-neighbor-name">WHAT’S YOUR NAME? <small>OPTIONAL · UP TO 24 CHARACTERS</small></label><div class="planet-name-controls"><input id="planet-neighbor-name" class="planet-neighbor-name" type="text" maxlength="48" autocomplete="off" placeholder="Your little friend's name" aria-describedby="planet-name-help"><button class="planet-camera-start" type="button" disabled>READY · TAKE PHOTO ▶</button></div><small id="planet-name-help">Leave blank for an automatic name. Names are saved only in this browser.</small><p class="planet-player-note"><span aria-hidden="true">✦</span> One snapshot. One surprise neighbor.</p></div>
      </div>
      <div class="planet-studio-status" role="status"><span class="planet-status-dot"></span><p>16 little neighbors. One new adventure.</p><button class="planet-studio-retry" type="button" hidden>TAKE ANOTHER SNAPSHOT</button></div>
      <p class="planet-studio-privacy">Your photo stays in this browser. It is only used to detect your face, never saved on your character.</p>
      <div class="planet-building" hidden><div class="planet-building-orbit"><span>✦</span></div><h3>A LITTLE FRIEND<br>IS ON THE WAY!</h3><p role="status">Getting ready to say hello…</p></div>
    </section>
  `
  document.body.append(screen)
  const $ = <T extends Element>(selector: string) => screen.querySelector<T>(selector)!
  const canvas = $<HTMLCanvasElement>('.planet-canvas')
  const closeButton = $<HTMLButtonElement>('.planet-close')
  const join = $<HTMLButtonElement>('.planet-join-primary')
  const studio = $<HTMLElement>('.planet-studio')
  const studioClose = $<HTMLButtonElement>('.planet-studio-close')
  const video = $<HTMLVideoElement>('.planet-camera')
  const cameraEmpty = $<HTMLElement>('.planet-camera-empty')
  const cameraRetry = $<HTMLButtonElement>('.planet-camera-retry')
  const captured = $<HTMLImageElement>('.planet-captured')
  const countdown = $<HTMLOutputElement>('.planet-countdown')
  const status = $<HTMLElement>('.planet-studio-status p')
  const retry = $<HTMLButtonElement>('.planet-studio-retry')
  const building = $<HTMLElement>('.planet-building')
  const arrivalUI = createPlanetArrival(screen)
  const nameInput=$<HTMLInputElement>('.planet-neighbor-name'),captureStart=$<HTMLButtonElement>('.planet-camera-start')
  let open = false, session = 0
  let state: 'idle' | 'editing' | 'countdown' | 'building' | 'arriving' = 'idle'
  let stream: MediaStream | null = null
  let timer = 0, toastTimer = 0
  let abort: AbortController | null = null
  let world: ReturnType<typeof createPlanetWorld> | null = null
  const dialogue=createPlanetDialogue(screen,()=>world?.reset())
  let lastExpelled=''
  let cameraConnecting = false

  const say = (text: string) => { status.textContent = text }
  const notify = (text: string) => {
    const toast = $<HTMLElement>('.planet-toast'); toast.textContent = text; toast.classList.add('is-visible')
    clearTimeout(toastTimer); toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 3600)
  }
  const stopCamera = () => {
    stream?.getTracks().forEach(track => track.stop()); stream = null; video.srcObject = null; cameraConnecting = false
    captureStart.disabled=true
  }
  const cancelCountdown = () => { clearInterval(timer); timer = 0; countdown.hidden = true }
  const setStudioVisible = (visible: boolean) => {
    studio.classList.toggle('is-open', visible); studio.setAttribute('aria-hidden', String(!visible)); studio.inert = !visible
    world?.setCovered(visible)
  }
  const resetControls = () => { retry.hidden = true; building.hidden = true; studio.classList.remove('is-building'); captured.hidden = true;nameInput.disabled=false;captureStart.disabled=true }
  const cancel = () => {
    if (state !== 'idle') trackEvent('planet_join', { page_id: 'parange_planet', status: 'cancelled' })
    session++; abort?.abort(); abort = null; cancelCountdown(); stopCamera(); world?.cancelArrival()
    state = 'idle'; setStudioVisible(false); resetControls(); arrivalUI.hide()
    screen.classList.remove('is-presenting', 'is-joining'); join.disabled = false; world?.setInteractionEnabled(true)
    dialogue.setResident(null)
    if (open) join.focus()
  }

  const processPhoto = async () => {
    if (state !== 'countdown' || !stream || !video.videoWidth) return
    trackEvent('planet_join', { page_id: 'parange_planet', status: 'building' })
    const currentSession = session
    state = 'building'; cancelCountdown(); building.hidden = false; studio.classList.add('is-building')
    abort?.abort(); abort = new AbortController()
    const photo = document.createElement('canvas'), factor = Math.min(1, 960 / video.videoWidth)
    photo.width = Math.round(video.videoWidth * factor); photo.height = Math.round(video.videoHeight * factor)
    const ctx = photo.getContext('2d')!
    // Match the mirrored camera preview exactly; face recognition sees this same image.
    ctx.translate(photo.width, 0); ctx.scale(-1, 1); ctx.drawImage(video, 0, 0, photo.width, photo.height)
    captured.src = photo.toDataURL('image/jpeg', .92); captured.hidden = false
    stopCamera()
    try {
      const existingDesigns=world!.village.residents.map(({model})=>model.designIndex)
      const model = await buildResident(photo, text => { if (currentSession === session) { say(text); building.querySelector('p')!.textContent = text } }, abort.signal,nameInput.value,existingDesigns)
      if (currentSession !== session || !open) { model.dispose(); return }
      world!.prepareResident(model)
      state = 'arriving'; arrivalUI.show(model)
      // Keep the opaque loading screen until the renderer replaces the last
      // globe frame. A timer/DOM update alone cannot guarantee that handoff.
      const presenting=world!.presentResident(model, arrivalUI.fly, () => {
        if (currentSession !== session) return
        state = 'idle'; arrivalUI.hide(); screen.classList.remove('is-joining'); join.disabled = false
        trackEvent('planet_join', { page_id: 'parange_planet', status: 'success' })
        notify(`${model.name} has moved in! Click to follow. Hold to pick up.`); join.focus()
      }, arrivalUI.getFrame,arrivalUI.update,()=>{
        if(currentSession!==session||!open)return
        setStudioVisible(false);building.hidden=true;studio.classList.remove('is-building')
        closeButton.focus({preventScroll:true})
      })
      if(!presenting)throw new Error('Your neighbor could not move in. Please try another snapshot.')
    } catch (error) {
      if (currentSession !== session || abort?.signal.aborted) return
      trackEvent('planet_join', { page_id: 'parange_planet', status: 'failed' })
      setStudioVisible(true);arrivalUI.hide();world?.cancelArrival();world?.setInteractionEnabled(false)
      state = 'editing'; building.hidden = true; studio.classList.remove('is-building'); retry.hidden = false;nameInput.disabled=false
      say(error instanceof Error ? error.message : 'Something went wrong. Please try again.')
    }
  }

  const startCountdown = () => {
    if (state !== 'editing' || !stream || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
    nameInput.disabled=true;captureStart.disabled=true
    // Keep keyboard focus inside the dialog when the capture controls disable.
    studioClose.focus({preventScroll:true})
    state = 'countdown'; const deadline = performance.now() + 5000; let seconds = 5; countdown.hidden = false; countdown.value = '5'; captured.hidden = true; retry.hidden = true
    say('Look at the camera! Your snapshot is coming in 5 seconds.')
    timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - performance.now()) / 1000))
      if (remaining === seconds) return
      seconds = remaining
      if (seconds <= 0) { void processPhoto(); return }
      countdown.value = String(seconds); say(`Say hello in ${seconds}…`)
    }, 100)
  }

  const startCamera = async () => {
    if (cameraConnecting || stream || !open || state === 'idle') return
    const currentSession = session; cameraConnecting = true; cameraRetry.hidden = true; cameraEmpty.hidden = false
    cameraEmpty.querySelector('p')!.textContent = 'Connecting your camera…'
    try {
      const nextStream = await requestCamera({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } }, audio: false })
      if (currentSession !== session) { nextStream.getTracks().forEach(track => track.stop()); return }
      stream = nextStream; video.srcObject = stream; await video.play()
      if (currentSession !== session) return
      cameraConnecting = false; cameraEmpty.hidden = true; captured.hidden = true
      const ready=()=>{if(currentSession===session&&state==='editing'){captureStart.disabled=false;trackEvent('camera_ready',{page_id:'parange_planet'});say('Choose a name, then press READY. Your snapshot starts after a 5-second countdown.')}}
      if(video.readyState>=HTMLMediaElement.HAVE_CURRENT_DATA)ready()
      else video.addEventListener('loadeddata',ready,{once:true})
    } catch {
      if (currentSession !== session) return
      stopCamera(); cameraRetry.hidden = false; cameraEmpty.querySelector('p')!.textContent = 'Camera permission needed'
      say('Allow camera access, then try again. Press READY when you are ready for your snapshot.')
    }
  }

  join.addEventListener('click', () => {
    if (state !== 'idle') return
    trackEvent('planet_join', { page_id: 'parange_planet', status: 'start' })
    session++; state = 'editing'; join.disabled = true; resetControls();nameInput.value=''; setStudioVisible(true)
    screen.classList.add('is-joining'); world?.setInteractionEnabled(false)
    say('Give your new neighbor a name. Press READY to start your snapshot.'); nameInput.focus()
    void prepareResidentModels().catch(() => { /* The creation step presents retryable model errors. */ })
    void startCamera()
  })
  studioClose.addEventListener('click', cancel)
  cameraRetry.addEventListener('click', () => { void startCamera() })
  captureStart.addEventListener('click',startCountdown)
  nameInput.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing)startCountdown()})
  const limitName=()=>{nameInput.value=Array.from(nameInput.value).slice(0,24).join('')}
  nameInput.addEventListener('input',event=>{if(!(event as InputEvent).isComposing)limitName()})
  nameInput.addEventListener('compositionend',limitName)
  retry.addEventListener('click', () => { state = 'editing';nameInput.disabled=false; retry.hidden = true; captured.hidden = true; void startCamera() })
  studio.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.stopPropagation(); cancel() }
    if (event.key === 'Tab') {
      const buttons = [...studio.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')].filter(el => !el.hidden && el.getClientRects().length)
      const first = buttons[0], last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
  })
  const tabs=[...screen.querySelectorAll<HTMLButtonElement>('.planet-mode-tab')]
  const selectMode=(value:PlanetMode)=>{
    if(!open||state!=='idle')return
    const previousMode = tabs.find(tab => tab.getAttribute('aria-selected') === 'true')?.dataset.mode ?? 'day'
    if (previousMode !== value) trackEvent('planet_mode_change', { page_id: 'parange_planet', mode: value, previous_mode: previousMode })
    world?.setMode(value);screen.classList.toggle('is-night',value==='night');screen.classList.toggle('is-neon',value==='neon')
    screen.classList.toggle('planet-acid-ui',value==='neon')
    tabs.forEach(tab=>{const selected=tab.dataset.mode===value;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1})
    canvas.setAttribute('aria-label',value==='neon'?'PARANGE PLANET Neon Walk illustrated 3D village':'PARANGE PLANET 3D village')
    world?.village.refresh()
  }
  tabs.forEach((tab,index)=>{
    tab.addEventListener('click',()=>selectMode(tab.dataset.mode as PlanetMode))
    tab.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return
      event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3
      tabs[next].focus();selectMode(tabs[next].dataset.mode as PlanetMode)
    })
  })
  $<HTMLAnchorElement>('.planet-brand').addEventListener('click', event => { event.preventDefault(); if (state === 'idle') world?.reset() })
  $<HTMLButtonElement>('.planet-meeting').addEventListener('click',()=>{
    if(state!=='idle')return
    const meeting=world?.toggleMeeting()
    trackEvent('planet_meeting', { page_id: 'parange_planet', action: meeting ? 'start' : 'end' })
    notify(meeting?'MEETING TIME! Everyone, meet at the clearing.':'Meeting over. Time to explore!')
  })
  $<HTMLButtonElement>('.planet-follow-status button').addEventListener('click',()=>world?.reset())
  closeButton.addEventListener('click', () => history.back())
  return {
    open: () => {
      open = true; screen.classList.add('is-open'); screen.setAttribute('aria-hidden', 'false')
      world ??= createPlanetWorld(canvas, spots, id => {
        const spot = spots.find(item => item.id === id); if (!spot) return
        trackEvent('planet_spot_view', { page_id: 'parange_planet', spot_id: spots.indexOf(spot) + 1 })
        $<HTMLElement>('.planet-spot-card').innerHTML = `<span class="planet-card-index">0${spots.indexOf(spot) + 1} / VILLAGE</span><h2>${spot.name.replace(' ', '<br>')}</h2><p>${spot.subtitle}</p>`
      }, village=>{
        const meetingButton=$<HTMLButtonElement>('.planet-meeting')
        meetingButton.disabled=village.count===0;meetingButton.setAttribute('aria-pressed',String(village.meeting))
        meetingButton.querySelector('span')!.textContent=village.meeting?'END MEETING':'NEIGHBOR MEETING'
        const panel=$<HTMLElement>('.planet-follow-status');panel.hidden=!village.following&&!village.holding
        panel.querySelector('strong')!.textContent=village.holding?`GOT YOU, ${village.holding.toUpperCase()}!`:village.following?.toUpperCase()??''
        panel.querySelector('span')!.textContent=village.overSinkhole?'RELEASE HERE TO SAY GOODBYE FOREVER. THIS CANNOT BE UNDONE.':village.holding&&village.sinkhole?'Drop on land to move. Drop into the sinkhole to release forever.':village.holding?'Drag to a new spot. Release to put down.':'Drag to orbit. Click your neighbor again to return.'
        panel.classList.toggle('is-danger',village.overSinkhole)
        screen.classList.toggle('is-following',Boolean(village.following));screen.classList.toggle('is-holding',Boolean(village.holding))
        dialogue.setResident(village.followingId&&village.following?{id:village.followingId,name:village.following}:null)
        if(village.expelled&&lastExpelled!==village.expelled.id){
          lastExpelled=village.expelled.id;dialogue.forget(lastExpelled)
          notify(village.persistent===false?'Neighbor released. Browser storage is unavailable; permanent saving could not be confirmed.':`${village.expelled.name} has left the planet. Goodbye, little neighbor.`)
        }
        const latest=village.latest,avatar=$<HTMLImageElement>('.planet-resident-avatar img')
        // Keep the same authored character, pose and crop in every edition.
        // Neon changes only the image's colour treatment through scoped CSS.
        const portrait=latest?.portrait
        if(portrait){if(avatar.getAttribute('src')!==portrait)avatar.src=portrait}else avatar.removeAttribute('src')
        avatar.classList.toggle('has-photo',Boolean(portrait));$<HTMLElement>('.planet-resident-empty').classList.toggle('is-hidden',Boolean(portrait))
        $<HTMLElement>('.planet-resident-name').textContent=latest?latest.name:'Be our first neighbor!'
        $<HTMLElement>('.planet-resident-card small').textContent=village.count?`${village.count} ${village.count===1?'neighbor is':'neighbors are'} exploring the planet.`:'Meet your own little character.'
      })
      world.open(); closeButton.focus()
    },
    close: () => { open = false; cancel(); world?.close(); screen.classList.remove('is-open'); screen.setAttribute('aria-hidden', 'true') },
    get world(){return world},
  }
}
