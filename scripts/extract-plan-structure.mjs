/**
 * scripts/extract-plan-structure.mjs
 *
 * Derives the ENTIRE warehouse layout from the GLB. Nothing about this building
 * is drawn by hand any more.
 *
 *   node scripts/extract-warehouse-nav.mjs        # first: GLB → clearance grid
 *   node scripts/extract-plan-structure.mjs       # then: grid → the layout
 *
 * ── WHAT IT EMITS ────────────────────────────────────────────────────────────
 *
 *   planScale     the one physical scale (see below)
 *   planViewBox   the plan's box — the interior, exactly
 *   shell         the interior wall line
 *   zones         racking and plant, as rectangles, for the 2D map
 *   rackRuns      each run of racking: which band of y it occupies, and the
 *                 spans of x where it is solid (i.e. where a pick face is real)
 *   aisles        the drivable centre lines, measured — one per aisle band
 *   crossings     the x positions where a unit can cross between aisles
 *   openFloor     large clear rectangles, for bays and workstations
 *
 * `src/data/fleet.ts` reads these and decides POLICY on top of them — which
 * chassis works where, which way traffic runs, how often a face is picked. The
 * split is deliberate: geometry is measured, policy is authored.
 *
 * ── ⚠️ THE ONE SCALE ─────────────────────────────────────────────────────────
 *
 * A plan unit is EXACTLY 0.02 m. Not approximately, not by convention — the
 * viewBox is emitted as the interior's true size × 50, so the projection that
 * fits it back onto the model can only produce 0.02, and both axes bind at once.
 *
 * That is the fix for a real defect. The simulation used to be tuned in plan
 * units against a declared 0.1 m, while the scene rendered them at 0.021 — a
 * factor of five apart. Following distances sized for a 121 m hall were being
 * drawn around robots sized for a 25 m one, so units queued visibly inside each
 * other and nothing in the numbers said so. There is now one scale, it is
 * measured, and `PLAN_UNITS_PER_METRE` asserts against it at import time.
 *
 * The plan's origin is the interior's own corner, so plan coordinates run
 * 0…width and 0…height with no negative numbers to reason about.
 *
 * ── METHOD ───────────────────────────────────────────────────────────────────
 *
 * The model names nothing, but every triangle is real. `extract-warehouse-nav.mjs`
 * rasterises everything standing 0.25–1.9 m off the floor — the band a ground
 * robot strikes — and distance-transforms the free cells. The RIDGES of that
 * clearance field are the aisles and the zeros are the racking, which is how a
 * layout falls out of a model with no labels in it.
 *
 * Output: src/data/warehouseStructure.ts (generated — never hand-edit).
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const NAV = resolve(here, '../src/data/warehouseNav.ts')
const LAYOUT = resolve(here, '../src/data/warehouseLayout.ts')
const OUT = resolve(here, '../src/data/warehouseStructure.ts')

// ── The scale, and the one place it is decided ───────────────────────────────
const UNITS_PER_METRE = 1374 / 28.8144
const M = UNITS_PER_METRE // metres → plan units
/** `WarehouseScene.clip.inset` — the fraction trimmed off each side. */
const INTERIOR_INSET = 0.04

/**
 * Half the widest mobile chassis, plus a little. A cell is drivable when the
 * nearest obstacle is at least this far away, so a lane made of drivable cells
 * is one the fleet physically fits down.
 */
const ROBOT_HALF_WIDTH_M = 0.42

// ── Read the generated inputs ────────────────────────────────────────────────
const navSrc = readFileSync(NAV, 'utf8')
const navNum = key => {
  const hit = navSrc.match(new RegExp(`${key}:\\s*(-?[0-9.]+)`))
  if (!hit) throw new Error(`warehouseNav.ts has no "${key}" — re-run extract-warehouse-nav.mjs`)
  return Number(hit[1])
}
const nav = {
  originX: navNum('originX'), originZ: navNum('originZ'),
  cell: navNum('cell'), cols: navNum('cols'), rows: navNum('rows'),
}
const clearance = navSrc.match(/clearance: new Uint8Array\(\[([\s\S]*?)\]\)/)[1].split(',').map(Number)

// The hull comes from the LAYOUT export, which is the model's true bounding box
// — the same box `WarehouseScene` measures. The nav grid is rounded up to whole
// cells, so using it here would put the scale out by a fraction of a percent.
const layoutSrc = readFileSync(LAYOUT, 'utf8')
const hullBlock = layoutSrc.match(/warehouseHull = \{([\s\S]*?)\}/)[1]
const hullNum = key => Number(hullBlock.match(new RegExp(`${key}:\\s*(-?[0-9.]+)`))[1])
const hull = {
  x: hullNum('x'), z: hullNum('z'),
  width: hullNum('width'), depth: hullNum('depth'),
}

const interior = {
  minX: hull.x + hull.width * INTERIOR_INSET,
  maxX: hull.x + hull.width * (1 - INTERIOR_INSET),
  minZ: hull.z + hull.depth * INTERIOR_INSET,
  maxZ: hull.z + hull.depth * (1 - INTERIOR_INSET),
}
const spanX = interior.maxX - interior.minX // across the building → plan y
const spanZ = interior.maxZ - interior.minZ // along the building  → plan x

const VIEW = {
  x: round(-67),
  y: round(70),
  width: round(spanZ * M),
  height: round(spanX * M),
}

function round (n) { return Math.round(n * 1000) / 1000 }

/**
 * Plan → world. The quarter turn the viewer applies, written out: plan x runs
 * along the building (world z) and plan y runs across it (world x, reversed).
 */
const planXtoWorldZ = px => interior.minZ + (px - VIEW.x) / M
const planYtoWorldX = py => interior.maxX - (py - VIEW.y) / M

/** Clearance in metres at a plan point. 0 means solid. */
function clearAt (planX, planY) {
  const col = Math.round((planYtoWorldX(planY) - nav.originX) / nav.cell)
  const row = Math.round((planXtoWorldZ(planX) - nav.originZ) / nav.cell)
  if (col < 0 || row < 0 || col >= nav.cols || row >= nav.rows) return 0
  return clearance[row * nav.cols + col] * 0.05
}
const drivable = (px, py) => clearAt(px, py) >= ROBOT_HALF_WIDTH_M

/** Contiguous spans of `v` in [lo, hi] where `ok(v)` holds. */
function spans (lo, hi, step, ok) {
  const out = []
  let start = null
  for (let v = lo; v <= hi; v += step) {
    if (ok(v)) { if (start === null) start = v } else if (start !== null) { out.push([start, v - step]); start = null }
  }
  if (start !== null) out.push([start, hi])
  return out
}
const longest = list => list.reduce((best, s) => (s[1] - s[0] > (best ? best[1] - best[0] : -1) ? s : best), null)

// ─────────────────────────────────────────────────────────────────────────────
// 1 · The rack bands: where, across the building, the mass is
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Profile the whole building along its short axis. A y that is solid for much of
 * the building's length is racking; a y that is clear for most of it is an aisle.
 * The building's four runs and three aisles fall straight out of this.
 */
const SAMPLE = 2
const profile = []
for (let py = VIEW.y; py <= VIEW.y + VIEW.height; py += SAMPLE) {
  let solid = 0, open = 0, n = 0
  for (let px = VIEW.x; px <= VIEW.x + VIEW.width; px += 10) {
    const m = clearAt(px, py)
    n++
    if (m === 0) solid++
    if (m >= ROBOT_HALF_WIDTH_M) open++
  }
  profile.push({ py, solidPct: solid / n, openPct: open / n })
}

/** A run of racking: ≥35 % of the building's length is solid at that y. */
const rackBands = spans(VIEW.y, VIEW.y + VIEW.height, SAMPLE,
  py => (profile.find(p => p.py === py)?.solidPct ?? 0) >= 0.35)
  .filter(([a, b]) => b - a >= 0.4 * M)

/** An aisle: ≥60 % of the length is drivable. */
const aisleBands = spans(VIEW.y, VIEW.y + VIEW.height, SAMPLE,
  py => (profile.find(p => p.py === py)?.openPct ?? 0) >= 0.6)
  .filter(([a, b]) => b - a >= 0.8 * M)

// ─────────────────────────────────────────────────────────────────────────────
// 2 · The lane inside each aisle band: the line that is clear END TO END
// ─────────────────────────────────────────────────────────────────────────────
/**
 * ⚠️ NOT the middle of the aisle. Racking is not perfectly regular and there is
 * loose plant in a few bays, so the centre line of an aisle is often blocked
 * somewhere along its length. What matters is the line a unit can drive from one
 * end of the building to the other, because a lane with a hole in it splits the
 * network into pieces that can only be rejoined through the middle.
 *
 * A wide band gets TWO lanes (the centre aisle is wide enough to pass in), which
 * is what lets traffic run both ways down the middle of the building.
 */
const TWO_LANE_WIDTH = 2.6 * M

/**
 * ⚠️ A LANE IS A SET OF SEGMENTS, not one run.
 *
 * Real aisles have things standing in them — a pallet stack, a wrapping machine,
 * a column. Taking only each lane's longest clear run threw the rest away: the
 * centre-north lane came out as x 105…890 when the building has usable aisle
 * either side of an obstruction at x 890, and everything past it was invisible
 * to the router. Emitting every segment keeps that floor, and the cross links
 * below are what join the pieces back up.
 */
const MIN_SEGMENT = 2.0 * M

function bestLane (lo, hi, exclude = []) {
  let best = null
  for (let py = lo; py <= hi; py += 1) {
    if (exclude.some(e => Math.abs(py - e) < 1.8 * M)) continue
    const segments = spans(VIEW.x, VIEW.x + VIEW.width, 5, px => drivable(px, py))
      .filter(([a, b]) => b - a >= MIN_SEGMENT)
    if (segments.length === 0) continue
    const total = segments.reduce((s, [a, b]) => s + (b - a), 0)
    const run = longest(segments)
    let worst = Infinity
    for (const [a, b] of segments) for (let px = a; px <= b; px += 5) worst = Math.min(worst, clearAt(px, py))
    // Reach first, then how tight it gets, then how much of it is one piece —
    // a lane in three parts is worth less than the same length unbroken.
    const score = total + worst * M * 4 + (run[1] - run[0]) * 0.25
    if (!best || score > best.score) best = { py, segments, from: run[0], to: run[1], worst, score }
  }
  return best
}

const lanes = []
for (const [lo, hi] of aisleBands) {
  const wide = hi - lo >= TWO_LANE_WIDTH
  const first = bestLane(lo, hi)
  if (!first) continue
  lanes.push({ ...first, band: [lo, hi] })
  if (wide) {
    const second = bestLane(lo, hi, [first.py])
    if (second) lanes.push({ ...second, band: [lo, hi] })
  }
}
lanes.sort((a, b) => a.py - b.py)

// ─────────────────────────────────────────────────────────────────────────────
// 3 · Crossings: x where a unit can get from the first lane to the last
// ─────────────────────────────────────────────────────────────────────────────
/**
 * ⚠️ CROSSINGS ARE MEASURED PER ADJACENT PAIR OF LANES, not across the whole
 * building. This was the difference between a network that used the building and
 * one that used the middle of it.
 *
 * The obvious test — "is the whole width clear at this x?" — finds only the
 * three gaps that happen to run clean through all four aisles, and throws away
 * both ends of the building, because a single blocked bay anywhere across the
 * width disqualifies the entire column. But a link between two NEIGHBOURING
 * lanes is useful on its own: it is how a unit steps from one aisle into the
 * next, and stepping twice crosses the building anyway.
 *
 * Measuring pairwise turns the two end halls — which are partly obstructed, and
 * so failed the whole-width test — back into usable connections.
 */
const crossLinks = []
for (let i = 0; i + 1 < lanes.length; i++) {
  const a = lanes[i].py
  const b = lanes[i + 1].py
  const found = spans(VIEW.x, VIEW.x + VIEW.width, 2, px => {
    for (let py = a; py <= b; py += 2) if (!drivable(px, py)) return false
    return true
  }).filter(([lo, hi]) => hi - lo >= 0.4 * M)
  crossLinks.push({ a, b, spans: found })
}

/** Kept for the report: gaps that run clean through every aisle at once. */
const firstLane = lanes[0].py
const lastLane = lanes[lanes.length - 1].py
const crossSpans = spans(VIEW.x, VIEW.x + VIEW.width, 2, px => {
  for (let py = firstLane; py <= lastLane; py += 2) if (!drivable(px, py)) return false
  return true
}).filter(([a, b]) => b - a >= 0.5 * M)

/**
 * Crossings, spaced across each gap rather than one per gap.
 *
 * ⚠️ HOW MANY OF THESE THERE ARE DECIDES HOW CONGESTED THE BUILDING IS. Every
 * unit moving between the north and south halves has to use one, so too few and
 * the whole fleet funnels through the same two points. The racking is solid
 * everywhere else, so this is not a free choice — all the script can do is use
 * each real gap fully, which means putting a crossing every few metres across a
 * wide one instead of a single line down its middle.
 */
const m = u => (u / M).toFixed(2)
/** Wide gaps get more than one crossing so a whole fleet does not funnel through one line. */
const CROSS_PITCH = 4.0 * M
const CROSS_MARGIN = 0.35 * M

function placeAcross (lo, hi) {
  const a = lo + CROSS_MARGIN
  const b = hi - CROSS_MARGIN
  if (b <= a) return [round((lo + hi) / 2)]
  const n = Math.max(1, Math.round((b - a) / CROSS_PITCH) + 1)
  return Array.from({ length: n }, (_, i) => round(n === 1 ? (a + b) / 2 : a + ((b - a) * i) / (n - 1)))
}

for (const link of crossLinks) link.xs = link.spans.flatMap(([lo, hi]) => placeAcross(lo, hi))
console.log(`cross links  ${crossLinks.map(l => `y${l.a}→y${l.b}: x ${l.xs.join(',')}`).join('   ')}`)

// ─────────────────────────────────────────────────────────────────────────────
// 4 · Rack runs: which lane works each run, and where it is solid
// ─────────────────────────────────────────────────────────────────────────────
/**
 * A run is worked from whichever lanes touch it. The two wall runs have a lane
 * on one side only; the two interior runs have one on each, so they carry twice
 * the pick faces — which is the building's own geometry deciding capacity rather
 * than anyone allocating it.
 */
const rackRuns = rackBands.map(([lo, hi], i) => {
  const mid = (lo + hi) / 2
  const faceDepth = 0.5 * M
  const servedBy = lanes
    .filter(l => Math.abs(l.py - mid) < (hi - lo) / 2 + 2.5 * M)
    .map(l => l.py)
  // Solid spans measured on the band's mid-line — that is the rack itself, and
  // a face only exists where there is racking behind it to pick from.
  const solid = spans(VIEW.x, VIEW.x + VIEW.width, 5, px => clearAt(px, mid) === 0)
    .filter(([a, b]) => b - a >= 1.2 * M)
    .map(([a, b]) => [round(a), round(b)])
  return {
    code: String.fromCharCode(65 + i),
    band: [round(lo), round(hi)],
    mid: round(mid),
    faceDepth: round(faceDepth),
    servedBy: servedBy.map(round),
    solid,
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// 5 · Open floor: big clear rectangles, for bays / workstations / chargers
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Anywhere a machine can stand that is NOT one of the lanes. The ends of the
 * building are the obvious ones — there is no apron down either long wall, both
 * are racking end to end — but the method finds them rather than assuming.
 */
const CLEAR_FOR_STANDING = 0.55
const openFloor = []
{
  const CELL = 0.4 * M
  const claimed = []
  const free = (x, y) => clearAt(x, y) >= CLEAR_FOR_STANDING
    && !claimed.some(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
  for (let y = VIEW.y; y < VIEW.y + VIEW.height; y += CELL) {
    for (let x = VIEW.x; x < VIEW.x + VIEW.width; x += CELL) {
      if (!free(x, y)) continue
      let w = 0
      while (x + w + CELL <= VIEW.x + VIEW.width && free(x + w + CELL, y)) w += CELL
      let h = 0
      grow: while (y + h + CELL <= VIEW.y + VIEW.height) {
        for (let t = 0; t <= w; t += CELL) if (!free(x + t, y + h + CELL)) break grow
        h += CELL
      }
      if (w >= 1.2 * M && h >= 1.2 * M) {
        const rect = { x: round(x), y: round(y), w: round(w), h: round(h) }
        claimed.push(rect)
        openFloor.push(rect)
      }
    }
  }
}
openFloor.sort((a, b) => b.w * b.h - a.w * a.h)

// ─────────────────────────────────────────────────────────────────────────────
// 6 · Zones for the 2D map: the mass, as rectangles
// ─────────────────────────────────────────────────────────────────────────────
const BAND = 0.16 * M
const STEP = 0.08 * M
const MIN_RUN = 0.4 * M
const bandRows = []
for (let y = VIEW.y; y < VIEW.y + VIEW.height; y += BAND) {
  const runs = []
  let start = null
  for (let x = VIEW.x; x <= VIEW.x + VIEW.width; x += STEP) {
    // Solid across the whole band thickness — a band that is half aisle is an
    // edge, and drawing it as mass would eat into the aisle beside it.
    const solid = clearAt(x, y) === 0 && clearAt(x, y + BAND - 1) === 0
    if (solid) { if (start === null) start = x } else if (start !== null) {
      if (x - start >= MIN_RUN) runs.push([start, x - STEP])
      start = null
    }
  }
  if (start !== null && VIEW.x + VIEW.width - start >= MIN_RUN) runs.push([start, VIEW.x + VIEW.width])
  bandRows.push({ y, runs })
}

const TOLERANCE = 0.16 * M
const rects = []
let open = []
for (const row of bandRows) {
  const next = []
  for (const [x0, x1] of row.runs) {
    const match = open.find(r => Math.abs(r.x - x0) <= TOLERANCE && Math.abs(r.x + r.w - x1) <= TOLERANCE)
    if (match) {
      match.h = row.y + BAND - match.y
      match.x = Math.min(match.x, x0)
      match.w = Math.max(match.x + match.w, x1) - match.x
      next.push(match)
      open = open.filter(r => r !== match)
    } else {
      next.push({ x: x0, y: row.y, w: x1 - x0, h: BAND })
    }
  }
  rects.push(...open)
  open = next
}
rects.push(...open)

/** A pallet position is ~1.3 m wide, so that is how densely bays are drawn. */
const BAY_WIDTH_M = 1.3
const MIN_AREA = (0.5 * M) ** 2

const zones = []
let plantSerial = 0
for (const r of rects.sort((a, b) => a.y - b.y || a.x - b.x)) {
  if (r.w * r.h < MIN_AREA) continue
  const mid = r.y + r.h / 2
  const run = rackRuns.find(k => mid >= k.band[0] - BAND && mid <= k.band[1] + BAND)
  if (run) {
    zones.push({
      id: `z-${run.code.toLowerCase()}${zones.filter(z => z.id.startsWith(`z-${run.code.toLowerCase()}`)).length + 1}`,
      kind: 'rack',
      x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h),
      bays: Math.max(2, Math.round(r.w / (BAY_WIDTH_M * M))),
      axis: 'row',
    })
  } else {
    zones.push({
      id: `z-p${++plantSerial}`,
      kind: 'cell',
      x: round(r.x), y: round(r.y), w: round(r.w), h: round(r.h),
    })
  }
}

// ── The shell ────────────────────────────────────────────────────────────────
const R = 0.5 * M
const shell = [
  [VIEW.x, VIEW.y, R], [VIEW.x + VIEW.width, VIEW.y, R],
  [VIEW.x + VIEW.width, VIEW.y + VIEW.height, R], [VIEW.x, VIEW.y + VIEW.height, R],
]

const _reportHelperMoved = true
// ── Report ───────────────────────────────────────────────────────────────────
console.log(`scale        1 plan unit = ${(1 / M).toFixed(3)} m   (${M} units/m)`)
console.log(`interior     ${m(VIEW.width)} m along × ${m(VIEW.height)} m across  →  viewBox ${VIEW.width} × ${VIEW.height}`)
console.log(`\nrack runs    ${rackRuns.length}`)
for (const r of rackRuns) {
  console.log(`  ${r.code}  y ${String(r.band[0]).padStart(6)}–${String(r.band[1]).padEnd(6)} (${m(r.band[1] - r.band[0])} m deep)`
    + `  served from y ${r.servedBy.join(', ')}  ·  ${r.solid.length} solid span(s), ${m(r.solid.reduce((s, [a, b]) => s + b - a, 0))} m of face`)
}
console.log(`\nlanes        ${lanes.length}`)
for (const l of lanes) console.log(`  y ${String(round(l.py)).padStart(6)}  ${l.segments.length} segment(s) totalling ${m(l.segments.reduce((s2,[a,b])=>s2+b-a,0))} m: ${l.segments.map(([a,b])=>`${round(a)}…${round(b)}`).join(', ')}  tightest ${l.worst.toFixed(2)} m`)
console.log(`\nfull-width gaps  ${crossSpans.length}  (${crossSpans.map(([a, b]) => `${m(b - a)} m`).join(', ')})`)
console.log(`pairwise links   ${crossLinks.reduce((n, l) => n + l.xs.length, 0)} across ${crossLinks.length} aisle pairs`)
console.log(`open floor   ${openFloor.length} rectangles, largest ${m(openFloor[0].w)}×${m(openFloor[0].h)} m at (${openFloor[0].x}, ${openFloor[0].y})`)
console.log(`zones        ${zones.length} — ${zones.filter(z => z.kind === 'rack').length} racking, ${zones.filter(z => z.kind !== 'rack').length} plant`)

// ── Emit ─────────────────────────────────────────────────────────────────────
const file = `/**
 * src/data/warehouseStructure.ts
 *
 * ⚠️ GENERATED FILE — DO NOT EDIT BY HAND.
 * Produced by scripts/extract-plan-structure.mjs from the warehouse GLB.
 * Re-run that script when the model changes.
 *
 * THE WAREHOUSE, MEASURED. Every rectangle, band and centre line here was read
 * off the model the 3D view renders — there is no second, hand-drawn layout any
 * more, and the 2D map is a projection of this rather than an opinion about it.
 *
 * \`src/data/fleet.ts\` builds the road network and the stations on top of this
 * and decides POLICY: which chassis works where, which way traffic runs, how
 * often a face is picked. Geometry is measured; policy is authored.
 *
 * Nothing here claims to know what any individual object IS — the model names
 * nothing. It knows where mass is, where the floor is clear, and how wide the
 * gaps are, which is all a robot needs.
 */

import type { FloorZone, ShellVertex } from './floorOps'

/**
 * ⚠️ THE ONE PHYSICAL SCALE.
 *
 * A plan unit is exactly ${(1 / M)} m. The viewBox below is the interior's true
 * size × ${M}, so the projection that fits it back onto the model can only produce
 * this figure, and both axes bind at once. \`PLAN_UNITS_PER_METRE\` in
 * \`fleet.ts\` asserts against it at import time.
 */
export const planScale = {
  metresPerUnit: ${1 / M},
  unitsPerMetre: ${M},
} as const

/** The plan's box — the building's interior, exactly, with the origin at its corner. */
export const planViewBox = ${JSON.stringify(VIEW)} as const

/** The interior wall line, clockwise from the top-left corner. */
export const warehouseShell: ShellVertex[] = ${JSON.stringify(shell)}

/**
 * A run of racking. \`band\` is the strip of plan-y it occupies, \`servedBy\` the
 * lanes that touch it, and \`solid\` the spans of plan-x where there is really
 * racking — a pick face outside one of those would face an empty bay.
 */
export interface RackRun {
  code: string
  band: readonly [number, number]
  mid: number
  /** How far off the lane a face stands, toward the rack. */
  faceDepth: number
  servedBy: number[]
  solid: Array<readonly [number, number]>
}

export const rackRuns: RackRun[] = ${JSON.stringify(rackRuns, null, 2)}

/**
 * A drivable centre line, measured. \`from\`/\`to\` is the span that is clear end
 * to end and \`worst\` the tightest clearance anywhere along it.
 *
 * ⚠️ These are NOT the middles of their aisles. Each is the line that runs the
 * whole length of the building; the geometric centre of an aisle is frequently
 * blocked by plant somewhere along it, and a lane with a hole in it splits the
 * network into pieces.
 */
export interface Aisle {
  py: number
  /** Every drivable stretch of this lane. Aisles have things standing in them. */
  segments: Array<readonly [number, number]>
  /** Tightest clearance along the lane, in metres. */
  worst: number
  band: readonly [number, number]
}

export const aisles: Aisle[] = ${JSON.stringify(lanes.map(l => ({ py: round(l.py), segments: l.segments.map(([a,b]) => [round(a), round(b)]), worst: round(l.worst), band: [round(l.band[0]), round(l.band[1])] })), null, 2)}

/**
 * Plan-x positions where a unit can cross the whole building between the first
 * and last lane. The racking is solid everywhere else, so these are not
 * adjustable — they are the only ways through.
 */
/**
 * A place a unit can step from one aisle into the next one across.
 *
 * ⚠️ MEASURED PAIRWISE, and that is what makes the ends of the building usable.
 * Only three gaps run clean through all four aisles at once; testing for those
 * alone threw away both end halls, because one blocked bay anywhere across the
 * width disqualifies the whole column. A link between two NEIGHBOURING lanes is
 * useful on its own — stepping twice crosses the building anyway.
 */
export interface CrossLink {
  /** The two lanes this joins, by their plan-y. */
  a: number
  b: number
  /** Plan-x positions where the step is clear. */
  xs: number[]
}

export const crossLinks: CrossLink[] = ${JSON.stringify(crossLinks.map(l => ({ a: l.a, b: l.b, xs: l.xs })), null, 2)}

/** Clear rectangles big enough to stand equipment in, largest first. */
export const openFloor: Array<{ x: number; y: number; w: number; h: number }> = ${JSON.stringify(openFloor.slice(0, 24), null, 2)}

export const warehouseZones: FloorZone[] = ${JSON.stringify(zones, null, 2)}
`

writeFileSync(OUT, file, 'utf8')
console.log('\n-> src/data/warehouseStructure.ts')
