/**
 * src/components/warehouse/routeLayer.ts
 *
 * ── PATH / NAVIGATION LAYER ──────────────────────────────────────────────────
 *
 * Draws mission paths on the warehouse floor from the SAME `FloorRoute` records
 * the 2D map renders (`src/data/floorOps.ts`). Waypoints in, ribbons out — which
 * means route geometry is authored once and both views read it.
 *
 * It is built for the navigation work that comes next: `setRoutes()` is a full
 * replace and is cheap enough to call on every telemetry tick, so dynamic
 * rerouting and mission playback are a matter of feeding it new waypoints rather
 * than of new rendering code.
 *
 * ⚠️ NOT DRAWN BY DEFAULT. The viewer keeps this off until the floor projection
 * has been calibrated against the real GLB (see floorProjection.ts). Ribbons
 * placed through an unverified projection would float somewhere plausible but
 * wrong, which is worse than showing nothing on a screen operators act on.
 */

import {
  CatmullRomCurve3,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  TubeGeometry,
  Vector3,
} from 'three'
import type { FloorProjection } from './floorProjection'

/** The subset of a dataset route this layer needs. Structurally compatible with `FloorRoute`. */
export interface RouteInput {
  id: string
  points: Array<[number, number]>
  /** Any CSS colour. The viewer passes resolved theme tokens, never raw hex. */
  color: string
  /** Ribbon width in plan units — same scale the 2D stroke widths use. */
  width?: number
  opacity?: number
}

export class RouteLayer {
  readonly group = new Group()

  private readonly projection: FloorProjection
  private disposed = false

  constructor (parent: Object3D, projection: FloorProjection) {
    this.projection = projection
    this.group.name = 'routes'
    parent.add(this.group)
  }

  /** Replace every route. Previous geometry is released, not orphaned. */
  setRoutes (routes: RouteInput[]) {
    if (this.disposed) return
    this.clear()

    for (const route of routes) {
      if (route.points.length < 2) continue

      // Lifted a hair off the slab so the ribbon never z-fights the floor mesh.
      const lift = this.projection.unitScale * 2
      const path = route.points.map(([x, y]) => this.projection.toWorld(x, y, lift))

      // Catmull-Rom rounds the corners, matching the filleted polylines the 2D
      // map draws — the two views describe the same path the same way.
      const curve = new CatmullRomCurve3(path, false, 'catmullrom', 0.15)
      const radius = ((route.width ?? 8) / 2) * this.projection.unitScale
      const segments = Math.min(600, Math.max(24, route.points.length * 24))

      const geometry = new TubeGeometry(curve, segments, radius, 8, false)
      const material = new MeshBasicMaterial({
        color: new Color(route.color),
        transparent: (route.opacity ?? 1) < 1,
        opacity: route.opacity ?? 1,
        depthWrite: (route.opacity ?? 1) >= 1,
      })

      const mesh = new Mesh(geometry, material)
      mesh.name = `route:${route.id}`
      mesh.userData.routeId = route.id
      this.group.add(mesh)
    }
  }

  clear () {
    for (const child of [...this.group.children]) {
      this.group.remove(child)
      if (child instanceof Mesh) {
        child.geometry.dispose()
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        for (const material of materials) material?.dispose()
      }
    }
  }

  dispose () {
    if (this.disposed) return
    this.disposed = true
    this.clear()
    this.group.removeFromParent()
  }

  /** Convenience for a Vector3 path that did not come from the plan dataset. */
  static toPlanPoints (points: Vector3[]): Array<[number, number]> {
    return points.map(p => [p.x, p.z] as [number, number])
  }
}
