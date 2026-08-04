<script setup lang="ts">
  /**
   * FleetPanel.vue — the robot roster.
   *
   * A pure view over the simulation layer. It owns no state, runs no clock and
   * decides nothing about robot behaviour: it is handed a frame and renders it,
   * exactly like the two map views beside it. Selecting a unit is an event, not
   * local state, so the map and this list can never disagree about which robot
   * is in focus.
   *
   * EVERY UNIT SHOWS ITS WHOLE STORY: id, chassis type, current task, current
   * destination, battery, speed and status. Sixteen of those will not fit on a
   * map at wall-display distance — the map carries position, heading, load and
   * charge, and this rail carries the words that go with them.
   *
   * BINDING RULES FROM CLAUDE.md THAT SHAPE THIS FILE:
   *   • Status is never colour alone. Every row carries an icon AND the state in
   *     words; the colour only reinforces them.
   *   • Figures carry their units. Percent, m/s and kg are labelled, and nothing
   *     is silently rounded to look tidier than it is.
   *   • Measured and derived are kept apart. Battery, speed and status are
   *     readings; the ETA is a calculation over the remaining route and is
   *     marked as an estimate wherever it appears.
   *   • The feed says what it is. This data comes from a simulation, and the
   *     header says so — permanently, not as a dismissible notice.
   */
  import { computed } from 'vue'
  import AppIcon from '@/components/AppIcon.vue'
  import {
    ROBOT_STATE_ICON,
    ROBOT_STATE_LABEL,
    ROBOT_STATE_TONE,
    taskPriorities,
  } from '@/stores/fleet'
  import type { FleetRobot, RobotState, SimRate } from '@/stores/fleet'
  import { robotTypes } from '@/data/fleet'
  import type { RobotTypeId } from '@/data/fleet'

  const props = defineProps<{
    robots: FleetRobot[]
    selectedId: string | null
    paused: boolean
    rate: SimRate
    tasksCompleted: number
    tasksQueued: number
    /** Present when the compiled road network is unsound — shown, never hidden. */
    networkFault: string | null
  }>()

  const emit = defineEmits<{
    select: [id: string]
    togglePause: []
    cycleRate: []
    close: []
  }>()

  /**
   * One glyph per state, so status never rests on colour.
   *
   * ⚠️ READ FROM THE STORE, not redeclared here. This used to be a local literal
   * and it went stale twice — once when the charging states landed and once when
   * the priority states did — each time leaving rows with an undefined icon while
   * the type checker was satisfied by a `Record` that had simply been widened
   * somewhere else.
   */
  const STATE_ICON = ROBOT_STATE_ICON

  /** Rolled-up head-count. Only the states worth acting on get a chip. */
  const summary = computed(() => {
    const count = (...states: RobotState[]) =>
      props.robots.filter(r => states.includes(r.state)).length
    return [
      // The dock pair's states are counted here alongside the general ones: a
      // head-count of "working" that quietly excluded two of sixteen units
      // would under-report the floor by an eighth, and the posting is not a
      // different kind of work — see `ROBOT_STATE_LABEL` in the fleet store.
      { id: 'working', icon: 'vehicle', label: 'working', value: count('toPickup', 'carrying', 'delivering', 'assigned', 'goingToLoadingDock', 'loadingAtDock', 'transportingCargo', 'returningToDock'), tone: undefined },
      // Urgent work gets its own chip: on a sixteen-unit floor "how many units are
      // on the emergency" is the question the roster is opened to answer.
      { id: 'priority', icon: 'alertFilled', label: 'on priority work', value: count('executingPriorityTask', 'waitingForPriorityTask'), tone: 'error' },
      { id: 'charging', icon: 'charger', label: 'charging', value: count('charging', 'docking', 'goingToCharge', 'waitingForCharge'), tone: undefined },
      { id: 'waiting', icon: 'clock', label: 'waiting', value: count('waiting'), tone: 'warning' },
      { id: 'error', icon: 'alert', label: 'faulted', value: count('error', 'emergencyLowBattery'), tone: 'error' },
    ]
  })

  const typeName = (id: RobotTypeId) => robotTypes[id].name
  const shortCode = (robot: FleetRobot) => robot.code.split('-')[1] ?? robot.code

  /** Charge bar colour. Always paired with the printed figure beside it. */
  function chargeTone (pct: number) {
    if (pct < 15) return 'error'
    if (pct < 30) return 'warning'
    return 'tertiary-bright'
  }

  /** The destination line, or an honest dash when a unit has nowhere to be. */
  const destinationOf = (robot: FleetRobot) =>
    robot.destinationLabel
    || (robot.state === 'idle' || robot.state === 'waitingForNextTask' ? 'Standing by' : '—')

  /** The urgency of the job a unit is on, or null when it has none. */
  const priorityOf = (robot: FleetRobot) =>
    (robot.taskPriority ? taskPriorities[robot.taskPriority] : null)

  /**
   * What happened to the job this unit was pulled off.
   *
   * ⚠️ SAID IN FULL, NOT IMPLIED. A robot that dropped a pallet run to take an
   * emergency and never mentioned it looks like a robot that lost its task; the
   * only honest surface is one that names the job AND says where it now stands.
   */
  const PREVIOUS_TASK_NOTE: Record<
    NonNullable<FleetRobot['previousTaskState']>, string
  > = {
    requeued: 'returned to the queue',
    resuming: 'resuming now',
    'taken-by-another': 'picked up by another unit',
  }

  const previousNote = (robot: FleetRobot) =>
    (robot.previousTaskState ? PREVIOUS_TASK_NOTE[robot.previousTaskState] : '')

  /** Minutes, as an estimate — never printed as a measurement. See `etaSeconds`. */
  const etaMinutes = (seconds: number) => Math.max(1, Math.round(seconds / 60))

  /** Everything in the row, said once for assistive tech. */
  function rowLabel (robot: FleetRobot) {
    const priority = priorityOf(robot)
    return [
      robot.code,
      `Type ${robot.typeId}, ${typeName(robot.typeId)}`,
      ROBOT_STATE_LABEL[robot.state],
      robot.taskLabel,
      priority ? `${priority.label} priority` : '',
      `destination ${destinationOf(robot)}`,
      robot.distanceRemainingM === null ? '' : `${robot.distanceRemainingM} metres remaining`,
      robot.etaSeconds === null ? '' : `estimated ${etaMinutes(robot.etaSeconds)} minutes`,
      `battery ${Math.round(robot.batteryPct)} percent`,
      `speed ${robot.speedMps.toFixed(1)} metres per second`,
      robot.previousTaskLabel ? `previous task ${robot.previousTaskLabel}, ${previousNote(robot)}` : '',
      robot.alert ? `alert: ${robot.alert}` : '',
    ].filter(Boolean).join('. ')
  }
</script>

<template>
  <aside class="fleet-panel d-flex flex-column" aria-label="Robot fleet">
    <!-- ── Header ────────────────────────────────────────────────────────── -->
    <header class="fleet-panel__head pa-4 d-flex flex-column ga-3">
      <div class="d-flex align-center ga-2">
        <h2 class="text-title-medium my-0 flex-grow-1">Robot fleet</h2>
        <span class="text-body-small text-medium-emphasis tabular">{{ robots.length }} units</span>
        <v-btn
          class="fleet-panel__close"
          icon
          size="28"
          variant="text"
          aria-label="Hide the fleet panel"
          @click="emit('close')"
        >
          <v-icon icon="close" size="16" />
        </v-btn>
      </div>

      <!--
        The feed says what it is, permanently. This is a MODEL, not a reading off
        a floor, and an operations surface that leaves that ambiguous is the
        failure CLAUDE.md's first domain rule exists to prevent. Pausing is
        surfaced in the same chip, because a stopped clock showing old positions
        is the same hazard wearing a different hat.
      -->
      <div class="d-flex align-center ga-2 flex-wrap">
        <v-chip
          class="fleet-panel__source"
          size="small"
          variant="outlined"
          :color="paused ? 'warning' : undefined"
          :aria-label="paused
            ? 'Simulated data. The simulation is paused — positions are not advancing.'
            : 'Simulated data. Not a live feed.'"
        >
          <template #prepend>
            <AppIcon :name="paused ? 'alert' : 'activity'" class="me-1" />
          </template>
          {{ paused ? 'Simulation paused' : 'Simulated data' }}
        </v-chip>

        <v-spacer />

        <v-btn
          class="text-none"
          size="small"
          variant="tonal"
          :aria-label="paused ? 'Resume the simulation' : 'Pause the simulation'"
          @click="emit('togglePause')"
        >
          <template #prepend>
            <v-icon :icon="paused ? 'play' : 'pause'" size="16" />
          </template>
          {{ paused ? 'Resume' : 'Pause' }}
        </v-btn>

        <v-btn
          class="text-none tabular"
          size="small"
          variant="tonal"
          :aria-label="`Simulation speed ${rate} times real time. Activate to change.`"
          @click="emit('cycleRate')"
        >
          {{ rate }}×
        </v-btn>
      </div>

      <!-- Head-count. Each carries an icon and a word, never a bare number. -->
      <div class="d-flex align-center ga-2 flex-wrap">
        <v-chip
          v-for="item in summary"
          :key="item.id"
          class="tabular"
          size="small"
          variant="outlined"
          :color="item.value > 0 ? item.tone : undefined"
          :aria-label="`${item.value} ${item.label}`"
        >
          <template #prepend>
            <AppIcon :name="item.icon" class="me-1" />
          </template>
          {{ item.value }} {{ item.label }}
        </v-chip>
      </div>

      <div class="d-flex align-center ga-2 text-body-small text-medium-emphasis tabular">
        <!-- "Loads", not "pallets": the flow moves pallets, containers AND carts,
             and this counts all three. It also used to include ASRS crane cycles,
             which moved nothing at all — see `FleetTelemetry.tasksCompleted`. -->
        <span>{{ tasksCompleted }} loads delivered</span>
        <span aria-hidden="true">·</span>
        <span>{{ tasksQueued }} queued</span>
      </div>

      <!-- A broken road network is a data fault an operator cannot diagnose and
           must not be left to infer from robots that never leave their bay. -->
      <v-alert
        v-if="networkFault"
        density="compact"
        type="warning"
        variant="tonal"
        :text="networkFault"
      />
    </header>

    <v-divider />

    <!-- ── The roster ────────────────────────────────────────────────────── -->
    <!-- v-list-item owns hover, focus, keyboard activation and the active
         state, so none of that is re-implemented here. -->
    <v-list class="fleet-panel__list flex-grow-1" density="compact" nav>
      <v-list-item
        v-for="robot in robots"
        :key="robot.id"
        class="fleet-row"
        :active="robot.id === selectedId"
        :aria-label="rowLabel(robot)"
        @click="emit('select', robot.id)"
      >
        <div class="d-flex align-center ga-2">
          <!-- Chassis type, as a letter — the same A/B/C the map's glyph and the
               3D model registry key off. -->
          <span
            class="fleet-row__type"
            :class="`fleet-row__type--${robot.typeId.toLowerCase()}`"
            :title="`Type ${robot.typeId} — ${typeName(robot.typeId)}`"
          >{{ robot.typeId }}</span>

          <span class="text-body-medium font-weight-medium tabular">{{ robot.code }}</span>

          <v-spacer />

          <span class="text-body-small tabular text-medium-emphasis">
            {{ robot.speedMps.toFixed(1) }} m/s
          </span>
        </div>

        <!-- Status: icon + word + colour, in that order of importance. -->
        <div class="d-flex align-center ga-1 mt-1">
          <AppIcon
            :name="STATE_ICON[robot.state]"
            class="fleet-row__state-icon"
            :style="{ color: `rgb(var(--v-theme-${ROBOT_STATE_TONE[robot.state]}))` }"
          />
          <span
            class="text-body-small font-weight-medium"
            :style="{ color: `rgb(var(--v-theme-${ROBOT_STATE_TONE[robot.state]}))` }"
          >{{ ROBOT_STATE_LABEL[robot.state] }}</span>
          <span class="text-body-small text-medium-emphasis">· {{ robot.activity }}</span>
        </div>

        <!-- Task, its urgency, and where it is going. -->
        <div class="fleet-row__task d-flex align-center ga-2 text-body-small mt-1">
          <!-- Priority: icon + word + colour, in that order of importance. The
               chip is omitted entirely when there is no task, rather than
               showing a neutral one — an empty chip reads as a level. -->
          <span
            v-if="priorityOf(robot)"
            class="fleet-row__prio flex-shrink-0"
            :style="{ color: `rgb(var(--v-theme-${priorityOf(robot)!.tone}))` }"
          >
            <AppIcon :name="priorityOf(robot)!.icon" class="fleet-row__prio-icon" />
            {{ priorityOf(robot)!.label }}
          </span>
          <span class="text-truncate">{{ robot.taskLabel }}</span>
        </div>

        <div class="fleet-row__dest d-flex align-center ga-1 text-body-small">
          <AppIcon name="location" class="fleet-row__dest-icon" />
          <span class="text-truncate">{{ destinationOf(robot) }}</span>
          <!-- Both DERIVED, and labelled as such: a distance over the remaining
               route and an estimate over that distance, never measurements. -->
          <span v-if="robot.distanceRemainingM !== null" class="text-medium-emphasis tabular flex-shrink-0">
            · {{ robot.distanceRemainingM }} m left
          </span>
          <span v-if="robot.etaSeconds !== null" class="text-medium-emphasis tabular flex-shrink-0">
            · est. {{ etaMinutes(robot.etaSeconds) }} min
          </span>
        </div>

        <!-- The job this unit was stood down from. Shown only while there is
             one, and always with what became of it. -->
        <div
          v-if="robot.previousTaskLabel"
          class="fleet-row__previous d-flex align-center ga-1 text-body-small"
        >
          <AppIcon name="history" class="fleet-row__dest-icon" />
          <span class="text-truncate">Was on {{ robot.previousTaskLabel }}</span>
          <span class="text-medium-emphasis flex-shrink-0">· {{ previousNote(robot) }}</span>
        </div>

        <!-- Battery: the bar and the figure together. The bar is the glance, the
             number is the decision input, and the unit is on the number. -->
        <div class="d-flex align-center ga-2 mt-2">
          <v-progress-linear
            class="fleet-row__charge"
            :model-value="robot.batteryPct"
            :color="chargeTone(robot.batteryPct)"
            height="4"
            rounded
            :aria-label="`Battery ${Math.round(robot.batteryPct)} percent`"
          />
          <span class="text-body-small tabular flex-shrink-0">{{ Math.round(robot.batteryPct) }}%</span>
          <span v-if="robot.carrying" class="fleet-row__load text-body-small tabular flex-shrink-0">
            {{ robot.payloadKg }} kg
          </span>
        </div>

        <!-- The alert text IS the reason; it is never reduced to a coloured dot. -->
        <div v-if="robot.alert" class="fleet-row__alert d-flex align-center ga-1 mt-2 text-body-small">
          <AppIcon name="alertFilled" class="fleet-row__dest-icon" />
          <span>{{ robot.alert }}</span>
        </div>
      </v-list-item>
    </v-list>
  </aside>
</template>

<style scoped>
.fleet-panel {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--neutral-bg-hover);
  border-radius: var(--radius-md);
  background-color: rgb(var(--v-theme-background));
}

.fleet-panel__head {
  flex: 0 0 auto;
}

/* The list is the scroll container, not the panel — the header stays put while
   sixteen units scroll under it. */
.fleet-panel__list {
  min-height: 0;
  overflow-y: auto;
  background: transparent;
}

.fleet-panel__close.v-btn {
  min-width: 28px;
}

/* Counts and figures sit in columns down the rail — align the digits. */
.tabular {
  font-variant-numeric: tabular-nums;
}

.fleet-panel__source.v-chip {
  border-color: rgb(var(--v-theme-outline-medium));
}

/* ── A roster row ───────────────────────────────────────────────────────── */

.fleet-row {
  align-items: stretch;
}

/* Chassis type as a letter tile. A shape and a letter, so the three types stay
   distinguishable without relying on the colour. */
.fleet-row__type {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  color: rgb(var(--v-theme-background));
}

.fleet-row__type--a { background-color: rgb(var(--v-theme-primary-bright)); }
.fleet-row__type--b { background-color: rgb(var(--v-theme-secondary)); }
.fleet-row__type--c { background-color: rgb(var(--v-theme-primary-accent)); }

.fleet-row__state-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.fleet-row__task {
  color: rgb(var(--v-theme-on-surface));
  min-width: 0;
}

/* Priority: a glyph and a word, tinted. Not a filled chip — sixteen filled
   chips down a 350px rail would out-shout the status line above them, and the
   thing an operator scans for first is the state, not the queue order. */
.fleet-row__prio {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-weight: 600;
  white-space: nowrap;
}

.fleet-row__prio-icon {
  font-size: 13px;
}

.fleet-row__previous {
  color: rgb(var(--v-theme-warning));
  min-width: 0;
}

.fleet-row__dest {
  color: rgb(var(--v-theme-on-surface-weak));
  min-width: 0;
}

.fleet-row__dest-icon {
  font-size: 13px;
  flex-shrink: 0;
}

.fleet-row__charge {
  min-width: 0;
}

.fleet-row__load {
  color: rgb(var(--v-theme-warning));
}

.fleet-row__alert {
  color: rgb(var(--v-theme-error));
}

/* Selected is styled once on the class Vuetify stamps, never per item. */
.fleet-panel__list :deep(.v-list-item--active) {
  background-color: rgba(var(--v-theme-primary), 0.14);
}

.fleet-panel__list :deep(.v-list-item--active .v-list-item__overlay) {
  opacity: 0;
}
</style>
