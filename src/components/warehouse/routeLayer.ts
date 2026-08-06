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
  AdditiveBlending,
  CatmullRomCurve3,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
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
  /**
   * Draw this ribbon as an illuminated floor guide rather than as a painted one.
   *
   * ⚠️ ADDITIVE BLENDING IS WHAT MAKES A LINE READ AS LIGHT IN THE FLOOR rather
   * than as tape stuck on top of it. An alpha-blended ribbon LERPs toward the
   * slab underneath and gets darker as the floor gets darker, which on a
   * graphite floor is exactly backwards; an additive one ADDS to whatever is
   * beneath, so it brightens the surface the way a recessed light would.
   *
   * ⚠️ IT ALSO MEANS THE COLOUR IS A LIGHT, NOT A PIGMENT. Additive blending
   * cannot darken, so a guide can never make the floor blacker — and a bright
   * guide over a bright surface clips to white. That is the reason the floor is
   * dark: these only read as illumination against something for them to add to.
   */
  glow?: boolean
  /**
   * Draw this path as an inlay set into the floor rather than as paint or light.
   *
   * ⚠️ THE ONLY ROUTE MODE THAT IS LIT RATHER THAN UNLIT. `glow` and the default
   * both use `MeshBasicMaterial`, which has no roughness and ignores every light
   * in the scene — fine for something that emits, useless for something that is
   * supposed to be found by the way it REFLECTS. An engraved line is visible
   * only because its finish differs from the slab around it, so it needs a
   * material the lighting actually touches.
   */
  engraved?: boolean
}

/**
 * How far above display white a floor guide is driven. See the note at the use
 * site — it is the margin that keeps bloom off the robots.
 *
 * ⚠️ BUDGET FOR THE CROSSINGS, NOT FOR A SINGLE LINE. These ribbons are ADDITIVE
 * and the aisle network intersects itself, so wherever two corridors meet the
 * contributions SUM — a junction renders at twice whatever a straight run does.
 * At 2.6 a single line looked right and every crossing landed near 5.2, far
 * enough over the bloom threshold to blow out into a hotspot that swallowed the
 * floor around it. Sizing this so the CROSSINGS sit at a sensible brightness
 * necessarily leaves the straight runs dimmer than they could be; that is the
 * correct trade, because the blowouts are what the eye goes to.
 */
const GUIDE_HDR_GAIN = 1.4

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
      const material = route.engraved
        // ⚠️ GLOSSIER THAN THE FLOOR, WHICH IS THE ENTIRE SIGNAL. The slab runs
        // at roughness 0.5 with a map that scatters it further; this sits well
        // below that, so the inlay holds a tight reflection where the concrete
        // around it diffuses one. That difference is what draws the line — the
        // colour is near-black and contributes almost nothing, which is what
        // keeps it from reading as a painted stripe.
        ? new MeshStandardMaterial({
          color: new Color(route.color),
          roughness: 0.16,
          metalness: 0.25,
          // Raised well above the floor's so the inlay actually picks the probe
          // up. On a near-black albedo this is the only thing making it visible.
          envMapIntensity: 0.9,
          // ⚠️ NO EMISSIVE. The whole point is that it does not emit; it is also
          // what keeps it under the bloom threshold, so an inlay can never
          // become the neon strip it replaced.
          transparent: false,
          opacity: 1,
          // Part of the floor, so it occludes like floor.
          depthWrite: true,
        })
        : route.glow
        ? new MeshBasicMaterial({
          // ⚠️ DRIVEN ABOVE 1.0 ON PURPOSE — this is what separates the guides
          // from everything else the bloom pass could pick up. Bloom selects by
          // brightness, and the brightest SOLID thing in this hall is a robot:
          // the #87EFD9 hull facing the key light lands around 0.78 linear, so
          // any threshold low enough to catch a guide at ordinary intensity also
          // catches the fleet and makes the bodies glow — the exact thing that
          // was rejected. Pushing the guides into HDR instead lets the threshold
          // sit ABOVE the robots, so the only things that bloom are the ones
          // that are literally lights. Safe because the composer's buffer is
          // `HalfFloatType`; on an 8-bit target this would just clip to white.
          color: new Color(route.color).multiplyScalar(GUIDE_HDR_GAIN),
          transparent: true,
          opacity: route.opacity ?? 1,
          blending: AdditiveBlending,
          // A light in the floor occludes nothing: writing depth would let a
          // guide hide the robot standing on it, and stop the guides crossing
          // one another cleanly at a junction.
          depthWrite: false,
          toneMapped: false,
        })
        : new MeshBasicMaterial({
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
