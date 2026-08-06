/**
 * scripts/lib/glb.mjs
 *
 * A minimal GLB reader — enough to walk a scene and get world-space triangles,
 * and nothing else. No dependency, because the alternative is pulling Three and
 * a DOM shim into a build script to read a file format that is a header, some
 * JSON and a blob.
 *
 * ⚠️ `scripts/extract-warehouse-nav.mjs` carries its own copy of this and is
 * deliberately NOT changed to import it. That script generates the navigation
 * grid the whole simulation is built on; re-running it is how the road network,
 * the station coordinates and the plan scale all stay consistent, and a
 * refactor that subtly altered its output would be felt as robots freezing
 * mid-aisle somewhere else entirely. New readers use this; that one is left
 * alone until there is a reason to touch it.
 */

import { readFileSync } from 'node:fs'

const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

function multiply (a, b) {
  const o = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]
      o[c * 4 + r] = s
    }
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

/**
 * Open a GLB and return its drawable primitives with world matrices, plus the
 * scene's bounding box (taken from accessor min/max, so it costs nothing).
 */
export function openGlb (path) {
  const buf = readFileSync(path)
  if (buf.toString('utf8', 0, 4) !== 'glTF') throw new Error(`${path} is not a GLB`)
  const jsonLen = buf.readUInt32LE(12)
  const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen))
  const BIN = 20 + jsonLen + 8

  /** Decode a VEC3 float accessor, honouring byteStride. */
  const readPositions = i => {
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

  const readIndices = i => {
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

  const walk = (index, parent) => {
    const node = gltf.nodes[index]
    if (!node) return
    const world = multiply(parent, localMatrix(node))
    if (node.mesh !== undefined) {
      for (const prim of gltf.meshes[node.mesh]?.primitives ?? []) {
        if (prim.attributes?.POSITION === undefined) continue
        drawables.push({ prim, world })
        const acc = gltf.accessors[prim.attributes.POSITION]
        if (!acc?.min || !acc?.max) continue
        for (const c of [acc.min, acc.max]) {
          const p = [
            world[0] * c[0] + world[4] * c[1] + world[8] * c[2] + world[12],
            world[1] * c[0] + world[5] * c[1] + world[9] * c[2] + world[13],
            world[2] * c[0] + world[6] * c[1] + world[10] * c[2] + world[14],
          ]
          for (let k = 0; k < 3; k++) {
            lo[k] = Math.min(lo[k], p[k])
            hi[k] = Math.max(hi[k], p[k])
          }
        }
      }
    }
    for (const c of node.children ?? []) walk(c, world)
  }
  for (const r of gltf.scenes?.[0]?.nodes ?? []) walk(r, identity())

  return { gltf, drawables, lo, hi, readPositions, readIndices }
}

/**
 * Call `visit(a, b, c)` with every triangle in world space, as three [x, y, z].
 *
 * ⚠️ THE SAME ARRAYS ARE REUSED ON EVERY CALL. This model has 6.1 million
 * triangles; allocating three vectors each would put ~18 million short-lived
 * arrays through the collector for a script that only ever reads them. Copy
 * anything that needs to outlive the callback.
 */
export function eachTriangle (glb, visit) {
  const a = [0, 0, 0]
  const b = [0, 0, 0]
  const c = [0, 0, 0]
  const tri = [a, b, c]
  let count = 0

  for (const { prim, world } of glb.drawables) {
    const pos = glb.readPositions(prim.attributes.POSITION)
    if (!pos) continue
    const idx = prim.indices !== undefined ? glb.readIndices(prim.indices) : null
    const n = idx ? idx.length : pos.length / 3

    for (let t = 0; t + 2 < n; t += 3) {
      for (let k = 0; k < 3; k++) {
        const vi = (idx ? idx[t + k] : t + k) * 3
        const x = pos[vi], y = pos[vi + 1], z = pos[vi + 2]
        const v = tri[k]
        v[0] = world[0] * x + world[4] * y + world[8] * z + world[12]
        v[1] = world[1] * x + world[5] * y + world[9] * z + world[13]
        v[2] = world[2] * x + world[6] * y + world[10] * z + world[14]
      }
      visit(a, b, c)
      count++
    }
  }
  return count
}
