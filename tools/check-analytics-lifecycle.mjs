// Deterministic lifecycle checks: no network, real GA visits or user data.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/analytics.ts', import.meta.url), 'utf8')
function fixture(production = true) {
  let now = 0
  const listeners = new Map()
  const listen = prefix => (name, fn) => {
    const key = prefix + name
    listeners.set(key, [...(listeners.get(key) || []), fn])
  }
  const window = { addEventListener: listen('window:') }
  const document = { hidden: false, addEventListener: listen('document:'), createElement: () => ({}), head: { append() {} } }
  let camera = () => Promise.resolve({ mockStream: true })
  const exports = {}
  const code = ts.transpileModule(source.replaceAll('import.meta.env.PROD', String(production)), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023 } }).outputText
  vm.runInNewContext(code, { exports, window, document, performance: { now: () => now }, navigator: { mediaDevices: { getUserMedia: (...args) => camera(...args) } }, DOMException, Element: class {} })
  return { api: exports, window, document, setTime: value => { now = value }, setCamera: fn => { camera = fn },
    emit: (name, event = {}) => listeners.get(name)?.forEach(fn => fn(event)),
    events: name => JSON.parse(JSON.stringify((window.dataLayer || []).map(c => Array.from(c)).filter(c => c[0] === 'event' && c[1] === name).map(c => c[2]))) }
}
const f = fixture()
f.api.startPage('Home', 'initial')
f.api.startPage('Home', 'initial')
assert.equal(f.events('page_start').length, 1)
f.setTime(1000); f.api.pageReady('Home'); f.api.pageReady('Home')
assert.equal(f.events('page_ready').length, 1)
f.setTime(1500); f.api.startPage('Guestbook')
assert.equal(f.events('page_end')[0].visible_time_ms, 1500)
f.api.pageReady('Home')
assert.equal(f.events('page_ready').length, 1, 'Stale readiness cannot attach to another page')
f.setTime(2000); f.document.hidden = true; f.emit('document:visibilitychange'); f.emit('document:visibilitychange')
assert.equal(f.events('page_pause').length, 1)
f.setTime(9000); f.document.hidden = false; f.emit('document:visibilitychange')
f.setTime(9500); f.api.startPage('Home', 'back')
assert.equal(f.events('page_end')[1].duration_ms, 8000)
assert.equal(f.events('page_end')[1].visible_time_ms, 1000, 'Background time must be excluded')
f.emit('window:pagehide'); f.emit('window:pagehide')
assert.equal(f.events('page_end').length, 3, 'Repeated teardown must not duplicate an end')
// A real BFCache entry emits one pagehide followed by persisted pageshow.
f.api.startPage('Guestbook'); f.emit('window:pagehide'); f.emit('window:pageshow', { persisted: true })
assert.equal(f.events('page_start').at(-1).reason, 'bfcache')
assert.equal(f.events('page_start').at(-1).page_id, 'guestbook')
f.api.trackEvent('postcard_submit', { status: 'success', design_id: 2, message: 'PRIVATE_MESSAGE', author: 'PRIVATE_NAME', reason: 'raw error with spaces', duration_ms: NaN })
const safe = f.events('postcard_submit')[0]
assert.deepEqual(Object.keys(safe).sort(), ['design_id', 'page_id', 'status'])
let grant
const constraints = { video: true, audio: false }
f.setCamera(actual => { assert.equal(actual, constraints); return new Promise(resolve => { grant = resolve }) })
f.api.startPage('Lemonade')
const pending = f.api.requestCamera(constraints)
f.api.startPage('Home')
grant({ mockStream: true }); await pending
assert.equal(f.events('camera_access').at(-1).page_id, 'lemonade', 'Late camera result belongs to its originating page')
f.setCamera(() => Promise.reject(new DOMException('PRIVATE_ERROR_DETAILS', 'NotAllowedError')))
await assert.rejects(f.api.requestCamera(constraints))
assert.equal(f.events('camera_access').at(-1).reason, 'not_allowed')
f.window.gtag = () => { throw new Error('blocked') }
assert.doesNotThrow(() => f.api.startPage('Guestbook'))
const dev = fixture(false)
dev.api.startPage('Home'); dev.api.pageReady('Home'); dev.api.trackEvent('navigation_select', { destination: 'guestbook' })
assert.equal(dev.window.dataLayer, undefined)
console.log('PASS: deduplicated lifecycle, foreground duration, pause/resume, pagehide/BFCache, stale readiness, async camera attribution, privacy allowlist, blocked analytics, no dev events')
