type Landmark = { x: number; y: number }

const extendedFingers = (hand: Landmark[], aspect: number) => {
  if (hand.length < 21) return null
  const distance = (a: number, b: number) => Math.hypot((hand[a].x - hand[b].x) * aspect, hand[a].y - hand[b].y)
  return [5, 9, 13, 17].map(base => distance(base + 3, base) > distance(base + 1, base) * 1.65
    && distance(base + 3, 0) > distance(base + 1, 0) * 1.12)
}

export const isBirdCallingFinger = (hand: Landmark[], aspect = 1) => {
  const fingers = extendedFingers(hand, aspect)
  return !!fingers && fingers[0] && !fingers[1] && !fingers[2] && !fingers[3]
}

export const isBirdVictoryHand = (hand: Landmark[], aspect = 1) => {
  const fingers = extendedFingers(hand, aspect)
  if (!fingers || !fingers[0] || !fingers[1] || fingers[2] || fingers[3]) return false
  const separation = Math.hypot((hand[8].x - hand[12].x) * aspect, hand[8].y - hand[12].y)
  const palm = Math.hypot((hand[5].x - hand[17].x) * aspect, hand[5].y - hand[17].y)
  return separation > palm * .28
}

/** One burst per held two-hand V; lowering either hand rearms it. */
export const createBirdVictoryGesture = () => {
  let since = Infinity, releasedAt = Infinity, armed = true, lastBurst = -Infinity
  return {
    sample(both: boolean, now: number) {
      if (!both) {
        since = Infinity
        if (releasedAt === Infinity) releasedAt = now
        if (now - releasedAt >= 240) armed = true
        return false
      }
      releasedAt = Infinity
      if (since === Infinity) since = now
      if (!armed || now - since < 80 || now - lastBurst < 1800) return false
      armed = false; lastBurst = now
      return true
    },
    reset() { since = Infinity; releasedAt = Infinity; armed = true; lastBurst = -Infinity },
  }
}
