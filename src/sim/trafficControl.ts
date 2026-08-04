/**
 * src/sim/trafficControl.ts
 *
 * ── THE TRAFFIC CONTROLLER ───────────────────────────────────────────────────
 *
 * One authority over every shared piece of road in the building. `fleetSim.ts`
 * decides where a unit WANTS to go; this decides whether it may, and it is the
 * only thing in the codebase allowed to say yes.
 *
 * It is plain TypeScript with no Vue, no Three and no knowledge of robots beyond
 * an id, a rank and a pair of node names — the same rule `fleetSim.ts` follows,
 * and for the same reason: the whole traffic model has to be runnable headlessly
 * in `scripts/soak-fleet.mjs` rather than only watchable in a browser.
 *
 * ── WHY A LEDGER RATHER THAN A COLLISION TEST ────────────────────────────────
 *
 * There is no physics here and there deliberately never will be. A collision
 * test tells you two machines have ALREADY hit each other, which on a floor is
 * far too late; a reservation tells you one of them may not set off. So the
 * building's road network is carved into two kinds of exclusive resource and a
 * unit may not move onto either without holding it:
 *
 *   SEGMENT       the stretch of aisle between two junctions, named by its two
 *                 endpoints and therefore the SAME resource whichever way you
 *                 drive it. That is what makes head-on conflict impossible: two
 *                 units at opposite ends of one aisle are asking for one key.
 *   INTERSECTION  a junction where three or more segments meet. Exclusive for
 *                 exactly the reason a road junction is: two units crossing at
 *                 once is the one manoeuvre no amount of following distance
 *                 prevents. (Plain two-way nodes are held too — see `requestNode`
 *                 — but only intersections are reported as such.)
 *
 * Both are held in ONE table with one ordering rule, so "who goes first" is a
 * single piece of logic rather than a special case per junction.
 *
 * ── THE ORDERING RULE, AND WHY IT IS EXACTLY THIS ────────────────────────────
 *
 *   1. A HOLDER IS NEVER PRE-EMPTED. Whoever reserved first keeps it until it
 *      releases. Pre-empting a unit that is already rolling into a block means
 *      stopping it inside the block, which is the one place it must not stop.
 *   2. Among WAITERS, the highest right-of-way goes first (`TRAFFIC_PRIORITY`).
 *   3. Equal right-of-way breaks on WHO ASKED FIRST, and ties on id so a replay
 *      of the same seed resolves the same jam the same way. A random tie-break
 *      would make a deadlock that appeared once impossible to look at again.
 *
 * That is the whole of "first reserved wins, otherwise first arrived wins".
 *
 * ── WHAT IT DOES NOT DO ──────────────────────────────────────────────────────
 *
 * It never moves anything. It grants, refuses, explains the refusal, names the
 * cycles it can see and hands back a congestion field — `fleetSim.ts` does the
 * driving, the braking, the yielding and the re-planning. Keeping the ledger
 * free of behaviour is what lets the same ledger drive the 2D overlay, the 3D
 * overlay and the robot panel from one snapshot.
 */

import type { NavGraph } from './navGraph'

// ─── Right of way ─────────────────────────────────────────────────────────────

/**
 * The four levels of right of way, in the order the requirement states them.
 *
 * ⚠️ THIS IS ABOUT THE VEHICLE, NOT THE JOB. A unit running an emergency task
 * outranks a laden one; a laden one outranks a unit driving home empty. What it
 * is CARRYING is the deciding fact, because the cost of stopping it is the cost
 * of the load standing still — which is exactly how a real site arbitrates.
 */
export type TrafficPriority = 'emergency' | 'laden' | 'returning' | 'empty'

export interface TrafficPriorityDef {
  id: TrafficPriority
  /** LOWER SORTS FIRST. The only number the ledger compares. */
  rank: number
  /** What an operator reads. Never abbreviated to a colour. */
  label: string
  /** One line saying what this level means on a floor. */
  meaning: string
  /** The glyph that carries the level when colour cannot. Key from `src/icons/carbon.ts`. */
  icon: string
  /** Theme token for chips and badges. A token NAME, never a hex. */
  tone: string
}

/**
 * ⚠️ THIS TABLE *IS* THE RIGHT-OF-WAY RULE. The controller sorts waiters by
 * `rank` and then by arrival, and does nothing else — so re-ranking the levels
 * is one edit here and no change to any queue, junction or deadlock breaker.
 */
export const TRAFFIC_PRIORITY: Record<TrafficPriority, TrafficPriorityDef> = {
  emergency: {
    id: 'emergency',
    rank: 0,
    label: 'Emergency',
    meaning: 'Running an emergency job, or stranded below the critical charge level',
    icon: 'alertFilled',
    tone: 'error',
  },
  laden: {
    id: 'laden',
    rank: 1,
    label: 'Carrying a load',
    meaning: 'Cargo on the deck — stopping it stops the load with it',
    icon: 'package',
    tone: 'warning',
  },
  returning: {
    id: 'returning',
    rank: 2,
    label: 'Returning',
    meaning: 'Empty and on its way back from a delivery, a charge or a bay',
    icon: 'refresh',
    tone: 'info',
  },
  empty: {
    id: 'empty',
    rank: 3,
    label: 'Empty',
    meaning: 'Empty and not yet committed to a job — yields to everything above',
    icon: 'dotOutline',
    tone: 'outline-medium',
  },
}

/** Ordered highest right-of-way first — the order a legend should list them in. */
export const TRAFFIC_PRIORITY_ORDER: TrafficPriority[] =
  (Object.keys(TRAFFIC_PRIORITY) as TrafficPriority[]).sort(
    (a, b) => TRAFFIC_PRIORITY[a].rank - TRAFFIC_PRIORITY[b].rank,
  )

// ─── What a refusal means ─────────────────────────────────────────────────────

/**
 * Why a unit was refused, in the vocabulary the requirement asks for.
 *
 * This is not decoration: the same refusal is handled very differently
 * depending on which of these it is. A `headOn` cannot be waited out on a
 * single-lane aisle and has to be broken; a `following` clears on its own the
 * moment the unit in front moves; a `blockedDestination` means the ROUTE is
 * wrong rather than the timing. Collapsing them into "blocked" is what makes a
 * traffic model behave the same way in situations that are not the same.
 */
export type ConflictKind =
  /** Nothing in the way. */
  | 'clear'
  /** The block ahead is held by a unit driving INTO this one. */
  | 'headOn'
  /** The junction ahead is held by a unit crossing this one's path. */
  | 'crossing'
  /** Two routes join at the node ahead and the other unit got there first. */
  | 'merging'
  /** The block ahead is held by a unit going the same way — an ordinary queue. */
  | 'following'
  /** The stop this unit is routed to is occupied, so the last leg cannot complete. */
  | 'blockedDestination'
  /** Held by a unit that is itself stopped and waiting — congestion, not a pass. */
  | 'congestion'

export const CONFLICT_LABEL: Record<ConflictKind, string> = {
  clear: 'Clear',
  headOn: 'Head-on conflict',
  crossing: 'Crossing traffic',
  merging: 'Merging traffic',
  following: 'Queued behind another unit',
  blockedDestination: 'Destination occupied',
  congestion: 'Congested aisle',
}

// ─── The ledger's own records ─────────────────────────────────────────────────

interface Hold {
  robotId: string
  /**
   * The node the holder ENTERED from. Undefined for a node reservation.
   *
   * This one field is what makes head-on detection possible at all: the resource
   * key is undirected on purpose, so the direction has to be recorded beside it
   * rather than encoded in it.
   */
  entryNode?: string
  /** Controller clock, seconds, when the hold was granted. */
  since: number
}

interface Waiter {
  robotId: string
  rank: number
  /** When this robot FIRST asked for this resource — not when it last re-asked. */
  since: number
  /**
   * When it last asked. Used only to expire the entry — see `prune`.
   *
   * ⚠️ NOT THE SAME FIELD AS `since`, AND CONFLATING THEM LOSES THE QUEUE. The
   * grant order is by first-asked; the expiry is by last-asked. One field cannot
   * be both, because refreshing it on every retry is exactly what would let a
   * unit that keeps asking overtake one that has been waiting longer.
   */
  lastAsk: number
  entryNode?: string
}

/** The answer to one request. Never throws; a refusal is a normal outcome. */
export interface TrafficGrant {
  granted: boolean
  /** The unit standing in the way, when there is one. Drives deadlock detection. */
  blockedBy: string | null
  conflict: ConflictKind
  /**
   * Place in line, 1-based, counting only units ahead of this one. 0 when
   * granted. This is what turns "waiting" into "third in the queue".
   */
  queuePosition: number
  /** Seconds this robot has been asking for this particular resource. */
  waitedSeconds: number
}

const CLEAR: TrafficGrant = {
  granted: true, blockedBy: null, conflict: 'clear', queuePosition: 0, waitedSeconds: 0,
}

/**
 * How long a waiter may go without re-asking before it is dropped from the line.
 *
 * ⚠️ THIS IS A FEW TICKS, NOT A FEW SECONDS, AND THE DIFFERENCE IS HEAD-OF-LINE
 * BLOCKING. Only the front of the queue may take a free resource — that is what
 * makes right of way mean anything. But a unit stops asking for a block the
 * moment it is refused the NODE beyond it, because the two are checked in
 * sequence and the first failure short-circuits the second. So a unit stuck at
 * one junction sits at the head of the queue for a block it is not asking for
 * and cannot use, and every unit that could have driven through is refused.
 *
 * At a one-second window that is twenty ticks of blockage per event, and it
 * cascades: the sweep measured throughput collapsing from 3.40 tasks/min at four
 * units to 0.40 at five through eight, with 82 % of the fleet waiting and 248
 * deadlock breaks in ten minutes, on a network with twenty-three free blocks.
 * Not congestion — queue bookkeeping.
 *
 * A blocked unit re-asks every tick, so three ticks of silence already means it
 * has stopped wanting the resource. The queue then orders the units that are
 * asking NOW, which is all fairness ever needed it to do.
 */
const WAITER_TTL_SECONDS = 0.15

// ─── Telemetry shapes ─────────────────────────────────────────────────────────

/** How a piece of road is being used right now. */
export type SegmentUse = 'occupied' | 'reserved'

/**
 * One lane block, as the maps draw it.
 *
 * `occupied` and `reserved` are genuinely different and both are asked for by
 * the requirement: OCCUPIED means the holder's body is inside the block, and
 * RESERVED means it holds the block but has not entered it yet. An operator
 * reading a plan needs to tell "that aisle has a robot in it" from "that aisle
 * is spoken for", because only the second one is about to change.
 */
export interface SegmentTelemetry {
  id: string
  from: [number, number]
  to: [number, number]
  use: SegmentUse
  /** Fleet code of the unit holding it. */
  holder: string
  /** Units queued behind it, if any. */
  queued: number
}

/** One junction the controller arbitrates. */
export interface IntersectionTelemetry {
  id: string
  x: number
  y: number
  /** How many segments meet here — 3+ is what makes it an intersection. */
  degree: number
  /** Fleet code of the unit inside it, or null when it is free. */
  holder: string | null
  /** Units waiting their turn. */
  queued: number
  /**
   * Rolling congestion score, 0–1, from how long units have waited here
   * recently. DERIVED over a decaying window — never a measurement, and the
   * planner's only input from this file.
   */
  congestion: number
}

/** Two units closer than they should be. Reported, never silently tolerated. */
export interface ProximityWarning {
  a: string
  b: string
  /** Plan units, centre to centre. */
  gap: number
  /** Plan units. The gap at which these two are touching. */
  safeGap: number
}

/** The whole road network's live state, one frame. */
export interface TrafficTelemetry {
  segments: SegmentTelemetry[]
  intersections: IntersectionTelemetry[]
  /** Units currently refused a resource. */
  waiting: number
  /** Deadlock rings the controller resolved since the run started. */
  deadlocksResolved: number
  /** Pairs currently inside each other's safe distance. Should be zero. */
  proximityWarnings: ProximityWarning[]
}

// ─── The controller ───────────────────────────────────────────────────────────

export interface TrafficControllerOptions {
  graph: NavGraph
  /**
   * Seconds of waiting that scores a junction as fully congested. Used to
   * normalise the congestion field the planner reads.
   */
  congestionFullSeconds?: number
  /** How fast the congestion field forgets, as a half-life in seconds. */
  congestionHalfLifeSeconds?: number
}

export class TrafficController {
  private readonly graph: NavGraph
  private readonly congestionFull: number
  private readonly congestionDecay: number

  /** Junctions where three or more lane segments meet. Computed once. */
  readonly intersections = new Set<string>()

  /** Controller clock, simulated seconds. Advanced by the caller. */
  private now = 0

  /** Resource key → who holds it. Segments and nodes share one table and one rule. */
  private readonly holds = new Map<string, Hold>()
  /** Resource key → who is waiting, in grant order. */
  private readonly queues = new Map<string, Waiter[]>()
  /** Robot id → every resource key it holds. The only way to release safely. */
  private readonly heldBy = new Map<string, Set<string>>()

  /** Node id → decaying wait-seconds. The planner's congestion input. */
  private readonly congestion = new Map<string, number>()

  private resolvedDeadlocks = 0

  constructor (options: TrafficControllerOptions) {
    this.graph = options.graph
    this.congestionFull = options.congestionFullSeconds ?? 30
    this.congestionDecay = Math.LN2 / (options.congestionHalfLifeSeconds ?? 45)

    // An intersection is a node where more than two lane segments meet. Degree
    // is counted over UNDIRECTED neighbours: the aisles are two-way, so a plain
    // stretch of corridor has two outgoing edges to the same two neighbours and
    // must not be mistaken for a junction.
    for (const [id, edges] of this.graph.out) {
      const neighbours = new Set<string>()
      for (const edge of edges) neighbours.add(edge.to)
      for (const edge of this.graph.incoming.get(id) ?? []) neighbours.add(edge.from)
      // Spurs hang off a junction and are exclusive by station reservation
      // already, so they never count toward its degree — otherwise every bay
      // access point would be reported as an intersection it is not.
      let lanes = 0
      for (const other of neighbours) if (!this.graph.spurNodes.has(other)) lanes += 1
      if (lanes >= 3) this.intersections.add(id)
    }
  }

  // ── Keys ──────────────────────────────────────────────────────────────────

  /**
   * A lane block's name, UNDIRECTED.
   *
   * ⚠️ THE UNDIRECTEDNESS IS THE SAFETY PROPERTY, not a tidy-up. Both directions
   * of travel resolve to one key, so a unit driving east and a unit driving west
   * down the same aisle are contending for the same lock and exactly one of them
   * gets it. Make this directional and head-on conflict comes straight back.
   */
  static segmentKey (a: string, b: string): string {
    return a < b ? `seg:${a}|${b}` : `seg:${b}|${a}`
  }

  static nodeKey (id: string): string {
    return `node:${id}`
  }

  /** The two endpoints of a segment key, for drawing. */
  private static segmentEnds (key: string): [string, string] | null {
    if (!key.startsWith('seg:')) return null
    const [a, b] = key.slice(4).split('|')
    return a && b ? [a, b] : null
  }

  // ── Clock ─────────────────────────────────────────────────────────────────

  /**
   * Advance the controller's own clock and let the congestion field forget.
   *
   * Congestion has to decay or it becomes a permanent record of where traffic
   * once was, and the planner would keep routing around an aisle that cleared
   * ten minutes ago. Exponential rather than a window because it needs no
   * history buffer for sixteen units at sixty frames a second.
   */
  tick (dt: number): void {
    if (dt <= 0) return
    this.now += dt

    const keep = Math.exp(-this.congestionDecay * dt)
    for (const [node, value] of this.congestion) {
      const next = value * keep
      if (next < 0.01) this.congestion.delete(node)
      else this.congestion.set(node, next)
    }
  }

  get clock (): number {
    return this.now
  }

  // ── Requests ──────────────────────────────────────────────────────────────

  /**
   * Ask for the lane block between two nodes.
   *
   * Re-asking is free and expected: a blocked unit calls this every frame, and
   * its place in line is kept from the FIRST time it asked rather than reset by
   * each retry. Resetting it would mean a unit that asks more often outranks one
   * that has been waiting longer, which is the opposite of a queue.
   */
  requestSegment (
    robotId: string,
    fromNode: string,
    toNode: string,
    rank: number,
  ): TrafficGrant {
    return this.request(
      robotId,
      TrafficController.segmentKey(fromNode, toNode),
      rank,
      fromNode,
    )
  }

  /**
   * Ask for a junction.
   *
   * Every node is held, not only the ones with three ways out. The invariant the
   * driving model rests on is that a unit on a leg holds that leg's END node,
   * taken before it set off — break it and a unit ends up committed mid-aisle
   * with no reservation, which nothing downstream can resolve. Only intersections
   * are REPORTED as intersections; the rest are held quietly.
   */
  requestNode (robotId: string, nodeId: string, rank: number, fromNode?: string): TrafficGrant {
    return this.request(robotId, TrafficController.nodeKey(nodeId), rank, fromNode)
  }

  /**
   * ⚠️ THERE IS NO `reserveAhead` ANY MORE, and its absence is the design.
   *
   * It walked a route reserving several blocks at once, up to a configurable
   * horizon — and the horizon was pinned at 1 by every caller, because a lane
   * block in this hall averages 0.94 m and the whole network is about two dozen
   * of them. At a horizon of 1 it did exactly what `requestNode` plus
   * `requestSegment` already do, which is how the driving model actually asks:
   * one block, at the moment the unit commits to it. Two ways to reserve the
   * same road is one more than a traffic model can afford to keep honest.
   *
   * To restore multi-block lookahead for a site with long aisles: reinstate it
   * here, keep the partial-success rule (blocks already granted are NOT rolled
   * back — handing them back only to ask again next frame is how a unit loses
   * its place to somebody who arrived later), and call it from `drive` in place
   * of the paired requests.
   */

  /**
   * The one place a resource changes hands.
   *
   * Every branch below is a rule from the requirement, in the order they are
   * checked: already mine → free and my turn → free but not my turn → taken.
   */
  private request (robotId: string, key: string, rank: number, entryNode?: string): TrafficGrant {
    this.prune(key)
    const hold = this.holds.get(key)

    // Already mine. Refresh the direction so a unit that turned round inside a
    // block it holds is not reported as driving the way it came.
    if (hold?.robotId === robotId) {
      if (entryNode !== undefined) hold.entryNode = entryNode
      this.dequeue(key, robotId)
      return CLEAR
    }

    const queue = this.queues.get(key) ?? []
    const mine = queue.find(w => w.robotId === robotId)
    const waitedSeconds = mine ? this.now - mine.since : 0

    if (!hold) {
      // Free — but only the front of the queue may take it, or a unit that has
      // been waiting is overtaken by whoever happens to ask first this frame.
      const front = this.frontOf(queue)
      if (front === undefined || front === robotId) {
        this.grant(key, robotId, entryNode)
        this.dequeue(key, robotId)
        return { ...CLEAR, waitedSeconds }
      }

      this.enqueue(key, robotId, rank, entryNode)
      return {
        granted: false,
        blockedBy: front,
        conflict: 'congestion',
        queuePosition: this.positionOf(key, robotId),
        waitedSeconds,
      }
    }

    // Taken. Join the line and say exactly what kind of conflict this is.
    this.enqueue(key, robotId, rank, entryNode)
    this.chargeCongestion(key)

    return {
      granted: false,
      blockedBy: hold.robotId,
      conflict: this.classify(key, hold, entryNode),
      queuePosition: this.positionOf(key, robotId),
      waitedSeconds,
    }
  }

  /**
   * Name the conflict.
   *
   * A SEGMENT held by somebody who entered it from the OTHER end is a head-on
   * meeting — the one conflict a single-lane aisle cannot resolve by waiting,
   * because neither unit can pass the other however long it stands there. Held
   * from the same end, it is an ordinary queue.
   *
   * A NODE is a crossing when it is an intersection (three or more ways out, so
   * the two units are cutting across each other) and a merge when it is not (two
   * routes joining onto one lane).
   */
  private classify (key: string, hold: Hold, entryNode?: string): ConflictKind {
    if (key.startsWith('seg:')) {
      if (hold.entryNode !== undefined && entryNode !== undefined && hold.entryNode !== entryNode) {
        return 'headOn'
      }
      return 'following'
    }

    const nodeId = key.slice(5)
    return this.intersections.has(nodeId) ? 'crossing' : 'merging'
  }

  // ── Queue bookkeeping ─────────────────────────────────────────────────────

  private grant (key: string, robotId: string, entryNode?: string): void {
    this.holds.set(key, { robotId, entryNode, since: this.now })
    let mine = this.heldBy.get(robotId)
    if (!mine) {
      mine = new Set()
      this.heldBy.set(robotId, mine)
    }
    mine.add(key)
  }

  private enqueue (key: string, robotId: string, rank: number, entryNode?: string): void {
    const queue = this.queues.get(key) ?? []
    const existing = queue.find(w => w.robotId === robotId)
    if (existing) {
      // The RANK may change — a unit that has just picked up a pallet outranks
      // the empty one it was queued behind — but `since` never does. Losing the
      // arrival time is losing the queue.
      existing.rank = rank
      existing.lastAsk = this.now
      if (entryNode !== undefined) existing.entryNode = entryNode
      this.sortQueue(queue)
      this.queues.set(key, queue)
      return
    }

    queue.push({ robotId, rank, since: this.now, lastAsk: this.now, entryNode })
    this.sortQueue(queue)
    this.queues.set(key, queue)
  }

  /**
   * Drop waiters that have stopped asking.
   *
   * ⚠️ WITHOUT THIS, A FREE BLOCK STAYS BLOCKED FOR EVER, and the failure looks
   * nothing like its cause. Only the front of the queue may take a free
   * resource — that is what stops a unit which has just arrived from overtaking
   * one that has been waiting. But a unit stops asking for all sorts of ordinary
   * reasons: it re-planned around the obstruction, it was stood down into the
   * standby pool, it faulted, it reached its stop by another route. Its entry
   * then sits at the head of a queue for a resource it will never ask for again,
   * and every other unit is refused a block that nobody holds.
   *
   * The soak caught it as three active units blocked 89 % of the time on a
   * network with twenty-three free blocks, which reads as gridlock and was
   * actually bookkeeping.
   *
   * A blocked unit re-asks every tick, so a second of silence is decisive — far
   * longer than any real gap and far shorter than anything an operator would see.
   */
  private prune (key: string): void {
    const queue = this.queues.get(key)
    if (!queue) return
    const alive = queue.filter(w => this.now - w.lastAsk <= WAITER_TTL_SECONDS)
    if (alive.length === queue.length) return
    if (alive.length === 0) this.queues.delete(key)
    else this.queues.set(key, alive)
  }

  /** Right of way, then who asked first, then id so a replay is identical. */
  private sortQueue (queue: Waiter[]): void {
    queue.sort((a, b) =>
      a.rank - b.rank
      || a.since - b.since
      || a.robotId.localeCompare(b.robotId))
  }

  private dequeue (key: string, robotId: string): void {
    const queue = this.queues.get(key)
    if (!queue) return
    const at = queue.findIndex(w => w.robotId === robotId)
    if (at >= 0) queue.splice(at, 1)
    if (queue.length === 0) this.queues.delete(key)
  }

  private frontOf (queue: Waiter[]): string | undefined {
    return queue[0]?.robotId
  }

  private positionOf (key: string, robotId: string): number {
    const queue = this.queues.get(key) ?? []
    const at = queue.findIndex(w => w.robotId === robotId)
    return at < 0 ? 0 : at + 1
  }

  /**
   * Score the wait against the junction it happened at.
   *
   * One frame of one unit waiting is worth one frame of congestion; the field
   * decays on its own (see `tick`). Both ends of a segment are charged, because
   * a blocked aisle is a reason to avoid either junction that leads into it.
   */
  private chargeCongestion (key: string): void {
    const ends = TrafficController.segmentEnds(key)
    if (ends) {
      for (const node of ends) {
        this.congestion.set(node, (this.congestion.get(node) ?? 0) + 0.5)
      }
      return
    }
    const nodeId = key.slice(5)
    this.congestion.set(nodeId, (this.congestion.get(nodeId) ?? 0) + 1)
  }

  // ── Releases ──────────────────────────────────────────────────────────────

  /** Hand back one resource, and start whoever is next in line. */
  release (robotId: string, key: string): void {
    const hold = this.holds.get(key)
    if (hold?.robotId === robotId) this.holds.delete(key)
    this.heldBy.get(robotId)?.delete(key)
    this.dequeue(key, robotId)
  }

  releaseSegment (robotId: string, fromNode: string, toNode: string): void {
    this.release(robotId, TrafficController.segmentKey(fromNode, toNode))
  }

  releaseNode (robotId: string, nodeId: string): void {
    this.release(robotId, TrafficController.nodeKey(nodeId))
  }

  // ── Reading the ledger ────────────────────────────────────────────────────

  holderOf (key: string): string | null {
    return this.holds.get(key)?.robotId ?? null
  }

  holdsNode (robotId: string, nodeId: string): boolean {
    return this.holderOf(TrafficController.nodeKey(nodeId)) === robotId
  }

  isIntersection (nodeId: string): boolean {
    return this.intersections.has(nodeId)
  }

  /**
   * Extra cost, in plan units, for routing through each node right now.
   *
   * ⚠️ A BIAS, NEVER A BAN. The congestion field makes a busy aisle look longer
   * so the planner prefers a clear one, but it must stay finite: on a network
   * with three cross-overs there is frequently no second way round, and a
   * forbidden node would turn "the quick way is busy" into "there is no route",
   * which is a worse answer than queueing.
   */
  penalties (weight = 260): Map<string, number> {
    const out = new Map<string, number>()
    for (const [node, score] of this.congestion) {
      out.set(node, Math.min(1, score / this.congestionFull) * weight)
    }
    return out
  }

  /**
   * 0–1, how congested one junction is.
   *
   * Feeds `snapshot`, which is what the overlays draw — the planner reads
   * `penalties` instead, on the raw field rather than on this normalisation.
   */
  congestionAt (nodeId: string): number {
    return Math.min(1, (this.congestion.get(nodeId) ?? 0) / this.congestionFull)
  }

  // ── Deadlock ──────────────────────────────────────────────────────────────

  /**
   * Every ring of units waiting on each other.
   *
   * The wait-for graph is FUNCTIONAL — each blocked unit names exactly one unit
   * it is standing behind — so a cycle is found by walking the chain and
   * watching for a node already on it. That is enough because a unit only ever
   * asks for one resource at a time: the block ahead of it.
   *
   * ⚠️ THE INPUT MUST INCLUDE BODY BLOCKS, not only reservations. Two units nose
   * to nose on a one-vehicle aisle, each standing ON the node the other wants,
   * hold no reservation for it at all — they were refused one before they ever
   * moved. A detector fed only the ledger cannot see that ring, reports the
   * floor healthy and leaves it frozen. `fleetSim.ts` therefore passes its
   * `blockedBy` map, which names whoever refused the claim however it was
   * refused.
   */
  findDeadlocks (waitFor: ReadonlyMap<string, string>): string[][] {
    if (waitFor.size < 2) return []

    const cycles: string[][] = []
    const settled = new Set<string>()

    for (const start of waitFor.keys()) {
      if (settled.has(start)) continue

      const chain: string[] = []
      const onChain = new Map<string, number>()
      let cursor: string | undefined = start

      while (cursor !== undefined && !settled.has(cursor)) {
        const seen = onChain.get(cursor)
        if (seen !== undefined) {
          cycles.push(chain.slice(seen))
          break
        }
        onChain.set(cursor, chain.length)
        chain.push(cursor)
        cursor = waitFor.get(cursor)
      }

      for (const id of chain) settled.add(id)
    }

    return cycles
  }

  /** Counted for the traffic readout — an operator wants to know it is happening. */
  noteDeadlockResolved (): void {
    this.resolvedDeadlocks += 1
  }

  get deadlocksResolved (): number {
    return this.resolvedDeadlocks
  }

  // ── Safety distance ───────────────────────────────────────────────────────

  /**
   * Every pair of units currently inside each other's safe distance.
   *
   * ⚠️ THIS IS A MONITOR, NOT A MECHANISM. Nothing here pushes two machines
   * apart, and nothing should: separation is guaranteed upstream by the block
   * reservation, and if a pair ever appears in this list the reservation scheme
   * has a hole in it. It exists so that hole is REPORTED — on the panel, in the
   * soak, on the maps — rather than being something an operator has to notice by
   * eye on a wall display.
   */
  proximityWarnings (
    bodies: ReadonlyArray<{ id: string; x: number; y: number; safeRadius: number; parked: boolean }>,
  ): ProximityWarning[] {
    const out: ProximityWarning[] = []
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i]!
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j]!
        // Two units parked on their own bays are supposed to be close: the bays
        // are 2.6 m apart and that is the building, not a conflict.
        if (a.parked && b.parked) continue
        const gap = Math.hypot(a.x - b.x, a.y - b.y)
        const safeGap = a.safeRadius + b.safeRadius
        if (gap < safeGap) out.push({ a: a.id, b: b.id, gap, safeGap })
      }
    }
    return out
  }

  // ── Snapshot ──────────────────────────────────────────────────────────────

  /**
   * The whole ledger as the renderers draw it.
   *
   * `codeOf` maps a robot id to the fleet code an operator reads. The controller
   * deliberately does not know one: it works in ids so that a rename of the
   * roster cannot change who has right of way.
   */
  snapshot (
    codeOf: (robotId: string) => string,
    occupied: (robotId: string, key: string) => boolean,
    proximity: ProximityWarning[] = [],
  ): TrafficTelemetry {
    const segments: SegmentTelemetry[] = []
    const intersections: IntersectionTelemetry[] = []

    for (const [key, hold] of this.holds) {
      const ends = TrafficController.segmentEnds(key)
      if (!ends) continue
      const from = this.graph.nodes.get(ends[0])
      const to = this.graph.nodes.get(ends[1])
      if (!from || !to) continue

      segments.push({
        id: key,
        from: [from.x, from.y],
        to: [to.x, to.y],
        use: occupied(hold.robotId, key) ? 'occupied' : 'reserved',
        holder: codeOf(hold.robotId),
        queued: this.queues.get(key)?.length ?? 0,
      })
    }

    for (const id of this.intersections) {
      const node = this.graph.nodes.get(id)
      if (!node) continue
      const hold = this.holds.get(TrafficController.nodeKey(id))
      let degree = 0
      const neighbours = new Set<string>()
      for (const edge of this.graph.out.get(id) ?? []) neighbours.add(edge.to)
      for (const edge of this.graph.incoming.get(id) ?? []) neighbours.add(edge.from)
      for (const other of neighbours) if (!this.graph.spurNodes.has(other)) degree += 1

      intersections.push({
        id,
        x: node.x,
        y: node.y,
        degree,
        holder: hold ? codeOf(hold.robotId) : null,
        queued: this.queues.get(TrafficController.nodeKey(id))?.length ?? 0,
        congestion: this.congestionAt(id),
      })
    }

    let waiting = 0
    const seen = new Set<string>()
    for (const queue of this.queues.values()) {
      for (const w of queue) {
        if (seen.has(w.robotId)) continue
        seen.add(w.robotId)
        waiting += 1
      }
    }

    // Stable order, so a renderer keying off the array index never sees a row
    // swap places between frames.
    segments.sort((a, b) => a.id.localeCompare(b.id))
    intersections.sort((a, b) => a.id.localeCompare(b.id))

    return {
      segments,
      intersections,
      waiting,
      deadlocksResolved: this.resolvedDeadlocks,
      proximityWarnings: proximity,
    }
  }
}
