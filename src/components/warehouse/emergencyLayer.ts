/**
 * src/components/warehouse/emergencyLayer.ts
 *
 * ── EMERGENCY PICKUP / DELIVERY BEACONS ──────────────────────────────────────
 *
 * The 3D counterpart of the flashing marks on the 2D plan: a beacon standing at
 * each end of every LIVE emergency job, so the two views answer "where is the
 * urgent work" the same way.
 *
 * ⚠️ THIS IS NOT WAREHOUSE STRUCTURE, and the distinction is the one the scene's
 * standing rule turns on. `warehouseScene.ts` forbids generating building —
 * racking, walls, aisles — because the GLB is the authority on what the hall
 * contains, and drawing a rack the model does not have is a lie about a
 * building. A beacon is the opposite kind of object: it is LIVE STATE with a
 * position, exactly like a robot or a route ribbon, and it exists only while the
 * simulation says a job does. Nothing here persists between frames on its own;
 * `setMarks([])` removes every beacon, and that is what happens the moment the
 * last emergency is delivered.
 *
 * ⚠️ IT NEVER SIGNALS BY COLOUR OR MOTION ALONE (CLAUDE.md → Domain rules). Each
 * beacon carries a SHAPE that says which end it is — a box for a pickup, the
 * same box turned on its point for a delivery, matching the square/diamond pair
 * the 2D plan draws — plus a ring on the floor, plus the pulse. The words live
 * in the task panel and in the 2D marker's accessible name; a 3D canvas has no
 * accessible name to carry them, which is precisely why the shape is not
 * optional here.
 *
 * Colour is a resolved THEME TOKEN handed in by the viewer, never a hex — the
 * same rule the livery and the route ribbons follow, so beacons re-theme with
 * the app.
 */

import {
  CircleGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  BoxGeometry,
  Object3D,
} from 'three'
import type { FloorProjection } from './floorProjection'

/** One end of one live emergency job, in plan coordinates. */
export interface EmergencyMarkInput {
  id: string
  x: number
  y: number
  role: 'pickup' | 'delivery'
}

/** How tall a beacon stands and how wide its floor ring is, in METRES. */
const BEACON_HEIGHT_M = 1.9
const BEACON_SIZE_M = 0.34
const RING_RADIUS_M = 0.9

export class EmergencyLayer {
  readonly group = new Group()

  private readonly projection: FloorProjection
  private colour: string
  private disposed = false
  /** Seconds since construction — drives the pulse. Advanced by the render loop. */
  private clock = 0

  constructor (parent: Object3D, projection: FloorProjection, colour: string) {
    this.projection = projection
    this.colour = colour
    this.group.name = 'emergency'
    parent.add(this.group)
  }

  /** Re-resolve the beacon colour when the theme changes. */
  setColour (colour: string): void {
    this.colour = colour
    for (const child of this.group.children) {
      child.traverse(node => {
        if (!(node instanceof Mesh)) return
        const materials = Array.isArray(node.material) ? node.material : [node.material]
        for (const material of materials) {
          if ('color' in material) (material as MeshBasicMaterial).color = new Color(colour)
        }
      })
    }
  }

  /**
   * Replace every beacon. A full replace rather than a diff: there are at most a
   * handful of live emergencies, and rebuilding is both cheaper than reconciling
   * and impossible to leave in a stale state.
   */
  setMarks (marks: EmergencyMarkInput[]): void {
    if (this.disposed) return
    this.clear()

    for (const mark of marks) {
      const beacon = new Group()
      beacon.name = `emergency:${mark.id}`

      const base = this.projection.toWorld(mark.x, mark.y, 0)
      beacon.position.copy(base)

      const metre = this.projection.worldPerMetre

      // The floor ring — where the job is, readable from directly above.
      const ring = new Mesh(
        new CircleGeometry(RING_RADIUS_M * metre, 32),
        new MeshBasicMaterial({ color: new Color(this.colour), transparent: true, opacity: 0.35 }),
      )
      ring.rotation.x = -Math.PI / 2
      // A hair off the slab so it never z-fights the floor mesh, the same lift
      // the route ribbons use.
      ring.position.y = this.projection.unitScale * 2
      beacon.add(ring)

      // The marker itself. A cube for a pickup; the same cube on its point for a
      // delivery — the 3D reading of the plan's square/diamond pair.
      const size = BEACON_SIZE_M * metre
      const body = new Mesh(
        new BoxGeometry(size, size, size),
        new MeshStandardMaterial({
          color: new Color(this.colour),
          emissive: new Color(this.colour),
          emissiveIntensity: 0.65,
          roughness: 0.4,
          metalness: 0.1,
        }),
      )
      body.position.y = BEACON_HEIGHT_M * metre
      if (mark.role === 'delivery') {
        body.rotation.set(Math.PI / 4, 0, Math.PI / 4)
      }
      body.name = 'beacon'
      beacon.add(body)

      this.group.add(beacon)
    }
  }

  /**
   * Advance the pulse.
   *
   * ⚠️ DRIVEN BY THE RENDER LOOP'S dt, not by a wall clock, so a paused scene
   * shows a still beacon. A marker that kept flashing over frozen positions
   * would be the "looks live, is not" failure the domain rules exist to
   * prevent — the same reason the freshness chip degrades.
   */
  update (dt: number): void {
    if (this.disposed || this.group.children.length === 0) return
    this.clock += dt
    // Two-second cycle, matching the 2D marker's rhythm closely enough that the
    // two views read as one alarm rather than two.
    const pulse = 0.5 + 0.5 * Math.sin(this.clock * Math.PI)

    for (const beacon of this.group.children) {
      const body = beacon.getObjectByName('beacon')
      if (body instanceof Mesh) {
        body.position.y = (BEACON_HEIGHT_M + pulse * 0.25) * this.projection.worldPerMetre
        const material = body.material as MeshStandardMaterial
        if (material.emissiveIntensity !== undefined) {
          material.emissiveIntensity = 0.35 + pulse * 0.65
        }
        body.rotation.y += dt * 1.2
      }
    }
  }

  clear (): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child)
      child.traverse(node => {
        if (!(node instanceof Mesh)) return
        node.geometry.dispose()
        const materials = Array.isArray(node.material) ? node.material : [node.material]
        for (const material of materials) material?.dispose()
      })
    }
  }

  dispose (): void {
    if (this.disposed) return
    this.disposed = true
    this.clear()
    this.group.removeFromParent()
  }
}
