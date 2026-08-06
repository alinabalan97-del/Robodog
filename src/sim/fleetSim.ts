/**
 * src/sim/fleetSim.ts
 *
 * ── THE FLEET SIMULATION ─────────────────────────────────────────────────────
 *
 * Sixteen autonomous units working one hall: dispatch, routing, driving,
 * yielding, charging and faulting. It consumes the road network compiled by
 * `navGraph.ts` and emits `FleetTelemetry` — the same shape a real
 * fleet-management backend would produce — so the screens above it never learn
 * that the numbers came from a model.
 *
 * ⚠️ THIS IS A MODEL, NOT TELEMETRY. Nothing here is measured. Every screen that
 * renders it is required to say so, and the values must never be presented as a
 * live reading of a real facility (CLAUDE.md → Domain rules).
 *
 * ── ⚠️ TWO-WAY SINGLE-LANE TRAFFIC: HOW THE STANDOFF IS RESOLVED ─────────────
 *
 * At 1.21 m the building's aisles are one vehicle wide, so they are two-way, and
 * `tryEnterSegment` (block reservation) stops two units driving into one another.
 * That much works. What it cannot do is get two units PAST each other, and for a
 * while the floor deadlocked outright: the soak showed ~75 % of unit-samples
 * blocked with throughput near zero, and in the browser all five units sat
 * motionless for five minutes swapping `waiting` and `error`.
 *
 * The cause was not the block rule being too strict. It was two separate holes:
 *
 *   1. A BODY-SWAP DEADLOCK NOBODY COULD SEE. Two units on adjacent nodes, each
 *      standing ON the node the other is driving to, hold NO reservation at all
 *      — they were refused one before they ever moved. `breakDeadlocks` found the
 *      ring correctly, but `yieldWithin` only considered units holding a claim,
 *      so it discarded both and reported success having done nothing. Releasing a
 *      reservation cannot clear a body. `giveWayWithin`/`stepAside` now make one
 *      unit physically pull back to a neighbouring junction, which is what a
 *      driver would do and the only thing that actually frees the aisle.
 *   2. A LANE BLOCK THAT WAS NEVER GIVEN BACK. `releaseSegment` was called from
 *      exactly one place — the deadlock breaker — so every unit that arrived
 *      anywhere kept its approach block reserved for the whole of its load,
 *      unload, charge or park. See `arriveAtGoal` for why the release is
 *      conditional on being off the lane rather than unconditional.
 *
 * With both closed the soak passes on every seed. Traffic is still the tightest
 * part of the model and the aisles have no passing bays — units do queue, and
 * `blocked` sits around a third to a half of unit-samples on a long run. That is
 * congestion on a single-lane network, not gridlock: the give-way clears rings as
 * they form, and throughput and charging both keep running indefinitely.
 *
 * ── HOW A UNIT AVOIDS HITTING THINGS ─────────────────────────────────────────
 *
 * Four mechanisms, in order of how often they fire. None of them is a physics
 * collision test — a unit is prevented from ever needing one:
 *
 *   1. THE NETWORK ITSELF. Routes are shortest legal drives over one-way aisles,
 *      so a unit is only ever on an aisle, never on racking, never in a closed
 *      zone, and never nose-to-nose with oncoming traffic.
 *   2. FOLLOWING DISTANCE. Each unit brakes for anything ahead of it inside its
 *      own lane, easing off smoothly and stopping dead inside the hard gap. This
 *      is what makes a queue form behind a unit that is picking.
 *   3. JUNCTION RESERVATION. A unit holds exactly one node — the one it is
 *      driving into. Nobody else may claim it, and nobody may claim a node that
 *      another unit is still standing near. Crossings resolve first-come.
 *   4. EXCLUSIVE STOPS. Dispatch reserves a pick face, a bay or a stall before
 *      routing anything to it, so two units are never sent to the same place.
 *
 * Holding a single node each means a claim cycle is still theoretically possible.
 * That is what the escalation exists for: block for `rerouteAfterSeconds` and a
 * unit re-plans as though the obstruction were a closed aisle; block for
 * `stallAfterSeconds` and it declares itself stalled, which is the honest answer
 * and the one an operator can act on.
 */

import {
  PLAN_UNITS_PER_METRE,
  corridors,
  duties,
  fleetGeometry,
  fleetRobots,
  fleetSimParams,
  palletMassRangeKg,
  robotTypes,
  stations,
  taskPriorities,
  toMetres,
  toPlanUnits,
} from '@/data/fleet'
import type {
  ChargerTelemetry,
  DockServiceBeat,
  FleetEvent,
  FleetEventKind,
  FleetMetrics,
  FleetRobotDef,
  FleetTelemetry,
  RobotRoutePath,
  RobotState,
  RobotTelemetry,
  RobotType,
  Station,
  TaskKind,
  TaskPriority,
  TaskTelemetry,
  WorkArea,
} from '@/data/fleet'
import { assertConnected, buildNavGraph, findRoute, routeLength } from './navGraph'
import type { ConnectivityReport, NavGraph, NavNode } from './navGraph'
import { TRAFFIC_PRIORITY, TrafficController } from './trafficControl'
import type { TrafficTelemetry } from './trafficControl'
import { AsrsSim } from './asrsSim'
import type { AsrsTelemetry } from './asrsSim'

// ─── Deterministic randomness ─────────────────────────────────────────────────

/**
 * mulberry32. Seeded on purpose: a run has to be reproducible, or a stall seen
 * once can never be looked at again.
 */
function makeRng (seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ─── Internals ────────────────────────────────────────────────────────────────

/**
 * One job. Its `kind` is a STAGE of the hall's flow, and the stage decides which
 * chassis may take it and which areas it may run between — see `duties` in
 * `src/data/fleet.ts`.
 */
interface Task {
  id: string
  kind: TaskKind
  cargoId: string
  massKg: number
  /** Chosen at assignment, not at creation — a queued task must not hold a bay. */
  fromStationId: string | null
  toStationId: string | null
  /**
   * The station the PREVIOUS stage left this cargo on.
   *
   * This is the whole of the cooperation between chassis: a container job handed
   * on by a finished pallet job knows exactly which bay the pallet was set down
   * on, so the AMR that comes for it is collecting the thing the forklift really
   * put there rather than an identical thing somewhere else. Honoured while the
   * station is free, then abandoned — see `chainPatienceSeconds`.
   */
  preferFrom: string | null
  /** Seconds spent queued. Only used to time out the pin above. */
  age: number

  // ── Priority ───────────────────────────────────────────────────────────────

  /**
   * How urgent this job is. Set at creation and NEVER changed afterwards.
   *
   * A task that could be promoted would make the queue's order unstable — a job
   * two units are already comparing themselves against would change rank
   * underneath them — and it would make "average emergency response" meaningless,
   * because the clock would start at a moment that moved.
   */
  priority: TaskPriority
  /** Simulated seconds at creation. The tie-break inside a priority level. */
  createdAt: number
  /** Simulated seconds when a unit committed to it, or null while queued. */
  assignedAt: number | null
  /** The unit holding it. Null while it is on the backlog. */
  holderId: string | null
  /**
   * This job was cancelled mid-run so its unit could take an emergency, and is
   * back on the backlog.
   *
   * Kept as a flag rather than inferred from `holderId` because the two are
   * genuinely different situations: a task that was never assigned is ordinary
   * backlog, and a task that was TAKEN OFF a robot is something an operator is
   * owed an explanation for.
   */
  interrupted: boolean
  /** The unit that intends to come back for it. Advisory — it may be beaten to it. */
  resumeUnitId: string | null
}

/**
 * ⚠️ THE `Lift` MODEL THAT USED TO LIVE HERE IS GONE, and it is worth knowing
 * why rather than rediscovering it. It was a one-axis stand-in for the ASRS —
 * a height, a target and a phase — written when the crane was a single unrigged
 * GLB that could only move as a whole. `src/sim/asrsSim.ts` replaced it with the
 * real two-axis machine (rail, then mast, sequenced), and for a while BOTH ran:
 * this file stepped lifts nobody drew while the store stepped a second engine
 * that everybody drew.
 *
 * Two things came of that, and neither was visible on screen:
 *
 *   · `stepLift` incremented the SAME completion counter as a delivered pallet,
 *     so the floor's headline "loads delivered" silently counted crane cycles.
 *     It disagreed with `metrics.tasksCompleted`, which never did.
 *   · the `store` stage's output went into a queue only the dead lifts read, so
 *     the real cranes never received a dispatched job and every crane frame
 *     reported `pending: true` for the whole run.
 *
 * `FleetSim` now owns the `AsrsSim` outright — see `asrs` below.
 */

/**
 * The unit's internal step. `RobotState` (what an operator sees) is derived from
 * this plus whether the unit is currently blocked — the public vocabulary is
 * fixed at eight values, and this is the finer detail behind them.
 */
type Phase =
  | 'parked'
  /**
   * Finished with a job and standing where it finished, off the traffic lane,
   * for a few seconds before doing anything else. This is what stops the floor
   * looking like sixteen robots in permanent motion: a unit that has just set a
   * pallet down waits beside it the way a real one would, and only then either
   * takes the next job or drives back to its bay.
   */
  | 'standby'
  | 'toPickup'
  | 'loading'
  | 'toDropoff'
  | 'unloading'
  | 'toCharger'
  /**
   * Every stall is taken, so the unit holds in its OWN waiting bay until one
   * frees up. Its own bay rather than a shared queueing area because that bay is
   * already exclusive to it, already off the traffic lane, and can never be
   * taken by the unit in front — a shared holding spot for sixteen units would
   * need floor the building does not have, and would be a queue that can jam.
   */
  | 'waitingForCharge'
  /** On the stall, aligning on the contacts before current flows. */
  | 'docking'
  | 'charging'
  /** Full and undocking. One beat, so leaving a stall is visible. */
  | 'chargingComplete'
  | 'toHome'
  | 'faulted'

  // ── The dock beat ──────────────────────────────────────────────────────────
  //
  // Four phases, and they are the IDLE half of a dock unit's life only. Working
  // a real job puts a dock unit through `toPickup`/`loading`/`toDropoff`/
  // `unloading` exactly like every other unit — it is dispatched from the same
  // queue under the same duty, and nothing below is consulted while it has a
  // task. What these replace is `parked`: the state an ordinary unit sits in
  // for minutes at a time and a dock unit is never allowed to reach.
  //
  // ⚠️ A UNIT IN ANY OF THESE IS AVAILABLE FOR WORK. See `isAvailable` — the
  // beat is abandoned the frame a job is handed over, mid-drive if need be,
  // because a bay that is patrolled while a trailer waits is worse than one that
  // is not patrolled at all.

  /** Running in to a bay on the beat — it has no task and nothing to unload. */
  | 'toDock'
  /** Standing on the bay for `dockServiceSeconds`, working the face. */
  | 'dockService'
  /** Driving to one of its beat's waiting positions. */
  | 'toWaitPoint'
  /** Standing on a waiting position, counting down to the next leg. */
  | 'waitingAtPoint'

interface Unit {
  def: FleetRobotDef
  type: RobotType
  phase: Phase
  x: number
  y: number
  /** Facing, radians clockwise from plan-north. Eased, never snapped. */
  heading: number
  /** Plan units per second. */
  speed: number

  /** The last node reached. Always valid, route or no route. */
  nodeId: string
  route: NavNode[] | null
  legIndex: number
  legDist: number

  task: Task | null
  goalStationId: string | null
  carrying: boolean
  payloadKg: number | null

  battery: number
  dwell: number
  /**
   * Seconds this unit will refuse a new job for, because it has only just
   * finished one. Counts down while parked or standing by; dispatch skips any
   * unit still holding one. See `fleetSimParams.idleDwellSecondsRange`.
   */
  idleSeconds: number
  /** Seconds blocked since the last re-plan — drives the reroute escalation. */
  waitSeconds: number
  /** Seconds blocked since the unit last actually moved — drives the stall escalation. */
  stuckSeconds: number
  blocked: boolean
  blockReason: string
  /** Whose way it is standing in — the input to deadlock detection. */
  blockedBy: string | null
  alert: string | null

  claim: string | null
  /**
   * The lane segment this unit occupies, as an undirected node pair.
   *
   * ⚠️ THIS IS WHAT REPLACED THE ONE-WAY GRID. The aisles are one vehicle
   * wide and therefore two-way, so a node claim alone no longer prevents a
   * head-on meeting: two units at opposite ends of a lane can each hold the
   * far node and drive straight into one another. A segment held exclusively
   * cannot be entered from either end, which rules that out — and rules out
   * rear-end conflict in the same stroke, since a block holds one unit.
   */
  segment: string | null
  /** While positive the unit refuses new claims, so a yield actually takes effect. */
  yieldSeconds: number
  /**
   * A stop the unit has finished with but is still physically standing on.
   * Released once it has actually driven clear — see `releaseVacatedStation`.
   */
  releaseOnDepart: string | null
  reserved: Set<string>
  avoid: Set<string>
  avoidSeconds: number
  faultCountdown: number
  /**
   * This unit is driving a short GIVE-WAY detour, not its assignment.
   *
   * Set when `stepAside` sends it to a neighbouring node to clear a lane for
   * somebody it is deadlocked with. It matters because arriving somewhere is
   * normally how a phase completes — without this flag a forklift that reversed
   * one node to let an AMR past would announce it had delivered its pallet.
   */
  detour: boolean
  /**
   * A stop this unit has taken purely to get out of somebody's way.
   *
   * Held like any other reservation while it shelters there, and handed back the
   * moment it drives off — see `stepAside` and the detour branch of
   * `arriveAtGoal`. It is tracked separately from `task`/`chargerId` because it
   * belongs to neither: the unit has no business at that station and must not
   * appear to.
   */
  laybyStationId: string | null

  // ── Dock service ───────────────────────────────────────────────────────────

  /**
   * This unit's dock posting, or null for the other fourteen.
   *
   * Copied off the def once at construction rather than read through `def` at
   * every use, so a dock unit is one truthy test in the hot paths instead of an
   * optional-chain into the dataset.
   */
  dock: DockServiceBeat | null
  /**
   * The beat stop this unit currently holds — a bay or a waiting position.
   *
   * ⚠️ TRACKED SEPARATELY FROM `task` AND `chargerId` FOR THE SAME REASON
   * `laybyStationId` IS. The unit is standing on a station it has no job at, so
   * every path that ends a beat has to hand it back explicitly; folding it into
   * the task reservations would leave a bay reserved to a unit that is halfway
   * across the hall on something else.
   *
   * ⚠️ SET EVEN WHEN THE STOP IS THE UNIT'S OWN WAITING BAY, which looks
   * redundant and is not. `releaseStation` refuses to take a unit's own bay
   * back, so nothing is leaked either way — but this field is also what
   * `resumePhase` reads to tell a beat leg apart from a drive home after a
   * fault. Left null for the home leg, a recovered dock unit resumes as `toHome`,
   * parks, and never patrols again.
   */
  patrolStationId: string | null
  /** Which half of the beat comes next. Alternates, so it never sits at one end. */
  patrolNext: 'dock' | 'wait'
  /** How far round `dockStationIds` it has worked. Advances on every dock leg. */
  patrolIndex: number
  /**
   * Seconds left standing on a waiting position.
   *
   * ⚠️ NOT `idleSeconds`, AND THE TWO MUST NOT BE MERGED. `idleSeconds` is the
   * window in which a unit REFUSES work; this is how long it stands before
   * moving on by itself. A dock unit is dispatchable for the whole of this
   * countdown, which is the entire point of the posting.
   */
  patrolWait: number
  /** Seconds spent on the current beat leg — see `dockLegTimeoutSeconds`. */
  patrolLegSeconds: number

  // ── Charging ───────────────────────────────────────────────────────────────

  /** This unit's own appetite for power, as a multiplier on every drain rate. */
  drainScale: number
  /** The stall it holds, is driving to, or is queued for. */
  chargerId: string | null
  /** Battery level when it docked — the baseline `progressPct` is measured from. */
  chargeStartPct: number
  /**
   * It has asked for a stall and is committed to charging.
   *
   * Separate from the phase because the request survives finishing a delivery:
   * a unit that drops below the request level mid-run keeps its cargo, completes
   * the drop, and only then heads for power.
   */
  wantsCharge: boolean
  /** Below the critical level — the task was abandoned and nothing else matters. */
  emergency: boolean

  /** Where it is parked while standing by, so it is not always its own bay. */
  parkingStationId: string | null

  // ── Priority scheduling ────────────────────────────────────────────────────
  //
  // ⚠️ NOTE THE NAME COLLISION AND KEEP IT STRAIGHT. `emergency` above is a FLAT
  // BATTERY. Everything below is about an urgent DELIVERY. They are unrelated
  // conditions with opposite meanings for dispatch — one unit cannot work, the
  // other is working on the most important thing in the building — so nothing
  // here is folded into that flag.

  /**
   * An emergency job this unit is committed to but has not started, because it
   * is still finishing the one in its hands.
   *
   * This is what "if all robots are busy, choose the robot that can finish
   * earliest" actually reserves. The task stays on the backlog — visible, and
   * still counting its wait — but is skipped by every other unit, so the choice
   * is not quietly re-made every frame by whichever unit happened to free up.
   */
  pendingPriorityTaskId: string | null
  /** How long it has been holding that reservation — see `emergencyHandoverPatienceSeconds`. */
  pendingPrioritySeconds: number

  /** The job this unit was pulled off, so it can go back for it. */
  previousTaskId: string | null
  /** That job in one line, kept because the task itself may be taken by another unit. */
  previousTaskLabel: string | null

  /**
   * Seconds left on a transient status — `assigned`, `taskInterrupted`,
   * `resumingPreviousTask`.
   *
   * ⚠️ THESE STATES NEED A TIMER OR THEY ARE INVISIBLE. Being handed a job and
   * starting to drive happen in the same frame, so "Assigned" derived purely
   * from position would flash for 16 ms and never be read on a wall display.
   * Holding it for a couple of seconds is what makes the transition legible —
   * and it changes nothing about the driving, which starts immediately.
   */
  statusHold: number
  statusHoldState: RobotState | null
}

// ─── Tuning that belongs to the driving model, not to the dataset ─────────────

/**
 * ⚠️ EVERY DISTANCE HERE IS DERIVED FROM THE LARGEST CHASSIS, in metres, and
 * converted once. None of them is a tuned plan-unit constant any more.
 *
 * The previous values were picked against a scale nothing else used: a 26-unit
 * hard gap was 0.55 m, which is a quarter of a forklift, so two queued units were
 * drawn two-thirds inside one another and no amount of retuning could have fixed
 * it. Deriving them means resizing the fleet respaces the traffic model with it.
 */
/** Inside this gap a unit stops dead rather than creeping. */
const HARD_GAP = toPlanUnits(fleetGeometry.followStopM)
/** How far off the centre line another unit still counts as "in my lane". */
const LANE_HALF_WIDTH = toPlanUnits(fleetGeometry.laneHalfWidthM)
/** Corners are taken at this fraction of top speed. */
const CORNER_SPEED_FACTOR = 0.42
/** Distance from a corner at which the unit is already slowed for it. */
const CORNER_LOOKAHEAD = toPlanUnits(fleetGeometry.envelopeM)
/** Max heading change per second, radians — keeps turns from snapping. */
const MAX_TURN_RATE = 3.2
/**
 * How many of the nearest free stations dispatch draws from. Big enough that a
 * whole rack run gets worked rather than its first few faces; small enough that
 * a unit is never sent past a free face to a further one for no reason.
 */
/**
 * ⚠️ RAISING THIS DOES NOTHING — MEASURED. Taking it from 5 to 8 produced lane
 * shares and task counts IDENTICAL to three decimal places on all three seeds,
 * because an area rarely has even five free stops at once: `Math.min(n, free.length)`
 * is already `free.length` almost every time it is evaluated. The shortlist is
 * effectively "every free stop in this area" as it stands, so it is not the
 * route-diversity lever it looks like.
 */
const STATION_SHORTLIST = 5

const TAU = Math.PI * 2

/** Shortest signed angular difference, so easing never takes the long way round. */
function angleDelta (from: number, to: number): number {
  let delta = (to - from) % TAU
  if (delta > Math.PI) delta -= TAU
  if (delta < -Math.PI) delta += TAU
  return delta
}

/** Heading of a plan-space vector, radians clockwise from plan-north. */
function headingOf (dx: number, dy: number): number {
  return Math.atan2(dx, -dy)
}

/**
 * Which chassis serves a stage, by name — for event text only.
 *
 * Derived from `robotTypes` rather than written out, so an event never names a
 * chassis that has stopped serving that stage. Falls back to a neutral word
 * rather than guessing: `store` is served by the fixed lifts and by nothing on
 * wheels, so there is no honest name to give.
 */
function robotTypeNameFor (kind: TaskKind): string {
  const type = Object.values(robotTypes).find(candidate => candidate.duty === kind)
  return type ? type.name.toLowerCase() : 'available unit'
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

export interface FleetSimOptions {
  seed?: number
  /**
   * Simulated seconds to run before the first frame is shown. The hall must look
   * like it has been working since the start of shift, not like it powered on
   * when someone opened the page — so the run starts mid-flow, with units spread
   * across the network, batteries drawn down and pallets already moving.
   */
  warmUpSeconds?: number
}

export class FleetSim {
  readonly graph: NavGraph
  readonly connectivity: ConnectivityReport

  private readonly stationsById = new Map<string, Station>()
  private readonly chargerStations: Station[] = []
  /**
   * Everywhere a unit may legitimately stand and wait — see `parkingFor`.
   *
   * Waiting bays only, for now. Rack faces and dock stops are excluded on
   * purpose: those sit ON the lane, so a unit parked at one is parked in the
   * middle of the road.
   */
  private readonly parkingStations: Station[] = []
  /** Stall id → unit ids waiting their turn, in order. See `joinChargeQueue`. */
  private readonly chargeQueues = new Map<string, string[]>()
  /**
   * Working stations grouped by the patch of hall they are in. Dispatch only
   * ever looks in the areas the unit's duty names, which is what keeps a chassis
   * inside its own part of the building without a rule that says so.
   */
  private readonly stationsByArea = new Map<WorkArea, Station[]>()

  /**
   * ── THE ONE AUTHORITY OVER SHARED ROAD ────────────────────────────────────
   *
   * Every lane block and every junction is reserved through this. It replaced
   * two plain `Map`s that did the same bookkeeping without being able to say
   * anything ABOUT it: they could refuse a unit but not tell you whether the
   * refusal was a head-on meeting, a crossing or an ordinary queue, could not
   * order two waiters by right of way, and could not report where the hall was
   * congested. All three of those are what the routing below now reads.
   */
  private readonly traffic: TrafficController

  /**
   * Who refused the most recent claim. Read straight after a `tryClaim` miss.
   *
   * ⚠️ THE ONLY THING KEPT OFF A REFUSAL, and the blocker's ID is kept because
   * `breakDeadlocks` cannot see a cycle without it. The grant also carries the
   * conflict KIND and the queue position; both were stored here beside this and
   * neither was ever read, so they are taken off the grant at the point of use
   * instead of being cached on the engine. A field nothing reads is worse than
   * absent — it reads as state the model maintains.
   */
  private lastClaimBlocker: string | null = null

  private readonly units: Unit[] = []
  private readonly unitsById = new Map<string, Unit>()

  // ⚠️ `claims` AND `segments` ARE GONE. Both were plain id→id maps and both are
  // now the traffic controller's ledger above — one table, one ordering rule and
  // one place that knows what a refusal MEANS. Reintroducing a second table here
  // would give the floor two authorities that disagree at exactly the moments
  // that matter.

  /** station id → unit id. Exclusive for the whole time it is needed. */
  private readonly stationHolder = new Map<string, string>()

  /**
   * ── THE FLEET'S TRAIL ─────────────────────────────────────────────────────
   *
   * node id → how heavily the fleet has driven through it lately, decaying.
   *
   * ⚠️ THIS IS WHAT STOPS SIXTEEN UNITS DRIVING ONE LINE. Congestion penalties
   * alone cannot: they only rise once units are ALREADY queueing, so the floor
   * has to jam before the planner learns anything, and the moment it clears
   * every unit is routed back down the same aisle to jam it again. The trail
   * records where traffic went whether or not it was held up, so the second unit
   * to want the centre spine is quoted a slightly longer spine and takes the
   * north aisle instead — before the queue forms rather than after.
   *
   * Decayed in `tick`, so it is a rolling picture rather than a permanent record
   * of where the fleet once drove.
   */
  private readonly trail = new Map<string, number>()

  /**
   * work area → how much of the hall's recent work has been sent there, decaying.
   *
   * The trail spreads ROUTES; this spreads DESTINATIONS, and the floor needs
   * both. Diversifying the way a unit drives to a bay does nothing if every unit
   * is still sent to the same third of the building — the routes fan out and
   * re-converge on one aisle at the end.
   */
  private readonly areaLoad = new Map<WorkArea, number>()

  /**
   * ── THE PRIORITY QUEUE ────────────────────────────────────────────────────
   *
   * ⚠️ THIS ARRAY IS KEPT SORTED, AND THAT IS THE WHOLE SCHEDULER. Every insert
   * goes through `enqueue`, which places the task by `taskPriorities[p].rank`
   * and then by `createdAt` — so "emergency beats high beats normal beats low,
   * ties oldest-first" is an invariant of the container rather than a comparison
   * anybody has to remember to make.
   *
   * That matters because dispatch reads it in three different places (ordinary
   * dispatch, emergency dispatch, resume) and a sort done at only two of them
   * would produce a floor that mostly honoured priority. Mostly is not a
   * priority system. `telemetry()` publishes this array in its own order for the
   * same reason: a panel that re-sorted could disagree with the model.
   */
  private readonly queue: Task[] = []

  /**
   * The stacker cranes, owned outright.
   *
   * ⚠️ ONE ENGINE, CONSTRUCTED HERE — it used to be a second engine held beside
   * this one in the store, stepped on the same clock and hoped to stay in step.
   * Owning it is what closes the dispatch seam: `handOn` hands the `store`
   * stage's output to `request()`, so a crane cycle is a job the flow actually
   * produced rather than one the crane invented, and `AsrsSim` stops flagging
   * its frames `pending`.
   *
   * It stays a SEPARATE CLASS, and that is not a half-measure. A crane takes no
   * transport task, holds no station, and is not on the road network; folding
   * its motion model into this file would put a machine that cannot drive into
   * the middle of the code that drives things. Ownership is the coupling; the
   * behaviour stays where it belongs.
   */
  private readonly asrs: AsrsSim

  /** Append-only, trimmed to `eventFeedLength`. See `FleetEvent`. */
  private readonly events: FleetEvent[] = []
  private eventSerial = 0
  /** Emergencies already reported as undispatchable — see `warnUnassignable`. */
  private readonly warnedUnassignable = new Set<string>()

  private readonly rng: () => number
  private taskCountdown = 0
  private taskSerial = 0
  private cargoSerial = 4800

  private elapsed = 0

  // ⚠️ A SECOND `completed` COUNTER USED TO LIVE HERE and is deleted rather than
  // left running. It was incremented beside `stats.deliveryCount` and read by
  // nothing — the residue of the era when the dead lift model shared a
  // completion counter with delivered pallets, which is the defect documented at
  // the top of this file. Two totals for one quantity is exactly how the roster
  // came to disagree with `metrics.tasksCompleted`; one of them has to be the
  // number, and it is `stats.deliveryCount`.

  /**
   * Running totals behind `FleetMetrics`.
   *
   * Sums and counts rather than stored averages: an average that is updated in
   * place cannot be recomputed if the definition changes, and these are read
   * once a frame by a panel that is entitled to know the window they cover.
   */
  private readonly stats = {
    created: 0,
    createdByPriority: { emergency: 0, high: 0, normal: 0, low: 0 } as Record<TaskPriority, number>,
    completedByPriority: { emergency: 0, high: 0, normal: 0, low: 0 } as Record<TaskPriority, number>,
    /** Creation → completion, summed over completed jobs. */
    deliverySecondsTotal: 0,
    deliveryCount: 0,
    /** Creation → a unit committing, summed over emergencies only. */
    emergencyResponseSecondsTotal: 0,
    emergencyResponseCount: 0,
    /** Creation → assignment, summed over every job that was ever assigned. */
    queueSecondsTotal: 0,
    queueCount: 0,
    /** Unit-seconds holding a task, and unit-seconds elapsed. */
    busyUnitSeconds: 0,
    totalUnitSeconds: 0,
    interrupted: 0,
    resumed: 0,
  }

  constructor (options: FleetSimOptions = {}) {
    this.rng = makeRng(options.seed ?? fleetSimParams.seed)
    this.graph = buildNavGraph(corridors, stations)
    this.connectivity = assertConnected(this.graph)

    // ⚠️ ONE BLOCK AT A TIME, AND IT IS THE BUILDING THAT SAYS SO. A block in
    // this hall averages 0.94 m and there are only two dozen of them; reserving
    // two ahead would let a handful of units hold half the warehouse against
    // units that were nowhere near it. `drive` therefore asks for the node and
    // the segment it is about to enter, at the moment it commits to them — see
    // the note where `reserveAhead` used to be in `trafficControl.ts`.
    this.traffic = new TrafficController({ graph: this.graph })

    // ⚠️ THE ROSTER *IS* THE FLEET SIZE, and there is no longer a second opinion.
    // A `capacity.ts` used to derive "how many units this layout can carry" from
    // the compiled graph, and a governor held the surplus in a standby pool. Both
    // are gone: every unit in `fleetRobots` works, all the time. Sizing the fleet
    // is now a decision a person makes by editing that array and running the soak,
    // which is the honest place for it — the derived number only ever steered the
    // governor, and a governor nothing consults is a number nothing reads.

    for (const station of stations) {
      this.stationsById.set(station.id, station)
      if (station.kind === 'charger') this.chargerStations.push(station)
      if (station.kind === 'hold') this.parkingStations.push(station)
      if (!station.area) continue
      const bucket = this.stationsByArea.get(station.area)
      if (bucket) bucket.push(station)
      else this.stationsByArea.set(station.area, [station])
    }

    // Seeded off the fleet's own seed so a replay replays the whole warehouse,
    // cranes included, rather than the fleet against a differently-random ASRS.
    this.asrs = new AsrsSim({ seed: options.seed ?? fleetSimParams.seed })

    for (const def of fleetRobots) {
      const home = this.stationsById.get(def.homeStationId)
      const nodeId = this.graph.stationNodes.get(def.homeStationId)
      if (!home || !nodeId) {
        throw new Error(`Robot "${def.id}" is homed to unknown waiting bay "${def.homeStationId}".`)
      }

      const unit: Unit = {
        def,
        type: robotTypes[def.typeId],
        phase: 'parked',
        x: home.x,
        y: home.y,
        heading: 0,
        speed: 0,
        nodeId,
        route: null,
        legIndex: 0,
        legDist: 0,
        task: null,
        goalStationId: null,
        carrying: false,
        payloadKg: null,
        battery: def.startBatteryPct,
        dwell: 0,
        idleSeconds: 0,
        waitSeconds: 0,
        stuckSeconds: 0,
        blocked: false,
        blockReason: '',
        blockedBy: null,
        alert: null,
        claim: nodeId,
        segment: null,
        yieldSeconds: 0,
        releaseOnDepart: null,
        // A unit permanently owns its own waiting bay, so standing down never
        // queues behind another unit for somewhere to park.
        reserved: new Set([def.homeStationId]),
        avoid: new Set(),
        avoidSeconds: 0,
        faultCountdown: this.exponential(fleetSimParams.faultMeanSecondsPerRobot),
        detour: false,
        laybyStationId: null,
        // The posting, read once. `patrolNext: 'dock'` starts the beat at a bay
        // rather than at a waiting position, so the docks are covered from the
        // first frame instead of a lap later.
        dock: def.dockService ?? null,
        patrolStationId: null,
        patrolNext: 'dock',
        patrolIndex: 0,
        patrolWait: 0,
        patrolLegSeconds: 0,
        // Drawn per unit so the fleet does not flatten in lockstep — see
        // `drainScaleRange` for why that matters more than it sounds.
        drainScale: fleetSimParams.drainScaleRange[0]
          + this.rng() * (fleetSimParams.drainScaleRange[1] - fleetSimParams.drainScaleRange[0]),
        chargerId: null,
        chargeStartPct: 0,
        wantsCharge: false,
        emergency: false,
        parkingStationId: null,
        pendingPriorityTaskId: null,
        pendingPrioritySeconds: 0,
        previousTaskId: null,
        previousTaskLabel: null,
        statusHold: 0,
        statusHoldState: null,
      }

      // A unit starts holding the bay node it is standing on — the invariant
      // every other reservation rests on (see `drive`).
      this.traffic.requestNode(def.id, nodeId, TRAFFIC_PRIORITY.empty.rank)
      this.stationHolder.set(def.homeStationId, def.id)
      this.units.push(unit)
      this.unitsById.set(def.id, unit)
    }

    this.warmUp(options.warmUpSeconds ?? 180)
  }

  // ── Public surface ────────────────────────────────────────────────────────

  /** Advance the model. `dt` is simulated seconds; the caller applies any scaling. */
  tick (dt: number): void {
    if (dt <= 0) return
    this.elapsed += dt

    // Both of these FORGET, and that is the point. The congestion field and the
    // fleet's trail are rolling pictures of the last minute or so of traffic; a
    // planner reading a permanent record would keep routing around an aisle that
    // cleared ten minutes ago.
    this.traffic.tick(dt)
    this.decayTrail(dt)
    this.decayAreaLoad(dt)

    this.generateTasks(dt)
    for (const task of this.queue) task.age += dt
    // ⚠️ EMERGENCIES ARE DISPATCHED FIRST, AND SEPARATELY. Ordinary dispatch
    // walks the UNITS and offers each one the queue; that is the right shape for
    // backlog work, and the wrong shape for an emergency — it would hand the job
    // to whichever free unit the loop reached first rather than to the nearest.
    // The emergency pass walks the TASKS instead and chooses a unit for each.
    this.dispatchEmergencies(dt)
    this.dispatch()
    // Same clock, same frame, inside the same engine — so a crane and the fleet
    // can never drift apart or be stepped a different number of times.
    this.asrs.tick(dt)

    // Rotating the start index each tick keeps first-come arbitration from
    // permanently favouring the same units at the same junctions.
    const offset = Math.floor(this.elapsed * 20) % this.units.length
    for (let i = 0; i < this.units.length; i++) {
      this.stepUnit(this.units[(i + offset) % this.units.length]!, dt)
    }

    this.accrueUtilisation(dt)

    // After everyone has moved, so the wait-for graph reflects this frame.
    this.breakDeadlocks()
  }

  telemetry (): FleetTelemetry {
    const tasks = this.reportTasks()
    return {
      elapsedSeconds: this.elapsed,
      robots: this.units.map(unit => this.reportUnit(unit)),
      chargers: this.reportChargers(),
      // ⚠️ THE DELIVERY COUNT, AND NOTHING ELSE IN IT. This is the number the
      // roster prints as loads delivered, and it used to be a second counter
      // that the dead lift model also incremented — so it disagreed with
      // `metrics.tasksCompleted` by however many crane cycles had run, and the
      // one on screen was the wrong one. Both now read the same total.
      tasksCompleted: this.stats.deliveryCount,
      tasksActive: this.units.reduce((n, u) => n + (u.task ? 1 : 0), 0),
      tasksQueued: this.queue.length,
      tasks,
      queuedByPriority: this.countByPriority(tasks),
      // A copy: the caller keeps this in reactive state, and handing out the
      // live array would let a trim mutate a rendered frame.
      events: [...this.events],
      metrics: this.reportMetrics(),
    }
  }

  /**
   * The selected unit's current assignment, split into driven and remaining —
   * the two halves the floor plan draws differently so progress reads at a
   * glance rather than as an ETA.
   */
  routeFor (robotId: string): RobotRoutePath | null {
    const unit = this.unitsById.get(robotId)
    if (!unit?.route || unit.route.length < 2) return null

    const here: [number, number] = [unit.x, unit.y]
    const travelled: Array<[number, number]> = unit.route
      .slice(0, unit.legIndex + 1)
      .map(node => [node.x, node.y] as [number, number])
    travelled.push(here)

    const ahead: Array<[number, number]> = [here]
    for (let i = unit.legIndex + 1; i < unit.route.length; i++) {
      const node = unit.route[i]!
      ahead.push([node.x, node.y])
    }

    return { travelled, ahead }
  }

  station (id: string): Station | undefined {
    return this.stationsById.get(id)
  }

  /**
   * The stacker cranes, one frame.
   *
   * ⚠️ BESIDE `FleetTelemetry`, NOT INSIDE IT — the same call the traffic
   * snapshot makes just below, and for the same reason. `FleetTelemetry` is the
   * contract a real fleet-management backend satisfies, and a fleet backend
   * publishes vehicles; fixed plant inside the racking is a different system with
   * a different owner. Keeping it a separate accessor also means the crane frame
   * never has to be widened to fit a shape that is not about cranes.
   *
   * This replaced a second `AsrsSim` constructed in the store. Both engines were
   * stepped on the same clock and were therefore *usually* in step — but nothing
   * enforced it, and only one of them could ever be handed a real job.
   */
  craneTelemetry (): AsrsTelemetry[] {
    return this.asrs.telemetry()
  }

  /**
   * The road network's live state — what is reserved, what is occupied, which
   * junctions are held and how deep the queues are.
   *
   * ⚠️ DELIBERATELY NOT PART OF `FleetTelemetry`. That interface is the contract
   * a real fleet-management backend would satisfy, and a backend publishes what
   * its ROBOTS are doing, not the internals of whoever arbitrated the aisles.
   * Traffic state is this simulation's own working, so it is offered beside the
   * frame rather than inside it — the maps and the soak read it explicitly, and
   * a real backend that has no such thing simply never calls this.
   *
   * A fresh object each call: the caller keeps it in reactive state.
   */
  trafficTelemetry (): TrafficTelemetry {
    return this.traffic.snapshot(
      id => this.unitsById.get(id)?.def.code ?? id,
      // OCCUPIED means the holder's body is inside the block; RESERVED means it
      // holds the block but has not entered it yet. A unit's `segment` is the one
      // it is physically in, which is exactly that distinction.
      (robotId, key) => this.unitsById.get(robotId)?.segment === key,
      this.traffic.proximityWarnings(this.units.map(unit => ({
        id: unit.def.code,
        x: unit.x,
        y: unit.y,
        // ⚠️ HALF THE BODY, NOT HALF THE ENVELOPE. The envelope is a TURNING
        // circle — the room a unit needs to spin on the spot — and it is the
        // right figure for following distance and for spacing stations. It is
        // the wrong figure for a collision monitor: at 1.99 m combined it flags
        // two AMRs whose bodies total 0.9 m as touching, which reported 55,000
        // breaches a run, nearly all of them machines parked in adjacent bays.
        // A monitor that cries wolf that often is a monitor nobody reads.
        safeRadius: toPlanUnits(unit.type.sizeM.lengthM) / 2,
        parked: unit.speed < 0.1 && this.graph.spurNodes.has(unit.nodeId),
      }))),
    )
  }

  // ── Task generation and dispatch ──────────────────────────────────────────

  private exponential (mean: number): number {
    return -mean * Math.log(1 - this.rng())
  }

  /**
   * Work ARRIVING at the building.
   *
   * Only three of the four stages are generated here, and only ever as new
   * cargo: the fourth (`store`) exists solely as the hand-on from a finished
   * cart job, and most of the hall's work comes from the chain rather than from
   * this function — see `handOn`. What this provides is inflow, so that a stage
   * whose feeder is stalled still has something to do.
   */
  private generateTasks (dt: number): void {
    this.taskCountdown -= dt
    if (this.taskCountdown > 0) return
    this.taskCountdown = this.exponential(fleetSimParams.taskIntervalSeconds)

    const roll = this.rng()
    const mix = fleetSimParams.arrivalMix
    const kind: TaskKind = roll < mix.pallet
      ? 'pallet'
      : roll < mix.pallet + mix.container ? 'container' : 'cart'

    this.enqueue(kind, null, this.rollPriority())
  }

  /**
   * Draw an urgency from `priorityMix`.
   *
   * Walked in the scheduler's own rank order rather than in object order, so the
   * cumulative bands line up with the table an operator reads. A separate rng
   * draw from the one that picks the stage, so changing the mix does not shuffle
   * which stages arrive — a reproducible run stays comparable across a tuning
   * change.
   */
  private rollPriority (): TaskPriority {
    const mix = fleetSimParams.priorityMix
    let roll = this.rng()
    for (const id of ['emergency', 'high', 'normal', 'low'] as TaskPriority[]) {
      roll -= mix[id]
      if (roll < 0) return id
    }
    return 'normal'
  }

  /**
   * Put a job on the backlog IN PRIORITY ORDER, unless the queue is already full.
   *
   * ⚠️ THE INSERT IS THE SCHEDULER. The task is placed ahead of everything it
   * outranks and behind everything of its own level that is older, so the array
   * is always in dispatch order and no consumer has to sort it. Linear scan is
   * correct here rather than merely adequate: the backlog is capped at eight.
   *
   * ⚠️ AN EMERGENCY IS NEVER REFUSED FOR SPACE. The two caps below exist to stop
   * a slow stage crowding out the others and to bound the backlog — neither is a
   * reason to drop an urgent delivery on the floor. When the queue is full an
   * emergency displaces the LOWEST-priority, NEWEST job instead, and that job is
   * dropped honestly rather than silently: the emergency is the thing an
   * operator raised, and a cap is a model parameter.
   */
  private enqueue (kind: TaskKind, preferFrom: string | null, priority: TaskPriority): void {
    const urgent = priority === 'emergency'

    if (!urgent) {
      if (this.queue.length >= fleetSimParams.maxQueuedTasks) return
      let inStage = 0
      for (const task of this.queue) if (task.kind === kind) inStage += 1
      if (inStage >= fleetSimParams.maxQueuedPerStream) return
    } else if (this.queue.length >= fleetSimParams.maxQueuedTasks) {
      // Last in the array is the lowest-ranked, newest job by construction.
      const victim = this.queue[this.queue.length - 1]
      if (!victim || victim.priority === 'emergency') return
      this.queue.pop()
    }

    const [minMass, maxMass] = palletMassRangeKg
    const task: Task = {
      id: `tk-${++this.taskSerial}`,
      kind,
      cargoId: `${duties[kind].cargoPrefix}-${++this.cargoSerial}`,
      massKg: Math.round(minMass + this.rng() * (maxMass - minMass)),
      fromStationId: null,
      toStationId: null,
      preferFrom,
      age: 0,
      priority,
      createdAt: this.elapsed,
      assignedAt: null,
      holderId: null,
      interrupted: false,
      resumeUnitId: null,
    }

    this.stats.created += 1
    this.stats.createdByPriority[priority] += 1
    this.insertByPriority(task)

    if (urgent) {
      this.raise('emergency-created', 'critical',
        `Emergency ${duties[kind].cargoNoun} ${task.cargoId} raised — assigning the nearest ${robotTypeNameFor(kind)}`,
        { taskId: task.id })
    }
  }

  /** The one place the queue's order is established. See `queue`. */
  private insertByPriority (task: Task): void {
    const rank = taskPriorities[task.priority].rank
    let at = this.queue.length
    for (let i = 0; i < this.queue.length; i++) {
      const other = this.queue[i]!
      const otherRank = taskPriorities[other.priority].rank
      if (otherRank > rank || (otherRank === rank && other.createdAt > task.createdAt)) {
        at = i
        break
      }
    }
    this.queue.splice(at, 0, task)
  }

  /**
   * Raise an emergency delivery on demand.
   *
   * The one public way into the queue, and it exists because 5 % of a 42-second
   * arrival mean is an emergency every fourteen minutes or so — long enough that
   * the whole emergency path would otherwise be unobservable on a screen someone
   * is actually watching. It creates exactly the job the random path creates;
   * there is no second code path and no privileged handling.
   *
   * Returns the task id, or null when the stage is not one a mobile unit serves.
   */
  raiseEmergency (kind: TaskKind = 'container'): string | null {
    if (kind === 'store') return null
    const before = this.taskSerial
    this.enqueue(kind, null, 'emergency')
    return this.taskSerial > before ? `tk-${this.taskSerial}` : null
  }

  /**
   * Hand the flow on to the next stage, at the place the cargo was left.
   *
   * This is the cooperation between chassis, and it is a real dependency inside
   * the model rather than a coincidence arranged for the screen: the container
   * job the AMR picks up is created BY the pallet job the forklift finished, AT
   * the bay the forklift finished it on.
   *
   * The chain ends honestly rather than being forced round. A container carried
   * into storage instead of to a workstation is put-away — it is finished goods
   * on a shelf, there is no cart to tug next, and inventing one would put a
   * robot on the floor moving something that is not there.
   *
   * ⚠️ URGENCY IS INHERITED, NOT REROLLED. The next stage of an emergency
   * delivery is still that emergency delivery — the pallet an operator escalated
   * has to reach the apron AND be broken down AND get to the line, and a chain
   * that dropped back to normal at the first hand-on would deliver the urgent
   * first leg and then let the rest queue behind ordinary work. That looks like
   * the emergency worked, right up until the delivery is late anyway.
   */
  private handOn (kind: TaskKind, droppedAt: string | null, priority: TaskPriority): void {
    const next = duties[kind].feeds
    if (!next) return

    // ── THE ASRS DISPATCH SEAM ────────────────────────────────────────────────
    //
    // A crane is not on the road network and takes no station, so a filing job is
    // never a task on the backlog — it is a cargo id handed straight to the
    // machine that will file it. `request` picks the shortest crane queue and
    // returns null when both are full, which is a real answer: the cargo stays
    // where the cart left it and the next hand-on tries again. Pushing it anyway
    // would be filing something into a machine that has not got room for it.
    //
    // ⚠️ THIS CALL IS WHAT MAKES A CRANE CYCLE REAL. Until it existed the cranes
    // ran on invented demand and flagged every frame `pending`, and this branch
    // fed a queue belonging to a lift model nothing drew.
    if (next === 'store') {
      this.asrs.request(`${duties.store.cargoPrefix}-${++this.cargoSerial}`)
      return
    }

    const station = droppedAt ? this.stationsById.get(droppedAt) : undefined
    const pinned = station?.area && duties[next].pickup.includes(station.area) ? station.id : null
    if (!pinned) return
    this.enqueue(next, pinned, priority)
  }

  // ── Events and metrics ────────────────────────────────────────────────────

  /**
   * Record something that happened.
   *
   * A log rather than a set of flags, because these are instants: "robot
   * reassigned" is true once and a surface that re-derived it from state would
   * either miss it between frames or repeat it forever. Ids are monotonic so a
   * consumer can show only what it has not shown yet.
   */
  private raise (
    kind: FleetEventKind,
    severity: FleetEvent['severity'],
    message: string,
    refs: { taskId?: string | null; robotId?: string | null } = {},
  ): void {
    this.events.push({
      id: ++this.eventSerial,
      kind,
      at: this.elapsed,
      message,
      severity,
      taskId: refs.taskId ?? null,
      robotId: refs.robotId ?? null,
    })
    // A feed, not a ledger: a run left open for hours must not grow without
    // bound, and nothing downstream reads further back than the panel shows.
    while (this.events.length > fleetSimParams.eventFeedLength) this.events.shift()
  }

  /**
   * Robot utilisation, accrued as unit-seconds rather than sampled.
   *
   * Sampling once a frame would make the figure depend on frame rate, which is
   * the caller's business and not the model's. Integrating against `dt` gives
   * the same answer at 20 Hz, at 60 Hz and in the soak's 20× replay.
   *
   * ⚠️ "HOLDING A TASK" IS THE DEFINITION, and it deliberately excludes driving
   * to a charger or back to a bay. Those are real work for the robot and not
   * work for the warehouse, and counting them would let a fleet that spent its
   * shift commuting report full utilisation.
   */
  private accrueUtilisation (dt: number): void {
    for (const unit of this.units) {
      this.stats.totalUnitSeconds += dt
      if (unit.task) this.stats.busyUnitSeconds += dt
    }
  }

  /** Book a completed job into the averages. One place, so the window is one window. */
  private recordCompletion (task: Task): void {
    this.stats.completedByPriority[task.priority] += 1
    this.stats.deliverySecondsTotal += Math.max(0, this.elapsed - task.createdAt)
    this.stats.deliveryCount += 1
  }

  /** Book the moment a unit commits to a job. */
  private recordAssignment (task: Task, unit: Unit): void {
    if (task.assignedAt === null) {
      task.assignedAt = this.elapsed
      this.stats.queueSecondsTotal += Math.max(0, this.elapsed - task.createdAt)
      this.stats.queueCount += 1
      // Response time is measured to the FIRST commitment, not to the pickup:
      // the question an operator asks is "has somebody got it", and re-measuring
      // on a resume would flatter a job that was handed round.
      if (task.priority === 'emergency') {
        this.stats.emergencyResponseSecondsTotal += Math.max(0, this.elapsed - task.createdAt)
        this.stats.emergencyResponseCount += 1
      }
    }
    task.holderId = unit.def.id
  }

  /**
   * A free station this unit may stop at, inside one of the given areas.
   *
   * AREA FIRST, THEN DISTANCE, and the order matters. Taking the nearest free
   * station across all the areas at once collapses a duty onto whichever area
   * happens to be closest — every AMR would deliver into the same aisle and the
   * far end of the hall would never see one. Choosing the area at random and
   * only then taking the nearest station inside it spreads the work over the
   * whole building while keeping each individual drive sensible.
   */
  private chooseStation (
    areas: readonly WorkArea[],
    unit: Unit,
    fromX: number,
    fromY: number,
    exclude?: string | null,
  ): Station | null {
    // ── LEAST-RECENTLY-WORKED AREA FIRST, THEN A ROTATION ────────────────────
    //
    // ⚠️ THE ROTATION ALONE WAS NOT ENOUGH TO SPREAD THE FLOOR. It gives every
    // area equal first refusal in the long run, but "in the long run" is not a
    // property any single minute of a shift has: a run of draws lands on the same
    // area several times over, that area's stops fill, and the units sent there
    // queue for each other while another area stands empty. What an operator sees
    // is robots clustered in one third of a hall that has three.
    //
    // So the areas are tried in order of how recently each was WORKED, and the
    // random rotation only breaks ties among equally-quiet ones. That keeps the
    // draw reproducible while making the spread a property of every minute rather
    // than of the average.
    const start = Math.floor(this.rng() * areas.length)
    const order = areas
      .map((area, index) => ({ area, index }))
      .sort((a, b) =>
        (this.areaLoad.get(a.area) ?? 0) - (this.areaLoad.get(b.area) ?? 0)
        || ((a.index + start) % areas.length) - ((b.index + start) % areas.length))

    for (const { area } of order) {
      const free: Array<{ station: Station; distance: number }> = []
      for (const station of this.stationsByArea.get(area) ?? []) {
        if (station.id === exclude) continue
        // ⚠️ THE ONE STOP A UNIT MAY BE OFFERED WHILE HOLDING IT IS ITS OWN BEAT
        // BAY — and the narrowness of that exception is the whole of this test,
        // not pedantry. Without any exception, a dock unit that has run in to a
        // bay on its round becomes the single unit in the building that cannot
        // be given the job waiting on that bay. With the obvious wide version —
        // "any stop this unit already holds" — the rule silently caught a stop
        // the unit is VACATING: `markVacating` leaves `stationHolder` pointing at
        // a unit that has finished with a face and not yet driven off it, so a
        // unit standing by beside a rack face could be handed that face as its
        // next pickup, and `releaseVacatedStation` would then release it out from
        // under its own new assignment the moment the unit moved. Another unit
        // gets routed to a stop this one is already committed to, two bodies
        // arrive at one coordinate, and the aisle behind them jams.
        //
        // It cost two seeds to find and it does not look like a station bug from
        // the outside: the floor simply stops delivering — 160 completed jobs
        // became 9, with every unit in `toDropoff` and none in `unloading`.
        const holder = this.stationHolder.get(station.id)
        const ownBeatBay = holder === unit.def.id
          && station.id === unit.patrolStationId
          && unit.releaseOnDepart !== station.id
        if (holder !== undefined && !ownBeatBay) continue
        if (station.types && !station.types.includes(unit.def.typeId)) continue
        free.push({ station, distance: Math.hypot(station.x - fromX, station.y - fromY) })
      }
      if (free.length === 0) continue

      // ── AND THEN A SHORTLIST, NOT THE SINGLE NEAREST ──────────────────────
      //
      // Strictly nearest looked right and quietly wore a groove in the floor.
      // Every unit of a type parks in the same rank, so every unit measures the
      // same distances and reaches the same answer: a handful of faces nearest
      // the median were worked over and over while faces forty units further on
      // went a whole shift untouched. Nothing was broken — the rule was just
      // deterministic, and a deterministic rule applied to sixteen units with
      // similar positions is one unit's behaviour copied sixteen times.
      //
      // Drawing from the nearest few keeps each drive short while letting the
      // whole run get used. One rng draw, so a run stays reproducible.
      free.sort((a, b) => a.distance - b.distance)
      const shortlist = Math.min(STATION_SHORTLIST, free.length)
      const chosen = free[Math.floor(this.rng() * shortlist)]!.station
      // Charged when the stop is CHOSEN rather than when it is reached, so the
      // next unit dispatched in the same frame already sees this area as busier.
      // Charging on arrival would let a whole dispatch pass pile into one zone.
      this.areaLoad.set(area, (this.areaLoad.get(area) ?? 0) + 1)
      return chosen
    }
    return null
  }

  /**
   * Let the per-area load fade, so "recently worked" means recently.
   *
   * Same shape and the same reasoning as the trail: a permanent tally would make
   * the first few minutes of a run decide where the fleet works for the rest of
   * it, and an area that went quiet an hour ago would keep drawing units that
   * have nothing to do there.
   */
  private decayAreaLoad (dt: number): void {
    const keep = Math.exp(-(Math.LN2 / fleetSimParams.trailHalfLifeSeconds) * dt)
    for (const [area, load] of this.areaLoad) {
      const next = load * keep
      if (next < 0.02) this.areaLoad.delete(area)
      else this.areaLoad.set(area, next)
    }
  }

  /**
   * Give every free unit a job from its own stage.
   *
   * A unit is only ever offered work of the ONE stage its chassis serves, drawn
   * between the areas that stage runs across, so the assignment itself is what
   * keeps the floor organised. There is no rule anywhere telling a forklift to
   * stay near the racking.
   */
  private dispatch (): void {
    if (this.queue.length === 0) return

    // ⚠️ ROTATE THE ROSTER, FOR THE SAME REASON `tick` ROTATES IT. Walking the
    // units in declaration order every frame does not merely favour the early
    // ones — it STARVES the late ones, because stations are exclusive and the
    // two stages share them: the pallet stage drops on the loading bays and the
    // container stage collects from them. Six forklifts asking first, every
    // frame, held all four bays continuously and the six AMRs were dispatched
    // once in forty-five simulated minutes. Rotating costs nothing and is what
    // lets both halves of the flow run. (Ordering WITHIN the queue is untouched:
    // that is priority, and it is not up for negotiation. This rotates only who
    // gets asked first among units that are equally free.)
    const offset = Math.floor(this.elapsed * 3) % this.units.length

    for (let step = 0; step < this.units.length; step++) {
      const unit = this.units[(step + offset) % this.units.length]!
      if (this.queue.length === 0) break
      if (!this.isAvailable(unit)) continue

      const duty = duties[unit.type.duty]

      // ⚠️ THE QUEUE IS ALREADY IN PRIORITY ORDER (see `queue`), so walking it
      // front to back and taking the first job this chassis can serve IS the
      // priority rule. There is deliberately no second sort here: two places
      // ordering the same list is how the two come to disagree.
      for (let i = 0; i < this.queue.length; i++) {
        const task = this.queue[i]!
        if (task.kind !== duty.kind) continue
        // Held for the unit that was picked to run it — see `dispatchEmergencies`.
        if (task.resumeUnitId && task.resumeUnitId !== unit.def.id) continue
        if (this.assignTask(unit, task)) break
      }
    }
  }

  /**
   * Is this unit free to take work right now?
   *
   * Standing by counts — a unit that has just set a pallet down takes the next
   * job from where it stands rather than commuting to a bay first — but only
   * once its idle pause has elapsed.
   */
  private isAvailable (unit: Unit): boolean {
    // ⚠️ A DOCK UNIT ON ITS BEAT IS AVAILABLE, INCLUDING MID-DRIVE. The three
    // moving beat phases are listed here on purpose: the beat exists so the bays
    // are covered while the floor is quiet, and a unit that had to finish a lap
    // of it before it could be sent to a trailer would be servicing the docks in
    // name and holding work up in fact. `assignTask` hands the beat's stop back
    // and re-plans from wherever the unit has got to — it is carrying nothing, so
    // there is nothing to abandon.
    //
    // `dockService` is deliberately NOT in the list. That phase is a dwell, and
    // `stepUnit` returns early while `dwell` runs; a task assigned into it would
    // have its phase overwritten and then be finished by the dwell that was
    // already counting down. It is at most `dockServiceSeconds` away from being
    // available again.
    const onBeat = unit.dock !== null
      && (unit.phase === 'toDock' || unit.phase === 'toWaitPoint' || unit.phase === 'waitingAtPoint')

    if (!onBeat && unit.phase !== 'parked' && unit.phase !== 'standby') return false
    if (unit.dwell > 0) return false
    if (unit.task || unit.idleSeconds > 0) return false
    if (unit.battery < fleetSimParams.reserveChargePct) return false
    // A unit that has asked for a stall is spoken for, however healthy its
    // battery still looks. Dispatching it would send it across the hall on a job
    // it has already decided it cannot finish, and — worse — it would keep its
    // place in a charge queue the whole time it was away.
    if (unit.wantsCharge) return false
    return true
  }

  /**
   * Commit one unit to one job: choose its two stations, reserve them, and set
   * it driving. The single place a task moves from the queue onto a robot.
   *
   * Returns false when the job cannot be started right now — no free pick face,
   * no free drop-off, or a hand-on pin still worth waiting for — in which case
   * nothing has been mutated and the caller simply tries the next task.
   */
  private assignTask (unit: Unit, task: Task): boolean {
    const duty = duties[task.kind]

    // Honour the hand-on while it is still plausible. A pinned bay that is busy
    // is usually busy with the unit that is still standing on it, so waiting a
    // few seconds is right; waiting forever is not.
    let from: Station | null = null
    if (task.preferFrom && !this.stationHolder.has(task.preferFrom)) {
      const pinned = this.stationsById.get(task.preferFrom)
      if (pinned && (!pinned.types || pinned.types.includes(unit.def.typeId))) from = pinned
    } else if (task.preferFrom && task.age < fleetSimParams.chainPatienceSeconds
      // ⚠️ AN EMERGENCY DOES NOT WAIT FOR ITS PIN. The pin is a nicety that makes
      // the chain look cooperative; an urgent delivery held up by it would be the
      // priority system losing to a cosmetic preference.
      && task.priority !== 'emergency') {
      return false
    }

    from ??= this.chooseStation(duty.pickup, unit, unit.x, unit.y)
    // ⚠️ AN EMERGENCY PREEMPTS A STOP, NOT ONLY A ROBOT. Stations are exclusive
    // and this building has thirteen working ones, so on a busy floor the thing
    // that stops an urgent job starting is not a shortage of robots — it is that
    // every pick face is spoken for. Without this an emergency sat at the head
    // of a correctly-ordered queue for twenty-six simulated minutes while the
    // scheduler did exactly as it was told.
    from ??= this.preemptStation(unit, task, duty.pickup)
    if (!from) return false

    let to = this.chooseStation(duty.dropoff, unit, from.x, from.y, from.id)
    to ??= this.preemptStation(unit, task, duty.dropoff, from.id)
    if (!to) return false

    const at = this.queue.indexOf(task)
    if (at >= 0) this.queue.splice(at, 1)
    // Off the backlog, so it can never be reported undispatchable again — and
    // the set that remembers it was does not accumulate an entry per emergency
    // for the lifetime of a wall display left running. See `warnUnassignable`.
    this.warnedUnassignable.delete(task.id)

    // ⚠️ THE BEAT ENDS HERE, AND NOT ONE LINE EARLIER. Everything above can
    // still return false — a taken pick face, a pin worth waiting for — and a
    // unit that had already handed its beat stop back would be left driving to a
    // bay it no longer holds. From this point the assignment is committed, so
    // this is the first moment it is safe to let go.
    this.endPatrol(unit, from.id, to.id)

    task.fromStationId = from.id
    task.toStationId = to.id
    task.interrupted = false

    this.stationHolder.set(from.id, unit.def.id)
    this.stationHolder.set(to.id, unit.def.id)
    unit.reserved.add(from.id)
    unit.reserved.add(to.id)

    // Taken out from under another unit — either its intended resume or an
    // emergency it was reserved for. Either way that unit is told, rather than
    // being left holding a promise its panel would keep displaying.
    if (task.resumeUnitId && task.resumeUnitId !== unit.def.id) {
      const jilted = this.unitsById.get(task.resumeUnitId)
      if (jilted?.pendingPriorityTaskId === task.id) {
        jilted.pendingPriorityTaskId = null
        jilted.pendingPrioritySeconds = 0
      }
    }
    if (unit.previousTaskId !== task.id) {
      for (const other of this.units) {
        if (other === unit || other.previousTaskId !== task.id) continue
        this.raise('task-resumed', 'info',
          `${other.def.code} will not resume ${other.previousTaskLabel ?? task.cargoId}`
          + ` — ${unit.def.code} picked it up first`,
          { taskId: task.id, robotId: other.def.id })
        other.previousTaskId = null
        other.previousTaskLabel = null
      }
    }
    task.resumeUnitId = null

    this.recordAssignment(task, unit)
    unit.task = task
    unit.alert = null
    if (unit.pendingPriorityTaskId === task.id) {
      unit.pendingPriorityTaskId = null
      unit.pendingPrioritySeconds = 0
    }

    if (unit.previousTaskId === task.id) {
      this.stats.resumed += 1
      this.raise('task-resumed', 'info',
        `${unit.def.code} resumed ${this.labelOfTask(task)} after its emergency run`,
        { taskId: task.id, robotId: unit.def.id })
      unit.previousTaskId = null
      this.holdStatus(unit, 'resumingPreviousTask')
    } else {
      this.holdStatus(unit, 'assigned')
    }

    this.beginPhase(unit, 'toPickup', from.id)
    return true
  }

  // ── Emergency dispatch ────────────────────────────────────────────────────

  /**
   * ── URGENT DELIVERIES ────────────────────────────────────────────────────
   *
   * ⚠️ THIS PASS IS TASK-FIRST, AND ORDINARY DISPATCH IS UNIT-FIRST. That is
   * the whole reason it is a separate function rather than a branch inside the
   * loop below. Walking units and offering each the queue gives the job to
   * whichever free unit the loop happens to reach first, which for backlog work
   * is fine and for an emergency is the wrong robot: "assign the nearest
   * available robot" is a question you can only answer by looking at all of them
   * at once, for one specific job.
   *
   * The order of preference, and each step is a different situation:
   *
   *   1. A FREE unit of the right chassis, nearest by approach distance.
   *   2. A unit on a LOW-priority job it has not yet picked up — interrupted,
   *      its job returned to the queue, and reassigned now.
   *   3. The busy unit that can FINISH EARLIEST, reserved for the job so no
   *      other unit takes it and no other emergency double-books it.
   *
   * A unit already CARRYING is never in steps 2 or 3's interrupt path, whatever
   * its job's priority: the only place it could put the load down is a bay
   * reserved for its own delivery, so "cancel safely" has no safe outcome.
   */
  private dispatchEmergencies (dt: number): void {
    this.ageReservations(dt)
    if (this.queue.length === 0) return

    for (const task of [...this.queue]) {
      // The queue is sorted, so a `break` would work — but this pass must stay
      // correct even if somebody adds an unsorted insert, because the failure
      // would be an emergency silently never dispatched.
      if (task.priority !== 'emergency') continue
      // ⚠️ A RESERVED EMERGENCY IS RE-EXAMINED EVERY TICK, not skipped. The
      // reservation is a bet that a busy unit will finish soonest; if a unit
      // actually frees up in the meantime it can start NOW, which beats any
      // prediction. Skipping reserved jobs made the emergency wait out the full
      // `emergencyHandoverPatienceSeconds` beside an idle robot.
      this.assignEmergency(task)
    }
  }

  /**
   * Count down each emergency reservation, and drop it when it goes stale.
   *
   * Picking "the unit that can finish earliest" is a bet on an estimate. If that
   * unit then jams in an aisle, the emergency is waiting behind a prediction
   * that stopped being true — so the reservation expires and the choice is made
   * again against what is actually happening.
   */
  private ageReservations (dt: number): void {
    for (const unit of this.units) {
      if (!unit.pendingPriorityTaskId) continue
      unit.pendingPrioritySeconds += dt

      const task = this.queue.find(candidate => candidate.id === unit.pendingPriorityTaskId)
      const expired = unit.pendingPrioritySeconds > fleetSimParams.emergencyHandoverPatienceSeconds
      if (task && !expired) continue

      if (task?.resumeUnitId === unit.def.id) task.resumeUnitId = null
      unit.pendingPriorityTaskId = null
      unit.pendingPrioritySeconds = 0
    }
  }

  private assignEmergency (task: Task): void {
    const eligible = this.units.filter(unit =>
      unit.type.duty === task.kind
      && unit.phase !== 'faulted'
      && !unit.emergency
      && unit.battery >= fleetSimParams.reserveChargePct)

    if (eligible.length === 0) {
      this.warnUnassignable(task, 'no unit of the required chassis is available')
      return
    }

    // ── 1 · The nearest FREE unit ──────────────────────────────────────────
    let bestFree: Unit | null = null
    let bestFreeCost = Infinity
    for (const unit of eligible) {
      if (!this.isAvailableForEmergency(unit)) continue
      const cost = this.approachSeconds(unit, task, unit.x, unit.y)
      if (cost < bestFreeCost) {
        bestFreeCost = cost
        bestFree = unit
      }
    }

    if (bestFree) {
      const wasCharging = bestFree.chargerId !== null
      if (wasCharging) this.pullOffCharge(bestFree)
      if (this.assignTask(bestFree, task)) {
        this.raise('robot-reassigned', 'critical',
          `${bestFree.def.code} assigned to emergency ${task.cargoId}`
          + (wasCharging ? ' — pulled off charge' : ' — nearest available unit'),
          { taskId: task.id, robotId: bestFree.def.id })
        return
      }
      // Stations were all taken this frame. Fall through and consider the busy
      // units rather than declaring the emergency unassignable on a near miss.
    }

    // ── 2 and 3 · The busy ones, by when they could actually start ──────────
    let best: Unit | null = null
    let bestCost = Infinity
    let bestInterruptible = false

    for (const unit of eligible) {
      if (!unit.task) continue
      if (unit.pendingPriorityTaskId && unit.pendingPriorityTaskId !== task.id) continue

      const interruptible = this.canInterrupt(unit)
      const readyIn = interruptible ? 0 : this.secondsToFinish(unit)
      const fromX = interruptible ? unit.x : this.stationXY(unit.task.toStationId)?.[0] ?? unit.x
      const fromY = interruptible ? unit.y : this.stationXY(unit.task.toStationId)?.[1] ?? unit.y
      const cost = readyIn + this.approachSeconds(unit, task, fromX, fromY)

      if (cost < bestCost) {
        bestCost = cost
        best = unit
        bestInterruptible = interruptible
      }
    }

    if (!best) {
      // Every capable unit is carrying. There is no standby pool to fall back on
      // any more — all five units are always in service — so the honest answer is
      // that the job waits for one of them to put its load down.
      this.warnUnassignable(task, 'every capable unit is carrying a load')
      return
    }

    if (bestInterruptible) {
      // Read before the interrupt: afterwards the unit no longer holds the job.
      const displaced = taskPriorities[best.task!.priority].label.toLowerCase()
      if (this.interruptFor(best, task) && this.assignTask(best, task)) {
        this.raise('robot-reassigned', 'critical',
          `${best.def.code} reassigned to emergency ${task.cargoId}`
          + ` — its ${displaced}-priority job was returned to the queue`,
          { taskId: task.id, robotId: best.def.id })
      }
      return
    }

    // ⚠️ THERE IS NO LONGER ANYWHERE ELSE TO LOOK. This used to branch: if the
    // best busy unit's own estimate exceeded the time we were willing to hold a
    // reservation for, the bet was judged lost and a unit was woken out of the
    // standby pool instead. With every unit permanently in service the pool is
    // gone, so a long estimate is simply the true answer — the emergency waits
    // for the unit that will genuinely free up first, and `ageReservations` keeps
    // re-running the choice as the estimates move.
    //
    // Reserved, not assigned. The task stays visible on the backlog and keeps
    // counting its wait — an emergency that vanished into a robot's plans while
    // still unstarted would be the one thing an operator must not have to guess.
    if (best.pendingPriorityTaskId !== task.id) {
      best.pendingPriorityTaskId = task.id
      best.pendingPrioritySeconds = 0
      task.resumeUnitId = best.def.id
      this.raise('robot-reassigned', 'warning',
        `${best.def.code} reserved for emergency ${task.cargoId}`
        + ` — finishing its current run first (est. ${Math.round(bestCost)} s)`,
        { taskId: task.id, robotId: best.def.id })
    }
  }

  /**
   * Free enough to be handed an emergency.
   *
   * Wider than `isAvailable` in exactly two ways, and both are deliberate:
   *
   *   • THE IDLE DWELL IS IGNORED. That pause exists so the floor does not look
   *     frantic; it is a cosmetic delay and has no business holding up an urgent
   *     delivery.
   *   • A UNIT ON CHARGE COUNTS, provided it is already above the reserve level.
   *     A robot sitting at 60 % on a stall is a usable robot, and leaving an
   *     emergency queued beside one would be the model preferring its own
   *     housekeeping to the job it was told was critical. Below reserve it is
   *     genuinely not available and stays put.
   */
  private isAvailableForEmergency (unit: Unit): boolean {
    if (unit.task) return false
    if (unit.battery < fleetSimParams.reserveChargePct) return false
    if (unit.phase === 'parked' || unit.phase === 'standby') return true
    return unit.phase === 'charging' && unit.battery >= fleetSimParams.reserveChargePct
  }

  /**
   * ── TAKING A STOP OFF A LESS URGENT JOB ──────────────────────────────────
   *
   * Only for emergencies, and it is a RE-ROUTE rather than an interruption: the
   * displaced job keeps its cargo, its unit and its place in the world, and is
   * simply pointed at a different bay of the same kind. Nothing is cancelled and
   * nothing goes back on the queue, so this is not the "interrupt a low-priority
   * task" rule wearing a disguise — it is the ordinary business of a dispatcher
   * who has two jobs and one free face.
   *
   * FOUR CONDITIONS, and each rules out a way this could go wrong:
   *
   *   1. THE HOLDER'S JOB MUST BE LESS URGENT. An emergency never displaces
   *      another emergency; ties are left alone so two urgent jobs cannot spend
   *      the run swapping one face between them.
   *   2. THE HOLDER MUST NOT HAVE ARRIVED. Taking a stop from a unit already
   *      standing on it means two machines at one coordinate.
   *   3. IT MUST NOT BE THE HOLDER'S CURRENT DESTINATION UNDER LOAD. A unit
   *      carrying cargo to a drop-off can be re-pointed; a unit that has begun
   *      loading or unloading cannot, because the cargo is mid-transfer.
   *   4. SOMEWHERE ELSE MUST EXIST FOR IT. If there is no replacement the
   *      preemption is abandoned — moving the problem onto another job is not
   *      solving it, and a displaced unit with nowhere to go is a stranded one.
   */
  private preemptStation (
    unit: Unit,
    task: Task,
    areas: readonly WorkArea[],
    exclude?: string | null,
  ): Station | null {
    if (task.priority !== 'emergency') return null
    const urgency = taskPriorities[task.priority].rank

    for (const area of areas) {
      for (const station of this.stationsByArea.get(area) ?? []) {
        if (station.id === exclude) continue
        if (station.types && !station.types.includes(unit.def.typeId)) continue

        const holderId = this.stationHolder.get(station.id)
        if (!holderId || holderId === unit.def.id) continue
        const holder = this.unitsById.get(holderId)

        // ── 0 · A BAY HELD BY A DOCK UNIT'S ROUND IS SIMPLY TAKEN BACK ────────
        //
        // Checked BEFORE the `holder.task` test below, and that ordering is the
        // whole fix. A patrolling unit holds the bay with no job behind it, so
        // the four conditions below — all of them phrased in terms of the
        // holder's task — skipped it outright and the bay became the one stop in
        // the building an emergency could not take. The `loading` area is the
        // hall's pinch point, so on a saturated seed that inverted the priority
        // system exactly as the pre-existing note two blocks down describes:
        // 270 s to assign an emergency against 118 s for ordinary work, with one
        // waiting 33 minutes beside a robot that had no job at all.
        //
        // Nothing has to be displaced or re-routed here — that machinery exists
        // because a held stop usually has cargo depending on it, and a round has
        // none. The unit hands the bay straight back and works its next leg.
        if (this.yieldBeatStop(holder, station)) {
          this.stationHolder.set(station.id, unit.def.id)
          unit.reserved.add(station.id)
          this.raise('robot-reassigned', 'info',
            `${holder!.def.code} gave up ${station.label} for emergency ${task.cargoId}`
            + ' — it was on its dock service round, not a job',
            { taskId: task.id, robotId: holder!.def.id })
          return station
        }

        if (!holder?.task) continue

        // 1 · less urgent only
        if (taskPriorities[holder.task.priority].rank <= urgency) continue

        // 2 and 3 · not arrived, and not mid-transfer.
        //
        // ⚠️ AN ALLOW-LIST, NOT A DENY-LIST. Only a unit actually DRIVING a job
        // can be re-pointed. A deny-list ("not loading, not unloading") let
        // through every other phase a unit can hold while still owning a
        // station — faulted, charging, standing by — and re-planning one of
        // those would send a robot on its way to a charger to a rack face
        // instead, in a phase that means something else entirely.
        if (holder.phase !== 'toPickup' && holder.phase !== 'toDropoff') continue
        // ⚠️ AND NOT ALREADY STANDING ON IT. Phase alone is not proof of absence:
        // a unit reaches its stop a frame or more before `arriveAtGoal` converts
        // `toPickup` into `loading`, and inside that window it is physically on
        // the station while still reporting that it is driving to it. Handing
        // the stop to somebody else there puts two machines at one coordinate —
        // which is exactly what the soak caught, at 0.00 m.
        if (this.graph.stationNodes.get(station.id) === holder.nodeId) continue
        const isHoldersPickup = holder.task.fromStationId === station.id
        const isHoldersDropoff = holder.task.toStationId === station.id
        if (!isHoldersPickup && !isHoldersDropoff) continue
        // Its pickup is only free to take while it has not collected yet.
        if (isHoldersPickup && (holder.carrying || holder.phase !== 'toPickup')) continue
        // Its drop-off is free to re-point right up until it is unloading, which
        // condition 3 has already excluded.
        if (isHoldersDropoff && holder.goalStationId === station.id
          && this.onFinalLeg(holder)) continue

        // 4 · somewhere else for the displaced job to go
        const holderDuty = duties[holder.task.kind]
        const replacement = this.chooseStation(
          isHoldersPickup ? holderDuty.pickup : holderDuty.dropoff,
          holder,
          holder.x,
          holder.y,
          isHoldersPickup ? holder.task.toStationId : holder.task.fromStationId,
        )
        if (!replacement || replacement.id === station.id) {
          // ── NOWHERE TO MOVE IT TO ─────────────────────────────────────────
          //
          // On a floor where every stop is held there is no gentle answer, and
          // this is the case the sanctioned interrupt exists for: if the holder
          // is running LOW-priority work and has not picked up, its job goes
          // back on the queue and both its stops come free. `canInterrupt` is
          // the single authority on whether that is allowed — the cargo rule
          // and the rank limit both live there, so this cannot become a way
          // round either.
          //
          // Without it the priority system inverted on a saturated seed:
          // emergencies averaged 229 s to assignment against 120 s for ordinary
          // work, because ordinary work had already taken every face.
          if (!this.canInterrupt(holder)) continue
          const displaced = taskPriorities[holder.task.priority].label.toLowerCase()
          if (!this.interruptFor(holder, task)) continue
          this.raise('robot-reassigned', 'critical',
            `${holder.def.code} stood down at ${station.label} for emergency ${task.cargoId}`
            + ` — its ${displaced}-priority job was returned to the queue and the hall has no free stop`,
            { taskId: task.id, robotId: holder.def.id })
          this.stationHolder.set(station.id, unit.def.id)
          unit.reserved.add(station.id)
          return station
        }

        // ── Hand it over ────────────────────────────────────────────────────
        this.releaseStation(holder, station.id)
        this.stationHolder.set(replacement.id, holder.def.id)
        holder.reserved.add(replacement.id)
        if (isHoldersPickup) holder.task.fromStationId = replacement.id
        else holder.task.toStationId = replacement.id

        // Re-plan only if the holder was actually driving to the stop it lost.
        // Re-planning one it was not heading for would throw away a route it is
        // partway through for no reason.
        if (holder.goalStationId === station.id) {
          this.beginPhase(holder, holder.phase, replacement.id)
        }

        this.raise('robot-reassigned', 'warning',
          `${holder.def.code} re-routed to ${replacement.label}`
          + ` — ${station.label} taken for emergency ${task.cargoId}`,
          { taskId: task.id, robotId: holder.def.id })

        this.stationHolder.set(station.id, unit.def.id)
        unit.reserved.add(station.id)
        return station
      }
    }
    return null
  }

  /**
   * Take a bay back off a dock unit that is only visiting it on its round.
   *
   * Returns true when the stop is now free for the caller to claim, having
   * released it and put the unit onto another leg in the same step — so there is
   * no frame in which the bay belongs to nobody.
   *
   * ⚠️ NOT WHEN IT HAS ARRIVED. A unit physically standing on the bay cannot
   * hand it over: the next unit is routed straight in at full speed and the two
   * end up at one coordinate, which is the same failure condition 2 of
   * `preemptStation` exists to prevent. It is at most `dockServiceSeconds` away
   * from moving off by itself, which is a far better answer than a collision.
   */
  private yieldBeatStop (holder: Unit | undefined, station: Station): boolean {
    if (!holder?.dock || holder.task) return false
    if (holder.patrolStationId !== station.id) return false

    const goalNode = this.graph.stationNodes.get(station.id)
    // Standing on it.
    if (goalNode === holder.nodeId) return false
    // ⚠️ AND NOT COMMITTED TO THE LEG THAT ENDS ON IT. Phase and position are
    // both insufficient here: a unit mid-leg cannot stop dead and turn round, so
    // `planTo` deliberately keeps the leg it is already driving and appends the
    // new route after it. Yield the bay to somebody else while that leg is in
    // flight and the dock unit drives onto the bay node regardless, arriving on
    // a stop that now belongs to the unit routed in behind it — two bodies at
    // one coordinate, which is the invariant the soak checks at 0.00 m.
    const route = holder.route
    if (route && holder.legIndex + 1 < route.length
      && route[holder.legIndex + 1]!.id === goalNode) return false

    holder.patrolStationId = null
    holder.patrolWait = 0
    // A pending vacate for this stop is dropped with it — the release below is
    // unconditional and immediate, so there is nothing left to hand back later.
    if (holder.releaseOnDepart === station.id) holder.releaseOnDepart = null
    this.stationHolder.delete(station.id)
    holder.reserved.delete(station.id)

    // Straight onto the next leg. `patrolNext` is already 'wait' — it is set when
    // the dock leg begins — so this cannot re-claim the bay it has just given up.
    this.beginPatrol(holder)
    return true
  }

  /** Take a unit off a stall for an emergency, handing the stall to whoever is next. */
  private pullOffCharge (unit: Unit): void {
    if (!unit.chargerId) return
    this.markVacating(unit, unit.chargerId)
    this.releaseCharger(unit)
  }

  /**
   * May this unit's CURRENT job be cancelled?
   *
   * Two conditions, and the second is absolute rather than tunable:
   *
   *   • the job is at or below `interruptibleAtOrBelowRank` — low only, today;
   *   • THE LOAD IS NOT YET ON THE DECK. A unit that has picked up has nowhere
   *     to put the cargo down that is not another unit's reserved bay, so the
   *     only way to "cancel safely" would be to abandon a pallet in an aisle.
   *     Everything upstream of this is a preference; this is the rule.
   */
  private canInterrupt (unit: Unit): boolean {
    if (!unit.task || unit.carrying) return false
    if (unit.phase !== 'toPickup') return false
    return taskPriorities[unit.task.priority].rank >= fleetSimParams.interruptibleAtOrBelowRank
  }

  /**
   * Cancel a unit's job safely and put it back on the queue.
   *
   * "Safely" is the whole of this function: both reserved stations are handed
   * back so nothing stays locked to a job nobody is running, the task's chosen
   * bays are cleared so it is re-planned rather than re-driven to stale ones,
   * and it re-enters the queue at its own priority — not at the front, which
   * would quietly promote every interrupted job.
   */
  private interruptFor (unit: Unit, emergency: Task): boolean {
    const current = unit.task
    if (!current || !this.canInterrupt(unit)) return false

    this.releaseStation(unit, current.fromStationId)
    this.releaseStation(unit, current.toStationId)
    current.fromStationId = null
    current.toStationId = null
    current.holderId = null
    current.interrupted = true
    current.age = 0
    // ⚠️ DELIBERATELY NOT RESERVED FOR THIS UNIT. "Returned to the queue" has to
    // mean the queue: a low-priority job frozen until one specific busy robot
    // comes back for it is worse for the floor than the interruption was, and it
    // would sit at the bottom of the backlog behind work nobody is blocked on.
    // The intent to come back lives on the UNIT (`previousTaskId`) and is acted
    // on the moment its emergency is delivered — but any free unit may beat it
    // to the job, and `assignTask` tells it so when one does.

    unit.previousTaskId = current.id
    unit.previousTaskLabel = this.labelOfTask(current)
    unit.task = null
    unit.carrying = false
    unit.payloadKg = null
    this.stats.interrupted += 1

    this.insertByPriority(current)
    this.holdStatus(unit, 'taskInterrupted')
    this.raise('task-interrupted', 'warning',
      `${unit.def.code} stood down from ${unit.previousTaskLabel}`
      + ` for emergency ${emergency.cargoId} — job returned to the queue`,
      { taskId: current.id, robotId: unit.def.id })

    // ⚠️ AND IT MUST STOP DRIVING TO THE STOP IT NO LONGER HOLDS. Releasing the
    // two stations above does not change where the unit is pointed: its phase is
    // still `toPickup`/`toDropoff` and `goalStationId` still names a station that
    // is now back in the pool. It carries on to it, arrives on a stop somebody
    // else has since been given, and two machines end up at one coordinate —
    // caught by the soak as FLT-06/AMR-02 closing to 0.00 m, sixty seconds after
    // AMR-02 had been stripped of the job that sent it there.
    //
    // Standing it down here rather than at the two call sites is deliberate:
    // both of them can leave the unit unassigned (`preemptStation`'s fallback
    // always does, and `assignEmergency`'s path does whenever the follow-up
    // `assignTask` fails), so a fix at either one would leave the other open.
    // Where the caller DOES reassign immediately, `assignTask` → `beginPhase`
    // simply overwrites this, and nothing has been lost but a re-plan.
    this.standDown(unit)
    return true
  }

  /**
   * Seconds until this unit has finished what it is holding.
   *
   * DERIVED, and pessimistic on purpose — see `emergencyEtaSpeedFactor`. It adds
   * up what is genuinely left: the dwell it is in, the route it is on, and, if
   * it has not collected yet, the load, the run to the drop-off and the unload.
   */
  private secondsToFinish (unit: Unit): number {
    const speed = Math.max(0.1, unit.type.topSpeedMps * fleetSimParams.emergencyEtaSpeedFactor)
    let seconds = Math.max(0, unit.dwell)

    if (unit.route && unit.legIndex + 1 < unit.route.length) {
      const rest = unit.route.slice(unit.legIndex + 1)
      const planUnits = Math.hypot(rest[0]!.x - unit.x, rest[0]!.y - unit.y) + routeLength(rest)
      seconds += toMetres(planUnits) / speed
    }

    if (unit.task && !unit.carrying) {
      seconds += fleetSimParams.loadSeconds
      const from = this.stationXY(unit.task.fromStationId)
      const to = this.stationXY(unit.task.toStationId)
      if (from && to) seconds += toMetres(Math.hypot(to[0] - from[0], to[1] - from[1])) / speed
    }
    return seconds + fleetSimParams.unloadSeconds
  }

  /**
   * Seconds from a point to the nearest pick face this job could start at.
   *
   * ⚠️ NEAREST FREE STATION, NOT AN AREA CENTROID, and no rng. The job has no
   * pickup yet — the scheduler chooses one at assignment — so the honest proxy
   * is the closest place it could actually be started from. A centroid would
   * rank a unit against floor it may not be allowed to stop on, and the
   * shortlist draw `chooseStation` uses would make the comparison depend on how
   * many candidates were compared, which is not a property of any of them.
   */
  private approachSeconds (unit: Unit, task: Task, fromX: number, fromY: number): number {
    const speed = Math.max(0.1, unit.type.topSpeedMps * fleetSimParams.emergencyEtaSpeedFactor)
    let nearest = Infinity

    for (const area of duties[task.kind].pickup) {
      for (const station of this.stationsByArea.get(area) ?? []) {
        if (station.types && !station.types.includes(unit.def.typeId)) continue
        const holder = this.stationHolder.get(station.id)
        if (holder !== undefined && holder !== unit.def.id) continue
        nearest = Math.min(nearest, Math.hypot(station.x - fromX, station.y - fromY))
      }
    }

    // No free face anywhere: rank by raw distance to the unit rather than
    // returning Infinity for everybody, which would make the comparison useless.
    if (!Number.isFinite(nearest)) nearest = Math.hypot(unit.x - fromX, unit.y - fromY)
    return toMetres(nearest) / speed
  }

  private stationXY (stationId: string | null): [number, number] | null {
    if (!stationId) return null
    const station = this.stationsById.get(stationId)
    return station ? [station.x, station.y] : null
  }

  /**
   * Say once, per task, that an emergency has nowhere to go.
   *
   * Once because this runs every frame and a repeated toast is a feed nobody
   * reads. It is raised rather than swallowed because "the fleet cannot serve
   * this" is exactly the thing an operator has to be told — the alternative is
   * an urgent job sitting at the top of the queue looking like it is being
   * handled.
   */
  private warnUnassignable (task: Task, reason: string): void {
    if (this.warnedUnassignable.has(task.id)) return
    // Give the ordinary path a few seconds first; a momentary "everyone is busy"
    // at the instant of creation is normal and clears itself.
    if (task.age < 8) return
    this.warnedUnassignable.add(task.id)
    this.raise('emergency-unassignable', 'critical',
      `Emergency ${task.cargoId} cannot be dispatched — ${reason}`,
      { taskId: task.id })
  }

  /** What a job is, in one line. One definition, used by tasks and by robots. */
  private labelOfTask (task: Task): string {
    const duty = duties[task.kind]
    return `${duty.verb} ${duty.cargoNoun} ${task.cargoId}`
  }

  /** Hold a transient status on screen long enough to be read. See `statusHoldSeconds`. */
  private holdStatus (unit: Unit, state: RobotState): void {
    unit.statusHoldState = state
    unit.statusHold = fleetSimParams.statusHoldSeconds
  }

  // ── Phase changes ─────────────────────────────────────────────────────────

  private beginPhase (unit: Unit, phase: Phase, stationId: string | null): void {
    unit.phase = phase
    unit.goalStationId = stationId
    unit.waitSeconds = 0
    unit.stuckSeconds = 0
    if (stationId) this.planTo(unit, stationId)
  }

  /**
   * Hand a stop back — but only once the unit has driven off it.
   *
   * Finishing with a bay is not the same as vacating it. Release the reservation
   * the instant loading ends and dispatch will send the next unit into a bay
   * that is still occupied, which it does at full speed because a unit standing
   * on a spur is deliberately invisible to following distance. Holding the
   * reservation until the unit reaches the next node closes that window.
   */
  private markVacating (unit: Unit, stationId: string | null | undefined): void {
    if (!stationId) return
    // Anything still pending must have been vacated long ago — a unit cannot
    // reach a second stop without leaving the first.
    if (unit.releaseOnDepart && unit.releaseOnDepart !== stationId) {
      this.releaseStation(unit, unit.releaseOnDepart)
    }
    unit.releaseOnDepart = stationId
  }

  private releaseVacatedStation (unit: Unit): void {
    const pending = unit.releaseOnDepart
    if (!pending) return
    const node = this.graph.stationNodes.get(pending)
    if (node && unit.nodeId === node) return
    this.releaseStation(unit, pending)
    unit.releaseOnDepart = null
  }

  private releaseStation (unit: Unit, stationId: string | null | undefined): void {
    if (!stationId) return
    // A unit never gives up its own waiting bay; it is the one place it can
    // always stand down.
    if (stationId === unit.def.homeStationId) return
    if (this.stationHolder.get(stationId) === unit.def.id) this.stationHolder.delete(stationId)
    unit.reserved.delete(stationId)
  }

  /**
   * Send the unit home, or straight onto a charger when it is running low.
   *
   * This is where a charge request that was raised mid-delivery finally gets
   * acted on: the unit has just finished whatever it was carrying, so now is
   * exactly the moment it is free to go and plug in.
   */
  private standDown (unit: Unit): void {
    if ((unit.wantsCharge || unit.battery < fleetSimParams.reserveChargePct) && this.beginCharge(unit)) return
    // ⚠️ A DOCK UNIT NEVER PARKS UP. This is the single line that makes the
    // posting mean anything: `standDown` is where EVERY idle path in the model
    // converges (a finished delivery, an expired standby, a recovered fault, an
    // undocked charge), so diverting it here covers all of them at once rather
    // than needing a dock branch in each.
    //
    // Power is the one thing that outranks it, and it is the branch above.
    // There used to be a second — the congestion governor could hold a unit out
    // of service and the beat had to yield to that — but the governor is gone
    // and all five units work all the time.
    if (unit.dock) {
      this.beginPatrol(unit)
      return
    }
    this.beginPhase(unit, 'toHome', this.parkingFor(unit))
  }

  // ── Dock service ────────────────────────────────────────────────────────────

  /**
   * Work the next leg of a dock unit's beat.
   *
   * ── WHY A BEAT AND NOT A LOOP OF WAYPOINTS ─────────────────────────────────
   *
   * The naive version — drive A, drive B, drive A — puts a robot on rails, and a
   * warehouse bay is not a place you can be on rails: the bay may be held by a
   * forklift setting a pallet down, the unit may be needed for a real job
   * halfway there, and the flow's own use of the bay always outranks a patrol.
   * So each leg is CHOSEN when it starts, from what is actually free:
   *
   *   DOCK LEG   the next bay on the posting that nobody is holding, tried in
   *              order from where the last leg left off. Every bay busy is a
   *              normal outcome, not a failure — the unit falls through to a
   *              waiting leg and tries again next time.
   *   WAIT LEG   the first free waiting position, its own bay last and always
   *              available, so a beat can never run out of somewhere to be.
   *
   * The two alternate, which is what keeps the unit visibly shuttling between
   * the bays and the floor rather than orbiting the bays themselves.
   *
   * ⚠️ NOTHING HERE PLACES A UNIT. Every leg is a station id handed to
   * `beginPhase`, so the drive is planned and driven by the ordinary routing,
   * yields to ordinary traffic and can be interrupted by ordinary dispatch.
   */
  private beginPatrol (unit: Unit): void {
    const beat = unit.dock
    if (!beat) {
      this.beginPhase(unit, 'toHome', this.parkingFor(unit))
      return
    }

    // Whatever it was holding for the last leg goes back before the next one is
    // chosen — otherwise a unit alternating between two bays would hand the
    // first one back only after it had reserved the second, and hold two.
    this.endPatrol(unit)

    if (unit.patrolNext === 'dock') {
      unit.patrolNext = 'wait'
      const dock = this.claimBeatStop(unit, beat.dockStationIds, unit.patrolIndex)
      if (dock) {
        // ⚠️ THE ROTATION IS NOT ADVANCED HERE. It advances on ARRIVAL — see
        // `arriveAtGoal` — so a leg that is pre-empted by real work keeps the
        // bay's turn instead of spending it on an intention that was never
        // carried out. Advancing at the start looks equivalent and is not: a
        // posting whose far bay is consistently interrupted en route would lose
        // its turn every single round and be visited never.
        //
        // ⚠️ IT IS NOT, HOWEVER, WHY A FAR BAY GOES UNVISITED — that was the
        // first guess and it was wrong. `probe-dock-service.mjs` showed the
        // second bay of both postings worked zero times in 45 minutes, and the
        // cause is upstream of the rotation entirely: the loading bays are held
        // by the ordinary flow for 70–95 % of a run, so `claimBeatStop` simply
        // finds them busy and falls through. That is the beat declining to queue
        // for a bay it has no job at, which is correct. If the far bays ever do
        // need visiting on a schedule, the lever is the bay count, not this.
        unit.patrolStationId = dock
        this.beginPhase(unit, 'toDock', dock)
        return
      }
      // Every bay on the posting is in use. That is the flow working, so the
      // unit goes and waits rather than queueing on a lane for a bay it has no
      // job at.
    }

    unit.patrolNext = 'dock'
    const wait = this.claimBeatStop(unit, beat.waitStationIds, 0)
      // `waitStationIds[0]` is the unit's own bay and can never be taken, so
      // this fallback is unreachable through the data as written. It is here
      // because the beat is a dataset field: a posting edited to list only other
      // units' bays must degrade to "park somewhere sensible", not to no route.
      ?? this.parkingFor(unit)
    unit.patrolStationId = wait
    unit.patrolWait = this.patrolWait()
    this.beginPhase(unit, 'toWaitPoint', wait)
  }

  /**
   * Take the first free stop from `ids`, starting at `start` and wrapping.
   *
   * Reserved in the same synchronous step it is checked, exactly as
   * `beginCharge` does — that, and nothing else, is what stops two dock units
   * being sent to one bay in the same frame.
   */
  private claimBeatStop (unit: Unit, ids: readonly string[], start: number): string | null {
    for (let step = 0; step < ids.length; step++) {
      const id = ids[(start + step) % ids.length]!
      if (!this.stationsById.has(id) || !this.graph.stationNodes.has(id)) continue
      // Its own bay is held by it permanently and is always re-entrant.
      if (id !== unit.def.homeStationId && this.stationHolder.has(id)) continue
      this.stationHolder.set(id, unit.def.id)
      unit.reserved.add(id)
      return id
    }
    return null
  }

  /**
   * Give the beat's current stop back.
   *
   * `keep` names stops that have just been taken over by a real assignment: the
   * reservation stays, it simply stops belonging to the patrol. Handing it back
   * and re-taking it in the same frame would open a window in which another unit
   * could be routed to a bay this one is already driving into.
   */
  private endPatrol (unit: Unit, ...keep: string[]): void {
    const held = unit.patrolStationId
    unit.patrolStationId = null
    unit.patrolWait = 0
    unit.patrolLegSeconds = 0
    if (held && !keep.includes(held)) {
      // Marked rather than released outright, for the reason `markVacating`
      // exists: the unit may still be standing on it, and a bay handed back
      // under a body is a bay the next unit drives into at full speed.
      this.markVacating(unit, held)
    }
  }

  /** How long a dock unit stands on a waiting position. Drawn fresh, never fixed. */
  private patrolWait (): number {
    const [lo, hi] = fleetSimParams.dockPatrolWaitSecondsRange
    return lo + this.rng() * (hi - lo)
  }

  /**
   * Where a unit that has nothing to do should go and wait.
   *
   * ⚠️ NOT ALWAYS ITS OWN BAY, and that is the difference between a warehouse
   * and a bus depot. Sixteen units all commuting to sixteen bays in one row puts
   * the whole standby pool in one corner, drives every one of them the length of
   * the hall to get there, and leaves the rest of the building looking abandoned
   * — the exact opposite of the brief.
   *
   * So a standing-down unit parks at the NEAREST sensible place instead, and
   * "sensible" is anything off the traffic lane that it is entitled to occupy:
   *
   *   ITS OWN BAY      always available, never contested, the fallback.
   *   A FREE BAY       another unit's bay is fine while that unit is out working;
   *                    it is released the moment the owner comes back for it.
   *   BESIDE A STALL   parking near the chargers is what a real fleet does with
   *                    units it expects to plug in next.
   *
   * The result is a pool spread across the building rather than stacked in one
   * aisle, and — because this returns a STATION and the unit drives to it under
   * the ordinary routing — every unit is visibly seen driving there and parking.
   * Nothing is ever placed.
   */
  private parkingFor (unit: Unit): string {
    const home = unit.def.homeStationId
    let best = home
    let bestDistance = Infinity

    for (const station of this.parkingStations) {
      // Its own bay is always allowed; anything else only while free.
      if (station.id !== home && this.stationHolder.has(station.id)) continue
      const distance = Math.hypot(station.x - unit.x, station.y - unit.y)
      if (distance < bestDistance) {
        bestDistance = distance
        best = station.id
      }
    }

    // Reserve it unless it is the unit's own bay, which it owns outright — two
    // units sent to one spot is the one way this could put bodies in each other.
    if (best !== home) {
      this.stationHolder.set(best, unit.def.id)
      unit.reserved.add(best)
    }
    unit.parkingStationId = best
    return best
  }

  /**
   * Which way a unit faces on a stall.
   *
   * Docking is the one manoeuvre where facing is not simply the direction of
   * travel: the unit squares up to the stall, so it points from the access node
   * at the stall itself. Without this a unit arrives on a spur still facing down
   * the aisle it came from and reads as parked beside the charger rather than
   * plugged into it.
   */
  private dockHeading (unit: Unit): number {
    const station = unit.chargerId ? this.stationsById.get(unit.chargerId) : undefined
    if (!station?.access) return unit.heading
    return headingOf(station.x - station.access[0], station.y - station.access[1])
  }

  /** A pause of a few seconds, drawn fresh each time so a rank never syncs up. */
  private idleDwell (): number {
    const [lo, hi] = fleetSimParams.idleDwellSecondsRange
    return lo + this.rng() * (hi - lo)
  }

  /**
   * Stand where the job finished, for a few seconds, before doing anything else.
   *
   * ⚠️ ONLY OFF THE TRAFFIC LANE. A unit standing by on a spur — a bay, a
   * workstation — is out of everyone's way and can wait as long as it likes. A
   * rack face is deliberately NOT a spur: a unit stopped on one is stopped in
   * the aisle, and idling there for five seconds would hold up a queue for no
   * reason. Those units skip the pause and drive off instead.
   */
  private beginStandby (unit: Unit): void {
    if (!this.graph.spurNodes.has(unit.nodeId)) {
      this.standDown(unit)
      return
    }
    unit.phase = 'standby'
    unit.goalStationId = null
    unit.speed = 0
    unit.blocked = false
    unit.blockedBy = null
    unit.idleSeconds = this.idleDwell()
  }

  /**
   * Put a unit on a stall, or in line for one.
   *
   * ⚠️ RESERVATION IS THE WHOLE SAFETY PROPERTY. `stationHolder` is checked and
   * set in the same synchronous step, and a unit drives to a stall only after it
   * holds it, so two units can never be routed to one stall however many ask in
   * the same frame. Nothing here is asynchronous and nothing may be made so.
   *
   * Never returns false any more: when every stall is taken the unit joins the
   * shortest queue and waits in its own bay, which is a real outcome rather than
   * the old "park and retry next tick" that read as a unit ignoring a flat
   * battery. See `waitingForCharge`.
   */
  private beginCharge (unit: Unit): boolean {
    if (unit.chargerId) return true                    // already holding or queued

    // ⚠️ THE BEAT IS GIVEN UP BEFORE POWER IS ASKED FOR. Every path out of this
    // function ends with the unit driving somewhere else — a stall, or its own
    // bay to queue — and neither goes anywhere near the bay it was patrolling
    // to. Without this the reservation is held for the whole of a charge, which
    // takes a loading bay out of service for minutes and cannot be recovered by
    // anything: no later call knows the unit was ever on a round.
    this.endPatrol(unit)

    let best: Station | null = null
    let bestDistance = Infinity
    for (const station of this.chargerStations) {
      if (this.stationHolder.has(station.id)) continue
      const distance = Math.hypot(station.x - unit.x, station.y - unit.y)
      if (distance < bestDistance) {
        bestDistance = distance
        best = station
      }
    }

    if (best) {
      this.stationHolder.set(best.id, unit.def.id)
      unit.reserved.add(best.id)
      unit.chargerId = best.id
      unit.wantsCharge = true
      unit.alert = null
      this.beginPhase(unit, 'toCharger', best.id)
      return true
    }

    return this.joinChargeQueue(unit)
  }

  /**
   * Join the shortest queue and hold in the unit's own waiting bay.
   *
   * Shortest rather than nearest: a stall two aisles away that is about to free
   * up returns a unit to work sooner than the one next door with three ahead of
   * it, and queue length is the only part of that the model can know. Ties break
   * on distance, then on id so a replay queues the same way.
   */
  private joinChargeQueue (unit: Unit): boolean {
    let best: Station | null = null
    let bestKey: [number, number] = [Infinity, Infinity]
    for (const station of this.chargerStations) {
      const queue = this.chargeQueues.get(station.id) ?? []
      if (queue.includes(unit.def.id)) return true
      const key: [number, number] = [queue.length, Math.hypot(station.x - unit.x, station.y - unit.y)]
      if (key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] < bestKey[1])) {
        bestKey = key
        best = station
      }
    }
    if (!best) return false

    const queue = this.chargeQueues.get(best.id) ?? []
    queue.push(unit.def.id)
    this.chargeQueues.set(best.id, queue)
    unit.chargerId = best.id
    unit.wantsCharge = true
    unit.alert = queue.length > 1 ? `Waiting for ${best.label} — ${queue.length} ahead` : null
    // Waits in its OWN bay: exclusive to it, off the lane, and reachable without
    // crossing whatever traffic is already backed up around the stalls.
    this.beginPhase(unit, 'waitingForCharge', unit.def.homeStationId)
    return true
  }

  /**
   * Hand a stall on when its unit leaves.
   *
   * Called from exactly one place — the moment a unit undocks — so a stall can
   * never be released twice or handed to two units. The next in line is given
   * the reservation HERE rather than being told to go and ask again, which is
   * what makes the turn actually its own.
   */
  private releaseCharger (unit: Unit): void {
    const stationId = unit.chargerId
    unit.chargerId = null
    unit.wantsCharge = false
    unit.emergency = false
    if (!stationId) return

    if (this.stationHolder.get(stationId) === unit.def.id) this.stationHolder.delete(stationId)
    unit.reserved.delete(stationId)

    const queue = this.chargeQueues.get(stationId)
    while (queue && queue.length) {
      const nextId = queue.shift()!
      const next = this.unitsById.get(nextId)
      // A unit that gave up, faulted out or charged elsewhere in the meantime is
      // simply skipped — the alternative is a stall reserved for nobody.
      if (!next || next.chargerId !== stationId || !next.wantsCharge) continue
      this.stationHolder.set(stationId, nextId)
      next.reserved.add(stationId)
      next.alert = null
      this.beginPhase(next, 'toCharger', stationId)
      break
    }
  }

  /** Drop out of a queue — used when a unit faults or is otherwise written off. */
  private leaveChargeQueue (unit: Unit): void {
    if (!unit.chargerId) return
    const queue = this.chargeQueues.get(unit.chargerId)
    if (queue) {
      const at = queue.indexOf(unit.def.id)
      if (at >= 0) queue.splice(at, 1)
    }
  }

  /** Give up the current task outright — the pallet stays where it is. */
  private abandonTask (unit: Unit): void {
    if (!unit.task) return
    const dropped = unit.task
    this.releaseStation(unit, dropped.fromStationId)
    this.releaseStation(unit, dropped.toStationId)
    // Cargo already on the deck goes back into the queue as fresh work rather
    // than evaporating: the pallet is real inside the model and has to land
    // somewhere. The hand-on pin is dropped with it — wherever this cargo came
    // from, it is on a stranded robot now, not on that station.
    //
    // ⚠️ ITS PRIORITY COMES WITH IT, and re-enters the queue in rank order. A
    // flat battery is the robot's problem, not the delivery's: an emergency that
    // dropped to the back of the backlog because the unit carrying it ran down
    // would be the priority system losing work in exactly the situation it was
    // built for.
    if (unit.carrying && this.queue.length < fleetSimParams.maxQueuedTasks) {
      this.insertByPriority({
        ...dropped,
        fromStationId: null,
        toStationId: null,
        preferFrom: null,
        holderId: null,
        resumeUnitId: null,
        interrupted: false,
        age: 0,
      })
    }
    unit.task = null
    unit.carrying = false
    unit.payloadKg = null
    // The unit is being written off for power; it is in no position to promise a
    // return to anything.
    if (unit.pendingPriorityTaskId) {
      const held = this.queue.find(task => task.id === unit.pendingPriorityTaskId)
      if (held?.resumeUnitId === unit.def.id) held.resumeUnitId = null
      unit.pendingPriorityTaskId = null
      unit.pendingPrioritySeconds = 0
    }
  }

  // ── Routing ───────────────────────────────────────────────────────────────

  /**
   * Plan to a station.
   *
   * Mid-leg the unit is committed: it cannot stop dead between two nodes and
   * turn round, so the new route is planned from the node it is already driving
   * into and the current leg is prepended. That is why a re-plan looks like a
   * unit finishing its move and then turning, rather than pivoting on the spot.
   */
  private planTo (unit: Unit, stationId: string): void {
    // Any real plan supersedes a give-way detour: the route about to be written
    // goes to an actual station, so arriving on it means what it usually means.
    // Left set, the flag would make the next genuine arrival look like a detour
    // and the unit would re-plan to the stop it was already standing on.
    unit.detour = false
    const goalNode = this.graph.stationNodes.get(stationId)
    if (!goalNode) {
      this.raiseFault(unit, `No route to ${this.stationsById.get(stationId)?.label ?? stationId}`)
      return
    }

    const midLeg = unit.route !== null && unit.legDist > 0.01 && unit.legIndex + 1 < unit.route.length
    const committed = midLeg ? unit.route![unit.legIndex + 1]! : null
    const originId = committed ? committed.id : unit.nodeId

    // ── THE ROUTE IS PLANNED AGAINST TRAFFIC, NOT ONLY AGAINST DISTANCE ──────
    //
    // Shortest-path over a fixed network is a deterministic function of two
    // endpoints, and a deterministic function applied to sixteen units with
    // similar endpoints is one unit's route driven sixteen times. That is what
    // put every drive down the centre spine: the spine is genuinely the shortest
    // way between almost any two stops, because almost every stop hangs off it.
    // The north and south aisles then went nearly unused while the spine queued.
    //
    // So the planner is quoted a COST rather than a distance, over two fields
    // that both decay:
    //
    //   CONGESTION  where units are being held up right now. Reactive — it can
    //               only rise once a queue exists.
    //   TRAIL       where the fleet has recently driven, held up or not.
    //               Predictive, and the half that actually spreads traffic: the
    //               second unit to want the spine is quoted a longer spine
    //               before anybody has queued on it.
    //
    // ⚠️ BOTH ARE BIASES AND NEITHER IS A BAN. This building has three
    // cross-overs; a forbidden node turns "the quick way is busy" into "there is
    // no route", which is a worse answer than queueing. `penalty` adds cost,
    // `avoid` forbids — and only the reroute escalation is allowed to forbid.
    const penalty = this.routePenalties()

    const route = findRoute(this.graph, originId, goalNode, {
      avoid: unit.avoid.size > 0 ? unit.avoid : undefined,
      penalty,
    })
      // A closed-aisle re-plan can genuinely have no answer once nodes are
      // forbidden. Falling back to the unrestricted network is better than
      // stalling: the unit queues behind the obstruction instead of giving up on
      // the hall. The penalty is kept in the fallback — it costs nothing and
      // still prefers the quieter of two legal ways round.
      ?? findRoute(this.graph, originId, goalNode, { penalty })
      ?? findRoute(this.graph, originId, goalNode)

    if (!route) {
      this.raiseFault(unit, `No route to ${this.stationsById.get(stationId)?.label ?? stationId}`)
      return
    }

    if (committed) {
      const legLength = Math.hypot(committed.x - unit.route![unit.legIndex]!.x, committed.y - unit.route![unit.legIndex]!.y)
      unit.route = [unit.route![unit.legIndex]!, ...route]
      unit.legIndex = 0
      unit.legDist = Math.min(unit.legDist, legLength)
    } else {
      unit.route = route
      unit.legIndex = 0
      unit.legDist = 0
    }

    // Claiming the route marks it, so the NEXT unit to plan sees this one's
    // choice. Marking at plan time rather than at drive time is what makes the
    // spread pre-emptive — by the time a unit has driven an aisle, the four
    // behind it have already planned to follow.
    this.markTrail(route)
  }

  /**
   * Where the planner should think twice, in plan units of extra cost.
   *
   * The two fields are summed rather than combined cleverly: they measure
   * different things (queueing versus usage) and an operator reading a hotspot
   * list needs the total, not a weighting nobody can check.
   */
  private routePenalties (): Map<string, number> {
    const penalties = this.traffic.penalties(fleetSimParams.congestionPenaltyUnits)
    for (const [nodeId, score] of this.trail) {
      const extra = Math.min(1, score / fleetSimParams.trailFullVisits)
        * fleetSimParams.trailPenaltyUnits
      penalties.set(nodeId, (penalties.get(nodeId) ?? 0) + extra)
    }
    return penalties
  }

  /** Record that a unit has committed to driving these nodes. */
  private markTrail (route: readonly NavNode[]): void {
    for (const node of route) {
      // Spurs are excluded: a bay is exclusive to whoever was sent to it, so its
      // stub is never a shared road and penalising it would only make units
      // reluctant to go where they were dispatched.
      if (this.graph.spurNodes.has(node.id)) continue
      this.trail.set(node.id, (this.trail.get(node.id) ?? 0) + 1)
    }
  }

  /**
   * Let the trail fade.
   *
   * Exponential, on a half-life, so it needs no history buffer — and so a route
   * driven once stops mattering within a minute while a lane the whole fleet
   * keeps taking stays expensive for as long as that remains true.
   */
  private decayTrail (dt: number): void {
    const keep = Math.exp(-(Math.LN2 / fleetSimParams.trailHalfLifeSeconds) * dt)
    for (const [nodeId, score] of this.trail) {
      const next = score * keep
      if (next < 0.02) this.trail.delete(nodeId)
      else this.trail.set(nodeId, next)
    }
  }

  /**
   * Stop the unit where it stands.
   *
   * The route is deliberately KEPT. Clearing it would leave the unit's position
   * mid-leg with nothing to interpolate against, and the next plan would snap it
   * back to the last node it passed — a unit teleporting backwards across the
   * hall, which on an operations display is worse than the fault it is reporting.
   */
  private raiseFault (unit: Unit, reason: string): void {
    // A faulted unit is not coming for its turn any time soon, so it gives up
    // its place rather than holding a stall's queue behind it. It keeps
    // `wantsCharge`, so it asks again once it recovers.
    if (unit.phase === 'waitingForCharge') {
      this.leaveChargeQueue(unit)
      unit.chargerId = null
    }
    unit.phase = 'faulted'
    unit.alert = reason
    unit.dwell = fleetSimParams.errorRecoverySeconds
    unit.speed = 0
    unit.blocked = false
    unit.blockedBy = null
    unit.waitSeconds = 0
    unit.stuckSeconds = 0
  }

  // ── Traffic ───────────────────────────────────────────────────────────────

  /**
   * How far the road ahead is clear, in plan units — `Infinity` when nothing is
   * in the way. Measured in the unit's own frame: anything behind it, or more
   * than half a lane off its centre line, is not its problem.
   *
   * Also reports WHICH unit is in the way, because a following-distance block is
   * as much a link in a gridlock chain as a junction reservation is, and the
   * deadlock detector needs both kinds to see a cycle.
   */
  private clearAhead (unit: Unit): { gap: number; blocker: Unit | null } {
    const forwardX = Math.sin(unit.heading)
    const forwardY = -Math.cos(unit.heading)
    let nearest = Infinity
    let blocker: Unit | null = null

    for (const other of this.units) {
      if (other === unit) continue
      if (this.isOffRoad(other)) continue
      const dx = other.x - unit.x
      const dy = other.y - unit.y
      const along = dx * forwardX + dy * forwardY
      if (along <= 0) continue
      if (along > toPlanUnits(fleetGeometry.brakeFromM)) continue
      const lateral = Math.abs(dx * forwardY - dy * forwardX)
      if (lateral > LANE_HALF_WIDTH) continue
      if (along < nearest) {
        nearest = along
        blocker = other
      }
    }

    return { gap: nearest, blocker }
  }

  /**
   * This unit's right of way, as the controller ranks it.
   *
   * ⚠️ READ OFF WHAT IT IS DOING, NOT OFF ITS ID. A unit's rank changes during a
   * run — it picks a pallet up and outranks the empty unit it was queued behind,
   * it drops the pallet and falls back down. Caching it per unit would freeze the
   * arbitration at whatever each unit happened to be doing when it started.
   */
  private trafficRank (unit: Unit): number {
    if (unit.emergency || unit.task?.priority === 'emergency') {
      return TRAFFIC_PRIORITY.emergency.rank
    }
    if (unit.carrying) return TRAFFIC_PRIORITY.laden.rank
    if (unit.phase === 'toHome' || unit.phase === 'toCharger' || unit.phase === 'chargingComplete') {
      return TRAFFIC_PRIORITY.returning.rank
    }
    return TRAFFIC_PRIORITY.empty.rank
  }

  /**
   * Take the lane block between two nodes, if it is free.
   *
   * A unit may hold two blocks for the instant it straddles a junction — it
   * acquires the next before releasing the last — but never two it is not
   * physically on. Acquire-then-release is the order that matters: releasing
   * first would open a window in which an oncoming unit could take the block the
   * first one is still standing in.
   */
  private tryEnterSegment (unit: Unit, fromId: string, toId: string): boolean {
    const grant = this.traffic.requestSegment(unit.def.id, fromId, toId, this.trafficRank(unit))
    if (!grant.granted) {
      this.lastClaimBlocker = grant.blockedBy
      return false
    }

    // ⚠️ RELEASE THE OLD BLOCK ONLY AFTER TAKING THE NEW ONE. A unit may hold two
    // for the instant it straddles a junction; releasing first would open a
    // window in which an oncoming unit could take the block this one is still
    // standing in.
    const key = TrafficController.segmentKey(fromId, toId)
    if (unit.segment && unit.segment !== key) this.traffic.release(unit.def.id, unit.segment)
    unit.segment = key
    return true
  }

  private releaseSegment (unit: Unit): void {
    if (!unit.segment) return
    this.traffic.release(unit.def.id, unit.segment)
    unit.segment = null
  }

  /**
   * Take the node the unit is about to drive into, if it is going.
   *
   * Two conditions, and the second is what stops units clipping each other at a
   * crossing: the node must be unclaimed, AND no other unit may still be
   * standing within clearance of it. A claim alone is not enough, because a unit
   * releases its claim the moment it moves on while its body is still there.
   */
  private tryClaim (unit: Unit, nodeId: string): boolean {
    this.lastClaimBlocker = null

    // A unit that has just yielded must not immediately take back what it gave
    // up, or breaking a deadlock would only re-form it a frame later.
    if (unit.yieldSeconds > 0 && unit.claim !== nodeId) return false

    // ⚠️ THE BODY CHECK COMES BEFORE THE LEDGER, and it is not a duplicate of it.
    // A reservation says nobody else is ALLOWED into this junction; it says
    // nothing about whether somebody is still physically standing in it, because
    // a unit gives its claim up the moment it moves on while its body is still
    // there. Asking the ledger first would grant a node a machine is sitting in.
    const node = this.graph.nodes.get(nodeId)
    if (node && !this.traffic.holdsNode(unit.def.id, nodeId)) {
      for (const other of this.units) {
        if (other === unit) continue
        if (this.isOffRoad(other)) continue
        const distance = Math.hypot(other.x - node.x, other.y - node.y)
        if (distance < toPlanUnits(fleetGeometry.junctionClearM)) {
          // Named, not just refused: an unclaimed node blocked by a body still
          // standing in it is a link in a gridlock chain like any other, and an
          // unnamed link is a cycle the detector cannot see.
          this.lastClaimBlocker = other.def.id
          return false
        }
      }
    }

    // ⚠️ A "DO NOT ENTER A JUNCTION YOU CANNOT LEAVE" RULE WAS TRIED HERE AND
    // MADE THINGS MUCH WORSE — it is recorded so it is not tried again. Refusing
    // the junction while the exit block is held sounds right, and it is right on
    // a network where the exit is only ever held by traffic that has already gone
    // through. Here it is also held by traffic driving TOWARD the junction from
    // that side, so two units approaching from different arms each hold the
    // other's exit and neither may enter. Throughput went to zero at every fleet
    // size from two to eight. The junction plugging under load is real (see the
    // hotspot list in the traffic report), but the answer is not an entry gate.
    const grant = this.traffic.requestNode(unit.def.id, nodeId, this.trafficRank(unit))
    if (!grant.granted) {
      this.lastClaimBlocker = grant.blockedBy
      return false
    }

    if (unit.claim && unit.claim !== nodeId) this.traffic.releaseNode(unit.def.id, unit.claim)
    unit.claim = nodeId
    return true
  }

  /**
   * Standing still on a bay, stall or waiting bay — physically out of the
   * traffic lane, so it counts against nobody's following distance or junction
   * clearance. Rack faces are deliberately NOT spurs: a unit picking really does
   * block the aisle, and traffic really should queue behind it.
   *
   * ⚠️ AN `exitAfter` HELPER USED TO SIT HERE and is deleted rather than kept
   * "for the next thing that needs it". It answered "which node would this unit
   * drive to after that one", for the do-not-enter-a-junction-you-cannot-leave
   * rule documented in `tryClaim` — the rule that was measured, found to take
   * throughput to zero at every fleet size, and removed. Its only caller went
   * with it, so what was left was a private method nothing called describing a
   * mechanism the file explicitly warns against reintroducing.
   */
  private isOffRoad (unit: Unit): boolean {
    return unit.speed < 0.1 && this.graph.spurNodes.has(unit.nodeId)
  }

  /**
   * Find and break gridlock.
   *
   * Reserving one node each makes head-on conflict impossible but leaves one
   * failure open: a ring of units where each is stopped waiting for the node the
   * next one is holding. Nobody is faulted, everybody is behaving correctly, and
   * it will never resolve on its own — re-planning cannot help either, because
   * on a one-way aisle there is frequently no other way round.
   *
   * So look for it directly. Each blocked unit names exactly one unit it is
   * standing behind, which makes a functional graph: follow the chain and any
   * cycle is a genuine deadlock. Break it by making one unit in the ring give up
   * its reservation — it is not standing on that node, only holding it, so
   * releasing lets the unit behind through and the ring unwinds from there.
   *
   * Which unit yields is decided by id, not by chance. An arbitrary tie-break
   * would make a run stop being reproducible, and a deadlock you cannot replay
   * is a deadlock you cannot diagnose.
   */
  private breakDeadlocks (): void {
    const waitingFor = new Map<string, string>()
    for (const unit of this.units) {
      if (!unit.blocked || !unit.blockedBy) continue
      waitingFor.set(unit.def.id, unit.blockedBy)
    }
    if (waitingFor.size < 2) return

    const settled = new Set<string>()
    for (const start of waitingFor.keys()) {
      if (settled.has(start)) continue

      const chain: string[] = []
      const onChain = new Set<string>()
      let cursor: string | undefined = start

      while (cursor !== undefined && !settled.has(cursor)) {
        if (onChain.has(cursor)) {
          this.yieldWithin(chain.slice(chain.indexOf(cursor)))
          break
        }
        chain.push(cursor)
        onChain.add(cursor)
        cursor = waitingFor.get(cursor)
      }

      for (const id of chain) settled.add(id)
    }
  }

  /**
   * Make one unit in a deadlocked ring release its reservation.
   *
   * TWO CONDITIONS ON WHO MAY YIELD, and both are load-bearing:
   *
   * It must still HOLD a reservation — a unit that yielded on an earlier pass
   * has nothing left to give up, and picking it again would let the ring survive
   * every subsequent pass.
   *
   * It must be STANDING AT A NODE. This is the important one. Every unit on a
   * leg holds that leg's end node, taken before it set off, and that invariant
   * is what guarantees two units never converge on the same junction. Letting a
   * unit release mid-leg breaks it: the unit is left committed but unreserved,
   * parked inside a junction's clearance that it no longer owns, and whoever
   * takes the reservation then cannot reach it because the first unit's body is
   * in the way. That is a standoff no reservation scheme can resolve, and it was
   * being created by the very mechanism meant to prevent it.
   *
   * When no member of the ring is at a node there is nothing safe to release,
   * and the stall escalation takes it from there.
   */
  private yieldWithin (cycle: string[]): void {
    const unit = cycle
      .map(id => this.unitsById.get(id))
      .filter((candidate): candidate is Unit =>
        candidate !== undefined && candidate.claim !== null && candidate.legDist <= 0.5)
      .sort((a, b) => a.def.id.localeCompare(b.def.id))[0]
    if (!unit?.claim) {
      // ⚠️ NOT EVERY DEADLOCK IS MADE OF RESERVATIONS, and assuming it was is
      // what left the hall frozen. Two units nose to nose on a one-vehicle-wide
      // aisle, each standing ON the node the other is driving to, hold no claim
      // at all: they were refused one before they ever moved. This filter threw
      // both away and the breaker reported success having done nothing, while
      // the pair sat swapping `waiting` and `error` for the rest of the run.
      //
      // Releasing a reservation cannot clear a BODY. Somebody has to move, so
      // the fallback is a physical give-way rather than another bookkeeping
      // gesture — which is also what a driver would do.
      this.giveWayWithin(cycle)
      return
    }

    this.traffic.releaseNode(unit.def.id, unit.claim)
    unit.claim = null
    // The block goes back too. The unit is standing AT a node — that is the
    // condition for being picked — so it is not physically on the segment behind
    // it, and holding a block it is not in is exactly what keeps a ring jammed.
    this.releaseSegment(unit)
    unit.yieldSeconds = 1.5
    unit.waitSeconds = 0
    // A yield is an intervention, not a symptom: give it a clean window before
    // the stall timer is allowed to call it a fault.
    unit.stuckSeconds = 0
    unit.blockReason = 'Yielding — giving way to clear a jam'
    // Counted, because "the floor never froze" and "the floor froze and was
    // repeatedly unjammed" look identical from outside and are not the same
    // system. An operator is entitled to see how hard this is working.
    this.traffic.noteDeadlockResolved()
  }

  /**
   * Break a body-on-body deadlock by making one unit physically pull back.
   *
   * The case this exists for is the one the building guarantees: aisles are one
   * vehicle wide and two-way, so two units can end up on adjacent nodes each
   * wanting the other's. No reservation is involved and none can be given up —
   * the obstruction is a machine, so a machine has to move.
   *
   * WHERE IT GOES is any neighbouring PLAIN JUNCTION that is empty, unclaimed,
   * and not where the other unit is trying to get to. Stops are excluded even
   * though pulling off the lane is otherwise the obvious move — see `stepAside`
   * for why that particular shortcut put two machines at the same coordinate.
   *
   * The detour is a DRIVE, not a teleport: the unit keeps its phase, its cargo
   * and its assignment, drives the leg under the ordinary rules, and re-plans to
   * its real goal on arrival (see `arriveAtGoal`). If nothing is free it returns
   * false and the stall escalation takes it from there, which is the honest
   * outcome — sometimes an aisle really is walled in at both ends.
   */
  private giveWayWithin (cycle: string[]): void {
    const members = cycle
      .map(id => this.unitsById.get(id))
      .filter((candidate): candidate is Unit =>
        candidate !== undefined && candidate.legDist <= 0.5 && !candidate.detour)
      // Lowest id yields, so a replayed run breaks the same ring the same way.
      .sort((a, b) => a.def.id.localeCompare(b.def.id))

    for (const unit of members) {
      if (this.stepAside(unit)) {
        this.traffic.noteDeadlockResolved()
        return
      }
    }
  }

  /** A crossing with nothing at it — always safe to pull back to. */
  private isPlainJunction (node: NavNode): boolean {
    return !this.graph.spurNodes.has(node.id) && !node.stationId
  }

  /**
   * ── MAY THIS UNIT SHELTER IN THAT STOP? ─────────────────────────────────────
   *
   * ⚠️ THIS RELAXES A RULE THAT USED TO BE ABSOLUTE, AND THE RESERVATION IS WHAT
   * MAKES IT SAFE. `stepAside` previously refused every stop outright, because a
   * spur IS a station and stations are exclusive: pulling onto one uninvited put
   * a unit where dispatch had already sent another, and the soak caught the two
   * of them interpenetrating at 0.00 m.
   *
   * The mistake in that reasoning was treating "reserved" as unknowable. It is
   * the one thing the model knows for certain — `stationHolder` is checked and
   * set in the same synchronous step everywhere else. So the rule becomes: pull
   * in only where nothing is reserved, and RESERVE IT on the way in (see the
   * caller). The old failure cannot recur, because the second unit would be
   * refused the stop exactly as it is refused a taken pick face.
   *
   * Why it had to change: the centre spine is a single line of junctions with
   * every waiting bay, charger and workstation hanging off it. On a five-unit
   * floor there was always a spare junction to reverse into. On sixteen there is
   * not — two units nose to nose at 823 and 948 had a free charger and a free
   * staging bay either side of them and were forbidden from using both, so the
   * building's only through route stayed locked until the run ended.
   *
   * A RACK FACE IS STILL REFUSED, and that is not an oversight: pick faces sit
   * ON the lane by design, so a unit "sheltering" there is still in the aisle.
   * `isPlainJunction` excludes them by the same `stationId` test that admits
   * them nowhere else.
   */
  private canLayBy (unit: Unit, node: NavNode): boolean {
    if (!node.stationId) return false
    if (!this.graph.spurNodes.has(node.id)) return false

    const holder = this.stationHolder.get(node.stationId)
    if (holder === undefined || holder === unit.def.id) return true

    // ── BORROWING AN ABSENT UNIT'S WAITING BAY ────────────────────────────────
    //
    // ⚠️ THE ONE RESERVATION IN THE MODEL THAT IS NEVER RELEASED is a unit's own
    // waiting bay — `releaseStation` refuses it outright, which is what
    // guarantees a unit always has somewhere to stand down. The cost is that
    // sixteen bays are permanently marked taken even while their owners are at
    // the far end of the hall, and those bays line the one lane every unit
    // drives. A machine walled in at a junction with an EMPTY bay beside it,
    // forbidden from using it, is how this floor deadlocked with nothing
    // actually in the way.
    //
    // So a bay may be borrowed for a give-way, on two conditions:
    //   • its owner is not standing in it (the body test in `stepAside` would
    //     catch that anyway, but relying on a caller's filter for a safety
    //     property is how safety properties get lost), and
    //   • its owner is not currently driving to it.
    //
    // The borrow is brief by construction: a detour re-plans to the unit's real
    // goal the moment it arrives, so the shelter is measured in seconds. It is
    // still a reservation — taken on the way in and handed back on the way out —
    // so nothing else is routed there meanwhile.
    const owner = this.unitsById.get(holder)
    if (!owner || node.stationId !== owner.def.homeStationId) return false
    if (owner.nodeId === node.id) return false
    return owner.goalStationId !== node.stationId
  }

  /** Send `unit` one node out of the way. Returns false when there is nowhere. */
  private stepAside (unit: Unit): boolean {
    const here = this.graph.nodes.get(unit.nodeId)
    if (!here) return false

    // Where the unit it is deadlocked with is trying to get to — moving there
    // would swap the jam rather than clear it.
    const rival = unit.blockedBy ? this.unitsById.get(unit.blockedBy) : undefined
    const rivalTarget = rival?.route?.[rival.legIndex + 1]?.id ?? null

    const candidates = (this.graph.out.get(unit.nodeId) ?? [])
      .map(edge => this.graph.nodes.get(edge.to))
      .filter((node): node is NavNode => node !== undefined)
      .filter(node => node.id !== rivalTarget)
      .filter(node => this.traffic.holderOf(TrafficController.nodeKey(node.id)) === null)
      // ⚠️ NEVER ONTO A STOP. A spur looks like the ideal place to wait — it is
      // off the lane — but a spur IS a station, and stations are exclusive
      // because dispatch reserves them before routing anything to them. Pulling
      // onto one uninvited puts a unit where another has already been sent, and
      // the two end up at the same coordinate: the soak caught exactly that as
      // units interpenetrating at 0.00 m the first time this preferred spurs.
      // A give-way is a few seconds at a crossing, so a plain junction is both
      // safe and sufficient.
      .filter(node => this.isPlainJunction(node) || this.canLayBy(unit, node))
      // ⚠️ OFF-ROAD UNITS DO NOT VETO A GIVE-WAY TARGET, for exactly the reason
      // they do not veto a claim in `tryClaim`: a machine standing in a bay is
      // out of the lane and cannot be driven into. The exception is a machine
      // standing on the very node being considered — that one is not "off the
      // lane", it IS the place, and driving there would put two bodies at one
      // coordinate.
      //
      // Leaving the exemption out entirely was a latent deadlock, and the roster
      // size detonated it. A waiting bay sits 40 plan units off its access point
      // and `junctionClearM` is 52, so every parked unit vetoed its own junction
      // as a place to give way. With five units there was always a free junction
      // elsewhere; with sixteen every junction on the centre spine is vetoed
      // permanently, `stepAside` can never find anywhere, and the body-swap
      // deadlock the give-way exists to break becomes unbreakable. The soak
      // showed it as a floor where fourteen of sixteen units had `moved=0u`.
      .filter(node => this.units.every(other => other === unit
        || (this.isOffRoad(other) && other.nodeId !== node.id)
        || Math.hypot(other.x - node.x, other.y - node.y) >= toPlanUnits(fleetGeometry.junctionClearM)))

    const target = candidates[0]
    if (!target) return false

    // Pulling into a FREE lay-by means taking it, by the same reservation every
    // other stop uses. Without that, dispatch could route another unit to the
    // stall this one is sheltering in — precisely the failure the old "never
    // onto a stop" rule was written to prevent.
    //
    // ⚠️ A BORROWED WAITING BAY IS DELIBERATELY NOT RE-RESERVED. It is already
    // held — permanently — by its owner, and overwriting that would hand the
    // borrower a reservation it later RELEASES, quietly stripping the owner of
    // the one bay `releaseStation` exists to protect. Nothing else can be routed
    // there in the meantime: hold bays carry no `area`, so dispatch never
    // considers them, and the only unit that drives to one is its owner — which
    // `canLayBy` has already checked is not on its way.
    if (target.stationId && !this.isPlainJunction(target)
      && !this.stationHolder.has(target.stationId)) {
      this.stationHolder.set(target.stationId, unit.def.id)
      unit.reserved.add(target.stationId)
      unit.laybyStationId = target.stationId
    }

    unit.detour = true
    unit.route = [here, target]
    unit.legIndex = 0
    unit.legDist = 0
    unit.avoid.clear()
    unit.waitSeconds = 0
    unit.stuckSeconds = 0
    unit.blocked = false
    unit.blockReason = 'Giving way — pulling clear of the aisle'
    return true
  }

  // ── The per-unit step ─────────────────────────────────────────────────────

  private stepUnit (unit: Unit, dt: number): void {
    this.releaseVacatedStation(unit)
    this.drainBattery(unit, dt)

    if (unit.avoidSeconds > 0) {
      unit.avoidSeconds -= dt
      if (unit.avoidSeconds <= 0) unit.avoid.clear()
    }

    if (unit.yieldSeconds > 0) unit.yieldSeconds = Math.max(0, unit.yieldSeconds - dt)

    // A transient status expires on its own; the driving underneath it never
    // paused. Clearing the remembered previous job with it is what stops the
    // roster showing "was pulled off X" for the rest of the shift.
    if (unit.statusHold > 0) {
      unit.statusHold -= dt
      if (unit.statusHold <= 0) {
        unit.statusHold = 0
        if (unit.statusHoldState === 'resumingPreviousTask') unit.previousTaskLabel = null
        unit.statusHoldState = null
      }
    }

    // A spontaneous fault only makes sense while the unit is actually working.
    // Docking and undocking are excluded with charging: a fault thrown while the
    // contacts are engaging would strand a unit holding a stall it cannot leave.
    // `waitingAtPoint` joins them: a unit standing on a waiting position is doing
    // no more than a parked one, and faulting it there would strand the posting
    // for `errorRecoverySeconds` over a drive it was not making.
    if (unit.phase !== 'faulted' && unit.phase !== 'charging' && unit.phase !== 'parked'
      && unit.phase !== 'standby' && unit.phase !== 'docking' && unit.phase !== 'chargingComplete'
      && unit.phase !== 'waitingForCharge' && unit.phase !== 'waitingAtPoint') {
      unit.faultCountdown -= dt
      if (unit.faultCountdown <= 0) {
        unit.faultCountdown = this.exponential(fleetSimParams.faultMeanSecondsPerRobot)
        this.raiseFault(unit, 'Drive fault — safety stop engaged')
        return
      }
    }

    if (unit.dwell > 0) {
      unit.dwell -= dt
      unit.speed = 0
      unit.blocked = false
      if (unit.dwell <= 0) this.finishDwell(unit)
      return
    }

    if (unit.idleSeconds > 0) unit.idleSeconds = Math.max(0, unit.idleSeconds - dt)

    switch (unit.phase) {
      case 'charging':
        this.stepCharging(unit, dt)
        return
      case 'waitingForCharge':
        // Standing in its own bay with a place in line. Nothing to do but wait:
        // the stall comes to IT, handed over by `releaseCharger`.
        unit.speed = 0
        unit.blocked = false
        return
      case 'parked':
        unit.speed = 0
        unit.blocked = false
        if (unit.wantsCharge || unit.battery < fleetSimParams.reserveChargePct) {
          this.beginCharge(unit)
          return
        }
        // ⚠️ A BACKSTOP, AND IT SHOULD NEVER FIRE. `standDown` already diverts
        // every idle path a dock unit can take onto its beat, so reaching
        // `parked` means one was missed. It is here because the failure it
        // catches is silent and permanent: nothing else in the model moves a
        // parked unit, so a dock unit that lands here stays there for the rest
        // of the shift and the bays quietly stop being serviced. Gated on the
        // idle pause so it cannot pre-empt the ordinary rest.
        if (unit.dock && unit.idleSeconds <= 0) this.beginPatrol(unit)
        return
      case 'standby':
        unit.speed = 0
        unit.blocked = false
        // The pause has run out and dispatch had nothing for it, so it goes back
        // to its own waiting bay rather than loitering on a station somebody
        // else's job may need.
        if (unit.idleSeconds <= 0) this.standDown(unit)
        return
      case 'toDock':
        // ⚠️ THE ONE LEG IN THE MODEL THAT IS ALLOWED TO GIVE UP. It holds an
        // exclusive loading bay for a round, not for a job, so a leg that has
        // stopped making progress is costing the flow a stop it needs for
        // nothing. Abandoning hands the bay straight back and sends the unit to
        // wait; `patrolNext` is already 'wait', so it cannot immediately re-take
        // what it has just released. See `dockLegTimeoutSeconds`.
        unit.patrolLegSeconds += dt
        if (unit.patrolLegSeconds > fleetSimParams.dockLegTimeoutSeconds) {
          this.beginPatrol(unit)
          return
        }
        this.drive(unit, dt)
        return
      case 'waitingAtPoint':
        unit.speed = 0
        unit.blocked = false
        // ⚠️ COUNTED DOWN HERE AND NOWHERE ELSE, and it is not a dwell. `dwell`
        // returns from `stepUnit` above and would make the unit undispatchable
        // for the whole wait, which is precisely the behaviour the posting
        // exists to remove. The unit is standing still and available at the same
        // time; when the clock runs out it works the next leg by itself rather
        // than waiting to be told.
        // Power is checked first and on every frame, exactly as `parked` does —
        // a unit that dropped below the reserve while standing here must not
        // have to see out the rest of its wait before it can go and plug in.
        if (unit.wantsCharge || unit.battery < fleetSimParams.reserveChargePct) {
          this.standDown(unit)
          return
        }
        unit.patrolWait -= dt
        if (unit.patrolWait <= 0) this.standDown(unit)
        return
      default:
        this.drive(unit, dt)
    }
  }

  private drainBattery (unit: Unit, dt: number): void {
    if (unit.phase === 'charging' || unit.phase === 'docking') return
    const moving = unit.speed > 0.5
    const rate = (moving
      ? (unit.carrying
          ? fleetSimParams.drainMovingLadenPctPerSec
          : fleetSimParams.drainMovingEmptyPctPerSec)
      : fleetSimParams.drainStoppedPctPerSec) * unit.drainScale
    unit.battery = Math.max(0, unit.battery - rate * dt)

    // Already committed to power, so neither threshold below should fire again.
    // `docking` and `charging` are not listed because the early return above has
    // already excluded them.
    const enRoute = unit.phase === 'toCharger' || unit.phase === 'waitingForCharge'
      || unit.phase === 'chargingComplete'

    if (unit.battery <= fleetSimParams.criticalChargePct
      && !enRoute
      && unit.phase !== 'faulted') {
      // ── EMERGENCY ────────────────────────────────────────────────────────
      // Below critical the unit stops being a delivery resource. Dropping the
      // task is the honest outcome — the alternative is stranding it loaded.
      unit.emergency = true
      this.abandonTask(unit)
      this.beginCharge(unit)
      return
    }

    // ── ORDINARY REQUEST ──────────────────────────────────────────────────
    // Flagged here, acted on when the unit is next free (see `standDown`), so a
    // delivery already under way is finished rather than dumped mid-aisle.
    if (unit.battery < fleetSimParams.chargeRequestPct && !unit.wantsCharge && !enRoute) {
      unit.wantsCharge = true
    }
  }

  /**
   * A unit on a stall.
   *
   * Two exits, and they are different events. At `chargeAvailablePct` the unit
   * becomes dispatchable again but does NOT leave on its own — it keeps taking
   * current, and only gives the stall up early if somebody is actually waiting
   * for it. At `chargeFullPct` it is done and undocks regardless. That is what
   * makes a queue move at a sensible pace without ever leaving a stall warm and
   * empty while a unit sits behind it at 12 %.
   */
  private stepCharging (unit: Unit, dt: number): void {
    unit.speed = 0
    unit.blocked = false
    unit.emergency = false
    unit.battery = Math.min(100, unit.battery + fleetSimParams.chargePctPerSec * dt)

    const waiting = (this.chargeQueues.get(unit.chargerId ?? '') ?? []).length > 0
    const usable = unit.battery >= fleetSimParams.chargeAvailablePct
    if (unit.battery >= fleetSimParams.chargeFullPct || (usable && waiting)) {
      unit.phase = 'chargingComplete'
      unit.dwell = fleetSimParams.dockSeconds / 2
    }
  }

  /** Progress through the CURRENT charge, 0–100. See `ChargerTelemetry`. */
  private chargeProgress (unit: Unit): number {
    const span = Math.max(1, fleetSimParams.chargeFullPct - unit.chargeStartPct)
    return clamp(((unit.battery - unit.chargeStartPct) / span) * 100, 0, 100)
  }

  /** Seconds until this unit is full at the nominal rate. */
  private chargeEta (unit: Unit): number {
    return Math.max(0, (fleetSimParams.chargeFullPct - unit.battery) / fleetSimParams.chargePctPerSec)
  }

  /**
   * Roughly how far this unit could still drive, in metres.
   *
   * Laden-and-moving at its own appetite: the pessimistic figure, which is the
   * one worth having when deciding whether it can make it across the hall.
   */
  private rangeMetres (unit: Unit): number {
    const rate = fleetSimParams.drainMovingLadenPctPerSec * unit.drainScale
    if (!(rate > 0)) return 0
    return (unit.battery / rate) * unit.type.topSpeedMps
  }

  private finishDwell (unit: Unit): void {
    unit.dwell = 0
    switch (unit.phase) {
      case 'docking':
        // Contacts made. The baseline for this charge is taken here, so progress
        // is measured from where the unit actually arrived.
        unit.phase = 'charging'
        unit.chargeStartPct = unit.battery
        return
      case 'dockService':
        // Worked the bay. Straight into the next leg through `standDown` rather
        // than calling `beginPatrol` directly, so a charge request raised while
        // it was standing there is honoured before it sets off again — the same
        // check every other idle path in the model goes through.
        this.standDown(unit)
        return
      case 'chargingComplete': {
        // The one place a stall is given up. Releasing hands it straight to the
        // next unit in line rather than making it ask again — see
        // `releaseCharger`.
        this.markVacating(unit, unit.chargerId)
        this.releaseCharger(unit)
        this.standDown(unit)
        return
      }
      case 'loading': {
        const task = unit.task
        if (!task) {
          this.standDown(unit)
          return
        }
        unit.carrying = true
        unit.payloadKg = Math.min(task.massKg, unit.type.payloadKg)
        // The face frees up once the unit has pulled away from it, not the
        // moment the pallet lands on the deck.
        this.markVacating(unit, task.fromStationId)
        this.beginPhase(unit, 'toDropoff', task.toStationId!)
        return
      }
      case 'unloading': {
        const task = unit.task
        unit.carrying = false
        unit.payloadKg = null
        this.markVacating(unit, task?.toStationId)
        // The next stage is created before the unit is free again, so the cargo
        // is never briefly nowhere: it is on the station the moment it is off
        // the deck. Urgency carries over with it — see `handOn`.
        if (task) {
          this.handOn(task.kind, task.toStationId, task.priority)
          this.recordCompletion(task)
          if (task.priority === 'emergency') {
            this.raise('emergency-completed', 'info',
              `Emergency ${task.cargoId} delivered by ${unit.def.code}`
              + ` in ${Math.round(this.elapsed - task.createdAt)} s`,
              { taskId: task.id, robotId: unit.def.id })
          }
        }
        unit.task = null

        // ⚠️ THE RESUME HAPPENS HERE, BEFORE THE UNIT STANDS DOWN. Waiting for
        // ordinary dispatch would work eventually — the interrupted job is on
        // the queue like any other — but "eventually" for a job that was
        // displaced is the unit wandering back to its bay first, which reads as
        // the interruption having simply lost the work.
        //
        // It is still allowed to fail: a charge request or a taken pick face
        // both mean now is not the moment, and the link survives so ordinary
        // dispatch can complete the resume when one is free.
        if (unit.previousTaskId && !unit.wantsCharge
          && unit.battery >= fleetSimParams.reserveChargePct) {
          const pending = this.queue.find(candidate => candidate.id === unit.previousTaskId)
          if (!pending) {
            unit.previousTaskId = null
            unit.previousTaskLabel = null
          } else if (this.assignTask(unit, pending)) {
            return
          }
        }

        this.beginStandby(unit)
        return
      }
      case 'faulted': {
        unit.alert = null
        unit.stuckSeconds = 0
        unit.waitSeconds = 0
        unit.avoid.clear()
        if (unit.goalStationId) this.beginPhase(unit, this.resumePhase(unit), unit.goalStationId)
        else this.standDown(unit)
        return
      }
      default:
        this.standDown(unit)
    }
  }

  /** Which driving phase a recovered unit goes back to, given what it is holding. */
  private resumePhase (unit: Unit): Phase {
    if (!unit.task) {
      const goal = unit.goalStationId ? this.stationsById.get(unit.goalStationId) : undefined
      if (goal?.kind === 'charger') return 'toCharger'
      // ⚠️ A RECOVERED DOCK UNIT GOES BACK ONTO ITS BEAT, NOT HOME. Without this
      // it resumes as `toHome` towards the bay it was patrolling to — a `dock`
      // station driven as if it were a parking place, which ends with the unit
      // `parked` on a loading bay it has no job at and holds until something
      // else moves it. The reservation it kept through the fault is still valid,
      // so the leg is simply picked up where it was interrupted.
      if (unit.dock && unit.goalStationId === unit.patrolStationId) {
        return goal?.kind === 'dock' ? 'toDock' : 'toWaitPoint'
      }
      return 'toHome'
    }
    return unit.carrying ? 'toDropoff' : 'toPickup'
  }

  private drive (unit: Unit, dt: number): void {
    const route = unit.route
    if (!route || unit.legIndex + 1 >= route.length) {
      unit.speed = 0
      unit.blocked = false
      this.arriveAtGoal(unit)
      return
    }

    const from = route[unit.legIndex]!
    const to = route[unit.legIndex + 1]!
    const legLength = Math.hypot(to.x - from.x, to.y - from.y)

    // ── Decide a target speed ────────────────────────────────────────────────
    const topSpeed = unit.type.topSpeedMps * PLAN_UNITS_PER_METRE
    const accel = unit.type.accelMps2 * PLAN_UNITS_PER_METRE
    let target = topSpeed
    let blocked = false
    let reason = ''
    let blockedBy: string | null = null

    // Slow for the corner, or for the stop at the end of the route.
    const toLegEnd = legLength - unit.legDist
    const isLastLeg = unit.legIndex + 2 >= route.length
    if (isLastLeg) {
      // v² = 2·a·d — brake so the unit arrives at rest rather than overshooting.
      target = Math.min(target, Math.sqrt(Math.max(0, 2 * accel * toLegEnd)))
    } else if (toLegEnd < CORNER_LOOKAHEAD) {
      const next = route[unit.legIndex + 2]!
      const turn = Math.abs(angleDelta(headingOf(to.x - from.x, to.y - from.y), headingOf(next.x - to.x, next.y - to.y)))
      if (turn > 0.35) target = Math.min(target, topSpeed * CORNER_SPEED_FACTOR)
    }

    // Following distance.
    const { gap, blocker } = this.clearAhead(unit)
    if (gap < toPlanUnits(fleetGeometry.brakeFromM)) {
      if (gap <= HARD_GAP) {
        target = 0
        blocked = true
        reason = 'Holding back for the unit ahead'
        blockedBy = blocker?.def.id ?? null
      } else {
        const ease = (gap - HARD_GAP) / (toPlanUnits(fleetGeometry.brakeFromM) - HARD_GAP)
        target = Math.min(target, topSpeed * ease)
      }
    }

    // ── The junction ahead ───────────────────────────────────────────────────
    //
    // ⚠️ THE INVARIANT: a unit on a leg always holds that leg's end node, taken
    // before it set off. Everything else about traffic depends on it. It means
    // two units can never converge on the same junction, so a blocked unit is
    // always standing AT a node — somewhere it still has other exits from, and
    // somewhere it can safely be told to give way.
    //
    // Break the invariant and a unit ends up committed halfway down an aisle
    // with no reservation: it cannot reverse, re-planning it is theatre because
    // every alternative route starts from a junction it can no longer reach, and
    // whoever does hold the reservation cannot get past its body. Nothing in the
    // scheme can resolve that. So the gate is absolute — no claim, no movement,
    // not even a creep.
    if ((unit.claim !== to.id && !this.tryClaim(unit, to.id))
      || !this.tryEnterSegment(unit, from.id, to.id)) {
      target = 0
      blocked = true
      reason = 'Yielding at the junction ahead'
      blockedBy = this.lastClaimBlocker
    }

    // ── Apply it ─────────────────────────────────────────────────────────────
    const maxChange = accel * dt
    unit.speed = target > unit.speed
      ? Math.min(target, unit.speed + maxChange)
      // Braking is allowed to be sharper than accelerating; a unit that cannot
      // stop as fast as it starts is not one you would put on a floor.
      : Math.max(target, unit.speed - maxChange * 1.8)
    unit.speed = Math.max(0, unit.speed)

    unit.blocked = blocked
    unit.blockReason = reason
    unit.blockedBy = blockedBy

    let advance = unit.speed * dt
    while (advance > 0 && unit.route && unit.legIndex + 1 < unit.route.length) {
      const legFrom = unit.route[unit.legIndex]!
      const legTo = unit.route[unit.legIndex + 1]!

      // The invariant, enforced on every leg the unit touches this frame — not
      // just the one it started on. A tick that carries a unit through a node
      // and on into the next leg has to re-check there too, or the unit enters
      // an aisle it has not reserved and the guarantee above quietly stops
      // holding.
      if ((unit.claim !== legTo.id && !this.tryClaim(unit, legTo.id))
        || !this.tryEnterSegment(unit, legFrom.id, legTo.id)) {
        unit.speed = 0
        unit.blocked = true
        unit.blockReason = 'Yielding at the junction ahead'
        unit.blockedBy = this.lastClaimBlocker
        break
      }

      const length = Math.hypot(legTo.x - legFrom.x, legTo.y - legFrom.y)
      const remaining = length - unit.legDist

      if (advance < remaining) {
        unit.legDist += advance
        advance = 0
      } else {
        advance -= remaining
        unit.legIndex += 1
        unit.legDist = 0
        unit.nodeId = legTo.id
      }
    }

    // Position and facing follow from the leg the unit ended up on.
    const currentRoute = unit.route
    if (currentRoute && unit.legIndex + 1 < currentRoute.length) {
      const a = currentRoute[unit.legIndex]!
      const b = currentRoute[unit.legIndex + 1]!
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1
      const t = clamp(unit.legDist / length, 0, 1)
      unit.x = a.x + (b.x - a.x) * t
      unit.y = a.y + (b.y - a.y) * t
      this.easeHeading(unit, headingOf(b.x - a.x, b.y - a.y), dt)
    } else if (currentRoute) {
      const last = currentRoute[currentRoute.length - 1]!
      unit.x = last.x
      unit.y = last.y
    }

    this.escalateIfBlocked(unit, dt)

    if (unit.route && unit.legIndex + 1 >= unit.route.length && unit.speed < 0.5) {
      this.arriveAtGoal(unit)
    }
  }

  private easeHeading (unit: Unit, target: number, dt: number): void {
    const delta = angleDelta(unit.heading, target)
    const step = clamp(delta, -MAX_TURN_RATE * dt, MAX_TURN_RATE * dt)
    unit.heading = (unit.heading + step + TAU) % TAU
  }

  /**
   * Waiting is fine; waiting forever is a fault. Two thresholds, and the gap
   * between them is deliberate — most conflicts clear on their own inside a few
   * seconds, so re-planning immediately would just make traffic thrash.
   */
  private escalateIfBlocked (unit: Unit, dt: number): void {
    if (!unit.blocked) {
      unit.waitSeconds = 0
      unit.stuckSeconds = 0
      return
    }

    unit.waitSeconds += dt
    unit.stuckSeconds += dt

    if (unit.stuckSeconds >= fleetSimParams.stallAfterSeconds) {
      this.raiseFault(unit, 'Stalled — the aisle ahead has not cleared')
      return
    }

    if (unit.waitSeconds >= fleetSimParams.rerouteAfterSeconds && unit.route) {
      const ahead = unit.route[unit.legIndex + 1]
      if (ahead && unit.goalStationId) {
        // Treat the obstruction as a closed aisle and find another way round.
        unit.avoid.add(ahead.id)
        unit.avoidSeconds = 20
        unit.waitSeconds = 0
        this.planTo(unit, unit.goalStationId)
      }
    }
  }

  private arriveAtGoal (unit: Unit): void {
    unit.speed = 0
    unit.blocked = false
    // ⚠️ THE LANE BLOCK GOES BACK ON ARRIVAL — BUT ONLY OFF THE LANE. A unit that
    // reaches a spur (a bay, a stall, a workstation, a charger) has pulled out of
    // traffic, so holding its approach block for the whole of a load, a charge or
    // a park just locks a corridor behind a machine that is no longer in it.
    //
    // A unit at a RACK FACE has not: pick faces sit on the lane by design, so the
    // body really is in the block and the block is the only thing keeping the
    // next unit from driving through it. Releasing there is not tidying up, it is
    // removing the separation — it put units through one another at 0.00 m, which
    // the soak caught as interpenetration the moment this was applied to every
    // arrival rather than to the ones that had actually left the aisle.
    if (this.graph.spurNodes.has(unit.nodeId)) this.releaseSegment(unit)

    // A give-way detour ends where the unit's assignment does not. It has
    // arrived somewhere, but not anywhere that means anything — so pick the real
    // goal back up rather than letting `toDropoff` conclude that the pallet has
    // been delivered to whatever piece of aisle it reversed into.
    if (unit.detour) {
      unit.detour = false
      // A lay-by is borrowed, not occupied. Marking it vacating hands it back
      // the moment the unit is physically off it — the same rule every other
      // stop uses, and the reason a shelter cannot silently become a squat.
      if (unit.laybyStationId) {
        this.markVacating(unit, unit.laybyStationId)
        unit.laybyStationId = null
      }
      if (unit.goalStationId) this.planTo(unit, unit.goalStationId)
      else this.standDown(unit)
      return
    }

    switch (unit.phase) {
      case 'toPickup':
        unit.phase = 'loading'
        unit.dwell = fleetSimParams.loadSeconds
        return
      case 'toDropoff':
        unit.phase = 'unloading'
        unit.dwell = fleetSimParams.unloadSeconds
        return
      case 'toCharger':
        // Not straight to charging: the unit lines up on the contacts first.
        // The approach itself is already slow — a stall is the last node on the
        // route, so the ordinary braking model brings it in at walking pace —
        // and this is the pause at the end of it.
        unit.phase = 'docking'
        unit.dwell = fleetSimParams.dockSeconds
        unit.heading = this.dockHeading(unit)
        return
      case 'waitingForCharge':
        // Arrived at its own bay to wait. It keeps its place in line; the stall
        // is handed to it by `releaseCharger` when its turn comes.
        unit.speed = 0
        unit.route = null
        return
      case 'toHome':
        unit.phase = 'parked'
        unit.goalStationId = null
        unit.route = null
        // Parked is a rest, not a pit stop. Without this a unit that drove all
        // the way home would be dispatched again in the same frame it arrived,
        // and the bay would never actually be used.
        unit.idleSeconds = this.idleDwell()
        return

      // ── The dock beat ──────────────────────────────────────────────────────
      case 'toDock': {
        // On the bay. The stop is the behaviour asked for — approach, hold for
        // long enough to read as a transfer, then carry on — and it is the same
        // shape as `loading` deliberately, because from the floor there is no
        // difference between a unit working a bay on its beat and one working it
        // on a job. `finishDwell` picks the beat back up.
        //
        // The rotation advances HERE, on the bay, and not when the leg was
        // chosen — see `beginPatrol` for the failure that caused.
        const beat = unit.dock
        if (beat) {
          const at = beat.dockStationIds.indexOf(unit.goalStationId ?? '')
          if (at >= 0) unit.patrolIndex = (at + 1) % beat.dockStationIds.length
        }
        unit.phase = 'dockService'
        unit.dwell = fleetSimParams.dockServiceSeconds
        unit.heading = this.stopHeading(unit.goalStationId) ?? unit.heading
        return
      }
      case 'toWaitPoint':
        unit.phase = 'waitingAtPoint'
        unit.route = null
        // Two clocks, and they are not the same one. `idleSeconds` is a short
        // pause in which the unit refuses work so the stop is legible; the
        // patrol wait — already set when the leg was chosen — is much longer and
        // refuses nothing. See `Unit.patrolWait`.
        unit.idleSeconds = this.idleDwell()
        return

      default:
        unit.route = null
    }
  }

  /**
   * Which way a unit ends up facing on a spur stop.
   *
   * Same reasoning as `dockHeading` for a charging stall, generalised: a unit
   * that pulls onto a bay off the side of an aisle is squared up to the bay, not
   * still pointing down the aisle it came from. Null when the station has no
   * access point — it is then ON the lane, and the direction of travel is the
   * honest facing.
   */
  private stopHeading (stationId: string | null): number | null {
    const station = stationId ? this.stationsById.get(stationId) : undefined
    if (!station?.access) return null
    const dx = station.x - station.access[0]
    const dy = station.y - station.access[1]
    if (dx === 0 && dy === 0) return null
    return headingOf(dx, dy)
  }

  // ── Warm-up ───────────────────────────────────────────────────────────────

  private warmUp (seconds: number): void {
    if (seconds <= 0) return
    const step = 0.05
    for (let t = 0; t < seconds; t += step) this.tick(step)

    // The clock reads from the first frame the operator sees, not from the
    // model's own cold start — a warm-up is scaffolding, not elapsed shift time.
    //
    // ⚠️ REBASE THE STORED INSTANTS; DO NOT ONLY ZERO THE CLOCK. `elapsed` is
    // the origin every absolute time in the model is measured against, so
    // resetting it alone leaves `createdAt` and `assignedAt` in the OLD time
    // base — and every duration derived from them comes out wrong for as long
    // as the warm-up lasted. It failed silently in two places:
    //
    //   · a job carried over from the warm-up completed with
    //     `elapsed - createdAt` NEGATIVE. `recordCompletion` clamps at zero, so
    //     the first minutes of every run booked 0-second deliveries into
    //     `averageDeliverySeconds`, `averageQueueSeconds` and the emergency
    //     response average — the three figures the metrics panel leads with.
    //   · `waitingSeconds` reported 0 for a job that had genuinely been queued
    //     for two minutes, on a dispatch surface whose whole job is to say how
    //     long work has been waiting.
    //
    // Shifting by the offset keeps every duration exact and simply makes
    // pre-shift instants negative, which is what they are.
    const offset = this.elapsed
    const rebase = (task: Task) => {
      task.createdAt -= offset
      if (task.assignedAt !== null) task.assignedAt -= offset
    }
    for (const task of this.queue) rebase(task)
    for (const unit of this.units) if (unit.task) rebase(unit.task)

    // ⚠️ THE FEED IS EMPTIED RATHER THAN REBASED, and that is the honest answer
    // rather than the lazy one. `TaskPanel` states in its own caption that these
    // times are "simulated minutes since the run started", so a warm-up event
    // has no correct rendering here: left alone it timestamped up to 03:00 while
    // the clock beside it read 00:00 — a live surface showing a future time,
    // which is precisely the failure the freshness rules exist to prevent — and
    // rebased it would read as a negative clock. Nothing in the warm-up happened
    // during the shift an operator is watching, so nothing from it is reported.
    this.events.length = 0
    this.warnedUnassignable.clear()

    this.elapsed = 0
  }

  // ── Reporting ─────────────────────────────────────────────────────────────

  /** The public state vocabulary, derived from phase plus traffic plus priority. */
  private stateOf (unit: Unit): RobotState {
    if (unit.phase === 'faulted') return 'error'
    // ⚠️ THE CHARGING STATES OUTRANK `waiting`. A unit queued for a stall or
    // lining up on one is not "blocked in traffic", and showing it as such is
    // what makes an operator go looking for the obstruction. These are checked
    // before the traffic test for that reason.
    if (unit.phase === 'charging') return 'charging'
    if (unit.phase === 'docking') return 'docking'
    if (unit.phase === 'chargingComplete') return 'chargingComplete'
    if (unit.phase === 'waitingForCharge') return 'waitingForCharge'
    // Emergency reads over everything else it could be doing: the unit is below
    // the critical level and its only job now is to reach power.
    if (unit.emergency) return 'emergencyLowBattery'
    if (unit.phase === 'toCharger') return 'goingToCharge'

    // ⚠️ THE TRANSIENT STATUSES OUTRANK EVERYTHING BELOW BUT NOTHING ABOVE.
    // "Assigned", "Task interrupted" and "Resuming" describe what just happened
    // to the unit's WORK; a fault, a flat battery or a stall describe whether it
    // can work at all, and those have to win. See `statusHoldSeconds`.
    if (unit.statusHold > 0 && unit.statusHoldState) return unit.statusHoldState

    // Reserved for an emergency it cannot start until it clears its current run.
    // Checked before the ordinary driving states because the fact that a unit is
    // spoken for is the more useful thing to know about it.
    if (unit.pendingPriorityTaskId) return 'waitingForPriorityTask'

    // ── THE DOCK PAIR SPEAKS ITS OWN LANGUAGE FROM HERE DOWN ──────────────────
    //
    // Placed HERE, and the position is the whole of the precedence rule.
    // Everything ABOVE describes whether a unit can work at all — faulted, flat,
    // charging, held for an emergency — and an operator has to read those
    // identically on every chassis in the building, so a posting may not restate
    // them. Everything BELOW is the ordinary driving vocabulary, which for these
    // two units is replaced rather than supplemented.
    //
    // The two tests it repeats are repeated on purpose. They sit below the
    // `parked`/`standby` line in the general path, which a dock unit must not
    // take — its stop is "waiting for next task", not the fleet's generic idle —
    // so the branch is taken earlier and carries them with it. An obstruction
    // still outranks the round: a dock unit stopped in a queue is `waiting`,
    // because the thing to act on is the aisle, not the beat.
    if (unit.dock) {
      if (unit.blocked) return 'waiting'
      if (this.isPriorityRun(unit)) return 'executingPriorityTask'
      return this.dockStateOf(unit)
    }

    // Standing by IS idle — the unit has no task and is not moving. Calling it
    // anything else would put a working-looking status on a stopped robot.
    if (unit.phase === 'parked' || unit.phase === 'standby') return 'idle'
    if (unit.blocked) return 'waiting'

    // Running urgent work. Deliberately BELOW the traffic test above: a unit
    // stopped in a queue with an emergency on board is `waiting`, because the
    // thing an operator has to act on is the obstruction, not the paperwork.
    if (this.isPriorityRun(unit)) return 'executingPriorityTask'

    switch (unit.phase) {
      case 'toPickup':
      case 'loading':
        return 'toPickup'
      case 'toDropoff':
        return this.onFinalLeg(unit) ? 'delivering' : 'carrying'
      case 'unloading':
        return 'delivering'
      // `toCharger` is not here: it is answered above as `goingToCharge`, which
      // is a different thing from driving home empty.
      case 'toHome':
        return 'returning'
      default:
        return 'idle'
    }
  }

  /**
   * The five words a dock-service unit reports its round in.
   *
   * ⚠️ THE BEAT AND A REAL JOB SHARE THESE STATES, ON PURPOSE. A unit running in
   * to a bay is "going to the loading dock" whether a trailer sent it or its own
   * round did, and an operator glancing at a wall display is asking where the
   * robot is in its loop, not which subsystem issued the instruction. The
   * distinction is not lost — it is carried by `activity`, which says in words
   * whether the unit is collecting a named cargo or working the round.
   *
   * ⚠️ THE PICKUP TEST IS ON THE STATION'S KIND, NOT THE UNIT'S POSTING. A dock
   * unit collecting from a rack face reports the ordinary `toPickup`: calling
   * that "going to the loading dock" would put an operator at the wrong end of
   * the building. As the roster stands the container duty only ever picks up in
   * `loading`, so this is the same answer today — but the duty table is data and
   * a widened one must not silently start lying.
   */
  private dockStateOf (unit: Unit): RobotState {
    const goalKind = this.stationsById.get(unit.goalStationId ?? '')?.kind

    switch (unit.phase) {
      case 'toDock':
        return 'goingToLoadingDock'
      case 'dockService':
        return 'loadingAtDock'
      case 'toPickup':
        return goalKind === 'dock' ? 'goingToLoadingDock' : 'toPickup'
      case 'loading':
        return goalKind === 'dock' ? 'loadingAtDock' : 'toPickup'
      // Loaded and running it out to its warehouse destination — the delivering
      // half of the loop, and one state rather than the fleet's two because the
      // question a bay raises is "has it gone yet", not "how far has it got".
      case 'toDropoff':
      case 'unloading':
        return 'transportingCargo'
      // Empty and heading back to the beat. `toHome` is in here because a dock
      // unit only ever drives home on the fallback path in `beginPatrol`, and
      // from the floor that is the same manoeuvre as any other return leg.
      case 'toWaitPoint':
      case 'toHome':
        return 'returningToDock'
      case 'waitingAtPoint':
      case 'parked':
      case 'standby':
        return 'waitingForNextTask'
      default:
        return 'waitingForNextTask'
    }
  }

  /**
   * Is this unit running work that outranks the ordinary flow?
   *
   * Emergency and high only. Normal and low get the ordinary driving states —
   * a status that said "priority task" for 80 % of the fleet would carry no
   * information at all, which is the failure mode of every severity scheme that
   * marks the common case.
   */
  private isPriorityRun (unit: Unit): boolean {
    if (!unit.task) return false
    if (unit.task.priority !== 'emergency' && unit.task.priority !== 'high') return false
    return unit.phase === 'toPickup' || unit.phase === 'loading'
      || unit.phase === 'toDropoff' || unit.phase === 'unloading'
  }

  /**
   * "Delivering" starts on the last leg into the drop-off rather than at some
   * distance from it: that leg is the spur or aisle stub the bay hangs off, so
   * it is exactly the point where the unit stops being in transit.
   */
  private onFinalLeg (unit: Unit): boolean {
    return unit.route !== null && unit.legIndex + 2 >= unit.route.length
  }

  private activityOf (unit: Unit): string {
    if (unit.phase === 'faulted') return unit.alert ?? 'Stopped'
    if (unit.blocked) return unit.blockReason || 'Yielding'

    // The transient statuses have their own sentence — the phase underneath is
    // still `toPickup`, and reporting "Driving to pickup" the instant a unit was
    // pulled off a job would hide the very thing that just happened to it.
    if (unit.statusHold > 0) {
      switch (unit.statusHoldState) {
        case 'assigned':
          return unit.task
            ? `Assigned ${taskPriorities[unit.task.priority].label.toLowerCase()}-priority ${unit.task.cargoId}`
            : 'Assigned'
        case 'taskInterrupted':
          return `Stood down from ${unit.previousTaskLabel ?? 'its previous job'}`
        case 'resumingPreviousTask':
          return `Resuming ${unit.previousTaskLabel ?? 'its interrupted job'}`
      }
    }

    if (unit.pendingPriorityTaskId) {
      return 'Reserved for an emergency — finishing its current run'
    }

    const cargo = duties[unit.type.duty].cargoNoun
    /**
     * Urgency is APPENDED, never substituted: an operator still has to know
     * whether the unit is collecting or delivering, and a line that read only
     * "Emergency" would have replaced the information with the alarm.
     * Normal and low add nothing — marking the common case marks nothing.
     */
    const urgent = unit.task && (unit.task.priority === 'emergency' || unit.task.priority === 'high')
      ? ` · ${taskPriorities[unit.task.priority].label} priority`
      : ''

    switch (unit.phase) {
      // ── The dock beat ──────────────────────────────────────────────────────
      //
      // ⚠️ THIS IS WHERE THE ROUND AND A REAL JOB ARE TOLD APART. `state` gives
      // both of them the same five words, which is right for a glance at a wall
      // display and not enough for an operator deciding whether to interrupt
      // one. These lines name the bay and say plainly that the unit is working
      // its round with no cargo assigned — so nothing here may be phrased as a
      // delivery, and none of it names a cargo id, because there is not one.
      case 'toDock':
        return `Running in to ${this.stationsById.get(unit.goalStationId ?? '')?.label ?? 'a loading bay'}`
          + ' — dock service round, no cargo assigned'
      case 'dockService':
        return `Working ${this.stationsById.get(unit.goalStationId ?? '')?.label ?? 'the loading bay'}`
      case 'toWaitPoint':
        return `Returning to ${this.stationsById.get(unit.goalStationId ?? '')?.label ?? 'its waiting position'}`
      case 'waitingAtPoint':
        return unit.wantsCharge
          ? 'Waiting for the next task — awaiting a stall'
          : 'Waiting for the next task — available now'

      case 'loading':
        return `Loading ${cargo}${urgent}`
      case 'unloading':
        return `Unloading ${cargo}${urgent}`
      case 'charging': {
        const label = this.stationsById.get(unit.chargerId ?? '')?.label ?? 'stall'
        const usable = unit.battery >= fleetSimParams.chargeAvailablePct
        return usable
          ? `Charging on ${label} — available for work`
          : `Charging on ${label} to ${fleetSimParams.chargeFullPct}%`
      }
      case 'docking':
        return `Docking on ${this.stationsById.get(unit.chargerId ?? '')?.label ?? 'stall'}`
      case 'chargingComplete':
        return 'Charge complete — undocking'
      case 'waitingForCharge': {
        const place = this.queuePosition(unit)
        const label = this.stationsById.get(unit.chargerId ?? '')?.label ?? 'a stall'
        return place ? `Waiting for ${label} — ${place} in line` : `Waiting for ${label}`
      }
      case 'parked':
        // Every unit is in service now, so a parked one is genuinely between
        // jobs rather than held back — there is no pool and nothing to explain.
        return unit.wantsCharge ? 'Standing by — awaiting a stall' : 'Standing by'
      case 'standby':
        return 'Standing by at drop-off'
      case 'toCharger':
        return unit.emergency
          ? `Low battery — running to ${this.stationsById.get(unit.chargerId ?? '')?.label ?? 'a charger'}`
          : `Driving to ${this.stationsById.get(unit.chargerId ?? '')?.label ?? 'charger'}`
      case 'toHome':
        return 'Driving to waiting bay'
      case 'toPickup':
        return `Driving to pickup${urgent}`
      case 'toDropoff':
        return this.onFinalLeg(unit)
          ? `Approaching drop-off${urgent}`
          : `In transit with ${cargo}${urgent}`
      default:
        return 'Standing by'
    }
  }

  private taskLabelOf (unit: Unit): string {
    if (!unit.task) {
      if (unit.phase === 'toCharger' || unit.phase === 'charging') return 'Recharging'
      if (unit.phase === 'faulted') return 'Held — needs attention'
      if (unit.previousTaskId) return `Interrupted — ${unit.previousTaskLabel ?? 'job requeued'}`
      // ⚠️ STILL "NO TASK", AND IT HAS TO SAY SO. A dock unit on its round has
      // no cargo, no destination anyone is waiting on, and can be pulled onto
      // real work in the next frame. Naming the round is what stops the roster
      // reading as two robots doing nothing all shift; calling it an assignment
      // would be inventing a job the scheduler does not have.
      if (unit.dock) return 'Dock service round — no task assigned'
      return 'No task assigned'
    }
    return this.labelOfTask(unit.task)
  }

  /**
   * Where the job an interrupted unit was pulled off has got to.
   *
   * DERIVED from the queue rather than remembered, so it cannot go stale: if
   * another unit took the job, this says so the moment it happened rather than
   * when somebody thought to clear a flag.
   */
  private previousTaskStateOf (unit: Unit): RobotTelemetry['previousTaskState'] {
    if (unit.statusHold > 0 && unit.statusHoldState === 'resumingPreviousTask') return 'resuming'
    if (!unit.previousTaskId) return null
    return this.queue.some(task => task.id === unit.previousTaskId) ? 'requeued' : 'taken-by-another'
  }

  /**
   * The charging stalls, and who is on them.
   *
   * `state` distinguishes a stall that is FREE from one that is CLAIMED by a unit
   * still driving to it. That difference is the answer to "there are two empty
   * chargers, why is that robot waiting" — it is not empty, it is spoken for —
   * and without it the view would contradict the model in a way an operator
   * would read as a bug in the floor rather than in the screen.
   */
  private reportChargers (): ChargerTelemetry[] {
    return this.chargerStations.map(station => {
      const holderId = this.stationHolder.get(station.id) ?? null
      const holder = holderId ? this.unitsById.get(holderId) ?? null : null
      // Docking counts as charging for the stall's own status: the unit is
      // physically on it and nothing else can have it.
      const docked = holder?.phase === 'charging' || holder?.phase === 'docking'
        || holder?.phase === 'chargingComplete'
      const queue = this.chargeQueues.get(station.id) ?? []

      return {
        id: station.id,
        label: station.label,
        x: station.x,
        y: station.y,
        // A stall faces its own access point — that is the direction a unit
        // arrives from, and therefore the way the equipment has to be turned.
        headingRad: headingOf(station.access[0] - station.x, station.access[1] - station.y),
        occupiedBy: holder?.def.id ?? null,
        occupiedByCode: holder?.def.code ?? null,
        batteryPct: docked ? Math.round(holder!.battery * 10) / 10 : null,
        progressPct: holder?.phase === 'charging' ? Math.round(this.chargeProgress(holder)) : null,
        etaSeconds: holder?.phase === 'charging' ? Math.round(this.chargeEta(holder)) : null,
        // Codes, not ids: this is read straight into a panel.
        queue: queue
          .map(id => this.unitsById.get(id)?.def.code)
          .filter((code): code is string => code !== undefined),
        state: docked ? 'charging' : holder ? 'reserved' : 'free',
      }
    })
  }

  /** 1-based place in line, or null when this unit is not queued. */
  private queuePosition (unit: Unit): number | null {
    if (!unit.chargerId) return null
    const queue = this.chargeQueues.get(unit.chargerId)
    if (!queue) return null
    const at = queue.indexOf(unit.def.id)
    return at < 0 ? null : at + 1
  }

  private reportUnit (unit: Unit): RobotTelemetry {
    const goal = unit.goalStationId ? this.stationsById.get(unit.goalStationId) : undefined

    let distanceRemainingM: number | null = null
    let etaSeconds: number | null = null
    if (unit.route && unit.legIndex + 1 < unit.route.length) {
      const rest = unit.route.slice(unit.legIndex + 1)
      const toNextNode = Math.hypot(rest[0]!.x - unit.x, rest[0]!.y - unit.y)
      const planUnits = toNextNode + routeLength(rest)
      distanceRemainingM = toMetres(planUnits)
      // Rated speed with a traffic allowance — an estimate over the remaining
      // route, never a reading, and labelled as such wherever it is shown.
      etaSeconds = distanceRemainingM / (unit.type.topSpeedMps * 0.72)
    }

    return {
      id: unit.def.id,
      code: unit.def.code,
      typeId: unit.def.typeId,
      state: this.stateOf(unit),
      activity: this.activityOf(unit),
      taskId: unit.task?.id ?? null,
      taskKind: unit.task?.kind ?? null,
      taskLabel: this.taskLabelOf(unit),
      destinationLabel: goal?.label ?? '',
      destinationAddress: goal?.address ?? null,
      batteryPct: Math.round(unit.battery * 10) / 10,
      speedMps: Math.round((unit.speed / PLAN_UNITS_PER_METRE) * 100) / 100,
      x: unit.x,
      y: unit.y,
      headingRad: unit.heading,
      carrying: unit.carrying,
      payloadKg: unit.payloadKg,
      distanceRemainingM: distanceRemainingM === null ? null : Math.round(distanceRemainingM),
      etaSeconds: etaSeconds === null ? null : Math.round(etaSeconds),
      alert: unit.alert,
      chargerId: unit.chargerId,
      chargerLabel: unit.chargerId ? this.stationsById.get(unit.chargerId)?.label ?? null : null,
      queuePosition: this.queuePosition(unit),
      chargeEtaSeconds: unit.phase === 'charging' ? Math.round(this.chargeEta(unit)) : null,
      chargeProgressPct: unit.phase === 'charging' ? Math.round(this.chargeProgress(unit)) : null,
      rangeM: Math.round(this.rangeMetres(unit)),
      taskPriority: unit.task?.priority ?? null,
      previousTaskLabel: unit.previousTaskLabel,
      previousTaskState: this.previousTaskStateOf(unit),
    }
  }

  // ── Priority reporting ────────────────────────────────────────────────────

  /**
   * Every LIVE job — queued first, in the queue's own order, then the assigned
   * ones sorted the same way.
   *
   * ⚠️ THE QUEUE'S ORDER IS EMITTED VERBATIM (see `queue`). A panel that renders
   * this array top to bottom is showing the scheduler's real next-out order; one
   * that re-sorted could quietly disagree with the model about what happens
   * next, which on a dispatch surface is worse than showing nothing.
   */
  private reportTasks (): TaskTelemetry[] {
    const rows: TaskTelemetry[] = this.queue.map(task => this.reportTask(task, null))

    const assigned: Array<{ task: Task; unit: Unit }> = []
    for (const unit of this.units) {
      if (unit.task) assigned.push({ task: unit.task, unit })
    }
    assigned.sort((a, b) => {
      const rank = taskPriorities[a.task.priority].rank - taskPriorities[b.task.priority].rank
      return rank !== 0 ? rank : a.task.createdAt - b.task.createdAt
    })

    for (const { task, unit } of assigned) rows.push(this.reportTask(task, unit))
    return rows
  }

  private reportTask (task: Task, unit: Unit | null): TaskTelemetry {
    let status: TaskTelemetry['status'] = 'queued'
    if (task.interrupted && !unit) status = 'interrupted'
    else if (unit) {
      if (unit.statusHold > 0 && unit.statusHoldState === 'assigned') status = 'assigned'
      else if (unit.carrying) status = this.onFinalLeg(unit) || unit.phase === 'unloading' ? 'delivering' : 'carrying'
      else status = 'toPickup'
    }

    // ⚠️ NO ETA FOR A QUEUED JOB. There is no unit, therefore no route,
    // therefore no honest estimate — and an invented one would be a calculation
    // wearing a measurement's clothes.
    let etaSeconds: number | null = null
    if (unit) {
      etaSeconds = Math.round(this.secondsToFinish(unit))
    }

    return {
      id: task.id,
      kind: task.kind,
      priority: task.priority,
      cargoId: task.cargoId,
      label: this.labelOfTask(task),
      status,
      assignedRobotId: unit?.def.id ?? null,
      assignedRobotCode: unit?.def.code ?? null,
      pickupLabel: task.fromStationId ? this.stationsById.get(task.fromStationId)?.label ?? null : null,
      deliveryLabel: task.toStationId ? this.stationsById.get(task.toStationId)?.label ?? null : null,
      // Both stops go out as ids as well as labels: a label is for reading, an
      // id is what a map resolves a position from. See `TaskTelemetry`.
      pickupStationId: task.fromStationId,
      deliveryStationId: task.toStationId,
      waitingSeconds: Math.max(0, Math.round(this.elapsed - task.createdAt)),
      queuedSeconds: task.assignedAt === null ? null : Math.max(0, Math.round(task.assignedAt - task.createdAt)),
      etaSeconds,
      resumingFor: task.resumeUnitId,
    }
  }

  private reportMetrics (): FleetMetrics {
    const s = this.stats
    const highCreated = s.createdByPriority.high
    return {
      totalTasks: s.created,
      tasksCompleted: s.deliveryCount,
      emergencyTasksCompleted: s.completedByPriority.emergency,
      averageDeliverySeconds: s.deliveryCount
        ? Math.round(s.deliverySecondsTotal / s.deliveryCount)
        : null,
      averageEmergencyResponseSeconds: s.emergencyResponseCount
        ? Math.round(s.emergencyResponseSecondsTotal / s.emergencyResponseCount)
        : null,
      highPriorityCompletionRate: highCreated
        ? s.completedByPriority.high / highCreated
        : null,
      robotUtilisation: s.totalUnitSeconds > 0 ? s.busyUnitSeconds / s.totalUnitSeconds : 0,
      averageQueueSeconds: s.queueCount ? Math.round(s.queueSecondsTotal / s.queueCount) : null,
      tasksInterrupted: s.interrupted,
      tasksResumed: s.resumed,
    }
  }

  /** Live head-count per priority, over queued AND assigned work. */
  private countByPriority (rows: TaskTelemetry[]): Record<TaskPriority, number> {
    const counts: Record<TaskPriority, number> = { emergency: 0, high: 0, normal: 0, low: 0 }
    for (const row of rows) counts[row.priority] += 1
    return counts
  }
}
