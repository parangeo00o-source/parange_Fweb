export type HeadSample = { at: number; size: number; pitch: number; centered: boolean }

/** A quick approach or downward nod triggers once; returning to neutral rearms.
 * All thresholds use face proportions, so distance/resolution do not change them. */
export const createHeadBumpDetector = () => {
  let baseline = 0, neutralPitch = 0, calibratedAt = 0
  let previous: HeadSample | null = null, armed = false, hitAt = -Infinity
  const reset = () => {
    baseline = 0; neutralPitch = 0; calibratedAt = 0
    previous = null; armed = false; hitAt = -Infinity
  }
  return {
    reset,
    sample(sample: HeadSample) {
      if (!Number.isFinite(sample.size) || sample.size < 8 || !Number.isFinite(sample.pitch)) return false
      if (previous && sample.at - previous.at > 650) reset()
      const last = previous
      previous = sample
      if (!baseline) {
        baseline = sample.size; neutralPitch = sample.pitch; calibratedAt = sample.at
        return false
      }
      if (sample.at - calibratedAt < 600) {
        baseline += (sample.size - baseline) * .15
        neutralPitch += (sample.pitch - neutralPitch) * .15
        return false
      }
      const approach = sample.size / baseline, nod = sample.pitch - neutralPitch
      const neutral = approach < 1.08 && nod < .09
      if (!armed) {
        if (neutral && sample.at - hitAt >= 1000) armed = true
        return false
      }
      const dt = last ? Math.max(16, sample.at - last.at) / 1000 : 1
      const approachSpeed = last ? (sample.size - last.size) / baseline / dt : 0
      const nodSpeed = last ? (sample.pitch - last.pitch) / dt : 0
      if (sample.centered && ((approach > 1.16 && approachSpeed > .65) || (nod > .18 && nodSpeed > .55))) {
        armed = false; hitAt = sample.at
        return true
      }
      // Follow a slowly changing viewing distance without swallowing fast gestures.
      if (Math.abs(approachSpeed) < .18 && Math.abs(nodSpeed) < .2 && neutral) {
        baseline += (sample.size - baseline) * .015
        neutralPitch += (sample.pitch - neutralPitch) * .015
      }
      return false
    },
  }
}

export type BirdFlight = {
  at: number; duration: number; color: number; size: number; flap: number; phase: number
  x0: number; y0: number; x1: number; y1: number; x2: number; y2: number; x3: number; y3: number
}
export const createBirdFlights = (at: number, x: number, y: number, random = Math.random): BirdFlight[] =>
  Array.from({ length: 18 }, (_, i) => {
    const side = i % 2 === 0 ? -1 : 1, upward = i % 5 === 0
    const startX = x + (random() - .5) * .12, startY = y + (random() - .5) * .08
    const endX = upward ? .15 + random() * .7 : side < 0 ? -.6 : 1.6
    const endY = upward ? -.65 : -.25 + random() * 1.35
    return {
      at: at + i * 13 + random() * 75, duration: 2350 + random() * 900,
      color: i % 6, size: .7 + random() * .65, flap: 2.4 + random() * 1.5, phase: random(),
      x0: startX, y0: startY,
      x1: startX + side * (.22 + random() * .24),
      y1: startY + (i % 4 === 0 ? .12 : -.14) + (random() - .5) * .2,
      x2: endX - side * .25, y2: endY + .1 + random() * .2, x3: endX, y3: endY,
    }
  }).sort((a, b) => a.size - b.size)

export const sampleBirdFlight = (bird: BirdFlight, now: number) => {
  const t = (now - bird.at) / bird.duration
  if (t < 0 || t >= 1) return null
  const u = 1 - t, uu = u * u, tt = t * t
  const x = uu * u * bird.x0 + 3 * uu * t * bird.x1 + 3 * u * tt * bird.x2 + tt * t * bird.x3
  const y = uu * u * bird.y0 + 3 * uu * t * bird.y1 + 3 * u * tt * bird.y2 + tt * t * bird.y3
  const dx = 3 * uu * (bird.x1 - bird.x0) + 6 * u * t * (bird.x2 - bird.x1) + 3 * tt * (bird.x3 - bird.x2)
  const dy = 3 * uu * (bird.y1 - bird.y0) + 6 * u * t * (bird.y2 - bird.y1) + 3 * tt * (bird.y3 - bird.y2)
  return { x, y, dx, dy, t }
}
