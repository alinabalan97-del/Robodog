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
   *   2. zones — racking, cells, docks, staging          static
   *   3. the aisle network       static — permanent infrastructure, not telemetry
   *   4. the moving layer        LIVE — routes, vehicles, equipment alert badges
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
    FloorZone,
    NodeKind,
    ShellVertex,
  } from '@/data/floorOps'
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

  // ── Zones ───────────────────────────────────────────────────────────────────

  /**
   * A rack drawn as its pallet beams. Density reads as capacity, so the count
   * comes from the data rather than from a fixed spacing — and the axis decides
   * whether they are beams (production aisles) or uprights (the high-bay block).
   */
  function rackBays (z: FloorZone) {
    const n = z.bays ?? 8
    const along = z.axis === 'column' ? z.w : z.h
    const step = along / n
    const inset = z.axis === 'column' ? 3 : 0
    return Array.from({ length: n }, (_, i) => {
      const at = step * (i + 0.5)
      return z.axis === 'column'
        ? { x1: z.x + at, y1: z.y + inset, x2: z.x + at, y2: z.y + z.h - inset }
        : { x1: z.x, y1: z.y + at, x2: z.x + z.w, y2: z.y + at }
    })
  }

  const solidZones = computed(() => props.map.zones.filter(z => z.kind !== 'rack'))
  const racks = computed(() => props.map.zones.filter(z => z.kind === 'rack'))

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
  const lanes = computed(() =>
    corridors.map(corridor => ({
      id: corridor.id,
      d: corridor.axis === 'h'
        ? `M ${corridor.from} ${corridor.at} L ${corridor.to} ${corridor.at}`
        : `M ${corridor.at} ${corridor.from} L ${corridor.at} ${corridor.to}`,
    })),
  )

  /**
   * Where a robot can stop. Rack faces are left off — thirty more pips would
   * bury the aisles they sit on, and the racking behind them already says where
   * the picking happens.
   */
  const stops = computed(() =>
    stations
      .filter(station => station.kind !== 'rack')
      .map(station => ({ id: station.id, kind: station.kind, x: station.x, y: station.y })),
  )

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

  /** The reference an operator calls the unit by: AMR-07 → "07". */
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
      preserveAspectRatio="xMidYMid meet"
      role="group"
      :aria-label="`Floor plan. ${vehicles.length} robots shown.`"
    >
      <!-- 1 · Hall shell -->
      <path class="hall" :d="shellPath" />

      <!-- 2 · Racking, work cells, docks and staging -->
      <rect
        v-for="z in solidZones"
        :key="z.id"
        :class="['zone', `zone--${z.kind}`]"
        :x="z.x" :y="z.y" :width="z.w" :height="z.h"
        rx="3"
      />
      <g v-for="z in racks" :key="z.id" :class="['rack', `rack--${z.axis ?? 'row'}`]">
        <line
          v-for="(bay, i) in rackBays(z)"
          :key="`${z.id}-${i}`"
          v-bind="bay"
        />
      </g>

      <!-- 3 · The aisle network. Permanent infrastructure — never highlighted,
           and never dimmed, because it is not telemetry. -->
      <g class="lanes">
        <path v-for="l in lanes" :key="l.id" class="lane" :d="l.d" />
        <circle
          v-for="s in stops"
          :key="s.id"
          :class="['lane__pip', `lane__pip--${s.kind}`]"
          :cx="s.x" :cy="s.y"
          :r="s.kind === 'hold' ? 3 : 4"
        />
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
.floor-map {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
}

.floor-map__svg {
  width: 100%;
  height: 100%;
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
.hall {
  fill: rgba(var(--v-theme-background), 0.62);
  stroke: rgb(var(--v-theme-outline-variant));
  stroke-width: 1.5;
}

/* ── Zones ── */
/* Racking is drawn ONLY as its bays — no fill, no outline. The beams are the
   information; a box around them would just add a second edge to read. */
.rack line {
  stroke: rgb(var(--v-theme-secondary));
  stroke-linecap: round;
}

.rack--row line {
  stroke-width: 2.6;
  opacity: 0.78;
}

.rack--column line {
  stroke-width: 5.5;
  opacity: 0.92;
}

.zone--cell { fill: rgba(var(--v-theme-primary-deep), 0.45); }
.zone--dock { fill: rgba(var(--v-theme-warning), 0.42); }
.zone--buffer { fill: rgba(var(--v-theme-warning), 0.85); }

/* An empty staging sliver is outlined rather than filled — "marked out but not
   occupied" has to be distinguishable from "occupied" without reading a label. */
.zone--reserve {
  fill: none;
  stroke: rgba(var(--v-theme-info), 0.55);
  stroke-width: 1.5;
}

/* ── The aisle network ── */
.lane {
  fill: none;
  stroke: rgba(var(--v-theme-outline-medium), 0.75);
  stroke-width: 1.2;
  stroke-linejoin: round;
  stroke-linecap: round;
}

/* Where a robot can stop, by what it stops for. Each is a different fill AND a
   different size, so the three kinds stay tellable apart in bad light. */
.lane__pip {
  fill: rgb(var(--v-theme-secondary));
  opacity: 0.9;
}

.lane__pip--dock { fill: rgb(var(--v-theme-warning)); }
.lane__pip--charger { fill: rgb(var(--v-theme-tertiary-bright)); }

/* Workstations are hollow squares rather than discs — the AGVs' whole round trip
   runs between four of these, so they have to be findable at a glance and
   tellable from a dock without reading the colour. */
.lane__pip--work {
  fill: rgb(var(--v-theme-background));
  stroke: rgb(var(--v-theme-primary-bright));
  stroke-width: 2;
}

.lane__pip--hold {
  fill: none;
  stroke: rgba(var(--v-theme-outline-medium), 0.9);
  stroke-width: 1.4;
}

/* ── Routes ── */
.route {
  fill: none;
  stroke-linejoin: round;
  stroke-linecap: round;
}

/* Three passes per route: a soft glow, the band, then the dashes. Each is its own
   <path> because SVG strokes don't stack on one element. */
.route__glow { stroke-width: 22; }
.route__band { stroke-width: 9; }

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

.vehicle__tile { fill: rgb(var(--v-theme-on-surface)); }

/* Chassis type rides the DIRECTION arrow rather than the tile, so type and
   status never compete for the same surface — and because the arrow is a shape,
   the three types stay distinguishable without relying on colour. */
.vehicle__heading {
  fill: rgb(var(--v-theme-on-surface-weak));
  transition: fill 0.2s ease;
}

.vehicle--type-a .vehicle__heading { fill: rgb(var(--v-theme-primary-bright)); }
.vehicle--type-b .vehicle__heading { fill: rgb(var(--v-theme-secondary)); }
.vehicle--type-c .vehicle__heading { fill: rgb(var(--v-theme-primary-accent)); }

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
.vehicle--charging .vehicle__tile { stroke: rgb(var(--v-theme-tertiary-bright)); stroke-width: 2; }
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
