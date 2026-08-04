/**
 * src/sim/navGraph.ts
 *
 * ── THE WAREHOUSE ROAD NETWORK, COMPILED ─────────────────────────────────────
 *
 * `src/data/fleet.ts` declares the hall's aisles as a handful of corridors and
 * its stops as a list of stations. That is the readable form — the form a human
 * can check against the floor plan. It is not a routable form.
 *
 * This module turns it into one: it splits every corridor at each crossing and
 * at each station it serves, emits a node per split point and a DIRECTED edge
 * per lane segment, then hangs each off-road station off its access point on a
 * two-way spur.
 *
 * WHY DIRECTED EDGES ARE THE WHOLE DESIGN. The corridors are declared one-way in
 * an alternating grid, so this graph physically cannot express a head-on meeting.
 * A router that respects edge direction therefore cannot produce two units
 * driving at each other down the same aisle, and the simulation is left with
 * only crossings and following distance to arbitrate. `assertStronglyConnected`
 * is the safety net on that claim: one wrong direction in the data and some bay
 * silently becomes unreachable, which would show up as robots that never leave
 * their waiting bay rather than as an error. It is cheap, so it runs at build.
 *
 * Nothing here knows about robots, tasks or time — that is `fleetSim.ts`. This
 * file answers exactly two questions: what roads exist, and what is the shortest
 * legal drive from here to there.
 */

import { fleetGeometry, toPlanUnits } from '@/data/fleet'
import type { Corridor, Station } from '@/data/fleet'

export interface NavNode {
  id: string
  x: number
  y: number
  /** Set when this node IS a station stop rather than a plain junction. */
  stationId?: string
}

export interface NavEdge {
  from: string
  to: string
  /** Plan units. Precomputed — the router walks this a great many times. */
  length: number
}

export interface NavGraph {
  nodes: Map<string, NavNode>
  /** Outgoing edges, keyed by source node. */
  out: Map<string, NavEdge[]>
  /** Incoming edges, keyed by target node. Only used to prove connectivity. */
  incoming: Map<string, NavEdge[]>
  /** Station id → the node a robot stops on. */
  stationNodes: Map<string, string>
  /**
   * Station nodes reached by a spur rather than sitting on the road. A unit
   * standing on one of these is out of the traffic lane, which both the driving
   * model and the leg-length check below need to know.
   */
  spurNodes: Set<string>
  /**
   * ⚠️ STATIONS THAT CLAIM TO BE OFF THE LANE AND ARE NOT — the bug this field
   * exists to make visible.
   *
   * A station whose `access` differs from its position is treated as a spur:
   * `FleetSim.isOffRoad` returns true for a unit standing there, so it counts
   * against nobody's following distance and nobody's junction clearance. That is
   * correct for a bay hanging off an aisle, and catastrophic if the station's
   * own coordinates happen to lie ON a corridor — the unit is then parked in a
   * live lane while being invisible to every unit driving down it.
   *
   * It fails silently and far from its cause. `hd-07` sat at (573, 470), a point
   * on the middle cross-over, and the symptom was two forklifts rendered at the
   * same coordinate several minutes later somewhere else in the run.
   */
  laneStops: string[]
}

/** Coordinates in the dataset are whole plan units, so this key is exact. */
export function nodeKey (x: number, y: number): string {
  return `${Math.round(x)}:${Math.round(y)}`
}

const EPS = 0.001
const within = (value: number, from: number, to: number) => value >= from - EPS && value <= to + EPS
const same = (a: number, b: number) => Math.abs(a - b) < EPS

/** A corridor point, expressed as a full coordinate pair. */
function pointOn (corridor: Corridor, along: number): [number, number] {
  return corridor.axis === 'h' ? [along, corridor.at] : [corridor.at, along]
}

/**
 * The position of `point` along `corridor`, or null when it is not on it.
 * "On it" means it shares the fixed coordinate AND falls inside the span.
 */
function alongCorridor (corridor: Corridor, point: readonly [number, number]): number | null {
  const [x, y] = point
  if (corridor.axis === 'h') {
    if (!same(y, corridor.at) || !within(x, corridor.from, corridor.to)) return null
    return x
  }
  if (!same(x, corridor.at) || !within(y, corridor.from, corridor.to)) return null
  return y
}

export function buildNavGraph (corridors: Corridor[], stations: Station[]): NavGraph {
  const nodes = new Map<string, NavNode>()
  const out = new Map<string, NavEdge[]>()
  const incoming = new Map<string, NavEdge[]>()
  const stationNodes = new Map<string, string>()
  const spurNodes = new Set<string>()
  const laneStops: string[] = []

  function addNode (x: number, y: number): NavNode {
    const id = nodeKey(x, y)
    let node = nodes.get(id)
    if (!node) {
      node = { id, x, y }
      nodes.set(id, node)
      out.set(id, [])
      incoming.set(id, [])
    }
    return node
  }

  function addEdge (from: NavNode, to: NavNode) {
    if (from.id === to.id) return
    const length = Math.hypot(to.x - from.x, to.y - from.y)
    const edge: NavEdge = { from: from.id, to: to.id, length }
    // Corridors can be split by the same station twice (an access point shared
    // by a charger and a dock, say), so guard against a duplicate lane segment.
    const list = out.get(from.id)!
    if (list.some(e => e.to === to.id)) return
    list.push(edge)
    incoming.get(to.id)!.push(edge)
  }

  // ── 1 · Split every corridor at its crossings and at the stations it serves ─
  for (const corridor of corridors) {
    const breaks = new Set<number>([corridor.from, corridor.to])

    for (const other of corridors) {
      if (other.axis === corridor.axis) continue
      // They cross when each one's fixed coordinate falls inside the other's span.
      if (!within(other.at, corridor.from, corridor.to)) continue
      if (!within(corridor.at, other.from, other.to)) continue
      breaks.add(other.at)
    }

    for (const station of stations) {
      const atAccess = alongCorridor(corridor, station.access)
      if (atAccess !== null) breaks.add(atAccess)
      // A station that sits ON the road splits the lane at its own position too.
      const atStop = alongCorridor(corridor, [station.x, station.y])
      if (atStop !== null) breaks.add(atStop)
    }

    const ordered = [...breaks].sort((a, b) => a - b)
    for (let i = 0; i < ordered.length - 1; i++) {
      const a = addNode(...pointOn(corridor, ordered[i]!))
      const b = addNode(...pointOn(corridor, ordered[i + 1]!))
      // 'forward' is the increasing coordinate: eastbound on 'h', southbound on 'v'.
      if (corridor.flow !== 'reverse') addEdge(a, b)
      if (corridor.flow !== 'forward') addEdge(b, a)
    }
  }

  // ── 2 · Attach the stations ────────────────────────────────────────────────
  for (const station of stations) {
    const accessId = nodeKey(station.access[0], station.access[1])
    const accessNode = nodes.get(accessId)
    if (!accessNode) {
      throw new Error(
        `Station "${station.id}" is entered from (${station.access.join(', ')}), which is not on any corridor. `
        + 'Its access point has to lie on a declared aisle — see src/data/fleet.ts.',
      )
    }

    // Whether this point already existed matters: every node in the map at this
    // point was created by splitting a CORRIDOR, so an existing one means the
    // station's own position lies on a lane. See `laneStops`.
    const alreadyOnALane = nodes.has(nodeKey(station.x, station.y))

    const stopNode = addNode(station.x, station.y)
    stopNode.stationId = station.id
    stationNodes.set(station.id, stopNode.id)

    // A station on the road needs no spur; one off it gets a two-way stub, which
    // is safe to make two-way precisely because stations are exclusive — only
    // one unit is ever routed onto a given spur.
    if (stopNode.id !== accessNode.id) {
      if (alreadyOnALane) laneStops.push(station.id)
      spurNodes.add(stopNode.id)
      addEdge(accessNode, stopNode)
      addEdge(stopNode, accessNode)
    }
  }

  return { nodes, out, incoming, stationNodes, spurNodes, laneStops }
}

// ─── Routing ──────────────────────────────────────────────────────────────────

export interface RouteOptions {
  /**
   * Nodes to route around. Used when a unit has been blocked long enough that
   * waiting is no longer the right answer — it re-plans as if the obstruction
   * were a closed aisle. Start and goal are exempt, or a unit sitting on a
   * blocked node could never leave it.
   */
  avoid?: ReadonlySet<string>
  /**
   * Extra cost, in plan units, for passing through a node. Lets congestion bias
   * the route without forbidding it outright.
   */
  penalty?: ReadonlyMap<string, number>
}

/**
 * A* over the directed graph. The heuristic is straight-line distance, which is
 * admissible here because every edge is an axis-aligned lane at least as long as
 * the gap it spans — so the route is genuinely the shortest legal drive, not an
 * approximation of one.
 *
 * Returns the node sequence INCLUDING both ends, or null when no legal drive
 * exists (a real answer: with one-way aisles and a closed node, sometimes there
 * isn't one).
 */
export function findRoute (
  graph: NavGraph,
  fromId: string,
  toId: string,
  options: RouteOptions = {},
): NavNode[] | null {
  const goal = graph.nodes.get(toId)
  const start = graph.nodes.get(fromId)
  if (!goal || !start) return null
  if (fromId === toId) return [start]

  const avoid = options.avoid
  const penalty = options.penalty

  const gScore = new Map<string, number>([[fromId, 0]])
  const cameFrom = new Map<string, string>()
  const closed = new Set<string>()

  const heuristic = (node: NavNode) => Math.hypot(goal.x - node.x, goal.y - node.y)

  // The graph is a few hundred nodes and this runs a handful of times a second,
  // so a sorted-array frontier costs less than a heap's bookkeeping.
  const frontier: Array<{ id: string; f: number }> = [{ id: fromId, f: heuristic(start) }]

  while (frontier.length > 0) {
    let bestIndex = 0
    for (let i = 1; i < frontier.length; i++) {
      if (frontier[i]!.f < frontier[bestIndex]!.f) bestIndex = i
    }
    const current = frontier.splice(bestIndex, 1)[0]!
    if (current.id === toId) break
    if (closed.has(current.id)) continue
    closed.add(current.id)

    const currentG = gScore.get(current.id) ?? Infinity
    for (const edge of graph.out.get(current.id) ?? []) {
      if (closed.has(edge.to)) continue
      if (avoid?.has(edge.to) && edge.to !== toId) continue

      const step = edge.length + (penalty?.get(edge.to) ?? 0)
      const tentative = currentG + step
      if (tentative >= (gScore.get(edge.to) ?? Infinity)) continue

      gScore.set(edge.to, tentative)
      cameFrom.set(edge.to, current.id)
      frontier.push({ id: edge.to, f: tentative + heuristic(graph.nodes.get(edge.to)!) })
    }
  }

  if (!gScore.has(toId)) return null

  const route: NavNode[] = []
  let cursor: string | undefined = toId
  while (cursor !== undefined) {
    route.push(graph.nodes.get(cursor)!)
    if (cursor === fromId) break
    cursor = cameFrom.get(cursor)
  }
  return route.reverse()
}

/** Total drive length of a route, in plan units. */
export function routeLength (route: readonly NavNode[]): number {
  let total = 0
  for (let i = 0; i < route.length - 1; i++) {
    total += Math.hypot(route[i + 1]!.x - route[i]!.x, route[i + 1]!.y - route[i]!.y)
  }
  return total
}

// ─── Validation ───────────────────────────────────────────────────────────────

function reachable (from: string, adjacency: Map<string, NavEdge[]>, pick: (e: NavEdge) => string): Set<string> {
  const seen = new Set<string>([from])
  const queue = [from]
  while (queue.length > 0) {
    const id = queue.shift()!
    for (const edge of adjacency.get(id) ?? []) {
      const next = pick(edge)
      if (seen.has(next)) continue
      seen.add(next)
      queue.push(next)
    }
  }
  return seen
}

export interface ConnectivityReport {
  ok: boolean
  nodeCount: number
  edgeCount: number
  /** Nodes no unit could ever drive to. */
  unreachable: string[]
  /** Nodes a unit could drive to but never leave — a one-way dead end. */
  stranding: string[]
  /** Through-lane segments too short for a unit to stop inside. */
  shortLegs: Array<{ from: string; to: string; length: number }>
  /** Stations treated as off-lane whose position is on a lane. See `NavGraph.laneStops`. */
  laneStops: string[]
}

/**
 * The shortest a through-lane segment may be, in plan units.
 *
 * This is the least obvious constraint in the whole system and it has to be
 * checked, not remembered. A unit reserves the node ahead before it sets off and
 * brakes to a halt short of it; if the segment is shorter than that stopping
 * distance the unit ends up straddling a junction it does not own, and two units
 * at neighbouring junctions each fall inside the other's clearance and block each
 * other permanently. The failure surfaces far from its cause — as robots frozen
 * mid-aisle several minutes later — which is exactly why it is worth asserting.
 *
 * Spurs are exempt: a unit on one is at its destination and out of the lane.
 */
export const MIN_THROUGH_LEG = toPlanUnits(fleetGeometry.minLegM)

/**
 * Is every stop reachable from every other stop?
 *
 * A directed graph is strongly connected exactly when some node both reaches and
 * is reached by all the others, so two traversals settle it. This matters more
 * than it looks: a one-way network with a single mis-declared direction stays
 * *plausible* — robots still drive, routes still render — while some corner of
 * the hall quietly stops being serviceable.
 */
export function checkConnectivity (graph: NavGraph): ConnectivityReport {
  const ids = [...graph.nodes.keys()]
  const edgeCount = [...graph.out.values()].reduce((n, list) => n + list.length, 0)

  const shortLegs: ConnectivityReport['shortLegs'] = []
  for (const list of graph.out.values()) {
    for (const edge of list) {
      if (edge.length >= MIN_THROUGH_LEG) continue
      if (graph.spurNodes.has(edge.from) || graph.spurNodes.has(edge.to)) continue
      shortLegs.push({ from: edge.from, to: edge.to, length: Math.round(edge.length) })
    }
  }

  const root = ids[0]
  if (root === undefined) {
    return {
      ok: false,
      nodeCount: 0,
      edgeCount,
      unreachable: [],
      stranding: [],
      shortLegs,
      laneStops: graph.laneStops,
    }
  }

  const forward = reachable(root, graph.out, e => e.to)
  const backward = reachable(root, graph.incoming, e => e.from)

  const unreachable = ids.filter(id => !forward.has(id))
  const stranding = ids.filter(id => !backward.has(id))

  return {
    ok: unreachable.length === 0 && stranding.length === 0 && shortLegs.length === 0
      && graph.laneStops.length === 0,
    nodeCount: ids.length,
    edgeCount,
    unreachable,
    stranding,
    shortLegs,
    laneStops: graph.laneStops,
  }
}

/**
 * Report a broken network loudly, once, at construction — then carry on.
 *
 * This is a data bug the author can fix in seconds and an operator can never
 * diagnose, so it has to be visible to whoever is editing `fleet.ts`. It does
 * NOT throw: a partly-reachable hall still renders, and blanking a floor display
 * over a layout mistake would be the worse failure.
 */
export function assertConnected (graph: NavGraph): ConnectivityReport {
  const report = checkConnectivity(graph)
  if (!report.ok) {
    const detail = [
      report.unreachable.length ? `unreachable: ${report.unreachable.slice(0, 8).join(', ')}` : '',
      report.stranding.length ? `dead ends: ${report.stranding.slice(0, 8).join(', ')}` : '',
      report.shortLegs.length
        ? `lanes under ${MIN_THROUGH_LEG} units: ${report.shortLegs.slice(0, 8).map(l => `${l.from}→${l.to} (${l.length})`).join(', ')}`
        : '',
      report.laneStops.length
        ? `stops standing in a live lane while counted as off it: ${report.laneStops.join(', ')}`
        : '',
    ].filter(Boolean).join(' · ')
    console.error(
      `[fleet] The warehouse road network is not drivable — ${detail}. `
      + 'Check the corridor `flow` directions and station positions in src/data/fleet.ts.',
    )
  }
  return report
}
