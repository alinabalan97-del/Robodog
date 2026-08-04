/**
 * scripts/diagnose-fleet.mjs
 *
 * ── WHY IS THE FLOOR STANDING STILL? ─────────────────────────────────────────
 *
 *   node scripts/diagnose-fleet.mjs [minutes] [seed]
 *
 * The soak says PASS or FAIL. This says WHERE. It runs one seed and reports the
 * things a failing soak cannot distinguish between: whether units are blocked at
 * junctions or behind bodies, how much of the reservation state is held by
 * machines that are standing still, whether anyone is even reaching a goal, and
 * whether the charger and lift paths are ever exercised.
 *
 * It reaches into private simulation state on purpose. This is a diagnostic, not
 * a product surface — the alternative is inferring internals from telemetry,
 * which is how the lane-block leak stayed invisible in the first place.
 *
 * Loads TS through Vite's SSR pipeline exactly as `soak-fleet.mjs` does, so `@/`
 * resolves as it does in the app and there is no second copy of the module.
 */

import { createServer } from 'vite'

const MINUTES = Number(process.argv[2] ?? 20)
const SEED = Number(process.argv[3] ?? 20260731)
const STEP = 0.05

const server = await createServer({
  configFile: 'vite.config.mts',
  server: { middlewareMode: true },
  logLevel: 'error',
})

const { FleetSim } = await server.ssrLoadModule('/src/sim/fleetSim.ts')
const { stations, fleetRobots, fleetSimParams } = await server.ssrLoadModule('/src/data/fleet.ts')

const sim = new FleetSim({ seed: SEED })

// Private state, by design — see the header.
const priv = key => sim[key]
const units = priv('units')
const graph = priv('graph')

console.log(`seed ${SEED} · ${MINUTES} min · ${units.length} units · ${stations.length} stations`)
console.log(`graph: ${graph.nodes.size} nodes · spurs ${graph.spurNodes.size}`)
console.log(`chargers: ${stations.filter(s => s.kind === 'charger').length}`)
console.log(`reserve/critical/target charge: ${fleetSimParams.reserveChargePct}/${fleetSimParams.criticalChargePct}/${fleetSimParams.chargeToPct}\n`)

const blockReasons = new Map()
const phaseSeconds = new Map()
const heldWhileStill = []      // lane blocks held by units that are not moving
const heldTotal = []
let arrivals = 0
let chargeCalls = 0
const alerts = new Map()
const perUnit = new Map(units.map(u => [u.def.id, { moved: 0, still: 0, blocked: 0, phases: new Map(), lastX: u.x, lastY: u.y }]))

// Count arrivals + charge attempts without editing the sim: wrap the methods.
const proto = Object.getPrototypeOf(sim)
const origArrive = proto.arriveAtGoal
let arrivalsOnSpur = 0, arrivalsOnLane = 0
proto.arriveAtGoal = function (u) {
  arrivals++
  if (graph.spurNodes.has(u.nodeId)) arrivalsOnSpur++; else arrivalsOnLane++
  return origArrive.call(this, u)
}
const origCharge = proto.beginCharge
proto.beginCharge = function (u) { chargeCalls++; return origCharge.call(this, u) }

const SAMPLES = Math.round((MINUTES * 60) / STEP)
for (let i = 0; i < SAMPLES; i++) {
  sim.tick(STEP)
  if (i % 20) continue                                  // sample once a second

  const segments = priv('segments')
  let stillHeld = 0
  for (const u of units) {
    if (u.segment && u.speed < 0.1) stillHeld++
    const st = perUnit.get(u.def.id)
    st.phases.set(u.phase, (st.phases.get(u.phase) ?? 0) + 1)
    const d = Math.hypot(u.x - st.lastX, u.y - st.lastY)
    if (d < 0.5) st.still++; else st.moved += d
    st.lastX = u.x; st.lastY = u.y
    if (u.blocked) {
      st.blocked++
      const r = u.blockReason || 'unnamed'
      blockReasons.set(r, (blockReasons.get(r) ?? 0) + 1)
    }
    phaseSeconds.set(u.phase, (phaseSeconds.get(u.phase) ?? 0) + 1)
    if (u.alert) alerts.set(u.alert, (alerts.get(u.alert) ?? 0) + 1)
  }
  heldTotal.push(segments.size)
  heldWhileStill.push(stillHeld)
}

const avg = a => a.length ? (a.reduce((s, n) => s + n, 0) / a.length) : 0
const pct = (n, d) => `${((n / d) * 100).toFixed(1)}%`
const secs = heldTotal.length

console.log('── phase seconds (unit-seconds) ──')
for (const [k, v] of [...phaseSeconds].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(11)} ${String(v).padStart(6)}  ${pct(v, secs * units.length)}`)

console.log('\n── block reasons ──')
for (const [k, v] of [...blockReasons].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(6)}  ${k}`)

console.log('\n── lane blocks ──')
console.log(`  held on average      ${avg(heldTotal).toFixed(2)}`)
console.log(`  held by a STILL unit ${avg(heldWhileStill).toFixed(2)}   <- reserved by machines that are not moving`)

console.log('\n── progress ──')
console.log(`  arriveAtGoal calls   ${arrivals}`)
console.log(`  beginCharge calls    ${chargeCalls}`)
  console.log(`  arrivals on spur     ${arrivalsOnSpur}   on lane ${arrivalsOnLane}`)
console.log(`  tasks completed      ${sim.snapshot?.().tasksCompleted ?? priv('completed')}`)

console.log('\n── alerts ──')
for (const [k, v] of [...alerts].sort((a, b) => b[1] - a[1])) console.log(`  ${String(v).padStart(6)}  ${k}`)

console.log('\n── per unit ──')
for (const [id, st] of perUnit) {
  const top = [...st.phases].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}:${v}`).join(' ')
  console.log(`  ${id.padEnd(8)} moved=${st.moved.toFixed(0).padStart(6)}u still=${pct(st.still, secs)} blocked=${pct(st.blocked, secs)}  [${top}]`)
}

// ── The standoff itself ──────────────────────────────────────────────────────
//
// Aggregates say "blocked at a junction"; they cannot say WHICH junction, held
// by WHOM, and whether the refusal came from a claim, a block or the proximity
// veto. That distinction is the whole diagnosis, so ask each unit directly.
console.log('\n── standoff snapshot ──')
const claims = priv('claims')
const segments = priv('segments')
const junctionClear = (await server.ssrLoadModule('/src/data/fleet.ts')).fleetGeometry.junctionClearM
const perMetre = (await server.ssrLoadModule('/src/data/fleet.ts')).PLAN_UNITS_PER_METRE
console.log(`  junctionClearM = ${junctionClear.toFixed(3)} m = ${(junctionClear * perMetre).toFixed(1)} plan units`)
for (const u of units) {
  const next = u.route && u.route[u.legIndex + 1]
  const holder = next ? claims.get(next.id) : undefined
  let near = []
  if (next) {
    for (const o of units) {
      if (o === u) continue
      const d = Math.hypot(o.x - next.x, o.y - next.y)
      if (d < junctionClear * perMetre) near.push(`${o.def.id}@${d.toFixed(0)}u${o.speed < 0.1 ? '(still)' : ''}`)
    }
  }
  console.log(`  ${u.def.id.padEnd(8)} at(${u.x.toFixed(0)},${u.y.toFixed(0)}) node=${u.nodeId} phase=${u.phase}`)
  console.log(`           legDist=${u.legDist.toFixed(1)} claim=${u.claim ?? '-'} segment=${u.segment ?? '-'}`)
  console.log(`           wants=${next ? next.id : '(no next leg)'} claimedBy=${holder ?? 'nobody'} blockedBy=${u.blockedBy ?? '-'}`)
  console.log(`           bodies inside that junction's clearance: ${near.length ? near.join(' ') : 'none'}`)
}
console.log(`\n  claims held: ${claims.size}  ${JSON.stringify([...claims])}`)
console.log(`  blocks held: ${segments.size}  ${JSON.stringify([...segments])}`)

await server.close()
process.exit(0)
