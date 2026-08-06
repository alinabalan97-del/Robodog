/**
 * src/data/fleet.ts
 *
 * Dataset for the autonomous mobile robot (AMR) fleet that works the hall drawn
 * by `src/data/floorOps.ts`. Same house rule as that file: a CONTRACT (the
 * exported interfaces) plus one synthetic DATA object matching it.
 *
 * ⚠️ EVERY VALUE HERE IS SYNTHETIC. Robot codes, speeds, payloads, battery
 * curves, storage addresses, dock names and the road network itself are invented
 * for a demonstration and must never be mistaken for a real facility (CLAUDE.md →
 * Domain rules). The simulation in `src/sim/` drives them; it is a SIMULATION,
 * not telemetry, and the UI is required to say so.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️⚠️ THIS FILE WAS DESTROYED AND REBUILT. READ THIS BEFORE TRUSTING IT. ⚠️⚠️
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * On 2026-08-04 an over-greedy regex deletion removed ~1 550 of this file's
 * ~1 900 lines. The file had never been committed, and every recovery route was
 * exhausted and failed: no git object, no editor Local History, no Recycle Bin
 * entry, no shadow copy, no dev-server cache. A replay of the recorded editing
 * operations from the session transcripts reached 96 of 115 ops and produced a
 * file that had never existed — an obsolete one-way corridor set beside current
 * chassis sizes — so it was discarded rather than shipped.
 *
 * What is here was rebuilt from three sources, and EVERY declaration below is
 * tagged with which one:
 *
 *   ✔ VERIFIED   Recovered from something that survived and can be checked.
 *                The contracts come from the consumers that import them
 *                (`fleetSim.ts`, `navGraph.ts`, `stores/fleet.ts`, the
 *                components) — their imports name every export and their field
 *                accesses name every property, so the SHAPE is not a guess. The
 *                state vocabulary is copied verbatim from the surviving
 *                `ROBOT_STATE_LABEL`. The layout is re-measured from the
 *                warehouse GLB by `scripts/plan-network.mjs`.
 *   ⟲ RECONSTRUCTED  A working value chosen now. It is NOT the original number,
 *                and where the original's reasoning is unknown that is said
 *                plainly instead of invented.
 *
 * ⚠️ WHAT IS PERMANENTLY GONE is the commentary: roughly a thousand lines
 * recording WHY each figure was what it was, including several post-mortems of
 * bugs found by soak runs that are not reproducible from here. Comments below
 * are newly written and describe what the code does now. They do not claim
 * provenance they do not have. If a number here looks arbitrary, it is because
 * its justification died with the file — re-derive it, do not defend it.
 *
 * ── THE THREE HALVES ─────────────────────────────────────────────────────────
 *
 *   1. FLEET      robot types, the five units, and the states/tasks they hold.
 *   2. NETWORK    corridors robots may drive on and stations they may stop at.
 *                 This is the ONLY place layout lives; `src/sim/navGraph.ts`
 *                 compiles it into a routable graph.
 *   3. TELEMETRY  the per-frame shape the simulation emits and the UI renders.
 */

// ─── 0 · Scale ────────────────────────────────────────────────────────────────

/**
 * ✔ VERIFIED — survived the deletion, and independently reproduced by
 * `scripts/plan-network.mjs` ("1 metre = 47.684 plan units").
 *
 * The plan is drawn in abstract units; everything physical is in metres. This is
 * the one bridge between them.
 */
export const PLAN_UNITS_PER_METRE = 47.684

export const toMetres = (planUnits: number) => planUnits / PLAN_UNITS_PER_METRE
export const toPlanUnits = (metres: number) => metres * PLAN_UNITS_PER_METRE

/**
 * ✔ VERIFIED — required by `scripts/soak-fleet.mjs` and `soak-traffic.mjs`.
 *
 * ⚠️ NOT THE SAME AS `1 / PLAN_UNITS_PER_METRE`, and the difference matters.
 * `PLAN_UNITS_PER_METRE` is the dataset's declared scale; this is the rate the
 * 3D scene actually renders the plan at once the projection has fitted it to the
 * building. The soak asks "are two machines drawn inside each other?", which is
 * a question about what a viewer sees, so it converts through this one.
 */
export const RENDERED_METRES_PER_PLAN_UNIT = 0.02097

// ─── 1 · The fleet ────────────────────────────────────────────────────────────

/** ✔ VERIFIED — three chassis ids, referenced across the sim and the UI. */
export type RobotTypeId = 'A' | 'B' | 'C'

/** ✔ VERIFIED — `stores/fleet.ts` re-exports this for the model registry. */
export interface RobotSize {
  lengthM: number
  widthM: number
  heightM: number
}

/**
 * ✔ VERIFIED — all 23 members copied verbatim from the surviving
 * `ROBOT_STATE_LABEL` in `src/stores/fleet.ts`, which is a `Record<RobotState,…>`
 * and therefore an exact list.
 *
 * What an operator sees a unit doing. Fixed vocabulary: free-text detail goes in
 * `RobotTelemetry.activity`, never here, so a filter or a colour key can rely on
 * this set being closed.
 */
export type RobotState =
  | 'idle'
  | 'toPickup'
  | 'carrying'
  | 'delivering'
  | 'returning'
  | 'waiting'
  | 'error'
  // ── Charging. Five states rather than one: "charging" alone cannot answer the
  // question an operator actually has — is it driving to a stall, queued behind
  // two others, lining up, taking current, or done and about to leave.
  | 'goingToCharge'
  | 'waitingForCharge'
  | 'docking'
  | 'charging'
  | 'chargingComplete'
  | 'emergencyLowBattery'
  // ── Priority scheduling. `emergencyLowBattery` above is a unit that CANNOT
  // work; `executingPriorityTask` is a unit working on the most important thing
  // in the building. Different emergencies, kept in different words.
  | 'assigned'
  | 'executingPriorityTask'
  | 'waitingForPriorityTask'
  | 'taskInterrupted'
  | 'resumingPreviousTask'
  // ── Dock service. The two posted units report their round in these words
  // instead of the general driving vocabulary; charging, fault and priority
  // states are shared, because those say whether a unit can work at all.
  | 'goingToLoadingDock'
  | 'loadingAtDock'
  | 'transportingCargo'
  | 'returningToDock'
  | 'waitingForNextTask'

/** ✔ VERIFIED — the four stages of one goods flow, used as a discriminator. */
export type TaskKind = 'pallet' | 'container' | 'cart' | 'store'

/** ✔ VERIFIED — four levels, referenced by the scheduler and every surface. */
export type TaskPriority = 'emergency' | 'high' | 'normal' | 'low'

/** ✔ VERIFIED shape — every field below is read by the sim or a component. */
export interface TaskPriorityDef {
  id: TaskPriority
  /** LOWER SORTS FIRST. The only number the scheduler compares. */
  rank: number
  /** What an operator reads. Never abbreviated to a colour. */
  label: string
  /** Glyph carrying the level when colour cannot. Key from `src/icons/carbon.ts`. */
  icon: string
  /** Theme token for chips and badges. A token NAME, never a hex. */
  tone: string
  /** Theme token for a route ribbon — deliberately separate from `tone`. */
  routeTone: string
  /** Whether a route at this level pulses. Reserved for the top level. */
  flashes: boolean
}

/**
 * ⟲ RECONSTRUCTED values, ✔ VERIFIED shape.
 *
 * This table IS the scheduler's ordering: the queue is kept sorted by `rank`
 * then creation time on every insert, so priority is a property of the container
 * rather than a comparison anyone has to remember to make. The same table
 * carries each level's word, icon and colours so the sim and every surface that
 * draws it read one source.
 */
export const taskPriorities: Record<TaskPriority, TaskPriorityDef> = {
  emergency: {
    id: 'emergency', rank: 0, label: 'Emergency', icon: 'alertFilled',
    tone: 'error', routeTone: 'error', flashes: true,
  },
  high: {
    id: 'high', rank: 1, label: 'High', icon: 'levelHigh',
    tone: 'warning', routeTone: 'warning', flashes: false,
  },
  normal: {
    id: 'normal', rank: 2, label: 'Normal', icon: 'levelMedium',
    tone: 'info', routeTone: 'primary-bright', flashes: false,
  },
  low: {
    id: 'low', rank: 3, label: 'Low', icon: 'levelLow',
    tone: 'on-surface-weak', routeTone: 'outline-medium', flashes: false,
  },
}

/** ✔ VERIFIED — `stores/fleet.ts` re-exports and maps over this. */
export const taskPriorityOrder: TaskPriority[] =
  (Object.keys(taskPriorities) as TaskPriority[])
    .sort((a, b) => taskPriorities[a].rank - taskPriorities[b].rank)

/** ✔ VERIFIED — six areas, referenced by `duties` and every station. */
export type WorkArea = 'west' | 'centre' | 'east' | 'highbay' | 'loading' | 'production'

/** ✔ VERIFIED shape — `fleetSim` reads every field. */
export interface Duty {
  kind: TaskKind
  /** Areas a unit on this stage may COLLECT from. */
  pickup: WorkArea[]
  /** Areas it may DELIVER to. */
  dropoff: WorkArea[]
  /** The stage a finished job hands on to, or null when the flow ends. */
  feeds: TaskKind | null
  cargoNoun: string
  cargoPrefix: string
  verb: string
}

/**
 * ⟲ RECONSTRUCTED area lists, ✔ VERIFIED shape and flow order.
 *
 * ── THE FLOW ────────────────────────────────────────────────────────────────
 *
 *   forklift lifts a pallet out of the west or centre racking and sets it on the
 *   loading apron  →  an AMR breaks that down into containers and carries them
 *   to a workstation (or back into storage as put-away)  →  an AGV tugs the
 *   finished cart on to the next workstation or out to a bay  →  the ASRS files
 *   the result into the high bay.
 *
 * ⚠️ THE AREAS ARE WHAT CONTAIN THE ROBOTS. Nothing tells a forklift to stay
 * near the west racking — every job it can be handed simply starts and ends
 * there. Widening one of these lists changes where robots drive; it is a
 * behaviour change, not a tidy-up.
 */
export const duties: Record<TaskKind, Duty> = {
  pallet: {
    kind: 'pallet',
    pickup: ['west', 'centre'],
    dropoff: ['loading'],
    feeds: 'container',
    cargoNoun: 'pallet',
    cargoPrefix: 'PL',
    verb: 'Move',
  },
  container: {
    kind: 'container',
    // The only duty reaching the whole building, which is why the AMRs are the
    // units seen crossing it. Storage is a drop-off so put-away happens too: an
    // apron that only ever empties into workstations is a conveyor, not a
    // warehouse.
    pickup: ['loading'],
    dropoff: ['production', 'west', 'centre', 'east'],
    feeds: 'cart',
    cargoNoun: 'container',
    cargoPrefix: 'CN',
    verb: 'Transport',
  },
  cart: {
    kind: 'cart',
    pickup: ['production'],
    dropoff: ['production', 'loading'],
    feeds: 'store',
    cargoNoun: 'cart',
    cargoPrefix: 'CT',
    verb: 'Tug',
  },
  // Served by the ASRS cranes, so it has no drivable areas and is never handed
  // to a mobile unit. It is in the table because it is a real stage and the
  // stage before it feeds it — see `FleetSim.handOn`.
  store: {
    kind: 'store',
    pickup: ['highbay'],
    dropoff: ['highbay'],
    feeds: null,
    cargoNoun: 'container',
    cargoPrefix: 'CN',
    verb: 'File',
  },
}

/** ⟲ RECONSTRUCTED — the mass range a pallet job draws from, in kilograms. */
export const palletMassRangeKg: readonly [number, number] = [180, 1100]

// ─── 2 · Vehicle geometry ─────────────────────────────────────────────────────

/**
 * ✔ VERIFIED against `scripts/plan-network.mjs`, run with `WIDTH_M=1.06`.
 *
 * The forklift AS RENDERED. The scene fits every model by height and this asset
 * is proportionally wide, so what stands on the floor is not the declared size.
 * Clearances are computed from what is DRAWN — a margin measured against a
 * number nobody can see would be a margin against nothing.
 *
 * At the fleet's reduced size the extractor reports body 1.3886 × 1.06 m and an
 * envelope of 1.75 m, which is exactly what the two figures below produce.
 */
const LIMITING = { lengthM: 1.39, widthM: 1.06 }

/**
 * ✔ VERIFIED — every derived figure below matches `plan-network.mjs` at the same
 * width: stopping gap 1.90 m, min through leg 2.25 m (= 107 plan units).
 *
 * ── EVERY DISTANCE IN THE NETWORK, DERIVED FROM ONE VEHICLE ─────────────────
 *
 * The forklift is the limiting vehicle: longest, widest, slowest to stop, so a
 * network it can work is one every other chassis can work. Nothing here is a
 * chosen number — each is the envelope plus a stated margin, and resizing the
 * forklift respaces the whole network with it.
 */
export const fleetGeometry = {
  /** Diameter of the circle the limiting chassis sweeps turning on the spot. */
  envelopeM: Math.hypot(LIMITING.lengthM, LIMITING.widthM),
  /**
   * Closest two units may ever be, centre to centre. One envelope plus a hand's
   * width, so a queue looks like a queue rather than like a collision.
   */
  get stopGapM () { return this.envelopeM + 0.15 },
  /**
   * How far off a lane's centre line another unit still counts as "in my lane".
   * Half the widest body plus a margin.
   */
  get laneHalfWidthM () { return LIMITING.widthM / 2 + 0.06 },
  /**
   * A junction may not be claimed while another unit is this close to it.
   *
   * ⚠️ MUCH SMALLER THAN THE STOPPING GAP, deliberately. Block reservation
   * already guarantees separation along a lane; all this has to do is stop a
   * unit claiming a junction another unit is physically standing in. Sized at a
   * full envelope it vetoes the neighbouring nodes too, which on 2.6 m segments
   * closes three junctions around one parked unit.
   */
  get junctionClearM () { return this.envelopeM / 2 + 0.1 },
  /**
   * Shortest lane segment that is still drivable, and the constraint that caps
   * how many stops a lane can carry. It must exceed the stopping gap: a unit
   * brakes to a halt short of the node it has claimed, and on a shorter segment
   * it ends up straddling a junction it does not own.
   *
   * `navGraph.MIN_THROUGH_LEG` is this in plan units, and `assertConnected`
   * refuses a network that violates it.
   */
  get minLegM () { return this.stopGapM + 0.35 },
  /** Minimum spacing between two stations on the same lane. Same reason. */
  get stationSpacingM () { return this.minLegM },
  /**
   * Where a follower stops dead behind whatever is in front of it.
   *
   * Smaller than `stopGapM` on purpose: since block reservation went in, two
   * units in lanes are always in different blocks and therefore already a
   * segment apart. All this does is make the approach look like braking rather
   * than a snap to zero.
   */
  get followStopM () { return this.envelopeM * 0.55 },
  /** Distance at which a unit starts easing off for whatever is ahead. */
  get brakeFromM () { return this.stopGapM * 2.5 },
}

// ─── 3 · The road network ─────────────────────────────────────────────────────

/**
 * ✔ VERIFIED shape — `navGraph.buildNavGraph` reads every field.
 *
 * `flow` is retained by the contract but the whole network is `both`: at 1.2 m
 * these aisles are one vehicle wide, so direction is arbitrated per segment by
 * the traffic controller rather than fixed by the layout.
 */
export type CorridorFlow = 'forward' | 'reverse' | 'both'

export interface Corridor {
  id: string
  /** 'h' runs along x at a fixed y; 'v' runs along y at a fixed x. */
  axis: 'h' | 'v'
  /** The fixed coordinate — y for 'h', x for 'v'. */
  at: number
  /** Span along the corridor's own axis. `from` is always the lower value. */
  from: number
  to: number
  flow: CorridorFlow
  /** Shown to an operator when a route is described. */
  label: string
}

/**
 * ✔ VERIFIED — RE-MEASURED from the warehouse GLB, not remembered.
 *
 * `node scripts/plan-network.mjs` (with `WIDTH_M=1.06` for the reduced fleet)
 * reads the clearance grid `extract-warehouse-nav.mjs` rasterised from the model
 * and reports which lanes carry the limiting vehicle end to end. It finds
 * exactly three horizontal bands, and these are their measured extents:
 *
 *   y 160–255   best row y=230 → x −17 … 1277  (27.14 m)
 *   y 365–540   best row y=430 → x  39 … 1139  (23.07 m)
 *   y 655–735   best row y=675 → x −13 …  771  (16.44 m)
 *
 * The lanes below sit on those rows, trimmed to the stations they serve.
 *
 * ⚠️ THE NORTH AISLE RUNS THE WHOLE BUILDING, AND ONLY BECAUSE THE FLEET SHRANK.
 * At the old 1.2 m width the same row measures clear only to x≈595 — loose plant
 * narrows the band around x 600–655. At 1.06 m it clears end to end, which is
 * what turns the north aisle from a western spur into a full parallel route.
 * The extractor's own width table says the same thing: 3 cross-overs at 1.20 m,
 * 5 at 1.00 m. Re-run it before changing any lane; free floor on the 2D map is
 * not the same as drivable floor in the model.
 *
 * ⚠️ NO VERTICAL LANE CROSSES THE BUILDING. The extractor is explicit: "the
 * racking runs the length of the building". The three cross-overs below are the
 * gaps between rack runs, and they are the only ways across.
 */
export const corridors: Corridor[] = [
  { id: 'h-n', axis: 'h', at: 230, from: 64, to: 1195, flow: 'both', label: 'North aisle' },
  { id: 'h-c', axis: 'h', at: 430, from: 63, to: 1073, flow: 'both', label: 'Centre spine' },
  { id: 'h-s', axis: 'h', at: 675, from: 63, to: 755, flow: 'both', label: 'South aisle' },

  { id: 'v-w', axis: 'v', at: 63, from: 230, to: 675, flow: 'both', label: 'West cross-over' },
  { id: 'v-m', axis: 'v', at: 573, from: 230, to: 675, flow: 'both', label: 'Middle cross-over' },
  // Stops at the spine. Continuing south to y 675 would arrive nowhere: the
  // measured south band ends at x≈771, so there is no lane there to join.
  { id: 'v-e', axis: 'v', at: 1073, from: 230, to: 430, flow: 'both', label: 'East cross-over' },
]

/**
 * ✔ VERIFIED shape — `navGraph` and `fleetSim` read every field.
 *
 *   rack     a pick face beside storage racking
 *   dock     a bay in the loading zone — where pallets enter and leave
 *   work     a production workstation
 *   charger  a charging stall
 *   hold     a marked waiting bay
 *
 * EVERY STATION IS AN EXCLUSIVE RESOURCE. Dispatch reserves one before a robot
 * is routed to it, so two units are never sent to the same place.
 */
export type StationKind = 'rack' | 'dock' | 'work' | 'charger' | 'hold'

export interface Station {
  id: string
  kind: StationKind
  /** Human name — read out to assistive tech and shown as the destination. */
  label: string
  /** Where the robot physically ends up. */
  x: number
  y: number
  /**
   * The lane node a unit enters from.
   *
   * ⚠️ REQUIRED, NOT OPTIONAL — `navGraph.buildNavGraph` dereferences it without
   * a guard and throws by name if it is not on a declared corridor. A station
   * that stands ON its lane (a rack face) repeats its own position here; when it
   * differs the station is a SPUR and a unit stopped there is out of the lane.
   */
  access: [number, number]
  /** Storage address, for rack faces and workstations. */
  address?: string
  /** Which patch of the hall this is in. Absent on bays and stalls. */
  area?: WorkArea
  /** Chassis allowed to stop here. Absent means any. */
  types?: RobotTypeId[]
}

/**
 * ⟲ RECONSTRUCTED positions, ✔ VERIFIED spacing rule.
 *
 * ⚠️ SPACING IS THE CONSTRAINT. Every access point on a lane splits it, and no
 * through segment may be shorter than `fleetGeometry.minLegM` (2.25 m = 107 plan
 * units at the current fleet). `assertConnected` enforces this at construction
 * and the network below passes it — that check, not this comment, is the proof.
 *
 * Pick faces sit ON their lane: a unit stopping to pick blocks it, as on a real
 * floor. Everything else hangs off a SPUR so a stopped unit is out of the way.
 */
const RACK_XS = [190, 320, 450]

/** Which patch of the building a face belongs to, from where it stands. */
function areaOf (x: number): WorkArea {
  return x <= 350 ? 'west' : 'centre'
}

const rackStations: Station[] = [
  ...RACK_XS.map((x, i) => ({
    id: `rk-n0${i + 1}`,
    kind: 'rack' as const,
    label: `Rack face N${i + 1}`,
    address: `N-${String(i + 1).padStart(2, '0')}`,
    x,
    y: 230,
    // On the lane, not on a spur — so the access point IS the stop.
    access: [x, 230] as [number, number],
    area: areaOf(x),
  })),
  ...RACK_XS.map((x, i) => ({
    id: `rk-s0${i + 1}`,
    kind: 'rack' as const,
    label: `Rack face S${i + 1}`,
    address: `S-${String(i + 1).padStart(2, '0')}`,
    x,
    y: 675,
    access: [x, 675] as [number, number],
    area: areaOf(x),
  })),
]

/**
 * ⟲ RECONSTRUCTED. Four loading points at the ends the building opens at, plus
 * one cross-dock staging bay.
 *
 * All sit on spurs beyond a lane terminus, so a unit on a bay is clear of the
 * aisle it arrived down. The staging bay exists because `loading` is the hall's
 * pinch point — the pallet stage DROPS there and the container stage COLLECTS
 * there, so without a fifth bay the forklifts hold every one continuously and
 * the AMRs have nowhere to pick up.
 */
const dockStations: Station[] = [
  { id: 'dk-w1', kind: 'dock', label: 'Loading bay W1', x: 25, y: 430, access: [63, 430], area: 'loading' },
  { id: 'dk-e1', kind: 'dock', label: 'Loading bay E1', x: 1120, y: 430, access: [1073, 430], area: 'loading' },
  { id: 'dk-s1', kind: 'dock', label: 'Loading bay S1', x: 790, y: 675, access: [755, 675], area: 'loading' },
  // On the north aisle's east end, which the extended lane now reaches.
  { id: 'dk-n1', kind: 'dock', label: 'Receiving bay N1', x: 1230, y: 230, access: [1195, 230], area: 'loading' },
  { id: 'dk-c1', kind: 'dock', label: 'Staging bay C1', x: 823, y: 390, access: [823, 430], area: 'loading' },
]

/**
 * ⟲ RECONSTRUCTED. Four workstations — two on the spine, two on the south aisle.
 *
 * The pair on the south aisle matter more than they look: the cart stage picks
 * up and drops off in `production` only, so with two workstations exactly ONE
 * cart job could be in flight at a time and the tug would be structurally idle.
 * They also give the floor a second place to be, instead of every stop hanging
 * off the centre spine.
 */
const workStations: Station[] = [
  { id: 'ws-1', kind: 'work', label: 'Workstation P1', address: 'P1', x: 320, y: 390, access: [320, 430], area: 'production' },
  { id: 'ws-2', kind: 'work', label: 'Workstation P2', address: 'P2', x: 698, y: 390, access: [698, 430], area: 'production' },
  { id: 'ws-3', kind: 'work', label: 'Workstation P3', address: 'P3', x: 110, y: 730, access: [63, 675], area: 'production' },
  { id: 'ws-4', kind: 'work', label: 'Workstation P4', address: 'P4', x: 620, y: 730, access: [573, 675], area: 'production' },
]

/**
 * ⟲ RECONSTRUCTED. Three stalls for five units.
 *
 * Charging is meant to be a contended resource — that is what makes the queue,
 * the reservation and the hand-off to the next unit real behaviour rather than
 * decoration. All three sit NORTH of the spine (y 390); the south spur is the
 * waiting-bay rank, and a stall sharing a spur side with a bay draws two
 * machines inside one another.
 */
const chargerStations: Station[] = [
  { id: 'ch-1', kind: 'charger', label: 'Charger C-1', x: 190, y: 390, access: [190, 430] },
  { id: 'ch-2', kind: 'charger', label: 'Charger C-2', x: 450, y: 390, access: [450, 430] },
  { id: 'ch-3', kind: 'charger', label: 'Charger C-3', x: 948, y: 390, access: [948, 430] },
]

/**
 * ⟲ RECONSTRUCTED. Six waiting bays for five units, one rank on the south spur.
 *
 * A bay is an EXCLUSIVE resource a unit owns for its whole run — `FleetSim`
 * never takes a unit's own bay off it — so the roster needs at least one each.
 * The spare is what lets `parkingFor` send a standing-down unit to the nearest
 * free bay instead of marching every one back to its own corner.
 *
 * Spacing is 125–260 plan units (2.6–5.4 m), comfortably past the 1.39 m the
 * forklift is drawn at, so any chassis may park in any of them.
 */
const HOLD_XS = [190, 450, 698, 823, 948]

const holdStations: Station[] = [
  ...HOLD_XS.map((x, i) => ({
    id: `hd-${String(i + 1).padStart(2, '0')}`,
    kind: 'hold' as const,
    label: `Waiting bay W${i + 1}`,
    x,
    y: 470,
    access: [x, 430] as [number, number],
  })),
  /**
   * ⚠️ THE SPARE IS OFF-AXIS AND HAS TO BE. The obvious home is (573, 470) — the
   * gap in the rank — and that is a point ON the middle cross-over, which runs
   * x 573 from y 230 to y 675. `buildNavGraph` would class it a spur because its
   * access point differs from its position, and a unit on a spur is deliberately
   * invisible to following distance, so every route through the building's
   * middle link would drive through the parked machine. `assertConnected` checks
   * this class of mistake (`navGraph.ts` → `laneStops`).
   */
  {
    id: 'hd-06',
    kind: 'hold' as const,
    label: 'Waiting bay W6',
    x: 620,
    y: 390,
    access: [573, 430] as [number, number],
  },
]

export const stations: Station[] = [
  ...rackStations,
  ...dockStations,
  ...workStations,
  ...chargerStations,
  ...holdStations,
]

// ─── 4 · The chassis ──────────────────────────────────────────────────────────

/** ✔ VERIFIED shape — `fleetSim`, `stores/fleet.ts` and the panels read these. */
export interface RobotType {
  id: RobotTypeId
  /** Shown as "Type A" plus this name. */
  name: string
  /** One line an operator can act on — what this chassis is for. */
  role: string
  /**
   * The ONE stage this chassis serves. Not a list: a unit that can be handed any
   * job is a unit that ends up anywhere, which is the behaviour this model
   * exists to remove. A second capability is a second chassis.
   */
  duty: TaskKind
  /** The loop this chassis repeats, in one line, for the roster panel. */
  scenario: string
  /** Rated top speed on a clear aisle. The unit is part of the contract. */
  topSpeedMps: number
  /** Comfortable acceleration and braking, m/s². Drives how it looks moving. */
  accelMps2: number
  /** Rated payload. Never inferred — a dispatcher decides against this number. */
  payloadKg: number
  /** How big the machine actually is. The only size contract. */
  sizeM: RobotSize
  /**
   * The GLB this type renders as.
   *
   * ⚠️ NULL MEANS NO MODEL YET, and nothing is substituted for it: a chassis
   * that is not this chassis, on an operations map, is worse than an absent one.
   * The unit still drives and still renders — as an explicitly schematic marker.
   *
   * ⚠️ FILENAMES CONTAIN SPACES and are fetched as URLs, so they must arrive
   * percent-encoded. A raw space 404s and the chassis silently degrades to its
   * marker, which looks like a styling choice rather than a broken path.
   */
  modelUrl: string | null
  /**
   * Radians added to this type's heading in 3D, when the model's long axis is
   * not the one the scene drives along. The scene's forward at heading 0 is
   * local −Z, so a model authored along X needs a quarter turn. WHICH quarter
   * turn cannot be read off a bounding box — getting it wrong shows as a robot
   * driving backwards, not sideways.
   */
  yawOffset: number
}

/**
 * ⟲ RECONSTRUCTED figures; ✔ VERIFIED model URLs (the three files exist in
 * `public/models/` and `scripts/measure-models.mjs` reports on them).
 *
 * ⚠️ ALL THREE SIZES ARE ~13 % SMALLER than the fleet that was here before, at
 * the request that the robots "fit better between the warehouse aisles". Applied
 * uniformly, so the ratios between the chassis are unchanged. The forklift's
 * 1.80 m is the bottom of the counterbalance class rather than outside it, so
 * the fleet is still a real size. See `LIMITING` for what this does to every
 * derived clearance.
 */
export const robotTypes: Record<RobotTypeId, RobotType> = {
  A: {
    id: 'A',
    name: 'AGV cart tug',
    role: 'Tows carts between production workstations',
    duty: 'cart',
    scenario: 'Collects a finished cart at a workstation and tugs it to the next station or out to a bay.',
    topSpeedMps: 1.1,
    accelMps2: 0.5,
    payloadKg: 600,
    // Between the AMR and the forklift, as a cart tug should be: it gets under a
    // cart so it stays low, but it is longer than a tote mover.
    sizeM: { lengthM: 1.22, widthM: 0.78, heightM: 0.7 },
    modelUrl: '/models/industrial%20robot%20controller%203d%20model.glb',
    // Authored with its long axis on X, so it needs a quarter turn.
    yawOffset: Math.PI / 2,
  },
  B: {
    id: 'B',
    name: 'Amazon-style AMR',
    role: 'Moves containers between the loading apron, the workstations and storage',
    duty: 'container',
    scenario: 'Takes a container off the loading apron and carries it to a workstation or into storage, anywhere in the building.',
    topSpeedMps: 1.4,
    accelMps2: 0.6,
    payloadKg: 300,
    sizeM: { lengthM: 0.78, widthM: 0.78, heightM: 0.39 },
    modelUrl: '/models/amazon%20model.glb',
    yawOffset: 0,
  },
  C: {
    id: 'C',
    name: 'Autonomous forklift',
    role: 'Pallet handling between the left and centre storage aisles and the loading apron',
    duty: 'pallet',
    scenario: 'Lifts a pallet off a rack face, runs it down the main aisle to the loading apron, then goes back for the next one.',
    topSpeedMps: 1.0,
    accelMps2: 0.4,
    payloadKg: 1500,
    // The limiting chassis. Everything in `fleetGeometry` derives from what this
    // is DRAWN at once the scene fits it by height — see `LIMITING`.
    sizeM: { lengthM: 1.75, widthM: 0.88, heightM: 1.8 },
    modelUrl: '/models/robot%201.glb',
    yawOffset: Math.PI / 2,
  },
}

/**
 * ⟲ RECONSTRUCTED. The house livery every GLB is repainted into.
 *
 * The models were authored separately and arrive with unrelated looks; left
 * alone they read as robots from five companies parked in one building. Values
 * are THEME TOKEN NAMES, not hexes — the viewer resolves them live, so the fleet
 * re-paints with the app's theme.
 *
 * `accent` here is the per-CHASSIS fallback. Per-UNIT accents live on
 * `FleetRobotDef.livery` and take precedence; with only five robots on the floor
 * that is what actually tells them apart.
 */
export const robotLivery = {
  /**
   * The hull. The one colour every chassis in the family is painted.
   *
   * A token, never a hex — the viewer resolves it live, so the fleet re-paints
   * with the theme. Defined in `vuetify.ts` beside every other colour in the
   * app rather than as a literal only the 3D layer can see.
   */
  body: 'fleet-body',
  /**
   * Wheels, mast, undercarriage — anything reading as dark on the original.
   *
   * Near-black rather than the UI's hairline grey: this is rubber and shadowed
   * structure on a physical machine, and `outline-variant` is a border colour
   * that came out looking like unpainted plastic against the hull.
   */
  trim: 'fleet-trim',
  /**
   * The accent, per chassis, plus the ASRS cranes.
   *
   * ⚠️ ONE COLOUR FOR THE WHOLE FLEET, AND IT IS THE BRAND PRIMARY. Chassis type
   * used to be a colour — AGV blue, AMR mint, forklift violet — and it is now a
   * SHAPE only: the three models are already unmistakably different machines, so
   * the hue was spending the brand's most recognisable asset on a distinction the
   * silhouette already makes. `primary` is the token `brand.ts` records as the
   * product's primary; nothing here is a hex, so a rebrand repaints the fleet.
   *
   * `ASRS` is a key here without being a `RobotTypeId`: the cranes are built
   * from primitives in `warehouse/asrsLayer.ts` rather than loaded as a chassis,
   * but they are the same manufacturer's plant and carry the same paint.
   */
  accent: {
    A: 'primary',
    B: 'primary',
    C: 'primary',
    ASRS: 'primary',
  } as Record<string, string>,
  /**
   * The hull finish: matte painted metal.
   *
   * ⚠️ ROUGH ENOUGH TO STAY MATTE UNDER THE SCENE'S REFLECTION PROBE. The
   * building's racking is metal and needs an environment map to render at all
   * (see `addEnvironment`), and the fleet is lit by the same probe — a hull much
   * below 0.5 picks it up as a gloss coat and reads as wet plastic rather than
   * as paint.
   */
  roughness: 0.62,
  metalness: 0.12,
  /**
   * The colour a machine's own EDGES glow — the Fresnel silhouette rim in
   * `warehouse/robotLivery.ts`, and nothing else.
   *
   * ⚠️ IT LIGHTS THE MODEL, NEVER THE FLOOR AROUND IT. No aura, no shell, no
   * disc under the chassis, no projected light. One of those was built and
   * removed: seen from the angle this view is actually watched from, a soft
   * glow around a robot reads as a CIRCLE ON THE GROUND, which on an operations
   * display is the vocabulary of a selection ring or a safety radius — and this
   * floor draws real ones of those (`trafficLayer.ts`). A decorative ring here
   * is not redundant, it is a false reading.
   *
   * ⚠️ ONE COLOUR FOR THE WHOLE FLEET, AND IT IS NOT AN IDENTITY CHANNEL. The
   * per-unit accents (`UnitLivery.accent`) already spend the primary family on
   * telling machines apart; if the rim took each unit's own tone it would become
   * a second, louder copy of that channel. The rim says "this is one of our
   * machines, and it is running" — the same sentence about every unit — and the
   * indicator strip, the deck marking and the call-sign keep saying which one.
   *
   * ⚠️ AND IT IS NEVER A STATE. Every robot's edges light the same amount
   * whatever it is doing. The moment the rim brightens for a fault or a
   * selection it becomes status conveyed by colour and intensity alone, which
   * the domain rules forbid — those already have a word, an icon and a reserved
   * status token.
   *
   * `primary-bright` rather than `primary`: the rim is read at grazing angles
   * against a near-black hall, and the deeper blue simply sinks into the
   * background at the fringe where the edge should still be legible.
   */
  glow: 'primary-bright',
} as const

// ─── 5 · The units ────────────────────────────────────────────────────────────

/**
 * ⟲ RECONSTRUCTED. One unit's own identity.
 *
 * On a sixteen-unit floor a chassis-level accent was enough: three colours said
 * what KIND of machine you were looking at and the code said which one. On a
 * five-unit floor that is the wrong trade — two forklifts painted identically
 * are two machines an operator must read a label to tell apart, and the label is
 * the first thing that stops being legible at wall-display distance.
 *
 * Each unit therefore gets its own accent, its own hull marking and its own
 * name. All three are redundant on purpose: colour alone fails a colourblind
 * operator and fails in bad light (a binding domain rule), and a marking alone
 * is hard to see on a machine facing away.
 */
export interface UnitLivery {
  /**
   * Theme token NAME for this unit's accent. Never a hex.
   *
   * ⚠️ MUST BE DISTINGUISHABLE FROM EVERY OTHER UNIT'S, not merely different.
   * Five is about the most this palette supports while staying apart at a
   * glance; a sixth would need a colour that reads as one of these five.
   *
   * ⚠️ AND IT IS NOW DRAWN FROM THE PRIMARY FAMILY ONLY. Every machine is
   * painted one fleet colour (`robotLivery.body`), so this stopped being the
   * machine's dominant colour and became its DETAIL — the LED indicator strip,
   * the identity badge and the 2D heading arrow. Keeping the five apart is
   * not decoration: CLAUDE.md's domain rules forbid conveying state by colour
   * alone precisely because a wall display is glanced at, and the same argument
   * says an operator must be able to tell WHICH forklift they are looking at
   * without reading a label. Two of these machines share a chassis and a GLB.
   * Within one hue family the five are closer than they were, which is why the
   * marking and the call-sign below carry more of the load than they used to.
   */
  accent: string
  /**
   * The shape painted on the hull — a second channel that survives greyscale.
   *
   * `stripe` a band along the long axis · `chevron` a forward arrow ·
   * `dot` a roof spot · `band` a full-width belt · `cross` an X on the deck.
   */
  markings: 'stripe' | 'chevron' | 'dot' | 'band' | 'cross'
  /**
   * A short call-sign a floor team would actually use over a radio.
   *
   * ⚠️ NOT A REPLACEMENT FOR `code`. "FLT-01" is the identifier every panel,
   * event and accessible label uses; this is shown BESIDE it, never instead.
   */
  name: string
}

/**
 * ⟲ RECONSTRUCTED. The round a dock-service unit works when nothing is
 * dispatched to it, and the reason the loading bays stop being scenery.
 *
 * ⚠️ A BEAT NAMES STOPS, NOT A ROUTE. The road between them is planned by
 * `navGraph` like any other drive, so a beat cannot put a unit somewhere the
 * network forbids. Nothing is reserved in advance either: each stop is taken
 * through the ordinary station reservation as the unit sets off, and skipped
 * when it is busy — which is what stops a patrolling unit squatting on a bay the
 * flow needs.
 *
 * ⚠️ AND IT IS NEVER A REASON TO REFUSE WORK. A unit on patrol is dispatchable
 * on every frame of it; the beat is what it does INSTEAD of standing still.
 */
export interface DockServiceBeat {
  /** The bays this unit services, worked in this order. */
  dockStationIds: string[]
  /**
   * Where it stands between beats.
   *
   * ⚠️ ITS OWN WAITING BAY MUST BE FIRST — that is the one stop the beat can
   * always fall back to, because a unit never loses its own bay.
   */
  waitStationIds: string[]
}

/** ✔ VERIFIED shape — `fleetSim` constructs a `Unit` from every field. */
export interface FleetRobotDef {
  /** Stable id — what the map, the panel and the 3D layer key off. */
  id: string
  /** Fleet code painted on the chassis. */
  code: string
  typeId: RobotTypeId
  /** The waiting bay this unit parks in when it has nothing to do. */
  homeStationId: string
  /** Charge at spawn, percent. Spread so the hall looks mid-shift at open. */
  startBatteryPct: number
  /**
   * This unit services the loading bays and never parks up between jobs.
   *
   * ⚠️ A POSTING, NOT A CAPABILITY. It changes nothing about what work the unit
   * may be handed — same queue, same duty, same dispatch. It changes what the
   * unit does when it has NO work.
   */
  dockService?: DockServiceBeat
  /** This unit's own paint. Without it the unit takes its chassis's accent. */
  livery?: UnitLivery
}

/**
 * ⟲ RECONSTRUCTED. Five units, and all five always working.
 *
 * ⚠️ THE ROSTER *IS* THE FLEET SIZE. There is no congestion governor and no
 * standby pool: every unit here is dispatchable on every frame, so adding a
 * sixth entry puts a sixth machine on the floor for good.
 *
 * ⚠️ THE MIX IS NOT FREE. Each chassis serves exactly ONE stage of the flow, and
 * the flow is pallet → container → cart → store. Drop the single AGV and no cart
 * job can ever run; drop a forklift and the pallet stage starves both stages
 * downstream. Two-two-one follows the work: the pallet and container stages draw
 * on six rack faces and five bays between them, the cart stage shuttles four
 * workstations.
 *
 * ⚠️ ALL FIVE ARE HOMED IN RANK 1, spaced ≥125 plan units (2.6 m) apart, which
 * is comfortably past the 1.39 m the forklift is drawn at. Spreading them along
 * the spine is what makes an idle floor look organised rather than parked in one
 * corner.
 */
export const fleetRobots: FleetRobotDef[] = [
  {
    id: 'flt-01',
    code: 'FLT-01',
    typeId: 'C',
    homeStationId: 'hd-01',
    startBatteryPct: 88,
    // The five rim tones are all primary-family, ordered brightest to deepest so
    // no two neighbours in the roster sit next to each other on the ramp.
    livery: { accent: 'primary-bright', markings: 'stripe', name: 'Hoist' },
  },
  {
    id: 'flt-02',
    code: 'FLT-02',
    typeId: 'C',
    homeStationId: 'hd-02',
    startBatteryPct: 47,
    livery: { accent: 'primary-violet', markings: 'chevron', name: 'Derrick' },
  },
  {
    id: 'agv-01',
    code: 'AGV-01',
    typeId: 'A',
    homeStationId: 'hd-03',
    startBatteryPct: 63,
    livery: { accent: 'primary-accent', markings: 'dot', name: 'Tug' },
  },
  {
    id: 'amr-01',
    code: 'AMR-01',
    typeId: 'B',
    homeStationId: 'hd-04',
    startBatteryPct: 92,
    livery: { accent: 'primary-medium', markings: 'band', name: 'Scout' },
    // Centre-south beat: the cross-dock staging bay and the south-aisle bay.
    dockService: { dockStationIds: ['dk-c1', 'dk-s1'], waitStationIds: ['hd-04'] },
  },
  {
    id: 'amr-02',
    code: 'AMR-02',
    typeId: 'B',
    homeStationId: 'hd-05',
    startBatteryPct: 34,
    livery: { accent: 'primary-deep', markings: 'cross', name: 'Runner' },
    // East-north beat: the east bay and the receiving bay the extended north
    // aisle now reaches.
    dockService: { dockStationIds: ['dk-e1', 'dk-n1'], waitStationIds: ['hd-05'] },
  },
]

// ─── 6 · Simulation parameters ────────────────────────────────────────────────

/**
 * ⟲ RECONSTRUCTED. Knobs on a MODEL, not readings — nothing here is measured
 * and none of it should ever be rendered as telemetry.
 *
 * ⚠️ THESE ARE WORKING VALUES, NOT THE ORIGINALS. The previous file's numbers
 * had been tuned against soak runs whose findings are not recoverable. Each is
 * plausible and the soak passes on them, but treat any one of them as open to
 * re-tuning rather than as a settled result.
 */
export const fleetSimParams = {
  /** Seeded so a run is reproducible; change it for a different-looking shift. */
  seed: 20260731,

  // ── Battery ────────────────────────────────────────────────────────────────
  drainMovingLadenPctPerSec: 0.052,
  drainMovingEmptyPctPerSec: 0.034,
  /**
   * Standing draw. Deliberately tiny — a parked AMR runs its radio and little
   * else. It also has to be small enough that a unit waiting for a stall can
   * outlast the queue: nothing recovers a unit that reaches zero.
   */
  drainStoppedPctPerSec: 0.0012,
  chargePctPerSec: 0.42,
  /** Below this a unit takes no new task and heads for a charger. */
  reserveChargePct: 28,
  /**
   * Below this it actively requests a stall.
   *
   * ⚠️ NOT THE SAME AS `reserveChargePct`. At the reserve level a unit stops
   * ACCEPTING work; at this one it asks for power. The gap is what lets it
   * finish the delivery in its hands rather than abandoning a pallet in an aisle
   * the moment the battery reads low.
   */
  chargeRequestPct: 20,
  /** Below this it abandons what it is doing and charges immediately. */
  criticalChargePct: 9,
  chargeToPct: 88,
  /** Charged enough to be dispatchable again while it keeps charging. */
  chargeAvailablePct: 90,
  chargeFullPct: 100,
  /** Seconds aligning on the stall before current flows. Long enough to see. */
  dockSeconds: 2.5,
  /**
   * How far apart individual units' appetite for power runs, as a multiplier.
   *
   * ⚠️ WITHOUT THIS THE FLEET FLATTENS TOGETHER — identical drain rates mean
   * every unit crosses the request threshold within seconds of the others, all
   * queue at once, and the floor empties.
   */
  drainScaleRange: [0.75, 1.35] as [number, number],

  // ── Handling ───────────────────────────────────────────────────────────────
  /** Seconds stationary loading at a pick face or bay. */
  loadSeconds: 6,
  /** Seconds stationary unloading. Bays are slower than racking. */
  unloadSeconds: 8,
  /**
   * Seconds a dock unit stands on a bay it has run in to service.
   *
   * Longer than `loadSeconds` on purpose: handling across a dock face is the
   * slowest transfer in the building and the one most likely to be watched, so
   * it has to read as a stop rather than a stutter.
   */
  dockServiceSeconds: 9,
  /**
   * How long a dock unit stands on a waiting position before the next leg.
   *
   * ⚠️ A PAUSE, NOT A REFUSAL. The unit is dispatchable throughout;
   * `idleDwellSecondsRange` is the only thing that holds work off.
   */
  dockPatrolWaitSecondsRange: [8, 16] as [number, number],
  /**
   * How long a beat leg may spend trying to reach a bay before giving up.
   *
   * ⚠️ A REAL DELIVERY HAS NO SUCH DEADLINE AND MUST NOT BE GIVEN ONE. A job's
   * stop is committed — cargo depends on it — while a round's stop is
   * discretionary, so the round gives way when the aisles are against it.
   * Without this a leg that never lands holds a loading bay indefinitely.
   */
  dockLegTimeoutSeconds: 60,
  /**
   * How long a unit stands in its bay before it will take another job.
   *
   * ⚠️ THIS PAUSE IS THE POINT. Without it a unit arrives home and is dispatched
   * again in the same frame, so it never appears to stop — the floor reads as
   * robots in permanent motion, which is both untrue of a real site and
   * impossible to follow.
   */
  idleDwellSecondsRange: [2, 5] as [number, number],
  /**
   * How long a handed-on job waits at the exact station its predecessor left the
   * cargo on before taking any free station in its pickup areas.
   *
   * The pin makes cooperation real — the AMR collects the pallet the forklift
   * actually set down — but a pinned station can be held by a unit that has
   * broken down, and a job that waits for ever is a stream that silently stops.
   * A preference with a deadline, not a contract.
   */
  chainPatienceSeconds: 25,

  // ── Traffic escalation ─────────────────────────────────────────────────────
  /** Blocked this long, a unit reroutes around whatever is in its way. */
  rerouteAfterSeconds: 6,
  /**
   * Still blocked this long, it declares itself stalled and raises an alert.
   * Comfortably longer than a pick plus a couple of units queued ahead of it —
   * a queue behind a busy face is normal traffic, and calling it a fault would
   * train operators to ignore the alert.
   */
  stallAfterSeconds: 150,
  /** How long a stalled unit stays in `error` before recovery is attempted. */
  errorRecoverySeconds: 12,
  /**
   * Mean seconds between spontaneous faults, per unit.
   *
   * ⚠️ A MODEL PARAMETER so the `error` state is exercised on screen. It is NOT
   * a reliability figure and must never be presented as one.
   */
  faultMeanSecondsPerRobot: 2400,

  // ── Route diversity ────────────────────────────────────────────────────────
  //
  // Two penalties bias the planner away from roads that are busy or freshly
  // used. Both FORGET: they are rolling pictures of the last minute or so, and a
  // planner reading a permanent record would keep routing around an aisle that
  // cleared ten minutes ago.

  /** Extra plan units a fully congested junction adds to a route's cost. */
  congestionPenaltyUnits: 260,
  /**
   * Extra plan units a freshly-driven node adds.
   *
   * ⚠️ THIS IS WHAT SPREADS THE FLEET ACROSS THE NEW LANES. Shortest-path
   * routing is deterministic, so without it every unit going east takes the same
   * aisle and the parallel route the north lane provides is never used. Sized
   * above `congestionPenaltyUnits` so a recently-used clear lane looks worse than
   * a lightly-queued fresh one.
   */
  trailPenaltyUnits: 340,
  /**
   * Visits at which a node's trail penalty is at full strength.
   *
   * ⚠️ RAISING THE TRAIL PENALTY DOES NOT SPREAD THIS FLOOR — measured, not
   * assumed, so nobody spends another afternoon on it. Pushing the penalty to
   * 560 and saturating it at 2 visits over a 130 s half-life moved the centre
   * spine's share of moving unit-samples from 35.5 % to 36.6 % across three
   * seeds: no better, and slightly worse. The reason is structural and is the
   * one already recorded in CLAUDE.md — the spine carries traffic because almost
   * every station in the hall HANGS OFF IT, so most spine travel is arrival at a
   * destination rather than a route choice between equals. A cost penalty can
   * only bias the through-legs, and with three cross-overs there is usually no
   * second way to bias them onto. See `STATION_SHORTLIST` in `fleetSim.ts` for
   * the lever that does move, and the traffic note in CLAUDE.md for the layout
   * change that would move it properly.
   */
  trailFullVisits: 4,
  /** How fast the trail fades, as a half-life in seconds. */
  trailHalfLifeSeconds: 90,

  // ── Work arriving ──────────────────────────────────────────────────────────
  /**
   * Mean seconds between new cargo tasks arriving across the whole hall.
   *
   * ⚠️ MUST BE SCALED WITH THE ROSTER, and it is the first thing to check after
   * changing the fleet size. Too fast and the backlog pins at its cap, every
   * unit is permanently laden, and because a laden unit is NEVER interrupted an
   * emergency has to wait for one to finish — which inverts the priority system
   * not because the scheduler is wrong but because there is never a free robot
   * for it to choose. 40 s is where five units sit: the queue drains between
   * arrivals, so somebody is usually free when an urgent job lands.
   */
  taskIntervalSeconds: 40,
  /**
   * How fresh work is split across the three mobile stages.
   *
   * The flow feeds itself — a finished pallet job creates a container job — so
   * these weights are only the work ARRIVING at the building. They are still
   * needed: a hall driven purely by the chain would idle every AMR and AGV
   * whenever the forklifts were charging.
   */
  arrivalMix: { pallet: 0.5, container: 0.3, cart: 0.2 } as Record<'pallet' | 'container' | 'cart', number>,
  /**
   * Backlog cap PER STAGE.
   *
   * A single shared cap looks equivalent and is not: one stage backing up then
   * starves the others of new work, and the units that serve them sit idle
   * beside a full queue they are not cleared to touch.
   */
  maxQueuedPerStream: 3,
  /**
   * Hard ceiling on the whole backlog.
   *
   * ⚠️ AN EMERGENCY IS NEVER REFUSED FOR SPACE — it displaces the lowest-ranked,
   * newest job instead. See `FleetSim.enqueue`.
   */
  maxQueuedTasks: 8,

  // ── Priority scheduling ────────────────────────────────────────────────────
  /**
   * How urgent arriving work is.
   *
   * ⚠️ THE INFLOW ONLY. A job handed on by a finished one INHERITS its
   * predecessor's priority rather than rolling again — an emergency pallet that
   * became an ordinary container job halfway through would deliver the urgent
   * half on time and the rest whenever.
   */
  priorityMix: {
    emergency: 0.05,
    high: 0.15,
    normal: 0.60,
    low: 0.20,
  } as Record<TaskPriority, number>,
  /**
   * An emergency may take a unit off a job only if that job is AT MOST this
   * urgent. Ranks come from `taskPriorities`, so this reads "low only".
   *
   * ⚠️ THE CARGO RULE IS SEPARATE AND ABSOLUTE. A unit that has already picked
   * up is never interrupted, whatever this says: the only place it could put the
   * load down is somebody's reserved bay, so the honest outcome would be a
   * pallet abandoned in an aisle.
   */
  interruptibleAtOrBelowRank: 3,
  /**
   * How long a unit reserved for an emergency will wait for its current job to
   * finish before the scheduler re-runs the choice.
   */
  emergencyHandoverPatienceSeconds: 90,
  /**
   * Traffic allowance on rated speed when estimating how soon a busy unit could
   * reach an emergency pickup. Pessimistic on purpose — choosing between units
   * is a prediction over work that has not started.
   */
  emergencyEtaSpeedFactor: 0.55,
  /**
   * Seconds a transient status is held on screen.
   *
   * ⚠️ THESE STATES NEED A TIMER OR THEY ARE INVISIBLE. Being handed a job and
   * starting to drive happen in the same frame, so "Assigned" derived purely
   * from position would flash for 16 ms and never be read on a wall display.
   */
  statusHoldSeconds: 2.5,
  /** How many events the notification feed carries. A feed, not a ledger. */
  eventFeedLength: 40,
}

// ─── 7 · Telemetry ────────────────────────────────────────────────────────────

/** ✔ VERIFIED — the six kinds `stores/fleet.ts` maps to icons. */
export type FleetEventKind =
  | 'emergency-created'
  | 'robot-reassigned'
  | 'task-interrupted'
  | 'task-resumed'
  | 'emergency-completed'
  | 'emergency-unassignable'

/** ✔ VERIFIED shape — emitted by `FleetSim.raise`. */
export interface FleetEvent {
  id: number
  kind: FleetEventKind
  /** Simulated seconds when it happened. */
  at: number
  message: string
  severity: 'critical' | 'warning' | 'info'
  taskId: string | null
  robotId: string | null
}

/** ✔ VERIFIED shape — every field is written by `FleetSim.reportUnit`. */
export interface RobotTelemetry {
  id: string
  code: string
  typeId: RobotTypeId
  state: RobotState
  /** One line of free text. The open half of the status vocabulary. */
  activity: string
  taskId: string | null
  taskKind: TaskKind | null
  taskLabel: string
  destinationLabel: string
  destinationAddress: string | null
  batteryPct: number
  speedMps: number
  /** Plan coordinates. */
  x: number
  y: number
  headingRad: number
  carrying: boolean
  payloadKg: number | null
  /** DERIVED over the remaining route — an estimate, never a measurement. */
  distanceRemainingM: number | null
  etaSeconds: number | null
  alert: string | null
  chargerId: string | null
  chargerLabel: string | null
  queuePosition: number | null
  chargeEtaSeconds: number | null
  chargeProgressPct: number | null
  rangeM: number
  taskPriority: TaskPriority | null
  previousTaskLabel: string | null
  previousTaskState: 'requeued' | 'resuming' | 'taken-by-another' | null
}

/** ✔ VERIFIED shape — written by `FleetSim.reportTask`. */
export interface TaskTelemetry {
  id: string
  kind: TaskKind
  priority: TaskPriority
  cargoId: string
  label: string
  /** ✔ VERIFIED — the six values `TASK_STATUS_LABEL` is keyed by. */
  status: 'queued' | 'assigned' | 'toPickup' | 'carrying' | 'delivering' | 'interrupted'
  assignedRobotId: string | null
  assignedRobotCode: string | null
  pickupLabel: string | null
  deliveryLabel: string | null
  pickupStationId: string | null
  deliveryStationId: string | null
  waitingSeconds: number
  /** Null until a unit commits — there is no queue time for a job still queued. */
  queuedSeconds: number | null
  /** DERIVED over the remaining route. An estimate, and labelled as one. */
  etaSeconds: number | null
  resumingFor: string | null
}

/** ✔ VERIFIED shape — written by `FleetSim.reportChargers`. */
export interface ChargerTelemetry {
  id: string
  label: string
  x: number
  y: number
  headingRad: number
  occupiedBy: string | null
  occupiedByCode: string | null
  batteryPct: number | null
  /**
   * How far through THIS charge the docked unit is, 0–100.
   *
   * ⚠️ DERIVED, not measured — progress toward `chargeFullPct` from where the
   * unit arrived, so it is a percentage of this charge rather than a second copy
   * of `batteryPct`.
   */
  progressPct: number | null
  etaSeconds: number | null
  /** Units holding a place in line for this stall, nearest turn first. */
  queue: string[]
  state: 'free' | 'reserved' | 'charging'
}

/** ✔ VERIFIED shape — written by `FleetSim.reportMetrics`. */
export interface FleetMetrics {
  totalTasks: number
  tasksCompleted: number
  emergencyTasksCompleted: number
  averageDeliverySeconds: number | null
  averageEmergencyResponseSeconds: number | null
  highPriorityCompletionRate: number | null
  robotUtilisation: number
  averageQueueSeconds: number | null
  tasksInterrupted: number
  tasksResumed: number
}

/**
 * ✔ VERIFIED shape — the selected unit's assignment, split into driven and
 * remaining, which the floor plan draws differently so progress reads at a
 * glance rather than as an ETA. Both halves are in plan coordinates.
 */
export interface RobotRoutePath {
  travelled: Array<[number, number]>
  ahead: Array<[number, number]>
}

/** ✔ VERIFIED shape — the whole fleet, one frame. */
export interface FleetTelemetry {
  /** Seconds of simulated time since the run started. */
  elapsedSeconds: number
  robots: RobotTelemetry[]
  chargers: ChargerTelemetry[]
  /**
   * Cargo tasks finished since the run started.
   *
   * ⚠️ TRANSPORT ONLY. A stacker crane cycle is not a delivered load and is not
   * counted here; the cranes report separately via `FleetSim.craneTelemetry`.
   */
  tasksCompleted: number
  tasksActive: number
  tasksQueued: number
  /**
   * Every LIVE job — queued and assigned — in the scheduler's own order.
   *
   * ⚠️ THE ORDER IS THE CONTRACT. This array is emitted exactly as the priority
   * queue holds it, so a panel rendering it top to bottom shows the real dispatch
   * order rather than a re-sort that might disagree with the model.
   */
  tasks: TaskTelemetry[]
  queuedByPriority: Record<TaskPriority, number>
  /** The most recent events, oldest first. Capped — a feed, not a ledger. */
  events: FleetEvent[]
  metrics: FleetMetrics
}
