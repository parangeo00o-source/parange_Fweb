// Production-only GA4 bootstrap. History-based page views are handled by the
// web stream's Enhanced Measurement setting, not a second manual page_view.
// https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications
const MEASUREMENT_ID = 'G-PPPHDDBFC3'

const pages: Record<string, string> = {
  Home: 'home', Archive: 'archive', Guestbook: 'guestbook', Lemonade: 'lemonade',
  'PARANGE PLANET': 'parange_planet', WaterTouch: 'water_touch', Balloon: 'balloon',
  'Glass Bird': 'glass_bird', Bluefish: 'bluefish', 'Elephant Drawing': 'elephant_drawing',
  '고무 인간': 'rubber_human', Shampoo: 'shampoo', 'Tooth Gem': 'tooth_gem',
  'Heaven vs Hell': 'heaven_vs_hell', About: 'about', Products: 'products', Work: 'work', Contact: 'contact',
}
type EventName = 'page_start' | 'page_ready' | 'page_end' | 'page_pause' | 'page_resume'
  | 'navigation_select' | 'page_load_error' | 'experience_interaction' | 'camera_access' | 'camera_ready'
  | 'photo_capture' | 'recording_start' | 'recording_end' | 'recording_error'
  | 'guestbook_compose' | 'postcard_read' | 'postcard_design_select' | 'postcard_submit'
  | 'postcard_delete' | 'guestbook_load' | 'planet_mode_change' | 'planet_join'
  | 'planet_meeting' | 'planet_spot_view'
type Params = Partial<Record<'page_id' | 'destination' | 'action' | 'status' | 'reason' | 'mode' | 'previous_mode', string>
  & Record<'design_id' | 'spot_id' | 'drawer_number' | 'item_count' | 'duration_ms' | 'visible_time_ms' | 'load_time_ms', number>>
const allowedParams = new Set(['page_id', 'destination', 'action', 'status', 'reason', 'mode', 'previous_mode', 'design_id', 'spot_id', 'drawer_number', 'item_count', 'duration_ms', 'visible_time_ms', 'load_time_ms'])
type Visit = { page: string; started: number; visibleSince: number | null; visible: number; ready: boolean; interacted: boolean }
let visit: Visit | null = null
let restorePage: string | null = null
export const pageId = (label: string) => pages[label] ?? 'other'
export const analyticsContext = () => ({ page_id: visit?.page ?? 'home' })

// No DOM text, user input, photos, resident/postcard IDs, URLs or raw errors.
// Instrumentation is fail-open and does not await the network or touch storage.
export function trackEvent(name: EventName, params: Params = {}) {
  if (!import.meta.env.PROD) return
  try {
    const safe: Record<string, string | number> = { ...analyticsContext() }
    for (const [key, value] of Object.entries(params)) {
      if (!allowedParams.has(key)) continue
      if (typeof value === 'number' && Number.isFinite(value)) safe[key] = Math.max(0, Math.round(value))
      else if (typeof value === 'string' && /^[a-z0-9_]{1,64}$/.test(value)) safe[key] = value
    }
    window.gtag?.('event', name, safe)
  } catch { /* Analytics must never break an experience, even if blocked. */ }
}
const visibleTime = (now: number) => visit ? visit.visible + (visit.visibleSince === null ? 0 : now - visit.visibleSince) : 0
function endPage(reason: string) {
  if (!visit) return
  const now = performance.now()
  trackEvent('page_end', { reason, duration_ms: now - visit.started, visible_time_ms: visibleTime(now) })
  visit = null
}
export function startPage(label: string, reason = 'navigation') {
  const page = pageId(label)
  if (visit?.page === page) return
  endPage(reason)
  const now = performance.now()
  visit = { page, started: now, visibleSince: document.hidden ? null : now, visible: 0, ready: false, interacted: false }
  trackEvent('page_start', { reason })
}
export function pageReady(label: string, status = 'success') {
  if (!visit || visit.page !== pageId(label) || visit.ready) return
  visit.ready = true
  trackEvent('page_ready', { status, load_time_ms: performance.now() - visit.started })
}

// Capture the originating page before permissions resolve; never inspect tracks.
export async function requestCamera(constraints: MediaStreamConstraints) {
  const context = analyticsContext()
  trackEvent('camera_access', { ...context, status: 'requested' })
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    trackEvent('camera_access', { ...context, status: 'granted' })
    return stream
  } catch (error) {
    const reason = error instanceof DOMException && error.name === 'NotAllowedError' ? 'not_allowed' : 'unavailable'
    trackEvent('camera_access', { ...context, status: 'failed', reason })
    throw error
  }
}

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

if (import.meta.env.PROD) {
  window.dataLayer ??= []
  window.gtag ??= function (..._args: unknown[]) {
    // gtag.js expects queued commands in the standard Arguments format.
    window.dataLayer!.push(arguments)
  }
  window.gtag('js', new Date())
  window.gtag('config', MEASUREMENT_ID)

  const tag = document.createElement('script')
  tag.async = true
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`
  document.head.append(tag)
  // Never await analytics or couple its availability to navigation/rendering.

  document.addEventListener('visibilitychange', () => {
    if (!visit) return
    const now = performance.now()
    if (document.hidden && visit.visibleSince !== null) {
      visit.visible += now - visit.visibleSince
      visit.visibleSince = null
      trackEvent('page_pause', { reason: 'hidden', visible_time_ms: visit.visible })
    } else if (!document.hidden && visit.visibleSince === null) {
      visit.visibleSince = now
      trackEvent('page_resume', { reason: 'visible' })
    }
  })
  window.addEventListener('pagehide', () => {
    if (visit) restorePage = Object.keys(pages).find(label => pages[label] === visit!.page) ?? null
    endPage('pagehide')
  })
  window.addEventListener('pageshow', event => {
    if (event.persisted && restorePage) { startPage(restorePage, 'bfcache'); pageReady(restorePage); restorePage = null }
  })
  // One first-interaction event per visit, never per frame / drag / mousemove.
  const firstInteraction = (event: Event) => {
    if (!event.isTrusted || !visit || visit.page === 'home' || !visit.ready || visit.interacted) return
    const target = event.target
    if (!(target instanceof Element) || target.closest('.stage, .gb-back, [class$="-close"]')) return
    visit.interacted = true
    trackEvent('experience_interaction', { action: 'first_interaction' })
  }
  document.addEventListener('pointerdown', firstInteraction, { passive: true })
  document.addEventListener('click', firstInteraction, { passive: true })
}
