// node --experimental-strip-types tools/check-planet-indexing.mjs
// Compare against the previous string-key implementation without a browser/GPU.
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { indexExactGeometry } from '../src/planet-performance.ts'
function previousIndex(geometry) {
  const attributes = Object.entries(geometry.attributes)
  const count = geometry.attributes.position.count
  const bits = attributes.map(([, a]) => new Uint32Array(a.array.buffer, a.array.byteOffset, a.array.length))
  const unique = [], indices = [], lookup = new Map()
  for (let vertex = 0; vertex < count; vertex++) {
    let key = ''
    for (let a = 0; a < attributes.length; a++) {
      const size = attributes[a][1].itemSize
      for (let c = 0; c < size; c++) key += `${bits[a][vertex * size + c]},`
    }
    let index = lookup.get(key)
    if (index === undefined) { index = unique.length; lookup.set(key, index); unique.push(vertex) }
    indices.push(index)
  }
  const stride = attributes.reduce((sum, [, a]) => sum + a.itemSize * 4, 0), indexBytes = unique.length > 65535 ? 4 : 2
  if (unique.length * stride + count * indexBytes >= count * stride) return
  for (const [name, attribute] of attributes) {
    const values = new Float32Array(unique.length * attribute.itemSize), source = attribute.array
    for (let i = 0; i < unique.length; i++) values.set(source.subarray(unique[i] * attribute.itemSize, (unique[i] + 1) * attribute.itemSize), i * attribute.itemSize)
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, attribute.itemSize, attribute.normalized))
  }
  geometry.setIndex(indices)
}
const source = new THREE.TorusGeometry(1, .2, 64, 128).toNonIndexed()
const samples = { previous: [], current: [] }
for (let round = 0; round < 7; round++) {
  const outputs = {}
  for (const [label, index] of round % 2 ? [['current', indexExactGeometry], ['previous', previousIndex]] : [['previous', previousIndex], ['current', indexExactGeometry]]) {
    const geometry = source.clone(), start = performance.now()
    index(geometry)
    if (round) samples[label].push(performance.now() - start)
    outputs[label] = geometry
  }
  assert.deepEqual(outputs.current.index.array, outputs.previous.index.array)
  for (const key of Object.keys(source.attributes)) assert.deepEqual(outputs.current.attributes[key].array, outputs.previous.attributes[key].array)
  Object.values(outputs).forEach(g => g.dispose())
}
source.dispose()
const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]
console.log(JSON.stringify({ vertices: source.attributes.position.count, previousMedianMs: median(samples.previous), currentMedianMs: median(samples.current), identicalBuffers: true }, null, 2))
