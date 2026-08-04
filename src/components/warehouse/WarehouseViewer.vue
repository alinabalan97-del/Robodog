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
  import { EmergencyLayer } from './emergencyLayer'
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
     * the header of `emergencyLayer.ts` for why that distinction matters here.
     */
    emergencyMarks?: EmergencyMark[]
    selectedVehicleId?: string | null
    /**
     * Draw the navigation graph and mission paths. ON now that the projection is
     * calibrated to the shell — routes are part of the operational warehouse, and
     * robots have to be seen running the same paths the 2D map draws.
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
  const emergencyLayer = shallowRef<EmergencyLayer | null>(null)
  const craneLayer = shallowRef<AsrsLayer | null>(null)
  const chargerLayer = shallowRef<ChargerLayer | null>(null)
  const trafficLayer = shallowRef<TrafficLayer | null>(null)

  /** Resolve a theme token to a concrete colour — Three can't read CSS vars. */
  function token (name: string): string {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue(`--v-theme-${name}`)
      .trim()
    return raw ? `rgb(${raw.split(/\s+/).join(',')})` : '#ffffff'
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
    const emergencyBeacons = new EmergencyLayer(
      instance.contentRoot,
      projection,
      token(taskPriorities.emergency.tone),
    )
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
    instance.track(emergencyBeacons)
    instance.track(craneRig)
    instance.track(chargers)
    instance.track(trafficOverlay)
    robots.value = robotLayer
    routes.value = routeLayer
    activeRoute.value = activeRouteLayer
    emergencyLayer.value = emergencyBeacons
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

    emergencyBeacons.setMarks(props.emergencyMarks)

    void spawnFleet(robotLayer)
    robotLayer.setSelected(props.selectedVehicleId)
    if (props.showRoutes) applyNetwork()
    applySelectedRoute()
  }

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
    // A unit's own accent wins over its chassis's. On a five-robot floor the
    // chassis accent is a fallback, not the identity — see `UNIT_LIVERY`.
    const own = robotId ? UNIT_LIVERY[robotId]?.accent : undefined
    return {
      body: token(robotLivery.body),
      trim: token(robotLivery.trim),
      accent: token(own ?? robotLivery.accent[typeId] ?? 'primary-bright'),
      roughness: robotLivery.roughness,
      metalness: robotLivery.metalness,
    }
  }

  /** This unit's badge parts, or undefined for a unit with no posting paint. */
  function identityFor (robotId: string) {
    const livery = UNIT_LIVERY[robotId]
    if (!livery) return undefined
    return { accent: token(livery.accent), markings: livery.markings }
  }

  /**
   * Size for a chassis that has no entry in the registry at all — which can only
   * happen if telemetry names a type the dataset does not declare. A metre cube
   * is deliberately unlike any real unit here: it should look wrong, because it
   * means the fleet and the type table have gone out of step.
   */
  const FALLBACK_SIZE_M = { lengthM: 1, widthM: 1, heightM: 1 }

  /** The 2D map's chassis colours, so a type reads the same in both views. */
  const TYPE_TOKEN: Record<RobotTypeId, string> = {
    A: 'primary-bright',
    B: 'secondary',
    C: 'primary-accent',
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

  async function spawnFleet (layer: RobotLayer) {
    for (const robot of props.vehicles) {
      const model = ROBOT_MODELS[robot.typeId]
      const pose = { planX: robot.x, planY: robot.y, headingRad: robot.headingRad }

      if (!model?.url) {
        // No GLB for this chassis yet — an explicitly schematic marker, never a
        // borrowed chassis. See the note on RobotLayer.spawnMarker.
        layer.spawnMarker({
          id: robot.id,
          sizeM: model?.sizeM ?? FALLBACK_SIZE_M,
          // The unit's own colour even on a schematic marker: a placeholder that
          // cannot be told from its neighbour is a worse placeholder.
          color: token(UNIT_LIVERY[robot.id]?.accent ?? TYPE_TOKEN[robot.typeId]),
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
          identity: identityFor(robot.id),
          pose,
        })
      } catch (error) {
        // Reported, not swallowed, and not escalated to the whole view. The unit
        // still exists in the simulation, so it falls back to its marker rather
        // than vanishing off a plan an operator is reading.
        console.warn(`[warehouse] robot ${robot.id} (type ${robot.typeId}) failed to load`, error)
        layer.spawnMarker({
          id: robot.id,
          sizeM: model.sizeM,
          color: token(UNIT_LIVERY[robot.id]?.accent ?? TYPE_TOKEN[robot.typeId]),
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
        color: token('outline-medium'),
        width: 2.5,
        opacity: 0.5,
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

  async function start () {
    if (!host.value) return
    status.value = 'loading'
    progress.value = -1
    errorMessage.value = ''

    const instance = new WarehouseScene(host.value, {
      interiorClip: { ceiling: props.ceilingCut, inset: props.footprintInset },
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
        emergencyLayer.value?.update(delta)
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
      await instance.load(props.map.modelUrl)
      buildLayers(instance)
      status.value = 'ready'
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : String(error)
      status.value = 'error'
    }
  }

  function teardown () {
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
      }
    },
  )

  /**
   * Redraw the highlighted route as the unit advances along it.
   *
   * Throttled: the path changes every frame, and every rebuild re-tessellates a
   * tube. Four times a second is well under what reads as continuous on a route
   * that is hundreds of plan units long, and it keeps the geometry churn off the
   * render budget.
   */
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

  watch(() => props.traffic, applyTraffic, { deep: true })
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
  watch(
    () => props.emergencyMarks,
    marks => emergencyLayer.value?.setMarks(marks),
    { deep: true },
  )

  /** The ribbon's colour follows the job's urgency; redraw when it changes. */
  watch(() => props.routePriority, () => applySelectedRoute())

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
