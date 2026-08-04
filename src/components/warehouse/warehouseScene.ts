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
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
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
    const hemi = new HemisphereLight(0xB8CCE8, 0x1A2230, 1.1)
    hemi.position.set(0, 50, 0)

    const key = new DirectionalLight(0xFFF4E6, 2.4)
    key.position.set(1, 2.2, 1).multiplyScalar(30)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.bias = -0.0005
    key.shadow.normalBias = 0.02

    const fill = new DirectionalLight(0xC8D8FF, 0.5)
    fill.position.set(-1, 1.2, -0.8).multiplyScalar(30)

    this.scene.add(hemi, key, fill, new AmbientLight(0xFFFFFF, 0.25))
  }

  /** Aim the key light's shadow frustum at the model — the default box misses. */
  private fitShadowFrustum () {
    const bounds = this.interiorBounds.isEmpty() ? this.modelBounds : this.interiorBounds
    const size = bounds.getSize(new Vector3())
    const centre = bounds.getCenter(new Vector3())
    const radius = Math.max(size.x, size.y, size.z) * 0.75

    for (const light of this.scene.children) {
      if (!(light instanceof DirectionalLight) || !light.castShadow) continue
      light.position.copy(centre).add(new Vector3(1, 2.2, 1).normalize().multiplyScalar(radius * 2))
      light.target.position.copy(centre)
      light.target.updateMatrixWorld()
      this.scene.add(light.target)

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

  setBackground (cssColor: string | null) {
    this.scene.background = cssColor ? new Color(cssColor) : null
  }

  private resize () {
    const { clientWidth, clientHeight } = this.container
    if (!clientWidth || !clientHeight) return
    this.camera.aspect = clientWidth / clientHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(clientWidth, clientHeight, false)
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
    this.renderer.render(this.scene, this.camera)
  }

  /**
   * Release every GPU resource and listener. Idempotent — the viewer may call it
   * from both `onBeforeUnmount` and an error path.
   */
  dispose () {
    if (this.disposed) return
    this.disposed = true

    cancelAnimationFrame(this.frameHandle)
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
