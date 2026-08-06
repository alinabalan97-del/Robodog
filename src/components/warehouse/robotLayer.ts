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

/**
 * ── WHERE A CHASSIS CARRIES ITS LOAD ─────────────────────────────────────────
 *
 * ⚠️ AUTHORED PER CHASSIS, NOT DERIVED, AND THE FIRST VERSION OF THIS GOT IT
 * WRONG BY TRYING TO DERIVE IT. Cargo was placed on the model's bounding-box
 * TOP, on the reasoning that a robot carries on its deck. That is true of a flat
 * shuttle and false of every other shape: an open-frame AMR carries INSIDE its
 * frame, between the side columns, and a forklift carries ahead of itself on
 * forks. On the open-frame unit the box floated clear above the machine — the
 * geometry was correct and the anchor was meaningless.
 *
 * A bounding box cannot find a loading bay: the bay is a VOID in the model, and
 * the box that encloses the model says nothing about the holes in it. So these
 * are measured off the asset by a human once, exactly as `yawOffset` is and for
 * the same reason (CLAUDE.md → "yawOffset needs a human once").
 *
 * All three are METRES, like every physical dimension in this codebase — never
 * plan units, and never fractions of a bounding box.
 */
export interface CargoBay {
  /**
   * Height of the bay FLOOR above the ground, in metres — where the box rests.
   *
   * Measured to the surface the load actually sits on: the internal platform of
   * an open frame, the top of a flat deck, the fork blades. Not the top of the
   * chassis.
   */
  liftM: number
  /** Metres AHEAD of the chassis centre. Zero for a bay the unit carries within. */
  forwardM: number
  /**
   * The load's largest dimension once carried, in metres.
   *
   * ⚠️ THIS IS A FIT, NOT A STYLE CHOICE. The box has to clear the columns of
   * the bay it sits in, so it is sized against the compartment rather than to a
   * single fleet-wide figure — one size that suits a forklift's forks pushes
   * straight through the sides of a cart tug's frame.
   */
  fitM: number
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
  /** Where this chassis carries its load. See `CargoBay`. */
  cargoBay?: CargoBay
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
  /**
   * ⚠️ `identity` IS GONE, AND ITS ABSENCE IS DELIBERATE. The layer used to bolt
   * a per-unit beacon, mast band and deck marking onto each chassis; all three
   * are removed (see the note in `spawn`). Nothing here reads a unit's accent
   * any more — the livery paints it onto the indicator faces instead — so a
   * field carrying one would be plumbing with no consumer, which is exactly the
   * kind of quiet dead code this file's history is full of.
   *
   * A unit is told apart by its call-sign and by that accent on its lamps.
   */
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
  /** 1 / the root's uniform scale. Cargo is built in world units — see `setCargo`. */
  inverseScale: number
  /** This chassis's loading bay, or null to carry nothing. See `CargoBay`. */
  cargoBay: CargoBay | null
  /** The box currently on this unit, or null. Parented to `root`, so it just follows. */
  cargo: Object3D | null
  /**
   * Per-instance materials created by the repaint; nothing else will free them.
   *
   * ⚠️ THE FLEET'S GLOW LIVES ENTIRELY IN HERE, which is why this layer has no
   * glow-related field of its own. A robot's light is a Fresnel rim on these
   * materials plus the indicator faces' own emissive — surface properties of
   * the chassis, not objects added beside it. Nothing is parented to a robot to
   * make it glow, and nothing should be.
   */
  materials: MeshStandardMaterial[]
}

export class RobotLayer {
  readonly group = new Group()

  private readonly loader = new GLTFLoader()
  private readonly projection: FloorProjection
  private readonly robots = new Map<string, RobotEntry>()
  /** One fetch per model URL however many instances are spawned from it. */
  private readonly modelCache = new Map<string, Promise<GLTF>>()
  /** The cargo GLB, once `useCargoModel` has been called. Null means no loads drawn. */
  private cargoUrl: string | null = null
  /** Units with a cargo load already in flight — see `setCargo`. */
  private readonly cargoPending = new Set<string>()
  /** One diagnostic per session, not per pickup. See the log in `setCargo`. */
  private cargoReported = false
  /**
   * Trace every step of a cargo attach and drop a probe at world origin.
   *
   * Off unless the page is opened with `?debugCargo=1` — see the viewer. It is a
   * URL switch rather than a build flag so it can be turned on against the
   * running app, which is the only place this failure is observable.
   */
  debugCargo = false
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
    const rootScale = root.scale.x || 1
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

    // ⚠️ NOTHING IS BOLTED ONTO A CHASSIS ANY MORE, AND THAT IS THE WHOLE OF
    // `addIdentity` GONE — beacon, mast band and now the deck marking too.
    //
    // The marking was a flat decal in the unit's own accent whose SHAPE differed
    // per unit — a chevron, a cross, a stripe. Two things were wrong with it.
    // A chevron in violet lying across a machine reads as a DIRECTION ARROW on
    // an operations display: it looks like the thing that says where the robot
    // is going, which is a claim the plate cannot back up, and an operator
    // acting on it would be acting on decoration. And it was positioned from the
    // instance root, which for the forklift is authored at the machine's CENTRE
    // rather than its base (`baseOffsetY`) — so on that chassis the decal did
    // not lie on the deck at all, it floated across the middle of the mast.
    //
    // ⚠️ IDENTITY NARROWS TO TWO CHANNELS: the unit's accent colour, which the
    // livery still paints onto its indicator faces, and its call-sign, which the
    // roster and the 2D map both show. The note on `UnitLivery` in
    // `src/data/fleet.ts` asks for three redundant channels precisely so that
    // colour is never load-bearing alone; with the shape channel gone, the
    // call-sign is what carries identity for a colourblind operator, and it has
    // to stay legible wherever a unit is named.

    const clips = gltf.animations ?? []
    this.robots.set(spec.id, {
      root,
      clips,
      materials,
      baseOffsetY: liftY,
      cargoBay: spec.cargoBay ?? null,
      inverseScale: 1 / rootScale,
      cargo: null,
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
    /** Same contract as `RobotSpawnSpec.cargoBay` — a marker carries too. */
    cargoBay?: CargoBay
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
      // ⚠️ NO EMISSIVE — AND THIS ONE IS EASY TO OVERLOOK BECAUSE IT NORMALLY
      // NEVER RENDERS. `spawnMarker` only runs for a chassis with no GLB, or for
      // one whose GLB FAILED TO LOAD, and the robot models here total ~250 MB —
      // so a single failed fetch would put a self-lit cone in that unit's
      // primary-family accent (blue or violet) on the floor, indistinguishable
      // from the glow effects being hunted. Nothing in this scene emits now,
      // including the thing that only appears when something has gone wrong.
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
    // A marker is built at true size and unscaled, so its deck is simply its own
    // height and its local space is already world space.
    this.robots.set(spec.id, {
      root,
      clips: [],
      mixer: null,
      yawOffset: 0,
      baseOffsetY: 0,
      cargoBay: spec.cargoBay ?? null,
      inverseScale: 1,
      cargo: null,
      materials: [],
    })
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
  /**
   * ── THE LOAD ON A ROBOT'S DECK ──────────────────────────────────────────────
   *
   * Point this at the cargo GLB once; `setCargo` then puts one on any unit the
   * simulation says is carrying. Separate from the constructor because the model
   * is optional — a fleet with no cargo asset simply never calls this and every
   * other part of the layer is unaffected.
   */
  useCargoModel (modelUrl: string): void {
    this.cargoUrl = modelUrl
  }

  /**
   * Show or hide this unit's load.
   *
   * ⚠️ THE BOX IS PARENTED TO THE ROBOT, WHICH IS THE WHOLE DESIGN. `setPose`
   * already moves the root every frame, so a child rides along with it for free
   * — no second transform to keep in step, and therefore no way for the load to
   * lag or drift from the machine carrying it. The alternative, tracking the box
   * as a sibling and copying the pose into it, is the same picture on a good
   * frame and a box sliding across the floor on a bad one.
   *
   * ⚠️ IDEMPOTENT, BECAUSE THE CALLER IS A PER-FRAME WATCHER. `carrying` is
   * republished sixty times a second and is true for the whole of a delivery, so
   * this has to be a no-op on all but the two frames where it actually changes;
   * rebuilding the clone each tick would load and leak a box per frame.
   *
   * Async only on the first call per URL — after that the GLB is served from the
   * same `modelCache` the chassis use.
   */
  async setCargo (id: string, carrying: boolean): Promise<void> {
    const entry = this.robots.get(id)
    if (!entry || !this.cargoUrl) return
    if (carrying === (entry.cargo !== null)) return
    // A chassis with no declared bay carries nothing rather than guessing. An
    // invented anchor is what put a box in mid-air over the open-frame unit.
    const bay = entry.cargoBay
    if (carrying && !bay) return

    if (!carrying) {
      // ⚠️ REMOVED, NOT DISPOSED. A clone shares its geometry and materials with
      // the cached source, exactly as a chassis clone does — freeing them here
      // would pull the box out from under every other unit carrying one, and
      // from the next unit to pick one up. The source is released once, in
      // `dispose`, via `sources`.
      entry.cargo?.removeFromParent()
      entry.cargo = null
      return
    }
    // Narrowed for the attach path below — the guard above already returned for
    // a bay-less chassis, and this tells the compiler so.
    if (!bay) return

    // ⚠️ ONE IN-FLIGHT ATTACH PER UNIT. `carrying` stays true for the whole of a
    // delivery and this is called every frame, so between the first frame and
    // the load resolving — SECONDS, on a 57 MB asset — every one of those frames
    // re-entered here, because `entry.cargo` is still null the whole time. They
    // all awaited the same cached promise so nothing downloaded twice, but it
    // queued hundreds of continuations per pickup for no reason.
    if (this.cargoPending.has(id)) return
    this.cargoPending.add(id)
    if (this.debugCargo) console.info(`[cargo] 1 · ${id} carrying — requesting ${this.cargoUrl}`)

    let gltf: GLTF
    try {
      let request = this.modelCache.get(this.cargoUrl)
      if (!request) {
        request = this.loader.loadAsync(this.cargoUrl)
        this.modelCache.set(this.cargoUrl, request)
      }
      gltf = await request
    } catch (error) {
      // ⚠️ REPORTED, AND THE CACHE ENTRY IS EVICTED. A rejected promise left in
      // the cache poisons every later pickup in the session — each one awaits
      // the same failure — so the fleet would carry nothing for the rest of the
      // run from a single transient 404. Dropping it lets the next pickup retry.
      this.modelCache.delete(this.cargoUrl)
      this.cargoPending.delete(id)
      console.error(
        `[warehouse] cargo model failed to load from "${this.cargoUrl}" — `
        + 'robots will carry nothing until this is fixed', error,
      )
      return
    }
    this.cargoPending.delete(id)
    if (this.disposed) return

    // Re-checked after the await: a delivery can finish, or the unit can be
    // removed, while the very first box in the run is still downloading.
    const live = this.robots.get(id)
    if (!live || live.cargo !== null) return

    this.sources.add(gltf.scene)
    const box = gltf.scene.clone(true)
    box.name = `cargo:${id}`

    if (this.debugCargo) {
      let meshes = 0
      box.traverse(c => { if ((c as { isMesh?: boolean }).isMesh) meshes++ })
      const native = new Box3().setFromObject(box).getSize(new Vector3())
      console.info(
        `[cargo] 2 · ${id} GLB loaded and cloned —`,
        `meshes=${meshes}`,
        `nativeSize=${native.x.toFixed(3)}×${native.y.toFixed(3)}×${native.z.toFixed(3)}`,
      )
      if (meshes === 0) {
        console.error('[cargo] the clone contains NO meshes — nothing can render. Check the GLB.')
      }
    }

    // Sized to the BAY, in metres — never in plan units, and never to a single
    // fleet-wide figure. Crossing those two scales is how the fleet once
    // rendered a third of its proper size (CLAUDE.md → "sized in METRES").
    scaleToMetres(box, bay.fitM, this.projection.worldPerMetre)

    // Built in world units, then the carrier below converts the whole thing into
    // the root's local space in one step — so nothing inside has to know that
    // the robot it is riding on is scaled.
    box.position.y = baseOffsetY(box)
    box.traverse(child => {
      const mesh = child as Object3D & {
        isMesh?: boolean
        castShadow?: boolean
        receiveShadow?: boolean
        frustumCulled?: boolean
        visible?: boolean
      }
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.visible = true
      // ⚠️ CULLING OFF, PERMANENTLY, NOT JUST WHILE DEBUGGING. Three culls by a
      // mesh's bounding sphere, and this mesh is a CLONE sharing geometry with a
      // cached source that is never itself in the scene — so nothing has
      // necessarily computed that sphere against the transform chain the clone
      // ends up under (a carrier inside a scaled robot root inside the content
      // root). A stale or unbuilt sphere culls an object that is plainly on
      // screen, which looks exactly like "the box never loaded". One extra
      // object per robot is not worth the ambiguity.
      mesh.frustumCulled = false
    })

    // ── ORIGIN PROBE ──────────────────────────────────────────────────────────
    //
    // ⚠️ A BISECTION, NOT A FIX. Cargo can fail to appear for two entirely
    // different classes of reason — the model never renders at all (loader,
    // material, culling, empty geometry), or it renders somewhere useless
    // (scale, anchor, parent transform) — and from outside those are the same
    // symptom. This drops the box at world origin, unparented and oversized,
    // where it is subject to none of the transform chain. If it appears, the
    // asset and the render path are sound and the fault is placement; if it does
    // not, placement was never the question.
    if (this.debugCargo) {
      const probe = box.clone(true)
      probe.name = 'cargo-probe'
      probe.scale.setScalar(4 * this.projection.worldPerMetre)
      probe.position.set(0, 0, 0)
      probe.traverse(child => {
        const mesh = child as Object3D & { isMesh?: boolean; frustumCulled?: boolean }
        if (mesh.isMesh) mesh.frustumCulled = false
      })
      this.group.add(probe)
      console.info(
        '[warehouse] cargo PROBE added at world origin, scale ×4 —',
        'if you cannot see this, the fault is the model or the render path,',
        'not the placement maths.',
      )
    }

    const carrier = new Group()
    carrier.name = `cargo-mount:${id}`
    // ⚠️ THE INVERSE SCALE IS WHAT MAKES THE CONTENTS WORLD-SIZED. Without it
    // the box inherits the chassis's scale on top of its own and comes out
    // wrong by exactly that factor — subtly on the AMR, absurdly on the AGV.
    carrier.scale.setScalar(entry.inverseScale)
    // ⚠️ THE BAY FLOOR IS MEASURED FROM THE GROUND, SO THE ROOT'S OWN PIVOT LIFT
    // HAS TO COME BACK OUT. The root sits at `baseOffsetY` above the floor plane
    // (that is what stands the model on the ground), so a child asking to be at
    // world height H must be placed at H − baseOffsetY in the root's parent
    // space, and then divided by the root's scale to reach its LOCAL space.
    // Skip either step and the box lands proportionally wrong on every chassis
    // whose pivot is not already at its base — which is one of the four.
    const worldLift = bay.liftM * this.projection.worldPerMetre

    // ── ⚠️ FORWARD IS NOT −Z INSIDE THE ROOT. `yawOffset` IS IN THE WAY. ───────
    //
    // The SCENE drives along −Z, and that is what the old code placed cargo
    // along. But the carrier is a child of the robot's ROOT, and the root's
    // rotation is `-(heading + rotationY) + yawOffset` — the quarter turn that
    // exists precisely because the forklift and the AGV were authored with their
    // long axis on X (CLAUDE.md → "yawOffset needs a human once"). So inside the
    // root, the model's nose points along ±X, not −Z, and an offset of −Z put
    // the load exactly 90° off: beside the machine instead of ahead of it. On a
    // forklift that is a pallet floating past the driver's shoulder.
    //
    // It went unnoticed because the two chassis carrying WITHIN themselves have
    // `forwardM: 0`, where a rotated zero is still zero — only the forklift, the
    // one chassis that carries ahead of itself, could show the fault. The note
    // in `CARGO_BAYS` calling its placement "confirmed by observation" was
    // written against this broken frame, so it confirmed the wrong thing.
    //
    // The fix is to undo the yaw for the carrier: place the offset along the
    // model-space direction that BECOMES travel-forward once the root's rotation
    // is applied, and turn the carrier back by the same angle so the box is
    // square to the direction of travel rather than to the mesh's authored axis.
    const yaw = entry.yawOffset
    const forwardWorld = bay.forwardM * this.projection.worldPerMetre
    carrier.rotation.y = -yaw
    carrier.position.set(
      Math.sin(yaw) * forwardWorld * entry.inverseScale,
      (worldLift - entry.baseOffsetY) * entry.inverseScale,
      -Math.cos(yaw) * forwardWorld * entry.inverseScale,
    )
    carrier.add(box)

    live.root.add(carrier)
    live.cargo = carrier

    if (this.debugCargo) {
      const world = new Box3().setFromObject(carrier)
      console.info(
        `[cargo] 3 · ${id} attached —`,
        `parent=${carrier.parent?.name}`,
        `rootInScene=${live.root.parent !== null}`,
        `worldY=${world.min.y.toFixed(3)}..${world.max.y.toFixed(3)}`,
        `worldW=${(world.max.x - world.min.x).toFixed(3)}`,
      )
      if (world.max.y < 0) console.error('[cargo] the box is BELOW the floor plane.')
      if (world.max.x - world.min.x < 0.01) console.error('[cargo] the box scaled to ~zero.')
    }

    // ⚠️ ONE DIAGNOSTIC, ON THE FIRST ATTACH OF THE SESSION. Cargo placement is
    // pure arithmetic over a scale nothing downstream validates — if the box
    // ends up inside the chassis, under the slab or a hundred times too big,
    // every one of those looks identical from outside: no box. Printing the
    // numbers that decide it turns "it does not work" into a reading. Kept to
    // one line and one occurrence so it never becomes noise.
    if (!this.cargoReported) {
      this.cargoReported = true
      const worldBox = new Box3().setFromObject(carrier)
      console.info(
        '[warehouse] cargo attached —',
        `unit=${id}`,
        `bayLiftM=${bay!.liftM}`,
        `rootScale=${(1 / entry.inverseScale).toFixed(4)}`,
        `worldY=${worldBox.min.y.toFixed(3)}..${worldBox.max.y.toFixed(3)}`,
        `worldSize=${(worldBox.max.x - worldBox.min.x).toFixed(3)}`,
        `visible=${carrier.visible}`,
        `parent=${carrier.parent?.name ?? 'none'}`,
      )
    }
  }

  remove (id: string) {
    const entry = this.robots.get(id)
    if (!entry) return
    entry.mixer?.stopAllAction()
    // Detached explicitly so the entry never outlives its mount. The clone
    // itself is shared geometry — see the note in `setCargo`.
    entry.cargo?.removeFromParent()
    entry.cargo = null
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
