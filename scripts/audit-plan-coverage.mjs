/**
 * scripts/audit-plan-coverage.mjs
 *
 * ── DOES THE 2D MAP SHOW EVERYTHING THAT IS ACTUALLY IN THE BUILDING? ─────────
 *
 *   node scripts/audit-plan-coverage.mjs
 *
 * `verify-schematic.mjs` checks the drawing against the EXTRACTED zones. This
 * checks the extracted zones against the MODEL — which is a different question,
 * and the one that matters when the map looks wrong beside the 3D view.
 *
 * ⚠️ THE NAV GRID IS NOT A FLOOR PLAN, AND THE 2D MAP WAS BUILT ON ONE.
 * `extract-warehouse-nav.mjs` keeps only geometry between 0.25 m and 1.90 m —
 * the band a ground robot strikes. That is exactly right for routing and wrong
 * for drawing: anything whose mass sits mostly ABOVE 1.9 m (upper rack beams,
 * overhead structure) or BELOW 0.25 m (floor plant, low stacks, kerbs) is
 * invisible to it. `extract-plan-structure.mjs` reads that grid, so the map
 * inherits the blind spots, and nothing about the result looks wrong — the map
 * is simply missing objects that are plainly there in the 3D scene.
 *
 * So this script goes back to the GLB and rasterises the FULL height of the
 * interior, in three bands, then asks how much of that mass the drawn schematic
 * actually covers.
 *
 * ── OUTPUT ───────────────────────────────────────────────────────────────────
 *
 * A numeric report, and two PNGs written beside the model in the scratch dir:
 *
 *   plan-coverage.png   the building's real top-down mass, banded by height,
 *                       with every drawn rectangle outlined over it
 *   plan-missing.png    only the mass no drawn rectangle covers
 *
 * The images are the point. A coverage percentage says how bad it is; the
 * pictures say WHERE, which is what a fix needs.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const MODEL = resolve(here, '../public/models/ImageToStl.com_warehouse6 (2).glb')
const OUTDIR = resolve(here, '../.audit')

/** Rasterising step, metres. Finer than the nav grid's 0.12 on purpose. */
const CELL = 0.06

/**
 * Height bands, metres above the slab.
 *
 * `floor` and `roof` are excluded by height rather than by name, the same way
 * the nav extractor does it — the model names nothing, so there is no other way.
 * The roof begins at 3.33 m (CLAUDE.md → Models are sized in metres).
 */
const FLOOR_TOP = 0.06
const NAV_MIN = 0.25
const NAV_MAX = 1.90
const ROOF_BOTTOM = 3.30

// ── Read the GLB ─────────────────────────────────────────────────────────────

const buf = readFileSync(MODEL)
if (buf.toString('utf8', 0, 4) !== 'glTF') throw new Error('not a GLB')
const jsonLen = buf.readUInt32LE(12)
const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen))
const BIN = 20 + jsonLen + 8

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
function readPositions (i) {
  const acc = gltf.accessors[i]
  if (!acc || acc.type !== 'VEC3' || acc.componentType !== 5126) return null
  const view = gltf.bufferViews[acc.bufferView]
  const stride = view.byteStride || 12
  const base = BIN + (view.byteOffset ?? 0) + (acc.byteOffset ?? 0)
  const out = new Float32Array(acc.count * 3)
  for (let k = 0; k < acc.count; k++) {
    const o = base + k * stride
    out[k * 3] = buf.readFloatLE(o)
    out[k * 3 + 1] = buf.readFloatLE(o + 4)
    out[k * 3 + 2] = buf.readFloatLE(o + 8)
  }
  return out
}
function readIndices (i) {
  const acc = gltf.accessors[i]
  if (!acc) return null
  const view = gltf.bufferViews[acc.bufferView]
  const base = BIN + (view.byteOffset ?? 0) + (acc.byteOffset ?? 0)
  const out = new Uint32Array(acc.count)
  for (let k = 0; k < acc.count; k++) {
    out[k] = acc.componentType === 5125 ? buf.readUInt32LE(base + k * 4)
      : acc.componentType === 5123 ? buf.readUInt16LE(base + k * 2)
        : buf.readUInt8(base + k)
  }
  return out
}

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

console.log(`model hull  ${(hi[0] - lo[0]).toFixed(2)} × ${(hi[1] - lo[1]).toFixed(2)} × ${(hi[2] - lo[2]).toFixed(2)} m`)
console.log(`floor at y = ${lo[1].toFixed(3)} m, roof at y = ${hi[1].toFixed(3)} m`)

// ── Rasterise, banded by height ──────────────────────────────────────────────

const originX = lo[0]
const originZ = lo[2]
const cols = Math.ceil((hi[0] - lo[0]) / CELL)
const rows = Math.ceil((hi[2] - lo[2]) / CELL)

/** Bit 1 = mass low, bit 2 = mass in the nav band, bit 4 = mass high. */
const occ = new Uint8Array(cols * rows)

const bandOf = y => {
  const h = y - lo[1]
  if (h < FLOOR_TOP || h > ROOF_BOTTOM) return 0
  if (h < NAV_MIN) return 1
  if (h <= NAV_MAX) return 2
  return 4
}

function mark (x, z, bit) {
  const c = Math.floor((x - originX) / CELL)
  const r = Math.floor((z - originZ) / CELL)
  if (c < 0 || r < 0 || c >= cols || r >= rows) return
  occ[r * cols + c] |= bit
}

let triangles = 0
for (const { prim, world } of drawables) {
  const pos = readPositions(prim.attributes.POSITION)
  if (!pos) continue
  const idx = prim.indices !== undefined ? readIndices(prim.indices) : null
  const count = idx ? idx.length : pos.length / 3

  for (let t = 0; t + 2 < count; t += 3) {
    triangles++
    const vs = []
    for (let k = 0; k < 3; k++) {
      const vi = (idx ? idx[t + k] : t + k) * 3
      const x = pos[vi], y = pos[vi + 1], z = pos[vi + 2]
      vs.push([
        world[0] * x + world[4] * y + world[8] * z + world[12],
        world[1] * x + world[5] * y + world[9] * z + world[13],
        world[2] * x + world[6] * y + world[10] * z + world[14],
      ])
    }
    // A triangle contributes to every band its vertical extent touches, which is
    // what makes a rack upright register at every height it passes through.
    const ys = vs.map(v => v[1])
    let bits = 0
    for (const b of [1, 2, 4]) {
      const [bLo, bHi] = b === 1 ? [FLOOR_TOP, NAV_MIN] : b === 2 ? [NAV_MIN, NAV_MAX] : [NAV_MAX, ROOF_BOTTOM]
      if (Math.max(...ys) - lo[1] >= bLo && Math.min(...ys) - lo[1] <= bHi) bits |= b
    }
    if (!bits) continue

    // Sample the triangle densely enough that no cell inside it is skipped.
    const ext = Math.max(
      Math.abs(vs[0][0] - vs[1][0]), Math.abs(vs[1][0] - vs[2][0]), Math.abs(vs[2][0] - vs[0][0]),
      Math.abs(vs[0][2] - vs[1][2]), Math.abs(vs[1][2] - vs[2][2]), Math.abs(vs[2][2] - vs[0][2]),
    )
    const steps = Math.min(32, Math.max(2, Math.ceil(ext / CELL) + 1))
    for (let a = 0; a <= steps; a++) {
      for (let b = 0; a + b <= steps; b++) {
        const u = a / steps, v = b / steps, w = 1 - u - v
        mark(
          vs[0][0] * w + vs[1][0] * u + vs[2][0] * v,
          vs[0][2] * w + vs[1][2] * u + vs[2][2] * v,
          bits,
        )
      }
    }
  }
}
console.log(`rasterised ${triangles.toLocaleString()} triangles at ${CELL} m`)

// ── The plan transform, exactly as extract-plan-structure.mjs computes it ─────

const layoutSrc = readFileSync(resolve(here, '../src/data/warehouseLayout.ts'), 'utf8')
const hullBlock = layoutSrc.match(/warehouseHull = \{([\s\S]*?)\}/)[1]
const hullNum = k => Number(hullBlock.match(new RegExp(`${k}:\\s*(-?[0-9.]+)`))[1])
const hull = { x: hullNum('x'), z: hullNum('z'), width: hullNum('width'), depth: hullNum('depth') }

const INTERIOR_INSET = 0.04
const interior = {
  minX: hull.x + hull.width * INTERIOR_INSET,
  maxX: hull.x + hull.width * (1 - INTERIOR_INSET),
  minZ: hull.z + hull.depth * INTERIOR_INSET,
  maxZ: hull.z + hull.depth * (1 - INTERIOR_INSET),
}

const server = await createServer({
  configFile: 'vite.config.mts',
  server: { middlewareMode: true },
  logLevel: 'error',
})
const structure = await server.ssrLoadModule('/src/data/warehouseStructure.ts')
const schematic = await server.ssrLoadModule('/src/data/floorSchematic.ts')
const VIEW = structure.planViewBox
const M = structure.planScale.unitsPerMetre

const planXtoWorldZ = px => interior.minZ + (px - VIEW.x) / M
const planYtoWorldX = py => interior.maxX - (py - VIEW.y) / M

const occAt = (px, py) => {
  const c = Math.floor((planYtoWorldX(py) - originX) / CELL)
  const r = Math.floor((planXtoWorldZ(px) - originZ) / CELL)
  if (c < 0 || r < 0 || c >= cols || r >= rows) return 0
  return occ[r * cols + c]
}

// ── What the map draws ───────────────────────────────────────────────────────

/**
 * ⚠️ THE PARTS, NOT THE EXTENTS. A block's `x/y/w/h` is its bounding box, and
 * the map deliberately does not draw that — a run against the west wall is a
 * shallow strip with two deep bays on it, and the box around that covers open
 * floor. Auditing the box would score the over-draw this file exists to catch
 * as perfect coverage.
 */
const drawn = [
  ...schematic.storageBlocks,
  ...schematic.equipmentBlocks,
  ...schematic.plantBlocks,
  ...schematic.goodsBlocks,
].flatMap(b => b.parts)

const covered = (px, py) => drawn.some(b =>
  px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h)

// ── Report ───────────────────────────────────────────────────────────────────

const W = Math.round(VIEW.width)
const H = Math.round(VIEW.height)
const tally = { low: 0, nav: 0, high: 0, any: 0, missed: 0, missedNav: 0 }
/** Per-pixel: 0 none, else the band bits, plus whether a rectangle covers it. */
const grid = new Uint8Array(W * H)

/** Drawn area standing on empty floor — the over-draw a bounding box creates. */
let phantom = 0
let drawnCells = 0

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const bits = occAt(VIEW.x + x, VIEW.y + y)
    const seen = covered(VIEW.x + x, VIEW.y + y)
    if (seen) drawnCells++
    if (!bits) {
      if (seen) phantom++
      continue
    }
    if (bits & 1) tally.low++
    if (bits & 2) tally.nav++
    if (bits & 4) tally.high++
    tally.any++
    if (!seen) {
      tally.missed++
      if (bits & 2) tally.missedNav++
    }
    grid[y * W + x] = bits | (seen ? 8 : 0)
  }
}

const pct = (a, b) => `${((a / b) * 100).toFixed(1)}%`
console.log('\n── MASS IN THE BUILDING, BY HEIGHT ─────────────────────────────')
console.log(`total occupied plan cells      ${tally.any.toLocaleString()}`)
console.log(`  present in 0.25–1.90 m       ${tally.nav.toLocaleString()}  (${pct(tally.nav, tally.any)})  ← all the extractor sees`)
console.log(`  present below 0.25 m         ${tally.low.toLocaleString()}  (${pct(tally.low, tally.any)})`)
console.log(`  present above 1.90 m         ${tally.high.toLocaleString()}  (${pct(tally.high, tally.any)})`)
const onlyOutside = (() => {
  let n = 0
  for (let i = 0; i < grid.length; i++) if (grid[i] && !(grid[i] & 2)) n++
  return n
})()
console.log(`  mass with NOTHING in the nav band  ${onlyOutside.toLocaleString()}  (${pct(onlyOutside, tally.any)})  ← invisible to the 2D map`)

console.log('\n── COVERAGE BY THE DRAWN SCHEMATIC ─────────────────────────────')
console.log(`real mass covered by a drawn rectangle   ${pct(tally.any - tally.missed, tally.any)}`)
console.log(`uncovered                                ${tally.missed.toLocaleString()} cells (${pct(tally.missed, tally.any)})`)
console.log(`  …of which the extractor DID see        ${tally.missedNav.toLocaleString()} cells`)
console.log(`\ndrawn area standing on EMPTY floor       ${phantom.toLocaleString()} cells (${pct(phantom, drawnCells)} of what is drawn)`)
console.log('  ↑ over-draw. A schematic simplifies, so this is never zero — but a')
console.log('    jump here means a bounding box has swallowed an aisle.')

// Largest uncovered clumps, so the gaps have addresses rather than a percentage.
const seenFlag = new Uint8Array(W * H)
const clumps = []
for (let i = 0; i < grid.length; i++) {
  if (!grid[i] || (grid[i] & 8) || seenFlag[i]) continue
  const stack = [i]
  seenFlag[i] = 1
  let minX = W, minY = H, maxX = 0, maxY = 0, n = 0
  while (stack.length) {
    const p = stack.pop()
    const x = p % W, y = (p - x) / W
    n++
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
      const q = ny * W + nx
      if (seenFlag[q] || !grid[q] || (grid[q] & 8)) continue
      seenFlag[q] = 1
      stack.push(q)
    }
  }
  if (n >= 200) clumps.push({ n, x: minX + VIEW.x, y: minY + VIEW.y, w: maxX - minX, h: maxY - minY })
}
clumps.sort((a, b) => b.n - a.n)
console.log('\n── LARGEST UNDRAWN OBJECTS (plan units) ────────────────────────')
console.log('cells    x      y      w × h            in metres')
for (const c of clumps.slice(0, 22)) {
  console.log(
    `${String(c.n).padStart(5)}  ${String(c.x).padStart(5)}  ${String(c.y).padStart(5)}   ` +
    `${(c.w + ' × ' + c.h).padEnd(14)} ${(c.w / M).toFixed(2)} × ${(c.h / M).toFixed(2)} m`,
  )
}
console.log(`${clumps.length} undrawn clumps of 200+ cells`)

// ── PNGs ─────────────────────────────────────────────────────────────────────

function png (width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3)
  }
  const table = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  const crc = b => {
    let c = 0xFFFFFFFF
    for (const byte of b) c = table[(c ^ byte) & 0xFF] ^ (c >>> 8)
    return (c ^ 0xFFFFFFFF) >>> 0
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const cc = Buffer.alloc(4)
    cc.writeUInt32BE(crc(body))
    return Buffer.concat([len, body, cc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function paint (pick) {
  const rgb = Buffer.alloc(W * H * 3)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = pick(grid[y * W + x], x, y)
      const o = (y * W + x) * 3
      rgb[o] = r; rgb[o + 1] = g; rgb[o + 2] = b
    }
  }
  return rgb
}

/** Outline every drawn rectangle, so the two layers can be compared directly. */
function outline (rgb, colour) {
  const put = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return
    const o = (y * W + x) * 3
    rgb[o] = colour[0]; rgb[o + 1] = colour[1]; rgb[o + 2] = colour[2]
  }
  for (const b of drawn) {
    const x0 = Math.round(b.x - VIEW.x), y0 = Math.round(b.y - VIEW.y)
    const x1 = Math.round(b.x + b.w - VIEW.x), y1 = Math.round(b.y + b.h - VIEW.y)
    for (let x = x0; x <= x1; x++) { put(x, y0); put(x, y1) }
    for (let y = y0; y <= y1; y++) { put(x0, y); put(x1, y) }
  }
}

mkdirSync(OUTDIR, { recursive: true })

const full = paint(bits => {
  if (!bits) return [8, 10, 12]
  if (bits & 2) return [120, 124, 130]        // seen by the extractor
  if (bits & 4) return [200, 130, 45]         // only above the band
  return [60, 110, 200]                       // only below the band
})
outline(full, [40, 220, 120])
writeFileSync(resolve(OUTDIR, 'plan-coverage.png'), png(W, H, full))

const missing = paint(bits => {
  if (!bits) return [8, 10, 12]
  if (bits & 8) return [26, 30, 34]           // drawn — context only
  if (bits & 2) return [235, 70, 70]          // missed, and the extractor saw it
  if (bits & 4) return [235, 160, 40]         // missed, only above the band
  return [70, 130, 235]                       // missed, only below the band
})
writeFileSync(resolve(OUTDIR, 'plan-missing.png'), png(W, H, missing))

console.log(`\nwrote ${resolve(OUTDIR, 'plan-coverage.png')}`)
console.log(`wrote ${resolve(OUTDIR, 'plan-missing.png')}`)

await server.close()
