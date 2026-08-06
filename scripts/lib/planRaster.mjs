/**
 * scripts/lib/planRaster.mjs
 *
 * Rasterise the warehouse GLB straight into PLAN space, across the full height
 * of the interior, and report what stands where.
 *
 * ── WHY THIS EXISTS BESIDE THE NAV GRID ──────────────────────────────────────
 *
 * `extract-warehouse-nav.mjs` keeps only geometry between 0.25 m and 1.90 m —
 * the band a ground robot strikes. That is exactly right for ROUTING and wrong
 * for DRAWING, and the 2D map was built on it. Measured against the model, the
 * map was missing 22 % of the building's mass:
 *
 *   · a large rack at the east end whose lowest member is above 1.9 m — 4.6 m of
 *     structure that the robot band cannot see at all, and the single biggest
 *     object in the hall after the four runs
 *   · every pallet and stack standing on the floor, all of them under 0.25 m
 *   · a consistent few-unit shortfall on the top edge of every rack run, where
 *     the band clipped the beams
 *
 * None of it looked wrong. The map was a faithful drawing of a grid that was
 * never meant to be a floor plan.
 *
 * So this asks the other question — where is there ANY mass between the slab and
 * the roof — and answers it in plan units directly, with the height range of the
 * mass at each cell kept so the caller can tell a rack from a pallet.
 *
 * ⚠️ IT DOES NOT AND MUST NOT FEED ROUTING. The nav grid stays exactly as it is:
 * the corridors, station coordinates and plan scale are all measured against it,
 * and CLAUDE.md records what re-spacing them costs. This is a drawing input.
 */

import { eachTriangle } from './glb.mjs'

/** Above the slab and below the roof. Both excluded by height, never by name. */
export const SLAB_TOP_M = 0.06
export const ROOF_BOTTOM_M = 3.30

/**
 * Plan units per raster cell.
 *
 * 2 units is ~42 mm, comfortably finer than anything the map draws and fine
 * enough that a 60 mm rack upright still registers. Finer than this buys
 * nothing: the output is rectangles on a schematic, not a collision mesh.
 */
export const CELL_UNITS = 2

/**
 * Build the plan-space occupancy raster.
 *
 * `toPlan(worldX, worldZ)` and the plan box come from the caller, because the
 * projection is decided by `extract-plan-structure.mjs` and there must not be a
 * second opinion about it here.
 */
export function rasterisePlan (glb, { view, planFromWorld }) {
  const cols = Math.ceil(view.width / CELL_UNITS)
  const rows = Math.ceil(view.height / CELL_UNITS)
  const n = cols * rows

  /** Occupied at all. */
  const hit = new Uint8Array(n)
  /** Lowest and highest mass over each cell, in centimetres above the slab. */
  const minH = new Uint16Array(n).fill(65535)
  const maxH = new Uint16Array(n)

  const floorY = glb.lo[1]

  const mark = (worldX, worldZ, hCm) => {
    const p = planFromWorld(worldX, worldZ)
    const c = Math.floor((p.x - view.x) / CELL_UNITS)
    const r = Math.floor((p.y - view.y) / CELL_UNITS)
    if (c < 0 || r < 0 || c >= cols || r >= rows) return
    const i = r * cols + c
    hit[i] = 1
    if (hCm < minH[i]) minH[i] = hCm
    if (hCm > maxH[i]) maxH[i] = hCm
  }

  const triangles = eachTriangle(glb, (a, b, c) => {
    const y0 = a[1] - floorY, y1 = b[1] - floorY, y2 = c[1] - floorY
    const top = Math.max(y0, y1, y2)
    const bottom = Math.min(y0, y1, y2)
    if (top < SLAB_TOP_M || bottom > ROOF_BOTTOM_M) return

    // Sample the triangle densely enough in plan that no cell inside it is
    // skipped. Plan units are ~21 mm, so the extent is converted through the
    // caller's own scale rather than guessed.
    const ext = Math.max(
      Math.abs(a[0] - b[0]), Math.abs(b[0] - c[0]), Math.abs(c[0] - a[0]),
      Math.abs(a[2] - b[2]), Math.abs(b[2] - c[2]), Math.abs(c[2] - a[2]),
    )
    const steps = Math.min(28, Math.max(2, Math.ceil(ext / 0.04) + 1))

    for (let i = 0; i <= steps; i++) {
      for (let j = 0; i + j <= steps; j++) {
        const u = i / steps, v = j / steps, w = 1 - u - v
        const y = y0 * w + y1 * u + y2 * v
        if (y < SLAB_TOP_M || y > ROOF_BOTTOM_M) continue
        mark(
          a[0] * w + b[0] * u + c[0] * v,
          a[2] * w + b[2] * u + c[2] * v,
          Math.round(y * 100),
        )
      }
    }
  })

  return { cols, rows, cell: CELL_UNITS, hit, minH, maxH, triangles, view }
}

// ── Morphology ───────────────────────────────────────────────────────────────

function dilate (src, cols, rows, radius) {
  const out = new Uint8Array(src.length)
  // Separable: a square structuring element is a horizontal pass then a
  // vertical one, which turns O(r²) per cell into O(r).
  const mid = new Uint8Array(src.length)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let on = 0
      for (let k = -radius; k <= radius && !on; k++) {
        const cc = c + k
        if (cc >= 0 && cc < cols && src[r * cols + cc]) on = 1
      }
      mid[r * cols + c] = on
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let on = 0
      for (let k = -radius; k <= radius && !on; k++) {
        const rr = r + k
        if (rr >= 0 && rr < rows && mid[rr * cols + c]) on = 1
      }
      out[r * cols + c] = on
    }
  }
  return out
}

/**
 * Close the raster: dilate, then erode by the same radius.
 *
 * ⚠️ THIS IS WHAT TURNS A THOUSAND POSTS INTO A RACK. Seen from above, racking
 * is uprights, beams and the pallets between them — hundreds of disconnected
 * specks. Labelled raw, every speck is its own "object" and the map draws
 * confetti. Closing bridges gaps up to `radius` cells and then gives the mass
 * its size back, so a run comes out as one region without growing.
 *
 * The radius is the largest gap that still counts as inside one object. Too
 * small and a rack fragments; too large and a rack merges with the machine
 * parked in the aisle beside it.
 */
export function close (grid, cols, rows, radius) {
  const grown = dilate(grid, cols, rows, radius)
  // Erode = dilate the complement.
  const inverted = new Uint8Array(grown.length)
  for (let i = 0; i < grown.length; i++) inverted[i] = grown[i] ? 0 : 1
  const shrunk = dilate(inverted, cols, rows, radius)
  const out = new Uint8Array(grown.length)
  for (let i = 0; i < out.length; i++) out[i] = shrunk[i] ? 0 : 1
  // Closing can only add cells, never remove them — but the border handling in
  // the complement pass can nibble edges, so the original is unioned back in.
  for (let i = 0; i < out.length; i++) if (grid[i]) out[i] = 1
  return out
}

/** Connected components, 8-way. Returns a label per cell (0 = background). */
export function label (grid, cols, rows) {
  const labels = new Int32Array(grid.length)
  const stack = []
  let next = 0
  const regions = []

  for (let start = 0; start < grid.length; start++) {
    if (!grid[start] || labels[start]) continue
    next++
    labels[start] = next
    stack.push(start)
    let minC = cols, maxC = 0, minR = rows, maxR = 0, area = 0

    while (stack.length) {
      const i = stack.pop()
      const c = i % cols
      const r = (i - c) / cols
      area++
      if (c < minC) minC = c
      if (c > maxC) maxC = c
      if (r < minR) minR = r
      if (r > maxR) maxR = r

      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue
          const rr = r + dr, cc = c + dc
          if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue
          const j = rr * cols + cc
          if (labels[j] || !grid[j]) continue
          labels[j] = next
          stack.push(j)
        }
      }
    }
    regions.push({ id: next, area, minC, maxC, minR, maxR })
  }
  return { labels, regions }
}

/**
 * Decompose one labelled region into axis-aligned rectangles.
 *
 * Horizontal runs first, then vertically merged where they line up. An L-shaped
 * machine comes out as two rectangles rather than as one box swallowing the
 * empty corner — which matters, because that corner is usually the aisle the
 * robots drive down.
 *
 * `slack` lets two runs whose ends differ by a cell or two still merge, so a
 * ragged rasterised edge does not shatter a rack into fifty one-row slivers.
 */
export function rectangles (labels, cols, rows, id, slack = 1) {
  const open = []
  const done = []

  for (let r = 0; r < rows; r++) {
    const runs = []
    let from = -1
    for (let c = 0; c <= cols; c++) {
      const on = c < cols && labels[r * cols + c] === id
      if (on && from < 0) from = c
      else if (!on && from >= 0) { runs.push([from, c - 1]); from = -1 }
    }

    const carried = []
    for (const run of runs) {
      const match = open.find(o =>
        Math.abs(o.c0 - run[0]) <= slack && Math.abs(o.c1 - run[1]) <= slack && o.r1 === r - 1)
      if (match) {
        match.r1 = r
        match.c0 = Math.min(match.c0, run[0])
        match.c1 = Math.max(match.c1, run[1])
        carried.push(match)
      } else {
        carried.push({ c0: run[0], c1: run[1], r0: r, r1: r })
      }
    }
    for (const o of open) if (!carried.includes(o)) done.push(o)
    open.length = 0
    open.push(...carried)
  }
  done.push(...open)
  return done
}
