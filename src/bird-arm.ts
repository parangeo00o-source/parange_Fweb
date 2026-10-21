type Landmark = { x: number; y: number; visibility?: number }

/** Associate the hand with the nearest visible pose wrist in camera coordinates. */
export const findBirdElbow = (hand: Landmark[], pose: Landmark[], aspect: number, used: Set<number>) => {
  const distance = (a: Landmark, b: Landmark) => Math.hypot((a.x - b.x) * aspect, a.y - b.y)
  const handSize = distance(hand[0], hand[9])
  const candidates = [15, 16].flatMap(wristIndex => {
    const wrist = pose[wristIndex], elbow = pose[wristIndex - 2]
    if (used.has(wristIndex) || !wrist || !elbow || (wrist.visibility ?? 0) < .55 || (elbow.visibility ?? 0) < .55) return []
    if (![wrist.x, wrist.y, elbow.x, elbow.y].every(Number.isFinite) || elbow.x < 0 || elbow.x > 1 || elbow.y < 0 || elbow.y > 1) return []
    const gap = distance(hand[0], wrist)
    if (gap > Math.max(.065, handSize * .85) || distance(wrist, elbow) < .035) return []
    return [{ wristIndex, elbow, gap }]
  }).sort((a, b) => a.gap - b.gap)
  const match = candidates[0]
  if (!match) return null
  used.add(match.wristIndex)
  return match.elbow
}

/** Confidence hysteresis and short occlusion bridging, without inventing a new arm. */
export const createBirdArmTracker = () => {
  const tracks = new Map<string, { elbow: Landmark; wrist: Landmark; at: number; poseAt: number; poseWrist: number }>()
  return {
    sample(key: string, hand: Landmark[], pose: Landmark[], aspect: number, now: number, poseAt: number, used: Set<number>) {
      for (const [id, track] of tracks) if (now - track.at > 400) tracks.delete(id)
      const previous = tracks.get(key)
      const distance = (a: Landmark, b: Landmark) => Math.hypot((a.x - b.x) * aspect, a.y - b.y)
      const palm = Math.max(distance(hand[0], hand[9]), distance(hand[5], hand[17]), .035)
      let best: { index: number; elbow: Landmark; score: number } | null = null
      if (now - poseAt < 320) for (const index of [15, 16]) {
        const wrist = pose[index], elbow = pose[index - 2]
        if (used.has(index) || !wrist || !elbow || ![wrist.x, wrist.y, elbow.x, elbow.y].every(Number.isFinite)) continue
        const continuing = previous?.poseWrist === index
        if ((wrist.visibility ?? 0) < (continuing ? .35 : .5) || (elbow.visibility ?? 0) < (continuing ? .38 : .55)) continue
        if (elbow.x < 0 || elbow.x > 1 || elbow.y < 0 || elbow.y > 1 || distance(wrist, elbow) < .035) continue
        const gap = distance(hand[0], wrist)
        if (gap > Math.max(.075, palm * (continuing ? 1.25 : .95))) continue
        const jump = previous ? distance(previous.elbow, elbow) : 0
        // Reject an isolated distant elbow instead of jumping to the other arm.
        if (continuing && jump > Math.max(.2, palm * 2) && (elbow.visibility ?? 0) < .8) continue
        const score = gap + (continuing ? -.025 : 0) + Math.min(.05, jump * .1)
        if (!best || score < best.score) best = { index, elbow, score }
      }
      if (best) {
        used.add(best.index)
        if (previous?.poseAt === poseAt) return previous.elbow
        const movement = previous ? distance(previous.elbow, best.elbow) : Infinity
        // Stable poses reject jitter; intentional movement catches up quickly.
        const alpha = previous ? Math.min(.85, .22 + movement * 9) : 1
        const elbow = { x: previous ? previous.elbow.x + (best.elbow.x - previous.elbow.x) * alpha : best.elbow.x,
          y: previous ? previous.elbow.y + (best.elbow.y - previous.elbow.y) * alpha : best.elbow.y }
        tracks.set(key, { elbow, wrist: { ...hand[0] }, at: now, poseAt, poseWrist: best.index })
        return elbow
      }
      if (previous && now - previous.at <= 300 && !used.has(previous.poseWrist)
        && distance(hand[0], previous.wrist) < palm * .65) {
        used.add(previous.poseWrist)
        return previous.elbow
      }
      tracks.delete(key)
      return null
    },
    reset() { tracks.clear() },
  }
}
