/**
 * scripts/plan-network.mjs
 *
 * ── WHERE CAN A FORKLIFT ACTUALLY GO? ────────────────────────────────────────
 *
 *   node scripts/plan-network.mjs
 *
 * Reports, from the measured clearance grid, which lanes the LARGEST vehicle can
 * drive end to end and how much room it has on each — so the corridor and station
 * tables in `src/data/fleet.ts` are chosen against the building rather than
 * against a drawing of it.
 *
 * WHY THIS EXISTS. The network used to be spaced for a marker: junctions every
 * 0.8–0.95 m, which is finer than a forklift is long, so queued units were drawn
 * inside one another and no amount of tuning could fix it — a stopping gap has to
 * stay under the shortest lane segment, and the shortest segment was a third of
 * the vehicle. Sizing the vehicles honestly made that visible. The fix is to
 * space the network for the vehicle, which means first knowing what the building
 * will allow.
 *
 * The rule throughout: THE FORKLIFT IS THE LIMITING VEHICLE. Every distance
 * printed here derives from its envelope, and every smaller chassis then fits by
 * construction.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const NAV = resolve(here, '../src/data/warehouseNav.ts')

// ── The projection, mirrored from the 3D stack ───────────────────────────────
// Identical to extract-plan-structure.mjs. If one changes, both change.
const VIEW_BOX = { x: -67, y: 70, width: 1374, height: 760 }
const INTERIOR_INSET = 0.04
const ROTATION_Y = Math.PI / 2

const src = readFileSync(NAV, 'utf8')
const num = key => {
  const hit = src.match(new RegExp(`${key}:\\s*(-?[0-9.]+)`))
  if (!hit) throw new Error(`warehouseNav.ts has no "${key}"`)
  return Number(hit[1])
}
const nav = {
  originX: num('originX'), originZ: num('originZ'),
  cell: num('cell'), cols: num('cols'), rows: num('rows'),
}
const clearance = src.match(/clearance: new Uint8Array\(\[([\s\S]*?)\]\)/)[1].split(',').map(Number)

const hull = {
  minX: nav.originX, maxX: nav.originX + nav.cols * nav.cell,
  minZ: nav.originZ, maxZ: nav.originZ + nav.rows * nav.cell,
}
const inset = {
  minX: hull.minX + (hull.maxX - hull.minX) * INTERIOR_INSET,
  maxX: hull.maxX - (hull.maxX - hull.minX) * INTERIOR_INSET,
  minZ: hull.minZ + (hull.maxZ - hull.minZ) * INTERIOR_INSET,
  maxZ: hull.maxZ - (hull.maxZ - hull.minZ) * INTERIOR_INSET,
}
const centreX = (inset.minX + inset.maxX) / 2
const centreZ = (inset.minZ + inset.maxZ) / 2

const cos = Math.abs(Math.cos(ROTATION_Y))
const sin = Math.abs(Math.sin(ROTATION_Y))
const spanX = VIEW_BOX.width * cos + VIEW_BOX.height * sin
const spanZ = VIEW_BOX.width * sin + VIEW_BOX.height * cos
/** Metres per plan unit — the one scale the whole simulation is now based on. */
const M_PER_UNIT = Math.min((inset.maxX - inset.minX) / spanX, (inset.maxZ - inset.minZ) / spanZ)
const UNITS_PER_M = 1 / M_PER_UNIT

const planCX = VIEW_BOX.x + VIEW_BOX.width / 2
const planCY = VIEW_BOX.y + VIEW_BOX.height / 2

/** Plan point → clearance in metres, 0 meaning solid. */
function clearAt (planX, planY) {
  const worldX = centreX - (planY - planCY) * M_PER_UNIT
  const worldZ = centreZ + (planX - planCX) * M_PER_UNIT
  const col = Math.round((worldX - nav.originX) / nav.cell)
  const row = Math.round((worldZ - nav.originZ) / nav.cell)
  if (col < 0 || row < 0 || col >= nav.cols || row >= nav.rows) return 0
  return clearance[row * nav.cols + col] * 0.05
}

// ── The limiting vehicle ─────────────────────────────────────────────────────
/**
 * The forklift, AS RENDERED. Its declared size is 2.0 × 1.0 m but the scene fits
 * models by height and this asset is proportionally wide, so what stands on the
 * floor is 1.69 × 1.29 m. Clearances are computed from what is DRAWN — a margin
 * measured against a number nobody can see would be a margin against nothing.
 */
const ARGV_WIDTH = Number(process.env.WIDTH_M)
const FORKLIFT = Number.isFinite(ARGV_WIDTH)
  ? { lengthM: ARGV_WIDTH * 1.31, widthM: ARGV_WIDTH }
  : { lengthM: 1.57, widthM: 1.2 }
/** Diameter of the circle it sweeps turning on the spot. */
const ENVELOPE_M = Math.hypot(FORKLIFT.lengthM, FORKLIFT.widthM)
/** Room a lane needs either side of its centre line to carry it. */
const LANE_CLEAR_M = FORKLIFT.widthM / 2 + 0.06
/** Room a junction needs: it turns there, so the whole envelope has to fit. */
const NODE_CLEAR_M = ENVELOPE_M / 2 + 0.04

const round = (n, p = 2) => Math.round(n * 10 ** p) / 10 ** p

console.log('── SCALE ─────────────────────────────────────────────────────────')
console.log(`  1 plan unit      = ${round(M_PER_UNIT, 5)} m`)
console.log(`  1 metre          = ${round(UNITS_PER_M, 3)} plan units`)
console.log(`  interior         = ${round(VIEW_BOX.width * M_PER_UNIT)} x ${round(VIEW_BOX.height * M_PER_UNIT)} m`)
console.log('\n── THE LIMITING VEHICLE (forklift, as rendered) ──────────────────')
console.log(`  body             ${FORKLIFT.lengthM} x ${FORKLIFT.widthM} m`)
console.log(`  turning envelope ${round(ENVELOPE_M)} m  = ${Math.round(ENVELOPE_M * UNITS_PER_M)} plan units`)
console.log(`  lane needs       ${round(LANE_CLEAR_M)} m clear either side`)
console.log(`  junction needs   ${round(NODE_CLEAR_M)} m clear all round`)

// ── Which full-length lanes exist? ───────────────────────────────────────────
/**
 * A lane is only useful if it runs END TO END at the required clearance. One
 * blocked bay in the middle splits the network into halves that can only be
 * rejoined the long way round, and the router will happily plan through the gap
 * and then wedge a unit in it.
 */
const STEP = 4

function scanLane (axis, at, from, to) {
  let min = Infinity
  let worstAt = from
  for (let s = from; s <= to; s += STEP) {
    const c = axis === 'h' ? clearAt(s, at) : clearAt(at, s)
    if (c < min) { min = c; worstAt = s }
  }
  return { min, worstAt }
}

/**
 * The longest stretch of a candidate line that clears `need` metres.
 *
 * ⚠️ THIS, NOT "clear end to end". Scanning the full viewBox runs the line
 * through the building's end walls, where clearance is zero by definition, so
 * every lane fails and the answer looks like "this building has no aisles". What
 * matters is the longest usable RUN and where it starts and stops — that is what
 * a corridor's `from`/`to` are.
 */
function longestRun (axis, at, from, to, need) {
  let best = { start: null, end: null, length: 0, min: 0 }
  let start = null
  let runMin = Infinity
  for (let s = from; s <= to; s += STEP) {
    const c = axis === 'h' ? clearAt(s, at) : clearAt(at, s)
    if (c >= need) {
      if (start === null) { start = s; runMin = c }
      else runMin = Math.min(runMin, c)
    } else if (start !== null) {
      const length = s - STEP - start
      if (length > best.length) best = { start, end: s - STEP, length, min: runMin }
      start = null
    }
  }
  if (start !== null) {
    const length = to - start
    if (length > best.length) best = { start, end: to, length, min: runMin }
  }
  return best
}

const X0 = VIEW_BOX.x + 30
const X1 = VIEW_BOX.x + VIEW_BOX.width - 30
const Y0 = VIEW_BOX.y + 30
const Y1 = VIEW_BOX.y + VIEW_BOX.height - 30

/**
 * The widest vehicle the building will take, end to end.
 *
 * This is the number the whole design has to start from, and it is a property of
 * the model rather than a choice: if the best full-length lane clears C metres,
 * nothing wider than 2C can drive it, whatever the fleet table says.
 */
const MIN_USEFUL = 300 // plan units — a lane shorter than this serves nothing

console.log('\n── WHAT THE BUILDING ACTUALLY ADMITS ─────────────────────────────')
// Widen the requirement until no lane of useful length survives. The last width
// that does is the widest vehicle this warehouse can run.
let admits = 0
let admitsAt = null
for (let need = 0.3; need <= 2.0; need += 0.05) {
  let found = null
  for (let y = Y0; y <= Y1; y += 2) {
    const run = longestRun('h', y, X0, X1, need)
    if (run.length >= MIN_USEFUL && (!found || run.length > found.length)) found = { ...run, y }
  }
  if (!found) break
  admits = need
  admitsAt = found
}
console.log(`  widest usable lane       ${round(admits)} m clear either side, at y=${admitsAt?.y}`)
console.log(`  ⇒ max vehicle WIDTH      ${round(admits * 2)} m`)
console.log(`  forklift needs           ${round(LANE_CLEAR_M)} m  →  ${admits >= LANE_CLEAR_M ? 'FITS' : 'DOES NOT FIT'}`)

/**
 * ── HOW MUCH NETWORK SURVIVES AT EACH VEHICLE WIDTH ─────────────────────────
 *
 * The single most useful number in this file. Aisle clearance is not a smooth
 * function of width — a lane either fits a vehicle or it does not — so widening
 * the fleet removes whole aisles at once, and with them the cross-overs that make
 * the network a network rather than a corridor. This sweep says where the cliff
 * is, which is the difference between choosing a fleet size and discovering one.
 */
console.log('\n── NETWORK vs VEHICLE WIDTH ──────────────────────────────────────')
console.log('  width   through-lanes  cross-overs  longest lane')
for (const widthM of [0.6, 0.8, 1.0, 1.2, 1.29, 1.5]) {
  const need = widthM / 2 + 0.06
  const lanes = []
  for (let y = Y0; y <= Y1; y += 5) {
    const run = longestRun('h', y, X0, X1, need)
    if (run.length >= MIN_USEFUL) lanes.push({ y, run })
  }
  // Collapse adjacent y into one aisle — five samples through one aisle is one
  // aisle, and counting them separately would flatter every width equally.
  let aisles = 0
  let prevY = -999
  let longest = 0
  for (const l of lanes) {
    if (l.y - prevY > 40) aisles += 1
    prevY = l.y
    longest = Math.max(longest, l.run.length)
  }
  let crosses = 0
  let prevX = -999
  for (let x = X0; x <= X1; x += 5) {
    const run = longestRun('v', x, Y0, Y1, need)
    // A cross-over must join the top and bottom thirds to be worth anything.
    if (run.length >= (Y1 - Y0) * 0.6) {
      if (x - prevX > 60) crosses += 1
      prevX = x
    }
  }
  console.log(`  ${widthM.toFixed(2)} m  ${String(aisles).padStart(9)}`
    + `  ${String(crosses).padStart(11)}  ${round(longest * M_PER_UNIT)} m`)
}

console.log('\n── HORIZONTAL LANES, longest run clearing the forklift ───────────')
const hRuns = []
for (let y = Y0; y <= Y1; y += 5) {
  const run = longestRun('h', y, X0, X1, LANE_CLEAR_M)
  if (run.length >= MIN_USEFUL) hRuns.push({ y, min: run.min, run })
}
for (const r of hRuns) {
  console.log(`  y=${r.y}  x ${r.run.start}…${r.run.end}  (${r.run.length} units, ${round(r.run.length * M_PER_UNIT)} m)`
    + `  clear ${round(r.run.min)} m`)
}
// Group adjacent y values into bands and report each band's best line.
function bands (list, key) {
  const out = []
  let cur = null
  for (const item of list) {
    if (cur && item[key] - cur.hi <= 6) {
      cur.hi = item[key]
      if (item.min > cur.best.min) cur.best = item
    } else {
      cur = { lo: item[key], hi: item[key], best: item }
      out.push(cur)
    }
  }
  return out
}
for (const band of bands(hRuns, 'y')) {
  console.log(`  y ${band.lo}–${band.hi}  best y=${band.best.y}`
    + `  clear ${round(band.best.min)} m  (width ${round(band.best.min * 2)} m)`)
}
if (!hRuns.length) console.log('  none — no horizontal lane is clear end to end at this width')

console.log('\n── VERTICAL LANES that carry a forklift wall to wall ─────────────')
const vRuns = []
for (let x = X0; x <= X1; x += 5) {
  const { min } = scanLane('v', x, Y0, Y1)
  if (min >= LANE_CLEAR_M) vRuns.push({ x, min })
}
for (const band of bands(vRuns, 'x')) {
  console.log(`  x ${band.lo}–${band.hi}  best x=${band.best.x}  clear ${round(band.best.min)} m`)
}
if (!vRuns.length) console.log('  none — the racking runs the length of the building, so crossings')

// ── Cross-overs between two named lanes ──────────────────────────────────────
/**
 * With no full-height vertical lane, the north and south halves are joined only
 * where a gap happens to line up. Those gaps are the network's scarcest resource
 * and there is no choosing them — they are where the building put them.
 */
const LANES = process.argv.slice(2).map(Number).filter(Number.isFinite)
if (LANES.length === 2) {
  const [a, b] = LANES.sort((p, q) => p - q)
  console.log(`\n── CROSS-OVERS between y=${a} and y=${b} ──────────────────────────`)
  const open = []
  for (let x = X0; x <= X1; x += 5) {
    const { min } = scanLane('v', x, a, b)
    if (min >= LANE_CLEAR_M) open.push({ x, min })
  }
  for (const band of bands(open, 'x')) {
    const span = band.hi - band.lo
    console.log(`  x ${band.lo}–${band.hi} (${span} units, ${round(span * M_PER_UNIT)} m wide)`
      + `  best x=${band.best.x}  clear ${round(band.best.min)} m`)
  }
  if (!open.length) console.log('  none')
}

// ── What the spacing rules then are ──────────────────────────────────────────
const stop = ENVELOPE_M + 0.15
console.log('\n── MINIMUM DISTANCES, all derived from the envelope ──────────────')
const row = (label, m) => console.log(`  ${label.padEnd(22)} ${round(m)} m = ${Math.round(m * UNITS_PER_M)} plan units`)
row('stopping gap', stop)
row('junction clearance', stop)
row('min through leg', stop + 0.35)
row('station spacing', stop + 0.35)
row('brake-from distance', stop * 2.5)
console.log(`\n  A lane of L metres carries at most floor(L / ${round(stop + 0.35)}) stops.`)
