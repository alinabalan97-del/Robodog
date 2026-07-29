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
   * ONE ROUTE IS HIGHLIGHTED, THE REST ARE QUIET. The selected vehicle's mission
   * arrives split in two — `travelled` and `ahead` — and only those two get the
   * wide glowing band. Every other line on the plan (the aisle network, other
   * units' paths) stays thin. Select a different vehicle and the highlight moves;
   * a mission leg whose vehicle is not selected renders as a secondary path.
   *
   * Colors come from theme tokens via CSS vars, so both themes track automatically.
   */
  import { computed } from 'vue'
  import AppIcon from '@/components/AppIcon.vue'
  import type {
    FeedStatus,
    FloorMap,
    FloorNode,
    FloorRoute,
    FloorVehicle,
    FloorZone,
    NodeKind,
    ShellVertex,
    VehicleForm,
  } from '@/data/floorOps'

  const props = withDefaults(defineProps<{
    map: FloorMap
    feedStatus: FeedStatus
    /** 1 = fit the whole hall; above that zooms toward the centre. */
    zoom?: number
    /** '3d' tilts the same plan into an isometric view — same data, no extra dataset. */
    view?: '2d' | '3d'
    selectedVehicleId?: string | null
  }>(), {
    zoom: 1,
    view: '2d',
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

  function routePath (r: FloorRoute) {
    return trace(r.points, r.corner ?? 18, r.closed)
  }

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

  const lanes = computed(() => props.map.routes.filter(r => r.kind === 'lane'))
  const paths = computed(() => props.map.routes.filter(r => r.kind !== 'lane'))

  /**
   * Which treatment a path gets. A mission leg only keeps the highlight while its
   * own vehicle is the selected one; otherwise it drops to the quiet treatment,
   * so exactly one route is ever loud.
   */
  function routeKind (r: FloorRoute) {
    const highlighted = props.selectedVehicleId === null || r.vehicleId === props.selectedVehicleId
    return r.kind === 'secondary' || !highlighted ? 'secondary' : r.kind
  }

  function routeClasses (r: FloorRoute) {
    const kind = routeKind(r)
    return ['route', `route--${kind}`, r.tone && kind === 'secondary' ? `route--${r.tone}` : '']
  }

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

  const vehicleIcon: Record<VehicleForm, string> = {
    shuttle: 'vehicle',
    quadruped: 'asset',
  }

  /** Every state gets a word — the map never conveys status by color alone. */
  const vehicleStateLabel: Record<FloorVehicle['state'], string> = {
    moving: 'moving',
    loading: 'loading',
    charging: 'charging',
    blocked: 'blocked',
    idle: 'idle',
  }

  function vehicleLabel (v: FloorVehicle) {
    const base = `Vehicle ${v.code}, ${vehicleStateLabel[v.state]}, battery ${v.batteryPct} percent`
    return v.alert ? `${base}. Alert: ${v.alert}` : base
  }
</script>

<template>
  <div class="floor-map" :class="[`floor-map--${view}`, { 'floor-map--degraded': !isLive }]">
    <svg
      class="floor-map__svg"
      :viewBox="viewBox"
      preserveAspectRatio="xMidYMid meet"
      role="group"
      :aria-label="`Floor plan. ${map.vehicles.length} vehicles shown.`"
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
        <path v-for="l in lanes" :key="l.id" class="lane" :d="routePath(l)" />
        <template v-for="l in lanes" :key="`${l.id}-stops`">
          <circle v-for="(s, i) in l.stops ?? []" :key="i" class="lane__pip" :cx="s[0]" :cy="s[1]" r="3.2" />
        </template>
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
        <!-- Routes: quiet ones first so the highlighted mission sits on top. -->
        <template v-for="r in paths" :key="r.id">
          <path :class="[...routeClasses(r), 'route__glow']" :d="routePath(r)" />
          <path :class="[...routeClasses(r), 'route__band']" :d="routePath(r)" />
          <path v-if="routeKind(r) === 'travelled'" :class="[...routeClasses(r), 'route__pips']" :d="routePath(r)" />
          <circle
            v-for="(s, i) in (routeKind(r) === 'ahead' ? r.stops ?? [] : [])"
            :key="i"
            class="route__waypoint"
            :cx="s[0]" :cy="s[1]" r="3.6"
          />
        </template>

        <!-- Equipment alerts. Split from their tile above so the badge — which IS
             live state — dims with the feed while the plan stays legible. -->
        <g v-for="n in alertedNodes" :key="`${n.id}-alert`" class="badge-group">
          <circle class="badge" :cx="n.x + 12" :cy="n.y - 12" r="6.5" />
          <text class="badge__mark" :x="n.x + 12" :y="n.y - 8.5">!</text>
        </g>

        <!-- Vehicles. Focusable so the plan is reachable without a pointer. -->
        <g
          v-for="v in map.vehicles"
          :key="v.id"
          :class="['vehicle', `vehicle--${v.state}`, { 'vehicle--selected': v.id === selectedVehicleId }]"
          tabindex="0"
          role="button"
          :aria-label="vehicleLabel(v)"
          :aria-pressed="v.id === selectedVehicleId"
          @click="emit('selectVehicle', v.id)"
          @keydown.enter.prevent="emit('selectVehicle', v.id)"
          @keydown.space.prevent="emit('selectVehicle', v.id)"
        >
          <title>{{ vehicleLabel(v) }}</title>
          <rect class="vehicle__ring" :x="v.x - 18" :y="v.y - 18" width="36" height="36" rx="11" />
          <rect class="vehicle__tile" :x="v.x - 14" :y="v.y - 14" width="28" height="28" rx="8" />
          <foreignObject :x="v.x - 8.5" :y="v.y - 8.5" width="17" height="17">
            <div class="glyph glyph--vehicle" xmlns="http://www.w3.org/1999/xhtml">
              <AppIcon :name="vehicleIcon[v.form]" />
            </div>
          </foreignObject>
          <text class="tag tag--vehicle" :x="v.x + 15" :y="v.y - 19">{{ v.tag }}</text>
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

/* The isometric view is the same plan on a tilt — no second dataset, no fake depth. */
.floor-map--3d .floor-map__svg {
  transform: perspective(1600px) rotateX(52deg) rotateZ(-28deg) scale(0.72);
}

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

.lane__pip {
  fill: rgb(var(--v-theme-secondary));
  opacity: 0.9;
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

.route--ahead.route__glow { stroke: rgba(var(--v-theme-primary-bright), 0.2); }
.route--ahead.route__band { stroke: rgb(var(--v-theme-primary-bright)); }

.route__waypoint {
  fill: rgb(var(--v-theme-on-surface));
  opacity: 0.9;
}

/* Quiet by default; the tone modifiers only keep two crossing paths tellable
   apart, they don't promote either one. */
.route--secondary.route__glow { stroke: rgba(var(--v-theme-outline-medium), 0.18); }
.route--secondary.route__band {
  stroke: rgba(var(--v-theme-outline-medium), 0.9);
  stroke-width: 8;
}

.route--rose.route__glow { stroke: rgba(var(--v-theme-error), 0.2); }
.route--rose.route__band { stroke: rgba(var(--v-theme-error), 0.85); }
.route--amber.route__glow { stroke: rgba(var(--v-theme-warning), 0.18); }
.route--amber.route__band { stroke: rgba(var(--v-theme-warning), 0.75); }

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

/* State rides the tile's edge so it never competes with the white body. */
.vehicle--charging .vehicle__tile { stroke: rgb(var(--v-theme-info)); stroke-width: 2; }
.vehicle--loading .vehicle__tile { stroke: rgb(var(--v-theme-secondary)); stroke-width: 2; }
.vehicle--blocked .vehicle__tile { stroke: rgb(var(--v-theme-error)); stroke-width: 2; }

.vehicle:focus-visible { outline: none; }

.vehicle:focus-visible .vehicle__ring {
  opacity: 1;
  stroke: rgb(var(--v-theme-on-surface));
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
