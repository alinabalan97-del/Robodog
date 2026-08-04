/**
 * scripts/floor-report.mjs
 *
 * ── HOW IS THE FLOOR ACTUALLY RUNNING? ───────────────────────────────────────
 *
 *   node scripts/floor-report.mjs [minutes] [seeds...]
 *
 * The soak says PASS or FAIL and `diagnose-fleet.mjs` says WHERE a seed is
 * stuck. This says how well the hall is WORKING: how much of each unit's time
 * goes into moving cargo rather than queueing, how much of the road is in use,
 * where units pile up, and — the question the extra lanes were added to answer —
 * whether the fleet is spreading over the network or wearing one groove in it.
 *
 * ⚠️ THIS REPLACED `traffic-report.mjs`, WHICH WAS HALF A CAPACITY CALCULATOR.
 * That script opened with a static analysis of how many robots the layout could
 * carry, because a congestion governor used the answer to size the working
 * fleet. The fleet is a fixed five now and the governor is gone, so the derived
 * number steered nothing and the module behind it was deleted. What remains here
 * is the half that was always a measurement.
 *
 * Everything printed is DERIVED FROM A MODEL, not measured off a floor. It is a
 * developer tool and nothing here may be presented to an operator as telemetry.
 */

import { createServer } from 'vite'

const MINUTES = Number(process.argv[2] ?? 30)
const SEEDS = process.argv.slice(3).map(Number).filter(Number.isFinite)
const STEP = 0.05
/** Seconds between samples. The quantities below move far slower than 20 Hz. */
const SAMPLE_SECONDS = 1

const server = await createServer({
  configFile: 'vite.config.mts',
  server: { middlewareMode: true },
  logLevel: 'error',
})

const { FleetSim } = await server.ssrLoadModule('/src/sim/fleetSim.ts')
const { fleetRobots, fleetSimParams, corridors } = await server.ssrLoadModule('/src/data/fleet.ts')

const seeds = SEEDS.length ? SEEDS : [fleetSimParams.seed, 7, 991]

/**
 * Which bucket a reported state falls in.
 *
 * Written against NAMES rather than an imported union so the report keeps
 * working while the vocabulary is extended. An unrecognised state counts as
 * "other" and is PRINTED rather than folded into a bucket it does not belong in
 * — a report that quietly reclassifies what it does not understand is worse than
 * one that admits the gap.
 */
const PRODUCTIVE = new Set([
  'toPickup', 'carrying', 'delivering', 'returning',
  'assigned', 'executingPriorityTask', 'resumingPreviousTask',
  // The dock posting's vocabulary. A unit running the loading-bay circuit is
  // working; leaving these unclassified once reported 4.3 % of the fleet as
  // "other" while the utilisation figure they belonged in read 1.4 %.
  'goingToLoadingDock', 'loadingAtDock', 'transportingCargo', 'returningToDock',
])
const WAITING = new Set(['waiting', 'waitingForPriorityTask'])
const CHARGING = new Set([
  'charging', 'goingToCharge', 'waitingForCharge', 'docking',
  'chargingComplete', 'emergencyLowBattery',
])
const IDLE = new Set(['idle', 'taskInterrupted', 'waitingForNextTask'])

const bucketOf = state => {
  if (PRODUCTIVE.has(state)) return 'productive'
  if (WAITING.has(state)) return 'waiting'
  if (CHARGING.has(state)) return 'charging'
  if (IDLE.has(state)) return 'idle'
  if (state === 'error') return 'error'
  return 'other'
}

/**
 * Which corridor a unit is DRIVING ALONG, from the lane block it holds.
 *
 * ⚠️ BY SEGMENT, NOT BY NEAREST NODE, and the difference is the whole
 * measurement. Attributing a unit to its closest lane node reported every
 * cross-over at 0.0 % — not because nothing crossed, but because a cross-over
 * here is a SINGLE segment whose only nodes are the junctions it shares with the
 * horizontals. Every sample therefore landed on a node that belongs to both, and
 * the first match won, which was always the horizontal. A segment names its two
 * endpoints, so its axis is unambiguous.
 *
 * `unit.segment` is the traffic controller's key, "seg:x:y|x:y".
 */
function corridorOfSegment (key) {
  if (typeof key !== 'string') return null
  const ends = key.replace(/^seg:/, '').split('|')
  if (ends.length !== 2) return null
  const [ax, ay] = ends[0].split(':').map(Number)
  const [bx, by] = ends[1].split(':').map(Number)
  if (![ax, ay, bx, by].every(Number.isFinite)) return null
  const horizontal = Math.abs(ay - by) < 1
  const lo = horizontal ? Math.min(ax, bx) : Math.min(ay, by)
  const hi = horizontal ? Math.max(ax, bx) : Math.max(ay, by)
  const at = horizontal ? ay : ax
  for (const c of corridors) {
    if ((c.axis === 'h') !== horizontal) continue
    if (Math.abs(at - c.at) > 1) continue
    if (lo >= c.from - 1 && hi <= c.to + 1) return c.id
  }
  return null
}

console.log(`${fleetRobots.length} units · ${MINUTES} min · ${seeds.length} seed(s)\n`)

for (const seed of seeds) {
  const sim = new FleetSim({ seed })

  const buckets = { productive: 0, waiting: 0, charging: 0, idle: 0, error: 0, other: 0 }
  const unknownStates = new Set()
  /** node id → unit-samples stopped in traffic there. */
  const hotspots = new Map()
  /** corridor id → unit-samples of a MOVING unit on it. Route diversity. */
  const laneUse = new Map()
  let unitSamples = 0
  let samples = 0
  let occupancyTotal = 0
  let deepestQueue = 0
  let frozenFor = 0
  let longestFreeze = 0

  // Lane nodes only: a unit on a spur is parked off the road, and attributing it
  // to a junction would report congestion where there is none.
  const laneNodes = []
  for (const [id, node] of sim.graph.nodes) {
    if (sim.graph.spurNodes.has(id)) continue
    laneNodes.push({ id, x: node.x, y: node.y })
  }
  const blocks = sim.graph.nodes.size

  const steps = Math.round((MINUTES * 60) / STEP)
  const sampleEvery = Math.max(1, Math.round(SAMPLE_SECONDS / STEP))

  for (let i = 0; i < steps; i++) {
    sim.tick(STEP)

    // Checked every frame, not every sample: a freeze is the one quantity where
    // the gap between samples could hide the whole event.
    let anyMoving = false
    for (const robot of sim.telemetry().robots) if (robot.speedMps > 0.05) { anyMoving = true; break }
    frozenFor = anyMoving ? 0 : frozenFor + STEP
    longestFreeze = Math.max(longestFreeze, frozenFor)

    if (i % sampleEvery !== 0) continue
    samples += 1

    const frame = sim.telemetry()
    const traffic = sim.trafficTelemetry()

    let onLane = 0
    for (const robot of frame.robots) {
      unitSamples += 1
      const bucket = bucketOf(robot.state)
      if (bucket === 'other') unknownStates.add(robot.state)
      buckets[bucket] += 1

      const moving = robot.speedMps > 0.05
      if (moving || bucket === 'waiting') onLane += 1

      // Nearest lane node — good enough to name an aisle, and far cheaper than
      // asking the graph which edge a unit is mid-way along.
      let best = null
      let bestGap = Infinity
      for (const node of laneNodes) {
        const gap = Math.hypot(robot.x - node.x, robot.y - node.y)
        if (gap < bestGap) { bestGap = gap; best = node }
      }
      if (!best || bestGap > 90) continue
      if (!moving && bucket === 'waiting') hotspots.set(best.id, (hotspots.get(best.id) ?? 0) + 1)
    }

    for (const unit of sim.units) {
      if (unit.speed <= 0.05) continue
      const id = corridorOfSegment(unit.segment)
      if (id) laneUse.set(id, (laneUse.get(id) ?? 0) + 1)
    }

    occupancyTotal += onLane / Math.max(1, blocks)
    for (const segment of traffic.segments) deepestQueue = Math.max(deepestQueue, segment.queued)
    for (const junction of traffic.intersections) deepestQueue = Math.max(deepestQueue, junction.queued)
  }

  const done = sim.telemetry().tasksCompleted
  const pct = n => `${((n / Math.max(1, unitSamples)) * 100).toFixed(1)}%`

  console.log(`── seed ${seed} ─────────────────────────────────────────────`)
  console.log(`  tasks completed        ${done}  (${(done / MINUTES).toFixed(2)}/min)`)
  console.log(`  productive             ${pct(buckets.productive)} of unit-time`)
  console.log(`  waiting in traffic     ${pct(buckets.waiting)}`)
  console.log(`  charging               ${pct(buckets.charging)}   idle ${pct(buckets.idle)}   error ${pct(buckets.error)}`)
  console.log(`  road occupancy         ${((occupancyTotal / Math.max(1, samples)) * 100).toFixed(1)}% of ${blocks} nodes`)
  console.log(`  deepest queue          ${deepestQueue} unit(s)`)
  console.log(`  longest floor freeze   ${longestFreeze.toFixed(1)}s`)

  // ── ROUTE DIVERSITY ────────────────────────────────────────────────────────
  //
  // ⚠️ THE POINT OF THE SECOND EAST–WEST LANE, AND THE ONLY WAY TO SEE IT. A
  // network can carry extra corridors that nothing ever routes over: the graph
  // is wider, every static measure improves, and the fleet still files down the
  // one aisle it always did. Share of MOVING unit-samples per corridor is what
  // distinguishes a lane that exists from a lane that is used.
  const totalLane = [...laneUse.values()].reduce((a, b) => a + b, 0)
  console.log('  lane use (share of moving unit-samples)')
  for (const c of corridors) {
    const n = laneUse.get(c.id) ?? 0
    const share = totalLane ? (n / totalLane) * 100 : 0
    const bar = '█'.repeat(Math.round(share / 4)).padEnd(13)
    console.log(`    ${c.id.padEnd(5)} ${bar} ${share.toFixed(1).padStart(5)}%  ${c.label}`)
  }
  const used = corridors.filter(c => (laneUse.get(c.id) ?? 0) / Math.max(1, totalLane) > 0.02).length
  console.log(`    → ${used} of ${corridors.length} corridors carry >2% of traffic`)

  if (hotspots.size) {
    const top = [...hotspots.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
    console.log('  where units wait')
    for (const [id, n] of top) {
      console.log(`    ${id.padEnd(12)} ${(n / Math.max(1, samples)).toFixed(2)} unit(s) stopped on average`)
    }
  }
  if (unknownStates.size) {
    console.log(`  ⚠️ unclassified states: ${[...unknownStates].join(', ')} — add them to a bucket above`)
  }
  console.log()
}

await server.close()
