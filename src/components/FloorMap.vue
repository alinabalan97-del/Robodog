<script setup lang="ts">
  /**
   * FloorMap.vue — the live floor plan.
   *
   * A pure view over `FloorMap` data (src/data/floorOps.ts). It owns no state and
   * invents no geometry: the wall, racks, equipment, aisles and vehicles are all
   * positions in the dataset's abstract user-space, scaled to whatever box the
   * parent gives it.
   *
   * TWO COORDINATE SYSTEMS, ON PURPOSE:
   *   • Inside the <svg> everything is floor-plan user-space — a rack's `w`, a
   *     tile's `rx` and a route's stroke width are all geometry, the same kind of
   *     number as `x`. These are NOT CSS pixels and are not on the DS radius
   *     scale, which governs UI chrome (cards, buttons) — not the drawing.
   *   • The chrome around the drawing (the card it sits in, the zoom buttons)
   *     is ordinary DS territory and uses tokens/utilities like anywhere else.
   *
   * FOUR STACKED LAYERS, bottom to top:
   *   1. the hall shell          static
   *   2. the schematic — storage runs, equipment, plant, marked floor   static
   *   3. the aisle network       static — permanent infrastructure, not telemetry
   *   4. the moving layer        LIVE — routes, vehicles, equipment alert badges
   *
   * ⚠️ LAYER 2 IS BUILT IN `src/data/floorSchematic.ts`, NOT HERE, and the split
   * is the same one the rest of the project keeps: that module groups the
   * extractor's measured rectangles into addressed storage runs, equipment and
   * lettered aisles, and this file draws the result. Nothing in this component
   * decides where anything in the building is. A renderer that starts computing
   * layout is the failure CLAUDE.md records twice over — the hand-drawn plans
   * that ended up describing a warehouse the model does not have.
   *
   * FRESHNESS IS LOAD-BEARING. Only layer 4 degrades when the feed stops being
   * 'live', because a frozen map that still looks live is the worst failure this
   * product can have (CLAUDE.md → Domain rules). The skeleton stays crisp so the
   * plan is still readable; what stops being trustworthy stops looking sharp.
   *
   * EXACTLY ONE ROUTE IS DRAWN, and it belongs to the selected unit. It arrives
   * split in two — `travelled` and `ahead` — and both come from the simulation,
   * so what is highlighted is genuinely where that robot has been and is going.
   * Sixteen routes at once would be noise; none at all would leave the operator
   * guessing. Select a different unit and the highlight moves with it.
   *
   * Colors come from theme tokens via CSS vars, so both themes track automatically.
   */
  import { computed } from 'vue'
  import AppIcon from '@/components/AppIcon.vue'
  import type {
    FeedStatus,
    FloorMap,
    FloorNode,
    NodeKind,
    ShellVertex,
  } from '@/data/floorOps'
  import {
    aisleMarks,
    equipmentBlocks,
    goodsBlocks,
    plantBlocks,
    spurs,
    stationPads,
    stopMarks,
    storageBlocks,
  } from '@/data/floorSchematic'
  import { ROBOT_STATE_LABEL, UNIT_LIVERY, taskPriorities, unitName } from '@/stores/fleet'
  import type {
    EmergencyMark,
    FleetCrane,
    FleetRobot,
    RobotState,
    RobotTypeId,
    TaskPriority,
  } from '@/stores/fleet'
  import { corridors, stations } from '@/data/fleet'
  import type { RobotRoutePath } from '@/data/fleet'
  import { ASRS_PLAN_UNITS_PER_METRE, asrsCraneSize, asrsLevels, levelHeightM } from '@/data/asrs'

  const props = withDefaults(defineProps<{
    map: FloorMap
    feedStatus: FeedStatus
    /**
     * The LIVE fleet, straight from the simulation layer — not `map.vehicles`,
     * which is only the static seed. Both this view and the 3D one render this
     * same array, which is what makes them synchronised rather than merely
     * similar. This component computes nothing about robot behaviour; it draws
     * what it is given.
     */
    vehicles: FleetRobot[]
    /**
     * The ASRS stacker cranes.
     *
     * ⚠️ THEY MOVE NOW, so they are drawn WITH the traffic rather than under it:
     * each one runs a rail inside its storage aisle, and the same two numbers
     * the 3D scene poses it with — position along the rail, carriage height —
     * are what this draws. A plan cannot show the vertical directly, so the
     * carriage is drawn travelling up the mast tile instead.
     */
    cranes?: FleetCrane[]
    /**
     * The selected unit's assignment, driven and remaining. Drawn as the one
     * loud route on the plan — progress along a route reads at a glance, where
     * an ETA has to be decoded.
     */
    robotRoute?: RobotRoutePath | null
    /**
     * The urgency of the selected unit's job, which is what colours its route.
     *
     * Null when it has no task — the route then keeps the neutral "ahead"
     * treatment, because a colourless drive to a charger is not a priority
     * level and must not be drawn as one.
     */
    routePriority?: TaskPriority | null
    /**
     * Pickup and delivery points of every LIVE EMERGENCY job.
     *
     * ⚠️ THESE ARE THE ONLY MARKERS THAT FLASH, and only while a genuine
     * emergency is unfinished — a pulse is the loudest thing this plan can do
     * and it stops meaning anything the moment it is used for a second purpose.
     * They arrive as resolved coordinates rather than as task rows: resolving a
     * station id to a position is a lookup the screen owns, not the renderer.
     */
    emergencyMarks?: EmergencyMark[]
    /** 1 = fit the whole hall; above that zooms toward the centre. */
    zoom?: number
    selectedVehicleId?: string | null
  }>(), {
    cranes: () => [],
    robotRoute: null,
    routePriority: null,
    emergencyMarks: () => [],
    zoom: 1,
    selectedVehicleId: null,
  })

  const emit = defineEmits<{ selectVehicle: [id: string] }>()

  /**
   * ── THE DRAWING'S OWN PROPORTIONS, HANDED TO CSS ────────────────────────────
   *
   * ⚠️ THIS IS WHAT STOPS THE PLAN LETTERBOXING INSIDE ITS PANEL. `meet` scales
   * the drawing to fit its BOX and centres the remainder, so whenever the panel
   * is a different shape from the building the difference comes back as empty
   * bands — on a wide display, as margins down the left and right that look like
   * the map has been shrunk for no reason. Giving the box the building's own
   * aspect ratio removes the mismatch at its source: there is no remainder to
   * distribute, so the warehouse spans the full width it is given.
   *
   * ⚠️ INDEPENDENT OF `zoom`, AND THAT IS WHY IT CAN BE A PLAIN RATIO. Zooming
   * divides the viewBox's width and height by the same factor, so the shape of
   * the drawing never changes — only how much of it is shown.
   *
   * Read off `map.viewBox` rather than written as a literal, because that box is
   * the building's measured extent (CLAUDE.md → "`floorOps.map.viewBox` is the
   * building, not a crop"). Hardcoding the ratio here would silently start lying
   * the first time the plan is re-extracted.
   */
  const planAspect = computed(() =>
    `${props.map.viewBox.width} / ${props.map.viewBox.height}`,
  )

  /** Zoom by narrowing the viewBox around the centre — keeps stroke widths honest. */
  const viewBox = computed(() => {
    const { x: X, y: Y, width: W, height: H } = props.map.viewBox
    const w = W / props.zoom
    const h = H / props.zoom
    return `${X + (W - w) / 2} ${Y + (H - h) / 2} ${w} ${h}`
  })

  const isLive = computed(() => props.feedStatus === 'live')

  // ── Path building ───────────────────────────────────────────────────────────

  type Pt = readonly number[]

  const len = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1])
  const round2 = (n: number) => Math.round(n * 100) / 100

  /** Point `t` of the way from `a` toward `b`, in absolute units rather than a ratio. */
  function toward (a: Pt, b: Pt, distance: number): [number, number] {
    const d = len(a, b) || 1
    const t = distance / d
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  }

  const fmt = (p: Pt) => `${round2(p[0])} ${round2(p[1])}`

  /**
   * Turn a polyline into an SVG path with filleted corners.
   *
   * Every corner is cut back by `corner` units along both of its legs and bridged
   * with a quadratic through the original vertex — near enough to a true arc at
   * these radii, and it degrades gracefully when a leg is shorter than twice the
   * radius (the fillet just shrinks instead of overshooting).
   *
   * A vertex may carry its OWN radius as a third number, which is what lets the
   * hall wall have 30-unit building corners and 8-unit apron corners in one list.
   *
   * `closed` wraps the seam properly: the path starts mid-way along the first
   * leg so the first vertex gets a fillet like every other one, rather than the
   * hard corner you get from starting at a vertex and closing with Z.
   */
  function trace (points: readonly Pt[], corner: number, closed = false): string {
    const n = points.length
    if (n < 2) return ''
    const at = (i: number) => points[((i % n) + n) % n]
    const radiusAt = (p: Pt) => (p[2] === undefined ? corner : p[2])

    const first = at(0)
    const start = closed
      ? toward(first, at(1), Math.min(radiusAt(first), len(first, at(1)) / 2))
      : first

    let d = `M ${fmt(start)}`
    const last = closed ? n : n - 1

    for (let i = 1; i <= last; i++) {
      const cur = at(i)
      // Open paths end on their final vertex — no corner to fillet there.
      if (!closed && i === n - 1) {
        d += ` L ${fmt(cur)}`
        break
      }
      const prev = at(i - 1)
      const next = at(i + 1)
      const r = Math.min(radiusAt(cur), len(prev, cur) / 2, len(cur, next) / 2)
      d += ` L ${fmt(toward(cur, prev, r))} Q ${fmt(cur)} ${fmt(toward(cur, next, r))}`
    }

    return closed ? `${d} Z` : d
  }

  const shellPath = computed(() => trace(props.map.outline as ShellVertex[], 12, true))

  // ── The schematic ───────────────────────────────────────────────────────────
  //
  // ⚠️ MODULE CONSTANTS, NOT COMPUTEDS, AND THAT IS A PERFORMANCE FIX RATHER
  // THAN A STYLE CHOICE. This component re-renders on every simulation tick —
  // the robot array it draws is replaced sixty times a second — and the racking
  // it draws around them cannot change while the map is mounted, because it
  // comes from a generated plan. Building the grids in the template rebuilt
  // several hundred cell objects per frame for geometry that never moved.
  //
  // `floorSchematic` builds them once at module load, so the whole static layer
  // costs nothing per frame. The bindings below are re-exports for the template
  // rather than reactive state, which is why they are plain `const`.
  const schematic = {
    storage: storageBlocks,
    equipment: equipmentBlocks,
    plant: plantBlocks,
    goods: goodsBlocks,
    pads: stationPads,
    aisles: aisleMarks,
    spurs,
  }

  /**
   * Where a unit stops, split by what it stops for — each drawn as its own
   * shape. Shape rather than colour, for the usual reason: a floor display gets
   * glanced at in bad light, and the kinds have to stay tellable apart in
   * greyscale. The chargers and waiting bays are NOT here — they are marked
   * areas of floor and are drawn as pads, above.
   */
  const dockStops = stopMarks.filter(s => s.kind === 'dock')
  const workStops = stopMarks.filter(s => s.kind === 'work')
  const faceStops = stopMarks.filter(s => s.kind === 'rack')

  /**
   * The short reference printed beside a stop.
   *
   * Prefers the station's own address, because that is what dispatch and the
   * roster call it; falls back to the tail of its id rather than to the full
   * name, which at this size would be a paragraph on the drawing.
   */
  const stopCode = (station: { address?: string; id: string }) =>
    station.address ?? (station.id.split('-')[1] ?? station.id).toUpperCase()

  // ── Routes ──────────────────────────────────────────────────────────────────

  /**
   * The aisle network, drawn from the SIMULATION's corridors rather than from
   * the plan's decorative lane polylines.
   *
   * This matters more than it looks. The dataset's lanes were scenery — a
   * drawing of aisles — and the robots are routed along a declared network that
   * is not quite the same shape. Drawing the scenery while the units drive the
   * network puts robots visibly beside the aisles they are supposedly following,
   * which is exactly the kind of quiet disagreement between a view and its data
   * that makes an operator stop trusting the screen. What is drawn is now what
   * is driven, in both views.
   *
   * Straight segments, so no fillet: a corridor IS a straight run between two
   * junctions, and rounding it would re-introduce a shape the router never uses.
   */
  const lanes = corridors.map(corridor => ({
    id: corridor.id,
    label: corridor.label,
    d: corridor.axis === 'h'
      ? `M ${corridor.from} ${corridor.at} L ${corridor.to} ${corridor.at}`
      : `M ${corridor.at} ${corridor.from} L ${corridor.at} ${corridor.to}`,
  }))

  /**
   * The junctions — where one lane meets another.
   *
   * Derived by intersecting the corridors rather than listed, so a lane added to
   * `fleet.ts` brings its junctions with it. They are drawn because they are the
   * scarce resource on this floor: CLAUDE.md records that the hall's capacity is
   * limited by having only three ways ACROSS it, not by free aisle, and a map
   * that does not show where the crossings are cannot explain a queue.
   */
  const junctions = corridors
    .filter(c => c.axis === 'h')
    .flatMap(row =>
      corridors
        .filter(c => c.axis === 'v')
        .filter(col =>
          col.at >= row.from && col.at <= row.to &&
          row.at >= col.from && row.at <= col.to,
        )
        .map(col => ({ id: `${row.id}x${col.id}`, x: col.at, y: row.at })),
    )

  /**
   * ── THE FUNCTIONAL AREAS, AS BOUNDARIES ─────────────────────────────────────
   *
   * ⚠️ DERIVED FROM `WorkArea`, NOT DRAWN. The hall is already partitioned into
   * operational areas — `west` · `centre` · `production` · `loading` — and that
   * partition is load-bearing rather than decorative: `duties` in
   * `src/data/fleet.ts` names the areas each stage may pick up and drop off in,
   * which is the whole reason a forklift stays near the racking and an AGV stays
   * near the workstations. Every station carries its area.
   *
   * So the boundary of an area is the extent of the stations inside it, and
   * nothing here invents geometry. That matters more than it sounds: a hand-drawn
   * set of zone rectangles would be a second opinion about where the areas are,
   * and the moment `areaOf()` changed, the map would be quietly describing a
   * floor plan the simulation no longer uses — the exact failure CLAUDE.md
   * records for the two hand-drawn layouts this map replaced.
   *
   * Padded outward so the boundary sits AROUND its stops rather than through
   * them, which is what makes it read as an enclosure instead of a bounding box.
   */
  const AREA_PAD = 38

  const areaOutlines = computed(() => {
    const bounds = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>()

    for (const station of stations) {
      if (!station.area) continue
      const box = bounds.get(station.area)
      if (!box) {
        bounds.set(station.area, { minX: station.x, minY: station.y, maxX: station.x, maxY: station.y })
        continue
      }
      box.minX = Math.min(box.minX, station.x)
      box.minY = Math.min(box.minY, station.y)
      box.maxX = Math.max(box.maxX, station.x)
      box.maxY = Math.max(box.maxY, station.y)
    }

    return [...bounds].map(([area, box]) => ({
      id: area,
      // The area's own name, in the vocabulary the dispatcher and the roster
      // already use — never a second set of labels invented for the map.
      label: area,
      x: box.minX - AREA_PAD,
      y: box.minY - AREA_PAD,
      w: (box.maxX - box.minX) + AREA_PAD * 2,
      h: (box.maxY - box.minY) + AREA_PAD * 2,
    }))
  })

  // ── Fixed things ────────────────────────────────────────────────────────────

  const nodeIcon: Record<NodeKind, string> = {
    charger: 'charger',
    lift: 'upToTop',
    station: 'package',
    pallet: 'cube',
    slot: '',
  }

  /** Equipment tiles are the dark ones; goods on the floor are the light ones. */
  const isEquipment = (n: FloorNode) => n.kind === 'charger' || n.kind === 'lift' || n.kind === 'station'

  const alertedNodes = computed(() => props.map.nodes.filter(n => n.alert))

  /** One glyph per chassis, so the three types are tellable apart on the plan. */
  const vehicleIcon: Record<RobotTypeId, string> = {
    A: 'vehicle',
    B: 'shipping',
    C: 'asset',
  }

  /** CSS-safe modifier for a chassis type: 'A' → 'vehicle--type-a'. */
  const typeClass = (id: RobotTypeId) => `vehicle--type-${id.toLowerCase()}`

  /**
   * Facing, as a triangle on the tile's leading edge. Direction is drawn as a
   * SHAPE rather than as a rotated icon so it survives the tile's other states
   * and stays readable at wall-display distance.
   *
   * `headingRad` is measured CLOCKWISE FROM PLAN-NORTH — the one convention the
   * simulation, this view and the 3D layer all share — so the forward vector is
   * (sin h, −cos h) in plan space, where y runs down the page.
   */
  function headingPoints (v: FleetRobot) {
    const forwardX = Math.sin(v.headingRad)
    const forwardY = -Math.cos(v.headingRad)
    return ([[20, 0], [13, -5], [13, 5]] as Array<[number, number]>)
      .map(([along, across]) => {
        const x = v.x + along * forwardX - across * forwardY
        const y = v.y + along * forwardY + across * forwardX
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  }

  /** Every state gets a word — the map never conveys status by colour alone. */
  const stateLabel = (state: RobotState) => ROBOT_STATE_LABEL[state].toLowerCase()

  // ── The ASRS cranes ─────────────────────────────────────────────────────────
  //
  // Drawn TO SCALE across the aisle, from the same metres the 3D scene builds
  // from: a plan that showed the crane wider than its aisle would contradict the
  // other view about whether the machine fits, which is the whole question this
  // change was about.

  /** The machine's footprint on the plan, in plan units. */
  const CRANE_W = asrsCraneSize.widthM * ASRS_PLAN_UNITS_PER_METRE
  const CRANE_L = asrsCraneSize.lengthM * ASRS_PLAN_UNITS_PER_METRE

  /**
   * How far up the mast tile the carriage is drawn.
   *
   * Vertical is the one axis a top-down plan cannot show, so the carriage is
   * drawn travelling along the tile's LONG axis instead — the same fraction of
   * the same stroke the 3D carriage climbs, so the two views always name the
   * same level. Guarded against a zero-height stroke, which would put the rect
   * at NaN and silently drop it.
   */
  const CRANE_STROKE_M = Math.max(0.01, levelHeightM(asrsLevels.count))
  const carriageOffset = (c: FleetCrane) =>
    (Math.min(1, Math.max(0, c.carriageM / CRANE_STROKE_M)) - 0.5) * (CRANE_L - 6)

  /** Everything the crane tile shows visually, said in words for assistive tech. */
  function craneLabel (c: FleetCrane) {
    const parts = [
      c.label,
      c.activity.toLowerCase(),
      `carriage at level ${c.level} of ${asrsLevels.count}`,
      `${c.carriageM.toFixed(2)} metres above the floor`,
    ]
    if (c.bayAddress) parts.push(`bay ${c.bayAddress}`)
    if (c.deckCargoId) parts.push(`${c.deckCargoId} waiting on the transfer deck`)
    if (c.pending) parts.push('cycle not yet dispatched')
    return parts.join(', ')
  }

  /**
   * The reference an operator calls the unit by.
   *
   * ⚠️ THE CALL-SIGN, NOT THE NUMBER, AND THAT IS A CORRECTNESS FIX. This used to
   * render `AMR-01` as "01" — which is also what `FLT-01` rendered as. Two
   * machines on one floor plan carrying the same label is a dispatch surface
   * inviting an operator to act on the wrong robot. With five units there is room
   * for a real name, and `UNIT_LIVERY` gives each one. Falls back to the full
   * code — never to the ambiguous fragment.
   */
  const shortTag = (v: FleetRobot) => unitName(v.id) ?? v.code

  /**
   * This unit's own accent, for the heading arrow.
   *
   * The per-type CSS classes below still supply a fallback, so a unit with no
   * livery keeps its chassis colour rather than losing its arrow entirely.
   */
  const accentOf = (v: FleetRobot) => {
    const accent = UNIT_LIVERY[v.id]?.accent
    return accent ? `rgb(var(--v-theme-${accent}))` : undefined
  }

  /** Everything the marker shows visually, said in words for assistive tech. */
  function vehicleLabel (v: FleetRobot) {
    const parts = [
      `Robot ${v.code}`,
      `type ${v.typeId}`,
      stateLabel(v.state),
      v.activity.toLowerCase(),
      v.carrying ? 'carrying a pallet' : 'empty',
      `battery ${Math.round(v.batteryPct)} percent`,
      `speed ${v.speedMps.toFixed(1)} metres per second`,
    ]
    if (v.taskKind) parts.push(v.taskLabel.toLowerCase())
    if (v.destinationLabel) parts.push(`heading to ${v.destinationLabel}`)
    if (v.alert) parts.push(`alert: ${v.alert}`)
    return parts.join(', ')
  }

  // ── The selected unit's live route ──────────────────────────────────────────
  // Drawn with the same two treatments the static mission legs use, so "already
  // driven" and "still to drive" read identically whichever produced them.

  const travelledPath = computed(() =>
    (props.robotRoute?.travelled.length ?? 0) >= 2 ? trace(props.robotRoute!.travelled, 14) : '',
  )
  const aheadPath = computed(() =>
    (props.robotRoute?.ahead.length ?? 0) >= 2 ? trace(props.robotRoute!.ahead, 14) : '',
  )

  /**
   * ── THE ROUTE'S COLOUR IS THE JOB'S URGENCY ─────────────────────────────────
   *
   * Resolved to a CSS colour here rather than switched by a class, because the
   * levels and their tokens live in one table (`taskPriorities`) and a stylesheet
   * cannot read it. Adding a fifth priority is one entry there and no change in
   * this file — which is the whole reason the table exists.
   *
   * ⚠️ NOT THE SAME TOKEN THE CHIPS USE. A chip separates four levels from each
   * other on a panel; a route has to separate itself from racking, aisles and
   * sixteen robot markers. Normal work is where the two disagree — green reads
   * as "fine" on a chip and fights the racking on the floor — so routes take
   * `routeTone`. See the note on it in `src/data/fleet.ts`.
   */
  const routeInk = computed(() => {
    const priority = props.routePriority
    if (!priority) return null
    return `rgb(var(--v-theme-${taskPriorities[priority].routeTone}))`
  })

  /** The soft under-glow, at the same hue. Alpha needs the raw channel triple. */
  const routeGlow = computed(() => {
    const priority = props.routePriority
    if (!priority) return null
    return `rgba(var(--v-theme-${taskPriorities[priority].routeTone}), 0.2)`
  })

  /** Emergencies are the one route that pulses, matching their markers. */
  const routeIsUrgent = computed(() =>
    props.routePriority !== null && taskPriorities[props.routePriority].flashes,
  )

  /** Everything the marker means, in words — the pulse is never the only signal. */
  function markLabel (mark: EmergencyMark) {
    return `Emergency ${mark.role === 'pickup' ? 'pickup' : 'delivery'}: ${mark.label}. ${mark.taskLabel}`
  }
</script>

<template>
  <div class="floor-map" :class="{ 'floor-map--degraded': !isLive }">
    <!-- The label counts `vehicles`, not `map.vehicles`: the latter is the
         dataset's frozen sample and stopped being what this map draws when the
         simulation took over. A screen reader was being told seven units were
         shown while sixteen were on screen. -->
    <svg
      class="floor-map__svg"
      :viewBox="viewBox"
      :style="{ aspectRatio: planAspect }"
      preserveAspectRatio="xMidYMid meet"
      role="group"
      :aria-label="`Floor plan. ${vehicles.length} robots shown.`"
    >
      <!-- 1 · Hall shell -->
      <path class="hall" :d="shellPath" />

      <!-- 1b · Functional-area boundaries. Drawn BEFORE the racking and the
           lanes so they read as the ground the hall is organised on rather than
           as a box placed over it. Purely an annotation: no fill, one stroke
           weight, and nothing here is interactive. -->
      <g class="areas">
        <g v-for="area in areaOutlines" :key="area.id">
          <rect
            class="area__bound"
            :x="area.x" :y="area.y" :width="area.w" :height="area.h"
            rx="16"
          />
          <text class="area__label" :x="area.x + 10" :y="area.y + 18">{{ area.label }}</text>
        </g>
      </g>

      <!-- 2 · Fixed plant. Mass standing on the floor that is not shelving —
           conveyors, transfer stands, benches, loose machinery. Unnamed,
           because the model names nothing and a label here would assert what no
           measurement supports; the height is real and goes in the tooltip. -->
      <g v-for="p in schematic.plant" :key="p.id">
        <title>Fixed plant · {{ p.heightM.toFixed(2) }} m tall</title>
        <rect
          v-for="(part, i) in p.parts"
          :key="`${p.id}-${i}`"
          class="plant"
          :x="part.x" :y="part.y" :width="part.w" :height="part.h"
          rx="5"
        />
      </g>

      <!-- 2a · Goods standing on the open floor. Filled rather than outlined:
           these are the only static things on the plan that are STOCK rather
           than structure, and a solid mark is what makes a floor read as worked
           instead of empty. -->
      <g v-for="g in schematic.goods" :key="g.id">
        <title>Goods on the floor</title>
        <rect
          v-for="(part, i) in g.parts"
          :key="`${g.id}-${i}`"
          class="goods"
          :x="part.x" :y="part.y" :width="part.w" :height="part.h"
          rx="3"
        />
      </g>

      <!-- 2b · The storage runs. A rounded container, the pallet positions it
           holds, and the address an operator calls it by. Every cell is one
           position at the building's real 1.3 m bay pitch, so cells are the
           same size everywhere on the plan and two of them genuinely mean two
           pallets. -->
      <g v-for="block in schematic.storage" :key="block.id" class="store">
        <title>{{ block.label }} — {{ block.positions }} pallet positions</title>
        <!-- One container per MEASURED part, not one around the whole run. A
             run against the west wall is a shallow strip with two deep bays
             bulging off it; a single box around that covers open floor. -->
        <rect
          v-for="(part, i) in block.parts"
          :key="`${block.id}-s${i}`"
          class="store__shell"
          :x="part.x" :y="part.y" :width="part.w" :height="part.h"
          rx="10"
        />
        <rect
          v-for="(cell, i) in block.cells"
          :key="`${block.id}-${i}`"
          class="store__cell"
          v-bind="cell"
        />
        <text
          class="store__label"
          :x="block.labelAt.x" :y="block.labelAt.y"
          :text-anchor="block.labelAt.anchor"
          :transform="block.labelAt.rotate
            ? `rotate(${block.labelAt.rotate} ${block.labelAt.x} ${block.labelAt.y})`
            : undefined"
        >{{ block.label }}</text>
      </g>

      <!-- 2c · Equipment. The same treatment one size down and without an
           address: these clusters are too small to be a storage run, and
           numbering them would claim knowledge the measurement does not have. -->
      <g v-for="block in schematic.equipment" :key="block.id" class="kit">
        <rect
          v-for="(part, i) in block.parts"
          :key="`${block.id}-s${i}`"
          class="kit__shell"
          :x="part.x" :y="part.y" :width="part.w" :height="part.h"
          rx="5"
        />
        <rect
          v-for="(cell, i) in block.cells"
          :key="`${block.id}-${i}`"
          class="kit__cell"
          v-bind="cell"
        />
      </g>

      <!-- 3 · The aisle network. Permanent infrastructure — never highlighted,
           and never dimmed, because it is not telemetry. -->
      <g class="lanes">
        <g v-for="l in lanes" :key="l.id">
          <title>{{ l.label }}</title>
          <path class="lane" :d="l.d" />
        </g>
        <!-- The crossings. Scarce on this floor — three of them carry the whole
             building — so they are marked rather than left implicit. -->
        <rect
          v-for="j in junctions"
          :key="j.id"
          class="lane__junction"
          :x="j.x - 4" :y="j.y - 4" width="8" height="8"
          rx="2"
        />
        <!-- The spurs — how a stop that stands off the lane is reached from it.
             Drawn under the stops so each link runs into its mark rather than
             across it. -->
        <line
          v-for="s in schematic.spurs"
          :key="s.id"
          class="lane__spur"
          :x1="s.x1" :y1="s.y1" :x2="s.x2" :y2="s.y2"
        />

        <!-- The lane letters, each on a leader back to its own lane. The tick is
             not decoration: three lanes run within 8 units of each other through
             the middle of the building, and a floating letter beside them does
             not say which one it names. -->
        <g v-for="mark in schematic.aisles" :key="`mk-${mark.id}`">
          <title>{{ mark.label }}</title>
          <line
            class="lane__tick"
            :x1="mark.axis === 'h' ? mark.x : mark.x - 9"
            :y1="mark.axis === 'h' ? mark.y + 3 : mark.y"
            :x2="mark.axis === 'h' ? mark.x : mark.x - 3"
            :y2="mark.axis === 'h' ? mark.y + 9 : mark.y"
          />
          <text
            class="lane__code"
            :class="`lane__code--${mark.axis}`"
            :x="mark.x" :y="mark.y"
          >{{ mark.code }}</text>
        </g>
      </g>

      <!-- 3b · Marked floor — the charging stalls and the waiting-bay ranks.
           Dashed, because that is what they are on a real floor: painted areas
           a unit is dispatched into. Every other stop is a point a unit stops
           AT and stays a mark. -->
      <g v-for="pad in schematic.pads" :key="pad.id" :class="['pad', `pad--${pad.kind}`]">
        <title>{{ pad.label }} — {{ pad.stops.length }} stalls</title>
        <rect
          class="pad__bound"
          :x="pad.x" :y="pad.y" :width="pad.w" :height="pad.h"
          rx="9"
        />
        <g v-for="stop in pad.stops" :key="stop.id">
          <title>{{ stop.label }}</title>
          <rect class="pad__stall" :x="stop.x - 11" :y="stop.y - 9" width="22" height="18" rx="4" />
          <foreignObject v-if="pad.kind === 'charger'" :x="stop.x - 6" :y="stop.y - 6" width="12" height="12">
            <div class="glyph glyph--pad" xmlns="http://www.w3.org/1999/xhtml">
              <AppIcon name="charger" />
            </div>
          </foreignObject>
        </g>
      </g>

      <!-- 3c · The stops themselves, one shape per kind so the three stay
           tellable apart in greyscale and at wall-display distance. -->
      <g class="stops">
        <!-- A rack face sits ON its lane — a unit picking there blocks it, as on
             a real floor — so it is drawn as a tick across the lane, not as a
             tile beside it. -->
        <g v-for="s in faceStops" :key="s.id" class="stop stop--face">
          <title>{{ s.label }}</title>
          <rect class="stop__face" :x="s.x - 2" :y="s.y - 11" width="4" height="22" rx="2" />
        </g>

        <!-- A workstation: a hollow square, the shape the AGVs' whole round trip
             runs between. -->
        <g v-for="s in workStops" :key="s.id" class="stop stop--work">
          <title>{{ s.label }}</title>
          <rect class="stop__work" :x="s.x - 12" :y="s.y - 12" width="24" height="24" rx="5" />
          <foreignObject :x="s.x - 7" :y="s.y - 7" width="14" height="14">
            <div class="glyph glyph--stop" xmlns="http://www.w3.org/1999/xhtml">
              <AppIcon name="settings" />
            </div>
          </foreignObject>
          <text class="stop__code" :x="s.x" :y="s.y + 25">{{ stopCode(s) }}</text>
        </g>

        <!-- A loading bay: a wider mouth, open toward the lane it is entered
             from, so a dock never reads as a workstation. -->
        <g v-for="s in dockStops" :key="s.id" class="stop stop--dock">
          <title>{{ s.label }}</title>
          <rect class="stop__dock" :x="s.x - 17" :y="s.y - 11" width="34" height="22" rx="4" />
          <foreignObject :x="s.x - 7" :y="s.y - 7" width="14" height="14">
            <div class="glyph glyph--stop" xmlns="http://www.w3.org/1999/xhtml">
              <AppIcon name="shipping" />
            </div>
          </foreignObject>
          <text class="stop__code" :x="s.x" :y="s.y + 24">{{ stopCode(s) }}</text>
        </g>
      </g>

      <!-- 4 · Fixed equipment and goods. Tiles are static; their alert badges
           are not, and live in the moving layer below. -->
      <g v-for="n in map.nodes" :key="n.id" class="node">
        <title>{{ n.label }}{{ n.tag ? ` (${n.tag})` : '' }}</title>
        <template v-if="isEquipment(n)">
          <rect class="node__tile" :x="n.x - 14" :y="n.y - 14" width="28" height="28" rx="8" />
          <!-- Chargers wear a bar for the contact rail, so they read as chargers
               at a glance rather than as one more square with a glyph in it. -->
          <rect v-if="n.kind === 'charger'" class="node__rail" :x="n.x - 7" :y="n.y - 11" width="14" height="3" rx="1.5" />
          <foreignObject :x="n.x - 8" :y="n.y - 8" width="16" height="16">
            <div class="glyph glyph--node" xmlns="http://www.w3.org/1999/xhtml">
              <AppIcon :name="nodeIcon[n.kind]" />
            </div>
          </foreignObject>
        </template>
        <template v-else-if="n.kind === 'pallet'">
          <rect class="node__goods" :x="n.x - 9" :y="n.y - 12" width="18" height="24" rx="5" />
          <foreignObject :x="n.x - 5.5" :y="n.y - 5.5" width="11" height="11">
            <div class="glyph glyph--goods" xmlns="http://www.w3.org/1999/xhtml">
              <AppIcon :name="nodeIcon[n.kind]" />
            </div>
          </foreignObject>
        </template>
        <rect v-else class="node__slot" :x="n.x - 12" :y="n.y - 12" width="24" height="24" rx="6" />
        <text v-if="n.tag" class="tag tag--node" :x="n.x + 15" :y="n.y - 19">{{ n.tag }}</text>
      </g>

      <!-- 5 · The moving layer. Everything in here is live telemetry, and all of
           it degrades together the moment the feed stops being current. -->
      <g class="moving-layer">
        <!-- The dataset's own mission legs are deliberately NOT drawn. They
             describe vehicles that are no longer on this floor — the simulation
             is the vehicle layer now — and a route with no robot on it is a
             claim the plan cannot back up. The one route shown is the selected
             unit's, below, and it comes from the same simulation as the units. -->

        <!-- The ASRS stacker cranes. Two axes, drawn as two things that move:
             the machine slides along its rail, and the carriage slides along the
             machine. Both come straight from the simulation, so this and the 3D
             scene cannot disagree about where a crane is or what level it is
             working. Whether it is WORKING is signalled by a ring plus the word
             in its label, never by a colour on its own. -->
        <g v-for="c in cranes" :key="c.id" :class="['crane', { 'crane--working': c.working }]">
          <title>{{ craneLabel(c) }}</title>

          <!-- The rail. Drawn the full length of the crane's travel, because how
               far a machine CAN go is the one thing a still frame cannot say. -->
          <line
            class="crane__rail"
            :x1="c.railFrom" :y1="c.y" :x2="c.railTo" :y2="c.y"
          />
          <!-- The pick-and-deposit deck at the aisle end, and the load on it. -->
          <rect
            class="crane__deck"
            :x="c.transferX - 5" :y="c.y - CRANE_W / 2" width="10" :height="CRANE_W"
            rx="2"
          />
          <rect
            v-if="c.deckCargoId"
            class="crane__cargo"
            :x="c.transferX - 3.5" :y="c.y - 3.5" width="7" height="7" rx="1.5"
          />

          <circle v-if="c.working" class="crane__halo" :cx="c.x" :cy="c.y" r="17" />

          <!-- The machine itself, TO SCALE: long along the rail, narrow across
               the aisle. That proportion is the point — a crane drawn as a square
               tile is what made the old one look as wide as the aisle it runs
               down. -->
          <rect
            class="crane__body"
            :x="c.x - CRANE_L / 2" :y="c.y - CRANE_W / 2"
            :width="CRANE_L" :height="CRANE_W" rx="2.5"
          />
          <!-- The carriage. Vertical is the one axis a plan cannot show, so its
               height is drawn as travel ALONG the machine instead. -->
          <rect
            class="crane__carriage"
            :x="c.x + carriageOffset(c) - 3" :y="c.y - CRANE_W / 2 + 1"
            width="6" :height="CRANE_W - 2" rx="1.5"
          />
          <rect
            v-if="c.cargoId"
            class="crane__cargo"
            :x="c.x + carriageOffset(c) - 2.5" :y="c.y - 2.5" width="5" height="5" rx="1"
          />
        </g>

        <!-- Equipment alerts. Split from their tile above so the badge — which IS
             live state — dims with the feed while the plan stays legible. -->
        <g v-for="n in alertedNodes" :key="`${n.id}-alert`" class="badge-group">
          <circle class="badge" :cx="n.x + 12" :cy="n.y - 12" r="6.5" />
          <text class="badge__mark" :x="n.x + 12" :y="n.y - 8.5">!</text>
        </g>

        <!-- The selected unit's live assignment. Two treatments, one route:
             what it has driven, and what it still has to. This replaces the
             static mission legs above whenever a robot is selected. -->
        <!-- The half still to drive takes the JOB'S colour; the half already
             driven keeps its own neutral treatment, because progress is a
             different question from urgency and mixing them would leave the
             operator unable to read either. -->
        <template v-if="travelledPath || aheadPath">
          <path v-if="travelledPath" class="route route--travelled route__glow" :d="travelledPath" />
          <path v-if="travelledPath" class="route route--travelled route__band" :d="travelledPath" />
          <path v-if="travelledPath" class="route route--travelled route__pips" :d="travelledPath" />
          <path
            v-if="aheadPath"
            class="route route--ahead route__glow"
            :class="{ 'route--urgent': routeIsUrgent }"
            :style="routeGlow ? { stroke: routeGlow } : undefined"
            :d="aheadPath"
          />
          <path
            v-if="aheadPath"
            class="route route--ahead route__band"
            :class="{ 'route--urgent': routeIsUrgent }"
            :style="routeInk ? { stroke: routeInk } : undefined"
            :d="aheadPath"
          />
        </template>

        <!-- ── Emergency pickup and delivery ─────────────────────────────────
             The loudest thing on the plan, and reserved for exactly one meaning.
             Each mark carries THREE independent signals so none of them is
             load-bearing on its own: a pulsing ring (motion), a distinct shape
             per role (square for collect, diamond for deliver) and a full
             description in its accessible name. -->
        <g
          v-for="mark in emergencyMarks"
          :key="mark.id"
          class="emergency"
          role="img"
          :aria-label="markLabel(mark)"
        >
          <title>{{ markLabel(mark) }}</title>
          <circle class="emergency__pulse" :cx="mark.x" :cy="mark.y" r="26" />
          <circle class="emergency__ring" :cx="mark.x" :cy="mark.y" r="22" />
          <rect
            v-if="mark.role === 'pickup'"
            class="emergency__mark"
            :x="mark.x - 8" :y="mark.y - 8" width="16" height="16" rx="2"
          />
          <rect
            v-else
            class="emergency__mark"
            :x="mark.x - 8" :y="mark.y - 8" width="16" height="16" rx="2"
            :transform="`rotate(45 ${mark.x} ${mark.y})`"
          />
        </g>

        <!-- Robots. Focusable so the plan is reachable without a pointer. -->
        <g
          v-for="v in vehicles"
          :key="v.id"
          :class="[
            'vehicle',
            `vehicle--${v.state}`,
            typeClass(v.typeId),
            {
              'vehicle--selected': v.id === selectedVehicleId,
              // Highlighted for the same reason its route is: this unit is the
              // one running the emergency. The word is already in its
              // accessible name and in the roster beside the map.
              'vehicle--urgent': v.taskPriority === 'emergency',
            },
          ]"
          tabindex="0"
          role="button"
          :aria-label="vehicleLabel(v)"
          :aria-pressed="v.id === selectedVehicleId"
          @click="emit('selectVehicle', v.id)"
          @keydown.enter.prevent="emit('selectVehicle', v.id)"
          @keydown.space.prevent="emit('selectVehicle', v.id)"
        >
          <title>{{ vehicleLabel(v) }}</title>
          <!-- The urgent halo sits UNDER everything, so it reads as a glow
               around the machine rather than as a ring drawn on it. -->
          <circle
            v-if="v.taskPriority === 'emergency'"
            class="vehicle__urgent-halo"
            :cx="v.x" :cy="v.y" r="24"
          />
          <!-- Direction first, so the tile paints over its base. -->
          <!-- The arrow carries the unit's OWN accent, not its chassis's. The
               per-type rules in the stylesheet remain as the fallback for a unit
               with no livery, so nothing loses its arrow. -->
          <polygon
            class="vehicle__heading"
            :points="headingPoints(v)"
            :style="accentOf(v) ? { fill: accentOf(v) } : undefined"
          />
          <rect class="vehicle__ring" :x="v.x - 18" :y="v.y - 18" width="36" height="36" rx="11" />
          <rect class="vehicle__tile" :x="v.x - 14" :y="v.y - 14" width="28" height="28" rx="8" />
          <foreignObject :x="v.x - 8.5" :y="v.y - 8.5" width="17" height="17">
            <div class="glyph glyph--vehicle" xmlns="http://www.w3.org/1999/xhtml">
              <AppIcon :name="vehicleIcon[v.typeId]" />
            </div>
          </foreignObject>
          <!-- Loaded vs empty, as a filled corner block: a shape, not a tint. -->
          <rect
            v-if="v.carrying"
            class="vehicle__cargo"
            :x="v.x - 13" :y="v.y + 6" width="10" height="6" rx="1.5"
          />
          <!-- Charge, as a length. A bar under the tile is readable at distance
               where a tinted tile is not, and it carries its own low-charge
               state rather than relying on the fill colour to say so. -->
          <rect class="vehicle__charge-track" :x="v.x - 10" :y="v.y + 16" width="20" height="3.5" rx="1.75" />
          <rect
            class="vehicle__charge-fill"
            :class="{ 'vehicle__charge-fill--low': v.batteryPct < 20 }"
            :x="v.x - 10" :y="v.y + 16"
            :width="Math.max(0.5, (v.batteryPct / 100) * 20)" height="3.5" rx="1.75"
          />
          <text class="tag tag--vehicle" :x="v.x + 15" :y="v.y - 19">{{ shortTag(v) }}</text>
          <circle v-if="v.alert" class="badge" :cx="v.x + 12" :cy="v.y - 12" r="6.5" />
          <text v-if="v.alert" class="badge__mark" :x="v.x + 12" :y="v.y - 8.5">!</text>
        </g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
/* Centring, so whatever slack is left after the plan has taken the width it can
   is split evenly rather than piling up on one side. */
.floor-map {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  min-height: 0;
}

/* ⚠️ THE BOX IS THE BUILDING'S SHAPE, NOT THE PANEL'S — see `planAspect`, which
   supplies `aspect-ratio` inline. `width: 100%` makes the plan take the full
   width it is offered, ALWAYS — there is deliberately no `max-height` cap here
   any more. A cap answers "the panel is wide and short" by shrinking the width
   to fit the leftover height, which is exactly the empty side margins this was
   supposed to prevent (`aspect-ratio` + `max-height` shrink together to satisfy
   the cap). Without it, height is simply `width / planAspect` — on a wide panel
   that can exceed the panel's own height, and `.ops-layout__map`'s ancestor
   chain (`FloorOps.vue`) is `min-height`, not `height`, precisely so it can grow
   to fit rather than clip. Still never crops, never distorts — just no longer
   trades width away to stay inside a fixed viewport. */
.floor-map__svg {
  width: 100%;
  max-width: 100%;
  display: block;
  transition: transform 0.3s ease;
}

/* The old CSS-tilt "3D" is gone: 3D is now a real scene
   (src/components/warehouse/WarehouseViewer.vue) and this component renders the
   2D view only. A perspective transform on the SVG was never a floor plan in
   depth — it was the same flat drawing on a slant. */

@media (prefers-reduced-motion: reduce) {
  .floor-map__svg { transition: none; }
}

/* ── Shell ── */
/* ⚠️ `map-floor` IS THE GROUND, AND SIX OTHER RULES IN THIS FILE READ AS THAT
   SAME COLOUR — CHANGE THEM TOGETHER OR NOT AT ALL. `.store__label`,
   `.lane__code` and `.stop__code` stroke a halo in the floor colour under their
   text (`paint-order: stroke`), and `.lane__junction`, `.pad__stall` and
   `.stop__work`/`.stop__dock` fill with it so they read as holes in the floor
   rather than as objects on it. Move the slab alone and all six become smudges
   of the OLD floor colour sitting on the new one — which looks like a rendering
   fault, not a colour choice, and nothing warns you.

   ⚠️ IT IS NO LONGER DARKER THAN THE PANEL BEHIND IT. The slab used to be pure
   black against the frame's dark navy, on the argument that a control drawing
   wants light structure on the darkest possible ground. It is now the lighter of
   the two, so the building reads as a lit surface inside a dark frame instead of
   a hole in one. The hairlines still hold: `on-surface-weak` on this slab is
   about 6.4:1, down from 8.2:1 on black and still clear of the 4.5:1 floor the
   domain rules require for a display read at distance.

   ⚠️ AND IT IS NOT WHAT THE 3D VIEW USES. That slab is `floor-graphite`, still
   pure black, because it is a LIT surface whose whole appearance is specular
   reflection — the two grounds are the same building rendered by two different
   sets of rules, and they are allowed to differ. */
.hall {
  fill: rgb(var(--v-theme-map-floor));
  stroke: rgba(var(--v-theme-outline-medium), 0.9);
  stroke-width: 1.4;
  vector-effect: non-scaling-stroke;
}

/* ── Functional-area boundaries ──────────────────────────────────────────────
   One weight, one colour, no fill — an area boundary is an annotation, and the
   moment it carries a tint it starts competing with the states that are allowed
   to. `vector-effect` keeps the stroke a true hairline at every zoom level:
   without it the browser scales the stroke with the viewBox, so zooming in
   thickens every boundary and the "uniform stroke width" stops being uniform
   the first time an operator zooms. */
/* Dashed now, and fainter. An area boundary and a storage container are both
   rounded rectangles, so with a solid stroke the two read as the same kind of
   object — and the areas are the ones that are NOT physical. Dashing separates
   "an operational region" from "a thing you can walk into" without spending a
   colour on it. */
.area__bound {
  fill: none;
  stroke: rgba(var(--v-theme-outline-medium), 0.3);
  stroke-width: 1;
  stroke-dasharray: 7 6;
  vector-effect: non-scaling-stroke;
}

.area__label {
  fill: rgba(var(--v-theme-on-surface-weak), 0.55);
  font-size: 11px;
  letter-spacing: 0.08em;
  /* Areas are named in lower case throughout the model (`areaOf`), and the DS
     forbids uppercasing that nobody asked for — so the label is the model's own
     word, spaced out rather than shouted. */
  font-family: inherit;
}

/* ── Zones ── */
/* Racking is drawn ONLY as its bays — no fill, no outline. The beams are the
   information; a box around them would just add a second edge to read. */
/* ── STRUCTURE IS NEUTRAL, AND THAT IS THE WHOLE REDESIGN ────────────────────
   Racking used to be drawn in `secondary` (mint) and the zones in filled
   `primary-deep` and `warning`. Three saturated colours across every static
   element in the hall meant the plan spent its entire palette on things that
   never change — so a robot running an emergency had nothing left to stand out
   against. On a control surface, colour is a scarce signal reserved for STATE:
   structure is drawn in line weight, and only live things get a hue. */
/* ── The storage runs ────────────────────────────────────────────────────────
   A container and its positions, and the two carry different weights on
   purpose: the container is a hairline that says where the run is, the cells are
   a soft fill that says what is in it. Reversing that — a filled container with
   outlined cells — turns each run into a solid block and loses the capacity,
   which is the only thing the grid is there to show. */
.store__shell {
  fill: rgba(var(--v-theme-outline-medium), 0.05);
  stroke: rgba(var(--v-theme-outline-medium), 0.75);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

/* One pallet position. Filled rather than outlined — at this size an outline is
   two hairlines a couple of units apart, which reads as noise; a soft fill reads
   as an occupied slot and keeps the grid legible when the map is zoomed out.
   Deliberately neutral: a position only takes a colour when something live is
   happening on it, and nothing here is live. */
.store__cell {
  fill: rgba(var(--v-theme-outline-medium), 0.42);
  stroke: none;
}

/* The run's address, over its own cells. `paint-order` draws a dark halo behind
   the glyphs so the label stays readable against the positions underneath it
   without needing a plate — a plate would punch a hole in the grid it labels. */
.store__label {
  fill: rgb(var(--v-theme-on-surface-weak));
  font-size: 13px;
  letter-spacing: 0.1em;
  font-variant-numeric: tabular-nums;
  paint-order: stroke;
  stroke: rgb(var(--v-theme-map-floor));
  stroke-width: 3.5;
  stroke-linejoin: round;
  pointer-events: none;
}

/* ── Equipment ───────────────────────────────────────────────────────────────
   The same two-weight treatment one step quieter. It has to sit BELOW the
   storage runs in the visual hierarchy without disappearing: these are the
   objects that make an aisle narrower than it looks on a plan. */
.kit__shell {
  fill: none;
  stroke: rgba(var(--v-theme-outline-medium), 0.55);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

/* ⚠️ STRONGER THAN A STORAGE POSITION, NOT WEAKER. Most equipment clusters are
   a single pallet footprint, so the cell nearly fills its own container — and at
   the storage tint the two hairlines and the faint fill read as an empty box
   rather than as a solid object standing in the aisle. These are exactly the
   things that make an aisle narrower than the plan suggests, so they have to
   read as mass. */
.kit__cell {
  fill: rgba(var(--v-theme-outline-medium), 0.5);
  stroke: none;
}

/* Fixed plant — no cells, because nothing is known about what is inside it and
   drawing a grid would be inventing a capacity. It still has to read as solid
   mass: these are machines standing in the aisles, and an operator reading
   clearance off the plan needs them to look like obstacles. */
.plant {
  fill: rgba(var(--v-theme-outline-medium), 0.22);
  stroke: rgba(var(--v-theme-outline-medium), 0.6);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

/* Goods on the floor. The one static thing on the plan drawn in the ink used
   for stock rather than for structure, so a pallet parked in an aisle is not
   mistaken for a piece of the building. Solid, unoutlined and small. */
.goods {
  fill: rgba(var(--v-theme-on-surface-weak), 0.55);
  stroke: none;
}

/* ── The aisle network ── */
.lane {
  fill: none;
  stroke: rgba(var(--v-theme-outline-medium), 0.8);
  stroke-width: 1;
  stroke-linejoin: round;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

/* A spur is a branch off the road, not road itself, so it is drawn lighter than
   a lane. Same colour, less weight — the hierarchy says which one carries
   through traffic without spending a second hue on it. */
.lane__spur {
  stroke: rgba(var(--v-theme-outline-medium), 0.5);
  stroke-width: 1;
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

/* A crossing. Square rather than round so it never reads as a robot, and filled
   with the floor colour so the lanes visibly pass THROUGH it rather than
   stopping at it. */
.lane__junction {
  fill: rgb(var(--v-theme-map-floor));
  stroke: rgba(var(--v-theme-outline-medium), 0.9);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.lane__tick {
  stroke: rgba(var(--v-theme-outline-medium), 0.9);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

.lane__code {
  fill: rgba(var(--v-theme-on-surface-weak), 0.85);
  font-size: 12px;
  letter-spacing: 0.06em;
  font-variant-numeric: tabular-nums;
  paint-order: stroke;
  stroke: rgb(var(--v-theme-map-floor));
  stroke-width: 3;
  stroke-linejoin: round;
  pointer-events: none;
}

/* A lane that runs across the page carries its letter centred above it; one that
   runs down the page carries it to the right, reading normally. Neither ever
   sits ON its own lane, where a passing robot would cover it. */
.lane__code--h { text-anchor: middle; }
.lane__code--v { text-anchor: start; }

/* ── Marked floor: charging stalls and waiting-bay ranks ─────────────────────
   Dashed because a painted area IS dashed on a real floor, and because it keeps
   an area a unit drives INTO visually distinct from the solid outlines of things
   it must drive around. */
.pad__bound {
  fill: rgba(var(--v-theme-outline-medium), 0.07);
  stroke: rgba(var(--v-theme-outline-medium), 0.7);
  stroke-width: 1;
  stroke-dasharray: 5 4;
  vector-effect: non-scaling-stroke;
}

.pad__stall {
  fill: rgb(var(--v-theme-map-floor));
  stroke: rgba(var(--v-theme-outline-medium), 0.85);
  stroke-width: 1;
  vector-effect: non-scaling-stroke;
}

/* ── Stops ── */
/* A rack face stands on its lane, so it is drawn as a tick across the lane
   rather than as a tile beside it — the drawing says "a unit stopping here
   blocks this aisle", which is what actually happens. */
.stop__face {
  fill: rgba(var(--v-theme-on-surface-weak), 0.8);
  stroke: none;
}

.stop__work,
.stop__dock {
  fill: rgb(var(--v-theme-map-floor));
  stroke: rgba(var(--v-theme-outline-medium), 0.95);
  stroke-width: 1.2;
  vector-effect: non-scaling-stroke;
}

.stop__code {
  fill: rgba(var(--v-theme-on-surface-weak), 0.8);
  font-size: 10px;
  letter-spacing: 0.05em;
  font-variant-numeric: tabular-nums;
  text-anchor: middle;
  paint-order: stroke;
  stroke: rgb(var(--v-theme-map-floor));
  stroke-width: 3;
  stroke-linejoin: round;
  pointer-events: none;
}

/* ── Routes ── */
.route {
  fill: none;
  stroke-linejoin: round;
  stroke-linecap: round;
}

/* Three passes per route: a soft glow, the band, then the dashes. Each is its own
   <path> because SVG strokes don't stack on one element. */
/* ⚠️ THIN. These were 22 and 9 — a route drawn wider than the aisle it runs
   down, which on a schematic reads as a highlighter stroke rather than as a
   path. The glow is kept only as a faint halo that separates the line from the
   racking it crosses; the band is the line. */
.route__glow { stroke-width: 7; opacity: 0.35; }
.route__band { stroke-width: 2.2; }

.route--travelled.route__glow { stroke: rgba(var(--v-theme-secondary-deep), 0.22); }
.route--travelled.route__band { stroke: rgb(var(--v-theme-secondary-deep)); }

/* The travelled leg carries a dotted centre line — a 0-length dash with round
   caps renders as evenly spaced dots, which is how the design marks distance
   already covered. */
.route--travelled.route__pips {
  stroke: rgb(var(--v-theme-secondary));
  stroke-width: 3.2;
  stroke-dasharray: 0.1 9;
}

/* The default when the selected unit has NO task — a drive to a charger or back
   to a bay. Any job overrides both of these inline with its priority's own
   token; see `routeInk` / `routeGlow`. Kept as the neutral base rather than
   removed, because a unit with nothing to do still has a route to draw. */
.route--ahead.route__glow { stroke: rgba(var(--v-theme-primary-bright), 0.2); }
.route--ahead.route__band { stroke: rgb(var(--v-theme-primary-bright)); }

/* Emergencies pulse. This is the ONLY animated route treatment, and it is tied
   to `taskPriorities[…].flashes` rather than to the colour, so a re-themed
   emergency keeps its motion and nothing else acquires it. */
.route--urgent {
  animation: route-urgent 1.1s ease-in-out infinite;
}

@keyframes route-urgent {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

/* ── Emergency pickup and delivery marks ────────────────────────────────────
   Three independent signals per mark — motion, shape and an accessible name —
   so removing any one of them still leaves the meaning readable. Colour is the
   fourth and the least load-bearing. */
.emergency__pulse {
  fill: rgba(var(--v-theme-error), 0.25);
  stroke: none;
  transform-box: fill-box;
  transform-origin: center;
  animation: emergency-pulse 1.4s ease-out infinite;
}

.emergency__ring {
  fill: none;
  stroke: rgb(var(--v-theme-error));
  stroke-width: 2.5;
}

.emergency__mark {
  fill: rgb(var(--v-theme-error));
  stroke: rgb(var(--v-theme-background));
  stroke-width: 2;
}

@keyframes emergency-pulse {
  0% { opacity: 0.75; transform: scale(0.6); }
  100% { opacity: 0; transform: scale(1.25); }
}

/* There is no "secondary route" treatment any more: only the selected unit's
   route is drawn, so there is never a second one to hold back. */

/* ── Fixed equipment and goods ── */
.node__tile {
  fill: rgb(var(--v-theme-background));
  stroke: rgb(var(--v-theme-outline-medium)); /* #5F6877, at full strength */
  stroke-width: 1;
}

.node__rail { fill: rgb(var(--v-theme-secondary)); }

.node__goods { fill: rgb(var(--v-theme-on-surface-weak)); }

/* A marked-out but empty floor position: same footprint, nothing in it. */
.node__slot {
  fill: rgba(var(--v-theme-on-surface-weak), 0.55);
}

.glyph {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  line-height: 1;
}

.glyph--node {
  font-size: 16px;
  color: rgb(var(--v-theme-on-surface)); /* #FFFFFF — was the dimmer on-surface-variant */
}

.glyph--goods {
  font-size: 11px;
  color: rgb(var(--v-theme-background));
}

/* Equipment glyphs are structure, so they take the same weak ink every other
   static mark on the plan does. Only live things get a full-strength colour. */
.glyph--pad,
.glyph--stop {
  font-size: 12px;
  color: rgba(var(--v-theme-on-surface-weak), 0.9);
}

.glyph--pad { font-size: 11px; }

.glyph--vehicle {
  font-size: 17px;
  color: rgb(var(--v-theme-background));
}

/* ── Reference tags ── */
.tag {
  font-size: 13px;
  font-weight: 500;
  pointer-events: none;
}

.tag--node { fill: rgb(var(--v-theme-on-surface-weak)); }
.tag--vehicle { fill: rgb(var(--v-theme-on-surface)); }

/* ── Vehicles ── */
/* Hand-rolled hit target — Vuetify isn't providing the tap behaviour here. */
.vehicle {
  cursor: pointer;
  touch-action: manipulation;
}

/* ⚠️ THE FLEET IS THE ONLY SATURATED THING ON THE PLAN, and that is the entire
   point of the neutral structure above it. A white tile made a robot one more
   bright mark among racking, labels and lane pips; on a near-black floor drawn
   in grey hairlines, a mint tile is unmistakably the machine. It is also the
   colour the 3D fleet is painted (`fleet-body` is the same hue dropped in
   value), so a unit does not change colour when an operator switches views.

   ⚠️ NOT A STATUS. Every state still carries its own ring, its own word in the
   marker's accessible name, and its own row in the roster — the domain rules
   forbid colour carrying meaning alone, and this colour means "robot", not
   "healthy". The parked states below desaturate for legibility, not to encode a
   severity. */
.vehicle__tile { fill: rgb(var(--v-theme-secondary)); }

/* Chassis type rides the DIRECTION arrow rather than the tile, so type and
   status never compete for the same surface — and because the arrow is a shape,
   the three types stay distinguishable without relying on colour. */
.vehicle__heading {
  fill: rgb(var(--v-theme-on-surface-weak));
  transition: fill 0.2s ease;
}

/* Chassis fallback for a unit with no livery of its own. All primary-family,
   matching the 3D fleet: chassis type is carried by the glyph and the silhouette,
   never by hue. A live unit overrides these inline from `accentOf`. */
.vehicle--type-a .vehicle__heading { fill: rgb(var(--v-theme-primary-bright)); }
.vehicle--type-b .vehicle__heading { fill: rgb(var(--v-theme-primary)); }
.vehicle--type-c .vehicle__heading { fill: rgb(var(--v-theme-primary-deep)); }

/* Queued behind another robot — dimmed arrow, so a jam reads as a jam. */
.vehicle--waiting .vehicle__heading { fill: rgb(var(--v-theme-outline-medium)); }

/* Parked and charging units are not going anywhere: no direction to show, and
   leaving a bright arrow on them would read as motion at a glance. */
.vehicle--idle .vehicle__heading,
.vehicle--waitingForNextTask .vehicle__heading,
.vehicle--charging .vehicle__heading { fill: rgba(var(--v-theme-outline-medium), 0.55); }

.vehicle__cargo { fill: rgb(var(--v-theme-warning)); }

/* ── Charge, drawn as a length ── */
.vehicle__charge-track { fill: rgba(var(--v-theme-outline-medium), 0.55); }
.vehicle__charge-fill { fill: rgb(var(--v-theme-tertiary-bright)); }

/* Low charge changes the BAR as well as its colour — the length is already the
   signal, and the colour only reinforces it. */
.vehicle__charge-fill--low { fill: rgb(var(--v-theme-warning)); }

/* A unit on an emergency, glowing under its own tile. The word "Priority task"
   is already in its status and in its accessible name — this only makes it
   findable among sixteen markers at wall-display distance. */
.vehicle__urgent-halo {
  fill: rgba(var(--v-theme-error), 0.28);
  stroke: rgb(var(--v-theme-error));
  stroke-width: 2;
  animation: route-urgent 1.1s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .vehicle__heading { transition: none; }

  /* ⚠️ MOTION IS DROPPED, MEANING IS NOT. Every flashing element here also
     carries a shape, a colour and a description, so holding them at full
     opacity loses the attention-grab and none of the information. Removing the
     marks entirely would lose an emergency's position, which is the one thing
     an operator with vestibular sensitivity needs just as much as anyone. */
  .route--urgent,
  .vehicle__urgent-halo,
  .emergency__pulse {
    animation: none;
  }

  .emergency__pulse { opacity: 0.35; }
}

/* Selecting a vehicle is signalled by the ROUTE, not by the marker: the mission
   legs light up and every other path stays quiet, which is a far bigger change
   than any ring on a 28-unit tile could be. So the marker carries no selected
   state — the ring below exists only for keyboard focus, where nothing else
   would show where you are. */
.vehicle__ring {
  fill: none;
  stroke: rgb(var(--v-theme-primary-bright));
  stroke-width: 2;
  opacity: 0;
}

/* State rides the tile's edge so it never competes with the white body. Only the
   states an operator has to notice are marked; a unit simply driving its route
   needs no ring, and giving every state one would flatten the ones that matter.
   The word is always in the marker's accessible name — the ring never carries
   the meaning on its own. */
.vehicle--charging .vehicle__tile { fill: rgb(var(--v-theme-on-surface-variant)); stroke: rgb(var(--v-theme-tertiary-bright)); stroke-width: 2; }
.vehicle--waiting .vehicle__tile { stroke: rgb(var(--v-theme-warning)); stroke-width: 2; }
.vehicle--error .vehicle__tile { stroke: rgb(var(--v-theme-error)); stroke-width: 2.5; }
.vehicle--delivering .vehicle__tile { stroke: rgb(var(--v-theme-secondary-deep)); stroke-width: 2; }
.vehicle--idle .vehicle__tile { fill: rgb(var(--v-theme-on-surface-variant)); }
/* The dock pair reports its own five states, and two of them are the same thing
   an operator is being told by the two rules above — a unit carrying a load, and
   a unit stopped with nothing to do. They share those marks rather than adding
   new ones: a posting is not a severity, and giving it its own colour would say
   the opposite. The other three dock states are ordinary driving and, like every
   other driving state, carry no ring at all. */
.vehicle--transportingCargo .vehicle__tile { stroke: rgb(var(--v-theme-secondary-deep)); stroke-width: 2; }
.vehicle--waitingForNextTask .vehicle__tile { fill: rgb(var(--v-theme-on-surface-variant)); }

.vehicle:focus-visible { outline: none; }

.vehicle:focus-visible .vehicle__ring {
  opacity: 1;
  stroke: rgb(var(--v-theme-on-surface));
  stroke-width: 2.5;
}

/* ── ASRS stacker cranes ── */

/* The rail the machine is welded to. Dashed and quiet: it is the extent of a
   travel, not a route anything is driven along. */
.crane__rail {
  stroke: rgb(var(--v-theme-info));
  stroke-width: 1.25;
  stroke-dasharray: 5 4;
  opacity: 0.5;
}

.crane__deck {
  fill: rgb(var(--v-theme-background));
  stroke: rgb(var(--v-theme-info));
  stroke-width: 1.25;
  opacity: 0.9;
}

.crane__body {
  fill: rgb(var(--v-theme-background));
  stroke: rgb(var(--v-theme-info));
  stroke-width: 1.5;
}

/* The carriage. Solid against the hollow chassis so its position reads
   instantly, and it moves — motion is what makes a vertical machine legible
   from above. */
.crane__carriage {
  fill: rgb(var(--v-theme-info));
  opacity: 0.9;
}

/* A load in transit, distinct from the machine carrying it. */
.crane__cargo {
  fill: rgb(var(--v-theme-tertiary-bright));
  stroke: rgb(var(--v-theme-background));
  stroke-width: 0.75;
}

/* Working is a ring AROUND the unit — a change in shape, readable at distance
   and independent of the fill. */
.crane__halo {
  fill: none;
  stroke: rgb(var(--v-theme-secondary));
  stroke-width: 2;
  opacity: 0.85;
}

.crane--working .crane__body {
  stroke-width: 2.5;
}

/* ── Alert badge: a shape and a mark, never color on its own ── */
.badge {
  fill: rgb(var(--v-theme-error));
  stroke: rgb(var(--v-theme-background));
  stroke-width: 2;
}

.badge__mark {
  fill: rgb(var(--v-theme-on-surface));
  font-size: 10px;
  font-weight: 700;
  text-anchor: middle;
  pointer-events: none;
}

/* ── Degraded feed ── */
.floor-map--degraded .moving-layer {
  opacity: 0.35;
  filter: grayscale(0.7);
}
</style>
