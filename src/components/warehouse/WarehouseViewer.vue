<script setup lang="ts">
  /**
   * WarehouseViewer.vue — the 3D floor plan.
   *
   * The Vue half of the 3D stack: it owns mounting, the loading/error surface
   * and the reactive bridge, and nothing else. All WebGL lives in
   * ./warehouseScene.ts, robots in ./robotLayer.ts, paths in ./routeLayer.ts.
   * Keeping the component this thin is what makes disposal provable and lets the
   * scene be reused outside a Vue tree.
   *
   * SAME DATA AS THE 2D MAP. This takes the identical `FloorMap` the SVG view
   * takes, and selection is a prop plus an event — never local state. Switching
   * 2D↔3D therefore cannot reset the selected vehicle, the mission or anything
   * else: the state lives in the parent screen and both views are pure renderers
   * of it. The only thing that changes is which one is mounted.
   *
   * ⚠️ THE MODEL IS ~132 MB. First load is slow on any connection and the
   * progress readout matters. It is served from `public/`, so it is copied
   * verbatim into `dist/` and never bundled — see the note in floorOps.ts.
   */
  import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
  import AppIcon from '@/components/AppIcon.vue'
  import { WarehouseScene } from './warehouseScene'
  import { RobotLayer } from './robotLayer'
  import { RouteLayer } from './routeLayer'
  import { createFloorProjection } from './floorProjection'
  import type { FloorMap } from '@/data/floorOps'
  import { AsrsLayer } from './asrsLayer'
  import { ChargerLayer } from './chargerLayer'
  import { TrafficLayer } from './trafficLayer'
  import type { TrafficTelemetry } from '@/sim/trafficControl'
  import type { Livery } from './robotLivery'
  import { ROBOT_MODELS, ROBOT_STATE_TONE, UNIT_LIVERY } from '@/stores/fleet'
  import type {
    EmergencyMark,
    FleetCharger,
    FleetCrane,
    FleetRobot,
    RobotTypeId,
    TaskPriority,
  } from '@/stores/fleet'
  import { taskPriorities } from '@/stores/fleet'
  import { corridors, robotLivery } from '@/data/fleet'
  import type { RobotRoutePath } from '@/data/fleet'
  import { asrsCranes } from '@/data/asrs'

  const props = withDefaults(defineProps<{
    map: FloorMap
    /**
     * The same live fleet the 2D view renders, straight from the simulation
     * layer. Poses are pushed into RobotLayer in plan coordinates, so both views
     * read one array and a switch changes nothing but the renderer. This
     * component computes nothing about robot behaviour.
     */
    vehicles: FleetRobot[]
    /**
     * The ASRS stacker cranes, from the same simulation frame.
     *
     * ⚠️ THESE MOVE, on two axes, which is why they replaced the bolted-down
     * fixture that used to be drawn here. Each frame carries a position along
     * the crane's rail and a carriage height up its mast, and the layer puts
     * those on two independent nodes — see `asrsLayer.ts`.
     */
    cranes?: FleetCrane[]
    /**
     * The charging stalls, from the same frame. The docks themselves are built
     * from these positions; the live half is which stall is free, spoken for, or
     * actually delivering current.
     */
    chargers?: FleetCharger[]
    /**
     * The road network's live state, for the traffic overlay.
     *
     * ⚠️ NOT DRAWN UNLESS `showTraffic` IS ON. It is dense markup — a ribbon per
     * held lane block, a disc per junction, a ring per unit — and left on
     * permanently it competes with the machines it is meant to explain. Null
     * before the first frame, which draws nothing rather than drawing "clear".
     */
    traffic?: TrafficTelemetry | null
    /** Draw the traffic overlay. Off by default; the floor plan is the default view. */
    showTraffic?: boolean
    /** The selected unit's assignment — the same route the 2D view highlights. */
    robotRoute?: RobotRoutePath | null
    /**
     * The urgency of that unit's job, which is what colours the ribbon. Null
     * when it has no task, in which case the ribbon keeps its neutral treatment.
     * Same rule and same table as the 2D view — see `taskPriorities`.
     */
    routePriority?: TaskPriority | null
    /**
     * Both ends of every live emergency job, already resolved to positions by
     * the screen. Drawn as beacons — live state, not warehouse structure; see
     * Consumed by the 2D map only — the 3D beacon layer that drew these was
     * removed along with every other floating glow effect.
     */
    emergencyMarks?: EmergencyMark[]
    selectedVehicleId?: string | null
    /**
     * The map cluster's zoom step, shared with the 2D view.
     *
     * ⚠️ A LEVEL, NOT A DELTA, because the parent owns the value and both views
     * have to read the same one — `FloorMap` narrows its viewBox by it, and this
     * dollies the camera by the ratio between the old level and the new. That is
     * what makes the zoom buttons mean the same thing in both views instead of
     * being live in one and dead in the other.
     */
    zoom?: number
    /**
     * Draw the whole aisle network as inlaid paths set into the floor.
     *
     * ⚠️ THESE DO NOT EMIT. They were briefly additive cyan strips driven into
     * HDR so they would bloom, and turning that off was the fix for a floor that
     * had become a lightshow. They are near-black polished lines now — visible
     * because their finish differs from the slab, not because they glow (see
     * `RouteInput.engraved`), which is why leaving them on permanently is no
     * longer a problem: an inlay at rest looks like part of the building.
     *
     * Independent of `robotRoute`, which draws the SELECTED unit's path on its
     * own layer and is unaffected by this flag.
     */
    showRoutes?: boolean
    /**
     * How much of the shell to cut away, as a fraction of its height.
     *
     * ⚠️ 0.655 IS MEASURED, not chosen by eye. The building is 5.089 m tall; its
     * roof structure begins at 3.33 m and its racking tops out at 3.69 m
     * (`scripts/measure-models.mjs`). 0.655 puts the plane at 3.33 m — the
     * highest cut that removes the roof completely, and therefore the one that
     * keeps the most racking. The previous 0.45 was a guess: it cut at 2.29 m,
     * taking 1.4 m off the top of every rack in the hall and leaving a 2.2 m
     * forklift standing nearly as tall as the shelving it picks from, which is
     * a large part of why the scale looked wrong.
     */
    ceilingCut?: number
    footprintInset?: number
  }>(), {
    cranes: () => [],
    chargers: () => [],
    traffic: null,
    showTraffic: false,
    robotRoute: null,
    routePriority: null,
    emergencyMarks: () => [],
    selectedVehicleId: null,
    zoom: 1,
    showRoutes: true,
    ceilingCut: 0.655,
    footprintInset: 0.04,
  })

  const emit = defineEmits<{
    selectVehicle: [id: string]
    /** Any named node in the GLB — racks, stations, chargers, zones. */
    selectObject: [name: string]
  }>()

  const host = ref<HTMLElement | null>(null)
  const status = ref<'loading' | 'ready' | 'error'>('loading')
  const progress = ref(-1)
  const errorMessage = ref('')

  // shallowRef, not ref: Three.js objects are large cyclic graphs and making
  // them deeply reactive would both cost a fortune and break internal identity.
  const scene = shallowRef<WarehouseScene | null>(null)
  const robots = shallowRef<RobotLayer | null>(null)
  const routes = shallowRef<RouteLayer | null>(null)
  const activeRoute = shallowRef<RouteLayer | null>(null)
  const craneLayer = shallowRef<AsrsLayer | null>(null)
  const chargerLayer = shallowRef<ChargerLayer | null>(null)
  const trafficLayer = shallowRef<TrafficLayer | null>(null)

  /**
   * Resolve a theme token to a concrete colour — Three can't read CSS vars.
   *
   * ⚠️ MEMOISED, BECAUSE `getComputedStyle` IS A LAYOUT READ. Most callers here
   * resolve a handful of tokens once while building a layer, where the cost is
   * irrelevant. `applyTraffic` is the exception: it resolves two tokens PER
   * ROBOT PER FRAME, so with the overlay on the scene forced a style resolution
   * on the document element twenty times a second per unit — on the render
   * thread, for values that had not changed since the layer was built.
   *
   * The cache is cleared in `start()` rather than never, so a re-mount picks up
   * whatever theme is live then. It deliberately does NOT track a theme change
   * mid-session: no layer in this scene repaints on one either (every livery is
   * resolved once at build), so invalidating here alone would make the traffic
   * rings the only thing in the hall wearing the new palette.
   */
  const tokenCache = new Map<string, string>()

  function token (name: string): string {
    const hit = tokenCache.get(name)
    if (hit !== undefined) return hit
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue(`--v-theme-${name}`)
      .trim()
    const colour = raw ? `rgb(${raw.split(/\s+/).join(',')})` : '#ffffff'
    tokenCache.set(name, colour)
    return colour
  }

  function buildLayers (instance: WarehouseScene) {
    // Projected onto the INTERIOR box, not the full model: the operational layer
    // belongs to the floor an operator can see, not to the building's outer shell.
    //
    // Rotated a quarter turn because the shell is PORTRAIT (17.3 × 31.3) while the
    // operational plan is landscape. Without it the plan fits to the shell's narrow
    // axis and occupies barely a third of the floor; with it the two long axes line
    // up and the plan fills the hall. Uniform either way — never stretched.
    const projection = createFloorProjection(props.map.viewBox, instance.interiorBounds, {
      rotationY: Math.PI / 2,
    })

    // ⚠️ NO WAREHOUSE STRUCTURE IS GENERATED HERE, deliberately. An earlier
    // revision extruded racks, cells and docks from the 2D dataset into this
    // scene; that was wrong. The GLB already contains the shelving, racking,
    // workstations and equipment, so those boxes were a second, competing
    // warehouse drawn on top of the real one.
    //
    // CHARGING DOCKS ARE THE ONE EXCEPTION, and the distinction is not a
    // loophole. Racking is IN the model and merely unaddressable; a charging
    // stall is not in the model at all, while the simulation routes units to six
    // of them continuously. Leaving them out meant showing robots driving to an
    // empty patch of floor and stopping there. See chargerLayer.ts.
    //
    // The shelves in the GLB cannot be addressed individually — the model merges
    // them into a handful of unnamed meshes sharing one material — so anything
    // that needs a per-rack identity (pick targets, dock assignment, selection)
    // needs those positions supplied, not invented. See the note in floorOps.ts.

    // Both layers are tracked, so the scene's dispose() releases them even if
    // teardown is triggered from an error path rather than from unmount.
    const robotLayer = new RobotLayer(instance.contentRoot, projection)
    // Registered before any unit spawns, so a robot that arrives already laden
    // can put its box on in the same pass rather than a frame later.
    robotLayer.useCargoModel(CARGO_MODEL_URL)
    // Opt-in tracing for the cargo path: open the app with `?debugCargo=1`. A URL
    // switch rather than a build flag, because the failure is only observable in
    // the running scene.
    robotLayer.debugCargo = new URLSearchParams(window.location.search).has('debugCargo')
    const routeLayer = new RouteLayer(instance.contentRoot, projection)
    const activeRouteLayer = new RouteLayer(instance.contentRoot, projection)
    const craneRig = new AsrsLayer(instance.contentRoot, projection)
    const chargers = new ChargerLayer(instance.contentRoot, projection, {
      body: token(robotLivery.body),
      trim: token(robotLivery.trim),
      active: token('tertiary-bright'),
      reserved: token('warning'),
      ready: token('outline-medium'),
    })
    // ⚠️ THE EMERGENCY BEACON LAYER IS NO LONGER BUILT. It drew a floor disc and
    // a floating emissive cube at each end of every urgent job; at a shallow
    // camera angle the disc reads as a curved arc, and the bloom pass smeared
    // both into the glowing crescents and orbs that were cluttering the hall.
    //
    // ⚠️ THE INFORMATION IS NOT LOST, WHICH IS THE ONLY REASON THIS IS SAFE TO
    // DELETE. Emergencies are a binding domain concern, not decoration — but the
    // 2D map still flashes both ends of every live emergency, `TaskPanel` still
    // ranks them at the head of the queue, the header still counts them, and
    // `FloorOps` still raises a toast per event. What is gone is one redundant
    // rendering of it, not the signal.

    // Every colour resolved here, once, from live theme tokens — the layer holds
    // no palette of its own. Reused from the states they describe rather than
    // invented: a held block is the same `warning` an operator already reads as
    // "waiting" on a robot row, so the overlay and the roster agree.
    const trafficOverlay = new TrafficLayer(instance.contentRoot, projection, {
      occupied: token('secondary'),
      reserved: token('primary-bright'),
      junctionFree: token('outline-medium'),
      junctionHeld: token('warning'),
      junctionCongested: token('error'),
      safety: token('outline-medium'),
      destination: token('info'),
    })

    instance.track(robotLayer)
    instance.track(routeLayer)
    instance.track(activeRouteLayer)
    instance.track(craneRig)
    instance.track(chargers)
    instance.track(trafficOverlay)
    robots.value = robotLayer
    routes.value = routeLayer
    activeRoute.value = activeRouteLayer
    craneLayer.value = craneRig
    chargerLayer.value = chargers
    trafficLayer.value = trafficOverlay
    trafficOverlay.setVisible(props.showTraffic)
    applyTraffic()

    // Built from the telemetry's own positions, so a stall that moves in the
    // dataset moves here with no second list to keep in step.
    chargers.build(props.chargers.map(charger => ({
      id: charger.id,
      planX: charger.x,
      planY: charger.y,
      headingRad: charger.headingRad,
    })))
    chargers.setStates(props.chargers.map(({ id, state }) => ({ id, state })))

    // Built, not loaded, and built from the rails the data derived off the
    // building — so a crane stands in a measured aisle rather than at a
    // coordinate someone liked. See asrsLayer.ts for why there is no GLB here.
    craneRig.build(asrsCranes, {
      body: token(robotLivery.body),
      trim: token(robotLivery.trim),
      accent: token(robotLivery.accent.ASRS ?? 'info'),
      cargo: token('tertiary-bright'),
      roughness: robotLivery.roughness,
      metalness: robotLivery.metalness,
    })
    craneRig.setFrames(props.cranes)


    void spawnFleet(robotLayer)
    robotLayer.setSelected(props.selectedVehicleId)
    if (props.showRoutes) applyNetwork()
    applySelectedRoute()
  }

  /**
   * The house livery for one chassis or one piece of plant: shared body and
   * trim, and the accent that identifies the type. Resolved from live theme
   * tokens here rather than baked into the data, so the fleet re-paints with the
   * app's theme.
   *
   * Takes a plain string because `robotLivery.accent` is keyed by one — it
   * carries the cranes' `ASRS` accent alongside the three chassis, and the
   * fixture type table it used to borrow that key from no longer exists.
   */
  function liveryFor (typeId: RobotTypeId | string, robotId?: string): Livery {
    // ⚠️ THE TWO COLOURS HAVE DIFFERENT JOBS AND THE ORDER HERE IS THE WHOLE OF
    // IT. The unit's own tone used to OVERRIDE the chassis accent, so each
    // machine's dominant colour was its own and five robots off one line looked
    // like five products. Now the hull (`body`) is one fleet paint, the chassis
    // accent is the shared indicator colour, and the unit's tone drives only its
    // LED strip and its number decal — so the fleet reads as one product line at
    // a distance and as five distinct machines close up.
    const own = robotId ? UNIT_LIVERY[robotId]?.accent : undefined
    const accent = token(robotLivery.accent[typeId] ?? 'primary')
    return {
      body: token(robotLivery.body),
      trim: token(robotLivery.trim),
      accent,
      // The unit's own tone lights its LED strip and its number decal, so five
      // machines off one production line are tellable apart at a glance.
      rim: own ? token(own) : accent,
      // ⚠️ THE FLEET'S ONE GLOW COLOUR, AND IT DELIBERATELY IGNORES `own`. The
      // silhouette rim is a house LOOK, not an identity channel and not a state
      // — every machine's edges light the same whatever it is and whatever it
      // is doing. `robotLivery.glow` in `src/data/fleet.ts` carries the full
      // argument for both halves of that.
      glow: token(robotLivery.glow),
      roughness: robotLivery.roughness,
      metalness: robotLivery.metalness,
    }
  }

  // ⚠️ `identityFor` IS GONE WITH THE PARTS IT FED. It resolved a unit's accent
  // and marking shape for `RobotLayer.addIdentity`, which bolted a beacon, a
  // mast band and a deck decal onto each chassis — all three now removed. The
  // marking in particular read as a direction arrow lying across the machine,
  // which on an operations display is a claim about where a robot is going that
  // a decal cannot back up. `liveryFor` still resolves the unit's accent, and
  // that is what paints its indicator faces.

  /**
   * Size for a chassis that has no entry in the registry at all — which can only
   * happen if telemetry names a type the dataset does not declare. A metre cube
   * is deliberately unlike any real unit here: it should look wrong, because it
   * means the fleet and the type table have gone out of step.
   */
  const FALLBACK_SIZE_M = { lengthM: 1, widthM: 1, heightM: 1 }

  /**
   * ── THE LOAD THE FLEET CARRIES ──────────────────────────────────────────────
   *
   * ⚠️ PERCENT-ENCODED. The filename contains spaces and is fetched as a URL, so
   * a raw one 404s — and the failure is silent: the box simply never appears and
   * looks like a styling decision rather than a broken path (CLAUDE.md).
   *
   * 0.42 m is a shipping carton at the scale this hall is built to: the AMR is
   * 0.45 m tall, so a box on its deck reads as a parcel it could plausibly
   * carry rather than as a crate balanced on a cat.
   */
  const CARGO_MODEL_URL = `/models/${encodeURIComponent('white shipping box 3d model.glb')}`

  /**
   * ── EACH CHASSIS'S LOADING BAY ──────────────────────────────────────────────
   *
   * ⚠️ THESE ARE THE NUMBERS TO TUNE IF A BOX SITS WRONG, and they are the only
   * ones. Every value is metres measured off the asset by eye once — a bounding
   * box cannot find a loading bay, because the bay is a VOID in the model and the
   * box enclosing the model says nothing about the holes in it. See `CargoBay`.
   *
   * `liftM` is the height of the surface the load RESTS ON, from the ground:
   * the internal platform of an open frame, the top of a flat deck, the fork
   * blades. It is emphatically not the top of the chassis — anchoring to that is
   * what left a box floating clear above the open-frame unit.
   *
   * `fitM` is sized to clear the compartment's sides, so it differs per chassis
   * rather than being one fleet-wide figure.
   */
  const CARGO_BAYS: Record<RobotTypeId, { liftM: number; forwardM: number; fitM: number }> = {
    // A · AGV cart tug, 0.80 m tall — carries INSIDE its open frame, on the
    // internal platform between the side columns, so the load is centred over
    // the chassis rather than ahead of it.
    A: { liftM: 0.30, forwardM: 0, fitM: 0.34 },
    // B · AMR, 0.45 m tall — a low flat shuttle that carries on its top deck.
    B: { liftM: 0.32, forwardM: 0, fitM: 0.30 },
    // C · the forklift — carries AHEAD of itself, resting on the fork blades.
    //
    // ⚠️ THESE TWO NUMBERS ARE MEASURED OFF THE MESH BY HEIGHT BAND, not judged
    // by eye, and that is what finally made them right. Slicing `robot 1.glb`
    // (scaled to 1.8 m) into 0.1 m bands and taking the furthest-forward vertex
    // in each says exactly where the machine is solid:
    //
    //     0.00 – 0.10 m   front reaches  x = +0.695   ← the fork blades
    //     0.10 – 0.60 m   front reaches  x = +0.041   ← the body, well behind
    //     0.60 m and up   front reaches  x = −0.14    ← mast, further back still
    //
    // So the forks are a 0.65 m shelf at ankle height and everything above them
    // is set back. The load sits ON that shelf: `liftM` is the top of the blades
    // and `forwardM` centres the box along them, which leaves ~37 mm between the
    // box's back face and the body and ~37 mm between its front face and the
    // fork tips. Nothing intersects, and the load is supported rather than
    // floating ahead of the machine.
    //
    // ⚠️ THE OLD VALUES WERE READ THROUGH A BROKEN FRAME. `liftM 0.28,
    // forwardM 0.72` was "confirmed by observation" — but the carrier applied
    // its offset along the root's −Z while the root carries a 90° `yawOffset`,
    // so what was observed was a box sitting 90° off to the side, and 0.72 was
    // tuned to make THAT look plausible. See the note in `robotLayer.ts`. A
    // measurement that disagrees with an observation is worth more when the
    // observation was of the wrong thing.
    C: { liftM: 0.10, forwardM: 0.37, fitM: 0.62 },
  }

  /**
   * The 2D map's chassis colours, so a type reads the same in both views.
   *
   * All primary-family now, matching `FloorMap`'s `.vehicle--type-*` rules and
   * the fleet livery: chassis is a SHAPE, not a hue. Only reached by a unit with
   * no `UNIT_LIVERY` entry, which no unit on the current roster is.
   */
  const TYPE_TOKEN: Record<RobotTypeId, string> = {
    A: 'primary-bright',
    B: 'primary',
    C: 'primary-deep',
  }

  /**
   * ⚠️ THE ASRS IS NOT SPAWNED FROM A GLB. `industrial robot 3d model.glb` is a
   * single unrigged mesh, so it could not have a carriage that moves
   * independently of its chassis — the machine had to be BUILT to have two axes
   * at all, which is what `asrsLayer.ts` does from primitives.
   *
   * `fixtureLayer.ts`, which used to load it, is deleted. It was kept for a
   * while "for the next piece of single-mesh bolted equipment", and that is not
   * a reason to carry 167 lines of loader nothing calls: the fixture types it
   * spawned from are gone too, so it could not have been used without being
   * rewritten anyway. `robotLayer.ts` already loads and liveries a GLB at a pose
   * and is the thing to reach for if bolted plant ever returns.
   */

  /**
   * Spawn a mesh for every robot whose CHASSIS TYPE has a model registered
   * (`ROBOT_MODELS` in the fleet store). Types with `url: null` are skipped —
   * they keep their state and their 2D marker, but nothing stands in for them
   * in 3D. Registering the next model is one entry in that record; this function
   * does not change.
   *
   * Spawning is deliberately OFF the ready path: the warehouse is usable while
   * robots stream in, and one failed robot GLB must not blank the building.
   */
  async function spawnFleet (layer: RobotLayer) {
    for (const robot of props.vehicles) {
      const model = ROBOT_MODELS[robot.typeId]
      const pose = { planX: robot.x, planY: robot.y, headingRad: robot.headingRad }

      const cargoBay = CARGO_BAYS[robot.typeId]

      if (!model?.url) {
        // No GLB for this chassis yet — an explicitly schematic marker, never a
        // borrowed chassis. See the note on RobotLayer.spawnMarker.
        layer.spawnMarker({
          id: robot.id,
          sizeM: model?.sizeM ?? FALLBACK_SIZE_M,
          // The unit's own colour even on a schematic marker: a placeholder that
          // cannot be told from its neighbour is a worse placeholder.
          color: token(UNIT_LIVERY[robot.id]?.accent ?? TYPE_TOKEN[robot.typeId]),
          cargoBay,
          pose,
        })
        continue
      }

      try {
        await layer.spawn({
          id: robot.id,
          modelUrl: model.url,
          sizeM: model.sizeM,
          yawOffset: model.yawOffset,
          livery: liveryFor(robot.typeId, robot.id),
          cargoBay,
          pose,
        })
        // The unit may already be mid-delivery when it spawns — the simulation
        // warms up for three minutes before the first frame is drawn, so a robot
        // arriving in the scene carrying a load is the normal case, not an edge.
        void layer.setCargo(robot.id, robot.carrying)
      } catch (error) {
        // Reported, not swallowed, and not escalated to the whole view. The unit
        // still exists in the simulation, so it falls back to its marker rather
        // than vanishing off a plan an operator is reading.
        console.warn(`[warehouse] robot ${robot.id} (type ${robot.typeId}) failed to load`, error)
        layer.spawnMarker({
          id: robot.id,
          sizeM: model.sizeM,
          color: token(UNIT_LIVERY[robot.id]?.accent ?? TYPE_TOKEN[robot.typeId]),
          cargoBay,
          pose,
        })
      }
    }
  }

  /**
   * The road network, drawn from the SIMULATION's corridors rather than from the
   * plan's decorative lanes — these are the aisles the robots are actually
   * routed along, so what is drawn is what is driven. Static: built once and left
   * alone, because the network is infrastructure, not telemetry.
   */
  function applyNetwork () {
    routes.value?.setRoutes(
      corridors.map(corridor => ({
        id: `corridor:${corridor.id}`,
        points: (corridor.axis === 'h'
          ? [[corridor.from, corridor.at], [corridor.to, corridor.at]]
          : [[corridor.at, corridor.from], [corridor.at, corridor.to]]) as Array<[number, number]>,
        // ⚠️ AN ILLUMINATED GUIDE, NOT A DRAWN LANE. These are the aisles the
        // simulation actually routes along, recessed into the floor as light —
        // the "what is drawn is what is driven" rule, rendered as the building's
        // own wayfinding rather than as a diagram laid over it. Additive, so
        // they read as the slab glowing rather than as tape on top of it; see
        // `RouteInput.glow`.
        color: token('floor-inlay'),
        // Narrow. These are wayfinding, not the subject — a thin inlaid strip
        // reads as part of the building, where a wide one reads as a highlight
        // drawn over it. The bloom halo does the work of making it visible, so
        // the geometry itself can stay discreet.
        width: 3,
        // ⚠️ NEAR FULL, AND THE BLOOM THRESHOLD IS WHY. `addBloom` only spreads
        // pixels brighter than 0.62, so at the 0.45 this used to run the guides
        // sat BELOW the cut and got no wash at all — bright lines, which is the
        // exact complaint. They are drawn `toneMapped: false` (see
        // `RouteInput.glow`) precisely so they can clear that line while every
        // lit surface in the hall stays under it.
        opacity: 1,
        engraved: true,
      })),
    )
  }

  /**
   * The selected unit's assignment, on its own layer so redrawing it does not
   * rebuild the whole network's geometry every time the robot moves a centimetre.
   */
  function applySelectedRoute () {
    const layer = activeRoute.value
    if (!layer) return

    const route = props.robotRoute
    if (!route) {
      layer.clear()
      return
    }

    const drawn = []
    if (route.travelled.length >= 2) {
      drawn.push({ id: 'sel-travelled', points: route.travelled, color: token('secondary-deep'), width: 7, opacity: 0.85 })
    }
    if (route.ahead.length >= 2) {
      // ⚠️ THE SAME TOKEN THE 2D PLAN USES, from the same table — so the two
      // views cannot end up disagreeing about how urgent a job is. `routeTone`
      // rather than `tone`: a ribbon lying over a floor has a different
      // legibility problem from a chip on a panel (see `taskPriorities`).
      // Falls back to the neutral blue when the unit has no task at all, which
      // is a drive to a charger and not a priority level.
      const ink = props.routePriority
        ? token(taskPriorities[props.routePriority].routeTone)
        : token('primary-bright')
      // Urgent work is drawn thicker as well as differently coloured — a ribbon
      // seen from a shallow camera angle loses hue long before it loses width.
      const urgent = props.routePriority !== null && taskPriorities[props.routePriority].flashes
      drawn.push({
        id: 'sel-ahead',
        points: route.ahead,
        color: ink,
        width: urgent ? 12 : 8,
        opacity: 0.95,
      })
    }
    layer.setRoutes(drawn)
  }

  /**
   * ── WHICH LOAD IS STILL THE CURRENT ONE ────────────────────────────────────
   *
   * ⚠️ THE MODEL IS ~132 MB AND `start()` AWAITS IT, so there is a window of
   * SECONDS between constructing the scene and building the layers into it. An
   * operator who opens 3D and switches straight back to 2D unmounts the
   * component inside that window: `teardown()` disposes the scene, the fetch
   * then resolves, and `buildLayers` mounts eight layers — with their geometry,
   * materials and textures — into a scene that will never be disposed again.
   * Nothing throws and nothing warns; the GPU memory is simply gone, and a few
   * such switches exhaust the per-page WebGL context budget.
   *
   * A monotonic token is the fix rather than a boolean, because `retry()` can
   * start a second load while the first is still in flight — a flag would let
   * the stale one report itself ready over the top of the live one.
   */
  let runToken = 0

  async function start () {
    if (!host.value) return
    const run = ++runToken
    tokenCache.clear()
    status.value = 'loading'
    progress.value = -1
    errorMessage.value = ''

    const instance = new WarehouseScene(host.value, {
      interiorClip: { ceiling: props.ceilingCut, inset: props.footprintInset },
      // The building's two surfaces, from theme tokens like every other colour
      // in this scene. `outline-medium` is the DS's own structural grey, which
      // is what keeps the racking in the same family as the hairlines the 2D map
      // draws the same building with.
      surfaceTints: {
        // ⚠️ GRAPHITE, AND THE DARKNESS IS LOAD-BEARING. The floor guides are
        // ADDITIVE (see `applyNetwork`), so they can only brighten what is under
        // them — the darker the slab, the more the guides are the only thing on
        // it. A dedicated neutral rather than the app's `background`, which is a
        // navy and tinted the floor blue; see `floor-graphite`.
        floor: token('floor-graphite'),
        // Dark graphite painted steel — see `rack-steel`. The grain, tonal
        // drift and section seams the texture draws are what keep it from being
        // flat dark geometry; at this value they read as brushed paint.
        structure: token('rack-steel'),
      },
      // Drives animation mixers. Inert for the current robot GLB, which is a
      // static Tripo mesh with no rig, but a rigged model needs no other wiring.
      onFrame: delta => {
        robots.value?.update(delta)
        // The charge pulse is time-based, so it belongs on the render clock
        // rather than on the telemetry watcher — stepping it at the store's tick
        // rate would make it stutter.
        chargerLayer.value?.update(delta)
        // Same reasoning for the emergency beacons: their pulse is time-based,
        // and it runs on the RENDER clock so a paused scene shows a still
        // beacon rather than a flashing marker over frozen positions.
        // The attention ring pulses on the RENDER clock for the same reason the
        // beacons do: a paused scene must show a still ring over frozen robots,
        // never a breathing one that reads as live.
        trafficLayer.value?.update(delta)
      },
      onProgress: fraction => { progress.value = fraction },
      onPick: hit => {
        if (!hit?.named) return
        const data = hit.named.userData ?? {}
        // Robots first, then the operational layer. The GLB's own nodes fall
        // through to their (meaningless) names, which is the honest outcome —
        // the shell has no selectable objects, and pretending otherwise would
        // put "Node17" in front of an operator as if it meant something.
        if (typeof data.robotId === 'string') emit('selectVehicle', data.robotId)
        else if (typeof data.zoneId === 'string') emit('selectObject', `${data.zoneKind} ${data.zoneId}`)
      },
    })
    scene.value = instance

    try {
      // ⚠️ AN EXPLICIT BACKGROUND, NOT A TRANSPARENT CANVAS, AND BLOOM IS WHY.
      // The canvas used to be alpha-clear over the panel's own fill, which is
      // fine for a direct render and ill-defined once a post-processing chain is
      // in front of it: the bloom composite adds into the buffer, so whatever
      // alpha survives is a property of the pass order rather than a decision.
      // Painting the hall the app's darkest token makes it deterministic and
      // matches the reference, which is a uniformly dark room. Pass null here to
      // go back to a see-through canvas.
      instance.setBackground(token('background'))
      await instance.load(props.map.modelUrl)
      // Superseded while the model was in flight — the component unmounted, or
      // `retry()` started a newer load. Dispose what this run built and report
      // nothing: the newer run owns the surface.
      if (run !== runToken) {
        instance.dispose()
        return
      }
      buildLayers(instance)
      status.value = 'ready'
    } catch (error) {
      if (run !== runToken) return
      errorMessage.value = error instanceof Error ? error.message : String(error)
      status.value = 'error'
    }
  }

  /**
   * Release the scene and drop every handle to it.
   *
   * ⚠️ EVERY LAYER REF, NOT MOST OF THEM. One was missed here once, so
   * after a teardown the component still held a disposed layer — and a watcher
   * that fires whenever a job's stops are chosen
   * went on calling `setMarks` into it. Bumping `runToken` also cancels any load
   * still in flight; see `start`.
   */
  function teardown () {
    runToken += 1
    scene.value?.dispose()
    scene.value = null
    robots.value = null
    routes.value = null
    activeRoute.value = null
    craneLayer.value = null
    chargerLayer.value = null
    trafficLayer.value = null
  }

  function retry () {
    teardown()
    void start()
  }

  onMounted(start)
  onBeforeUnmount(teardown)

  watch(() => props.selectedVehicleId, id => robots.value?.setSelected(id ?? null))

  /**
   * Stream live poses into the 3D layer.
   *
   * This is the whole synchronisation story on the 3D side: the same array the
   * 2D view draws, pushed into the scene as poses. Nothing here decides where a
   * robot goes — the simulation already did, and both renderers only report it.
   *
   * Not deep: the store replaces the array wholesale each tick, so identity is
   * enough and a deep traversal of sixteen objects sixty times a second is pure
   * waste. A unit that appears after the layer was built is spawned on the spot.
   */
  watch(
    () => props.vehicles,
    list => {
      const layer = robots.value
      if (!layer) return
      const known = new Set(layer.ids)
      for (const robot of list) {
        if (!known.has(robot.id)) {
          void spawnFleet(layer)
          break
        }
      }
      for (const robot of list) {
        layer.setPose(robot.id, {
          planX: robot.x,
          planY: robot.y,
          headingRad: robot.headingRad,
        })
        // ⚠️ CALLED EVERY FRAME, AND THAT IS SAFE BY DESIGN. `setCargo` is a
        // no-op unless the flag actually changed (see its note), so this is one
        // boolean compare per unit per tick rather than a rebuild. Driving it
        // off the telemetry is what keeps the box exactly as honest as the 2D
        // cargo block: both read `carrying` from the same frame, so neither view
        // can show a load the simulation is not carrying.
        void layer.setCargo(robot.id, robot.carrying)
      }
    },
  )

  /**
   * Stream the cranes' two axes into the scene.
   *
   * A pose, not a highlight: the chassis takes the rail position and the
   * carriage takes the height, and the layer writes them to two separate nodes
   * so the machine indexes to a bay and only then hoists.
   */
  watch(() => props.cranes, list => craneLayer.value?.setFrames(list))

  /** Free · reserved · charging, straight onto the dock lamps. */
  watch(
    () => props.chargers,
    list => chargerLayer.value?.setStates(list.map(({ id, state }) => ({ id, state }))),
  )

  /**
   * ── THE TRAFFIC OVERLAY ────────────────────────────────────────────────────
   *
   * Four separate feeds, because they change at four different rates and the
   * layer is built to be updated that way: the reservation SET turns over a few
   * times a second, while the rings and destination marks move every frame.
   *
   * ⚠️ THIS IS A PURE MAPPING AND MUST STAY ONE. Every value below is read off a
   * frame the simulation already decided — which block is held, which junction is
   * congested, how much room a unit needs. Nothing here works out right of way,
   * and a question about traffic that can be ANSWERED in this file belongs in
   * `trafficControl.ts` (CLAUDE.md → the three-layer rule).
   */
  function applyTraffic () {
    const layer = trafficLayer.value
    if (!layer) return
    if (!props.showTraffic) return

    const frame = props.traffic
    // Null before the first tick. Clearing rather than leaving the last frame up
    // is the honest answer: a stale reservation drawn as current is exactly the
    // failure the freshness rules exist to prevent.
    layer.setSegments(frame?.segments ?? [])
    layer.setJunctions((frame?.intersections ?? []).map(node => ({
      id: node.id,
      x: node.x,
      y: node.y,
      held: node.holder !== null,
      congestion: node.congestion,
    })))

    layer.setRobots(props.vehicles.map(robot => ({
      id: robot.id,
      planX: robot.x,
      planY: robot.y,
      // ⚠️ HALF THE BODY LENGTH, WHICH IS THE FIGURE THE MODEL ACTUALLY
      // ENFORCES. `FleetSim`'s proximity monitor calls two units touching when
      // the gap closes below the sum of their half-lengths, so a ring drawn at
      // the FULL length claims twice the clearance the simulation is keeping —
      // an operator reading it would see rings overlapping constantly and
      // conclude the floor was unsafe when the model says it is not. Metres, not
      // plan units: the layer converts sizes through `worldPerMetre`, and
      // crossing the two scales is how the fleet once rendered a third-size.
      safetyRadiusM: (ROBOT_MODELS[robot.typeId]?.sizeM ?? FALLBACK_SIZE_M).lengthM / 2,
      tone: token(ROBOT_STATE_TONE[robot.state] ?? 'outline-medium'),
      // Only the states an operator would act on pulse. A ring breathing on
      // every unit is a ring that means nothing.
      attention: robot.state === 'waiting' || robot.state === 'error',
    })))

    layer.setDestinations(props.vehicles
      // A unit with nowhere to be has no mark — an arrow to its own position
      // reads as a destination it has already reached.
      .filter(robot => robot.destinationLabel)
      .map(robot => ({
        id: robot.id,
        planX: robot.x,
        planY: robot.y,
        fromX: robot.x,
        fromY: robot.y,
        tone: token(ROBOT_STATE_TONE[robot.state] ?? 'info'),
        emphasis: robot.id === props.selectedVehicleId,
      })))
  }

  // ⚠️ NOT `deep`. The store assigns a freshly-built snapshot on every tick, so
  // the reference alone already changes sixty times a second — a deep watcher
  // added nothing but a full traversal of every segment, junction and proximity
  // warning per frame, and it ran whether or not the overlay was even visible.
  // Same reasoning as the `vehicles` watcher below, which has always said so.
  watch(() => props.traffic, applyTraffic)
  watch(() => props.vehicles, applyTraffic)
  watch(() => props.showTraffic, on => {
    trafficLayer.value?.setVisible(on)
    // Fed only while visible, so a hidden overlay costs nothing per frame — and
    // filled on the way back on rather than showing the frame it was hidden at.
    if (on) applyTraffic()
  })

  /**
   * Emergency beacons.
   *
   * Rebuilt whole rather than diffed — there are a handful at most, and a
   * beacon that outlived its job would be an alarm for work already delivered.
   * `deep` because the array identity is stable across frames while its contents
   * are not: `FloorOps` derives it from the task list, and a job moving from
   * queued to assigned changes a coordinate without changing the reference.
   */
  // The `emergencyMarks` watcher is gone with the beacon layer. The prop is kept
  // on the component: it is part of the contract both views share, the 2D map
  // still draws from the same array, and a future 3D treatment for emergencies
  // — a floor wash rather than a floating cube — would read exactly this.

  /** The ribbon's colour follows the job's urgency; redraw when it changes. */
  watch(() => props.routePriority, () => applySelectedRoute())

  /**
   * Redraw the highlighted route as the unit advances along it.
   *
   * Throttled: the path changes every frame, and every rebuild re-tessellates a
   * tube. Four times a second is well under what reads as continuous on a route
   * that is hundreds of plan units long, and it keeps the geometry churn off the
   * render budget. Clearing is NOT throttled — a ribbon for a job that is over
   * has to go the moment it is over.
   */
  let lastRouteDraw = 0
  watch(
    () => props.robotRoute,
    route => {
      const now = performance.now()
      if (route && now - lastRouteDraw < 250) return
      lastRouteDraw = now
      applySelectedRoute()
    },
  )

  /**
   * The shared zoom level, as a camera dolly.
   *
   * Applied as the RATIO between the two levels rather than as an absolute
   * distance: the camera's framing distance is set by `frameAll` from the
   * building's own bounds, so there is no fixed distance a level maps to. The
   * ratio makes one press of the button mean the same proportional step here as
   * it does to the 2D viewBox.
   */
  watch(() => props.zoom, (now, before) => {
    if (!before || !now || now === before) return
    scene.value?.zoomBy(now / before)
  })

  watch(
    () => [props.ceilingCut, props.footprintInset] as const,
    ([ceiling, inset]) => scene.value?.setInteriorClip({ ceiling, inset }),
  )
  watch(() => props.showRoutes, on => (on ? applyNetwork() : routes.value?.clear()))
</script>

<template>
  <div class="warehouse">
    <div ref="host" class="warehouse__canvas" />

    <!-- Loading and error sit ON the canvas rather than replacing it, so the
         WebGL context is created once and never torn down by a state change. -->
    <div v-if="status === 'loading'" class="warehouse__veil" role="status" aria-live="polite">
      <v-progress-circular
        v-if="progress < 0"
        indeterminate
        color="primary-bright"
        size="36"
        width="3"
      />
      <v-progress-circular
        v-else
        :model-value="progress * 100"
        color="primary-bright"
        size="36"
        width="3"
      />
      <p class="text-body-medium mb-0">
        Loading warehouse model{{ progress >= 0 ? ` — ${Math.round(progress * 100)}%` : '' }}
      </p>
    </div>

    <div v-else-if="status === 'error'" class="warehouse__veil" role="alert">
      <AppIcon name="alert" class="warehouse__veil-icon" />
      <p class="text-body-medium mb-0">Could not load the warehouse model.</p>
      <!-- The reason is shown, not swallowed: a 404 and a decode failure need
           different fixes, and an operator reporting this needs to say which. -->
      <p class="text-body-small warehouse__reason mb-0">{{ errorMessage }}</p>
      <v-btn class="text-none" variant="tonal" size="small" @click="retry">Try again</v-btn>
    </div>
  </div>
</template>

<style scoped>
.warehouse {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.warehouse__canvas {
  width: 100%;
  height: 100%;
}

.warehouse__veil {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
  background-color: rgba(var(--v-theme-background), 0.82);
}

.warehouse__veil-icon {
  font-size: 28px;
  color: rgb(var(--v-theme-warning));
}

.warehouse__reason {
  max-width: 40ch;
  color: rgb(var(--v-theme-on-surface-weak));
  word-break: break-word;
}
</style>
