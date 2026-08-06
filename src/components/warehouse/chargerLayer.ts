/**
 * src/components/warehouse/chargerLayer.ts
 *
 * ── THE CHARGING STALLS ──────────────────────────────────────────────────────
 *
 * Six docks, built here rather than loaded, standing where `stations` says the
 * chargers are. Each is a marked floor pad, a cabinet against the wall behind
 * it, a contact rail at deck height and a status lamp — the smallest assembly
 * that reads as charging equipment from across a hall rather than as a box.
 *
 * ⚠️ THIS IS THE ONE PLACE THE SCENE ADDS STRUCTURE, AND IT IS DELIBERATE.
 * Everything else in this folder refuses to generate warehouse geometry, for
 * good reason: the GLB already contains the shelving, racking and workstations,
 * so extruding a second set from the 2D dataset produced a competing warehouse
 * drawn on top of the real one. Chargers are different in the one way that
 * matters — they are NOT in the model. The building has no dock at any of these
 * positions, the simulation routes robots to them all day, and an operator was
 * being shown units driving to a bare patch of floor and stopping. Equipment the
 * fleet demonstrably uses has to be visible.
 *
 * ⚠️ THE POSITIONS ARE STILL PLACEHOLDERS. Nothing in the GLB identifies a
 * charging station — a charger is not geometrically distinct from any other
 * floor-standing object — so these six sit where the dataset's stalls were put:
 * against the north, south, west and east walls, which is where a real site
 * would put them, but not where THIS site put them. Replacing them is an edit to
 * `chargerStations` in `src/data/fleet.ts` and nothing here.
 *
 * ── WHAT IS ANIMATED, AND WHY THAT IS HONEST ─────────────────────────────────
 *
 * The lamp shows the stall's real state and only its real state. Free is a dim
 * steady green; reserved — a unit is on its way but not yet docked — is a steady
 * amber, because a stall that is spoken for is not a stall that is available;
 * charging is a slow pulse. The pulse is the only motion, it runs only while
 * current is genuinely flowing in the model, and it stops the instant the unit
 * leaves. Nothing here idles decoratively.
 */

import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from 'three'
import type { FloorProjection } from './floorProjection'

/** One stall's live state — the subset of `ChargerTelemetry` this layer draws. */
export interface ChargerState {
  id: string
  state: 'free' | 'reserved' | 'charging'
}

export interface ChargerSpec {
  id: string
  /** Plan coordinates — the same space the fleet and the 2D map use. */
  planX: number
  planY: number
  /**
   * Facing, radians clockwise from plan-north: the direction the stall's access
   * point lies in, and therefore the way a unit arrives. The cabinet goes behind
   * the pad, opposite this, so a docking robot drives INTO the dock rather than
   * through it.
   */
  headingRad: number
}

/** The palette, as resolved theme colours — never hexes. See `robotLivery`. */
export interface ChargerPalette {
  /** Cabinet body. The same colour the fleet's hulls are painted. */
  body: string
  /** Pad markings, contact rail, base — the dark trim of the house livery. */
  trim: string
  /** Lamp colour when a unit is drawing current. */
  active: string
  /** Lamp colour when the stall is spoken for but nothing is docked yet. */
  reserved: string
  /** Lamp colour when the stall is free and ready. */
  ready: string
}

/**
 * Dimensions in METRES, like every other physical thing in the scene.
 *
 * ⚠️ These were originally in plan units, and that was wrong for the same reason
 * the robots were: a plan unit is ~0.021 m as this drawing is projected, so a
 * "30 unit" cabinet stood 0.63 m tall — knee-high beside a 2.2 m forklift. A
 * charging dock is a physical object and belongs in the units physical objects
 * are measured in.
 *
 * The stall is sized to take the largest chassis (the 2.0 × 1.0 m forklift) with
 * room to sit inside its own markings.
 */
const PAD_WIDTH_M = 1.6
const PAD_DEPTH_M = 2.2
const PAD_THICKNESS_M = 0.02
const CABINET_WIDTH_M = 1.1
const CABINET_DEPTH_M = 0.32
const CABINET_HEIGHT_M = 1.7
const RAIL_HEIGHT_M = 0.45
const LAMP_HEIGHT_M = 1.45
const BOLLARD_HEIGHT_M = 0.75
const BOLLARD_RADIUS_M = 0.07

interface ChargerEntry {
  root: Object3D
  lamp: MeshStandardMaterial
}

export class ChargerLayer {
  readonly group = new Group()

  private readonly projection: FloorProjection
  private readonly palette: ChargerPalette
  private readonly chargers = new Map<string, ChargerEntry>()
  /** Every geometry and material this layer made, so disposal is exhaustive. */
  private readonly owned = new Set<Object3D>()
  private readonly materials = new Set<MeshStandardMaterial>()
  /** Stalls delivering current right now — the only ones the pulse touches. */
  private readonly pulsing = new Set<string>()
  private phase = 0

  constructor (parent: Object3D, projection: FloorProjection, palette: ChargerPalette) {
    this.projection = projection
    this.palette = palette
    this.group.name = 'chargers'
    parent.add(this.group)
  }

  /** Build the six docks. Called once — they are infrastructure, not telemetry. */
  build (specs: readonly ChargerSpec[]) {
    for (const spec of specs) this.spawn(spec)
  }

  private material (color: string, options: { emissive?: string; metalness?: number; roughness?: number } = {}) {
    const material = new MeshStandardMaterial({
      color,
      metalness: options.metalness ?? 0.25,
      roughness: options.roughness ?? 0.55,
      emissive: options.emissive ?? '#000000',
      // ⚠️ ZERO. The dock lamps were self-lit at 0.6 and bloomed into floating
      // glowing orbs beside every charger. State is still carried by the lamp's
      // COLOUR — free · reserved · charging — which is what the panel reads too;
      // it is simply lit by the hall now instead of emitting.
      emissiveIntensity: 0,
    })
    this.materials.add(material)
    return material
  }

  private spawn (spec: ChargerSpec) {
    // World units per metre — NOT per plan unit. Position comes from the plan;
    // size comes from physical dimensions. Conflating the two is what made the
    // fleet arrive at a third of its proper size.
    const scale = this.projection.worldPerMetre
    const root = new Group()
    root.name = `charger:${spec.id}`
    root.userData.chargerId = spec.id

    const bodyMaterial = this.material(this.palette.body, { metalness: 0.3, roughness: 0.5 })
    const trimMaterial = this.material(this.palette.trim, { metalness: 0.15, roughness: 0.75 })
    const lampMaterial = this.material(this.palette.ready, { emissive: this.palette.ready })

    const box = (w: number, h: number, d: number, material: MeshStandardMaterial) => {
      const geometry = new BoxGeometry(w * scale, h * scale, d * scale)
      const mesh = new Mesh(geometry, material)
      mesh.castShadow = true
      mesh.receiveShadow = true
      return mesh
    }

    // The face of the cabinet, which everything else hangs off.
    const cabinetZ = (PAD_DEPTH_M - CABINET_DEPTH_M) / 2
    const faceZ = cabinetZ - CABINET_DEPTH_M / 2

    // The marked bay. Sits flat on the floor and takes shadow rather than
    // casting it, so a docked robot's shadow lands on the pad the way it should.
    const pad = box(PAD_WIDTH_M, PAD_THICKNESS_M, PAD_DEPTH_M, trimMaterial)
    pad.castShadow = false
    pad.position.y = (PAD_THICKNESS_M / 2) * scale
    root.add(pad)

    // The cabinet, at the BACK of the pad — local +Z, because local -Z is the
    // way the unit arrives from. A dock the robot has to drive through to reach
    // is worse than no dock at all.
    const cabinet = box(CABINET_WIDTH_M, CABINET_HEIGHT_M, CABINET_DEPTH_M, bodyMaterial)
    cabinet.position.set(0, (CABINET_HEIGHT_M / 2) * scale, cabinetZ * scale)
    root.add(cabinet)

    // The contact rail the unit backs onto, at deck height on the cabinet face.
    const rail = box(CABINET_WIDTH_M * 0.72, 0.09, 0.07, trimMaterial)
    rail.position.set(0, RAIL_HEIGHT_M * scale, (faceZ - 0.035) * scale)
    root.add(rail)

    // Two bollards, so the stall reads as a bay from directly above as well as
    // from the side — the two angles an operator actually looks from.
    for (const side of [-1, 1]) {
      const bollard = new Mesh(
        new CylinderGeometry(
          BOLLARD_RADIUS_M * scale,
          BOLLARD_RADIUS_M * 1.2 * scale,
          BOLLARD_HEIGHT_M * scale,
          8,
        ),
        trimMaterial,
      )
      bollard.position.set(
        side * (PAD_WIDTH_M / 2 - BOLLARD_RADIUS_M * 1.5) * scale,
        (BOLLARD_HEIGHT_M / 2) * scale,
        -(PAD_DEPTH_M / 4) * scale,
      )
      bollard.castShadow = true
      root.add(bollard)
    }

    // The status lamp — a strip across the top of the cabinet, facing the aisle.
    const lamp = box(CABINET_WIDTH_M * 0.62, 0.11, 0.05, lampMaterial)
    lamp.castShadow = false
    lamp.position.set(0, LAMP_HEIGHT_M * scale, (faceZ - 0.025) * scale)
    root.add(lamp)

    root.position.copy(this.projection.toWorld(spec.planX, spec.planY, 0))
    // Same convention as the fleet and the fixtures: negate the plan heading,
    // and add the projection's own rotation so the dock faces the aisle the
    // robots actually arrive down.
    root.rotation.y = -(spec.headingRad + this.projection.rotationY)

    this.owned.add(root)
    this.chargers.set(spec.id, { root, lamp: lampMaterial })
    this.group.add(root)
  }

  /**
   * Push the stalls' live states in.
   *
   * Colour is set here and intensity is left to `update` — a charging lamp's
   * brightness is a function of time, and driving it from the telemetry watcher
   * would step it at the store's tick rate instead of the frame rate.
   */
  setStates (states: readonly ChargerState[]) {
    this.pulsing.clear()
    for (const state of states) {
      const entry = this.chargers.get(state.id)
      if (!entry) continue

      const colour = state.state === 'charging'
        ? this.palette.active
        : state.state === 'reserved' ? this.palette.reserved : this.palette.ready

      // ⚠️ COLOUR ONLY — THE LAMPS NO LONGER EMIT OR PULSE. `emissive` is left
      // black and `pulsing` is never populated, so the charge animation is inert
      // by construction rather than by a flag someone can flip back on. The
      // three states still read off the lamp's colour, which is the same
      // information; what is gone is the glow that bloomed into an orb beside
      // every dock and the breathing that drew the eye across the hall.
      entry.lamp.color.set(colour)
    }
  }

  /**
   * The charge pulse. Driven from the render loop, and it touches ONLY the
   * stalls the model says are delivering current — an idle dock is inert.
   */
  update (deltaSeconds: number) {
    if (this.pulsing.size === 0) return
    this.phase = (this.phase + deltaSeconds * 1.6) % (Math.PI * 2)
    // 0.45 … 1.35: clearly alive, never flashing. A hall of strobing lamps is
    // unreadable, and this runs on a wall display someone stands in front of.
    const intensity = 0.9 + Math.sin(this.phase) * 0.45
    for (const id of this.pulsing) {
      const entry = this.chargers.get(id)
      if (entry) entry.lamp.emissiveIntensity = intensity
    }
  }

  get ids (): string[] {
    return [...this.chargers.keys()]
  }

  dispose () {
    for (const root of this.owned) {
      root.traverse(child => {
        const mesh = child as Mesh
        if (mesh.isMesh) mesh.geometry?.dispose()
      })
      root.removeFromParent()
    }
    this.owned.clear()
    for (const material of this.materials) material.dispose()
    this.materials.clear()
    this.chargers.clear()
    this.pulsing.clear()
    this.group.removeFromParent()
  }
}
