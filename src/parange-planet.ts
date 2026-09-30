import { createPlanetWorld } from './planet-world'
import './planet-resident.css'
import './planet-sky.css'
import { buildResident, prepareResidentModels } from './planet-resident'

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
    <aside class="planet-guide" aria-label="행성 조작 방법"><p><span><b>↔</b> 드래그해서 빙글빙글</span><span><b>↕</b> 휠로 더 가까이!</span></p></aside>
    <section class="planet-spot-card" aria-live="polite"><span class="planet-card-index">★ WELCOME TO WORLD 01</span><h2>LET’S<br>LIVE A<br><em>LITTLE!</em></h2><p>작은 행성에서 시작하는 큰 모험.<br>오늘부터, 여기서 함께 놀아요!</p><span class="planet-spot-sticker" aria-hidden="true">COME ON IN! ↗</span></section>
    <section class="planet-resident-card"><div class="planet-resident-avatar"><span class="planet-resident-empty">★</span><img alt="최근 입주자의 사진"></div><div><span class="planet-card-index">HELLO, NEIGHBOR!</span><p class="planet-resident-name">첫 번째 이웃이 되어 줘!</p><small>나만의 캐릭터로 놀러 오세요.</small></div></section>
    <button class="planet-join-primary" type="button"><span class="planet-join-icon" aria-hidden="true">＋</span><span class="planet-join-label"><small>LET’S PLAY!</small>입주하기</span><span class="planet-join-arrow" aria-hidden="true">▶</span></button>
    <button class="planet-day-toggle" type="button" aria-label="밤하늘로 바꾸기" aria-pressed="false"><i>☼</i><span>햇살 가득</span></button>
    <div class="planet-toast" role="status"></div>
    <section class="planet-studio" role="dialog" aria-modal="true" aria-label="새로운 주민 만들기" aria-hidden="true" inert>
      <div class="planet-studio-heading"><span class="planet-card-index">★ NEW PLAYER!</span><h2>준비됐나요?<br><em>나만의 이웃 만들기!</em></h2><p>좋아하는 모양에 내 모습을 더하면, 입주 준비 끝!</p></div>
      <button class="planet-studio-close" type="button" aria-label="입주 취소">×</button>
      <div class="planet-studio-panels">
        <section class="planet-studio-camera"><header><span>01 · 카메라 보고, 찰칵!</span><b><i></i> CAMERA ON</b></header>
          <div class="planet-camera-viewport"><video class="planet-camera" autoplay muted playsinline></video><img class="planet-captured" alt="5초 후 촬영한 내 모습" hidden><div class="planet-camera-frame" aria-hidden="true"></div><div class="planet-camera-empty"><span>◎</span><p>카메라를 연결하고 있어요</p><button class="planet-camera-retry" type="button" hidden>카메라 다시 연결</button></div><output class="planet-countdown" aria-live="polite" hidden>5</output><div class="planet-camera-flash"></div></div>
          <footer>얼굴과 팔다리가 화면 안에 잘 보이도록 서 주세요.</footer>
        </section>
        <section class="planet-studio-reference"><header><span>02 · 좋아하는 모양 고르기</span><b>CHOOSE YOUR LOOK</b></header>
          <button class="planet-reference-drop" type="button" aria-label="캐릭터로 만들 이미지 선택"><img class="planet-reference-image" alt="캐릭터 형체로 사용할 이미지" hidden><span class="planet-reference-placeholder"><i>＋</i><strong>이번엔 어떤 모습으로 놀까?</strong><span>이미지를 끌어 놓거나, 눌러서 골라 주세요!</span><small>캐릭터 · 동물 · 물건 · 사람 / PNG, JPG, WEBP</small></span><span class="planet-reference-change" hidden>다른 모습 고르기 ↗</span></button>
          <input class="planet-reference-input" type="file" accept="image/*" hidden>
          <footer>형체가 중앙에 있고 배경이 단순한 사진이 좋아요.</footer>
        </section>
      </div>
      <div class="planet-studio-status" role="status"><span class="planet-status-dot"></span><p>이미지를 넣으면 5초 뒤 자동으로 사진을 찍어요.</p><button class="planet-studio-retry" type="button" hidden>다시 촬영하기</button></div>
      <p class="planet-studio-privacy">촬영한 사진은 이 브라우저 안에서만 캐릭터를 만드는 데 사용해요.</p>
      <div class="planet-building" hidden><div class="planet-building-orbit"><span>✦</span></div><h3>작은 이웃이<br>태어나는 중이에요.</h3><p role="status">형체를 알아보고 있어요…</p></div>
    </section>
    <div class="planet-arrival-caption" hidden><span class="planet-card-index">HELLO, NEW NEIGHBOR</span><h2>이 행성의 새로운 나.</h2><p>잠시 후, 작은 마을로 내려가요.</p></div>
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
  const drop = $<HTMLButtonElement>('.planet-reference-drop')
  const fileInput = $<HTMLInputElement>('.planet-reference-input')
  const reference = $<HTMLImageElement>('.planet-reference-image')
  const countdown = $<HTMLOutputElement>('.planet-countdown')
  const status = $<HTMLElement>('.planet-studio-status p')
  const retry = $<HTMLButtonElement>('.planet-studio-retry')
  const building = $<HTMLElement>('.planet-building')
  const arrivalCaption = $<HTMLElement>('.planet-arrival-caption')
  let open = false, night = false, session = 0, uploadId = 0, residents = 0
  let state: 'idle' | 'editing' | 'countdown' | 'building' | 'arriving' = 'idle'
  let stream: MediaStream | null = null
  let timer = 0, toastTimer = 0
  let abort: AbortController | null = null
  let world: ReturnType<typeof createPlanetWorld> | null = null
  let cameraConnecting = false

  const say = (text: string) => { status.textContent = text }
  const notify = (text: string) => {
    const toast = $<HTMLElement>('.planet-toast'); toast.textContent = text; toast.classList.add('is-visible')
    clearTimeout(toastTimer); toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 3600)
  }
  const stopCamera = () => {
    stream?.getTracks().forEach(track => track.stop()); stream = null; video.srcObject = null; cameraConnecting = false
  }
  const cancelCountdown = () => { clearInterval(timer); timer = 0; countdown.hidden = true }
  const setStudioVisible = (visible: boolean) => {
    studio.classList.toggle('is-open', visible); studio.setAttribute('aria-hidden', String(!visible)); studio.inert = !visible
  }
  const resetControls = () => { drop.disabled = false; retry.hidden = true; building.hidden = true; studio.classList.remove('is-building'); captured.hidden = true }
  const cancel = () => {
    session++; uploadId++; abort?.abort(); abort = null; cancelCountdown(); stopCamera(); world?.cancelArrival()
    state = 'idle'; setStudioVisible(false); resetControls(); arrivalCaption.hidden = true
    screen.classList.remove('is-presenting'); join.disabled = false
    if (open) join.focus()
  }

  const processPhoto = async () => {
    if (state !== 'countdown' || !stream || !video.videoWidth) return
    const currentSession = session
    state = 'building'; cancelCountdown(); drop.disabled = true; building.hidden = false; studio.classList.add('is-building')
    abort?.abort(); abort = new AbortController()
    const photo = document.createElement('canvas'), factor = Math.min(1, 960 / video.videoWidth)
    photo.width = Math.round(video.videoWidth * factor); photo.height = Math.round(video.videoHeight * factor)
    const ctx = photo.getContext('2d')!
    // Match the mirrored camera preview exactly; segmentation sees this same image.
    ctx.translate(photo.width, 0); ctx.scale(-1, 1); ctx.drawImage(video, 0, 0, photo.width, photo.height)
    captured.src = photo.toDataURL('image/jpeg', .92); captured.hidden = false
    stopCamera()
    try {
      const model = await buildResident(reference, photo, text => { if (currentSession === session) { say(text); building.querySelector('p')!.textContent = text } }, abort.signal)
      if (currentSession !== session || !open) { model.dispose(); return }
      state = 'arriving'; setStudioVisible(false); building.hidden = true; arrivalCaption.hidden = false
      arrivalCaption.querySelector('h2')!.textContent = '이 행성의 새로운 나.'
      arrivalCaption.querySelector('p')!.textContent = '잠시 후, 작은 마을로 내려가요.'
      screen.classList.add('is-presenting')
      world!.presentResident(model, () => {
        arrivalCaption.querySelector('h2')!.textContent = '우리 마을에 오신 걸 환영해요.'
        arrivalCaption.querySelector('p')!.textContent = '꽃과 물길 사이에서 나만의 산책을 시작해요.'
      }, () => {
        if (currentSession !== session) return
        residents++; state = 'idle'; arrivalCaption.hidden = true; screen.classList.remove('is-presenting'); join.disabled = false
        const avatar = $<HTMLImageElement>('.planet-resident-avatar img'); avatar.src = model.portrait; avatar.classList.add('has-photo')
        $<HTMLElement>('.planet-resident-empty').classList.add('is-hidden')
        $<HTMLElement>('.planet-resident-name').textContent = `${residents}명의 이웃이 살고 있어요`
        $<HTMLElement>('.planet-resident-card small').textContent = '새로운 친구도 함께 초대해 보세요'
        notify('입주 완료! 새로운 이웃이 마을을 산책해요.'); join.focus()
      })
    } catch (error) {
      if (currentSession !== session || abort?.signal.aborted) return
      state = 'editing'; building.hidden = true; studio.classList.remove('is-building'); drop.disabled = false; retry.hidden = false
      say(error instanceof Error ? error.message : '캐릭터를 만들지 못했어요. 다시 시도해 주세요.')
    }
  }

  const startCountdown = () => {
    if (state !== 'editing' || !stream || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || reference.hidden || !reference.naturalWidth) return
    state = 'countdown'; const deadline = performance.now() + 5000; let seconds = 5; countdown.hidden = false; countdown.value = '5'; captured.hidden = true; retry.hidden = true
    say('5초 후 사진을 촬영해요. 카메라를 바라봐 주세요!')
    timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - performance.now()) / 1000))
      if (remaining === seconds) return
      seconds = remaining
      if (seconds <= 0) { void processPhoto(); return }
      countdown.value = String(seconds); say(`${seconds}초 후 사진을 촬영해요. 지금 모습으로 입주해요!`)
    }, 100)
  }

  const startCamera = async () => {
    if (cameraConnecting || stream || !open || state === 'idle') return
    const currentSession = session; cameraConnecting = true; cameraRetry.hidden = true; cameraEmpty.hidden = false
    cameraEmpty.querySelector('p')!.textContent = '카메라를 연결하고 있어요'
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } }, audio: false })
      if (currentSession !== session) { nextStream.getTracks().forEach(track => track.stop()); return }
      stream = nextStream; video.srcObject = stream; await video.play()
      if (currentSession !== session) return
      cameraConnecting = false; cameraEmpty.hidden = true; captured.hidden = true
      video.addEventListener('loadeddata', startCountdown, { once: true })
      startCountdown()
    } catch {
      if (currentSession !== session) return
      stopCamera(); cameraRetry.hidden = false; cameraEmpty.querySelector('p')!.textContent = '카메라 권한이 필요해요'
      say('카메라를 허용한 후 다시 연결해 주세요. 준비되면 5초 촬영을 시작해요.')
    }
  }

  const loadFile = async (file: File) => {
    if (state !== 'editing' && state !== 'countdown') return
    if (!file.type.startsWith('image/')) { say('이미지 파일을 선택해 주세요.'); return }
    if (file.size > 25 * 1024 * 1024) { say('25MB 이하의 이미지를 선택해 주세요.'); return }
    cancelCountdown(); state = 'editing'; const id = ++uploadId, currentSession = session
    const url = URL.createObjectURL(file), image = new Image()
    image.src = url
    try {
      await image.decode()
      if (id !== uploadId || currentSession !== session) return
      reference.src = image.src; await reference.decode()
      if (id !== uploadId || currentSession !== session) return
      reference.hidden = false
      $<HTMLElement>('.planet-reference-placeholder').hidden = true
      $<HTMLElement>('.planet-reference-change').hidden = false
      say(stream ? '이미지를 받았어요. 5초 후 사진을 촬영해요.' : '이미지를 받았어요. 카메라가 준비되면 5초 촬영을 시작해요.')
      startCountdown()
    } catch { if (id === uploadId && currentSession === session) say('이미지를 열 수 없어요. JPG, PNG 또는 WEBP로 다시 선택해 주세요.') }
    finally { URL.revokeObjectURL(url) }
  }

  join.addEventListener('click', () => {
    if (state !== 'idle') return
    session++; state = 'editing'; join.disabled = true; resetControls(); setStudioVisible(true)
    reference.hidden = true; reference.removeAttribute('src')
    $<HTMLElement>('.planet-reference-placeholder').hidden = false; $<HTMLElement>('.planet-reference-change').hidden = true
    say('이미지를 넣으면 5초 뒤 자동으로 사진을 찍어요.'); studioClose.focus()
    void prepareResidentModels().catch(() => { /* The creation step presents retryable model errors. */ })
    void startCamera()
  })
  studioClose.addEventListener('click', cancel)
  cameraRetry.addEventListener('click', () => { void startCamera() })
  retry.addEventListener('click', () => { state = 'editing'; retry.hidden = true; captured.hidden = true; void startCamera() })
  drop.addEventListener('click', () => fileInput.click())
  fileInput.addEventListener('change', () => { const file = fileInput.files?.[0]; fileInput.value = ''; if (file) void loadFile(file) })
  for (const eventName of ['dragenter', 'dragover']) drop.addEventListener(eventName, event => { event.preventDefault(); if (!drop.disabled) drop.classList.add('is-dragging') })
  drop.addEventListener('dragleave', () => drop.classList.remove('is-dragging'))
  drop.addEventListener('drop', event => { event.preventDefault(); drop.classList.remove('is-dragging'); const file = event.dataTransfer?.files[0]; if (file) void loadFile(file) })
  studio.addEventListener('dragover', event => event.preventDefault())
  studio.addEventListener('drop', event => event.preventDefault())
  studio.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.stopPropagation(); cancel() }
    if (event.key === 'Tab') {
      const buttons = [...studio.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].filter(el => !el.hidden && el.getClientRects().length)
      const first = buttons[0], last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
  })
  $<HTMLButtonElement>('.planet-day-toggle').addEventListener('click', event => {
    night = !night; world?.setNight(night); screen.classList.toggle('is-night', night)
    const button = event.currentTarget as HTMLButtonElement; button.setAttribute('aria-pressed', String(night)); button.setAttribute('aria-label', night ? '낮하늘로 바꾸기' : '밤하늘로 바꾸기'); button.innerHTML = night ? '<i>☾</i><span>달빛 산책</span>' : '<i>☼</i><span>햇살 가득</span>'
  })
  $<HTMLAnchorElement>('.planet-brand').addEventListener('click', event => { event.preventDefault(); if (state === 'idle') world?.reset() })
  closeButton.addEventListener('click', () => history.back())
  return {
    open: () => {
      open = true; screen.classList.add('is-open'); screen.setAttribute('aria-hidden', 'false')
      world ??= createPlanetWorld(canvas, spots, id => {
        const spot = spots.find(item => item.id === id); if (!spot) return
        $<HTMLElement>('.planet-spot-card').innerHTML = `<span class="planet-card-index">0${spots.indexOf(spot) + 1} / VILLAGE</span><h2>${spot.name.replace(' ', '<br>')}</h2><p>${spot.subtitle}</p>`
      })
      world.open(); closeButton.focus()
    },
    close: () => { open = false; cancel(); world?.close(); screen.classList.remove('is-open'); screen.setAttribute('aria-hidden', 'true') },
  }
}
