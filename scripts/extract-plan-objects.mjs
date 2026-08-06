/**
 * scripts/extract-plan-objects.mjs
 *
 * ── EVERY OBJECT IN THE BUILDING, AS THE 2D MAP SHOULD DRAW IT ───────────────
 *
 *   node scripts/extract-plan-objects.mjs
 *
 * Third and last step of the layout chain:
 *
 *   extract-warehouse-nav.mjs      GLB → clearance grid   (0.25–1.90 m · ROUTING)
 *   extract-plan-structure.mjs     grid → runs, aisles, crossings   (POLICY)
 *   extract-plan-objects.mjs       GLB → every object      (0.06–3.30 m · DRAWING)
 *
 * ⚠️ IT READS THE MODEL, NOT THE NAV GRID, AND THAT IS THE ENTIRE POINT. The nav
 * grid keeps only what a ground robot can hit, so the 2D map built on it was
 * missing 22 % of the building's mass — measured, not estimated, by
 * `audit-plan-coverage.mjs`:
 *
 *   · the east rack, 4.6 m of structure whose lowest member is above 1.9 m
 *   · every pallet standing on the floor, all under 0.25 m
 *   · the top few units of every rack run, clipped by the band
 *
 * Routing still uses the nav grid and must keep using it. This output is drawn
 * and nothing else — no station, corridor or plan coordinate is derived from it.
 *
 * ── WHAT IT EMITS ────────────────────────────────────────────────────────────
 *
 * `src/data/warehouseObjects.ts`: a flat list of rectangles, each with the
 * height range of the mass above it and a class inferred from that height.
 * Grouping them into addressed storage runs is `src/data/floorSchematic.ts`'s
 * job — geometry here, presentation there.
 *
 * ⚠️ CLASSES ARE INFERRED FROM HEIGHT, AND THE MODEL NAMES NOTHING. `rack` means
 * "tall enough to be racking", not "the author called this a rack". Where the
 * inference is weak the class is `plant`, which draws as an unnamed object —
 * honest about what a measurement can and cannot tell you.
 */

import { writeFileSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openGlb } from './lib/glb.mjs'
import { rasterisePlan, close, label, rectangles, SLAB_TOP_M, ROOF_BOTTOM_M } from './lib/planRaster.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const MODEL = resolve(here, '../public/models/ImageToStl.com_warehouse6 (2).glb')
const STRUCTURE = resolve(here, '../src/data/warehouseStructure.ts')
const LAYOUT = resolve(here, '../src/data/warehouseLayout.ts')
const OUT = resolve(here, '../src/data/warehouseObjects.ts')

/**
 * Closing radius, in raster cells (2 plan units each) — so 5 cells is ~0.21 m.
 *
 * ⚠️ TUNED, AND BOTH FAILURES ARE VISIBLE. Below ~3 the east rack shatters into
 * a hundred shelf fragments and the map draws confetti. Above ~8 the rack runs
 * bridge the 1.2 m pick aisles between them and the building comes out as two
 * enormous slabs with no aisles at all — which is precisely the class of mistake
 * that had robots rendered driving through solid mass before the layout was
 * measured.
 */
const CLOSE_RADIUS = 5

/** Ignore anything smaller than this, in plan units². ~0.2 m² — half a pallet. */
const MIN_AREA = 460

/** Drop a rectangle thinner than this in either axis; it is rasteriser fringe. */
const MIN_SIDE = 6

/**
 * Height thresholds, centimetres above the slab.
 *
 * `rack` is anything reaching above the top of the tallest machine in the fleet
 * (the 2.05 m forklift): at that height an object is structure, not equipment.
 * `goods` is anything topping out below the height of a loaded pallet.
 */
const RACK_TOP_CM = 205
const GOODS_TOP_CM = 65

// ── The plan projection, read from the generated structure ───────────────────

const structureSrc = readFileSync(STRUCTURE, 'utf8')
const view = JSON.parse(structureSrc.match(/planViewBox = (\{[^}]*\})/)[1])
const unitsPerMetre = Number(structureSrc.match(/unitsPerMetre:\s*([0-9.]+)/)[1])

const layoutSrc = readFileSync(LAYOUT, 'utf8')
const hullBlock = layoutSrc.match(/warehouseHull = \{([\s\S]*?)\}/)[1]
const hullNum = k => Number(hullBlock.match(new RegExp(`${k}:\\s*(-?[0-9.]+)`))[1])
const hull = { x: hullNum('x'), z: hullNum('z'), width: hullNum('width'), depth: hullNum('depth') }

/** `WarehouseScene.clip.inset` — the fraction trimmed off each side. */
const INTERIOR_INSET = 0.04
const interior = {
  minX: hull.x + hull.width * INTERIOR_INSET,
  maxX: hull.x + hull.width * (1 - INTERIOR_INSET),
  minZ: hull.z + hull.depth * INTERIOR_INSET,
}

/**
 * World → plan. The inverse of `extract-plan-structure.mjs`'s `planXtoWorldZ` /
 * `planYtoWorldX`, written out rather than re-derived: plan x runs along the
 * building (world z) and plan y runs across it (world x, reversed).
 */
const planFromWorld = (worldX, worldZ) => ({
  x: view.x + (worldZ - interior.minZ) * unitsPerMetre,
  y: view.y + (interior.maxX - worldX) * unitsPerMetre,
})

// ── Rasterise ────────────────────────────────────────────────────────────────

console.log(`reading ${MODEL.split(/[\\/]/).pop()}`)
const glb = openGlb(MODEL)
console.log(
  `hull ${(glb.hi[0] - glb.lo[0]).toFixed(2)} × ${(glb.hi[1] - glb.lo[1]).toFixed(2)} × ` +
  `${(glb.hi[2] - glb.lo[2]).toFixed(2)} m   ·   band ${SLAB_TOP_M}–${ROOF_BOTTOM_M} m`,
)

const raster = rasterisePlan(glb, { view, planFromWorld })
console.log(`rasterised ${raster.triangles.toLocaleString()} triangles → ${raster.cols} × ${raster.rows} cells`)

const closed = close(raster.hit, raster.cols, raster.rows, CLOSE_RADIUS)
const { labels, regions } = label(closed, raster.cols, raster.rows)
console.log(`${regions.length} connected regions before filtering`)

// ── Regions → rectangles → objects ───────────────────────────────────────────

const CELL = raster.cell
const toPlanRect = r => ({
  x: view.x + r.c0 * CELL,
  y: view.y + r.r0 * CELL,
  w: (r.c1 - r.c0 + 1) * CELL,
  h: (r.r1 - r.r0 + 1) * CELL,
})

/** Height range of the REAL mass under a rectangle — closing must not invent it. */
function heightOf (r) {
  let lo = 65535
  let hi = 0
  let filled = 0
  let cells = 0
  for (let row = r.r0; row <= r.r1; row++) {
    for (let col = r.c0; col <= r.c1; col++) {
      const i = row * raster.cols + col
      cells++
      if (!raster.hit[i]) continue
      filled++
      if (raster.minH[i] < lo) lo = raster.minH[i]
      if (raster.maxH[i] > hi) hi = raster.maxH[i]
    }
  }
  return { lo: lo === 65535 ? 0 : lo, hi, fill: cells ? filled / cells : 0 }
}

const objects = []
let serial = 0

for (const region of regions) {
  if (region.area * CELL * CELL < MIN_AREA) continue

  for (const rect of rectangles(labels, raster.cols, raster.rows, region.id)) {
    const plan = toPlanRect(rect)
    if (plan.w < MIN_SIDE || plan.h < MIN_SIDE) continue
    if (plan.w * plan.h < MIN_AREA) continue

    const height = heightOf(rect)
    // A rectangle produced entirely by the closing pass, with no real mass under
    // it at all, is a bridge between two objects and not an object.
    if (height.fill < 0.12 || height.hi === 0) continue

    const kind = height.hi >= RACK_TOP_CM ? 'rack'
      : height.hi <= GOODS_TOP_CM ? 'goods'
        : 'plant'

    objects.push({
      id: `o-${++serial}`,
      kind,
      x: round(plan.x),
      y: round(plan.y),
      w: round(plan.w),
      h: round(plan.h),
      baseCm: height.lo,
      topCm: height.hi,
    })
  }
}

function round (n) { return Math.round(n * 1000) / 1000 }

objects.sort((a, b) => a.y - b.y || a.x - b.x)
objects.forEach((o, i) => { o.id = `o-${String(i + 1).padStart(3, '0')}` })

const byKind = objects.reduce((acc, o) => ({ ...acc, [o.kind]: (acc[o.kind] ?? 0) + 1 }), {})
const areaOf = k => objects.filter(o => o.kind === k)
  .reduce((s, o) => s + o.w * o.h, 0) / (unitsPerMetre ** 2)

console.log(`\n${objects.length} objects`)
for (const kind of ['rack', 'plant', 'goods']) {
  console.log(`  ${kind.padEnd(6)} ${String(byKind[kind] ?? 0).padStart(4)}   ${areaOf(kind).toFixed(1)} m² of floor`)
}

// ── Emit ─────────────────────────────────────────────────────────────────────

const body = objects
  .map(o => `  { id: '${o.id}', kind: '${o.kind}', x: ${o.x}, y: ${o.y}, w: ${o.w}, h: ${o.h}, baseCm: ${o.baseCm}, topCm: ${o.topCm} },`)
  .join('\n')

writeFileSync(OUT, `/**
 * src/data/warehouseObjects.ts
 *
 * ⚠️ GENERATED FILE — DO NOT EDIT BY HAND.
 * Produced by scripts/extract-plan-objects.mjs from the warehouse GLB.
 * Re-run that script when the model changes.
 *
 * EVERY OBJECT STANDING ON THE FLOOR, measured across the FULL height of the
 * interior (${SLAB_TOP_M}–${ROOF_BOTTOM_M} m) rather than through the ${'0.25'}–${'1.9'} m band a robot
 * strikes. That distinction is the reason this file exists: the 2D map used to
 * be drawn from the navigation grid, which cannot see the east rack (its lowest
 * member is above 1.9 m), any pallet on the floor, or the top of a rack beam —
 * 22 % of the building's mass, none of which looked missing.
 *
 * ⚠️ NOTHING HERE FEEDS ROUTING. Corridors, stations and the plan scale are all
 * measured against \`warehouseNav.ts\` and must stay that way. This is a drawing
 * input, consumed by \`src/data/floorSchematic.ts\`.
 *
 * \`kind\` is inferred from height and nothing else — the model names nothing:
 *   rack   tops out above ${RACK_TOP_CM / 100} m, taller than any machine in the fleet
 *   plant  in between: benches, conveyors, machines, transfer stands
 *   goods  tops out below ${GOODS_TOP_CM / 100} m — a pallet or a stack on the floor
 */

export interface WarehouseObject {
  id: string
  kind: 'rack' | 'plant' | 'goods'
  /** Plan units — the same space the fleet, the stations and the 2D map use. */
  x: number
  y: number
  w: number
  h: number
  /** Lowest and highest mass over this rectangle, centimetres above the slab. */
  baseCm: number
  topCm: number
}

export const warehouseObjects: WarehouseObject[] = [
${body}
]
`)

console.log(`\nwrote ${OUT}`)
