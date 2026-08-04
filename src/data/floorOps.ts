/**
 * src/data/floorOps.ts
 *
 * Dataset for the Floor operations screen (src/screens/FloorOps.vue).
 *
 * ⚠️ EVERY VALUE HERE IS SYNTHETIC. There is no backend yet — site names, hall
 * names, mission IDs, vehicle codes, coordinates, battery levels and timings are
 * invented for layout purposes and must never be mistaken for a real facility's
 * live state (see CLAUDE.md → Domain rules, and the API seam in src/api/).
 * When a backend lands, it produces these same shapes and the screen is unchanged.
 *
 * TWO HALVES:
 *   • the CONTRACT (the exported interfaces) — what a backend must produce.
 *   • the DATA (`floorOps`) — one synthetic snapshot matching that contract.
 *
 * MAP GEOMETRY is expressed in an abstract SVG user-space (see `map.viewBox`),
 * not pixels: the map component scales it to whatever box it is given, so the
 * floor plan stays legible on a wall display and on a tablet without a second
 * dataset. Coordinates are floor-plan coordinates, nothing more.
 */

// ─── Freshness ────────────────────────────────────────────────────────────────

/**
 * How current the telemetry feed is. Binding domain rule: a frozen view must
 * never look live, so the screen renders this with an icon AND a word — never
 * color alone — and dims live figures the moment it leaves 'live'.
 */
export type FeedStatus = 'live' | 'stale' | 'disconnected'

export interface FeedHealth {
  status: FeedStatus
  /** Seconds since the last accepted telemetry frame. */
  ageSeconds: number
  /** Above this age the feed is no longer presented as live. */
  staleAfterSeconds: number
}

// ─── Where we are ─────────────────────────────────────────────────────────────

export interface SiteFloor {
  id: string
  /** Site plus zone, as one line — it is shown as a single truncating label. */
  site: string
  /** Shown as a separate chip beside the site line. */
  floor: string
}

export interface ProductionHall {
  id: string
  name: string
  /** People badged onto this hall right now. */
  peopleOnFloor: number
  /** Vehicles assigned to this hall (moving, loading, charging or idle). */
  vehiclesActive: number
  /** Unacknowledged alerts across vehicles and equipment. */
  openAlerts: number
}

// ─── Map geometry ─────────────────────────────────────────────────────────────

/**
 * What a block of floor is for. Each renders differently, and the difference is
 * informational — an operator reads the plan by shape, not by hunting labels:
 *   rack    storage racking, drawn as its pallet beams (density = capacity)
 *   cell    a work cell bolted to the head of an aisle
 *   dock    the load/unload face at the far end of an aisle
 *   buffer  a narrow staging sliver, occupied
 *   reserve the same sliver, empty — outlined instead of filled
 */
export type ZoneKind = 'rack' | 'cell' | 'dock' | 'buffer' | 'reserve'

export interface FloorZone {
  id: string
  kind: ZoneKind
  x: number
  y: number
  w: number
  h: number
  /** Racks only — how many pallet positions to draw, so density reads as capacity. */
  bays?: number
  /**
   * Racks only — which way the bays run. The hall has both: the production
   * aisles are beamed in rows (`row`, horizontal), the high-bay block is
   * uprights (`column`, vertical). Defaults to `row`.
   */
  axis?: 'row' | 'column'
}

/**
 * Fixed things on the floor plan.
 *   charger · lift · station  equipment — dark tiles, can raise an alert
 *   pallet                    a stack of goods parked in the open
 *   slot                      a marked-out floor position, currently empty
 */
export type NodeKind = 'charger' | 'lift' | 'station' | 'pallet' | 'slot'

export interface FloorNode {
  id: string
  kind: NodeKind
  x: number
  y: number
  /** Human name, read out to assistive tech and shown on hover. */
  label: string
  /** Short reference printed beside the tile — the number an operator calls it by. */
  tag?: string
  /** Equipment raising an alert — drawn with a badge, never color alone. */
  alert?: boolean
}

export type VehicleState = 'moving' | 'loading' | 'charging' | 'blocked' | 'idle'

/** The fleet is mixed: flatbed shuttles and legged units. The plan shows which. */
export type VehicleForm = 'shuttle' | 'quadruped'

export interface FloorVehicle {
  id: string
  /** Fleet code painted on the chassis, e.g. "OT-T12". */
  code: string
  x: number
  y: number
  state: VehicleState
  batteryPct: number
  form: VehicleForm
  /** Short reference printed beside the marker — matches the code on the chassis. */
  tag: string
  /** Present when the vehicle needs attention; the text IS the alert reason. */
  alert?: string
}

/**
 * A line on the plan. Four kinds, and the split is the whole point of the layer:
 *
 *   lane       the permanent aisle network. Always inactive — thin and grey. It
 *              is scenery, not telemetry, so it never changes with the feed.
 *   travelled  the leg the selected vehicle has already driven.
 *   ahead      the leg it still has to drive.
 *   secondary  another vehicle's path, shown but not highlighted.
 *
 * `travelled` + `ahead` together ARE the highlight: only the selected vehicle's
 * mission gets the wide, glowing treatment, and splitting it in two is what lets
 * an operator see progress along the route at a glance rather than reading an
 * ETA. Everything else stays visually quiet on purpose.
 */
export type RouteKind = 'lane' | 'travelled' | 'ahead' | 'secondary'

/** Palette slot for `secondary` routes, so two crossing paths stay tellable apart. */
export type RouteTone = 'rose' | 'amber'

export interface FloorRoute {
  id: string
  kind: RouteKind
  vehicleId?: string
  tone?: RouteTone
  /** Polyline in map user-space; the component fillets the corners and joins them. */
  points: Array<[number, number]>
  /** Corner fillet radius, in user-space units. Defaults per kind. */
  corner?: number
  /** Closes the polyline back to its first point — the aisle loops need this. */
  closed?: boolean
  /** Junction pips drawn on top of the line. */
  stops?: Array<[number, number]>
}

/**
 * The hall's outer wall.
 *
 * A point list rather than a rect because the wall is not rectangular: it steps
 * out for the dock aprons at top and bottom, and steps in for the two side
 * doors. The optional third number is that corner's fillet radius — the four
 * building corners are generous, the apron and door corners are tight.
 */
export type ShellVertex = [number, number] | [number, number, number]

export interface FloorMap {
  /**
   * The warehouse GLB the 3D view renders. Lives here rather than in the viewer
   * because it is map DATA — the same hall, a second representation — and both
   * views resolve from this one record.
   *
   * ⚠️ Served from `public/`, so it is copied verbatim into `dist/` and never
   * bundled or hashed. At ~132 MB that is a slow first paint and a heavy deploy;
   * a Draco/meshopt-compressed re-export would cut it by an order of magnitude
   * and needs no code change beyond registering the decoder.
   */
  modelUrl: string
  /**
   * SVG user-space box every coordinate above is expressed in.
   *
   * It carries an origin, not just a size, so the box can be cropped tight to
   * the drawing. That matters: the plan is wider than the slot it renders into,
   * so it fits to width — and any slack left inside the box becomes a letterbox
   * band rather than a bigger map.
   */
  viewBox: { x: number; y: number; width: number; height: number }
  outline: ShellVertex[]
  zones: FloorZone[]
  nodes: FloorNode[]
  vehicles: FloorVehicle[]
  routes: FloorRoute[]
}

// ─── The mission being inspected ──────────────────────────────────────────────

export type MissionType = 'Drop off' | 'Pick up' | 'Replenish' | 'Return'

export interface MissionVehicle {
  id: string
  /** Model name as the floor refers to it. */
  name: string
  code: string
  /** Rated payload; the unit is part of the contract, never inferred. */
  payloadKg: number
  /** Bay slot the vehicle occupies in the mission queue. */
  slot: number
  state: VehicleState
  /** Whether this vehicle is currently selected for the mission. */
  assigned: boolean
  /** Photo of the unit, filling its card. Bundled asset until a backend serves one. */
  imageUrl?: string
}

export interface MissionStop {
  id: string
  /** Stop reached and released. */
  done: boolean
}

/**
 * Progress between two fixed points. `etaDeltaMinutes` is a DERIVED estimate,
 * not a measurement — the screen labels it as such (domain rule: never let a
 * calculation sit in the same visual slot as a reading without marking it).
 */
export interface MissionProgress {
  fromCode: string
  toCode: string
  /** 0–1 along the route. */
  fraction: number
  onTime: boolean
  etaDeltaMinutes: number
}

export interface Mission {
  id: string
  type: MissionType
  /** Battery of the lead vehicle, percent. */
  batteryPct: number
  deliveredCount: number
  deliveryTotal: number
  vehicles: MissionVehicle[]
  progress: MissionProgress
  stops: MissionStop[]
  /** Where the vehicle physically is — marked on the strip. */
  currentStopId: string
  /** Which stop the operator has opened. Distinct from `currentStopId`. */
  selectedStopId: string
}

// ─── Chrome ───────────────────────────────────────────────────────────────────

export interface NavItem {
  id: string
  /** Semantic key from src/icons/carbon.ts — never a vendor icon name. */
  icon: string
  /** Accessible name; the rail is icon-only, so this is the only label. */
  label: string
}

export interface CurrentUser {
  name: string
  role: string
  initials: string
}

export interface FloorOpsData {
  location: SiteFloor
  locationOptions: SiteFloor[]
  hall: ProductionHall
  hallOptions: ProductionHall[]
  feed: FeedHealth
  map: FloorMap
  mission: Mission
  nav: NavItem[]
  user: CurrentUser
  searchPlaceholder: string
}

// ─── The synthetic snapshot ───────────────────────────────────────────────────

import vehicleOtT12 from '@/assets/vehicle-ot-t12.png'
// The building itself, measured off the GLB rather than drawn. Type-only in the
// other direction, so this is not a runtime cycle.
import { warehouseShell, warehouseZones } from './warehouseStructure'

const MENLO_F4: SiteFloor = { id: 'mp-4', site: 'Menlo Park Headquaters, Zone 1', floor: 'Floor 4' }

export const floorOps: FloorOpsData = {
  location: MENLO_F4,
  locationOptions: [
    MENLO_F4,
    { id: 'mp-3', site: 'Menlo Park Headquaters, Zone 2', floor: 'Floor 3' },
    { id: 'rv-1', site: 'Riverbend Plant, Zone 1', floor: 'Floor 1' },
  ],

  hall: {
    id: 'hall-2',
    name: 'Production hall 2',
    peopleOnFloor: 12,
    vehiclesActive: 25,
    openAlerts: 3,
  },
  hallOptions: [
    { id: 'hall-1', name: 'Production hall 1', peopleOnFloor: 8, vehiclesActive: 19, openAlerts: 0 },
    { id: 'hall-2', name: 'Production hall 2', peopleOnFloor: 12, vehiclesActive: 25, openAlerts: 3 },
    { id: 'hall-3', name: 'Dispatch & outbound', peopleOnFloor: 5, vehiclesActive: 11, openAlerts: 1 },
  ],

  feed: { status: 'live', ageSeconds: 2, staleAfterSeconds: 15 },

  map: {
    // The space in the filename has to be percent-encoded — it is fetched as a
    // URL, not read from disk.
    modelUrl: '/models/ImageToStl.com_warehouse6%20(2).glb',

    // ⚠️ THE BOX IS THE BUILDING, and it is load-bearing in a way a crop normally
    // is not. `warehouse/floorProjection.ts` fits this box onto the model's
    // interior in order to place robots in 3D, so its CENTRE decides where plan
    // (0,0) lands and its proportions decide the scale. It is sized so both axes
    // bind at once — the plan covers the whole interior with nothing left over —
    // and centred on x 620 / y 450, which is what every station coordinate in
    // `src/data/fleet.ts` was measured against. Move it and the racking, the
    // aisles and the fleet all slide off the building together.
    //
    // It was 1212 wide, which cropped about 150 units of the building's length
    // out of the 2D view. Not pixels — the component scales the box.
    viewBox: { x: -67, y: 70, width: 1374, height: 760 },

    // The interior wall line, MEASURED off the warehouse model rather than drawn.
    // The old outline stepped out for dock aprons down both long walls; the
    // building has no such aprons — those walls are racking end to end — so the
    // steps were describing a warehouse that does not exist. The bays are at the
    // two ends now, which is where the model actually has clear floor.
    outline: warehouseShell,

    // ⚠️ GENERATED. Every rectangle is real mass, read off the warehouse GLB by
    // `scripts/extract-plan-structure.mjs` and projected through exactly the
    // transform the 3D view uses. These were hand-drawn before — a plausible
    // arrangement that owed nothing to the model — and the two had drifted so
    // far apart that the drawn racking sat where the building has aisles, which
    // is why a robot on a real aisle appeared to be driving through a rack.
    //
    // The 2D map is now a projection of the same geometry the 3D view renders,
    // not a second opinion about it. Re-run the script when the model changes.
    zones: warehouseZones,

    /**
     * ⚠️ EMPTY, AND THAT IS THE CORRECT VALUE — not an omission.
     *
     * This list used to hold chargers, lifts, pick stations, pallet stacks and
     * floor positions at hand-picked coordinates. Every one of those is now
     * OWNED BY THE SIMULATION and published as telemetry: chargers report which
     * unit is on them, the ASRS lifts report their carriage height, workstations
     * and loading bays are stations dispatch reserves. The map renders those from
     * the live frame (`stops`, `equipment`, `chargers`), so anything left here
     * would be a second, frozen copy of the same equipment — two chargers drawn
     * for one stall, one of them permanently lying about its state.
     *
     * The coordinates were also from the old hand-drawn plan, so after the
     * geometry was re-measured they no longer landed on anything.
     *
     * The kind stays in the contract and the map still renders it: this is where
     * genuinely static scenery goes if a backend ever supplies some — things the
     * simulation does not model and would therefore never publish.
     */
    nodes: [],

    vehicles: [
      // OT-T12 is the unit the mission rail is showing — it owns the highlighted route.
      { id: 'v-12', code: 'OT-T12', tag: '178', form: 'shuttle', x: 521, y: 486, state: 'moving', batteryPct: 32 },
      { id: 'v-07', code: 'OT-T07', tag: '78', form: 'shuttle', x: 658, y: 410, state: 'idle', batteryPct: 58 },
      { id: 'v-98', code: 'OT-T98', tag: '98', form: 'shuttle', x: 701, y: 757, state: 'loading', batteryPct: 47 },
      { id: 'v-56', code: 'OT-T56', tag: '56', form: 'shuttle', x: 1080, y: 619, state: 'moving', batteryPct: 66 },
      { id: 'v-79', code: 'OT-T79', tag: '78', form: 'shuttle', x: 1085, y: 688, state: 'moving', batteryPct: 41 },
      { id: 'v-46', code: 'OT-T46', tag: '146', form: 'quadruped', x: 1143, y: 365, state: 'moving', batteryPct: 72 },
      {
        id: 'v-14',
        code: 'OT-T14',
        tag: '114',
        form: 'quadruped',
        x: 420, y: 632,
        state: 'blocked',
        batteryPct: 29,
        alert: 'Path blocked at aisle 114',
      },
    ],

    routes: [
      // ── The permanent aisle network. Scenery: thin, grey, never highlighted. ──
      { id: 'ln-n', kind: 'lane', points: [[250, 487], [250, 152], [700, 152]], corner: 22, stops: [[636, 152]] },
      { id: 'ln-c', kind: 'lane', points: [[594, 188], [594, 594]], stops: [[594, 192]] },
      { id: 'ln-e', kind: 'lane', points: [[800, 288], [800, 430]] },
      { id: 'ln-w', kind: 'lane', points: [[172, 487], [521, 487]], stops: [[403, 487]] },
      // Two aisle loops. Closed rings, so the fillets have to wrap the seam.
      {
        id: 'ln-loop-w',
        kind: 'lane',
        points: [[172, 425], [598, 425], [598, 500], [172, 500]],
        corner: 37,
        closed: true,
        stops: [[432, 424]],
      },
      {
        id: 'ln-loop-e',
        kind: 'lane',
        points: [[598, 425], [948, 425], [948, 757], [598, 757]],
        corner: 30,
        closed: true,
        stops: [[827, 424]],
      },
      // Floor-marked holding squares inside the loops.
      { id: 'ln-hold-w', kind: 'lane', points: [[272, 435], [300, 435], [300, 465], [272, 465]], corner: 8, closed: true },
      { id: 'ln-hold-e', kind: 'lane', points: [[915, 435], [945, 435], [945, 465], [915, 465]], corner: 8, closed: true },
      // The charging fan on the east wall.
      { id: 'ln-fan-1', kind: 'lane', points: [[1144, 530], [1144, 548], [1110, 561], [1028, 561]], corner: 22, stops: [[1057, 561], [1105, 561]] },
      { id: 'ln-fan-2', kind: 'lane', points: [[1028, 590], [1108, 590]], stops: [[1057, 590], [1105, 590]] },
      { id: 'ln-fan-3', kind: 'lane', points: [[1028, 648], [1108, 648]], stops: [[1057, 648], [1105, 648]] },

      // ── OT-T12's mission: driven, then remaining. This is the highlight. ──
      {
        id: 'r-12-done',
        kind: 'travelled',
        vehicleId: 'v-12',
        points: [[248, 618], [248, 748], [418, 748], [418, 487], [521, 487]],
        corner: 40,
      },
      {
        id: 'r-12-todo',
        kind: 'ahead',
        vehicleId: 'v-12',
        points: [[521, 487], [1143, 487], [1143, 220]],
        corner: 46,
        stops: [[594, 487], [766, 487], [868, 487], [1090, 487]],
      },

      // ── Other units' paths. Present, deliberately not shouting. ──
      {
        id: 'r-56',
        kind: 'secondary',
        tone: 'rose',
        vehicleId: 'v-56',
        points: [[1045, 600], [1112, 600], [1136, 619], [1112, 638], [1045, 638]],
        corner: 20,
      },
      {
        id: 'r-79',
        kind: 'secondary',
        tone: 'amber',
        vehicleId: 'v-79',
        points: [[1048, 669], [1114, 669], [1138, 688], [1114, 707], [1048, 707]],
        corner: 20,
      },
    ],
  },

  mission: {
    id: '9167262991',
    type: 'Drop off',
    batteryPct: 32,
    deliveredCount: 1,
    deliveryTotal: 4,
    vehicles: [
      {
        id: 'v-12',
        name: 'Robotdog OT-T12',
        code: 'OT-T12',
        payloadKg: 250,
        slot: 12,
        state: 'moving',
        assigned: true,
        imageUrl: vehicleOtT12,
      },
      // One vehicle, matching the design. OT-T07 still exists on the floor —
      // see `map.vehicles` — it is simply not on THIS mission. The rail renders
      // whatever is in this array, so a second assignment needs no template
      // change; it also still handles the empty case (`rail__empty`).
    ],
    progress: {
      fromCode: 'ES01102',
      toCode: 'FS074812',
      fraction: 0.45,
      onTime: true,
      etaDeltaMinutes: 15,
    },
    stops: [
      { id: 'S141', done: true },
      { id: 'S142', done: true },
      { id: 'S143', done: false },
      { id: 'S144', done: false },
      { id: 'S145', done: false },
      { id: 'S146', done: false },
      { id: 'S176', done: false },
    ],
    currentStopId: 'S143',
    selectedStopId: 'S141',
  },

  nav: [
    { id: 'recent', icon: 'clock', label: 'Recent activity' },
    { id: 'alerts', icon: 'alert', label: 'Alerts' },
    { id: 'zones', icon: 'asset', label: 'Zones & equipment' },
    { id: 'missions', icon: 'cube', label: 'Missions' },
    { id: 'notifications', icon: 'notification', label: 'Notifications' },
    { id: 'orders', icon: 'records', label: 'Orders' },
    { id: 'reports', icon: 'chartTrend', label: 'Reports' },
    { id: 'saved', icon: 'bookmark', label: 'Saved views' },
  ],

  user: { name: 'Robert Robertson', role: 'Admin', initials: 'RR' },

  searchPlaceholder: 'Search for customer orders, jobs, vehicles and assets',
}
