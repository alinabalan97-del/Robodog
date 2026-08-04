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
 * ── THE THREE HALVES ─────────────────────────────────────────────────────────
 *
 *   1. FLEET      robot types, the 16 units, and the states/tasks they can hold.
 *   2. NETWORK    the warehouse road network — corridors robots may drive on and
 *                 stations they may stop at. This is the ONLY place layout lives;
 *                 `src/sim/navGraph.ts` compiles it into a routable graph.
 *   3. TELEMETRY  the per-frame shape the simulation emits and the UI renders.
 *                 A real fleet-management backend would produce this same shape.
 *
 * ── COORDINATES ──────────────────────────────────────────────────────────────
 *
 * Everything is in the floor plan's abstract user-space — the same numbers
 * `floorOps.map` uses, so the 2D map, the 3D scene and the router all read one
 * geometry. `PLAN_UNITS_PER_METRE` is the only bridge to physical units, and it
 * exists because speeds and distances have to be reported in metres to be worth
 * anything to an operator.
 */

// ─── Units ────────────────────────────────────────────────────────────────────

/**
 * ── THE ONE SCALE ────────────────────────────────────────────────────────────
 *
 * Plan units per metre, MEASURED off the building rather than declared.
 * `floorOps.map.viewBox` is 1374 × 760 and is fitted to the model's interior —
 * the 17.324 × 31.32 hull less the 4 % clip inset — so
 *
 *     760 plan units ≡ 17.324 × 0.92 m  ⇒  1 m = 47.684 plan units
 *
 * and the other axis gives the same figure, which is the check that the viewBox
 * is the building rather than a crop of it. `scripts/plan-network.mjs` prints it.
 *
 * ⚠️ THIS USED TO BE 10, AND THAT WAS THE ROOT OF A WHOLE CLASS OF BUGS. Two
 * scales were live at once: the simulation moved and braked in plan units tuned
 * against 10/m, while the scene rendered them at 47.7/m. Every consequence
 * looked like a separate problem — robots a third of their proper size, a
 * forklift shorter than a pallet, queueing gaps a quarter of a vehicle length,
 * and reported speeds 4.8× what anything on screen was doing. They were one
 * problem.
 *
 * So there is now exactly one conversion, and everything physical is declared in
 * METRES and converted through it: vehicle sizes, stopping distances, junction
 * clearances, station spacing, lift travel. Nothing in the simulation is tuned
 * in plan units any more — if you find yourself typing a distance without a unit
 * suffix, it belongs in metres and `toPlanUnits`.
 */
export const PLAN_UNITS_PER_METRE = 47.684

export const toMetres = (planUnits: number) => planUnits / PLAN_UNITS_PER_METRE
export const toPlanUnits = (metres: number) => metres * PLAN_UNITS_PER_METRE

// ─── 1 · Fleet ────────────────────────────────────────────────────────────────

/** The three chassis on this site. Each is built for one job, not for all three. */
export type RobotTypeId = 'A' | 'B' | 'C'

/**
 * ── THE FOUR STAGES OF THE HALL'S WORK ───────────────────────────────────────
 *
 * A task kind is a STAGE in one continuous goods flow, not a direction of
 * travel. The hall runs the same four steps over and over, and each chassis owns
 * exactly one of them:
 *
 *   pallet     forklift    rack face  →  loading / packing apron
 *   container  AMR         apron      →  workstation, or back into storage
 *   cart       AGV         workstation → workstation, or out to a bay
 *   store      ASRS lift   high-bay racking, vertically (a fixture, not a drive)
 *
 * WHY STAGES RATHER THAN 'inbound' / 'outbound'. The old pair described what one
 * robot was doing with one pallet and nothing else, so dispatch could only ever
 * hand a unit an unrelated errand — which is what made the floor look like
 * sixteen robots doing sixteen private jobs in the same building. A stage knows
 * what comes NEXT, so finishing one can create the next one AT THE PLACE IT WAS
 * LEFT: the AMR genuinely collects what the forklift genuinely put down. The
 * cooperation on screen is real inside the model, not a coincidence of timing.
 *
 * `store` is here for completeness of the flow; it is served by the fixed ASRS
 * lifts, never by a mobile unit, so it is not in any chassis's `duty`.
 *
 * Moves with no cargo — driving to a charger or back to a waiting bay — are not
 * tasks. They are states, below.
 */
export type TaskKind = 'pallet' | 'container' | 'cart' | 'store'

/**
 * ── HOW URGENT A JOB IS ──────────────────────────────────────────────────────
 *
 * ⚠️ PRIORITY IS ORTHOGONAL TO STAGE, and keeping the two apart is the point.
 * `TaskKind` says WHAT is being moved and therefore WHICH chassis may move it;
 * priority says WHEN, and it changes nothing about who is eligible. An emergency
 * pallet job is still a forklift's job — it just goes to the front of the
 * forklifts' queue and may pull one off a low-priority run to get there.
 *
 *   emergency  a line is down / a delivery is late — overrides everything, may
 *              interrupt a low-priority task that has not yet been picked up
 *   high       ahead of normal, but never interrupts anything
 *   normal     the hall's ordinary flow
 *   low        backfill; the only work an emergency is allowed to displace
 *
 * ⚠️ NOTHING HERE MAY EVER BE SIGNALLED BY COLOUR ALONE (CLAUDE.md → Domain
 * rules). Every priority carries a word AND an icon AND a rank, and the colour
 * only reinforces them. That is why `label`, `icon` and `rank` sit beside `tone`
 * rather than a bare palette living in a renderer.
 */
export type TaskPriority = 'emergency' | 'high' | 'normal' | 'low'

export interface TaskPriorityDef {
  id: TaskPriority
  /**
   * How long a handed-on job waits at the exact station its predecessor left the
   * cargo on before it gives up and takes any free station in its pickup areas.
   *
   * The pin is what makes cooperation real rather than staged — the AMR collects
   * the pallet the forklift actually set down. But a pinned station can be held
   * by a unit that has broken down, and a job that waits forever is a stream
   * that silently stops. So it is a preference with a deadline, not a contract.
   */
  chainPatienceSeconds: 25,

  // ── Route diversity ────────────────────────────────────────────────────────
  //
  // ⚠️ THESE FOUR ARE WHY THE FLEET STOPS DRIVING ONE LINE. Shortest-path over a
  // fixed network is a deterministic function of two endpoints, so sixteen units
  // with similar endpoints produce one route sixteen times — and in this hall
  // that route is the centre spine, because nearly every stop hangs off it. The
  // planner is therefore quoted a COST, not a distance, over two decaying fields
  // (see `FleetSim.routePenalties`).
  //
  // All four are in PLAN UNITS of added cost, against a median lane block of 130
  // plan units and an average duty drive of about 850. They are deliberately of
  // the same order as a block: enough to change which of two similar ways round
  // wins, never enough to send a unit the length of the building to avoid one
  // busy junction.

  /**
   * Cost added at a junction that is fully congested.
   *
   * REACTIVE — it only rises once units are actually being held up there, so on
   * its own it can only ever redistribute traffic after a queue has formed.
   */
  congestionPenaltyUnits: 260,
  /**
   * Cost added at a node the whole fleet has recently driven through.
   *
   * PREDICTIVE, and the half that actually spreads the traffic: it rises when a
   * unit COMMITS to a route rather than when it gets stuck, so the second unit to
   * want the spine is quoted a longer spine before anybody has queued on it.
   * Larger than the congestion penalty on purpose — avoiding a jam is worth more
   * than reacting to one.
   */
  trailPenaltyUnits: 340,
  /**
   * Recent commitments through one node that count as "everybody goes this way".
   *
   * Four, because the working fleet is around seven units: a lane that four of
   * the seven have just chosen is a lane the other three should be quoted a
   * price for. Raising it makes the fleet tolerate more clustering.
   */
  trailFullVisits: 4,
  /**
   * How fast the trail forgets, as a half-life in seconds.
   *
   * Comfortably longer than one drive (about 40 s at the average route length)
   * and far shorter than a shift, so it describes what the fleet is doing now
   * rather than what it did. Too short and it cannot spread anything; too long
   * and units start avoiding aisles that emptied minutes ago.
   */
  trailHalfLifeSeconds: 90,

  // ⚠️ The distances that used to live here — following gap, junction clearance
  // — are GONE, and deliberately. They were plan-unit constants tuned by hand
  // against a scale nothing else agreed with, and every one of them was a
  // fraction of a real vehicle. They are now derived from the limiting chassis
  // in `fleetGeometry` above, in metres, so resizing the forklift respaces the
  // whole network instead of silently invalidating the tuning.

  /** Blocked this long, a unit reroutes around whatever is in its way. */
  rerouteAfterSeconds: 6,
  /**
   * Still blocked this long, it is declared stalled and raises an alert.
   * Comfortably longer than a pick plus a couple of units queued ahead of it —
   * a queue behind a busy face is normal traffic, not a fault, and calling it
   * one would train operators to ignore the alert.
   */
  // ⚠️ RAISED FROM 45 s WITH THE ROSTER, AND IT WAS CAUSING A FAULT CASCADE.
  // A faulted unit keeps its node claim and its lane block for the whole of
  // `errorRecoverySeconds` while doing nothing, so a spurious stall does not
  // just mis-report one robot — it freezes the aisle behind it, which pushes the
  // units queued there past the same threshold, which faults them too. On a
  // five-unit floor a 45 s queue really was a fault. On sixteen units sharing
  // ~23 lane blocks a six-deep queue behind a pick is ordinary traffic, and
  // calling it a stall turned congestion into gridlock: the diagnose showed 12 %
  // of all unit-seconds in `faulted` and one arrival in ten simulated minutes.
  stallAfterSeconds: 150,
  /** How long a stalled unit stays in `error` before recovery is attempted. */
  errorRecoverySeconds: 12,

  /**
   * Mean seconds between spontaneous faults, per unit. A MODEL PARAMETER that
   * exists so the `error` state is exercised on screen; it is not a reliability
   * figure and must never be presented as one.
   */
  faultMeanSecondsPerRobot: 2400,

  /**
   * Mean seconds between new cargo tasks arriving across the whole hall.
   *
   * Set just below what the roster can clear, so the floor runs busy with slack
   * rather than saturated. A hall pinned at capacity has nobody idle, nobody
   * charging and no queue ever clearing, which reads as frantic rather than as
   * working — and it hides the traffic behaviour worth watching.
   *
   * ⚠️ THIS MUST BE SCALED WITH THE ROSTER, AND IT IS THE FIRST THING TO CHECK
   * AFTER CHANGING IT. At 15 s — tuned for sixteen units — a five-unit fleet
   * cannot keep up: the backlog pins at its cap, every unit is permanently
   * laden, and because a laden unit is NEVER interrupted (`canInterrupt`) an
   * emergency has to wait for one to finish. The soak caught that as emergencies
   * averaging 289 s against 184 s for ordinary work — the priority system
   * inverted, not because the scheduler was wrong but because there was never a
   * free robot for it to choose.
   *
   * 40 s is roughly where five units sit: the queue drains between arrivals, so
   * there is usually somebody free when an urgent job lands.
   */
  taskIntervalSeconds: 40,
  /**
   * How fresh work is split across the three mobile stages.
   *
   * The flow feeds itself — a finished pallet job creates a container job, and a
   * finished container job at a workstation creates a cart job — so these
   * weights are only the work ARRIVING at the building, not the work in it. They
   * are still needed: a hall driven purely by the chain would idle every AMR and
   * AGV whenever the forklifts were charging, and one slow stage would stop the
   * whole floor rather than just its own patch.
   */
  arrivalMix: { pallet: 0.5, container: 0.3, cart: 0.2 } as Record<'pallet' | 'container' | 'cart', number>,
  /**
   * Backlog cap PER STAGE — pallets, containers and carts each get their own.
   *
   * A single shared cap looks equivalent and is not: one stage backing up then
   * starves the others of new work, and the units that serve them sit idle
   * beside a full queue they are not cleared to touch. Capping per stage keeps
   * a slow stage from silently switching the rest of the fleet off.
   */
  maxQueuedPerStream: 3,
  /**
   * Hard ceiling on the whole backlog, including re-queued cargo.
   *
   * ⚠️ AN EMERGENCY IS NEVER REFUSED FOR SPACE — it displaces the lowest-ranked,
   * newest job instead. See `FleetSim.enqueue`.
   */
  maxQueuedTasks: 8,

  // ── Priority scheduling ────────────────────────────────────────────────────

  /**
   * How urgent arriving work is.
   *
   * ⚠️ THIS APPLIES TO THE INFLOW ONLY, not to the chain. A job handed on by a
   * finished one INHERITS its predecessor's priority instead of rolling again —
   * an emergency pallet that becomes an ordinary container job halfway through
   * would let the urgent half of a delivery arrive on time and the rest of it
   * arrive whenever, which is not what an operator asked for when they raised it.
   *
   * The weights are a distribution, not a schedule: 5 % of arrivals at a 42 s
   * mean interval is an emergency roughly every fourteen minutes, so the
   * emergency path is exercised on any run long enough to matter — and
   * `FleetSim.raiseEmergency()` exists for when somebody needs one now.
   */
  priorityMix: {
    emergency: 0.05,
    high: 0.15,
    normal: 0.60,
    low: 0.20,
  } as Record<TaskPriority, number>,

  /**
   * An emergency may take a unit off a job only if the job is AT MOST this
   * urgent. Ranks come from `taskPriorities`, so this reads "low only".
   *
   * ⚠️ THE CARGO RULE IS SEPARATE AND ABSOLUTE, and it is not expressed here
   * because it is not a knob: a unit that has already picked up its load is
   * never interrupted, whatever this says. Cancelling a job mid-run means the
   * cargo goes back where it came from — but a unit holding a pallet has nowhere
   * to put it down that is not somebody's reserved bay, so the only honest
   * outcome would be a pallet abandoned in an aisle.
   */
  interruptibleAtOrBelowRank: 3,

  /**
   * How long a unit reserved for an emergency will wait for its current job to
   * finish before the scheduler gives the emergency to somebody else.
   *
   * Without a deadline, picking "the unit that can finish earliest" is a bet on
   * an estimate: if that unit then jams in traffic, the emergency waits behind a
   * prediction that stopped being true. This is the point at which the model
   * stops believing its own ETA and re-runs the choice.
   */
  emergencyHandoverPatienceSeconds: 90,

  /**
   * Traffic allowance applied to rated speed when estimating how soon a busy
   * unit could reach an emergency pickup.
   *
   * ⚠️ 0.55, NOT the 0.72 used for a route already under way. Choosing between
   * units is a prediction over work that has not started, across a congested
   * single-lane network — the same optimism that is fair on a route in progress
   * would systematically pick the unit with the longest queue ahead of it.
   */
  emergencyEtaSpeedFactor: 0.55,

  /**
   * How long a transient status is held on screen, in seconds.
   *
   * ⚠️ THIS IS A DISPLAY DWELL, NOT A DELAY. Being handed a job and starting to
   * drive happen in the same frame, so `assigned`, `taskInterrupted` and
   * `resumingPreviousTask` would each be true for one 16 ms tick and be
   * unreadable on a wall display glanced at from across a hall. The unit drives
   * throughout; only the word it reports is held.
   */
  statusHoldSeconds: 2.5,

  /** How many events the telemetry feed carries. A feed, not a ledger. */
  eventFeedLength: 40,
} as const

/** Pallet mass range for generated tasks, kg. Synthetic, like everything else. */
export const palletMassRangeKg: readonly [number, number] = [180, 1100]
