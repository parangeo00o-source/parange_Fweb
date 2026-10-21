import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
const load = async name => {
  const source = await readFile(new URL('../src/' + name, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext } })
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
}
const { createDuelChoreography, restingFighterPose, DUEL_ATTACK_DURATION, DUEL_CONTACT_PHASE } = await load('angel-devil-motion.ts')
const { fighterBoneTransforms, fighterHandGrip, createFighterSkin, deformFighterRig } = await load('angel-devil-rig.ts')
assert.ok(DUEL_ATTACK_DURATION <= 300 && DUEL_ATTACK_DURATION * DUEL_CONTACT_PHASE <= 100, 'Fast attack and sub-100ms contact animation')
const rest = restingFighterPose()
const controller = createDuelChoreography()
controller.reset(0)
for (const now of [0, 300, 5000, 60000]) {
  assert.deepEqual(controller.sample(now), { angel: rest, devil: rest, attacker: null, impact: null }, 'No wink means exactly zero motion at any time')
}
for (const side of ['angel', 'devil']) {
  controller.reset(0)
  const other = side === 'angel' ? 'devil' : 'angel'
  controller.requestAttack(side, 100)
  const hits = [], poses = []
  for (let now = 100; now < 3000; now += 33) {
    if (now < 2000) controller.requestAttack(side, now)
    const frame = controller.sample(now)
    assert.deepEqual(frame[other], rest, 'The non-winking fighter never attacks or moves')
    if (frame.impact) hits.push(frame.impact)
    poses.push(frame[side])
    assert.ok(Object.values(frame[side]).every(Number.isFinite))
  }
  assert.ok(hits.length >= 8, 'A held eye must chain rapid attacks')
  for (let i = 1; i < hits.length; i++) assert.ok(Math.abs(hits[i].at - hits[i - 1].at - DUEL_ATTACK_DURATION) < .0001, 'No pause or drift between held attacks')
  assert.equal(hits[0].side, side)
  assert.ok(poses.some(pose => pose.punch > .9), 'Punch must reach full extension')
  assert.ok(poses.every(pose => Math.abs(pose.x) < .07), 'Whole-sprite sliding must remain minimal')
  assert.deepEqual(controller.sample(4000)[side], rest)
  controller.releaseWink(); controller.requestAttack(side, 4500)
  assert.equal(controller.sample(4595).impact.side, side, 'A new wink after reopening triggers a new punch')
  const kick = poses.find(pose => pose.kick > .9)
  assert.ok(kick.kick > .9 && kick.punch === 0, 'A subsequent wink can use a leg action')
  const punch = poses.find(pose => pose.punch > .9)
  const neutralBones = fighterBoneTransforms(side, rest), punchBones = fighterBoneTransforms(side, punch), kickBones = fighterBoneTransforms(side, kick)
  const point = (m, x, y) => [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]]
  const wrist = side === 'angel' ? [.85,.66] : [.23,.64]
  const hand = point(punchBones[2], ...wrist), bodyHand = point(punchBones[0], ...wrist)
  assert.ok(Math.hypot(hand[0]-bodyHand[0], hand[1]-bodyHand[1]) > .09, 'Wrist must move independently of torso')
  assert.notDeepEqual(kickBones[4], kickBones[5], 'Front and supporting legs need distinct articulation')
  const restingGrip = fighterHandGrip(side, rest), movingGrip = fighterHandGrip(side, punch)
  assert.ok(Math.abs(movingGrip.x - restingGrip.x) > .04, 'Equipment grip follows the articulated hand')
  for (const m of neutralBones) assert.ok(Math.abs(m[0]-1)<1e-8 && Math.abs(m[1])<1e-8 && Math.abs(m[4])<1e-8 && Math.abs(m[5])<1e-8, 'Neutral rig preserves original artwork')
  // A flipped skin triangle produces tears at a bent shoulder or hip. Check
  // the complete windup/extension/recovery, not only a favorable still frame.
  for (const move of ['punch', 'kick']) {
    const action = createDuelChoreography(), skin = createFighterSkin({}, side)
    const start = move === 'kick' ? 2000 : 0
    for (let at = 0; at <= start; at += 1000) {
      action.releaseWink(); action.requestAttack(side, at)
      if (at < start) action.sample(at + 600)
    }
    for (let time = 0; time <= DUEL_ATTACK_DURATION; time += 8) {
      const pose = action.sample(start + time)[side]
      deformFighterRig(skin, side, pose)
      const v = skin.vertices
      // Compare every Float32 coordinate to the original dense eight-joint
      // algorithm throughout both attacks, not only screenshot sample times.
      const dense = v.slice(), transforms = fighterBoneTransforms(side, pose)
      for (let i = 0; i < v.length / 4; i++) {
        const x = v[i * 4 + 2], y = v[i * 4 + 3]
        let tx = 0, ty = 0
        for (let bone = 0; bone < 8; bone++) {
          const weight = skin.weights[i * 8 + bone]
          if (weight === 0) continue
          const m = transforms[bone]
          tx += (m[0] * x + m[2] * y + m[4]) * weight
          ty += (m[1] * x + m[3] * y + m[5]) * weight
        }
        dense[i * 4] = tx; dense[i * 4 + 1] = ty
      }
      assert.deepEqual(v, dense, 'Sparse skinning must preserve every vertex exactly')
      for (let row = 0; row < 32; row++) for (let col = 0; col < 32; col++) {
        const a = (row * 33 + col) * 4, b = a + 4, c = a + 33 * 4, d = c + 4
        for (const [i,j,k] of [[a,b,c],[b,d,c]]) {
          const area = ((v[j]-v[i])*(v[k+1]-v[i+1])-(v[k]-v[i])*(v[j+1]-v[i+1]))*1024
          assert.ok(area > .04 && area < 2, `${side} ${move}: folded or excessively stretched skin`)
        }
      }
      for (let i=0;i<v.length;i+=4) assert.ok(v[i] > -.25 && v[i] < 1.25 && v[i+1] > -.25 && v[i+1] < 1.25, 'Articulation stays inside its render surface')
    }
  }
  const skinA = createFighterSkin({}, side), skinB = createFighterSkin({}, side)
  const untouched = skinB.vertices.slice()
  deformFighterRig(skinA, side, punch)
  assert.deepEqual(skinB.vertices, untouched, 'Reopened renderers must not share mutable vertices')
  assert.notEqual(skinA.weights, skinB.weights, 'Renderer weight storage remains isolated')
}
controller.reset(0); controller.requestAttack('angel', 0); controller.sample(100)
controller.requestAttack('devil', 140)
assert.equal(controller.sample(150).attacker, 'devil', 'Only the most recently winked side can attack')
assert.deepEqual(controller.sample(150).angel, rest)
assert.equal(controller.sample(10000).impact, null, 'A stale frame must not replay missed hits')
controller.reset(11000)
assert.equal(controller.sample(11000).attacker, null)
controller.requestAttack('angel', 12000)
assert.equal(controller.sample(12095).impact.side, 'angel')
controller.releaseWink(); controller.requestAttack('angel', 12140)
assert.equal(controller.sample(12235).impact.side, 'angel', 'Fresh rapid wink can interrupt recovery without waiting for the old animation')
assert.equal(controller.sample(12235).impact, null, 'No duplicate contact event')
for (const release of [false, true]) {
  controller.reset(0)
  let contacts = 0
  for (let now = 0; now < 1500; now += 16) {
    if (now <= 800 && now % 32 === 0) controller.requestAttack('devil', now)
    if (release && now === 800) controller.releaseWink()
    const frame = controller.sample(now)
    if (now < 800) assert.equal(frame.attacker, 'devil', 'A sustained wink has no idle gap between attacks')
    if (frame.impact) contacts++
    assert.deepEqual(frame.angel, rest)
    if (now >= 1200) assert.equal(frame.attacker, null, 'Release or stale tracking stops repeats')
  }
  assert.equal(contacts, 4, 'No extra attack after release or lost tracking')
}
controller.reset(0)
for (let now = 0; now <= 600; now += 30) controller.requestAttack('angel', now)
const resumed = controller.sample(600)
assert.equal(resumed.attacker, 'angel', 'Holding during a mode transition must resume attacks')
assert.equal(resumed.impact, null, 'Resume without replaying a missed hit')
assert.equal(controller.sample(695).impact?.side, 'angel')
const full = createDuelChoreography(), reduced = createDuelChoreography()
for (const c of [full, reduced]) { c.reset(0); c.requestAttack('angel', 0) }
const a = full.sample(95), b = reduced.sample(95, true)
assert.deepEqual(a.impact, b.impact)
assert.ok(b.angel.punch < a.angel.punch * .31)
assert.equal(b.angel.trail, 0)
console.log('Passed: stationary rest, wink-only attacks, continuous held-wink attacks, inactive opponent, independent body joints, reset and reduced motion.')

const {createDuelVitals}=await load('angel-devil-hud.ts')
const health=createDuelVitals()
assert.deepEqual(health.hit('angel',8,100),{target:'devil',damage:8})
assert.equal(health.snapshot().devil.hp,92)
assert.equal(health.snapshot().angel.hp,100)
assert.equal(health.hit('angel',8,100),null,'Duplicate contact must not drain health twice')
assert.deepEqual(health.hit('devil',8,200),{target:'angel',damage:8})
assert.equal(health.snapshot().angel.hp,92)
assert.deepEqual(health.hit('angel',99,300),{target:'devil',damage:92},'Damage clamps to remaining HP')
assert.equal(health.snapshot().devil.hp,0)
assert.equal(health.snapshot().winner,'angel')
assert.equal(health.hit('devil',8,400),null,'No negative HP or further damage during KO')
health.update(2099);assert.equal(health.snapshot().devil.hp,0)
health.update(2100);assert.equal(health.snapshot().devil.hp,100);assert.equal(health.snapshot().round,2)
health.reset();assert.equal(health.snapshot().round,1);assert.equal(health.snapshot().angel.hp,100)
console.log('Passed: damage direction, numeric HP, duplicate hits, zero clamp, KO, next round and reset.')
