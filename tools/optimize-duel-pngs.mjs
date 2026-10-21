// Lossless packaging only: recompress the existing PNG scanline stream.
// No resampling, color conversion, quantization or metadata removal.
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { deflateSync, inflateSync } from 'node:zlib'

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let bit = 0; bit < 8; bit++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1
  return n >>> 0
})
const crc32 = (bytes) => {
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
const files = [
  'angel-retro-3d-blended-v9',
  'devil-retro-3d-raspberry-v16',
  'cloud-platform-retro-3d-blended-v6',
  'angel-feather-retro-3d-blended-v5',
  'hell-cloud-platform-raspberry-v17',
]
const report = []
for (const name of files) {
  const input = new URL(`../src/assets/angel-devil/${name}.png`, import.meta.url)
  const output = new URL(`../src/assets/angel-devil/${name}.lossless.png`, import.meta.url)
  const source = await readFile(input)
  assert.equal(source.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  const chunks = [], data = []
  for (let offset = 8; offset < source.length;) {
    const length = source.readUInt32BE(offset), end = offset + length + 12
    assert.ok(end <= source.length, 'Truncated PNG chunk')
    const type = source.toString('ascii', offset + 4, offset + 8)
    const chunk = source.subarray(offset, end)
    assert.equal(crc32(chunk.subarray(4, -4)), chunk.readUInt32BE(chunk.length - 4))
    chunks.push({ type, bytes: chunk })
    if (type === 'IDAT') data.push(chunk.subarray(8, -4))
    offset = end
  }
  const originalStream = Buffer.concat(data), scanlines = inflateSync(originalStream)
  const deflated = deflateSync(scanlines, { level: 9 })
  const compressed = deflated.length < originalStream.length ? deflated : originalStream
  assert.ok(inflateSync(compressed).equals(scanlines), 'Lossless scanline verification failed')
  const idat = Buffer.alloc(compressed.length + 12)
  idat.writeUInt32BE(compressed.length)
  idat.write('IDAT', 4, 'ascii')
  compressed.copy(idat, 8)
  idat.writeUInt32BE(crc32(idat.subarray(4, -4)), idat.length - 4)
  const pieces = [source.subarray(0, 8)]
  let inserted = false
  for (const chunk of chunks) {
    if (chunk.type !== 'IDAT') pieces.push(chunk.bytes)
    else if (!inserted) { pieces.push(idat); inserted = true }
  }
  const result = Buffer.concat(pieces)
  await writeFile(output, result)
  report.push({ name, before: source.length, after: result.length, saved: source.length - result.length, identicalScanlines: true })
}
console.log(JSON.stringify(report, null, 2))
