export type FighterSide = 'angel' | 'devil'
export type FighterPose = {
  x: number; y: number; angle: number; scaleX: number; scaleY: number; trail: number
  windup: number; punch: number; kick: number; twist: number
}
type Attack = { side: FighterSide; startedAt: number; kick: boolean; contacted: boolean }
export type DuelMotion = {
  angel: FighterPose
  devil: FighterPose
  attacker: FighterSide | null
  impact: { side: FighterSide; at: number; boosted: boolean } | null
}
const clamp = (value: number) => Math.max(0, Math.min(1, value))
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t) }
export const DUEL_ATTACK_DURATION = 240
export const DUEL_CONTACT_PHASE = .32
const HELD_WINK_TIMEOUT = 150
export const restingFighterPose = (): FighterPose => ({ x: 0, y: 0, angle: 0, scaleX: 1, scaleY: 1, trail: 0, windup: 0, punch: 0, kick: 0, twist: 0 })

/** A fresh unilateral wink starts immediately; sustained tracking chains attacks
 * on the same side. Lost tracking expires the hold, with no queued catch-up hits. */
export const createDuelChoreography = () => {
  let attack: Attack | null = null
  let heldSide: FighterSide | null = null
  let heldAt = -Infinity
  const counts = { angel: 0, devil: 0 }
  const startAttack = (side: FighterSide, at: number) => {
    attack = { side, startedAt: at, kick: counts[side] % 3 === 2, contacted: false }
    counts[side] += 1
  }
  const holding = (now: number) => heldSide !== null && now - heldAt <= HELD_WINK_TIMEOUT
  const reset = (_now: number) => {
    attack = null; heldSide = null; heldAt = -Infinity
    counts.angel = 0; counts.devil = 0
  }
  const releaseWink = () => { heldSide = null; heldAt = -Infinity }
  const requestAttack = (side: FighterSide, now: number) => {
    const continuing = heldSide === side && holding(now)
    heldSide = side; heldAt = now
    if (continuing && attack) return
    // An observation of the same wink cannot rewind a punch. A wink on the
    // opposite side transfers control immediately, without an automatic reply.
    if (attack?.side === side && now - attack.startedAt < DUEL_ATTACK_DURATION * DUEL_CONTACT_PHASE) return
    startAttack(side, now)
  }
  const sample = (now: number, reducedMotion = false): DuelMotion => {
    if (attack && now - attack.startedAt >= DUEL_ATTACK_DURATION) {
      const nextAt = attack.startedAt + DUEL_ATTACK_DURATION
      if (holding(now) && heldSide === attack.side) {
        // During mode transitions rendering can pause while tracking continues.
        // Resume a new action instead of replaying old contacts or losing the hold.
        startAttack(heldSide, now - nextAt < HELD_WINK_TIMEOUT ? nextAt : now)
      }
      else attack = null
    }
    const result: DuelMotion = { angel: restingFighterPose(), devil: restingFighterPose(), attacker: attack?.side ?? null, impact: null }
    if (!attack) return result
    const phase = clamp((now - attack.startedAt) / DUEL_ATTACK_DURATION)
    const direction = attack.side === 'angel' ? 1 : -1
    const pose = result[attack.side]
    pose.windup = smooth(phase / .12) * (1 - smooth((phase - .12) / .2))
    const extension = smooth((phase - .1) / (DUEL_CONTACT_PHASE - .1)) * (1 - smooth((phase - .44) / .56))
    pose.punch = attack.kick ? 0 : extension
    pose.kick = attack.kick ? extension : 0
    pose.twist = extension - pose.windup * .45
    // Most of the reach comes from the arm/leg rig, not translating the sprite.
    pose.x = direction * (extension * .065 - pose.windup * .015)
    pose.y = pose.windup * .015 - pose.kick * .025
    pose.angle = direction * (extension * .035 - pose.windup * .02)
    pose.trail = extension * .6
    if (!attack.contacted && phase >= DUEL_CONTACT_PHASE) {
      attack.contacted = true
      result.impact = { side: attack.side, at: attack.startedAt + DUEL_ATTACK_DURATION * DUEL_CONTACT_PHASE, boosted: true }
    }
    if (reducedMotion) {
      pose.x *= .18; pose.y *= .18; pose.angle *= .18; pose.trail = 0
      pose.windup *= .3; pose.punch *= .3; pose.kick *= .3; pose.twist *= .3
    }
    return result
  }
  const isActive = (now: number) => attack !== null && (now - attack.startedAt < DUEL_ATTACK_DURATION || holding(now))
  return { reset, requestAttack, releaseWink, sample, isActive }
}
