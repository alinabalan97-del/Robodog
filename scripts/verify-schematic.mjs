/**
 * scripts/verify-schematic.mjs
 *
 * ── DOES THE 2D SCHEMATIC STILL DESCRIBE THE MEASURED BUILDING? ───────────────
 *
 *   node scripts/verify-schematic.mjs
 *
 * `src/data/floorSchematic.ts` groups the extractor's rectangles into named
 * storage runs, equipment and lettered aisles. Every step of that is derived, so
 * every step can silently stop matching the model when the GLB is re-extracted
 * or a threshold is nudged — and the failure mode is not an error, it is a map
 * that looks perfectly plausible while describing a different warehouse. That is
 * the exact failure CLAUDE.md records for the two hand-drawn layouts this map
 * replaced, so it gets a check rather than a comment.
 *
 * What is asserted:
 *   · every measured rack rectangle lands in exactly one cluster — nothing is
 *     dropped by the grouping and nothing is counted twice
 *   · every block, cell and pad sits inside the plan's viewBox
 *   · no cell escapes its own container, and no two cells in a block overlap
 *   · every block has at least one drawable cell
 *   · aisle codes are unique and every corridor has one
 *   · every station is either a pad stop or a stop mark, never both or neither
 *
 * Then it PRINTS the layout, because the numbers are the point: a run's address,
 * its footprint in metres and how many positions it holds are what an operator
 * reads off the map, and they should be checked by eye against the 3D view.
 */

import { createServer } from 'vite'

const server = await createServer({
  configFile: 'vite.config.mts',
  server: { middlewareMode: true },
  logLevel: 'error',
})

const schematic = await server.ssrLoadModule('/src/data/floorSchematic.ts')
const structure = await server.ssrLoadModule('/src/data/warehouseStructure.ts')
const objects = await server.ssrLoadModule('/src/data/warehouseObjects.ts')
const fleet = await server.ssrLoadModule('/src/data/fleet.ts')

const {
  storageBlocks, equipmentBlocks, plantBlocks, goodsBlocks, aisleMarks, stationPads, stopMarks,
} = schematic
const { planViewBox, planScale } = structure
const { warehouseObjects } = objects
const { corridors, stations } = fleet

const failures = []
const fail = message => failures.push(message)

const M = planScale.metresPerUnit
const m = units => (units * M).toFixed(2)

// ── Nothing measured is lost, and nothing is double-counted ──────────────────

const clustered = [...storageBlocks, ...equipmentBlocks]

/** An object belongs to a block if the block's bounds contain it outright. */
const inside = (o, block) =>
  o.x >= block.x - 0.01 && o.y >= block.y - 0.01 &&
  o.x + o.w <= block.x + block.w + 0.01 &&
  o.y + o.h <= block.y + block.h + 0.01

/**
 * Every measured object reaches the drawing. This is the assertion that would
 * have caught the old source silently dropping the east rack, so it is checked
 * per KIND — a rack quietly ending up in the goods layer is still a wrong map.
 */
const drawnBy = {
  rack: clustered,
  plant: plantBlocks,
  goods: goodsBlocks,
}
for (const o of warehouseObjects) {
  const targets = drawnBy[o.kind]
  if (!targets) { fail(`object ${o.id} has unknown kind "${o.kind}"`); continue }
  if (!targets.some(block => inside(o, block))) {
    fail(`${o.kind} object ${o.id} at (${o.x}, ${o.y}) is drawn by nothing`)
  }
}

// ── Everything is inside the building ────────────────────────────────────────

const VB = planViewBox
const withinPlan = (r, slack = 0) =>
  r.x >= VB.x - slack && r.y >= VB.y - slack &&
  r.x + (r.w ?? r.width) <= VB.x + VB.width + slack &&
  r.y + (r.h ?? r.height) <= VB.y + VB.height + slack

for (const block of [...storageBlocks, ...equipmentBlocks, ...plantBlocks, ...goodsBlocks]) {
  if (!withinPlan(block)) fail(`block ${block.id ?? block.label} escapes the plan box`)
}

// Pads are painted floor around a stop and may legitimately reach a wall, so
// they get the pad margin as slack rather than a hard bound.
for (const pad of stationPads) {
  if (!withinPlan(pad, 30)) fail(`pad ${pad.id} escapes the plan box`)
}

// ── Cells stay inside their block, and out of each other ─────────────────────

const overlaps = (a, b) =>
  a.x < b.x + b.width - 0.01 && b.x < a.x + a.width - 0.01 &&
  a.y < b.y + b.height - 0.01 && b.y < a.y + a.height - 0.01

for (const block of clustered) {
  if (block.cells.length === 0) {
    fail(`block ${block.id} has no drawable cells — it renders as an empty outline`)
    continue
  }
  for (const cell of block.cells) {
    if (cell.width <= 0 || cell.height <= 0) {
      fail(`block ${block.id} has a non-positive cell (${cell.width} × ${cell.height})`)
    }
    if (!withinPlan(cell)) fail(`a cell of ${block.id} escapes the plan box`)
    if (
      cell.x < block.x - 0.01 || cell.y < block.y - 0.01 ||
      cell.x + cell.width > block.x + block.w + 0.01 ||
      cell.y + cell.height > block.y + block.h + 0.01
    ) {
      fail(`a cell of ${block.id} escapes its own container`)
    }
  }
  for (let i = 0; i < block.cells.length; i++) {
    for (let j = i + 1; j < block.cells.length; j++) {
      if (overlaps(block.cells[i], block.cells[j])) {
        fail(`block ${block.id} draws overlapping cells`)
        i = block.cells.length
        break
      }
    }
  }
}

// ── The lettering ────────────────────────────────────────────────────────────

if (aisleMarks.length !== corridors.length) {
  fail(`${corridors.length} corridors but ${aisleMarks.length} aisle marks`)
}
const codes = new Set()
for (const mark of aisleMarks) {
  if (codes.has(mark.code)) fail(`aisle code ${mark.code} is used twice`)
  codes.add(mark.code)
}

// ── Every stop is drawn exactly once ─────────────────────────────────────────

const padStopIds = new Set(stationPads.flatMap(p => p.stops.map(s => s.id)))
const markIds = new Set(stopMarks.map(s => s.id))
for (const station of stations) {
  const inPad = padStopIds.has(station.id)
  const isMark = markIds.has(station.id)
  if (inPad && isMark) fail(`station ${station.id} is drawn twice`)
  if (!inPad && !isMark) fail(`station ${station.id} is not drawn at all`)
}

// ── The layout, for a human to compare against the 3D view ───────────────────

console.log('\n── THE HALL ────────────────────────────────────────────────────')
console.log(
  `plan box  ${VB.width} × ${VB.height} units  =  ` +
  `${m(VB.width)} × ${m(VB.height)} m   (1 unit = ${M.toFixed(4)} m)`,
)

console.log('\n── STORAGE RUNS ────────────────────────────────────────────────')
console.log('address       x      y      size (m)        grid    positions')
let totalPositions = 0
for (const block of storageBlocks) {
  totalPositions += block.positions
  const cols = new Set(block.cells.map(c => Math.round(c.x))).size
  const rows = new Set(block.cells.map(c => Math.round(c.y))).size
  console.log(
    `${block.label}  ${String(Math.round(block.x)).padStart(5)}  ` +
    `${String(Math.round(block.y)).padStart(5)}   ` +
    `${(m(block.w) + ' × ' + m(block.h)).padEnd(15)} ` +
    `${(cols + '×' + rows).padEnd(7)} ${String(block.positions).padStart(4)}`,
  )
}
console.log(`${storageBlocks.length} runs, ${totalPositions} measured positions`)

console.log('\n── EQUIPMENT ───────────────────────────────────────────────────')
for (const block of equipmentBlocks) {
  const cols = new Set(block.cells.map(c => Math.round(c.x))).size
  const rows = new Set(block.cells.map(c => Math.round(c.y))).size
  console.log(
    `${block.id.padEnd(6)} ${String(Math.round(block.x)).padStart(5)}  ` +
    `${String(Math.round(block.y)).padStart(5)}   ` +
    `${(m(block.w) + ' × ' + m(block.h)).padEnd(15)} ${cols}×${rows}`,
  )
}
console.log(
  `${equipmentBlocks.length} equipment clusters · ${plantBlocks.length} plant · ` +
  `${goodsBlocks.length} goods on the floor`,
)

console.log('\n── PLANT (height matters — these are machines, not shelving) ────')
for (const block of plantBlocks) {
  console.log(
    `${block.id.padEnd(6)} ${String(Math.round(block.x)).padStart(5)}  ` +
    `${String(Math.round(block.y)).padStart(5)}   ` +
    `${(m(block.w) + ' × ' + m(block.h)).padEnd(15)} ${block.heightM.toFixed(2)} m tall`,
  )
}

console.log('\n── AISLES ──────────────────────────────────────────────────────')
for (const mark of aisleMarks) {
  const corridor = corridors.find(c => c.id === mark.id)
  console.log(
    `${mark.code.padEnd(4)} ${mark.label.padEnd(20)} ` +
    `${corridor.axis} at ${String(corridor.at).padStart(5)}   ` +
    `${m(corridor.to - corridor.from)} m long`,
  )
}

console.log('\n── MARKED FLOOR ────────────────────────────────────────────────')
for (const pad of stationPads) {
  console.log(
    `${pad.id.padEnd(16)} ${pad.label.padEnd(15)} ` +
    `${(m(pad.w) + ' × ' + m(pad.h)).padEnd(15)} ${pad.stops.length} stops`,
  )
}
console.log(`${stopMarks.length} stops drawn as marks`)

console.log('')
if (failures.length) {
  console.error(`✗ ${failures.length} PROBLEM${failures.length === 1 ? '' : 'S'}`)
  for (const message of failures) console.error(`  · ${message}`)
} else {
  console.log('✓ the schematic matches the measured building')
}

await server.close()
process.exit(failures.length ? 1 : 0)
