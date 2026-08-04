/**
 * scripts/probe-dock-service.mjs
 *
 * ── ARE THE LOADING BAYS ACTUALLY BEING SERVICED? ────────────────────────────
 *
 *   node scripts/probe-dock-service.mjs [minutes] [seed]
 *
 * The soak proves the floor does not jam. It cannot prove the thing the dock
 * posting exists for, because every failure mode of a posting looks like a
 * healthy run from the outside: two units that quietly park up and never patrol
 * still complete tasks, still charge, still yield, and still pass every
 * assertion in `soak-fleet.mjs`. The bays simply stop being visited, which no
 * aggregate in that script measures.
 *
 * So this asks the four questions the posting has to answer, per dock unit:
 *
 *   1. HOW LONG IS IT STATIONARY? The brief is that it must not stand still for
 *      long except while charging or waiting for work. Reported as the longest
 *      single motionless spell and the share of samples stopped, both split so a
 *      charge is never counted against it.
 *   2. IS EVERY BAY ON ITS POSTING REACHED? A beat that only ever works its
 *      first entry is a rotation that is not rotating.
 *   3. DOES IT STILL TAKE ORDINARY WORK? A unit that patrols instead of working
 *      has been given a hobby, not a posting.
 *   4. DOES THE PATROL COST THE FLOW ANYTHING? Reported as the total time dock
 *      units hold a bay with no task on board — the one real risk of the design,
 *      since a bay is exclusive and the pallet stage needs it.
 *
 * It reaches into private simulation state on purpose, exactly as
 * `diagnose-fleet.mjs` does and for the same reason: the alternative is
 * inferring internals from telemetry, and telemetry is what would be wrong.
 *
 * Loads TS through Vite's SSR pipeline so `@/` resolves as it does in the app.
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
const { stations, fleetRobots } = await server.ssrLoadModule('/src/data/fleet.ts')

const posted = fleetRobots.filter(def => def.dockService)
if (posted.length === 0) {
  console.log('No unit carries a `dockService` posting — nothing to probe.')
  await server.close()
  process.exit(0)
}

const labelOf = id => stations.find(s => s.id === id)?.label ?? id

const sim = new FleetSim({ seed: SEED })
const units = sim.units                                   // private, by design

console.log(`seed ${SEED} · ${MINUTES} min · ${posted.length} dock units of ${units.length}\n`)

/**
 * Phases in which standing still is the correct behaviour, not a symptom.
 *
 * ⚠️ THE STALL FIGURE IS MEANINGLESS WITHOUT THIS LIST, and it took a wrong
 * reading to see why. Measured over every phase, both dock units showed
 * thirty-five-minute "stalls" — which was a charge, a fault recovery and the
 * congestion governor's parking pool being counted as failures to move. The
 * unposted fleet scored *worse* on the same measure precisely because it parks,
 * so the comparison said the posting was working when the number said it was
 * broken. Excluded here, the same run reports 150–210 s across the whole fleet,
 * which is queueing on single-lane aisles and is the documented steady state.
 *
 * `waitingAtPoint` is in the list for the same reason `parked` is: the brief
 * allows a unit to be stopped while it is waiting for a task. What it does not
 * allow is a unit stopped on a DRIVING phase for minutes, which is what is left.
 */
const RESTING_PHASES = new Set([
  'toCharger', 'docking', 'charging', 'chargingComplete', 'waitingForCharge',
  'parked', 'standby', 'waitingAtPoint', 'dockService', 'faulted',
])
/** The subset that is specifically a charge, reported separately below. */
const CHARGE_PHASES = new Set([
  'toCharger', 'docking', 'charging', 'chargingComplete', 'waitingForCharge',
])

const track = new Map(posted.map(def => [def.id, {
  def,
  samples: 0,
  stopped: 0,
  charging: 0,
  stoppedWorking: 0,          // motionless on a DRIVING phase — the number that matters
  spell: 0,
  longestSpell: 0,
  phases: new Map(),
  docksWorked: new Map(),     // dock id → times a beat leg reached the bay
  beatLegsPreempted: 0,       // beat legs cut short by real work — a success
  tasks: new Set(),
  taskPickupsAtDock: new Map(),
  bayHeldSeconds: 0,          // holding a dock station with no task on board
  lastPhase: null,
}]))

const dockIds = new Set(stations.filter(s => s.kind === 'dock').map(s => s.id))

/**
 * The same stillness measure for every unit WITHOUT a posting.
 *
 * ⚠️ WITHOUT THIS THE PROBE CANNOT ANSWER ITS OWN QUESTION. "AMR-06 stood still
 * for eight minutes" is a finding about the posting only if the other fourteen
 * did not; on a single-lane network at sixteen units, queueing is the documented
 * steady state, and a dock unit sitting in one is the building being itself. The
 * baseline is what tells those two apart, and it is why the stillness assertion
 * below is stated as a MARGIN over the fleet rather than as an absolute.
 */
const baseline = new Map(units
  .filter(unit => !unit.dock)
  .map(unit => [unit.def.id, { spell: 0, longestSpell: 0, stoppedWorking: 0, samples: 0 }]))

const steps = Math.round((MINUTES * 60) / STEP)
for (let i = 0; i < steps; i++) {
  sim.tick(STEP)

  for (const unit of units) {
    const base = baseline.get(unit.def.id)
    if (base) {
      base.samples += 1
      if (unit.speed > 0.5 || RESTING_PHASES.has(unit.phase)) {
        base.spell = 0
      } else {
        base.stoppedWorking += 1
        base.spell += STEP
        base.longestSpell = Math.max(base.longestSpell, base.spell)
      }
    }

    const row = track.get(unit.def.id)
    if (!row) continue

    row.samples += 1
    row.phases.set(unit.phase, (row.phases.get(unit.phase) ?? 0) + STEP)
    if (unit.task) {
      row.tasks.add(unit.task.id)
      // Bays reached on real work count as serviced too — see the assertions.
      const from = unit.task.fromStationId
      if (from && dockIds.has(from) && !row.taskPickupsAtDock.has(unit.task.id)) {
        row.taskPickupsAtDock.set(unit.task.id, from)
      }
    }

    // ⚠️ CREDITED ON ARRIVAL, NOT ON DEPARTURE. `finishDwell` runs the whole of
    // the next beat leg in one frame — end the round, choose the next stop, plan
    // to it — so by the time the phase has changed both `patrolStationId` and
    // `goalStationId` already name the NEXT stop. Sampling on the way out
    // credited the wrong bay, or none at all.
    if (row.lastPhase !== 'dockService' && unit.phase === 'dockService') {
      const id = unit.patrolStationId ?? unit.goalStationId
      if (id) row.docksWorked.set(id, (row.docksWorked.get(id) ?? 0) + 1)
    }
    // A beat leg that ended in an assignment rather than at the bay. This is the
    // posting working as intended — the unit was needed — so it is counted and
    // never asserted against.
    if (row.lastPhase === 'toDock' && unit.phase !== 'toDock' && unit.phase !== 'dockService') {
      row.beatLegsPreempted += 1
    }
    row.lastPhase = unit.phase

    if (unit.patrolStationId && !unit.task) {
      const station = stations.find(s => s.id === unit.patrolStationId)
      if (station?.kind === 'dock') row.bayHeldSeconds += STEP
    }

    const moving = unit.speed > 0.5
    if (moving) {
      row.spell = 0
      continue
    }
    row.stopped += 1
    if (CHARGE_PHASES.has(unit.phase)) row.charging += 1
    if (RESTING_PHASES.has(unit.phase)) {
      row.spell = 0
      continue
    }
    row.stoppedWorking += 1
    row.spell += STEP
    row.longestSpell = Math.max(row.longestSpell, row.spell)
  }
}

const pct = (n, d) => (d ? `${((n / d) * 100).toFixed(1)}%` : '—')

const baseRows = [...baseline.values()]
const worstBaseSpell = Math.max(...baseRows.map(r => r.longestSpell))
const baseStopped = baseRows.reduce((n, r) => n + r.stoppedWorking, 0)
const baseSamples = baseRows.reduce((n, r) => n + r.samples, 0)

console.log(`fleet baseline (${baseRows.length} unposted units)`)
console.log(`  worst stall on a drive  ${worstBaseSpell.toFixed(1)}s`)
console.log(`  stopped, any reason     ${pct(baseStopped, baseSamples)} of samples`
  + '   (mostly the governor\'s parking pool)\n')

for (const row of track.values()) {
  const beat = row.def.dockService
  console.log(`${row.def.code}  (${beat.dockStationIds.map(labelOf).join(' · ')})`)
  console.log(`  worst stall on a drive  ${row.longestSpell.toFixed(1)}s`
    + `   (fleet worst ${worstBaseSpell.toFixed(0)}s)`)
  console.log(`  stopped on a drive      ${pct(row.stoppedWorking, row.samples)} of samples`
    + `   ·  charging ${pct(row.charging, row.samples)}`)

  const worked = beat.dockStationIds
    .map(id => `${labelOf(id)} ×${row.docksWorked.get(id) ?? 0}`)
    .join('  ')
  console.log(`  bays worked on beat     ${worked}`)
  console.log(`  beat legs pre-empted    ${row.beatLegsPreempted} (taken onto real work en route)`)
  // ⚠️ REPORTED SEPARATELY FROM THE BEAT, AND BOTH MATTER. A bay the beat never
  // reaches is still being serviced if the flow keeps sending this unit there
  // on real work — and a bay that appears in neither list is one nobody is
  // visiting, which is the finding the probe exists for.
  const byBay = new Map()
  for (const id of row.taskPickupsAtDock.values()) byBay.set(id, (byBay.get(id) ?? 0) + 1)
  const collected = [...byBay.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${labelOf(id)} ×${n}`)
    .join('  ')
  console.log(`  ordinary tasks run      ${row.tasks.size}`)
  console.log(`  collected at            ${collected || '—'}`)
  console.log(`  bay held, no task       ${row.bayHeldSeconds.toFixed(0)}s`
    + ` (${pct(row.bayHeldSeconds, MINUTES * 60)} of the run)`)

  const phases = [...row.phases.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([phase, seconds]) => `${phase} ${seconds.toFixed(0)}s`)
    .join('  ')
  console.log(`  phases                  ${phases}\n`)
}

// ── The assertions ──────────────────────────────────────────────────────────
//
// Deliberately few, and each one is a way the posting can be silently dead
// rather than a performance target. A number that merely looks poor is printed
// above and left to a person.
const failures = []
for (const row of track.values()) {
  const beat = row.def.dockService
  // ⚠️ A MARGIN OVER THE FLEET, NOT AN ABSOLUTE. The brief is that these two must
  // not stand about while the rest of the floor works — not that they must beat a
  // congested single-lane network, which no posting can promise. An absolute
  // threshold here would fail on exactly the runs where the whole hall is queued
  // and pass on the runs where nothing is happening at all.
  const allowance = Math.max(120, worstBaseSpell)
  if (row.longestSpell > allowance) {
    failures.push(`${row.def.code} stood still for ${row.longestSpell.toFixed(0)}s without charging`
      + ` — the unposted fleet's worst was ${worstBaseSpell.toFixed(0)}s`)
  }
  // ⚠️ THE BEAT AND REAL WORK BOTH COUNT AS SERVICING, and folding them into one
  // test is the point. A unit that was busy at the bays all run has not failed
  // its posting by never getting round to the patrol — the patrol is what it
  // does INSTEAD of standing still, so demanding both would assert that the
  // floor must be quiet. What must never happen is neither.
  const serviced = row.docksWorked.size + row.taskPickupsAtDock.size
  if (serviced === 0) {
    failures.push(`${row.def.code} never reached a loading bay — neither on its beat nor on a job`)
  }
  if (row.tasks.size === 0 && row.docksWorked.size === 0) {
    failures.push(`${row.def.code} neither worked its beat nor ran a task — it is doing nothing`)
  }
}

await server.close()

if (failures.length) {
  console.log('FAILED')
  for (const line of failures) console.log(`  · ${line}`)
  process.exit(1)
}
console.log('dock service ok')
