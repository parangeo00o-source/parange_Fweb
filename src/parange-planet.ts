import { createPlanetWorld } from './planet-world'
import './planet-resident.css'
import './planet-sky.css'
import './planet-retro-ui.css'
import './planet-night-ui.css'
import './planet-capsule-ui.css'
import { buildResident, prepareResidentModels } from './planet-resident'
import { createPlanetDialogue } from './planet-dialogue'
import { createPlanetArrival } from './planet-arrival'

const spots = [
  { id: 'home', name: 'ORANGE HOUSE', subtitle: '나의 작은 오렌지 집', lat: .26, lon: -.22, color: '#ff8b22' },
  { id: 'market', name: 'MARMALADE MARKET', subtitle: '오늘의 오렌지 소식', lat: .08, lon: .78, color: '#ffb429' },
  { id: 'park', name: 'CLOUD PARK', subtitle: '구름 미끄럼틀과 휴식', lat: .54, lon: 1.36, color: '#ed931e' },
  { id: 'signal', name: 'ORBIT SIGNAL', subtitle: '행성의 낮과 밤을 기록해요', lat: -.36, lon: -.86, color: '#f47b16' },
  { id: 'dock', name: 'BLUE PORT', subtitle: '친구들이 도착하는 부두', lat: -.13, lon: -1.74, color: '#de6a12' },
]

export const createParangePlanetExperience = () => {
  const screen = document.createElement('section')
  screen.className = 'planet-screen planet-sky-game'
  screen.setAttribute('aria-hidden', 'true')
  screen.innerHTML = `
    <div class="planet-sky" aria-hidden="true"></div>
    <canvas class="planet-canvas" aria-label="PARANGE PLANET 3D 마을"></canvas>
    <div class="planet-grain" aria-hidden="true"></div>
    <header class="planet-header">
      <a class="planet-brand" href="#e" aria-label="PARANGE PLANET — 행성 처음 시점으로"><span class="planet-brand-words" aria-hidden="true"><span class="planet-logo-row">${[...'PARANGE'].map(letter => `<span>${letter}</span>`).join('')}</span><span class="planet-logo-row">${[...'PLANET'].map(letter => `<span>${letter}</span>`).join('')}</span><small>YOUR LITTLE HAPPY PLACE</small></span></a>
      <p class="planet-coordinates">Little planet. Big adventure.<br><b>구름 너머, 우리만의 작은 세상!</b></p>
      <button class="planet-close" type="button" aria-label="주사위 화면으로 돌아가기">×</button>
    </header>
    <aside class="planet-guide" aria-label="행성 조작 방법"><p><span><b>↔</b> 드래그해서 빙글빙글</span><span><b>↕</b> 휠로 더 가까이!</span><span><b>◎</b> 캐릭터 클릭: 따라보기</span><span><b>✋</b> 꾹 누르고 드래그: 옮기기</span></p></aside>
    <section class="planet-spot-card" aria-live="polite"><span class="planet-card-index">★ WELCOME TO WORLD 01</span><h2>LET’S<br>LIVE A<br><em>LITTLE!</em></h2><p>작은 행성에서 시작하는 큰 모험.<br>오늘부터, 여기서 함께 놀아요!</p><span class="planet-spot-sticker" aria-hidden="true">COME ON IN! ↗</span></section>
    <section class="planet-resident-card"><div class="planet-resident-avatar"><span class="planet-resident-empty">★</span><img alt="최근 입주자의 사진"></div><div><span class="planet-card-index">HELLO, NEIGHBOR!</span><p class="planet-resident-name">첫 번째 이웃이 되어 줘!</p><small>나만의 캐릭터로 놀러 오세요.</small></div></section>
    <button class="planet-join-primary" type="button"><span class="planet-join-icon" aria-hidden="true">＋</span><span class="planet-join-label"><small>LET’S PLAY!</small>입주하기</span><span class="planet-join-arrow" aria-hidden="true">▶</span></button>
    <button class="planet-day-toggle" type="button" aria-label="밤하늘로 바꾸기" aria-pressed="false"><i>☼</i><span>햇살 산책</span></button>
    <button class="planet-meeting" type="button" aria-pressed="false" disabled><small>NEIGHBORHOOD TIME</small><span>주민회의</span></button>
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
  let open = false, night = false, session = 0
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
    session++; abort?.abort(); abort = null; cancelCountdown(); stopCamera(); world?.cancelArrival()
    state = 'idle'; setStudioVisible(false); resetControls(); arrivalUI.hide()
    screen.classList.remove('is-presenting', 'is-joining'); join.disabled = false; world?.setInteractionEnabled(true)
    dialogue.setResident(null)
    if (open) join.focus()
  }

  const processPhoto = async () => {
    if (state !== 'countdown' || !stream || !video.videoWidth) return
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
        notify(`${model.name} has moved in! Click to follow. Hold to pick up.`); join.focus()
      }, arrivalUI.getFrame,arrivalUI.update,()=>{
        if(currentSession!==session||!open)return
        setStudioVisible(false);building.hidden=true;studio.classList.remove('is-building')
        closeButton.focus({preventScroll:true})
      })
      if(!presenting)throw new Error('Your neighbor could not move in. Please try another snapshot.')
    } catch (error) {
      if (currentSession !== session || abort?.signal.aborted) return
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
      const nextStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } }, audio: false })
      if (currentSession !== session) { nextStream.getTracks().forEach(track => track.stop()); return }
      stream = nextStream; video.srcObject = stream; await video.play()
      if (currentSession !== session) return
      cameraConnecting = false; cameraEmpty.hidden = true; captured.hidden = true
      const ready=()=>{if(currentSession===session&&state==='editing'){captureStart.disabled=false;say('Choose a name, then press READY. Your snapshot starts after a 5-second countdown.')}}
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
  $<HTMLButtonElement>('.planet-day-toggle').addEventListener('click', event => {
    night = !night; world?.setNight(night); screen.classList.toggle('is-night', night)
    const button = event.currentTarget as HTMLButtonElement; button.setAttribute('aria-pressed', String(night)); button.setAttribute('aria-label', night ? '낮하늘로 바꾸기' : '밤하늘로 바꾸기'); button.innerHTML = night ? '<i>☾</i><span>달빛 산책</span>' : '<i>☼</i><span>햇살 산책</span>'
  })
  $<HTMLAnchorElement>('.planet-brand').addEventListener('click', event => { event.preventDefault(); if (state === 'idle') world?.reset() })
  $<HTMLButtonElement>('.planet-meeting').addEventListener('click',()=>{
    if(state!=='idle')return
    const meeting=world?.toggleMeeting()
    notify(meeting?'MEETING TIME! Everyone, meet at the clearing.':'Meeting over. Time to explore!')
  })
  $<HTMLButtonElement>('.planet-follow-status button').addEventListener('click',()=>world?.reset())
  closeButton.addEventListener('click', () => history.back())
  return {
    open: () => {
      open = true; screen.classList.add('is-open'); screen.setAttribute('aria-hidden', 'false')
      world ??= createPlanetWorld(canvas, spots, id => {
        const spot = spots.find(item => item.id === id); if (!spot) return
        $<HTMLElement>('.planet-spot-card').innerHTML = `<span class="planet-card-index">0${spots.indexOf(spot) + 1} / VILLAGE</span><h2>${spot.name.replace(' ', '<br>')}</h2><p>${spot.subtitle}</p>`
      }, village=>{
        const meetingButton=$<HTMLButtonElement>('.planet-meeting')
        meetingButton.disabled=village.count===0;meetingButton.setAttribute('aria-pressed',String(village.meeting))
        meetingButton.querySelector('span')!.textContent=village.meeting?'회의 마치기':'주민회의'
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
        if(latest?.portrait)avatar.src=latest.portrait;else avatar.removeAttribute('src')
        avatar.classList.toggle('has-photo',Boolean(latest?.portrait));$<HTMLElement>('.planet-resident-empty').classList.toggle('is-hidden',Boolean(latest?.portrait))
        $<HTMLElement>('.planet-resident-name').textContent=latest?latest.name:'첫 번째 이웃이 되어 줘!'
        $<HTMLElement>('.planet-resident-card small').textContent=village.count?`${village.count} ${village.count===1?'neighbor is':'neighbors are'} exploring the planet.`:'나만의 캐릭터로 놀러 오세요.'
      })
      world.open(); closeButton.focus()
    },
    close: () => { open = false; cancel(); world?.close(); screen.classList.remove('is-open'); screen.setAttribute('aria-hidden', 'true') },
    get world(){return world},
  }
}
