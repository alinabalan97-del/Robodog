/**
 * scripts/extract-warehouse-layout.mjs
 *
 * Derives the 2D layout from the 3D warehouse GLB, so the two views cannot
 * describe different buildings.
 *
 *   node scripts/extract-warehouse-layout.mjs
 *
 * Writes src/data/warehouseLayout.ts. Re-run it whenever the model changes —
 * the output is generated, never hand-edited.
 *
 * HOW IT READS THE MODEL WITHOUT LOADING IT. A GLB begins with a JSON chunk
 * describing the whole scene graph, and every mesh's POSITION accessor carries
 * `min`/`max`. Composing each node's world matrix and transforming those eight
 * corners yields a true world-space AABB per node — exact, and without touching
 * the 132 MB binary chunk.
 *
 * ⚠️ WHAT IT CANNOT RECOVER. AABBs are all this model affords. It carries no
 * names, one material, and no object semantics, so nothing here can tell a rack
 * from a wall from a mezzanine slab. This produces the true FOOTPRINT and the
 * true POSITIONS; classifying those boxes into racks, aisles, chargers and
 * pick/drop points is a judgement a person has to make once, against the
 * rendered model. `role` is where that judgement is recorded.
 */

import { openSync, readSync, closeSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const MODEL = resolve(here, '../public/models/ImageToStl.com_warehouse6 (2).glb')
const OUT = resolve(here, '../src/data/warehouseLayout.ts')

// ── Read the JSON chunk ──────────────────────────────────────────────────────
const fd = openSync(MODEL, 'r')
const head = Buffer.alloc(20)
readSync(fd, head, 0, 20, 0)
if (head.toString('utf8', 0, 4) !== 'glTF') throw new Error('not a GLB')
const chunkLength = head.readUInt32LE(12)
const jsonChunk = Buffer.alloc(chunkLength)
readSync(fd, jsonChunk, 0, chunkLength, 20)
closeSync(fd)
const gltf = JSON.parse(jsonChunk.toString('utf8'))

// ── Minimal column-major mat4 ────────────────────────────────────────────────
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

function multiply (a, b) {
  const out = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k]
      out[c * 4 + r] = sum
    }
  }
  return out
}

function localMatrix (node) {
  if (node.matrix) return node.matrix
  const [tx, ty, tz] = node.translation ?? [0, 0, 0]
  const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = node.scale ?? [1, 1, 1]
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

const transform = (m, [x, y, z]) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14],
]

// ── Walk the graph, collecting world AABBs ───────────────────────────────────
const boxes = []

function walk (index, parentMatrix) {
  const node = gltf.nodes[index]
  if (!node) return
  const world = multiply(parentMatrix, localMatrix(node))

  if (node.mesh !== undefined) {
    const lo = [Infinity, Infinity, Infinity]
    const hi = [-Infinity, -Infinity, -Infinity]
    for (const primitive of gltf.meshes[node.mesh]?.primitives ?? []) {
      const accessor = gltf.accessors[primitive.attributes?.POSITION]
      if (!accessor?.min || !accessor?.max) continue
      const [ax, ay, az] = accessor.min
      const [bx, by, bz] = accessor.max
      const corners = [
        [ax, ay, az], [bx, ay, az], [ax, by, az], [ax, ay, bz],
        [bx, by, az], [bx, ay, bz], [ax, by, bz], [bx, by, bz],
      ]
      for (const corner of corners) {
        const p = transform(world, corner)
        for (let k = 0; k < 3; k++) {
          lo[k] = Math.min(lo[k], p[k])
          hi[k] = Math.max(hi[k], p[k])
        }
      }
    }
    if (Number.isFinite(lo[0])) {
      boxes.push({ id: node.name ?? `node-${index}`, lo, hi })
    }
  }

  for (const child of node.children ?? []) walk(child, world)
}

for (const root of gltf.scenes?.[0]?.nodes ?? []) walk(root, identity())

// ── Classify what can be classified from geometry alone ──────────────────────
const hull = { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] }
for (const box of boxes) {
  for (let k = 0; k < 3; k++) {
    hull.lo[k] = Math.min(hull.lo[k], box.lo[k])
    hull.hi[k] = Math.max(hull.hi[k], box.hi[k])
  }
}
const span = [0, 1, 2].map(k => hull.hi[k] - hull.lo[k])

/**
 * Only three things are inferable without a human: a box covering nearly the
 * whole footprint at zero height is the SLAB; one covering nearly the whole
 * footprint with height is the SHELL; everything else is interior mass whose
 * purpose this model does not record.
 */
function classify (box) {
  const w = box.hi[0] - box.lo[0]
  const d = box.hi[2] - box.lo[2]
  const h = box.hi[1] - box.lo[1]
  const coverage = (w * d) / (span[0] * span[2])
  if (coverage > 0.9 && h < 0.1) return 'slab'
  if (coverage > 0.9) return 'shell'
  return 'structure'
}

const round = n => Math.round(n * 1000) / 1000
const entries = boxes
  .map(box => ({
    id: box.id,
    role: classify(box),
    x: round(box.lo[0]),
    z: round(box.lo[2]),
    w: round(box.hi[0] - box.lo[0]),
    d: round(box.hi[2] - box.lo[2]),
    y: round(box.lo[1]),
    h: round(box.hi[1] - box.lo[1]),
  }))
  .sort((a, b) => b.w * b.d - a.w * a.d)

const file = `/**
 * src/data/warehouseLayout.ts
 *
 * ⚠️ GENERATED FILE — DO NOT EDIT BY HAND.
 * Produced by scripts/extract-warehouse-layout.mjs from the warehouse GLB.
 * Re-run that script when the model changes.
 *
 * These are the REAL world-space bounds of every node in the 3D model, so the
 * 2D view can be drawn from the same geometry the 3D view renders rather than
 * from a separate drawing. Units are the model's own.
 *
 * The \`role\` field is inferred from geometry alone — a full-footprint box with
 * no height is the floor slab, a full-footprint box with height is the building
 * shell, and everything else is interior mass. The model records nothing about
 * what that mass IS, so nothing here claims to be a rack, a charger or a pick
 * station. Those need a person to label once, against the rendered model.
 */

export type WarehouseObjectRole = 'slab' | 'shell' | 'structure'

export interface WarehouseObject {
  /** Node name from the GLB. Meaningless in this export, but stable. */
  id: string
  role: WarehouseObjectRole
  /** Footprint, world units, top-down. x/z are the min corner. */
  x: number
  z: number
  w: number
  d: number
  /** Vertical extent, so the 2D view can drop anything above the cut line. */
  y: number
  h: number
}

/** Overall extents of the building, world units. */
export const warehouseHull = {
  x: ${round(hull.lo[0])},
  z: ${round(hull.lo[2])},
  width: ${round(span[0])},
  depth: ${round(span[2])},
  height: ${round(span[1])},
} as const

export const warehouseObjects: WarehouseObject[] = ${JSON.stringify(entries, null, 2)}
`

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, file, 'utf8')

console.log(`hull ${span.map(round).join(' x ')}  (w x h x d)`)
console.log(`${entries.length} objects -> src/data/warehouseLayout.ts`)
for (const role of ['slab', 'shell', 'structure']) {
  console.log(`  ${role}: ${entries.filter(e => e.role === role).length}`)
}
