/**
 * src/sim/asrsSim.ts
 *
 * ── THE STACKER CRANES, AS MACHINES ──────────────────────────────────────────
 *
 * Two rail-guided ASRS cranes, each welded into one storage aisle. This is the
 * whole of their behaviour: what they are doing, where along the rail they are,
 * and where the carriage is on the mast. Plain TypeScript with no Vue and no
 * Three in it, for the same reason `fleetSim.ts` is — so it can be stepped and
 * checked headlessly instead of only watched in a browser.
 *
 * ⚠️ THIS IS BEHAVIOUR, SO IT IS NOT IN A RENDERER. The 3D layer draws whatever
 * this reports and decides nothing; the 2D map draws the same frames. A crane
 * that worked out its own next bay inside `asrsLayer.ts` would be the same
 * mistake the fleet's three-layer split exists to prevent, and the two views
 * would immediately stop agreeing.
 *
 * ── THE TWO AXES, AND WHY THEY ARE SEQUENCED ─────────────────────────────────
 *
 * A stacker crane has exactly two degrees of freedom: the whole machine runs the
 * rail, and the carriage runs the mast. Real ones INDEX FIRST AND HOIST SECOND —
 * driving both at full speed with a load five levels up is what a machine does
 * when nobody has written a safety case for it. So a cycle here is strictly:
 *
 *   1. idle at the P&D deck at the end of the aisle
 *   2. travel  — the machine runs the rail to the bay it has been given
 *   3. hoist   — only once the travel is essentially done, the carriage climbs
 *   4. transfer— forks pull the load out of the bay (or push it in)
 *   5. lower   — the carriage comes back down to transfer height
 *   6. return  — the machine runs back to the P&D deck at the aisle end
 *   7. handover— the load sits on the deck for a mobile unit to collect
 *
 * `crossoverFraction` is the ONLY overlap: the hoist may start when the travel
 * is nearly finished, which takes the mechanical stiffness out of the motion
 * without letting the two axes run as one. Both axes ease in and out of their
 * moves, so a crane accelerates and brakes rather than sliding at a constant
 * rate, which is what makes the mass read.
 *
 * ── ⚠️ WHAT IS NOT WIRED YET ─────────────────────────────────────────────────
 *
 * Dispatch. A real cycle starts because something asked for a container and ends
 * because a mobile unit collected it; here the demand is generated on the
 * crane's own clock and the load is taken off the deck by a timer. That seam is
 * `request()` and `collect()` below, and it is deliberately the whole of the
 * coupling: when the network refactor lands, `fleetSim` calls `request()` when
 * the `store` stage produces work and `collect()` when an AMR reaches the P&D
 * station, and nothing else in this file changes.
 *
 * Until then every crane reports `pending: true` on its telemetry so no surface
 * can present a self-generated cycle as a dispatched one.
 */

import {
  ASRS_PLAN_UNITS_PER_METRE,
  asrsCranes,
  asrsLevels,
  asrsMotion,
  levelHeightM,
} from '@/data/asrs'
import type { AsrsBay, AsrsCraneSpec } from '@/data/asrs'

/**
 * Plan units per metre for the rail axis.
 *
 * The rail is the one axis measured in PLAN units while its speed is quoted in
 * metres — the two have to meet somewhere, and one named constant is a better
 * place than a division scattered through four call sites.
 */
const RAIL_UNITS_PER_METRE = ASRS_PLAN_UNITS_PER_METRE

/**
 * What a crane is doing. `travel` and `hoist` are separate phases rather than
 * one "moving" because the whole point is that they happen in sequence — a
 * single combined phase could not express the rule.
 */
export type AsrsPhase =
  | 'idle'
  | 'travel'
  | 'hoist'
  | 'transfer'
  | 'lower'
  | 'return'
  | 'handover'

/** Which way the cargo is going. Retrieval comes out; put-away goes in. */
export type AsrsDirection = 'retrieve' | 'store'

/** One crane, one frame. The renderers draw exactly this and nothing else. */
export interface AsrsTelemetry {
  id: string
  label: string
  /** Plan coordinates of the machine's centre. `y` is constant — it is on a rail. */
  x: number
  y: number
  /** The rail's limits, so a view can draw the track the machine runs on. */
  railFrom: number
  railTo: number
  /** Where the load is handed over, in plan-x. Always one end of the rail. */
  transferX: number
  phase: AsrsPhase
  direction: AsrsDirection
  /** MEASURED. Carriage height above the floor, in metres. */
  carriageM: number
  /** The level the carriage is AT, 1-based — read off its height, not its target. */
  level: number
  /** The bay being worked, or null between cycles. */
  bayAddress: string | null
  /** The load on the forks, or null when the crane is running empty. */
  cargoId: string | null
  /** True while a load is on the P&D deck waiting to be collected. */
  deckCargoId: string | null
  /** Doing real work — not merely powered up. */
  working: boolean
  /** One line an operator can read. */
  activity: string
  /**
   * ⚠️ TRUE while this crane's work is self-generated rather than dispatched.
   * Every surface that renders a crane has to say so — see the file header.
   */
  pending: boolean
}

/** An axis that eases in and out of a move rather than sliding at one rate. */
interface Axis {
  /** Current position, in the axis's own unit. */
  value: number
  target: number
  velocity: number
}

interface Crane {
  spec: AsrsCraneSpec
  phase: AsrsPhase
  direction: AsrsDirection
  /** Along the rail, in PLAN units. */
  rail: Axis
  /** Up the mast, in METRES. */
  hoist: Axis
  bay: AsrsBay | null
  level: number
  /** The load this cycle is about. Held the whole cycle, so the activity can name it. */
  cargoId: string | null
  /**
   * Whether that load is ON THE FORKS right now.
   *
   * Separate from `cargoId` because the two are not the same fact: a retrieval
   * knows which container it is going for long before it has it, and reporting a
   * crane as laden while it runs out empty would put a box on the carriage in
   * both views that is not there yet.
   */
  laden: boolean
  deckCargoId: string | null
  dwell: number
  /** Where the current rail move started. Only the travel/hoist overlap reads it. */
  travelFrom: number
}

/** Deterministic, seeded — the same warehouse every reload. */
function makeRng (seed: number): () => number {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13; state >>>= 0
    state ^= state >> 17
    state ^= state << 5; state >>>= 0
    return state / 0x100000000
  }
}

/**
 * Step one axis toward its target with a trapezoidal profile.
 *
 * Braking distance is `v² / 2a`, so the axis starts easing off exactly when it
 * has just enough room left to stop on the mark. That is what makes a crane
 * arrive at a bay rather than snapping to it, and it is why `travelAccelMps2`
 * and `hoistAccelMps2` are part of the contract rather than decoration.
 *
 * Returns true once it has arrived and stopped.
 */
function stepAxis (axis: Axis, dt: number, topSpeed: number, accel: number, epsilon: number): boolean {
  const remaining = axis.target - axis.value
  const distance = Math.abs(remaining)

  if (distance <= epsilon && Math.abs(axis.velocity) <= epsilon) {
    axis.value = axis.target
    axis.velocity = 0
    return true
  }

  const direction = Math.sign(remaining) || 1
  const braking = (axis.velocity * axis.velocity) / (2 * accel)
  const wanted = distance <= braking ? 0 : topSpeed

  const speed = Math.abs(axis.velocity)
  const next = speed < wanted
    ? Math.min(wanted, speed + accel * dt)
    : Math.max(0, speed - accel * dt)

  axis.velocity = next * direction
  axis.value += axis.velocity * dt

  // Never overshoot: an axis that sails past its bay and comes back reads as a
  // fault, and a crane that oscillates around a shelf is worse than one that
  // stops a millimetre early.
  if ((axis.target - axis.value) * direction <= 0) {
    axis.value = axis.target
    axis.velocity = 0
    return true
  }
  return false
}

/** How far through a move an axis is, 0…1. Used only for the travel/hoist overlap. */
function progress (axis: Axis, from: number): number {
  const span = Math.abs(axis.target - from)
  if (span < 1e-6) return 1
  return Math.min(1, Math.abs(axis.value - from) / span)
}

export interface AsrsSimOptions {
  seed?: number
  /**
   * Seconds of cycling to run before the first frame, so the hall does not look
   * like it powered on the moment the screen opened — the same reason the fleet
   * warms up.
   */
  warmUpSeconds?: number
}

export class AsrsSim {
  private readonly cranes: Crane[] = []
  private readonly rng: () => number
  /** Cargo waiting for a crane, per crane id. Fed by `request()`. */
  private readonly queues = new Map<string, string[]>()
  /** Dispatched jobs each crane has been given. The tie-break in `request()`. */
  private readonly taken = new Map<string, number>()
  private serial = 7300
  /** Seconds until the model invents demand, per crane. Deleted once dispatched. */
  private readonly selfDemand = new Map<string, number>()

  constructor (options: AsrsSimOptions = {}) {
    this.rng = makeRng(options.seed ?? 20260731)

    for (const spec of asrsCranes) {
      this.cranes.push({
        spec,
        phase: 'idle',
        direction: 'retrieve',
        rail: { value: spec.transferX, target: spec.transferX, velocity: 0 },
        hoist: { value: 0, target: 0, velocity: 0 },
        bay: null,
        level: 1,
        cargoId: null,
        laden: false,
        deckCargoId: null,
        dwell: asrsMotion.idleSeconds,
        travelFrom: spec.transferX,
      })
      this.queues.set(spec.id, [])
      // Staggered, so two cranes never index in lockstep — that reads as a
      // screensaver rather than as two machines being given separate work.
      this.selfDemand.set(spec.id, this.rng() * asrsMotion.idleSeconds * 2)
    }

    const warmUp = options.warmUpSeconds ?? 45
    for (let t = 0; t < warmUp; t += 1 / 20) this.tick(1 / 20)
  }

  /** The rails, for a view that wants to draw the track. Never changes. */
  get specs (): readonly AsrsCraneSpec[] {
    return asrsCranes
  }

  /**
   * Give a crane something to file or fetch. THE dispatch seam.
   *
   * Returns the crane that took it, or null when every queue is full — a real
   * answer, and the caller's cue to hold the cargo where it is rather than to
   * pretend it was filed.
   */
  request (cargoId: string, craneId?: string): string | null {
    const candidates = craneId
      ? this.cranes.filter(c => c.spec.id === craneId)
      // ⚠️ SHORTEST QUEUE, THEN FEWEST JOBS TAKEN — and the second key is not a
      // refinement, it is the whole of the spreading. Both queues sit empty most
      // of the time, so a sort on length alone is all ties, and a stable sort
      // resolves every tie the same way: the first crane took every job the flow
      // ever produced and the second ran self-invented cycles for the whole
      // shift, still flagged `pending` at the end of a 45-minute soak. Counting
      // what each has been given makes the tie alternate.
      : [...this.cranes].sort((a, b) =>
        (this.queues.get(a.spec.id)!.length - this.queues.get(b.spec.id)!.length)
        || ((this.taken.get(a.spec.id) ?? 0) - (this.taken.get(b.spec.id) ?? 0)))

    for (const crane of candidates) {
      const queue = this.queues.get(crane.spec.id)!
      if (queue.length >= 3) continue
      queue.push(cargoId)
      this.taken.set(crane.spec.id, (this.taken.get(crane.spec.id) ?? 0) + 1)
      this.selfDemand.delete(crane.spec.id)
      return crane.spec.id
    }
    return null
  }

  /**
   * Take the load off a crane's P&D deck — what a mobile unit does when it
   * collects. Returns the cargo id, or null when the deck is empty.
   */
  collect (craneId: string): string | null {
    const crane = this.cranes.find(c => c.spec.id === craneId)
    if (!crane?.deckCargoId) return null
    const cargoId = crane.deckCargoId
    crane.deckCargoId = null
    return cargoId
  }

  tick (dt: number): void {
    if (dt <= 0) return
    for (const crane of this.cranes) this.stepCrane(crane, dt)
  }

  telemetry (): AsrsTelemetry[] {
    return this.cranes.map(crane => this.report(crane))
  }

  // ── One crane, one tick ────────────────────────────────────────────────────

  private stepCrane (crane: Crane, dt: number): void {
    const motion = asrsMotion

    switch (crane.phase) {
      case 'idle': {
        crane.dwell -= dt
        if (crane.dwell > 0) return

        const queued = this.queues.get(crane.spec.id)!.shift()
        const cargoId = queued ?? this.inventDemand(crane, dt)
        if (!cargoId) return

        const bay = crane.spec.bays[Math.floor(this.rng() * crane.spec.bays.length)]
        if (!bay) return

        // A queued load arrived on the deck, so it is going IN. Self-generated
        // work alternates, because a hall where nothing ever comes back out of
        // the racking is a hall filling up for ever.
        crane.direction = queued ? 'store' : (this.rng() < 0.5 ? 'retrieve' : 'store')
        // A put-away leaves the deck WITH the load on its forks; a retrieval
        // leaves empty and comes back carrying. The id is held either way, so
        // the activity line can name the load the whole cycle through.
        crane.cargoId = cargoId
        crane.laden = crane.direction === 'store'
        crane.bay = bay
        // Level 1 is the deck the P&D sits at, so a cycle always addresses one
        // above it — a crane that "hoisted" to where it already was would be
        // reporting a move it did not make.
        crane.level = 2 + Math.floor(this.rng() * (asrsLevels.count - 1))

        crane.travelFrom = crane.rail.value
        crane.rail.target = bay.x
        crane.hoist.target = 0
        crane.phase = 'travel'
        return
      }

      case 'travel': {
        const arrived = stepAxis(crane.rail, dt, this.railSpeed(motion.travelMps), this.railSpeed(motion.travelAccelMps2), 0.5)
        // The one permitted overlap, and it is one-directional: the hoist may
        // begin as the travel finishes, never the reverse. Below the crossover
        // the mast is dead still, which is what makes the two axes read as two.
        if (arrived || progress(crane.rail, crane.travelFrom) >= motion.crossoverFraction) {
          crane.hoist.target = levelHeightM(crane.level)
          stepAxis(crane.hoist, dt, motion.hoistMps, motion.hoistAccelMps2, 0.004)
        }
        if (arrived) crane.phase = 'hoist'
        return
      }

      case 'hoist': {
        if (!stepAxis(crane.hoist, dt, motion.hoistMps, motion.hoistAccelMps2, 0.004)) return
        crane.phase = 'transfer'
        crane.dwell = motion.transferSeconds
        return
      }

      case 'transfer': {
        crane.dwell -= dt
        if (crane.dwell > 0) return
        // The forks have moved the load: this is the one moment in the cycle the
        // cargo changes place. A put-away is now empty-handed and a retrieval is
        // now carrying, which is exactly the flag flipping.
        crane.laden = crane.direction === 'retrieve'
        crane.hoist.target = 0
        crane.phase = 'lower'
        return
      }

      case 'lower': {
        if (!stepAxis(crane.hoist, dt, motion.hoistMps, motion.hoistAccelMps2, 0.004)) return
        crane.travelFrom = crane.rail.value
        crane.rail.target = crane.spec.transferX
        crane.phase = 'return'
        return
      }

      case 'return': {
        if (!stepAxis(crane.rail, dt, this.railSpeed(motion.travelMps), this.railSpeed(motion.travelAccelMps2), 0.5)) return
        if (crane.laden && crane.cargoId) {
          crane.deckCargoId = crane.cargoId
          crane.cargoId = null
          crane.laden = false
          crane.phase = 'handover'
          crane.dwell = motion.handoverSeconds
          return
        }
        crane.cargoId = null
        crane.bay = null
        crane.phase = 'idle'
        crane.dwell = motion.idleSeconds
        return
      }

      case 'handover': {
        crane.dwell -= dt
        if (crane.dwell > 0) return
        // Nothing collected it, so the crane keeps it rather than dropping it on
        // the floor. Until dispatch is wired in this is what always happens.
        crane.deckCargoId = null
        crane.bay = null
        crane.phase = 'idle'
        crane.dwell = motion.idleSeconds
      }
    }
  }

  /**
   * Work this crane gave itself, because nothing has dispatched to it yet.
   *
   * ⚠️ EVERY LOAD THIS PRODUCES IS FLAGGED `pending` on the telemetry, so a
   * surface can never show it as a real movement. Delete this method and the
   * `selfDemand` map when `fleetSim` starts calling `request()`.
   */
  private inventDemand (crane: Crane, dt: number): string | null {
    const countdown = this.selfDemand.get(crane.spec.id)
    if (countdown === undefined) return null
    if (countdown > 0) {
      this.selfDemand.set(crane.spec.id, countdown - dt)
      return null
    }
    this.selfDemand.set(crane.spec.id, asrsMotion.idleSeconds + this.rng() * 8)
    return `CN-${++this.serial}`
  }

  /** A speed or acceleration in metres, expressed in the rail axis's plan units. */
  private railSpeed (metres: number): number {
    return metres * RAIL_UNITS_PER_METRE
  }

  private report (crane: Crane): AsrsTelemetry {
    const dispatched = !this.selfDemand.has(crane.spec.id)
    const carriage = crane.hoist.value
    // Read off the CARRIAGE, not off the target: while it is still climbing it is
    // at the level it has reached, and reporting the one it means to reach would
    // be a plan dressed up as a position.
    const level = Math.max(1, Math.min(
      asrsLevels.count,
      Math.round((carriage - asrsLevels.firstM) / asrsLevels.riseM) + 1,
    ))

    const bay = crane.bay?.address ?? null
    const load = crane.cargoId ?? crane.deckCargoId
    let activity = 'Standing by'
    switch (crane.phase) {
      case 'travel': activity = `Indexing to bay ${bay}`; break
      case 'hoist': activity = `Raising the carriage to level ${crane.level}`; break
      case 'transfer': activity = crane.direction === 'store'
        ? `Filing ${load} into ${bay} at level ${crane.level}`
        : `Drawing ${load} from ${bay} at level ${crane.level}`; break
      case 'lower': activity = 'Lowering the carriage to transfer height'; break
      case 'return': activity = crane.laden
        ? `Carrying ${crane.cargoId} to the aisle end`
        : 'Returning to the aisle end'; break
      case 'handover': activity = `${crane.deckCargoId} on the deck — awaiting collection`; break
    }

    return {
      id: crane.spec.id,
      label: crane.spec.label,
      x: crane.rail.value,
      y: crane.spec.railY,
      railFrom: crane.spec.railFrom,
      railTo: crane.spec.railTo,
      transferX: crane.spec.transferX,
      phase: crane.phase,
      direction: crane.direction,
      carriageM: Math.round(carriage * 1000) / 1000,
      level,
      bayAddress: bay,
      // Only what is genuinely ON the forks. A retrieval knows its container id
      // on the way out; it is not carrying it yet.
      cargoId: crane.laden ? crane.cargoId : null,
      deckCargoId: crane.deckCargoId,
      working: crane.phase !== 'idle',
      activity,
      pending: !dispatched,
    }
  }
}
