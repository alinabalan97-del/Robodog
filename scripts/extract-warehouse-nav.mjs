/**
 * scripts/extract-warehouse-nav.mjs
 *
 * Derives a NAVIGATION MAP from the warehouse GLB's raw geometry.
 *
 *   node scripts/extract-warehouse-nav.mjs
 *
 * The model has no names, so nothing can be identified semantically. But every
 * triangle is real, and a robot does not need to know that a mesh is "Rack A12"
 * — it needs to know it cannot drive through it. That is inferable, and this
 * script infers it.
 *
 * METHOD
 *   1. Decode every POSITION accessor and transform it to world space.
 *   2. Keep only geometry in the COLLISION BAND — the height range a ground
 *      robot would actually strike. Floor slabs and roof are excluded by height,
 *      which is why no name is needed to ignore them.
 *   3. Rasterise that geometry into a top-down occupancy grid.
 *   4. Distance-transform the free cells to get CLEARANCE — how far each point is
 *      from the nearest obstacle. Clearance is what makes aisles findable: an
 *      aisle is a ridge of locally-maximal clearance running between two racks.
 *   5. Emit the grid so the runtime can plan paths on it.
 *
 * Output: src/data/warehouseNav.ts (generated — never hand-edit).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const MODEL = resolve(here, '../public/models/ImageToStl.com_warehouse6 (2).glb')
const OUT = resolve(here, '../src/data/warehouseNav.ts')

/** Metres. A ground robot strikes anything between its underside and its roof. */
const BAND_MIN = 0.25
const BAND_MAX = 1.90
/** Grid resolution, metres. */
const CELL = 0.12
/** Half-width of the largest robot, metres — the clearance a path must keep. */
const ROBOT_RADIUS = 0.38

// ── Read GLB ─────────────────────────────────────────────────────────────────
const buf = readFileSync(MODEL)
if (buf.toString('utf8', 0, 4) !== 'glTF') throw new Error('not a GLB')
const jsonLen = buf.readUInt32LE(12)
const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen))
const BIN = 20 + jsonLen + 8 // header + json chunk + bin chunk header

// ── Matrices ─────────────────────────────────────────────────────────────────
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
function multiply (a, b) {
  const o = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]
    o[c * 4 + r] = s
  }
  return o
}
function localMatrix (n) {
  if (n.matrix) return n.matrix
  const [tx, ty, tz] = n.translation ?? [0, 0, 0]
  const [qx, qy, qz, qw] = n.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = n.scale ?? [1, 1, 1]
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz
  const xx = qx * x2, xy = qx * y2, xz = qx * z2
  const yy = qy * y2, yz = qy * z2, zz = qz * z2
  const wx = qw * x2, wy = qw * y2, wz = qw * z2
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ]
}

/** Decode a POSITION accessor, honouring byteStride. */
function readPositions (accessorIndex) {
  const acc = gltf.accessors[accessorIndex]
  if (!acc || acc.type !== 'VEC3' || acc.componentType !== 5126) return null
  const view = gltf.bufferViews[acc.bufferView]
  const stride = view.byteStride || 12
  const base = BIN + (view.byteOffset ?? 0) + (acc.byteOffset ?? 0)
  const out = new Float32Array(acc.count * 3)
  for (let i = 0; i < acc.count; i++) {
    const o = base + i * stride
    out[i * 3] = buf.readFloatLE(o)
    out[i * 3 + 1] = buf.readFloatLE(o + 4)
    out[i * 3 + 2] = buf.readFloatLE(o + 8)
  }
  return out
}

function readIndices (accessorIndex) {
  const acc = gltf.accessors[accessorIndex]
  if (!acc) return null
  const view = gltf.bufferViews[acc.bufferView]
  const base = BIN + (view.byteOffset ?? 0) + (acc.byteOffset ?? 0)
  const out = new Uint32Array(acc.count)
  for (let i = 0; i < acc.count; i++) {
    out[i] = acc.componentType === 5125 ? buf.readUInt32LE(base + i * 4)
      : acc.componentType === 5123 ? buf.readUInt16LE(base + i * 2)
        : buf.readUInt8(base + i)
  }
  return out
}

// ── Pass 1: world-space extents ──────────────────────────────────────────────
const lo = [Infinity, Infinity, Infinity]
const hi = [-Infinity, -Infinity, -Infinity]
const drawables = []

function walk (index, parent) {
  const node = gltf.nodes[index]
  if (!node) return
  const world = multiply(parent, localMatrix(node))
  if (node.mesh !== undefined) {
    for (const prim of gltf.meshes[node.mesh]?.primitives ?? []) {
      if (prim.attributes?.POSITION === undefined) continue
      drawables.push({ prim, world })
      const acc = gltf.accessors[prim.attributes.POSITION]
      if (acc?.min && acc?.max) {
        for (const c of [acc.min, acc.max]) {
          const p = [
            world[0] * c[0] + world[4] * c[1] + world[8] * c[2] + world[12],
            world[1] * c[0] + world[5] * c[1] + world[9] * c[2] + world[13],
            world[2] * c[0] + world[6] * c[1] + world[10] * c[2] + world[14],
          ]
          for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]) }
        }
      }
    }
  }
  for (const c of node.children ?? []) walk(c, world)
}
for (const r of gltf.scenes?.[0]?.nodes ?? []) walk(r, identity())

const originX = lo[0]
const originZ = lo[2]
const cols = Math.ceil((hi[0] - lo[0]) / CELL)
const rows = Math.ceil((hi[2] - lo[2]) / CELL)
const occ = new Uint8Array(cols * rows)

console.log(`hull ${(hi[0] - lo[0]).toFixed(2)} x ${(hi[1] - lo[1]).toFixed(2)} x ${(hi[2] - lo[2]).toFixed(2)}`)
console.log(`grid ${cols} x ${rows} @ ${CELL}m`)

// ── Pass 2: rasterise the collision band ─────────────────────────────────────
let triangles = 0
let banded = 0

function mark (x, z) {
  const cx = Math.floor((x - originX) / CELL)
  const cz = Math.floor((z - originZ) / CELL)
  if (cx < 0 || cz < 0 || cx >= cols || cz >= rows) return
  occ[cz * cols + cx] = 1
}

for (const { prim, world } of drawables) {
  const pos = readPositions(prim.attributes.POSITION)
  if (!pos) continue
  const idx = prim.indices !== undefined ? readIndices(prim.indices) : null
  const count = idx ? idx.length : pos.length / 3

  const wx = (i) => world[0] * pos[i * 3] + world[4] * pos[i * 3 + 1] + world[8] * pos[i * 3 + 2] + world[12]
  const wy = (i) => world[1] * pos[i * 3] + world[5] * pos[i * 3 + 1] + world[9] * pos[i * 3 + 2] + world[13]
  const wz = (i) => world[2] * pos[i * 3] + world[6] * pos[i * 3 + 1] + world[10] * pos[i * 3 + 2] + world[14]

  for (let t = 0; t + 2 < count; t += 3) {
    const a = idx ? idx[t] : t
    const b = idx ? idx[t + 1] : t + 1
    const c = idx ? idx[t + 2] : t + 2
    triangles++
    const ys = [wy(a), wy(b), wy(c)]
    // A triangle blocks a robot if ANY part of it lies inside the band.
    if (Math.max(...ys) < BAND_MIN || Math.min(...ys) > BAND_MAX) continue
    banded++
    const xs = [wx(a), wx(b), wx(c)]
    const zs = [wz(a), wz(b), wz(c)]
    // Sample the triangle densely enough that no cell-sized hole survives.
    const extent = Math.max(...xs) - Math.min(...xs) + Math.max(...zs) - Math.min(...zs)
    const steps = Math.min(24, Math.max(2, Math.ceil(extent / CELL)))
    for (let i = 0; i <= steps; i++) {
      for (let j = 0; i + j <= steps; j++) {
        const u = i / steps, v = j / steps, w = 1 - u - v
        mark(xs[0] * w + xs[1] * u + xs[2] * v, zs[0] * w + zs[1] * u + zs[2] * v)
      }
    }
  }
}

const blocked = occ.reduce((n, v) => n + v, 0)
console.log(`triangles ${triangles}, in band ${banded}`)
console.log(`occupied ${blocked} / ${cols * rows} cells (${((blocked / (cols * rows)) * 100).toFixed(1)}%)`)

// ── Pass 3: clearance (two-pass chamfer distance transform) ──────────────────
const INF = 1e9
const dist = new Float32Array(cols * rows).fill(INF)
for (let i = 0; i < occ.length; i++) if (occ[i]) dist[i] = 0
const D1 = 1, D2 = Math.SQRT2
for (let z = 0; z < rows; z++) for (let x = 0; x < cols; x++) {
  const i = z * cols + x
  let d = dist[i]
  if (x > 0) d = Math.min(d, dist[i - 1] + D1)
  if (z > 0) d = Math.min(d, dist[i - cols] + D1)
  if (x > 0 && z > 0) d = Math.min(d, dist[i - cols - 1] + D2)
  if (x < cols - 1 && z > 0) d = Math.min(d, dist[i - cols + 1] + D2)
  dist[i] = d
}
for (let z = rows - 1; z >= 0; z--) for (let x = cols - 1; x >= 0; x--) {
  const i = z * cols + x
  let d = dist[i]
  if (x < cols - 1) d = Math.min(d, dist[i + 1] + D1)
  if (z < rows - 1) d = Math.min(d, dist[i + cols] + D1)
  if (x < cols - 1 && z < rows - 1) d = Math.min(d, dist[i + cols + 1] + D2)
  if (x > 0 && z < rows - 1) d = Math.min(d, dist[i + cols - 1] + D2)
  dist[i] = d
}

// Clearance in metres, capped so one byte per cell is enough to ship.
const clearance = new Uint8Array(cols * rows)
let navigable = 0
let maxClear = 0
for (let i = 0; i < dist.length; i++) {
  const m = dist[i] * CELL
  maxClear = Math.max(maxClear, m)
  clearance[i] = Math.min(255, Math.round(m * 20)) // 0.05 m per unit
  if (m >= ROBOT_RADIUS) navigable++
}
console.log(`navigable ${navigable} cells (${((navigable / (cols * rows)) * 100).toFixed(1)}%), max clearance ${maxClear.toFixed(2)}m`)

// Histogram, so the shape of the free space is visible in the log.
const buckets = [0.2, 0.4, 0.6, 1.0, 1.5, 2.0, 3.0, 99]
let prev = 0
for (const b of buckets) {
  let n = 0
  for (let i = 0; i < dist.length; i++) { const m = dist[i] * CELL; if (m > prev && m <= b) n++ }
  console.log(`  clearance ${prev.toFixed(1)}–${b === 99 ? '∞' : b.toFixed(1)}m: ${n}`)
  prev = b
}

// ── Emit ─────────────────────────────────────────────────────────────────────
const file = `/**
 * src/data/warehouseNav.ts
 *
 * ⚠️ GENERATED FILE — DO NOT EDIT BY HAND.
 * Produced by scripts/extract-warehouse-nav.mjs from the warehouse GLB.
 *
 * A navigation map inferred from raw geometry, with no reliance on names. Cells
 * are top-down, row-major from (originX, originZ), \`cell\` metres square.
 *
 * \`clearance[i]\` is the distance from that cell to the nearest obstacle, in
 * units of 0.05 m (so 20 = 1 m), capped at 255. A cell is drivable for a robot of
 * radius r when \`clearance[i] * 0.05 >= r\`. That single field is enough to plan
 * paths that cannot pass through racking, and its ridges ARE the aisles.
 *
 * Obstacles were taken as any triangle intersecting ${BAND_MIN}–${BAND_MAX} m above the
 * floor — the height band a ground robot strikes. Floor and roof are excluded by
 * height rather than by name, which is why this works on an unnamed model.
 */

export const warehouseNav = {
  originX: ${originX.toFixed(4)},
  originZ: ${originZ.toFixed(4)},
  cell: ${CELL},
  cols: ${cols},
  rows: ${rows},
  /** Metres per clearance unit. */
  clearanceScale: 0.05,
  bandMin: ${BAND_MIN},
  bandMax: ${BAND_MAX},
  clearance: new Uint8Array([${clearance.join(',')}]),
} as const
`

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, file, 'utf8')
console.log(`-> src/data/warehouseNav.ts`)
