/**
 * scripts/verify-cargo-placement.mjs
 *
 * ── DOES THE LOAD LAND WHERE THE MACHINE COULD ACTUALLY CARRY IT? ────────────
 *
 *   node scripts/verify-cargo-placement.mjs
 *
 * Rebuilds the transform chain `RobotLayer.setCargo` builds — scaled robot root,
 * pivot lift, yaw-corrected carrier, scaled box — and measures the result
 * against the robot's own mesh.
 *
 * ⚠️ THIS IS NOT A LOG, IT IS A MEASUREMENT. A console line from the browser
 * says what the code THINKS it did; this recomputes the geometry from the same
 * arithmetic, so "the box is on the forks" becomes a number rather than an
 * opinion. Nothing here reads the renderer, so nothing the renderer does can
 * fool it.
 *
 * ── WHY IT NOW MODELS `yawOffset`, AND WHY THAT MATTERS ──────────────────────
 *
 * The old version placed cargo along the root's −Z, exactly as the shipped code
 * did — so it faithfully reproduced a bug and reported it as fine. The root
 * carries a 90° `yawOffset` on two of the three chassis (their meshes are
 * authored with the long axis on X), which makes −Z inside the root SIDEWAYS.
 * The forklift's pallet was rendering beside the machine; the other two chassis
 * carry with `forwardM: 0`, where a rotated zero is still zero, so nothing else
 * could reveal it.
 *
 * ⚠️ A VERIFIER THAT SHARES THE CODE'S ASSUMPTION CANNOT FALSIFY IT. This one
 * checks against the MESH instead: it slices each robot by height and takes the
 * furthest-forward vertex per band, which is what separates a fork blade from
 * the solid body behind it, then asks whether the load overlaps solid geometry
 * at its OWN height — and whether anything is underneath holding it up.
 *
 * ── ONE SOURCE FOR THE NUMBERS ───────────────────────────────────────────────
 *
 * `sizeM`, `yawOffset` and `modelUrl` come from `src/data/fleet.ts` through
 * Vite; the bays are parsed out of `WarehouseViewer.vue`. Nothing is restated
 * here, because the previous copy had silently drifted — it listed the forklift
 * at 2.05 m (it is 1.8 m) and pointed chassis A at chassis B's GLB.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { openGlb, eachTriangle } from './lib/glb.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const MODELS = resolve(here, '../public/models')
const VIEWER = resolve(here, '../src/components/warehouse/WarehouseViewer.vue')

/** Height of each slice used to separate forks and decks from solid body. */
const BAND_M = 0.1
/** Clearance below which two solids are called touching, metres. */
const TOUCH_M = 0.005

// ── The bays, parsed from the viewer ─────────────────────────────────────────

const viewerSrc = readFileSync(VIEWER, 'utf8')
const bays = {}
for (const m of viewerSrc.matchAll(
  /^\s*([ABC]):\s*\{\s*liftM:\s*([\d.]+),\s*forwardM:\s*([\d.]+),\s*fitM:\s*([\d.]+)\s*\}/gm,
)) {
  bays[m[1]] = { liftM: +m[2], forwardM: +m[3], fitM: +m[4] }
}
if (Object.keys(bays).length === 0) {
  throw new Error('could not parse CARGO_BAYS out of WarehouseViewer.vue — has its shape changed?')
}

// ── The chassis, from the dataset ────────────────────────────────────────────

const server = await createServer({
  configFile: 'vite.config.mts',
  server: { middlewareMode: true },
  logLevel: 'error',
})
const { robotTypes } = await server.ssrLoadModule('/src/data/fleet.ts')
await server.close()

const CARGO_FILE = 'white shipping box 3d model.glb'

/** Triangle-level extents — accessor min/max is per-primitive and too coarse. */
function meshBox (file) {
  const glb = openGlb(resolve(MODELS, file))
  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  eachTriangle(glb, (a, b, c) => {
    for (const v of [a, b, c]) {
      for (let k = 0; k < 3; k++) {
        if (v[k] < lo[k]) lo[k] = v[k]
        if (v[k] > hi[k]) hi[k] = v[k]
      }
    }
  })
  return { glb, lo, hi, size: hi.map((v, i) => v - lo[i]) }
}

/**
 * Furthest-forward solid geometry per height band, in TRAVEL space.
 *
 * `yawOffset` rotates the mesh so travel-forward is the model direction
 * `(sin yaw, 0, −cos yaw)`; projecting each vertex onto that axis gives how far
 * ahead of the root origin it reaches. Bands run from the ground up, after the
 * pivot lift, so band 0 is what the machine has at ankle height — the forks.
 */
function forwardProfile (mesh, scale, yaw) {
  const groundY = mesh.lo[1] * scale
  const height = mesh.size[1] * scale
  const bands = Math.max(1, Math.ceil(height / BAND_M))
  const front = new Array(bands).fill(-Infinity)
  const fx = Math.sin(yaw)
  const fz = -Math.cos(yaw)

  eachTriangle(mesh.glb, (a, b, c) => {
    for (const v of [a, b, c]) {
      const h = v[1] * scale - groundY
      const i = Math.min(bands - 1, Math.max(0, Math.floor(h / BAND_M)))
      const along = v[0] * scale * fx + v[2] * scale * fz
      if (along > front[i]) front[i] = along
    }
  })
  return { front, bands }
}

const cargo = meshBox(CARGO_FILE)
console.log(`cargo  ${CARGO_FILE}  native ${cargo.size.map(n => n.toFixed(3)).join(' × ')} m\n`)

let problems = 0
const note = msg => { problems++; console.log(`      ✗ ${msg}`) }

for (const type of Object.values(robotTypes)) {
  const bay = bays[type.id]
  if (!bay) { console.log(`${type.id} · no bay declared — skipped\n`); continue }
  if (!type.modelUrl) { console.log(`${type.id} · no GLB — schematic marker, skipped\n`); continue }

  const file = decodeURIComponent(type.modelUrl.split('/').pop())
  const mesh = meshBox(file)
  const scale = type.sizeM.heightM / mesh.size[1]
  const yaw = type.yawOffset ?? 0

  // The load: scaled so its LARGEST dimension is `fitM`, then seated with its
  // base on the bay floor. Depth along travel is its own Z, because the carrier
  // turns it back square to the direction of travel.
  const cargoScale = bay.fitM / Math.max(...cargo.size)
  const depth = cargo.size[2] * cargoScale
  const width = cargo.size[0] * cargoScale
  const tall = cargo.size[1] * cargoScale

  const backFace = bay.forwardM - depth / 2
  const frontFace = bay.forwardM + depth / 2
  const base = bay.liftM
  const top = bay.liftM + tall

  const { front, bands } = forwardProfile(mesh, scale, yaw)

  console.log(`${type.id} · ${type.name}   ${file}`)
  console.log(
    `      chassis ${(mesh.size[0] * scale).toFixed(2)} × ${(mesh.size[1] * scale).toFixed(2)} × ` +
    `${(mesh.size[2] * scale).toFixed(2)} m   yawOffset ${(yaw * 180 / Math.PI).toFixed(0)}°`,
  )
  console.log(
    `      bay     lift ${bay.liftM.toFixed(2)} m · forward ${bay.forwardM.toFixed(2)} m · ` +
    `fit ${bay.fitM.toFixed(2)} m`,
  )
  console.log(
    `      load    ${width.toFixed(2)} w × ${depth.toFixed(2)} d × ${tall.toFixed(2)} h m   ` +
    `occupies ${backFace.toFixed(3)} … ${frontFace.toFixed(3)} m ahead, ` +
    `${base.toFixed(2)} … ${top.toFixed(2)} m up`,
  )

  if (base < -TOUCH_M) note(`the load sits ${(-base).toFixed(3)} m BELOW the floor`)

  // ⚠️ THE TWO CARRY STYLES ARE NOT THE SAME QUESTION, AND ASKING ONE OF THEM
  // BOTH WAYS PRODUCES NONSENSE. A load carried AHEAD (a forklift's forks) must
  // clear the chassis and rest on something. A load carried WITHIN (an open
  // frame, a flat deck) is *supposed* to sit inside the chassis envelope — and
  // whether it is inside the FRAME or inside the MAST is a question about voids,
  // which a bounding profile cannot answer. That is the lesson already recorded
  // in `CARGO_BAYS`: the box was once "measured correct" while buried in solid
  // mast geometry. So this reports and refuses to assert.
  if (bay.forwardM <= 0.01) {
    console.log(
      '      · carried WITHIN the frame — inside the chassis envelope by design.',
    )
    console.log(
      '        A height profile cannot tell a frame from a void, so this one is',
      '\n        only ever as good as someone looking at it.',
    )
    console.log('')
    continue
  }

  // How far forward the machine is solid over the height the load occupies.
  let solidAhead = -Infinity
  let solidBand = -1
  for (let i = 0; i < bands; i++) {
    const bandLo = i * BAND_M
    const bandHi = bandLo + BAND_M
    if (bandHi <= base + TOUCH_M || bandLo >= top - TOUCH_M) continue
    if (front[i] > solidAhead) { solidAhead = front[i]; solidBand = i }
  }

  if (solidBand < 0) {
    console.log('      ✓ no chassis geometry at all at the load\'s height')
  } else if (backFace < solidAhead - TOUCH_M) {
    note(
      `the load INTERSECTS the chassis: solid geometry reaches ${solidAhead.toFixed(3)} m ahead ` +
      `at ${(solidBand * BAND_M).toFixed(2)}–${((solidBand + 1) * BAND_M).toFixed(2)} m up, ` +
      `but the load's back face is at ${backFace.toFixed(3)} m ` +
      `(overlap ${(solidAhead - backFace).toFixed(3)} m)`,
    )
  } else {
    console.log(
      `      ✓ clears the chassis by ${(backFace - solidAhead).toFixed(3)} m ` +
      `(solid reaches ${solidAhead.toFixed(3)} m at the load's height)`,
    )
  }

  // A load carried ahead must be SUPPORTED — something below it reaching at
  // least as far forward as its back face. A pallet floating past the fork tips
  // is as wrong as one buried in the mast.
  let supportAhead = -Infinity
  for (let i = 0; i < bands; i++) {
    if (i * BAND_M >= base + TOUCH_M) break
    if (front[i] > supportAhead) supportAhead = front[i]
  }
  if (supportAhead < backFace) {
    note(
      `the load is UNSUPPORTED: nothing below ${base.toFixed(2)} m reaches past ` +
      `${supportAhead.toFixed(3)} m, but the load starts at ${backFace.toFixed(3)} m`,
    )
  } else {
    const overhang = frontFace - supportAhead
    console.log(
      `      ✓ supported to ${supportAhead.toFixed(3)} m ahead` +
      (overhang > 0
        ? ` — load overhangs the tips by ${overhang.toFixed(3)} m`
        : ` — load sits ${(-overhang).toFixed(3)} m inside the tips`),
    )
  }
  console.log('')
}

console.log(problems ? `✗ ${problems} problem${problems === 1 ? '' : 's'}` : '✓ every load is carried')
process.exit(problems ? 1 : 0)
