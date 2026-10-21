import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const source = await readFile(new URL('../src/bird-impact-motion.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } })
const { createHeadBumpDetector, createBirdFlights, sampleBirdFlight } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
const detector = createHeadBumpDetector()
const sample = (at, size = 100, pitch = .2, centered = true) => detector.sample({ at, size, pitch, centered })
for (let at = 0; at <= 2000; at += 50) assert.equal(sample(at), false, 'Still head does not trigger')
assert.equal(sample(2050, 125), true, 'Quick forward movement releases a flock')
for (let at = 2100; at <= 4000; at += 50) assert.equal(sample(at, 125), false, 'Holding near the camera cannot retrigger')
assert.equal(sample(4050), false, 'Returning to neutral rearms')
assert.equal(sample(4100, 125), true, 'A second distinct head bump triggers')
sample(4150)
assert.equal(sample(4200, 125), false, 'Cooldown prevents duplicate flocks')
for (let at = 4250; at <= 5200; at += 50) sample(at)
assert.equal(sample(5250, 100, .43), true, 'A quick downward nod also triggers')
detector.reset()
for (let at = 0; at <= 1000; at += 50) sample(at)
assert.equal(sample(1050, 130, .2, false), false, 'A cropped/off-center face does not trigger')
assert.equal(sample(3000, 140), false, 'Tracking loss recalibrates instead of triggering on reacquisition')
detector.reset()
for (let at = 0; at <= 1000; at += 50) sample(at)
for (let at = 1050; at <= 5000; at += 50) assert.equal(sample(at, 100 + (at - 1000) * .006), false, 'Slow approach does not trigger')
let seed = 42
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
const flights = createBirdFlights(1000, .5, .35, random)
assert.equal(flights.length, 18)
assert.equal(new Set(flights.map(b => b.color)).size, 6)
for (const bird of flights) {
  assert.equal(sampleBirdFlight(bird, bird.at - 1), null)
  assert.equal(sampleBirdFlight(bird, bird.at + bird.duration), null)
  for (const phase of [0, .1, .4, .8, .999]) {
    const p = sampleBirdFlight(bird, bird.at + bird.duration * phase)
    assert.ok(Object.values(p).every(Number.isFinite))
    if (phase === .999) assert.ok(p.x < -.3 || p.x > 1.3 || p.y < -.3, 'Bird exits the viewport before retirement')
  }
}
console.log('Passed: still/slow head, approach, nod, hold/rearm/cooldown, lost tracking, six palettes, finite trajectories and offscreen exits.')
