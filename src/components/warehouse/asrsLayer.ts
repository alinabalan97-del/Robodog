/**
 * src/components/warehouse/asrsLayer.ts
 *
 * ── THE STACKER CRANES, BUILT ────────────────────────────────────────────────
 *
 * Rail, travelling chassis, fixed mast, and a lifting carriage that runs that
 * mast independently of everything below it. One `Group` per crane, and the two
 * axes the simulation reports go onto two different nodes — which is the whole
 * reason this layer exists.
 *
 * ⚠️ WHY THIS IS BUILT AND NOT LOADED, when there IS an ASRS GLB.
 * `industrial robot 3d model.glb` is a single unrigged mesh: no skeleton, no
 * named parts, no clips. A carriage that moves while the chassis stays put is
 * not something that asset can express — the old `FixtureLayer` could only lift
 * the ENTIRE machine off the floor and call it a carriage, which is why its
 * travel was capped at 0.44 m (any more put the roof of the model through the
 * roof of the building). Every symptom of that is gone here: the mast is bolted
 * to the sled, only the carriage climbs, and it climbs the full 2.93 m of rack.
 *
 * This is the same exception `chargerLayer.ts` takes, and for the same reason.
 * The rule is "never generate warehouse STRUCTURE" — racking, shell, floor — all
 * of which is in the GLB and merely unaddressable. A crane is EQUIPMENT, it is
 * not in the model at all, and the simulation runs one whether or not anything
 * draws it. Leaving it out meant showing an empty aisle where a machine works.
 *
 * ⚠️ NO BEHAVIOUR LIVES HERE. `setFrames` copies numbers onto transforms and
 * nothing else — where a crane is, what level it is at and whether it is laden
 * are all decided in `src/sim/asrsSim.ts`. A layer that worked out its own next
 * bay would put the 2D and 3D views into disagreement on the first frame.
 *
 * SIZES ARE IN METRES, always, and go through `projection.worldPerMetre`. Plan
 * units go through `toWorld`. Crossing the two is the documented bug that made
 * the whole fleet a third of its proper size — see `FloorProjection`.
 */

import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from 'three'
import type { BufferGeometry } from 'three'
import { disposeObject } from './warehouseScene'
import type { FloorProjection } from './floorProjection'
import type { AsrsCraneSpec } from '@/data/asrs'
import { asrsCraneSize, asrsLevels, levelHeightM } from '@/data/asrs'
import type { AsrsTelemetry } from '@/sim/asrsSim'

/** The house palette, resolved from live theme tokens by the caller. */
export interface CraneLivery {
  /** The machine's hull. */
  body: string
  /** Rail, mast lattice, undercarriage — anything that reads as structural. */
  trim: string
  /** Lamps and the carriage deck, so the moving part is the readable one. */
  accent: string
  /** A load on the forks. Distinct from the machine, or it reads as part of it. */
  cargo: string
  roughness: number
  metalness: number
}

interface CraneParts {
  /** Everything that travels the rail. Driven by the frame's plan-x. */
  chassis: Group
  /** Everything that climbs the mast. Driven by the frame's carriage height. */
  carriage: Group
  /** The load on the forks — shown only while the crane is genuinely laden. */
  cargo: Object3D
  /** The load on the P&D deck at the aisle end. Same rule. */
  deckCargo: Object3D
  /** Signal lamp on the mast head; lit only while the machine is working. */
  lamp: Mesh<BufferGeometry, MeshStandardMaterial>
}

export class AsrsLayer {
  readonly group = new Group()

  private readonly projection: FloorProjection
  private readonly cranes = new Map<string, CraneParts>()
  /** Everything this layer created. All of it is owned, so all of it is freed. */
  private readonly materials: MeshStandardMaterial[] = []
  private disposed = false

  constructor (parent: Object3D, projection: FloorProjection) {
    this.projection = projection
    this.group.name = 'asrs'
    parent.add(this.group)
  }

  get ids (): string[] {
    return [...this.cranes.keys()]
  }

  /**
   * Build a crane per spec. Static geometry — rails and P&D decks — is placed
   * once here rather than per frame, because a rail that moved would not be a
   * rail.
   */
  build (specs: readonly AsrsCraneSpec[], livery: CraneLivery): void {
    if (this.disposed) return
    this.clear()

    const metre = this.projection.worldPerMetre
    const body = this.material(livery.body, livery)
    const trim = this.material(livery.trim, livery)
    // Self-lit, so the moving part stays readable inside a dim hall without the
    // lighting rig being tuned around it.
    const accent = this.material(livery.accent, livery, 0.35)
    const cargoPaint = this.material(livery.cargo, livery, 0.15)

    const { widthM, lengthM, heightM } = asrsCraneSize

    for (const spec of specs) {
      const root = new Group()
      root.name = `asrs:${spec.id}`
      root.userData.craneId = spec.id

      // ── The rail. Two running beams the length of the crane's travel, plus the
      // guide beam at mast height that a real crane's top shoe runs in. Drawn at
      // the FULL travel span so an operator can see how far the machine can go,
      // which is the one thing a still frame cannot otherwise say.
      const railSpan = spec.railTo - spec.railFrom
      const railMid = (spec.railFrom + spec.railTo) / 2
      const railLength = railSpan * this.projection.unitScale + lengthM * metre
      const gauge = widthM * 0.62 * metre

      for (const side of [-1, 1]) {
        const beam = new Mesh(new BoxGeometry(0.05 * metre, 0.06 * metre, railLength), trim)
        beam.position.set(side * gauge / 2, 0.03 * metre, 0)
        beam.receiveShadow = true
        root.add(beam)
      }
      const guide = new Mesh(new BoxGeometry(0.07 * metre, 0.07 * metre, railLength), trim)
      guide.position.set(0, heightM * metre, 0)
      root.add(guide)

      // ── The pick-and-deposit deck at the aisle end. This is where the crane
      // sets a retrieved load down and where a mobile unit collects it, so it is
      // a real place in the model rather than a marker.
      const deck = new Mesh(
        new BoxGeometry(widthM * 0.95 * metre, 0.12 * metre, 0.7 * metre),
        body,
      )
      const deckOffset = this.alongRail(spec.transferX, railMid)
      deck.position.set(0, 0.34 * metre, deckOffset)
      deck.castShadow = true
      deck.receiveShadow = true
      root.add(deck)

      const deckCargo = this.buildCargo(cargoPaint, metre)
      deckCargo.position.set(0, 0.55 * metre, deckOffset)
      deckCargo.visible = false
      root.add(deckCargo)

      // ── The chassis: the sled, the two mast uprights and the head. All of it
      // travels the rail together, and none of it climbs.
      const chassis = new Group()
      chassis.name = `asrs:${spec.id}:chassis`

      const sled = new Mesh(
        new BoxGeometry(widthM * metre, 0.28 * metre, lengthM * metre),
        body,
      )
      sled.position.y = 0.2 * metre
      sled.castShadow = true
      sled.receiveShadow = true
      chassis.add(sled)

      // Two uprights rather than one column: a stacker mast is a lattice, and the
      // gap between the legs is what the carriage visibly runs INSIDE.
      const mastHeight = heightM - 0.34
      for (const side of [-1, 1]) {
        const upright = new Mesh(
          new BoxGeometry(0.09 * metre, mastHeight * metre, 0.14 * metre),
          trim,
        )
        upright.position.set(side * (widthM * 0.28) * metre, (0.34 + mastHeight / 2) * metre, 0)
        upright.castShadow = true
        chassis.add(upright)
      }

      const head = new Mesh(
        new BoxGeometry(widthM * 0.8 * metre, 0.14 * metre, 0.3 * metre),
        body,
      )
      head.position.y = (heightM - 0.07) * metre
      head.castShadow = true
      chassis.add(head)

      const lamp = new Mesh(
        new CylinderGeometry(0.05 * metre, 0.05 * metre, 0.09 * metre, 10),
        accent.clone(),
      )
      this.materials.push(lamp.material)
      lamp.position.set(0, (heightM + 0.06) * metre, 0)
      chassis.add(lamp)

      // ── The carriage. Its own group, parented to the chassis, so it inherits
      // the horizontal travel and adds the vertical on top — which is exactly
      // how the real machine is put together, and why the two axes can be
      // animated from two independent numbers.
      const carriage = new Group()
      carriage.name = `asrs:${spec.id}:carriage`

      const platform = new Mesh(
        new BoxGeometry(widthM * 0.86 * metre, 0.1 * metre, lengthM * 0.52 * metre),
        accent,
      )
      platform.castShadow = true
      carriage.add(platform)

      // Telescopic forks, across the aisle — the axis a stacker crane reaches
      // along. They are what make the machine read as picking INTO the racking
      // rather than as a lift standing beside it.
      for (const side of [-1, 1]) {
        const fork = new Mesh(
          new BoxGeometry(widthM * 0.5 * metre, 0.05 * metre, 0.1 * metre),
          trim,
        )
        fork.position.set(side * widthM * 0.5 * metre, 0.02 * metre, 0)
        carriage.add(fork)
      }

      const cargo = this.buildCargo(cargoPaint, metre)
      cargo.position.y = 0.22 * metre
      cargo.visible = false
      carriage.add(cargo)

      chassis.add(carriage)
      root.add(chassis)

      // The whole rig stands at the MIDDLE of its rail and the chassis slides
      // along local −Z from there, so a crane is one position plus one offset
      // rather than a position recomputed from scratch every frame.
      root.position.copy(this.projection.toWorld(railMid, spec.railY, 0))
      // The rail runs along plan-x; local −Z is the scene's forward at heading 0,
      // so the rig turns by the projection's own rotation and a quarter turn on
      // top. Miss either term and the crane runs across its aisle instead of
      // down it — the exact failure the GLB fixture had.
      root.rotation.y = -(Math.PI / 2 + this.projection.rotationY)

      this.group.add(root)
      this.cranes.set(spec.id, { chassis, carriage, cargo, deckCargo, lamp })
    }
  }

  /**
   * Put every crane where the simulation says it is.
   *
   * Two independent writes per crane and that is the point: the chassis takes
   * the rail position and the carriage takes the height, so what the viewer sees
   * is a machine that indexes to a bay and only then hoists.
   */
  setFrames (frames: readonly AsrsTelemetry[]): void {
    if (this.disposed) return
    const metre = this.projection.worldPerMetre

    for (const frame of frames) {
      const parts = this.cranes.get(frame.id)
      if (!parts) continue

      // Along the rail — a signed offset from the rail's midpoint, where the rig
      // itself stands.
      const mid = (frame.railFrom + frame.railTo) / 2
      parts.chassis.position.z = this.alongRail(frame.x, mid)

      // Up the mast. Independent of the line above — never derived from it.
      parts.carriage.position.y = (0.34 + frame.carriageM) * metre

      parts.cargo.visible = frame.cargoId !== null
      parts.deckCargo.visible = frame.deckCargoId !== null

      // The lamp shows WORK, not power. A crane standing at its deck with
      // nothing to do is dark, which is the honest reading.
      parts.lamp.material.emissiveIntensity = frame.working ? 1.6 : 0.15
    }
  }

  /**
   * A plan-x on the rail, as a local-Z offset from the rail's midpoint.
   *
   * ⚠️ NEGATED, and the sign is not cosmetic. The rig is turned so its local −Z
   * lies along plan +x (see `build`), so local +Z runs the other way. Getting
   * this backwards puts every crane at the mirror image of its bay — the machine
   * still travels, still stops, and is at the wrong end of the aisle, which is
   * the kind of wrong that survives a look at the screen.
   */
  private alongRail (planX: number, midX: number): number {
    return -(planX - midX) * this.projection.unitScale
  }

  /** A container on the forks or on the deck. Sized to a level's clear height. */
  private buildCargo (material: MeshStandardMaterial, metre: number): Object3D {
    const { widthM, lengthM } = asrsCraneSize
    // Comfortably under one level's rise, so a laden carriage never looks as
    // though it is fouling the shelf above the one it is working.
    const height = Math.min(0.42, asrsLevels.riseM * 0.62)
    const box = new Mesh(
      new BoxGeometry(widthM * 0.7 * metre, height * metre, lengthM * 0.44 * metre),
      material,
    )
    box.position.y = (height / 2) * metre
    box.castShadow = true
    const holder = new Group()
    holder.add(box)
    return holder
  }

  private material (color: string, livery: CraneLivery, emissive = 0): MeshStandardMaterial {
    const material = new MeshStandardMaterial({
      color,
      roughness: livery.roughness,
      metalness: livery.metalness,
    })
    if (emissive > 0) {
      material.emissive.set(color)
      material.emissiveIntensity = emissive
    }
    this.materials.push(material)
    return material
  }

  clear (): void {
    for (const child of [...this.group.children]) {
      this.group.remove(child)
      disposeObject(child)
    }
    this.cranes.clear()
    for (const material of this.materials) material.dispose()
    this.materials.length = 0
  }

  dispose (): void {
    if (this.disposed) return
    this.disposed = true
    this.clear()
    this.group.removeFromParent()
  }
}

/** The top of the rack a crane serves, in metres — for the caller's ceiling check. */
export const CRANE_TOP_LEVEL_M = levelHeightM(asrsLevels.count)
