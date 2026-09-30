type BlueprintJob = { type: 'render'; id: number; width: number; height: number; pixels: ArrayBuffer; personMask?: ArrayBuffer; detail: number }
type Block = { x: number; y: number; width: number; height: number; depth: number; mean: number; deviation: number }

// tsconfig is shared with the DOM entrypoint, so keep this worker surface
// structural instead of requiring the WebWorker global type library.
const worker: { postMessage: (message: unknown, transfer?: Transferable[]) => void; addEventListener: (type: string, listener: (event: MessageEvent<BlueprintJob>) => void) => void } = self as unknown as { postMessage: (message: unknown, transfer?: Transferable[]) => void; addEventListener: (type: string, listener: (event: MessageEvent<BlueprintJob>) => void) => void }
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value))

const hash = (x: number, y: number) => {
  let value = (x * 374761393 + y * 668265263) >>> 0
  value = (value ^ (value >>> 13)) * 1274126177 >>> 0
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296
}
const lerp = (start: number, end: number, amount: number) => start + (end - start) * amount
const smoothNoise = (x: number, y: number) => {
  const left = Math.floor(x), top = Math.floor(y)
  const horizontal = x - left, vertical = y - top
  const easeX = horizontal * horizontal * (3 - 2 * horizontal)
  const easeY = vertical * vertical * (3 - 2 * vertical)
  return lerp(lerp(hash(left, top), hash(left + 1, top), easeX), lerp(hash(left, top + 1), hash(left + 1, top + 1), easeX), easeY)
}

// A small separable 5-tap Gaussian approximates a 1–2px blur. It removes
// webcam speckle before variance calculation without erasing facial edges.
const blur = (source: Float32Array, width: number, height: number) => {
  const horizontal = new Float32Array(source.length)
  const result = new Float32Array(source.length)
  const weights = [1, 4, 6, 4, 1]
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    let value = 0
    for (let offset = -2; offset <= 2; offset += 1) value += source[y * width + clamp(x + offset, 0, width - 1)] * weights[offset + 2]
    horizontal[y * width + x] = value / 16
  }
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    let value = 0
    for (let offset = -2; offset <= 2; offset += 1) value += horizontal[clamp(y + offset, 0, height - 1) * width + x] * weights[offset + 2]
    result[y * width + x] = value / 16
  }
  return result
}

const render = ({ id, width, height, pixels, personMask, detail }: BlueprintJob) => {
  const rgba = new Uint8ClampedArray(pixels)
  const grayscale = new Float32Array(width * height)
  for (let pixel = 0, index = 0; index < grayscale.length; index += 1, pixel += 4) grayscale[index] = rgba[pixel] * .2126 + rgba[pixel + 1] * .7152 + rgba[pixel + 2] * .0722
  const values = blur(grayscale, width, height)

  // Integral images keep each block's mean and standard deviation O(1), even
  // after the tree becomes dense around faces, hands, and high-contrast edges.
  const stride = width + 1
  const sum = new Float64Array((height + 1) * stride)
  const squares = new Float64Array((height + 1) * stride)
  for (let y = 1; y <= height; y += 1) for (let x = 1; x <= width; x += 1) {
    const value = values[(y - 1) * width + x - 1]
    const index = y * stride + x
    sum[index] = value + sum[index - 1] + sum[index - stride] - sum[index - stride - 1]
    squares[index] = value * value + squares[index - 1] + squares[index - stride] - squares[index - stride - 1]
  }
  const stats = (x: number, y: number, blockWidth: number, blockHeight: number) => {
    const right = x + blockWidth, bottom = y + blockHeight
    const total = sum[bottom * stride + right] - sum[y * stride + right] - sum[bottom * stride + x] + sum[y * stride + x]
    const squareTotal = squares[bottom * stride + right] - squares[y * stride + right] - squares[bottom * stride + x] + squares[y * stride + x]
    const count = blockWidth * blockHeight
    const mean = total / count
    return { mean, deviation: Math.sqrt(Math.max(0, squareTotal / count - mean * mean)) }
  }

  const leaves: Block[] = []
  const sourceMask = personMask ? new Uint8Array(personMask) : null
  const maskIntegral = sourceMask ? new Uint32Array((height + 1) * stride) : null
  if (sourceMask && maskIntegral) for (let y = 1; y <= height; y += 1) for (let x = 1; x <= width; x += 1) {
    const index = y * stride + x
    maskIntegral[index] = (sourceMask[(y - 1) * width + x - 1] > 80 ? 1 : 0) + maskIntegral[index - 1] + maskIntegral[index - stride] - maskIntegral[index - stride - 1]
  }
  const personCoverage = (block: Pick<Block, 'x' | 'y' | 'width' | 'height'>) => {
    if (!maskIntegral) return 0
    const right = block.x + block.width, bottom = block.y + block.height
    return (maskIntegral[bottom * stride + right] - maskIntegral[block.y * stride + right] - maskIntegral[bottom * stride + block.x] + maskIntegral[block.y * stride + block.x]) / (block.width * block.height)
  }
  const fullMaskCoverage = maskIntegral ? maskIntegral[height * stride + width] / (width * height) : 0
  // Treat an empty or nearly full result as an unavailable mask. This occurs
  // on some mobile WebGL backends while the segmentation buffer is warming up.
  const hasUsableSilhouette = fullMaskCoverage > .008 && fullMaskCoverage < .88
  const maxDepth = detail > .7 ? 6 : detail > .28 ? 5 : 4
  const minimumBlock = detail > .65 ? 8 : detail > .25 ? 10 : 12
  const subdivide = (x: number, y: number, blockWidth: number, blockHeight: number, depth: number) => {
    const current = stats(x, y, blockWidth, blockHeight)
    // Finer frames can preserve a little more detail; otherwise calm walls
    // remain as the large, quiet blocks shown in the reference.
    const threshold = 18 + (1 - detail) * 12 + depth * 1.35
    const canSplit = depth < maxDepth && blockWidth > minimumBlock && blockHeight > minimumBlock
    if (canSplit && current.deviation > threshold) {
      const halfWidth = Math.floor(blockWidth / 2), halfHeight = Math.floor(blockHeight / 2)
      if (halfWidth && halfHeight) {
        subdivide(x, y, halfWidth, halfHeight, depth + 1)
        subdivide(x + halfWidth, y, blockWidth - halfWidth, halfHeight, depth + 1)
        subdivide(x, y + halfHeight, halfWidth, blockHeight - halfHeight, depth + 1)
        subdivide(x + halfWidth, y + halfHeight, blockWidth - halfWidth, blockHeight - halfHeight, depth + 1)
        return
      }
    }
    leaves.push({ x, y, width: blockWidth, height: blockHeight, depth, mean: current.mean, deviation: current.deviation })
  }
  subdivide(0, 0, width, height, 0)

  // Keep the background transparent so the live camera stays visible beneath
  // the quadtree tiles. Only a detected person is painted by this worker.
  const output = new Uint8ClampedArray(width * height * 4)
  const paper = [244, 248, 252]
  const blue = [152, 190, 232], sky = [128, 177, 224], cyan = [139, 210, 226], periwinkle = [170, 178, 232]
  const varyBlueTone = (color: number[], variation: number) => [
    clamp(Math.round(color[0] + variation * 15), 0, 255),
    clamp(Math.round(color[1] + variation * 19), 0, 255),
    clamp(Math.round(color[2] + variation * 11), 0, 255),
  ]
  // Analyse the webcam at a bounded raster resolution, then draw the sticker
  // artwork with antialiased vector strokes. This avoids enlarged pixel icons.
  const artboard = new OffscreenCanvas(width, height)
  const art = artboard.getContext('2d')!
  art.putImageData(new ImageData(output, width, height), 0, 0)
  const cssColor = (color: number[]) => `rgb(${color[0]}, ${color[1]}, ${color[2]})`
  const vectorStar = (x: number, y: number, size: number) => {
    const centerX = x + size / 2, centerY = y + size / 2, outer = size * .31, inner = outer * .46
    art.beginPath()
    for (let point = 0; point < 10; point += 1) {
      const radius = point % 2 ? inner : outer, radians = -Math.PI / 2 + point * Math.PI / 5
      if (!point) art.moveTo(centerX + Math.cos(radians) * radius, centerY + Math.sin(radians) * radius)
      else art.lineTo(centerX + Math.cos(radians) * radius, centerY + Math.sin(radians) * radius)
    }
    art.closePath(); art.stroke()
  }
  const vectorLetter = (x: number, y: number, size: number, letter: string) => {
    art.save()
    art.fillStyle = art.strokeStyle
    art.font = `800 ${Math.max(7, size * .58)}px ui-monospace, monospace`
    art.textAlign = 'center'
    art.textBaseline = 'middle'
    art.fillText(letter, x + size / 2, y + size / 2 + size * .025)
    art.restore()
  }
  const vectorClover = (x: number, y: number, size: number) => {
    const centerX = x + size / 2, centerY = y + size / 2, radius = size * .14
    for (const [offsetX, offsetY] of [[0, -radius], [radius, 0], [0, radius], [-radius, 0]]) { art.beginPath(); art.arc(centerX + offsetX, centerY + offsetY, radius, 0, Math.PI * 2); art.stroke() }
  }
  const vectorTile = (x: number, y: number, size: number, variant: number, letter: string, toneVariation: number) => {
    const mode = variant % 12
    const paletteColor = mode <= 6 ? paper : mode <= 8 ? blue : mode === 9 ? sky : mode === 10 ? cyan : periwinkle
    const base = mode <= 6 ? paletteColor : varyBlueTone(paletteColor, toneVariation)
    art.fillStyle = cssColor(base); art.fillRect(x, y, size, size)
    art.strokeStyle = 'rgba(110, 101, 107, .48)'; art.lineWidth = .72
    art.beginPath(); art.moveTo(x, y + .35); art.lineTo(x + size, y + .35); art.moveTo(x + .35, y); art.lineTo(x + .35, y + size); art.stroke()
    art.lineWidth = Math.max(.75, Math.min(1.15, size * .085)); art.lineJoin = 'round'; art.lineCap = 'round'
    if (mode <= 6 || mode === 11) { art.strokeStyle = 'rgb(105, 99, 104)'; vectorStar(x, y, size) }
    else if (mode <= 8) { art.strokeStyle = 'rgb(62, 105, 177)'; vectorLetter(x, y, size, letter) }
    else if (mode === 9) { art.strokeStyle = 'rgb(48, 121, 183)'; vectorLetter(x, y, size, letter) }
    else { art.strokeStyle = 'rgb(48, 145, 170)'; vectorClover(x, y, size) }
  }
  // The silhouette chooses which cells appear, while the cell grid itself has
  // one invariant size and gutter. This prevents clipped quadtree leaves from
  // making neighbouring blocks look unevenly spaced.
  const tileSize = 8
  const tileGap = 1
  const tilePitch = tileSize + tileGap
  const parangeLetters = ['P', 'A', 'R', 'A', 'N', 'G', 'E']
  // Rotate the deterministic layout seed a few times per second. This keeps
  // neighbouring tiles clustered while their internal letter/colour layout
  // actively recomposes during the live effect.
  const phase = Math.floor(id / 3)
  const phaseOffsetX = Math.floor(hash(phase, 173) * 89)
  const phaseOffsetY = Math.floor(hash(phase, 719) * 89)
  const leafAt = (x: number, y: number) => leaves.find((leaf) => x >= leaf.x && x < leaf.x + leaf.width && y >= leaf.y && y < leaf.y + leaf.height)
  const clusteredVariant = (tileX: number, tileY: number) => {
    // Low-frequency noise creates irregular colour neighbourhoods spanning
    // several tiles instead of assigning a different colour to every cell.
    const regionX = Math.floor(tileX / 4), regionY = Math.floor(tileY / 4)
    const noise = smoothNoise(tileX / 4.4, tileY / 4.4)
    const withinRegion = hash(regionX, regionY)
    if (noise < .46) return Math.floor(withinRegion * 7)
    if (noise < .68) return 7 + Math.floor(withinRegion * 2)
    if (noise < .81) return 9
    if (noise < .91) return 10
    return 11
  }
  for (let gridY = 0, y = 0; y < height; gridY += 1, y += tilePitch) for (let gridX = 0, x = 0; x < width; gridX += 1, x += tilePitch) {
    const footprint = { x, y, width: Math.min(tilePitch, width - x), height: Math.min(tilePitch, height - y) }
    const leaf = leafAt(x + footprint.width / 2, y + footprint.height / 2)
    const edgeThreshold = leaf ? .14 - Math.min(leaf.depth, 4) * .008 : .14
    const centerX = clamp(Math.floor(x + footprint.width / 2), 0, width - 1)
    const centerY = clamp(Math.floor(y + footprint.height / 2), 0, height - 1)
    const centerIsSilhouette = sourceMask ? sourceMask[centerY * width + centerX] > 80 : false
    if (!hasUsableSilhouette || (!centerIsSilhouette && personCoverage(footprint) < edgeThreshold)) continue
    const letter = parangeLetters[Math.floor(hash(gridX + 193 + phaseOffsetX, gridY + 431 + phaseOffsetY) * parangeLetters.length)]
    const toneVariation = hash(gridX + phaseOffsetX * 3, gridY + phaseOffsetY * 5) - .5
    vectorTile(x + tileGap / 2, y + tileGap / 2, tileSize, clusteredVariant(gridX + phaseOffsetX, gridY + phaseOffsetY), letter, toneVariation)
  }
  const finalOutput = art.getImageData(0, 0, width, height).data
  worker.postMessage({ type: 'rendered', id, width, height, pixels: finalOutput.buffer }, [finalOutput.buffer])
}

worker.addEventListener('message', (event: MessageEvent<BlueprintJob>) => { if (event.data.type === 'render') render(event.data) })
