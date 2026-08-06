/**
 * src/data/warehouseNetwork.ts
 *
 * ── THE ROAD NETWORK, COMPILED FROM THE MEASURED BUILDING ────────────────────
 *
 * `warehouseStructure.ts` says where the building's aisles, racking and clear
 * floor ARE — it is generated from the GLB and contains no opinions. This file
 * turns that into something a robot can drive: corridors with a direction of
 * travel, and stations it may stop at.
 *
 * The split is the point:
 *
 *   warehouseStructure.ts   MEASURED   where the mass and the gaps are
 *   warehouseNetwork.ts     POLICY     which way traffic runs, where stops go
 *   fleet.ts                FLEET      who drives, what they carry, how often
 *
 * Nothing here picks a coordinate. Every position is derived from a measured
 * aisle, a measured cross link or a measured span of solid racking, so when the
 * model changes, re-running the generator moves the network with it.
 *
 * ── ⚠️ ONE PHYSICAL SCALE, AND IT LIVES HERE ─────────────────────────────────
 *
 * Everything in this codebase is metres. `PLAN_UNITS_PER_METRE` is generated —
 * the plan grid is exactly 1/50 m — and every distance below is AUTHORED in
 * metres and converted once, at the point of use.
 *
 * This replaced a genuine defect. The simulation used to be tuned in plan units
 * against a declared 0.1 m per unit while the 3D scene rendered them at 0.021 —
 * a factor of five apart, with no single place that knew both. Following
 * distances sized for a 121 m hall were drawn around robots sized for a 25 m
 * one, so units queued visibly inside each other. Nothing in the numbers said
 * so, because both halves were self-consistent.
 *
 * ⚠️ NEVER write a bare number in plan units. Write metres and call
 * `toPlanUnits`. The assertion below is what keeps the two from drifting again.
 */

import {
  aisles,
  crossLinks,
  openFloor,
  planScale,
  planViewBox,
  rackRuns,
} from './warehouseStructure'
import type { RobotTypeId } from './fleet'

// ─── The scale ────────────────────────────────────────────────────────────────

/**
 * Plan units per metre. GENERATED, not chosen: the plan's box is the building's
 * interior × this figure, so the projection that fits it back onto the model can
 * only produce 1/50 m, and both of the box's axes bind at once.
 */
export const PLAN_UNITS_PER_METRE = planScale.unitsPerMetre

export const toMetres = (planUnits: number) => planUnits / PLAN_UNITS_PER_METRE
export const toPlanUnits = (metres: number) => metres * PLAN_UNITS_PER_METRE

/**
 * The check that the scale is real rather than declared.
 *
 * If the generator's box and its stated scale ever disagree, every distance in
 * the traffic model silently means something other than what it says — which is
 * exactly the failure this file exists to have fixed. Loud at import, because
 * the symptom (robots overlapping, or a hall five times too big) shows up
 * nowhere near the cause.
 */
{
  const impliedMetres = planViewBox.width / PLAN_UNITS_PER_METRE
  if (Math.abs(planScale.metresPerUnit * PLAN_UNITS_PER_METRE - 1) > 1e-9 || impliedMetres < 1) {
    console.error(
      '[warehouse] the plan scale is inconsistent — re-run scripts/extract-plan-structure.mjs.',
      { planScale, planViewBox },
    )
  }
}

// ─── The contract ─────────────────────────────────────────────────────────────

/**
 * Which way traffic runs on a corridor.
 *
 *   forward   increasing coordinate — eastbound on 'h', southbound on 'v'
 *   reverse   decreasing coordinate — westbound on 'h', northbound on 'v'
 *   both      two-way; only used for the short spurs into stations
 *
 * THE NETWORK IS ONE-WAY. Two units physically cannot meet nose to nose, so the
 * simulation never has to arbitrate a head-on conflict and the commonest class
 * of aisle deadlock does not exist. All that is left is crossings and following
 * distance — and this building's aisles are 1.0–1.6 m wide, so one-way is also
 * simply the truth: two of these machines cannot pass in most of them.
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
 * Somewhere a robot can stop.
 *
 *   rack     a pick face beside storage racking — where cargo comes from and goes
 *   dock     a bay in the loading / staging halls at either end of the building
 *   work     a production workstation
 *   charger  a charging stall
 *   hold     a marked waiting bay; a unit with no task parks here
 *
 * EVERY STATION IS AN EXCLUSIVE RESOURCE. Dispatch reserves one before a robot
 * is ever sent to it, so two units are never routed to the same place.
 */
export type StationKind = 'rack' | 'dock' | 'work' | 'charger' | 'hold'

/**
 * Which patch of the hall a station belongs to. Duties are declared over areas
 * rather than over station ids, so adding a face to a run needs no dispatch
 * change.
 *
 * ⚠️ THE BANDS CUT ACROSS THE RACKING, NOT ALONG IT — see `areaOf`.
 */
export type WorkArea = 'west' | 'centre' | 'east' | 'highbay' | 'loading' | 'production'

export interface Station {
  id: string
  kind: StationKind
  label: string
  /** Where the robot physically ends up. */
  x: number
  y: number
  /**
   * The point on a corridor this station is entered from. When it equals
   * (x, y) the station sits ON the road — a robot stopping there occupies the
   * lane, and following traffic queues behind it. When it differs, the station
   * hangs off a short two-way spur and the through lane stays clear.
   */
  access: [number, number]
  /** Racks and workstations — the storage address an operator calls it by. */
  address?: string
  /**
   * Restricts the station to certain chassis. Absent = any type. An EMPTY list
   * means no mobile unit may be sent here at all.
   */
  types?: RobotTypeId[]
  area?: WorkArea
  /** Racks only — which run it belongs to, for reporting and for the demand model. */
  run?: string
  /**
   * Racks only — how busy this location is, relative to its neighbours.
   *
   * ⚠️ NOT UNIFORM, DELIBERATELY. A real warehouse has fast movers at the front
   * and slow stock at the back; every face being picked equally often is the one
   * arrangement that never happens. See `demandTiers`.
   */
  demand?: number
}

// ─── Physical tuning, in metres ───────────────────────────────────────────────

/**
 * ⚠️ THESE ARE THE NUMBERS THAT DECIDE WHETHER THE BUILDING WORKS, and they are
 * a SET — changing one in isolation breaks a relationship the others depend on:
 *
 *   NODE_PITCH   > junction clearance, or two neighbouring stops sit permanently
 *                  inside each other's clearance and the aisle jams
 *   NODE_PITCH   > the longest stopping distance, or a unit cannot pull up
 *                  between two junctions
 *   FACE_PITCH   > the hard following gap, or two units picking at neighbouring
 *                  faces are drawn inside one another
 */
export const spacing = {
  /** Minimum distance between any two stops or junctions on a lane. */
  nodePitchM: 1.2,
  /** Minimum distance between neighbouring pick faces. A pallet bay is ~1.3 m. */
  facePitchM: 1.6,
  /** How far a station on a spur stands off its lane. */
  spurM: 0.9,
  /** Clearance kept between a station and a junction. */
  junctionMarginM: 1.1,
} as const

const NODE_PITCH = toPlanUnits(spacing.nodePitchM)
const FACE_PITCH = toPlanUnits(spacing.facePitchM)
const JUNCTION_MARGIN = toPlanUnits(spacing.junctionMarginM)

// ─── Corridors ────────────────────────────────────────────────────────────────

const lanes = aisles.slice().sort((a, b) => a.py - b.py)

/**
 * Lane direction alternates across the building and the cross links alternate
 * along it — the classic one-way grid. A plain alternation has a dead corner at
 * each end, which is why the OUTERMOST cross link in each pair is forced to
 * oppose its neighbour: that closes the loop at both ends of every aisle instead
 * of leaving a junction that can only be driven away from.
 *
 * `assertConnected` proves the result at construction rather than leaving it to
 * inspection, so if this scheme ever stops working the console says so at boot.
 */
const laneFlow = (index: number): CorridorFlow => (index % 2 === 0 ? 'forward' : 'reverse')

export const corridors: Corridor[] = []

lanes.forEach((lane, laneIndex) => {
  lane.segments.forEach(([from, to], segmentIndex) => {
    corridors.push({
      id: `h${laneIndex}-${segmentIndex}`,
      axis: 'h',
      at: lane.py,
      from,
      to,
      flow: laneFlow(laneIndex),
      label: laneLabel(laneIndex, lane.segments.length > 1 ? segmentIndex + 1 : 0),
    })
  })
})

function laneLabel (index: number, part: number): string {
  const names = ['North aisle', 'Centre aisle, north lane', 'Centre aisle, south lane', 'South aisle']
  const base = names[index] ?? `Aisle ${index + 1}`
  return part ? `${base} (part ${part})` : base
}

crossLinks.forEach((link, pairIndex) => {
  link.xs.forEach((x, i) => {
    corridors.push({
      id: `v${pairIndex}-${i}`,
      axis: 'v',
      at: x,
      from: link.a,
      to: link.b,
      // Alternating, and offset per pair so the alternation does not line up
      // into a column of same-direction links straight down the building.
      flow: (i + pairIndex) % 2 === 0 ? 'forward' : 'reverse',
      label: `Cross aisle ${pairIndex + 1}.${i + 1}`,
    })
  })
})

/** Every junction on a lane, from the cross links that touch it. */
function junctionsOn (py: number): number[] {
  const xs: number[] = []
  for (const link of crossLinks) {
    if (link.a === py || link.b === py) xs.push(...link.xs)
  }
  return [...new Set(xs)].sort((a, b) => a - b)
}

// ─── Where a station may go ───────────────────────────────────────────────────

/**
 * Walk a lane segment and hand back positions that are far enough from every
 * junction, from the segment's ends, and from each other.
 *
 * This is the whole of the "load-bearing geometry" problem the old hand-placed
 * layout kept tripping over: a stop dropped near a junction splits the lane into
 * a piece shorter than a unit's stopping distance, and the network stays
 * connected while quietly ceasing to be drivable. Generating the positions from
 * the measured junctions removes the chance to get it wrong.
 */
function slotsOn (py: number, pitch: number, filter?: (x: number) => boolean): number[] {
  const lane = lanes.find(l => l.py === py)
  if (!lane) return []
  const junctions = junctionsOn(py)
  const out: number[] = []

  for (const [from, to] of lane.segments) {
    const edges = [from, ...junctions.filter(x => x > from && x < to), to]
    for (let i = 0; i + 1 < edges.length; i++) {
      const lo = edges[i]! + JUNCTION_MARGIN
      const hi = edges[i + 1]! - JUNCTION_MARGIN
      if (hi < lo) continue
      const room = hi - lo
      const count = Math.floor(room / pitch) + 1
      for (let k = 0; k < count; k++) {
        const x = count === 1 ? (lo + hi) / 2 : lo + (room * k) / (count - 1)
        if (filter && !filter(x)) continue
        if (out.some(other => Math.abs(other - x) < pitch)) continue
        out.push(x)
      }
    }
  }
  return out.sort((a, b) => a - b)
}

// ─── Rack faces ───────────────────────────────────────────────────────────────

/**
 * Which patch a position belongs to, from where it stands ALONG the building.
 *
 * ⚠️ THE BANDS CUT ACROSS THE RACKING, NOT ALONG IT. The runs go the long way,
 * so slicing by x gives every area a piece of all four of them — both wall runs
 * and both interior runs. Slicing by run instead would make "west" mean one
 * whole wall, and a forklift would spend its shift driving the building's length.
 */
export function areaOf (x: number): WorkArea {
  const third = planViewBox.width / 3
  if (x < third) return 'west'
  if (x < third * 2) return 'centre'
  return 'east'
}

/**
 * ── DEMAND IS NOT UNIFORM ────────────────────────────────────────────────────
 *
 * Real stock does not turn over evenly. A minority of locations are picked
 * constantly, most are picked sometimes, and a tail is barely touched from one
 * week to the next — the ABC classification every warehouse runs on.
 *
 * Dispatch weights its choice of face by this, so the floor develops the traffic
 * pattern a real building has: a busy end, a steady middle, and quiet corners
 * that still get visited.
 *
 * ⚠️ EVERY TIER IS NON-ZERO on purpose. A weight of nought would create dead
 * storage — racking that is drawn, addressed and never once used — which is the
 * thing this whole layout exists to have removed. The slow tier is rare, not
 * absent, so given a long enough shift every face is worked.
 */
export const demandTiers = [
  { name: 'fast', share: 0.2, weight: 6 },
  { name: 'medium', share: 0.45, weight: 2.2 },
  { name: 'slow', share: 0.35, weight: 0.6 },
] as const

/**
 * Assign tiers deterministically but not in blocks.
 *
 * Hashing the address rather than taking the first fifth of the list matters: a
 * contiguous block of fast movers would put all the traffic in one corner, which
 * is the imbalance being modelled away. Interleaving them means every run and
 * every area contains fast, medium and slow faces, so demand varies WITHIN a
 * rack rather than between racks.
 */
function demandFor (address: string): number {
  let hash = 2166136261
  for (let i = 0; i < address.length; i++) {
    hash ^= address.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const roll = ((hash >>> 0) % 1000) / 1000
  let acc = 0
  for (const tier of demandTiers) {
    acc += tier.share
    if (roll < acc) return tier.weight
  }
  return demandTiers[demandTiers.length - 1]!.weight
}

/** Is there solid racking behind this point on this run? */
function solidAt (run: (typeof rackRuns)[number], x: number): boolean {
  return run.solid.some(([a, b]) => x >= a && x <= b)
}

const rackStations: Station[] = []

/**
 * Lane positions already spoken for by a bay, a stall or a workstation.
 *
 * ⚠️ SPUR-CAPABLE POSITIONS ARE THE SCARCE RESOURCE, so they are allocated
 * BEFORE pick faces, not after. Faces can go anywhere a lane runs past solid
 * racking, which is most of the building; a bay can only go where there is clear
 * floor beside the lane to stand in, which is a handful of places. Letting the
 * faces take every slot first left two bays, no workstations and no waiting
 * bays — the faces had eaten the only floor the rest could have used.
 *
 * ⚠️ THAT ORDERING IS ENFORCED BY CALL ORDER, NOT BY A LEDGER. A
 * `reservedSlots` array sat here to hold the claimed positions and was never
 * written to or read from — the block above already runs `standingSpots()` and
 * hands out every bay, stall and workstation before `placeRackFaces()` is
 * called at the foot of this file, where the same rule is stated again and is
 * the one actually in force. An empty ledger beside a working mechanism reads
 * as the mechanism, which is worse than no ledger at all.
 */
function placeRackFaces (): void {
  // A face sits ON its lane: this building's aisles are 1.0–1.6 m wide, so a
  // unit picking really does block the aisle and traffic really does queue
  // behind it. That is not a simplification — there is nowhere to pull aside.

  /**
   * ⚠️ FACES ARE SHARED OUT BY HOW MUCH RACKING EACH RUN HAS, not by taking
   * turns, and the difference decides whether the wall runs look used.
   *
   * The two interior runs have an aisle on each side; the two wall runs have one.
   * Alternating per lane therefore hands the interior runs roughly twice the
   * faces — the wall storage ends up half-served and reads as secondary, which
   * is the exact imbalance this layout exists to remove.
   *
   * So each run gets a target from the metres of solid racking it actually has,
   * and every slot goes to whichever eligible run is furthest BEHIND its target.
   * A long wall run then out-competes a short interior one for the shared lane,
   * and the four runs end up worked in proportion to what they hold.
   */
  const deficit = new Map<string, { served: number; target: number }>()
  for (const run of rackRuns) {
    const metres = run.solid.reduce((sum, [a, b]) => sum + toMetres(b - a), 0)
    deficit.set(run.code, { served: 0, target: metres / spacing.facePitchM })
  }

  const bySharedLane = lanes.map(lane => ({
    lane,
    served: rackRuns.filter(run => run.servedBy.includes(lane.py)),
  }))

  for (const { lane, served } of bySharedLane) {
    if (served.length === 0) continue
    const slots = slotsOn(lane.py, FACE_PITCH, x => served.some(run => solidAt(run, x)))

    for (const x of slots) {
      const candidates = served.filter(run => solidAt(run, x))
      if (candidates.length === 0) continue
      const run = candidates.reduce((best, r) => {
        const d = deficit.get(r.code)!
        const bd = deficit.get(best.code)!
        return d.target - d.served > bd.target - bd.served ? r : best
      })
      deficit.get(run.code)!.served += 1

      const index = rackStations.filter(s => s.run === run.code).length + 1
      const address = `${run.code}${String(index).padStart(2, '0')}`
      rackStations.push({
        id: `rk-${address.toLowerCase()}`,
        kind: 'rack',
        label: `${runLabel(run.code)} ${address}`,
        address,
        x,
        y: lane.py,
        access: [x, lane.py],
        types: undefined,
        area: areaOf(x),
        run: run.code,
        demand: demandFor(address),
      })
    }
  }
}


function runLabel (code: string): string {
  const names: Record<string, string> = {
    A: 'North wall', B: 'North interior', C: 'South interior', D: 'South wall',
  }
  return names[code] ?? `Run ${code}`
}

// ─── The end halls: docks, workstations, chargers and waiting bays ────────────

/**
 * Everything that is not a pick face stands on a SPUR, off the lane, so a unit
 * parked on it never blocks the aisle it was reached from.
 *
 * The two end halls and the wide centre aisle are the only clear floor this
 * building has — both long walls are racking end to end, so there is no apron to
 * back a trailer onto down the sides. `openFloor` is measured, so the bays land
 * where the model really has room.
 */
/**
 * A place a machine can stand: a point of measured clear floor, plus the point
 * on a lane it is entered from.
 *
 * ⚠️ THE OFFSET IS MEASURED, NOT ASSUMED. An earlier version simply stepped a
 * fixed distance off the lane, which put waiting bays inside the racking — the
 * centre aisle has only ~2 m of genuinely clear width and both of its lanes are
 * in it, so there is no room to step aside there at all. Deriving the position
 * from `openFloor` means a bay can only ever land where the building has floor.
 */
interface Spot { x: number; y: number; laneY: number }

/** How close to a lane a station may stand before it fouls the traffic on it. */
const LANE_KEEPOUT = toPlanUnits(0.55)

function standingSpots (): Spot[] {
  const spots: Spot[] = []

  for (const rect of openFloor) {
    const top = rect.y
    const bottom = rect.y + rect.h

    for (const lane of lanes) {
      // The lane has to run along this rectangle to be able to serve it.
      if (lane.py < top - LANE_KEEPOUT * 2 || lane.py > bottom + LANE_KEEPOUT * 2) continue

      // Usable y inside the rectangle: clear of every lane, not just this one.
      let bestY: number | null = null
      let bestClear = 0
      for (let y = top; y <= bottom; y += 5) {
        const clear = Math.min(...lanes.map(l => Math.abs(y - l.py)))
        if (clear < LANE_KEEPOUT) continue
        if (Math.abs(y - lane.py) > toPlanUnits(2.2)) continue
        if (clear > bestClear) { bestClear = clear; bestY = y }
      }
      if (bestY === null) continue

      for (const x of slotsOn(lane.py, NODE_PITCH)) {
        if (x < rect.x || x > rect.x + rect.w) continue
        if (spots.some(s => Math.hypot(s.x - x, s.y - bestY!) < NODE_PITCH)) continue
        spots.push({ x, y: bestY, laneY: lane.py })
      }
    }
  }

  return spots.sort((a, b) => a.x - b.x)
}

const dockStations: Station[] = []
const workStations: Station[] = []
const chargerStations: Station[] = []
const holdStations: Station[] = []

{
  const spots = standingSpots()

  /**
   * ── WHERE EACH KIND OF STOP BELONGS ──────────────────────────────────────
   *
   * The building has one loading end. `openFloor` shows both long walls are
   * racking from end to end — there is no apron down either side to back a
   * trailer onto — and the clear floor is concentrated past the last rack run,
   * so that is the loading and staging hall. It is measured, not decided: the
   * bays go where the model has room for them.
   *
   * Chargers and waiting bays are spread along the whole building instead,
   * because a unit that has to cross the hall to stand down spends its shift
   * commuting, and a rank of six chargers in one corner leaves the other end
   * with none.
   */
  const loadingFrom = spots.length ? spots[Math.floor(spots.length * 0.62)]!.x : 0
  const loadingEnd = spots.filter(s => s.x >= loadingFrom)
  const rest = spots.filter(s => s.x < loadingFrom)

  const take = (pool: Spot[], count: number): Spot[] => {
    if (pool.length === 0) return []
    const picked: Spot[] = []
    for (let i = 0; i < count; i++) {
      const spot = pool[Math.floor((i * pool.length) / count)]
      if (spot && !picked.includes(spot)) picked.push(spot)
    }
    return picked
  }

  const docks = take(loadingEnd, 6)
  for (const spot of docks) {
    const n = dockStations.length + 1
    dockStations.push({
      id: `dk-${n}`, kind: 'dock', label: `Loading bay L${n}`,
      x: spot.x, y: spot.y, access: [spot.x, spot.laneY], area: 'loading',
    })
  }

  const works = take(loadingEnd.filter(s => !docks.includes(s)), 4)
  for (const spot of works) {
    const n = workStations.length + 1
    workStations.push({
      id: `ws-${n}`, kind: 'work', label: `Workstation P${n}`, address: `P${n}`,
      x: spot.x, y: spot.y, access: [spot.x, spot.laneY], area: 'production',
    })
  }

  const spare = [...rest, ...loadingEnd.filter(s => !docks.includes(s) && !works.includes(s))]
    .sort((a, b) => a.x - b.x)

  const chargers = take(spare, 6)
  for (const spot of chargers) {
    const n = chargerStations.length + 1
    chargerStations.push({
      id: `ch-${n}`, kind: 'charger', label: `Charger C-${n}`,
      x: spot.x, y: spot.y, access: [spot.x, spot.laneY],
    })
  }

  // One waiting bay per unit, so the fleet can always stand down without
  // queueing for somewhere to park.
  for (const spot of spare.filter(s => !chargers.includes(s))) {
    if (holdStations.length >= 16) break
    const n = holdStations.length + 1
    holdStations.push({
      id: `hd-${String(n).padStart(2, '0')}`, kind: 'hold', label: `Waiting bay W${n}`,
      x: spot.x, y: spot.y, access: [spot.x, spot.laneY],
    })
  }
}

// ⚠️ ORDER MATTERS: the bays, stalls and workstations claim their (scarce)
// spur-capable slots first, and only then do the pick faces take what is left.
placeRackFaces()

export const stations: Station[] = [
  ...rackStations,
  ...dockStations,
  ...workStations,
  ...chargerStations,
  ...holdStations,
]

/** For the panel and the soak: how the storage divides up. */
export const layoutSummary = {
  metresPerPlanUnit: planScale.metresPerUnit,
  buildingM: {
    length: toMetres(planViewBox.width),
    width: toMetres(planViewBox.height),
  },
  lanes: lanes.length,
  corridors: corridors.length,
  faces: rackStations.length,
  facesByRun: rackRuns.map(r => ({ run: r.code, faces: rackStations.filter(s => s.run === r.code).length })),
  docks: dockStations.length,
  workstations: workStations.length,
  chargers: chargerStations.length,
  holds: holdStations.length,
}
