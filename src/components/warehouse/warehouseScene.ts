/**
 * src/components/warehouse/warehouseScene.ts
 *
 * ── RENDERING + INTERACTION LAYER ────────────────────────────────────────────
 *
 * A framework-agnostic Three.js scene. No Vue in here on purpose: the viewer
 * component owns the lifecycle and the UI, this owns the WebGL. That split is
 * what lets the disposal story be exhaustive and testable, and it means a second
 * consumer (a fullscreen view, a Storybook entry) costs nothing.
 *
 * WHAT IT DOES NOT DO: it never invents content. It loads the warehouse GLB and
 * leaves its materials, textures and hierarchy exactly as authored — meshes only
 * get shadow flags. Robots and routes are separate layers mounted into
 * `contentRoot`; see robotLayer.ts / routeLayer.ts.
 *
 * ⚠️ DISPOSAL IS LOAD-BEARING. WebGL resources are not garbage collected — a
 * component that mounts and unmounts a few times while the operator switches
 * 2D/3D will exhaust GPU memory if geometries, materials, textures, the render
 * target and the context itself are not released. `dispose()` walks all of it
 * and is safe to call twice. Anything added here must be freed there.
 */

import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Material,
  Mesh,
  Object3D,
  PCFShadowMap,
  PMREMGenerator,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Timer,
  Texture,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import { HalfFloatType, WebGLRenderTarget } from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'
import { createWarehouseTextures, FLOOR_NORMAL_SCALE, STRUCTURE_NORMAL_SCALE } from './warehouseTextures'
import type { WarehouseTextureSet } from './warehouseTextures'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/**
 * How much of the building to cut away so only the interior is visible.
 *
 * ⚠️ THIS HAS TO BE GEOMETRIC, NOT NAME-BASED. The warehouse GLB carries no
 * semantics whatsoever — every node is `Node0…Node28`, every mesh is `Mesh0`,
 * and all of it shares ONE material. There is nothing named "roof", "wall" or
 * "parking" to hide, so the shell is removed by cutting space rather than by
 * selecting objects.
 *
 * Both values are FRACTIONS of the model's own bounding box, so they hold
 * whatever units the GLB was authored in.
 */
export interface InteriorClip {
  /**
   * Height to cut at, 0–1 of the model's total height. Everything above is
   * removed, which takes the roof and the upper walls with it and leaves the
   * dollhouse/floor-plan view. 1 disables the cut.
   */
  ceiling: number
  /**
   * Inset from each horizontal edge, 0–1 of the footprint. Trims whatever sits
   * outside the building — apron, parking, access roads, surrounding ground —
   * which a horizontal cut alone cannot reach because it is all at floor level.
   * 0 keeps the full footprint.
   */
  inset: number
}

/** Anything the scene can hand back when the operator clicks it. */
export interface PickResult {
  object: Object3D
  /** Nearest ancestor carrying a name — GLB authoring puts the meaning there. */
  named: Object3D | null
  point: Vector3
}

export interface WarehouseSceneEvents {
  onProgress?: (fraction: number) => void
  onPick?: (hit: PickResult | null) => void
  /** Overrides the default cut. Applied on load and retunable via setInteriorClip(). */
  interiorClip?: Partial<InteriorClip>
  /**
   * Called each frame with the delta in seconds. This is how layers get a tick
   * without the scene knowing what they are — RobotLayer drives its animation
   * mixers here, so a rigged robot GLB plays its clips with no change in here.
   */
  onFrame?: (deltaSeconds: number) => void
  /**
   * Resolved theme colours for the building's two surfaces.
   *
   * ⚠️ PASSED IN, NOT READ HERE, and that is the tokens-not-hex rule surviving
   * contact with a module that has no DOM. Two greys used to be hardcoded at the
   * call site below with a note saying theme tokens "would be ideal" — which
   * meant the one part of the app that could not follow a rebrand was the
   * building itself. The viewer already resolves tokens for every livery; it
   * resolves these too and hands them over.
   */
  surfaceTints?: { floor: string; structure: string }
}

export class WarehouseScene {
  readonly scene = new Scene()
  readonly camera: PerspectiveCamera
  readonly renderer: WebGLRenderer
  readonly controls: OrbitControls
  /** Everything that is not the building. Layers mount here. */
  readonly contentRoot = new Group()

  /** Bounds of the loaded warehouse, shell included. Empty until `load()` resolves. */
  readonly modelBounds = new Box3()
  /** Bounds of what is actually VISIBLE after clipping — what the camera frames. */
  readonly interiorBounds = new Box3()

  private readonly container: HTMLElement
  private readonly events: WarehouseSceneEvents
  private readonly loader = new GLTFLoader()
  /**
   * The frame clock. `Timer`, not the deprecated `Clock` — Three warns on every
   * page load otherwise, and a console that cries wolf is one nobody reads.
   *
   * ⚠️ `Timer` MUST BE `update()`d ONCE PER FRAME before `getDelta()` is read.
   * `Clock.getDelta()` measured and reset in the same call; `Timer` separates
   * the two, so a missing `update()` hands every consumer a delta of 0 and the
   * whole scene silently freezes while still rendering.
   */
  private readonly clock = new Timer()
  private readonly raycaster = new Raycaster()
  private readonly pointer = new Vector2()
  private readonly resizeObserver: ResizeObserver
  private readonly disposables = new Set<{ dispose: () => void }>()

  private model: Object3D | null = null
  /** Procedural surfaces for the building. Built on demand, freed in dispose(). */
  private surfaces: WarehouseTextureSet | null = null
  /** The pre-filtered reflection probe. A GPU target — see `addEnvironment`. */
  private environment: WebGLRenderTarget | null = null
  /** The post-processing chain. Null only between construction and `addPostProcessing`. */
  private composer: EffectComposer | null = null
  /** Screen-space ambient occlusion. See `addPostProcessing` for why it carries the racks. */
  private ao: GTAOPass | null = null
  private clip: InteriorClip = { ceiling: 0.45, inset: 0.04 }
  private frameHandle = 0
  private disposed = false
  /** Distinguishes a click from the end of an orbit drag. */
  private pointerDownAt: { x: number; y: number } | null = null

  constructor (container: HTMLElement, events: WarehouseSceneEvents = {}) {
    this.container = container
    this.events = events
    if (events.interiorClip) this.clip = { ...this.clip, ...events.interiorClip }

    this.scene.background = null

    this.camera = new PerspectiveCamera(45, 1, 0.1, 5000)
    this.camera.position.set(0, 10, 20)

    this.renderer = new WebGLRenderer({ antialias: true, alpha: true })
    // Capped at 2: this is a wall-display product and an uncapped DPR on a 4K
    // panel quadruples the fragment cost for no visible gain.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = SRGBColorSpace
    this.renderer.toneMapping = ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05
    this.renderer.shadowMap.enabled = true
    // PCFShadowMap: `PCFSoftShadowMap` is deprecated and Three silently substitutes
    // this one anyway, so naming it is what the renderer actually does.
    this.renderer.shadowMap.type = PCFShadowMap
    container.append(this.renderer.domElement)
    this.renderer.domElement.style.display = 'block'
    this.renderer.domElement.style.width = '100%'
    this.renderer.domElement.style.height = '100%'
    this.renderer.domElement.style.touchAction = 'none'

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.screenSpacePanning = false
    this.controls.enablePan = true
    this.controls.enableZoom = true
    // Full 360° azimuth (the default) but the polar angle stops just above the
    // floor, so the operator cannot end up looking at the underside of the slab.
    this.controls.minPolarAngle = 0.05
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02

    this.scene.add(this.contentRoot)
    this.addLighting()
    this.addEnvironment()
    this.addPostProcessing()

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()

    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown)
    this.renderer.domElement.addEventListener('pointerup', this.handlePointerUp)

    this.renderLoop()
  }

  /**
   * Industrial lighting: a cool skylight wash plus one strong key that casts the
   * shadows, and a dim opposite fill so the shadowed faces do not go black.
   * Deliberately few lights — a warehouse GLB is heavy enough without four
   * shadow-casting sources.
   */
  private addLighting () {
    // Skylight wash. A warehouse roof is mostly translucent panel, so the
    // dominant light is a cool sky above and a warm bounce off the slab below —
    // that vertical gradient is most of what makes the interior read as lit
    // rather than merely bright.
    // ⚠️ PULLED WAY DOWN FOR THE DARK-HALL LOOK, and the hemisphere is the light
    // that had to give. A skylight wash lifts EVERY upward-facing surface at
    // once — which is most of a warehouse — so it is the single biggest reason
    // the hall read as evenly bright. At this level the roof still reads as a
    // source but the floor is no longer lit by it, which is what lets the guide
    // lights in the slab be the brightest thing down there.
    const hemi = new HemisphereLight(0xB8CCE8, 0x141A24, 0.34)
    hemi.position.set(0, 50, 0)

    // The key. Shadows come from here and nowhere else: one shadow-casting
    // source on a model this size is a deliberate budget, and a second would
    // double the depth pass for contact darkening the AO term already supplies.
    const key = new DirectionalLight(0xFFF4E6, 2.6)
    key.position.set(1, 2.2, 1).multiplyScalar(30)
    key.castShadow = true
    // 4096 rather than 2048: the hall is ~29 m across and the frustum has to
    // cover all of it, so at 2048 a texel spans ~14 mm and rack uprights cast
    // visibly stepped shadows. The map is built once and costs no frame time.
    key.shadow.mapSize.set(4096, 4096)
    key.shadow.bias = -0.0004
    // ⚠️ normalBias IS WHAT KILLS SHADOW ACNE ON LARGE FLAT SURFACES, and the
    // floor is the largest one here. Raising it too far detaches contact
    // shadows from their object ("peter-panning"); this is tuned to the point
    // where the slab is clean and a forklift still touches its own shadow.
    key.shadow.normalBias = 0.035
    key.shadow.radius = 2

    // Opposite fill, cool and shadowless, so the faces the key misses are not
    // black. Warehouses have a lot of upward bounce off a pale floor.
    const fill = new DirectionalLight(0xC8D8FF, 0.55)
    fill.position.set(-1, 1.2, -0.8).multiplyScalar(30)

    // A low rim from the far end, which separates rack runs from each other in
    // a top-down view where the key alone flattens them into one mass.
    const rim = new DirectionalLight(0xFFE9D0, 0.35)
    rim.position.set(-0.6, 0.35, 1).multiplyScalar(30)

    // ⚠️ NEARLY OFF. Ambient is the enemy of depth — every unit of it lifts the
    // shadowed side of everything equally and undoes the contrast the lights
    // above exist to create — and on a dark floor it is also what turns
    // graphite into flat mid-grey. What little fill the shadows need now comes
    // from the reflection probe (`addEnvironment`), which at least falls off
    // with orientation instead of being a constant added everywhere.
    this.scene.add(hemi, key, fill, rim, new AmbientLight(0xFFFFFF, 0.05))
  }

  /**
   * ── THE POST-PROCESSING CHAIN ──────────────────────────────────────────────
   *
   * `RenderPass → GTAOPass → OutputPass`. Ambient occlusion is the only effect
   * left; see the note inside for why bloom was removed.
   *
   * ⚠️ `OutputPass` MUST BE LAST. Tone mapping and the sRGB conversion move off
   * the renderer and into the chain the moment a composer exists — without it
   * the whole scene renders washed out and over-bright, which reads as a
   * lighting bug rather than a missing pass.
   */
  private addPostProcessing () {
    const { clientWidth, clientHeight } = this.container
    const width = Math.max(1, clientWidth)
    const height = Math.max(1, clientHeight)

    const target = new WebGLRenderTarget(width, height, {
      type: HalfFloatType,
      // MSAA in the composer's own target: once rendering goes through a chain
      // the renderer's `antialias: true` no longer applies to the scene pass.
      samples: 4,
    })

    const composer = new EffectComposer(this.renderer, target)
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    composer.setSize(width, height)
    composer.addPass(new RenderPass(this.scene, this.camera))

    // ── AMBIENT OCCLUSION ─────────────────────────────────────────────────────
    //
    // ⚠️ THIS IS THE ONLY LEVER LEFT FOR RACK DEPTH, AND THE REASON IS THE
    // ASSET. `scripts/_inspect-warehouse.mjs` reported it: 28 meshes, ONE
    // material, every mesh named `Mesh0`, and the largest single primitive holds
    // 52.8 % of all geometry while spanning 17.2 × 5.1 × 30.9 m — the whole
    // building. Rack frames, shelves and stored items are not separate meshes;
    // they are interleaved inside primitives that each cover the entire hall. No
    // per-material treatment can give a frame a different surface from the shelf
    // bolted to it, because to the renderer they are the same object.
    //
    // AO sidesteps that entirely: it works on DEPTH AND NORMALS rather than on
    // materials, so it darkens the contact between an upright and a beam, and
    // between a box and the shelf under it, without either needing to be
    // addressable. It is what stops racking reading as one flat extrusion.
    const ao = new GTAOPass(this.scene, this.camera, width, height)
    // Metres — the model is authored in them. Roughly a shelf gap: large enough
    // to darken the pocket between two levels, small enough that a rack run does
    // not shadow the aisle beside it.
    ao.updateGtaoMaterial({ radius: 0.35, distanceExponent: 1.4, thickness: 0.4, scale: 1.1 })
    ao.output = GTAOPass.OUTPUT.Default
    composer.addPass(ao)
    this.ao = ao

    // ⚠️ THE BLOOM PASS IS GONE, AND IT IS BECAUSE ITS SUBJECT IS GONE. It was
    // added for one thing: the aisle guides, which were additive cyan strips
    // driven above display white so they would wash light onto the floor. Those
    // are dark inlays now, and the loud emitters that followed them — emergency
    // beacons, identity badges, roof domes, dock lamps, crane lamps — have all
    // since been removed.
    //
    // A bloom pass with nothing to bloom does not sit idle: it selects on
    // BRIGHTNESS, so with no emitters left the brightest thing in a black hall
    // is whatever is merely well LIT — and that turned out to be the white
    // cargo box, which smeared into a horizontal white streak on every laden
    // forklift. The boxes were rendering correctly the whole time; the pass was
    // eating them.
    //
    // ⚠️ THE ROBOTS GLOW, AND THAT IS AN ARGUMENT AGAINST THIS, NOT FOR IT.
    // `robotLivery.ts` gives each machine a Fresnel silhouette rim and lit
    // indicator faces — the effect a bloom pass would traditionally be reached
    // for, done on the MATERIAL precisely because this pass could not deliver
    // it. Both are deliberately kept UNDER the value of a well-lit surface,
    // which is the one range bloom cannot separate from the cargo box: there is
    // no threshold that catches a faint blue rim and misses a lit white crate.
    // A rim glows because it IS a glow; bloom only knows how bright a pixel is.
    //
    // ⚠️ SO IF A BLOOM PASS EVER COMES BACK it is additional to the fleet's own
    // glow, never a replacement for it, and its threshold has to clear the
    // brightest LIT surface as well as the rim and indicator levels — or it
    // finds the cargo again and hazes the whole hall into the hologram look
    // that was rejected. The AO pass above is unaffected and stays.

    composer.addPass(new OutputPass())

    this.composer = composer

  }

  /**
   * ── SOMETHING FOR THE METAL TO REFLECT ─────────────────────────────────────
   *
   * ⚠️ WITHOUT THIS THE RACKING RENDERS BLACK. A metal surface is defined by
   * reflecting its surroundings and by having almost no diffuse response of its
   * own, so `metalness: 0.62` against an empty environment means 62 % of the
   * material returns nothing at all. Directional lights do not fill that in —
   * they give a specular highlight and nothing else. This is the other half of
   * the change that made the structure metal; see `applySurfaces`.
   *
   * `RoomEnvironment` is a small generated box of emissive panels — the standard
   * Three studio stand-in. It is used INSTEAD of an HDRI file on purpose: the
   * project already ships ~380 MB of GLBs and first paint is the known
   * bottleneck (CLAUDE.md), so another multi-megabyte download for a reflection
   * nobody looks at directly is the wrong trade. It is generated once, costs one
   * small cube render, and is pre-filtered by `PMREMGenerator` so rough surfaces
   * get correctly blurred mips instead of a mirror.
   *
   * ⚠️ IT IS NOT A BACKGROUND. `scene.background` stays null — the canvas is
   * transparent over the panel's own themed fill, and assigning the environment
   * to both would put a visible grey studio box behind the building.
   */
  private addEnvironment () {
    const pmrem = new PMREMGenerator(this.renderer)
    const room = new RoomEnvironment()
    const target = pmrem.fromScene(room, 0.04)

    this.scene.environment = target.texture
    // Held so `dispose()` can free it: a PMREM render target is a GPU texture
    // and is not reachable by walking the scene graph the way a material is.
    this.environment = target

    // The generator and the source room are scaffolding — the filtered texture
    // is the product, and keeping either alive would hold a second copy of it.
    room.traverse(child => {
      if (child instanceof Mesh) {
        child.geometry?.dispose()
        const materials = Array.isArray(child.material) ? child.material : [child.material]
        for (const material of materials) material?.dispose()
      }
    })
    pmrem.dispose()
  }

  /**
   * ── GIVE THE BUILDING A SURFACE ────────────────────────────────────────────
   *
   * The GLB ships one flat material for the whole hall, which is why it reads as
   * clay. This assigns two: worn concrete to the floor, painted steel to
   * everything standing on it.
   *
   * ⚠️ CLASSIFIED BY GEOMETRY, NOT BY NAME, because there are no names — every
   * node in this asset is `Node0…Node28` and every mesh is `Mesh0`. A mesh is
   * FLOOR when its bounding box is flat (height under a few percent of the
   * building) and sits in the lowest part of it. That is the same reasoning
   * `InteriorClip` uses to find the roof, and it is the only test this model
   * supports.
   *
   * ⚠️ IT RE-SURFACES; IT NEVER ADDS GEOMETRY. Racking, shelving and walls are
   * IN the GLB (CLAUDE.md → "Never draw a warehouse"). Nothing here creates a
   * mesh, and nothing here should.
   *
   * ⚠️ MATERIALS ARE CLONED PER MESH. The whole building shares one material
   * instance, so assigning maps to it in place would put the floor's concrete on
   * the racking too — the same trap the robot livery documents.
   */
  private applySurfaces (): void {
    if (!this.model || this.disposed) return

    const bounds = new Box3().setFromObject(this.model)
    const size = bounds.getSize(new Vector3())
    if (!(size.y > 1e-6)) return

    // Theme-resolved when the viewer supplies them (it does); the literals are
    // the headless fallback for a consumer with no DOM to read tokens from.
    const tints = this.events.surfaceTints
    this.surfaces ??= createWarehouseTextures(
      tints?.floor ?? '#8a8f96',
      tints?.structure ?? '#7c828a',
    )
    const surfaces = this.surfaces

    /** Flat and low ⇒ slab. Both tests, because racking shelves are flat too. */
    const isFloor = (box: Box3) => {
      const s = box.getSize(new Vector3())
      const flat = s.y < size.y * 0.04
      const low = box.max.y < bounds.min.y + size.y * 0.06
      return flat && low
    }

    this.model.traverse(child => {
      if (!(child instanceof Mesh)) return
      const material = child.material
      if (Array.isArray(material) || !material) return
      const std = material as unknown as {
        isMeshStandardMaterial?: boolean
        clone: () => typeof material
      }
      if (!std.isMeshStandardMaterial) return

      const box = new Box3().setFromObject(child)
      const floor = isFloor(box)

      const clone = std.clone() as unknown as {
        map: Texture | null
        roughnessMap: Texture | null
        normalMap: Texture | null
        normalScale: Vector2
        roughness: number
        metalness: number
        envMapIntensity: number
        emissive: Color
        emissiveIntensity: number
        transparent: boolean
        opacity: number
        depthWrite: boolean
        needsUpdate: boolean
      }
      clone.map = floor ? surfaces.floorMap : surfaces.structureMap
      clone.roughnessMap = floor ? surfaces.floorRoughness : surfaces.structureRoughness
      clone.normalMap = floor ? surfaces.floorNormal : surfaces.structureNormal
      clone.normalScale = (floor ? FLOOR_NORMAL_SCALE : STRUCTURE_NORMAL_SCALE).clone()

      if (floor) {
        // ── DARK GRAPHITE, WITH A SHEEN ──────────────────────────────────────
        //
        // Sealed polished concrete rather than the bare matte slab this was:
        // dropping the roughness gives a broad, soft reflection that picks up
        // the racking and the machines standing on it, which is most of what
        // makes the floor read as a premium surface rather than as grey paper.
        //
        // ⚠️ 0.62 IS A FLOOR, NOT A STARTING POINT. Push it much lower and the
        // slab turns mirror: every robot gains a second, upside-down copy of
        // itself, and on an operations display a reflection that looks like a
        // vehicle is a genuine misread rather than a cosmetic one. This is the
        // roughest setting that still returns a visible sheen.
        // ── DEEP MATTE BLACK ─────────────────────────────────────────────────
        //
        // ⚠️ THE ENVIRONMENT PROBE IS WHAT WAS MAKING THIS GREY, NOT THE COLOUR.
        // The albedo has been near-black throughout; at `envMapIntensity: 0.7`
        // with a low roughness the slab was mirroring a bright studio probe
        // across its whole area, and a dark surface returning that much ambient
        // reflection renders as mid-grey no matter how black you paint it. This
        // is the number that had to come down, and it is the one to reach for if
        // the floor ever looks washed out again.
        // ⚠️ THE ALBEDO IS #000000 — THIS IS THE ONLY LEVER LEFT. A black
        // surface returns nothing from its diffuse term, so every photon the
        // floor sends back is specular: the probe reflection set here, plus the
        // highlights of the four lights. Colour cannot make this darker, because
        // there is no colour left; brightness now moves ONLY through this and
        // the roughness below.
        // Back up for the glossy finish. Safe to raise BECAUSE the albedo is
        // #000000: with no diffuse term there is nothing for a reflection to
        // wash out, so this adds a sheen over black instead of lifting the
        // surface toward grey. On a lighter floor the same value would look
        // washed out — the two settings only work as a pair.
        clone.envMapIntensity = 0.2
        // Matte. The reflection that remains is broad and dim rather than a
        // sharp mirror — enough for the guide lights and the machines to leave a
        // soft vertical echo, which is the "subtle reflections" part, without
        // lifting the surface off black.
        //
        // ⚠️ AT THIS DARKNESS THE ROUGHNESS MAP IS THE ONLY THING LEFT DRAWING
        // THE FLOOR. The albedo has no headroom for wear, aggregate or tyre
        // tracks — they all clamp to black — so what stops the slab being a void
        // is the roughness varying where the reflection lands. Raise the
        // roughness much further and even that flattens out.
        // ⚠️ SEALED, NOT POLISHED, AND THE ROUGHNESS MAP IS DOING THE WORK. This
        // is the base value; the map modulates it per-pixel, so the burnished
        // field reflects while the tile seams and aggregate scatter. That
        // variation is what makes a glossy floor read as a SURFACE rather than
        // as a sheet of glass — a uniform low roughness gives a mirror, which is
        // the failure mode at this end of the range.
        clone.roughness = 0.5
        clone.metalness = 0.05
      } else {
        // ── DARK TRANSLUCENT GLASS RACKING ───────────────────────────────────
        //
        // ⚠️ TRANSLUCENCY IS WHAT PRODUCES THE FRAME / SHELF / CONTENTS
        // CONTRAST, AND IT IS THE ONLY THING THAT CAN. This GLB is 28 meshes
        // sharing ONE material, every mesh named `Mesh0`, with the largest
        // primitive spanning the whole 17 × 5 × 31 m building — an upright, the
        // beam bolted to it and the box on it are literally the same object, so
        // no per-material treatment can tell them apart. An opaque pass
        // therefore had to render all of it as one flat value, which is exactly
        // why it kept reading as grey geometry.
        //
        // Translucency gets the separation from DEPTH instead of from material:
        // with depth writing off, every surface behind contributes, so a place
        // where the frame, a shelf and a tote overlap accumulates several layers
        // and reads darker and denser than bare frame. The structure separates
        // itself by how much of it there is along the line of sight — which is
        // precisely how the reference image reads, and it needs no semantics the
        // asset does not have.
        clone.transparent = true
        // ~62 % transparent. Low, BECAUSE IT STACKS: a deep rack run puts four
        // or five layers between the eye and the wall, and value compounds with
        // every one. Set this where a single pane looks right and a full run
        // turns into a solid block.
        clone.opacity = 0.38
        // ⚠️ THE LINE THAT MAKES THE STACKING HAPPEN. With depth writing on, the
        // nearest surface wins and everything behind it is discarded — which is
        // the flat single-value result. Off, the layers accumulate. Depth
        // TESTING is untouched, so an opaque robot in front still occludes the
        // racking correctly.
        clone.depthWrite = false

        // Crisper than paint: the thin bright rims along every frame member in
        // the reference are specular, and a rough surface smears them into a
        // dull sheen instead of holding them as edges.
        clone.roughness = 0.34
        clone.metalness = 0.15
        // ⚠️ PUSHED HIGH ON PURPOSE — this IS the edge lighting. A dielectric's
        // specular climbs steeply toward grazing angles, so on a translucent
        // member the probe lands almost entirely on the silhouette. It is what
        // draws the bright outline around each upright and shelf edge, and it
        // costs no emissive.
        clone.envMapIntensity = 1.15

        // ⚠️ NO EMISSIVE, SET EXPLICITLY, AND THE BUILDING IS THE REASON. The
        // fleet now carries a silhouette rim and lit details (`robotLivery.ts`) so
        // machinery reads as powered — but that only says "powered" while the
        // hall around it does NOT. Give the racking any emissive and the one
        // cue separating moving equipment from structure is spent on the
        // structure, and the whole interior hazes into the hologram look that
        // was rejected. What lights this surface is the environment probe and
        // the grazing specular above, which cost no emissive at all.
        clone.emissive = new Color(0x000000)
        clone.emissiveIntensity = 0
      }
      clone.needsUpdate = true
      child.material = clone as unknown as Material
      this.disposables.add(clone as unknown as { dispose: () => void })
    })
  }

  /** Aim the key light's shadow frustum at the model — the default box misses. */
  private fitShadowFrustum () {
    const bounds = this.interiorBounds.isEmpty() ? this.modelBounds : this.interiorBounds
    const size = bounds.getSize(new Vector3())
    const centre = bounds.getCenter(new Vector3())
    const radius = Math.max(size.x, size.y, size.z) * 0.75

    // ⚠️ SNAPSHOT THE CHILD LIST BEFORE WALKING IT. `scene.add` below detaches
    // the target from its current parent before re-appending it, so adding
    // while iterating `scene.children` splices the array the loop is walking —
    // and a light after the splice point gets skipped. It is re-runnable
    // (`setInteriorClip` calls it), so this is not a one-shot path.
    for (const light of [...this.scene.children]) {
      if (!(light instanceof DirectionalLight) || !light.castShadow) continue
      light.position.copy(centre).add(new Vector3(1, 2.2, 1).normalize().multiplyScalar(radius * 2))
      light.target.position.copy(centre)
      light.target.updateMatrixWorld()
      // Idempotent: re-adding an object that is already parented here would
      // remove and re-append it for no reason.
      if (light.target.parent !== this.scene) this.scene.add(light.target)

      const cam = light.shadow.camera
      cam.left = -radius
      cam.right = radius
      cam.top = radius
      cam.bottom = -radius
      cam.near = 0.5
      cam.far = radius * 6
      cam.updateProjectionMatrix()
    }
  }

  /**
   * Load the warehouse. Materials, textures and hierarchy are preserved exactly
   * as authored — the only mutation is enabling shadows per mesh.
   */
  async load (url: string): Promise<void> {
    const gltf = await this.loader.loadAsync(url, event => {
      // `lengthComputable` is false when the server sends no Content-Length,
      // which is common for large static assets. Report -1 so the UI can show an
      // indeterminate bar rather than a progress figure it cannot back up.
      const fraction = event.lengthComputable && event.total > 0
        ? event.loaded / event.total
        : -1
      this.events.onProgress?.(fraction)
    })

    if (this.disposed) {
      disposeObject(gltf.scene)
      return
    }

    this.model = gltf.scene
    this.model.traverse(child => {
      if (child instanceof Mesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    this.applySurfaces()

    this.scene.add(this.model)
    this.modelBounds.setFromObject(this.model)
    this.applyInteriorClip()
    this.fitShadowFrustum()
    this.frameAll()
  }

  /**
   * Cut the building open so only the interior shows: one downward plane takes
   * the roof and upper walls, four inward planes trim anything outside the
   * footprint. Nodes that end up wholly outside are also hidden outright —
   * clipping still rasterises and discards them, so dropping them is both
   * cheaper and the only way to remove detached surroundings entirely.
   *
   * Re-runnable: call `setInteriorClip()` any time to retune live.
   */
  private applyInteriorClip () {
    if (this.modelBounds.isEmpty()) return

    const size = this.modelBounds.getSize(new Vector3())
    const min = this.modelBounds.min
    const max = this.modelBounds.max

    const ceilingY = min.y + size.y * Math.min(Math.max(this.clip.ceiling, 0.02), 1)
    const insetX = size.x * Math.min(Math.max(this.clip.inset, 0), 0.45)
    const insetZ = size.z * Math.min(Math.max(this.clip.inset, 0), 0.45)

    this.interiorBounds.set(
      new Vector3(min.x + insetX, min.y, min.z + insetZ),
      new Vector3(max.x - insetX, ceilingY, max.z - insetZ),
    )

    // A plane keeps the half-space where `normal · p + constant > 0`.
    const planes = [
      new Plane(new Vector3(0, -1, 0), this.interiorBounds.max.y),
      new Plane(new Vector3(1, 0, 0), -this.interiorBounds.min.x),
      new Plane(new Vector3(-1, 0, 0), this.interiorBounds.max.x),
      new Plane(new Vector3(0, 0, 1), -this.interiorBounds.min.z),
      new Plane(new Vector3(0, 0, -1), this.interiorBounds.max.z),
    ]
    this.renderer.clippingPlanes = this.clip.ceiling >= 1 && this.clip.inset <= 0 ? [] : planes

    if (!this.model) return
    const nodeBox = new Box3()
    for (const node of this.model.children) {
      nodeBox.setFromObject(node)
      node.visible = nodeBox.intersectsBox(this.interiorBounds)
    }
  }

  /** Retune the cut at runtime — the two knobs that decide what "interior" means. */
  setInteriorClip (clip: Partial<InteriorClip>, reframe = true) {
    this.clip = { ...this.clip, ...clip }
    this.applyInteriorClip()
    this.fitShadowFrustum()
    if (reframe) this.frameAll()
  }

  get interiorClip (): InteriorClip {
    return { ...this.clip }
  }

  /**
   * Frame what is VISIBLE, not what was loaded. Framing the full model bounds
   * would pad the view for a roof and an apron that are no longer drawn, leaving
   * the interior small and off-centre.
   */
  frameAll (paddingFactor = 1.25) {
    const bounds = this.interiorBounds.isEmpty() ? this.modelBounds : this.interiorBounds
    if (bounds.isEmpty()) return

    const size = bounds.getSize(new Vector3())
    const centre = bounds.getCenter(new Vector3())
    const radius = Math.max(size.x, size.y, size.z) / 2 || 1

    const fov = (this.camera.fov * Math.PI) / 180
    const distance = (radius / Math.sin(fov / 2)) * paddingFactor

    // Near/far rescaled to the model so a 1000× units mismatch doesn't z-fight.
    this.camera.near = Math.max(distance / 1000, 0.01)
    this.camera.far = distance * 100
    this.camera.updateProjectionMatrix()

    this.camera.position.copy(centre).add(
      new Vector3(0.85, 0.62, 0.85).normalize().multiplyScalar(distance),
    )
    this.controls.target.copy(centre)
    this.controls.minDistance = radius * 0.05
    this.controls.maxDistance = distance * 4
    this.controls.update()
  }

  /**
   * Dolly the camera toward or away from what it is looking at.
   *
   * ⚠️ THIS EXISTS SO THE MAP'S ZOOM BUTTONS ARE NOT DEAD IN 3D. The control
   * cluster under the floor plan drove `FloorMap`'s viewBox and nothing else, so
   * in the 3D view pressing zoom did precisely nothing — the same failure the
   * traffic toggle is HIDDEN in 2D to avoid, and worse here because the button
   * was still offered. OrbitControls' own wheel zoom covers a mouse; it does not
   * cover a gloved hand on a ruggedized tablet, which is the floor this runs on.
   *
   * `factor` above 1 moves closer. Clamped to the same distance limits the
   * orbit controls enforce, so a button press can never put the camera somewhere
   * a drag could not — and `target` is left alone, so zooming does not pan.
   */
  zoomBy (factor: number) {
    if (!(factor > 0) || factor === 1) return
    const offset = this.camera.position.clone().sub(this.controls.target)
    const distance = offset.length()
    if (!(distance > 0)) return

    const next = Math.min(
      this.controls.maxDistance,
      Math.max(this.controls.minDistance, distance / factor),
    )
    if (next === distance) return

    this.camera.position.copy(this.controls.target).add(offset.multiplyScalar(next / distance))
    this.controls.update()
  }

  setBackground (cssColor: string | null) {
    this.scene.background = cssColor ? new Color(cssColor) : null
  }

  private resize () {
    const { clientWidth, clientHeight } = this.container
    if (!clientWidth || !clientHeight) return
    this.camera.aspect = clientWidth / clientHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(clientWidth, clientHeight, false)
    // ⚠️ THE CHAIN RESIZES TOO, and forgetting it is invisible until someone
    // resizes the panel: the composer keeps rendering at its construction size
    // and the result is stretched across the new canvas.
    this.composer?.setSize(clientWidth, clientHeight)
    this.ao?.setSize(clientWidth, clientHeight)
  }

  private handlePointerDown = (event: PointerEvent) => {
    this.pointerDownAt = { x: event.clientX, y: event.clientY }
  }

  /** Only a pointer that barely moved counts as a pick; anything else orbited. */
  private handlePointerUp = (event: PointerEvent) => {
    const down = this.pointerDownAt
    this.pointerDownAt = null
    if (!down || !this.events.onPick) return
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4) return

    const rect = this.renderer.domElement.getBoundingClientRect()
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(this.pointer, this.camera)

    // Robots and route ribbons sit in contentRoot and must win over the building
    // behind them, so both roots go in and the nearest hit wins.
    const targets: Object3D[] = [this.contentRoot]
    if (this.model) targets.push(this.model)

    const [hit] = this.raycaster.intersectObjects(targets, true)
    this.events.onPick(
      hit
        ? { object: hit.object, named: findNamed(hit.object), point: hit.point.clone() }
        : null,
    )
  }

  /** Register anything with a `dispose()` so it is released with the scene. */
  track (resource: { dispose: () => void }) {
    this.disposables.add(resource)
  }

  private renderLoop = () => {
    if (this.disposed) return
    this.frameHandle = requestAnimationFrame(this.renderLoop)
    // Advance first, then read: `Timer` does not reset on read the way `Clock` did.
    this.clock.update()
    this.events.onFrame?.(this.clock.getDelta())
    this.controls.update()
    // Through the chain when there is one. The direct render is kept as the
    // fallback rather than assumed away: if the composer ever fails to build,
    // the hall still draws without its glow instead of going black.
    if (this.composer) this.composer.render()
    else this.renderer.render(this.scene, this.camera)
  }

  /**
   * Release every GPU resource and listener. Idempotent — the viewer may call it
   * from both `onBeforeUnmount` and an error path.
   */
  dispose () {
    if (this.disposed) return
    this.disposed = true

    cancelAnimationFrame(this.frameHandle)
    this.surfaces?.dispose()
    this.surfaces = null
    // Not reachable by walking the scene graph, so `disposeObject` below cannot
    // find it — a remount would otherwise leak one filtered cube map per mount.
    this.scene.environment = null
    this.environment?.dispose()
    this.environment = null
    // Each pass owns full-screen render targets and materials; the composer's
    // own dispose walks them. Another GPU allocation the scene graph cannot see.
    this.composer?.dispose()
    this.composer = null
    this.ao = null
    this.resizeObserver.disconnect()
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown)
    this.renderer.domElement.removeEventListener('pointerup', this.handlePointerUp)

    for (const resource of this.disposables) resource.dispose()
    this.disposables.clear()

    this.controls.dispose()
    disposeObject(this.scene)
    this.scene.clear()
    this.model = null

    this.renderer.dispose()
    // Without this the browser keeps the context alive and a few remounts hit
    // the per-page WebGL context limit.
    this.renderer.forceContextLoss()
    this.renderer.domElement.remove()
  }
}

/** Nearest ancestor with a name — GLB authors put the semantics on named nodes. */
function findNamed (object: Object3D): Object3D | null {
  let node: Object3D | null = object
  while (node) {
    if (node.name) return node
    node = node.parent
  }
  return null
}

/**
 * Depth-first release of geometries, materials and every texture a material
 * holds. Exported because the layers need the same walk for their own subtrees.
 */
export function disposeObject (root: Object3D) {
  root.traverse(child => {
    if (!(child instanceof Mesh)) return
    child.geometry?.dispose()
    const materials: Material[] = Array.isArray(child.material) ? child.material : [child.material]
    for (const material of materials) {
      if (!material) continue
      // Every texture-ish value on a material is a `.map`-style slot; walking the
      // instance is the only way to catch them all across material types.
      for (const value of Object.values(material) as unknown[]) {
        if (value instanceof Texture) value.dispose()
      }
      material.dispose()
    }
  })
}
