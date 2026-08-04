/**
 * src/components/warehouse/robotLayer.ts
 *
 * ── ROBOT STATE LAYER ────────────────────────────────────────────────────────
 *
 * Owns every robot in the 3D scene: spawning, per-frame pose, highlight and
 * teardown. The scene knows nothing about robots and the robots know nothing
 * about the building, so a new robot type is a new GLB URL and nothing else —
 * no change to WarehouseScene, no change to the viewer component.
 *
 * ⚠️ THIS LAYER SHIPS EMPTY, ON PURPOSE. The warehouse GLB contains the building
 * only. There are no robot models in the project yet, so there is nothing to
 * spawn and nothing is spawned — no placeholder cubes, no stand-in vehicles.
 * `spawn()` is the real entry point and works the moment a robot GLB exists.
 *
 * WHEN ROBOT MODELS ARRIVE, the wiring is:
 *
 *   const layer = new RobotLayer(scene.contentRoot, projection)
 *   scene.track(layer)                                  // disposed with the scene
 *   await layer.spawn({ id: 'v-12', modelUrl: '/models/ot-t12.glb' })
 *   layer.setPose('v-12', { planX: 521, planY: 486, headingRad: Math.PI / 2 })
 *
 * Positions are given in FLOOR-PLAN coordinates — the same numbers the 2D map
 * renders from — and the projection converts them. That is what keeps a single
 * source of truth behind both views: neither one stores world units.
 */

import {
  AnimationMixer,
  Box3,
  BoxGeometry,
  Color,
  ConeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three'
import type { AnimationClip } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { disposeObject } from './warehouseScene'
import { applyLivery } from './robotLivery'
import type { Livery } from './robotLivery'
import type { FloorProjection } from './floorProjection'

/**
 * Scale a loaded model so it stands `heightM` metres tall.
 *
 * ⚠️ MEASURED, NOT ASSUMED. Every asset here arrives normalised to roughly a
 * unit cube by whatever pipeline exported it, so a GLB's own units carry no
 * information about size at all. The only way to put four models on one floor at
 * one scale is to measure each and divide — which is what this does, and why
 * there is no per-model magic number anywhere in the codebase.
 *
 * Uniform, and driven by height alone: these are single unrigged meshes, so
 * matching all three target dimensions would mean non-uniform scale, and that
 * distorts a machine rather than resizing it. `scripts/measure-models.mjs`
 * prints what each model's length and width come out as.
 *
 * Exported because the fixture layer has exactly the same problem.
 */
export function scaleToMetres (root: Object3D, heightM: number, worldPerMetre: number): void {
  const size = new Box3().setFromObject(root).getSize(new Vector3())
  // A degenerate box would divide by zero and blow the model up to infinity,
  // which loses the whole scene rather than one robot.
  if (!(size.y > 1e-6)) return
  root.scale.setScalar((heightM * worldPerMetre) / size.y)
}

/**
 * How far a scaled model must be LIFTED for its lowest point to rest on the
 * floor — i.e. the correction for a pivot that is not at the model's base.
 *
 * ⚠️ THE PIVOT IS PART OF THE ASSET, NOT A CONVENTION. Both layers place a model
 * by putting its ROOT ORIGIN on the floor plane, which is only the same thing as
 * standing it on the floor when the exporter happened to author the origin at
 * the base. Three of the four assets do; `robot 1.glb` (the type C forklift) has
 * its origin at the centre of its own bounding box (authored min.y −0.75 of a
 * 1.5-unit mesh), so it was drawn sunk 1.1 m — half a 2.2 m machine — through
 * the slab, wheels and all.
 *
 * That failure mode is worth naming because it does not look like a bug in the
 * placement code: the unit is at the right coordinate, driving the right aisle,
 * facing the right way, and simply appears to be standing in a hole. Measuring
 * the box instead of trusting the origin makes the next asset with a centred or
 * roof-hung pivot a non-event. `scripts/measure-models.mjs` prints the offset
 * per model under "origin offset".
 *
 * Call AFTER `scaleToMetres` and BEFORE the model is positioned or parented: the
 * box is measured through the world matrix, so the number is only the pivot
 * correction while the model still sits unparented at the origin.
 *
 * Exported because the fixture layer has exactly the same problem.
 */
export function baseOffsetY (root: Object3D): number {
  const minY = new Box3().setFromObject(root).min.y
  // A model with no renderable geometry yields an empty box (min.y = +Infinity),
  // and lifting anything by Infinity loses it rather than the one robot.
  return Number.isFinite(minY) ? -minY : 0
}

/** A robot's pose, in floor-plan coordinates. Never world units. */
export interface RobotPose {
  planX: number
  planY: number
  /** Facing, radians clockwise from plan-north. */
  headingRad?: number
  /** Metres above the floor, for anything that is not ground-borne. */
  height?: number
}

export interface RobotSpawnSpec {
  /** Matches the vehicle id in the shared dataset, so selection lines up. */
  id: string
  modelUrl: string
  pose?: RobotPose
  /**
   * How big this machine really is, in metres. The clone is scaled uniformly so
   * its measured HEIGHT hits `heightM`; see `RobotSize` in `src/data/fleet.ts`
   * for why height rather than footprint, and why uniformly rather than to fit
   * all three numbers.
   */
  sizeM?: { lengthM: number; widthM: number; heightM: number }
  /** Radians added to every heading, when the model's long axis is not −Z. */
  yawOffset?: number
  /**
   * House livery for this chassis. Applied to the CLONE, so the cached source
   * is never repainted and two types loaded from one file cannot bleed into
   * each other. Omit to keep the model's own materials.
   */
  livery?: Livery
}

interface RobotEntry {
  root: Object3D
  mixer: AnimationMixer | null
  clips: AnimationClip[]
  yawOffset: number
  /**
   * Lift applied to every pose so this model's WHEELS, not its origin, land on
   * the floor. See `baseOffsetY`. Zero for a well-authored asset.
   */
  baseOffsetY: number
  /** Per-instance materials created by the repaint; nothing else will free them. */
  materials: MeshStandardMaterial[]
}

export class RobotLayer {
  readonly group = new Group()

  private readonly loader = new GLTFLoader()
  private readonly projection: FloorProjection
  private readonly robots = new Map<string, RobotEntry>()
  /** One fetch per model URL however many instances are spawned from it. */
  private readonly modelCache = new Map<string, Promise<GLTF>>()
  /**
   * The ORIGINALS behind the clones. Clones share their geometry and materials
   * with these, so only the originals may ever be disposed — freeing a clone
   * would pull the geometry out from under every other instance of that model.
   */
  private readonly sources = new Set<Object3D>()
  /**
   * Markers this layer BUILT rather than cloned. Their geometry and materials
   * belong to them alone, so — unlike a GLB clone, which shares both with its
   * cached source — they must be freed the moment they are removed.
   */
  private readonly owned = new Set<Object3D>()
  private highlighted: string | null = null
  private disposed = false

  constructor (parent: Object3D, projection: FloorProjection) {
    this.projection = projection
    this.group.name = 'robots'
    parent.add(this.group)
  }

  get ids (): string[] {
    return [...this.robots.keys()]
  }

  /**
   * Add a robot. Safe to call for an id that already exists — the existing
   * instance is replaced rather than duplicated, which is what makes this usable
   * straight from a reactive watcher over the fleet.
   */
  async spawn (spec: RobotSpawnSpec): Promise<Object3D | null> {
    let request = this.modelCache.get(spec.modelUrl)
    if (!request) {
      request = this.loader.loadAsync(spec.modelUrl)
      this.modelCache.set(spec.modelUrl, request)
    }

    const gltf = await request
    if (this.disposed) return null
    this.sources.add(gltf.scene)

    // SkeletonUtils rather than Object3D.clone(): a plain clone shares the
    // skeleton, so every instance of an animated robot would move as one.
    const root = cloneSkinned(gltf.scene)
    root.name = `robot:${spec.id}`
    root.userData.robotId = spec.id

    if (spec.sizeM) scaleToMetres(root, spec.sizeM.heightM, this.projection.worldPerMetre)

    // Measured now, while the clone is still unparented and unposed — this is the
    // pivot correction, and it has to be taken before anything moves the model.
    const liftY = baseOffsetY(root)
    // Applied here as well as in `setPose`, so a robot spawned without a pose is
    // never standing in the floor for the frames before its first telemetry tick.
    root.position.y = liftY

    root.traverse(child => {
      const mesh = child as Object3D & { isMesh?: boolean; castShadow?: boolean; receiveShadow?: boolean }
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.receiveShadow = true
      }
    })

    this.remove(spec.id)

    // Repaint into the house livery BEFORE the instance is registered, so it is
    // never visible in the model's own colours for a frame.
    const materials = spec.livery ? applyLivery(root, spec.livery) : []

    const clips = gltf.animations ?? []
    this.robots.set(spec.id, {
      root,
      clips,
      materials,
      baseOffsetY: liftY,
      yawOffset: spec.yawOffset ?? 0,
      mixer: clips.length ? new AnimationMixer(root) : null,
    })
    this.group.add(root)

    if (spec.pose) this.setPose(spec.id, spec.pose)
    return root
  }

  /**
   * Stand in for a chassis that has no GLB yet.
   *
   * ⚠️ THIS IS NOT A SUBSTITUTE ROBOT. It is deliberately a schematic solid — a
   * slab and a nose, flat-shaded, in the same colour the 2D map gives that type
   * — and it must stay obviously diagrammatic. The distinction is the whole
   * point: drawing a Type C as a Type A would be a wrong robot on an operations
   * map, which an operator could act on; drawing it as a marker says "this unit
   * is here, facing this way, and we have no model for it", which is true.
   *
   * It exists because the alternative is worse. A fleet of sixteen where ten are
   * invisible reads as a broken view, not as an honest one, and the units really
   * are there — driving real routes, holding real reservations.
   *
   * Delete nothing when the models arrive: set the type's `modelUrl` in
   * `src/data/fleet.ts` and the viewer stops asking for a marker.
   */
  spawnMarker (spec: {
    id: string
    sizeM: { lengthM: number; widthM: number; heightM: number }
    color: string
    pose?: RobotPose
  }): Object3D {
    const metre = this.projection.worldPerMetre
    const root = new Group()
    root.name = `robot:${spec.id}`
    root.userData.robotId = spec.id
    root.userData.schematic = true

    const tint = new Color(spec.color)
    const material = new MeshStandardMaterial({
      color: tint,
      roughness: 0.55,
      metalness: 0.05,
      // Self-lit enough to stay readable inside a dim hall shell without needing
      // the scene's lighting rig tuned around it.
      emissive: tint.clone().multiplyScalar(0.25),
    })

    // TRUE SIZE, from the same `sizeM` contract a real model is scaled to — so a
    // chassis awaiting its GLB occupies exactly the space it will occupy once
    // the GLB lands, and nothing about the hall's proportions changes when it
    // does. The marker reads as schematic because it is a flat-shaded box with a
    // nose on it, not because it is the wrong size.
    const { lengthM, widthM, heightM } = spec.sizeM
    const body = new Mesh(
      new BoxGeometry(widthM * metre, heightM * metre, lengthM * metre),
      material,
    )
    body.position.y = (heightM / 2) * metre
    body.castShadow = true
    body.receiveShadow = true
    root.add(body)

    // A nose, so facing is legible from above at wall-display distance. -Z is
    // the scene's forward for a zero heading, matching `setPose` below.
    const nose = new Mesh(
      new ConeGeometry(widthM * 0.28 * metre, lengthM * 0.3 * metre, 4),
      material,
    )
    nose.rotation.set(Math.PI / 2, 0, Math.PI / 4)
    nose.position.set(0, (heightM / 2) * metre, -(lengthM * 0.6) * metre)
    nose.castShadow = true
    root.add(nose)

    this.remove(spec.id)
    this.owned.add(root)
    // No pivot correction: this marker is BUILT rather than imported, and its
    // parts are placed above y = 0 on purpose, so its origin already is its base.
    this.robots.set(spec.id, { root, clips: [], mixer: null, yawOffset: 0, baseOffsetY: 0, materials: [] })
    this.group.add(root)

    if (spec.pose) this.setPose(spec.id, spec.pose)
    return root
  }

  /** Move a robot. Called every telemetry frame; allocates one Vector3. */
  setPose (id: string, pose: RobotPose) {
    const entry = this.robots.get(id)
    if (!entry) return
    entry.root.position.copy(this.projection.toWorld(pose.planX, pose.planY, pose.height ?? 0))
    // `toWorld` puts the ORIGIN on the floor; this puts the model ON it. The two
    // are the same number only for an asset whose pivot is at its base, and one
    // of the four is not — see `baseOffsetY`. `pose.height` still means metres of
    // clearance under the machine, so the two add rather than compete.
    entry.root.position.y += entry.baseOffsetY
    // Negated because plan-space y runs DOWN while world yaw runs counter-clockwise,
    // and offset by the projection's own rotation because that rotation moved the
    // POSITIONS this heading was computed against. Without the second term a unit
    // is placed correctly and faces a quarter turn off its direction of travel.
    if (pose.headingRad !== undefined) {
      entry.root.rotation.y = -(pose.headingRad + this.projection.rotationY) + entry.yawOffset
    }
  }

  /** Play a named clip from the robot's own GLB, if it has one. */
  playClip (id: string, clipName: string, loop = true) {
    const entry = this.robots.get(id)
    if (!entry?.mixer) return
    const clip = entry.clips.find(c => c.name === clipName)
    if (!clip) return
    const action = entry.mixer.clipAction(clip)
    action.setLoop(loop ? 2201 /* LoopRepeat */ : 2200 /* LoopOnce */, Infinity)
    action.reset().play()
  }

  /**
   * Exactly one robot is highlighted at a time, mirroring the 2D map's rule that
   * selection is a single loud thing among quiet ones. Drives it by flagging the
   * subtree rather than by editing materials, so the GLB's own look is never
   * mutated and deselection needs no saved-state restore.
   */
  setSelected (id: string | null) {
    if (this.highlighted === id) return
    this.highlighted = id
    for (const [robotId, entry] of this.robots) {
      entry.root.userData.selected = robotId === id
    }
  }

  get selectedId (): string | null {
    return this.highlighted
  }

  /** Advance animation mixers. Call from the render loop with a delta in seconds. */
  update (deltaSeconds: number) {
    for (const entry of this.robots.values()) entry.mixer?.update(deltaSeconds)
  }

  /**
   * Detach an instance. Deliberately does NOT dispose its geometry or materials:
   * a clone shares both with the cached source, so freeing them here would blank
   * every other robot of the same type. The sources are freed once, in dispose().
   */
  remove (id: string) {
    const entry = this.robots.get(id)
    if (!entry) return
    entry.mixer?.stopAllAction()
    this.group.remove(entry.root)
    // Livery materials belong to this instance alone — a clone shares its
    // geometry with the cached source, but not the paint applied over it.
    for (const material of entry.materials) material.dispose()
    // A schematic marker owns its geometry outright, so it really is freed here.
    if (this.owned.has(entry.root)) {
      disposeObject(entry.root)
      this.owned.delete(entry.root)
    }
    this.robots.delete(id)
  }

  dispose () {
    if (this.disposed) return
    this.disposed = true
    for (const id of [...this.robots.keys()]) this.remove(id)
    // Now that no clone references them, the shared originals can go.
    for (const source of this.sources) disposeObject(source)
    this.sources.clear()
    this.modelCache.clear()
    this.group.removeFromParent()
  }
}
