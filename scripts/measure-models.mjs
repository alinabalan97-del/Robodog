/**
 * scripts/measure-models.mjs
 *
 * ── HOW BIG IS EACH GLB, REALLY? ─────────────────────────────────────────────
 *
 *   node scripts/measure-models.mjs
 *
 * Prints every model's true bounding box in its OWN authored units, plus the
 * uniform scale factor that would make it the real-world size declared for it in
 * `src/data/fleet.ts`.
 *
 * WHY THIS HAS TO BE MEASURED. The five assets came from different pipelines and
 * none of them agrees with any other about what one unit means: one is authored
 * so a robot spans hundreds of units, another so it spans a fraction of one.
 * Nothing in a GLB states a scale, so "make them all the right size" is not a
 * judgement anyone can make by looking — it is a division, and this script is
 * the numerator.
 *
 * It reads only the JSON chunk: every POSITION accessor carries `min`/`max`, so
 * composing node world matrices over those eight corners gives an exact AABB
 * without decoding ~330 MB of vertex data.
 */

import { openSync, readSync, closeSync } from 'node:fs'
import { dirname, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const MODELS = resolve(here, '../public/models')

/**
 * The real-world size each asset is meant to be, in metres — length (the long
 * horizontal axis) × width × height.
 *
 * ⚠️ REFERENCE FIGURES, not measurements of a real machine. They are ordinary
 * sizes for the class of equipment each model depicts, supplied so the fleet
 * reads at a believable scale against a 5.1 m warehouse. Keep them in step with
 * `robotTypes[*].sizeM` / `fixtureTypes[*].sizeM`.
 */
const TARGETS = {
  'robot 1.glb': { label: 'Autonomous forklift (type C)', lengthM: 2.0, widthM: 1.0, heightM: 2.2 },
  'amazon model.glb': { label: 'Amazon AMR (type B)', lengthM: 0.9, widthM: 0.9, heightM: 0.45 },
  'industrial robot controller 3d model.glb': { label: 'AGV cart tug (type A)', lengthM: 1.4, widthM: 0.9, heightM: 0.8 },
  'industrial robot 3d model.glb': { label: 'ASRS vertical lift (fixture)', lengthM: 1.8, widthM: 1.15, heightM: 2.9 },
  'ImageToStl.com_warehouse6 (2).glb': { label: 'The warehouse itself — the yardstick', lengthM: null, widthM: null, heightM: null },
}

// ── GLB → JSON chunk ─────────────────────────────────────────────────────────

function readGltfJson (path) {
  const fd = openSync(path, 'r')
  try {
    const head = Buffer.alloc(20)
    readSync(fd, head, 0, 20, 0)
    if (head.toString('utf8', 0, 4) !== 'glTF') throw new Error('not a GLB')
    const length = head.readUInt32LE(12)
    const chunk = Buffer.alloc(length)
    readSync(fd, chunk, 0, length, 20)
    return JSON.parse(chunk.toString('utf8'))
  } finally {
    closeSync(fd)
  }
}

// ── Minimal column-major mat4, same as the layout extractor ──────────────────

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

function measure (gltf) {
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  let meshes = 0

  function walk (index, parentMatrix) {
    const node = gltf.nodes?.[index]
    if (!node) return
    const world = multiply(parentMatrix, localMatrix(node))

    if (node.mesh !== undefined) {
      meshes += 1
      for (const primitive of gltf.meshes[node.mesh]?.primitives ?? []) {
        const accessor = gltf.accessors[primitive.attributes?.POSITION]
        if (!accessor?.min || !accessor?.max) continue
        const [ax, ay, az] = accessor.min
        const [bx, by, bz] = accessor.max
        for (const corner of [
          [ax, ay, az], [bx, ay, az], [ax, by, az], [ax, ay, bz],
          [bx, by, az], [bx, ay, bz], [ax, by, bz], [bx, by, bz],
        ]) {
          const p = transform(world, corner)
          for (let k = 0; k < 3; k++) {
            lo[k] = Math.min(lo[k], p[k])
            hi[k] = Math.max(hi[k], p[k])
          }
        }
      }
    }

    for (const child of node.children ?? []) walk(child, world)
  }

  for (const root of gltf.scenes?.[gltf.scene ?? 0]?.nodes ?? []) walk(root, identity())
  return { lo, hi, size: [0, 1, 2].map(k => hi[k] - lo[k]), meshes }
}

// ── Report ───────────────────────────────────────────────────────────────────

const round = (n, places = 4) => Math.round(n * 10 ** places) / 10 ** places

for (const [file, target] of Object.entries(TARGETS)) {
  const path = resolve(MODELS, file)
  let box
  try {
    box = measure(readGltfJson(path))
  } catch (error) {
    console.log(`\n${file}\n  ✗ ${error.message}`)
    continue
  }

  const [sx, sy, sz] = box.size
  // "Length" is the longer horizontal axis and "width" the shorter, because a
  // GLB records no facing — which of x and z is forward is a per-model guess
  // (`yawOffset`), so the size contract must not depend on knowing it.
  const long = Math.max(sx, sz)
  const short = Math.min(sx, sz)

  console.log(`\n${basename(file)}  —  ${target.label}`)
  console.log(`  meshes            ${box.meshes}`)
  console.log(`  authored size     x ${round(sx, 3)}  y ${round(sy, 3)}  z ${round(sz, 3)}`)
  console.log(`  → long ${round(long, 3)} · short ${round(short, 3)} · tall ${round(sy, 3)}`)
  console.log(`  origin offset     x ${round(box.lo[0], 3)}  y ${round(box.lo[1], 3)}  z ${round(box.lo[2], 3)}`)
  console.log(`  aspect (L:W:H)    1 : ${round(short / long, 2)} : ${round(sy / long, 2)}`)

  // ⚠️ A NON-ZERO Y IS THE ONE OFFSET THAT SHOWS. Both 3D layers stand a model up
  // by putting its ROOT ORIGIN on the floor plane, so an asset whose origin is
  // not at its base renders sunk into the slab (or hovering) by exactly this
  // much — `robot 1.glb` is authored centred and was drawn buried to its waist.
  // `baseOffsetY()` in `src/components/warehouse/robotLayer.ts` measures and
  // cancels it at load, so this line is a diagnostic, not an action: it explains
  // a lift the viewer is already applying.
  if (Math.abs(box.lo[1]) > 1e-4) {
    const where = box.lo[1] < 0 ? 'BELOW' : 'above'
    console.log(`  ⚠️ pivot           ${round(Math.abs(box.lo[1]), 3)} ${where} the model's base`
      + ' — the viewer lifts it to stand on the floor')
  }

  if (target.heightM === null) continue

  const byLength = target.lengthM / long
  const byWidth = target.widthM / short
  const byHeight = target.heightM / sy
  console.log(`  target            L ${target.lengthM}m · W ${target.widthM}m · H ${target.heightM}m`)
  console.log(`  scale if fit by   length ${round(byLength)}  width ${round(byWidth)}  height ${round(byHeight)}`)

  // ⇒ HEIGHT is what the scene actually uses. See `RobotSize` in
  // src/data/fleet.ts: these are single unrigged meshes, so the scale has to be
  // uniform, and height is the dimension every acceptance test here is about —
  // does the AMR fit under a pallet, does the forklift read as tall beside a
  // rack, does the lift reach the racking. Length and width land where the
  // model's own proportions put them, and the error is printed rather than
  // hidden so an asset that is badly out of proportion is visible as such.
  const fitted = [long * byHeight, short * byHeight, sy * byHeight]
  const err = (got, want) => `${round(got, 2)}m (${got >= want ? '+' : ''}${Math.round((got / want - 1) * 100)}%)`
  console.log(`  ⇒ SCALE APPLIED   ${round(byHeight)}   (uniform, fitted to height)`)
  console.log(`    gives           L ${err(fitted[0], target.lengthM)} · W ${err(fitted[1], target.widthM)}`
    + ` · H ${round(fitted[2], 2)}m (exact)`)
}

console.log('\nThe warehouse is 5.089 units tall, which is an ordinary clear height for a')
console.log('distribution hall — so this model is authored in METRES and one world unit')
console.log('is one metre. Every scale above is computed against that.')
