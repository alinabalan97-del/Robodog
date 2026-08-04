/**
 * src/components/warehouse/trafficLayer.ts
 *
 * ── THE TRAFFIC OVERLAY, IN 3D ───────────────────────────────────────────────
 *
 * Draws what the traffic controller decided: which lane blocks are occupied,
 * which are merely spoken for, which junctions are held, how close each unit is
 * allowed to be to the next one, and where each one is trying to get to.
 *
 * It is a RENDERER and nothing else (CLAUDE.md → the three-layer rule). It reads
 * `TrafficTelemetry` off the simulation frame and turns it into geometry. It
 * decides nothing, reserves nothing and knows nothing about right of way — if a
 * question about traffic can be answered in this file, it is in the wrong file.
 *
 * ── WHY THE OVERLAY IS FLAT AND UNLIT ────────────────────────────────────────
 *
 * Everything here is a floor decal on `MeshBasicMaterial`: no lighting, no
 * shadows, drawn after the scene with depth-writing off. That is deliberate. A
 * reservation is not a physical object in the hall — it is an annotation over
 * one — and shading it like the racking would invite an operator to read it as
 * something that is really there. Flat colour on the slab reads as markup.
 *
 * ── WHY IT REBUILDS ON A SIGNATURE ───────────────────────────────────────────
 *
 * The reservation set changes a few times a second; the robot poses change sixty
 * times a second. Rebuilding the ribbons every frame would re-tessellate a few
 * dozen quads for nothing, so the segment and junction geometry is rebuilt only
 * when the SET changes (compared as a string), while the rings and destination
 * marks are pre-allocated per unit and only moved. That is what keeps this
 * inside the 60 FPS budget with sixteen units on the floor.
 */

import {
  CircleGeometry,
  Color,
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  RingGeometry,
} from 'three'
import { disposeObject } from './warehouseScene'
import type { FloorProjection } from './floorProjection'

/**
 * Every colour the overlay uses, as a concrete CSS colour.
 *
 * ⚠️ RESOLVED BY THE VIEWER, NEVER CHOSEN HERE. Three cannot read a CSS custom
 * property, so the component resolves each theme token once and passes the
 * result in — which is what lets the overlay re-colour with the app's theme
 * instead of drifting from it. A hex in this file would be a second palette.
 */
export interface TrafficPalette {
  /** A block with a unit's body inside it. */
  occupied: string
  /** A block a unit holds but has not entered yet. */
  reserved: string
  /** A junction nobody is in. */
  junctionFree: string
  /** A junction a unit is holding. */
  junctionHeld: string
  /** A junction units keep queueing at. */
  junctionCongested: string
  /** The ring showing how much room a unit needs around it. */
  safety: string
  /** Where a unit is headed. */
  destination: string
}

/** One unit's traffic state, as the overlay draws it. */
export interface RobotTrafficMark {
  id: string
  planX: number
  planY: number
  /**
   * How much clear floor this unit needs around it, in METRES.
   *
   * ⚠️ METRES, not plan units — sizes go through `worldPerMetre` and positions
   * through `toWorld`, and crossing the two is how the fleet once ended up a
   * third of its proper size (see `floorProjection.ts`).
   */
  safetyRadiusM: number
  /** Resolved colour for this unit's state — green moving, amber waiting, … */
  tone: string
  /** Waiting or rerouting: the ring pulses so a jam reads as a jam in motion. */
  attention: boolean
}

/** Where one unit is trying to get to. */
export interface DestinationMark {
  id: string
  planX: number
  planY: number
  /** Draw a leader from the unit to the mark, so which is whose is unambiguous. */
  fromX: number
  fromY: number
  tone: string
  /** The selected unit's mark is drawn larger; everyone else's stays quiet. */
  emphasis: boolean
}

/** A lane block, as the controller reports it. Structurally `SegmentTelemetry`. */
export interface SegmentMark {
  id: string
  from: [number, number]
  to: [number, number]
  use: 'occupied' | 'reserved'
}

/** A junction, as the controller reports it. Structurally `IntersectionTelemetry`. */
export interface JunctionMark {
  id: string
  x: number
  y: number
  held: boolean
  /** 0–1. Derived over a decaying window by the controller, never measured. */
  congestion: number
}

/** Ribbon width, in plan units — a shade narrower than a lane so both read. */
const SEGMENT_WIDTH = 26
/** Junction disc radius, in plan units. */
const JUNCTION_RADIUS = 18

/**
 * How far each tier floats off the slab, as a MULTIPLE OF `unitScale`.
 *
 * Strictly increasing, so the tiers stack in a fixed order and a ribbon never
 * z-fights a junction disc. All of them sit below `RouteLayer`'s `unitScale * 2`,
 * because the overlay is annotation and the selected unit's route is the thing
 * an operator is actually following — markup must not cover it.
 *
 * ⚠️ A MULTIPLE, NOT A FIXED DISTANCE, AND THAT IS THE WHOLE BUG THIS CARRIES.
 * These were authored as metres — 4 mm to 16 mm — on the reasoning that a decal
 * should sit as close to the floor as possible so nothing looks like it hovers.
 * That reasoning is right and the numbers were unusable: `worldPerMetre` is 1
 * here because the warehouse GLB is authored in metres, so 4 mm is 4 mm of world
 * space, and the model's own floor slab is thicker than that. Every ribbon,
 * disc and ring was drawn INSIDE the floor. Nothing errored, nothing warned, the
 * layer reported itself visible, and the overlay was simply never seen — which
 * is exactly how it survived being written, reviewed and left unmounted.
 *
 * Scaling off `unitScale` also means the tiers track the projection: a plan
 * fitted onto a differently-sized building lifts by the same proportion rather
 * than by a distance that was only ever right for this one model.
 */
const LIFT_TIERS = {
  segment: 1.2,
  junction: 1.4,
  safety: 1.6,
  destination: 1.8,
}

/** Seconds for one breath of the attention pulse. Slow enough not to strobe. */
const PULSE_PERIOD_S = 1.6

export class TrafficLayer {
  readonly group = new Group()

  private readonly projection: FloorProjection
  private palette: TrafficPalette

  private readonly segmentGroup = new Group()
  private readonly junctionGroup = new Group()
  private readonly safetyGroup = new Group()
  private readonly destinationGroup = new Group()

  /**
   * A single quad, shared by every ribbon and scaled per instance.
   *
   * Rotated flat at construction rather than per mesh: a ribbon is then a scale
   * and a yaw, which is the cheapest thing to rebuild a few dozen of.
   */
  private readonly quad = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
  private readonly disc: CircleGeometry
  private readonly leader = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
  private readonly pin: ConeGeometry

  /** Materials are shared by use, so a repaint is one assignment, not N. */
  private readonly materials: Record<string, MeshBasicMaterial> = {}
  /** Per-unit ring materials — each carries its own state colour. */
  private readonly ringMaterials = new Map<string, MeshBasicMaterial>()
  private readonly ringGeometries = new Map<string, RingGeometry>()
  private readonly rings = new Map<string, Mesh>()
  private readonly destinations = new Map<string, Group>()

  /** What the last rebuild drew. Rebuilds are skipped while this is unchanged. */
  private segmentSignature = ''
  private junctionSignature = ''

  /** 0–1, the attention pulse. Driven by `update` off the render clock. */
  private pulse = 0
  private pulseClock = 0
  private disposed = false

  constructor (parent: Object3D, projection: FloorProjection, palette: TrafficPalette) {
    this.projection = projection
    this.palette = palette
    this.group.name = 'traffic'

    const metre = projection.worldPerMetre
    this.disc = new CircleGeometry(1, 24).rotateX(-Math.PI / 2)
    // A small upright cone: the one part of the overlay that is NOT flat, because
    // "where this unit is going" has to be findable across a hall rather than
    // read off the floor at the exact spot it marks.
    this.pin = new ConeGeometry(0.09 * metre, 0.34 * metre, 4)

    for (const [key, color] of Object.entries(palette)) {
      this.materials[key] = this.makeMaterial(color)
    }

    // Drawn after the building and without writing depth, so the overlay never
    // hides a machine and never fights the slab it lies on.
    for (const child of [this.segmentGroup, this.junctionGroup, this.safetyGroup, this.destinationGroup]) {
      child.renderOrder = 3
      this.group.add(child)
    }

    parent.add(this.group)
  }

  /**
   * How high one tier sits above the floor plane, in world units.
   *
   * Through `unitScale` for the reason spelled out on `LIFT_TIERS`: a fixed
   * distance is only ever right for one model, and the one that was here put the
   * whole overlay inside the slab.
   */
  private lift (tier: number): number {
    return this.projection.unitScale * tier
  }

  private makeMaterial (color: string, opacity = 0.42): MeshBasicMaterial {
    return new MeshBasicMaterial({
      color: new Color(color),
      transparent: true,
      opacity,
      depthWrite: false,
    })
  }

  /** Repaint on a theme change. Geometry is untouched — this is paint only. */
  setPalette (palette: TrafficPalette): void {
    this.palette = palette
    for (const [key, color] of Object.entries(palette)) {
      this.materials[key]?.color.set(color)
    }
  }

  // ── Lane blocks ───────────────────────────────────────────────────────────

  /**
   * Draw the reserved and occupied road.
   *
   * Rebuilt only when the SET changes: sixteen units re-reserving the same
   * blocks frame after frame produce the same signature, and re-tessellating
   * identical quads sixty times a second is the kind of waste that shows up as a
   * dropped frame rather than as a visible bug.
   */
  setSegments (segments: readonly SegmentMark[]): void {
    if (this.disposed) return

    const signature = segments.map(s => `${s.id}:${s.use}`).join(',')
    if (signature === this.segmentSignature) return
    this.segmentSignature = signature

    this.clearGroup(this.segmentGroup)

    for (const segment of segments) {
      const a = this.projection.toWorld(segment.from[0], segment.from[1], this.lift(LIFT_TIERS.segment))
      const b = this.projection.toWorld(segment.to[0], segment.to[1], this.lift(LIFT_TIERS.segment))
      const dx = b.x - a.x
      const dz = b.z - a.z
      const length = Math.hypot(dx, dz)
      if (!(length > 1e-6)) continue

      const material = segment.use === 'occupied' ? this.materials.occupied : this.materials.reserved
      const mesh = new Mesh(this.quad, material)
      mesh.name = `traffic:${segment.id}`
      // Local +X runs along the block; rotating by −atan2 puts it on the world
      // bearing from a to b. Width is in plan units, so it converts by unitScale.
      mesh.scale.set(length, 1, SEGMENT_WIDTH * this.projection.unitScale)
      mesh.rotation.y = -Math.atan2(dz, dx)
      mesh.position.set((a.x + b.x) / 2, a.y, (a.z + b.z) / 2)
      mesh.renderOrder = 3
      this.segmentGroup.add(mesh)
    }
  }

  // ── Junctions ─────────────────────────────────────────────────────────────

  /**
   * Draw every intersection the controller arbitrates.
   *
   * ⚠️ FREE JUNCTIONS ARE DRAWN TOO, faintly. A layer that only marked the busy
   * ones would leave an operator unable to tell "this crossing is clear" from
   * "this crossing is not managed", and those are very different claims to make
   * on a screen somebody dispatches against.
   */
  setJunctions (junctions: readonly JunctionMark[]): void {
    if (this.disposed) return

    const signature = junctions
      .map(j => `${j.id}:${j.held ? 1 : 0}:${Math.round(j.congestion * 4)}`)
      .join(',')
    if (signature === this.junctionSignature) return
    this.junctionSignature = signature

    this.clearGroup(this.junctionGroup)

    for (const junction of junctions) {
      const at = this.projection.toWorld(junction.x, junction.y, this.lift(LIFT_TIERS.junction))
      const material = junction.held
        ? this.materials.junctionHeld
        : junction.congestion > 0.35 ? this.materials.junctionCongested : this.materials.junctionFree

      const mesh = new Mesh(this.disc, material)
      mesh.name = `junction:${junction.id}`
      const radius = JUNCTION_RADIUS * this.projection.unitScale
      mesh.scale.set(radius, 1, radius)
      mesh.position.copy(at)
      mesh.renderOrder = 4
      this.junctionGroup.add(mesh)
    }
  }

  // ── Safety radius ─────────────────────────────────────────────────────────

  /**
   * One ring per unit, showing the clear floor it needs around it.
   *
   * Pre-allocated and moved rather than rebuilt: this runs on every telemetry
   * frame. A unit's ring is rebuilt only when its RADIUS changes, which happens
   * once, when it first appears.
   */
  setRobots (marks: readonly RobotTrafficMark[]): void {
    if (this.disposed) return

    const present = new Set<string>()

    for (const mark of marks) {
      present.add(mark.id)
      const radius = mark.safetyRadiusM * this.projection.worldPerMetre

      let ring = this.rings.get(mark.id)
      if (!ring) {
        const geometry = new RingGeometry(radius * 0.86, radius, 32).rotateX(-Math.PI / 2)
        const material = this.makeMaterial(mark.tone, 0.55)
        ring = new Mesh(geometry, material)
        ring.name = `safety:${mark.id}`
        ring.renderOrder = 5
        this.ringGeometries.set(mark.id, geometry)
        this.ringMaterials.set(mark.id, material)
        this.rings.set(mark.id, ring)
        this.safetyGroup.add(ring)
      }

      ring.position.copy(this.projection.toWorld(mark.planX, mark.planY, this.lift(LIFT_TIERS.safety)))
      const material = this.ringMaterials.get(mark.id)
      if (material) {
        material.color.set(mark.tone)
        // Pulsing is reserved for the states an operator has to notice. A unit
        // simply driving its route gets a steady ring; a jam breathes.
        material.opacity = mark.attention ? 0.35 + 0.35 * this.pulse : 0.4
      }
    }

    for (const id of [...this.rings.keys()]) {
      if (present.has(id)) continue
      this.removeRing(id)
    }
  }

  // ── Destinations ──────────────────────────────────────────────────────────

  /**
   * Where each unit is trying to get to, and a leader line back to the unit.
   *
   * The leader is what makes this readable at sixteen units. A field of pins
   * with no ownership is a puzzle; a pin joined to the machine that owns it is
   * an answer.
   */
  setDestinations (marks: readonly DestinationMark[]): void {
    if (this.disposed) return

    const present = new Set<string>()

    for (const mark of marks) {
      present.add(mark.id)

      let entry = this.destinations.get(mark.id)
      if (!entry) {
        entry = new Group()
        entry.name = `destination:${mark.id}`

        const material = this.makeMaterial(mark.tone, 0.85)
        const pin = new Mesh(this.pin, material)
        pin.name = 'pin'
        pin.renderOrder = 6
        entry.add(pin)

        const line = new Mesh(this.leader, this.makeMaterial(mark.tone, 0.3))
        line.name = 'leader'
        line.renderOrder = 5
        entry.add(line)

        this.destinations.set(mark.id, entry)
        this.destinationGroup.add(entry)
      }

      const to = this.projection.toWorld(mark.planX, mark.planY, this.lift(LIFT_TIERS.destination))
      const from = this.projection.toWorld(mark.fromX, mark.fromY, this.lift(LIFT_TIERS.destination))

      const pin = entry.getObjectByName('pin') as Mesh | undefined
      const line = entry.getObjectByName('leader') as Mesh | undefined
      const scale = mark.emphasis ? 1.35 : 0.9

      if (pin) {
        pin.position.set(to.x, to.y + 0.17 * this.projection.worldPerMetre * scale, to.z)
        pin.scale.setScalar(scale)
        this.paint(pin, mark.tone, 0.85)
      }

      if (line) {
        const dx = to.x - from.x
        const dz = to.z - from.z
        const length = Math.hypot(dx, dz)
        // A unit standing on its own destination has no leader to draw, and a
        // zero-length quad renders as a speck at the origin rather than nothing.
        line.visible = length > 1e-3
        if (line.visible) {
          line.scale.set(length, 1, (mark.emphasis ? 5 : 3) * this.projection.unitScale)
          line.rotation.y = -Math.atan2(dz, dx)
          line.position.set((from.x + to.x) / 2, to.y, (from.z + to.z) / 2)
          this.paint(line, mark.tone, mark.emphasis ? 0.42 : 0.18)
        }
      }
    }

    for (const id of [...this.destinations.keys()]) {
      if (present.has(id)) continue
      this.removeDestination(id)
    }
  }

  private paint (mesh: Mesh, color: string, opacity: number): void {
    const material = mesh.material
    if (Array.isArray(material)) return
    const basic = material as MeshBasicMaterial
    basic.color.set(color)
    basic.opacity = opacity
  }

  // ── Frame ─────────────────────────────────────────────────────────────────

  /**
   * Advance the attention pulse.
   *
   * On the RENDER clock, not the telemetry clock: the simulation's rate is an
   * operator control (0.5×–4×) and a pulse that sped up with it would read as
   * the floor getting more urgent when all that changed was the playback speed.
   */
  update (deltaSeconds: number): void {
    if (this.disposed) return
    this.pulseClock = (this.pulseClock + deltaSeconds) % PULSE_PERIOD_S
    this.pulse = 0.5 + 0.5 * Math.sin((this.pulseClock / PULSE_PERIOD_S) * Math.PI * 2)
  }

  setVisible (visible: boolean): void {
    this.group.visible = visible
  }

  // ── Teardown ──────────────────────────────────────────────────────────────

  private removeRing (id: string): void {
    const ring = this.rings.get(id)
    if (ring) {
      this.safetyGroup.remove(ring)
      this.rings.delete(id)
    }
    this.ringGeometries.get(id)?.dispose()
    this.ringGeometries.delete(id)
    this.ringMaterials.get(id)?.dispose()
    this.ringMaterials.delete(id)
  }

  private removeDestination (id: string): void {
    const entry = this.destinations.get(id)
    if (!entry) return
    this.destinationGroup.remove(entry)
    // The pin and leader own their materials outright — the shared `quad` and
    // `pin` geometries are freed once, in dispose(), so only paint goes here.
    entry.traverse(child => {
      if (!(child instanceof Mesh)) return
      const material = child.material
      if (Array.isArray(material)) for (const m of material) m.dispose()
      else material.dispose()
    })
    this.destinations.delete(id)
  }

  /**
   * Empty a group without freeing the shared geometry hanging off it.
   *
   * ⚠️ `disposeObject` is deliberately NOT used here. Every ribbon and disc
   * shares one geometry and one material with all the others, so disposing a
   * removed child would blank every remaining one — the same trap `RobotLayer`
   * documents for cloned GLBs.
   */
  private clearGroup (group: Group): void {
    for (const child of [...group.children]) group.remove(child)
  }

  dispose (): void {
    if (this.disposed) return
    this.disposed = true

    for (const id of [...this.rings.keys()]) this.removeRing(id)
    for (const id of [...this.destinations.keys()]) this.removeDestination(id)
    this.clearGroup(this.segmentGroup)
    this.clearGroup(this.junctionGroup)

    this.quad.dispose()
    this.disc.dispose()
    this.leader.dispose()
    this.pin.dispose()
    for (const material of Object.values(this.materials)) material.dispose()

    disposeObject(this.group)
    this.group.removeFromParent()
  }
}
