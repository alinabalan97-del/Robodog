/**
 * src/data/floorSchematic.ts
 *
 * ── THE 2D MAP'S SCHEMATIC VOCABULARY ────────────────────────────────────────
 *
 * The control-panel reading of the hall: storage blocks with addresses, the
 * equipment standing between them, the fixed plant, the lettered aisles, and the
 * marked floor pads a robot stops on. It is what turns a set of measured
 * rectangles into a drawing an operator can name things off.
 *
 * ⚠️ EVERYTHING HERE IS DERIVED, NOTHING IS DRAWN. Every rectangle traces back
 * to `warehouseObjects.ts` — read off the warehouse GLB by
 * `scripts/extract-plan-objects.mjs` — or to the corridors and stations in
 * `fleet.ts`. This module groups, sorts, counts and names that geometry; it
 * never invents a position. That distinction is the whole reason the file
 * exists as a separate layer rather than as a second hand-drawn plan, and
 * CLAUDE.md records what happened the last two times a warehouse was drawn
 * instead of measured: the racking ended up where the building has aisles, and
 * robots were rendered driving through solid mass.
 *
 * So: to move a rack, re-run the extractor. To rename or regroup one, edit here.
 *
 * ⚠️ THE SOURCE IS `warehouseObjects`, NOT `warehouseZones`, AND THE SWAP FIXED A
 * QUARTER OF THE BUILDING. `warehouseZones` comes from the NAVIGATION grid,
 * which keeps only mass between 0.25 m and 1.90 m — the band a ground robot
 * strikes. Drawn from it, the map was missing 22 % of the hall's mass
 * (`scripts/audit-plan-coverage.mjs` measures it): the entire east rack, whose
 * lowest member is above 1.9 m; every pallet standing on the floor, all under
 * 0.25 m; and the top few units of every rack run, clipped by the band. None of
 * that looked wrong — the map was a faithful drawing of a grid that was never a
 * floor plan. `warehouseObjects` rasterises the full height of the interior
 * instead. Routing still uses the nav grid and must keep doing so.
 *
 * ── WHY GROUPING IS THE INTERESTING PART ─────────────────────────────────────
 *
 * The extractor emits mass, not objects. One physical rack run comes out as
 * four or five overlapping rectangles, because that is what a rasteriser sees
 * looking down at a shelf, a beam and the pallets on it. Drawn literally that
 * reads as a dozen unrelated boxes; drawn as ONE container holding a grid of
 * equal positions it reads as a rack with a capacity — which is the thing an
 * operator is actually looking for.
 *
 * The clustering is therefore not cosmetic. `CLUSTER_GAP` is tuned to the
 * building: at 26 plan units (~0.55 m) neighbouring shelves in one run join and
 * the ~1.3 m gaps between runs do not. Raising it to 34 merges the two southern
 * runs into one 771-unit block that the building does not have.
 *
 * ── WHAT IS A STORAGE BLOCK AND WHAT IS EQUIPMENT ────────────────────────────
 *
 * One threshold, on footprint. Above `STORAGE_MIN_AREA` a cluster is a storage
 * run and gets an address; below it, it is a piece of equipment standing on the
 * floor and gets a grid but no name. That split is honest about what is known:
 * the model names nothing, so calling a small cluster "STORAGE-09" would be
 * asserting something no measurement supports, whereas its size and position
 * are measured facts.
 */

import { planScale, planViewBox } from './warehouseStructure'
import { warehouseObjects } from './warehouseObjects'
import type { WarehouseObject } from './warehouseObjects'
import { corridors, stations } from './fleet'
import type { Station, StationKind } from './fleet'

// ── Shared shapes ────────────────────────────────────────────────────────────

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** One storage position, as drawn. Pre-computed — see the note on `cellsFor`. */
export interface SchematicCell {
  x: number
  y: number
  width: number
  height: number
  rx: number
}

/** Where a block's name sits, and which way round it reads. */
export interface BlockLabel {
  x: number
  y: number
  anchor: 'middle' | 'start'
  /** Degrees clockwise. Non-zero for a run that is taller than its name is long. */
  rotate: number
}

/**
 * ⚠️ A BLOCK IS DRAWN AS ITS PARTS, NEVER AS ITS BOUNDING BOX, and this was a
 * real defect rather than a refinement.
 *
 * The measured objects that make up one addressed run are not always a neat
 * strip: the run against the west wall is a 26-unit-deep line of racking with
 * two 60-unit-deep bays bulging off it. Drawing the cluster's bounding box made
 * that whole run 86 units deep — it swallowed the notches between the bays and
 * put solid racking across floor the building leaves open, which is the exact
 * failure mode ("racking drawn where the hall has aisles") that CLAUDE.md
 * records for the two hand-drawn layouts this map replaced. A bounding box is a
 * grouping device, not a shape.
 *
 * So `x/y/w/h` are the cluster's EXTENT — used for the address, the hover target
 * and reading order — while `parts` is what is actually drawn.
 */
export interface Grouped extends Rect {
  id: string
  /** The measured rectangles this group covers. Draw these, not the extent. */
  parts: Rect[]
}

export interface StorageBlock extends Grouped {
  /** The address an operator calls the run by — `STORAGE-01`, and so on. */
  label: string
  /** Pallet positions the run's footprint holds at the building's bay pitch. */
  positions: number
  cells: SchematicCell[]
  labelAt: BlockLabel
}

/** A cluster too small to be a storage run: plant, a stand, a small stack. */
export interface EquipmentBlock extends Grouped {
  cells: SchematicCell[]
}

/** Fixed structure that is not shelving — conveyor, bench, transfer stand. */
export interface PlantBlock extends Grouped {
  /** How tall the mass is, in metres. Drives nothing; shown on hover. */
  heightM: number
}

/** A pallet or stack standing on the open floor — anything under ~0.65 m. */
export type GoodsBlock = Grouped

/** A lettered lane, and the tick its label hangs off. */
export interface AisleMark {
  id: string
  /** `A1`… for the lanes that run the building's length, `B1`… for the crossings. */
  code: string
  /** The corridor's own name, for the accessible description. */
  label: string
  axis: 'h' | 'v'
  x: number
  y: number
}

/** A marked-out floor area a group of stops shares — drawn as a dashed pad. */
export interface StationPad extends Rect {
  id: string
  kind: StationKind
  /** What the pad is for, in the vocabulary the roster already uses. */
  label: string
  /** The stops inside it — drawn as their own marks on top. */
  stops: Array<{ id: string; label: string; x: number; y: number }>
}

// ── Clustering ───────────────────────────────────────────────────────────────

/**
 * How close two measured rectangles must be to belong to the same object.
 *
 * ⚠️ TUNED TO THIS BUILDING, and the window is narrower than it looks. The
 * shelves within one run sit 0–20 units apart and the runs themselves are
 * separated by ~60. 26 is comfortably between the two; 34 is not (it merges the
 * south-centre and south-east runs), and 20 splits the top-right run in three.
 */
const CLUSTER_GAP = 26

/** Footprint above which a cluster is storage rather than equipment, in units². */
const STORAGE_MIN_AREA = 8000

/** Gap between drawn positions, and between the grid and its container. */
const CELL_GAP = 4

/** Below this width a block's name will not fit inside it — it goes alongside. */
const LABEL_MIN_WIDTH = 92

/**
 * ⚠️ ONE PALLET POSITION, AND IT IS THE EXTRACTOR'S OWN CONSTANT — 1.3 m, the
 * figure `extract-plan-structure.mjs` divides a rectangle's width by to emit
 * `bays`. Restating it here rather than summing the `bays` fields is a
 * correctness fix, not a shortcut:
 *
 * The extractor emits OVERLAPPING rectangles for one physical run — a shelf, the
 * beam above it and the pallets on it are three rasterised bands covering the
 * same floor — and each carries its own `bays` count for the same positions.
 * Summing them across a merged cluster therefore counts the run two or three
 * times over. The top-right run came out at 19 positions against the 11 of the
 * identically-sized run beside it, and drew a two-row grid of half-height cells
 * in a rack that is one pallet deep. Dividing the merged FOOTPRINT by the pitch
 * counts each position exactly once.
 *
 * The payoff is visual as well as arithmetic: every position in the building is
 * now drawn at the same physical size, so two cells side by side genuinely mean
 * two pallets — which is the one property a grid has that a set of lines does
 * not, and the reason the map draws cells at all.
 */
const BAY_PITCH = 1.3 * planScale.unitsPerMetre

function boundsOf (parts: readonly Rect[]): Rect {
  const x = Math.min(...parts.map(z => z.x))
  const y = Math.min(...parts.map(z => z.y))
  return {
    x,
    y,
    w: Math.max(...parts.map(z => z.x + z.w)) - x,
    h: Math.max(...parts.map(z => z.y + z.h)) - y,
  }
}

/**
 * Union-find over padded overlap. O(n²) on 35 rectangles, once at module load —
 * the alternative (a spatial index) would be more code than the whole file.
 */
function clusterRects<T extends Rect> (parts: readonly T[], gap: number): T[][] {
  const parent = parts.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))

  const touches = (a: Rect, b: Rect) =>
    a.x - gap < b.x + b.w && b.x - gap < a.x + a.w &&
    a.y - gap < b.y + b.h && b.y - gap < a.y + a.h

  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      if (!touches(parts[i], parts[j])) continue
      const ri = find(i)
      const rj = find(j)
      if (ri !== rj) parent[rj] = ri
    }
  }

  const groups = new Map<number, T[]>()
  parts.forEach((part, i) => {
    const root = find(i)
    const group = groups.get(root)
    if (group) group.push(part)
    else groups.set(root, [part])
  })
  return [...groups.values()]
}

/**
 * A block's storage positions, on a grid at the building's bay pitch.
 *
 * Both counts come from the footprint over `BAY_PITCH`, so a run twice as long
 * holds twice the cells and a run one pallet deep holds exactly one row. Nothing
 * is fitted to make the drawing look tidy — a cell IS a pallet position, at the
 * size a pallet position is.
 *
 * Degrades rather than fails: a cluster too small for even one position at this
 * gap comes back empty and is drawn as a plain filled block. That matters more
 * than it sounds — SVG renders a negative-height rect as nothing at all, with no
 * warning, so an unguarded grid disappears silently rather than looking wrong.
 */
function cellsFor (rect: Rect): SchematicCell[] {
  const fit = (extent: number) => Math.max(1, Math.round(extent / BAY_PITCH))
  let cols = fit(rect.w)
  let rows = fit(rect.h)

  const widthAt = (n: number) => (rect.w - CELL_GAP * (n + 1)) / n
  const heightAt = (n: number) => (rect.h - CELL_GAP * (n + 1)) / n
  while (cols > 1 && widthAt(cols) < 3) cols--
  while (rows > 1 && heightAt(rows) < 3) rows--

  const cellW = widthAt(cols)
  const cellH = heightAt(rows)
  if (!(cellW > 0) || !(cellH > 0)) return []

  const rx = Math.min(3, Math.min(cellW, cellH) * 0.3)
  const cells: SchematicCell[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({
        x: rect.x + CELL_GAP + c * (cellW + CELL_GAP),
        y: rect.y + CELL_GAP + r * (cellH + CELL_GAP),
        width: cellW,
        height: cellH,
        rx,
      })
    }
  }
  return cells
}

/**
 * Where the run's address goes — always INSIDE the run it names.
 *
 * ⚠️ A LABEL PLACED BESIDE ITS BLOCK IS A LABEL ON THE FLOOR. The building has a
 * run standing against the west wall that is 27 units wide, and the first
 * version put its name alongside because it would not fit across. On the plan
 * that read as an address floating in an empty aisle, with nothing to say which
 * of the two things either side of it was `STORAGE-01`.
 *
 * A tall narrow run turns its name a quarter turn instead, which is how the
 * address is painted on a real rack end and keeps the name attached to the mass
 * it belongs to. The test is which way the run RUNS, not how big it is: anything
 * too narrow to read the name across is read down.
 */
function labelFor (rect: Rect): BlockLabel {
  if (rect.w >= LABEL_MIN_WIDTH) {
    return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 + 4, anchor: 'middle', rotate: 0 }
  }
  const x = rect.x + rect.w / 2 + 4
  const y = rect.y + rect.h / 2
  return { x, y, anchor: 'middle', rotate: -90 }
}

// ── The blocks ───────────────────────────────────────────────────────────────

/**
 * Trim a measured rectangle to the wall line.
 *
 * The extractor rasterises on a grid a few units coarser than the plan box, so a
 * block standing hard against a wall can round three or four units through it.
 * That is inside the measurement's own resolution — but the map DRAWS the wall,
 * and mass sticking out of a building reads as a bug in the map rather than as
 * rounding. Clamping is bounded by the grid step and never moves anything that
 * was not already touching a wall.
 */
function clampToPlan (rect: Rect): Rect {
  const x = Math.max(planViewBox.x, rect.x)
  const y = Math.max(planViewBox.y, rect.y)
  return {
    x,
    y,
    w: Math.min(planViewBox.x + planViewBox.width, rect.x + rect.w) - x,
    h: Math.min(planViewBox.y + planViewBox.height, rect.y + rect.h) - y,
  }
}

const of = (kind: WarehouseObject['kind']) => warehouseObjects.filter(o => o.kind === kind)

/**
 * Cluster, clamp, and keep BOTH the extent and the parts. See `Grouped` for why
 * the parts have to survive — a bounding box drawn as a shape fills in floor the
 * building leaves open.
 */
function grouped<T extends Rect> (items: readonly T[], gap: number) {
  return clusterRects(items, gap)
    .map(parts => {
      const kept = parts.map(p => clampToPlan(p)).filter(p => p.w > 0 && p.h > 0)
      return { bounds: boundsOf(kept), parts: kept }
    })
    .filter(g => g.parts.length > 0)
    // Reading order — down the hall, then across it. The addresses follow it, so
    // STORAGE-03 is always east of STORAGE-02 and an operator can find a run
    // from its number alone.
    .sort((a, b) => a.bounds.y - b.bounds.y || a.bounds.x - b.bounds.x)
}

const rackClusters = grouped(of('rack'), CLUSTER_GAP)

/** Total footprint of the parts — NOT of the extent, which over-counts notches. */
const partArea = (parts: readonly Rect[]) => parts.reduce((sum, p) => sum + p.w * p.h, 0)

export const storageBlocks: StorageBlock[] = rackClusters
  .filter(g => partArea(g.parts) >= STORAGE_MIN_AREA)
  .map((g, i) => {
    // One grid per measured part, so a notched run keeps its notch and every
    // position still lands on real racking.
    const cells = g.parts.flatMap(cellsFor)
    return {
      id: `st-${i + 1}`,
      label: `STORAGE-${String(i + 1).padStart(2, '0')}`,
      ...g.bounds,
      parts: g.parts,
      positions: cells.length,
      cells,
      labelAt: labelFor(g.bounds),
    }
  })

export const equipmentBlocks: EquipmentBlock[] = rackClusters
  .filter(g => partArea(g.parts) < STORAGE_MIN_AREA)
  .map((g, i) => ({
    id: `eq-${i + 1}`,
    ...g.bounds,
    parts: g.parts,
    cells: g.parts.flatMap(cellsFor),
  }))

/**
 * Fixed plant — mass standing between knee height and the top of a machine:
 * conveyors, transfer stands, packing benches, the loose equipment in the
 * middle of the hall. Nothing here claims to know which is which, because the
 * model names nothing; they are drawn as one kind of thing and named none.
 *
 * Merged on contact, so a bench and the stand bolted to it come out as one
 * object rather than as two boxes sharing an edge.
 */
export const plantBlocks: PlantBlock[] = grouped(of('plant'), 0)
  .map((g, i) => ({
    id: `pl-${i + 1}`,
    ...g.bounds,
    parts: g.parts,
    heightM: Math.max(...(g.parts as WarehouseObject[]).map(p => p.topCm)) / 100,
  }))

/**
 * Goods on the open floor: pallets and stacks, anything topping out below the
 * height of a loaded pallet.
 *
 * ⚠️ THESE WERE ENTIRELY ABSENT UNTIL THE SOURCE CHANGED, and their absence is
 * the clearest illustration of why. A pallet is about 0.15 m tall — it sits
 * wholly beneath the 0.25 m floor of the navigation band, so the grid the map
 * used to be drawn from could not see a single one. They are also exactly what
 * makes a floor look worked rather than empty.
 */
export const goodsBlocks: GoodsBlock[] = grouped(of('goods'), 0)
  .map((g, i) => ({ id: `gd-${i + 1}`, ...g.bounds, parts: g.parts }))

// ── The lettered aisles ──────────────────────────────────────────────────────

/**
 * ⚠️ THE LETTERS COME OFF `corridors`, NOT OFF THE MEASURED AISLE BAND. Those
 * are two different things and the difference has bitten this project before:
 * `aisles` in `warehouseStructure.ts` is where the floor is clear, and
 * `corridors` in `fleet.ts` is where robots are actually routed. The map draws
 * the corridors, so the map must letter the corridors — labelling a lane that
 * nothing drives down is exactly the quiet disagreement between a view and its
 * data that makes an operator stop trusting the screen.
 *
 * `A` runs the building's length, `B` crosses it. The label sits a little way
 * in from the lane's start so it never lands on the wall or on a junction.
 */
const LABEL_INSET = 0.14

export const aisleMarks: AisleMark[] = (() => {
  let along = 0
  let across = 0
  return corridors.map(corridor => {
    const span = corridor.to - corridor.from
    const at = corridor.from + span * LABEL_INSET
    const horizontal = corridor.axis === 'h'
    return {
      id: corridor.id,
      code: horizontal ? `A${++along}` : `B${++across}`,
      label: corridor.label,
      axis: corridor.axis,
      // Clear of the line itself: above a lane that runs across, right of one
      // that runs down. A label sitting on its own lane is unreadable the
      // moment a robot drives over it.
      x: horizontal ? at : corridor.at + 9,
      y: horizontal ? corridor.at - 8 : at,
    }
  })
})()

// ── Marked floor pads ────────────────────────────────────────────────────────

/**
 * Chargers and waiting bays are drawn as MARKED AREAS rather than as tiles, and
 * that is what they physically are: painted floor an operator is not supposed to
 * walk into and a robot is dispatched to. Everything else on the plan — a rack
 * face, a dock, a workstation — is a point a unit stops AT, and stays a mark.
 *
 * Neighbouring stalls share one pad, because a rank of three bays 125 units
 * apart is one marked area on the floor rather than three. `PAD_GROUP_GAP` is
 * the distance below which two stops are inside the same marking; above it they
 * are separate areas and get separate pads.
 *
 * ⚠️ TIGHT ON PURPOSE — 140 units is just under 3 m. At 200 the waiting rank
 * chained through the off-axis spare bay and swallowed five stops into one
 * marking 11.5 m wide, which is not a painted area, it is most of the hall.
 */
const PAD_GROUP_GAP = 140

/** How far the marking stands off the outermost stop inside it. */
const PAD_MARGIN = 26

const PAD_KINDS: Partial<Record<StationKind, string>> = {
  charger: 'Charging area',
  hold: 'Standby area',
}

function groupStops (group: readonly Station[], gap: number): Station[][] {
  const parent = group.map((_, i) => i)
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])))

  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      if (Math.hypot(group[i].x - group[j].x, group[i].y - group[j].y) > gap) continue
      const ri = find(i)
      const rj = find(j)
      if (ri !== rj) parent[rj] = ri
    }
  }

  const out = new Map<number, Station[]>()
  group.forEach((station, i) => {
    const root = find(i)
    const bucket = out.get(root)
    if (bucket) bucket.push(station)
    else out.set(root, [station])
  })
  return [...out.values()]
}

export const stationPads: StationPad[] = Object.entries(PAD_KINDS).flatMap(([kind, label]) =>
  groupStops(stations.filter(s => s.kind === kind), PAD_GROUP_GAP).map((group, i) => {
    const xs = group.map(s => s.x)
    const ys = group.map(s => s.y)
    const x = Math.min(...xs) - PAD_MARGIN
    const y = Math.min(...ys) - PAD_MARGIN
    return {
      id: `pad-${kind}-${i + 1}`,
      kind: kind as StationKind,
      label,
      x,
      y,
      w: Math.max(...xs) - Math.min(...xs) + PAD_MARGIN * 2,
      h: Math.max(...ys) - Math.min(...ys) + PAD_MARGIN * 2,
      stops: group.map(s => ({ id: s.id, label: s.label, x: s.x, y: s.y })),
    }
  }),
)

/** Everything a unit stops at that is NOT inside a marked pad. */
export const stopMarks = stations.filter(s => !(s.kind in PAD_KINDS))

// ── Spurs ────────────────────────────────────────────────────────────────────

/** The short link from a lane to a stop that stands off it. */
export interface Spur {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
}

/**
 * ⚠️ A SPUR IS A REAL DISTINCTION IN THE ROAD NETWORK, NOT A CONNECTOR DRAWN TO
 * TIDY THE PICTURE UP. `Station.access` is the lane node a unit enters from, and
 * `navGraph` treats a station whose access point differs from its position as a
 * SPUR — a unit parked there is deliberately invisible to following distance,
 * because it is out of the lane. A station that repeats its own position is ON
 * the lane, and a unit stopped there blocks it.
 *
 * That is the difference between a workstation an AMR can sit at all day and a
 * rack face that jams the aisle behind it, and until now the map drew both as
 * the same dot. Drawing the link makes the plan say which stops cost road and
 * which do not — and a stop that appears to float in a rack, unreachable, is
 * immediately visible as a network mistake rather than as a rendering one.
 */
export const spurs: Spur[] = stations
  .filter(s => s.x !== s.access[0] || s.y !== s.access[1])
  .map(s => ({ id: `sp-${s.id}`, x1: s.access[0], y1: s.access[1], x2: s.x, y2: s.y }))
