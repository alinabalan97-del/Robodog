<script setup lang="ts">
  /**
   * TaskPanel.vue — the task-management rail.
   *
   * A pure view over the simulation layer, exactly like `FleetPanel.vue` beside
   * it: it is handed a frame and renders it, owns no state, and decides nothing
   * about dispatch. The ONE thing it can initiate is an emergency delivery, and
   * that is a physical-world command — see the confirmation note below.
   *
   * THREE SECTIONS, in the order an operator asks the questions:
   *
   *   1. HOW IS THE FLOOR DOING   the priority metrics, all derived
   *   2. WHAT IS QUEUED           every live job, in the scheduler's own order
   *   3. WHAT JUST HAPPENED       the notification feed
   *
   * ⚠️ ROWS, NOT A TABLE. The eight fields the panel has to show — id, priority,
   * status, robot, pickup, delivery, waiting time, ETA — are eight columns, and
   * this rail is 350px. A table would either scroll sideways (unusable with
   * gloves on) or truncate every cell to three characters. Each job is therefore
   * a card carrying all eight in four lines, which is the same idiom the roster
   * uses for robots.
   *
   * BINDING RULES FROM CLAUDE.md THAT SHAPE THIS FILE:
   *   • Priority is never colour alone. Every level carries its icon AND its
   *     word; the colour only reinforces them.
   *   • Measured and derived are kept apart. Waiting time is a measurement; the
   *     ETA, the averages, the completion rate and utilisation are calculations
   *     over the run so far, and each says so.
   *   • Nothing is invented. A queued job has no pickup, no delivery and no ETA
   *     because the scheduler has not chosen them yet — those cells say that
   *     rather than showing a plausible bay.
   *   • Raising an emergency moves real machinery, so it confirms first and the
   *     confirmation names what it will create.
   */
  import { computed, ref } from 'vue'
  import AppIcon from '@/components/AppIcon.vue'
  import {
    EVENT_ICON,
    EVENT_TONE,
    TASK_STATUS_ICON,
    TASK_STATUS_LABEL,
    TASK_STATUS_TONE,
    taskPriorities,
    taskPriorityOrder,
  } from '@/stores/fleet'
  import type { FleetEvent, FleetMetrics, FleetTask, TaskPriority } from '@/stores/fleet'
  import { duties } from '@/data/fleet'
  import type { TaskKind } from '@/data/fleet'

  const props = defineProps<{
    /** Every live job, IN THE SCHEDULER'S ORDER. Never re-sorted here. */
    tasks: FleetTask[]
    queuedByPriority: Record<TaskPriority, number>
    events: FleetEvent[]
    metrics: FleetMetrics
    /** The unit in focus, so its job can be marked in the list. */
    selectedRobotId: string | null
    /** Live figures are dimmed when the feed is not current. */
    stale: boolean
  }>()

  const emit = defineEmits<{
    /** Focus the robot running this job — the list and the map share one selection. */
    selectRobot: [id: string]
    /** Raise an urgent delivery of this stage. Confirmed before it is emitted. */
    raiseEmergency: [kind: TaskKind]
    close: []
  }>()

  // ── Filtering ───────────────────────────────────────────────────────────────
  //
  // A filter, not a sort. The order is the model's and stays the model's; all an
  // operator can do here is narrow what is shown.

  const filter = ref<TaskPriority | 'all'>('all')

  const visible = computed(() =>
    (filter.value === 'all' ? props.tasks : props.tasks.filter(t => t.priority === filter.value)),
  )

  /**
   * The feed, newest first.
   *
   * A computed rather than `[...events].reverse()` in the `v-for`. That
   * expression allocated two arrays every time the panel re-rendered — which is
   * every frame, because the store republishes the feed on each tick — and it
   * re-ran for each of the other bindings' re-renders too. Reversing is a view
   * decision, so it stays here; the array the store publishes is left alone.
   */
  const newestFirst = computed(() => [...props.events].reverse())

  const filterOptions = computed(() => [
    { id: 'all' as const, label: 'All', count: props.tasks.length, tone: undefined },
    ...taskPriorityOrder.map(id => ({
      id,
      label: taskPriorities[id].label,
      count: props.queuedByPriority[id],
      tone: taskPriorities[id].tone,
    })),
  ])

  // ── Formatting ──────────────────────────────────────────────────────────────

  /** Whole seconds under a minute, then minutes. Units are always printed. */
  function duration (seconds: number | null): string {
    if (seconds === null) return '—'
    if (seconds < 60) return `${Math.round(seconds)} s`
    const minutes = Math.floor(seconds / 60)
    const rest = Math.round(seconds % 60)
    return rest ? `${minutes} min ${rest} s` : `${minutes} min`
  }

  const percent = (fraction: number | null) =>
    (fraction === null ? '—' : `${Math.round(fraction * 100)}%`)

  /**
   * The metric tiles.
   *
   * ⚠️ EVERY ONE OF THESE IS DERIVED OVER THE RUN SO FAR, and the section header
   * says so once rather than each tile repeating it. `hint` is the definition,
   * not decoration: "average delivery time" is meaningless without knowing it is
   * measured from job creation rather than from pickup.
   */
  const tiles = computed(() => [
    {
      id: 'total',
      label: 'Total tasks',
      value: String(props.metrics.totalTasks),
      hint: 'Created since the run started, every priority',
    },
    {
      id: 'emergency',
      label: 'Emergencies done',
      value: String(props.metrics.emergencyTasksCompleted),
      hint: 'Emergency deliveries completed',
      tone: 'error',
    },
    {
      id: 'delivery',
      label: 'Avg delivery',
      value: duration(props.metrics.averageDeliverySeconds),
      hint: 'Mean time from a job being created to being delivered',
    },
    {
      id: 'response',
      label: 'Avg emergency response',
      value: duration(props.metrics.averageEmergencyResponseSeconds),
      hint: 'Mean time from an emergency being raised to a unit committing to it',
      tone: 'error',
    },
    {
      id: 'high',
      label: 'High-priority completion',
      value: percent(props.metrics.highPriorityCompletionRate),
      hint: 'High-priority jobs completed as a share of those created',
      tone: 'warning',
    },
    {
      id: 'utilisation',
      label: 'Robot utilisation',
      value: percent(props.metrics.robotUtilisation),
      hint: 'Share of unit-time spent holding a task — driving to charge does not count',
    },
    {
      id: 'queue',
      label: 'Avg queue time',
      value: duration(props.metrics.averageQueueSeconds),
      hint: 'Mean time a job waited on the backlog before a unit took it',
    },
    {
      id: 'interrupted',
      label: 'Interrupted / resumed',
      value: `${props.metrics.tasksInterrupted} / ${props.metrics.tasksResumed}`,
      hint: 'Jobs stood down for an emergency, and how many the same unit went back for',
      tone: 'warning',
    },
  ])

  // ── Raising an emergency ────────────────────────────────────────────────────
  //
  // ⚠️ A PHYSICAL-WORLD COMMAND (CLAUDE.md → Domain rules). It puts a job at the
  // head of the queue and may pull a robot off the work it is doing, so it
  // confirms first and the confirmation NAMES what it will create and what it is
  // allowed to interrupt. Never a bare "Are you sure?".

  const confirming = ref<TaskKind | null>(null)

  /** The three stages a mobile unit serves. `store` is the ASRS's and takes no robot. */
  const EMERGENCY_KINDS: TaskKind[] = ['pallet', 'container', 'cart']

  const chassisFor = (kind: TaskKind) => duties[kind].cargoNoun

  function confirmEmergency () {
    if (!confirming.value) return
    emit('raiseEmergency', confirming.value)
    confirming.value = null
  }

  // ── Accessible names ────────────────────────────────────────────────────────

  function taskLabel (task: FleetTask) {
    return [
      task.label,
      `${taskPriorities[task.priority].label} priority`,
      TASK_STATUS_LABEL[task.status],
      task.assignedRobotCode ? `assigned to ${task.assignedRobotCode}` : 'not yet assigned',
      task.pickupLabel ? `pickup ${task.pickupLabel}` : 'pickup chosen at dispatch',
      task.deliveryLabel ? `delivery ${task.deliveryLabel}` : 'delivery chosen at dispatch',
      `waiting ${duration(task.waitingSeconds)}`,
      task.etaSeconds === null
        ? 'no estimate until it is assigned'
        : `estimated ${duration(task.etaSeconds)} remaining`,
    ].join('. ')
  }

  const eventTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
</script>

<template>
  <aside class="task-panel d-flex flex-column" aria-label="Task management">
    <!-- ── Header ────────────────────────────────────────────────────────── -->
    <header class="task-panel__head pa-4 d-flex flex-column ga-3">
      <div class="d-flex align-center ga-2">
        <h2 class="text-title-medium my-0 flex-grow-1">Task management</h2>
        <span class="text-body-small text-medium-emphasis tabular">{{ tasks.length }} live</span>
        <v-btn
          class="task-panel__close"
          icon
          size="28"
          variant="text"
          aria-label="Hide the task panel"
          @click="emit('close')"
        >
          <v-icon icon="close" size="16" />
        </v-btn>
      </div>

      <!-- Raising an emergency. Guarded by placement and by the confirm below —
           this is the one control on this panel that changes the floor. -->
      <v-menu>
        <template #activator="{ props: menu }">
          <v-btn v-bind="menu" class="text-none" size="small" variant="tonal" color="error" block>
            <template #prepend>
              <v-icon icon="alertFilled" size="16" />
            </template>
            Raise emergency delivery
          </v-btn>
        </template>
        <v-list>
          <v-list-item
            v-for="kind in EMERGENCY_KINDS"
            :key="kind"
            :title="`Emergency ${chassisFor(kind)} delivery`"
            :subtitle="duties[kind].verb + ' — ' + chassisFor(kind) + ' stage'"
            @click="confirming = kind"
          />
        </v-list>
      </v-menu>

      <!-- Priority filter. Each carries its icon and word; the count is the
           live head-count for that level across queued AND assigned work. -->
      <div class="d-flex align-center ga-1 flex-wrap" role="group" aria-label="Filter by priority">
        <v-chip
          v-for="option in filterOptions"
          :key="option.id"
          class="tabular"
          size="small"
          :variant="filter === option.id ? 'flat' : 'outlined'"
          :color="option.tone"
          :aria-pressed="filter === option.id"
          @click="filter = option.id"
        >
          {{ option.label }} {{ option.count }}
        </v-chip>
      </div>
    </header>

    <v-divider />

    <div class="task-panel__scroll flex-grow-1" :class="{ 'task-panel--stale': stale }">
      <!-- ── 1 · Metrics ──────────────────────────────────────────────────── -->
      <section class="pa-4">
        <h3 class="task-panel__section text-title-medium">Performance</h3>
        <!-- Said once, for the whole section: none of these is a measurement. -->
        <p class="task-panel__derived text-body-small">
          Calculated over the run so far — estimates, not readings.
        </p>

        <div class="task-panel__tiles">
          <div v-for="tile in tiles" :key="tile.id" class="task-panel__tile" :title="tile.hint">
            <span class="task-panel__tile-label text-body-small">{{ tile.label }}</span>
            <span
              class="task-panel__tile-value tabular"
              :style="tile.tone ? { color: `rgb(var(--v-theme-${tile.tone}))` } : undefined"
            >{{ tile.value }}</span>
            <span class="task-panel__tile-hint text-body-small">{{ tile.hint }}</span>
          </div>
        </div>
      </section>

      <v-divider />

      <!-- ── 2 · The queue ────────────────────────────────────────────────── -->
      <section class="pa-4">
        <h3 class="task-panel__section text-title-medium">Queue and active work</h3>
        <p class="task-panel__derived text-body-small">
          In dispatch order — emergency, then high, then normal, then low; oldest first within a level.
        </p>

        <p v-if="!visible.length" class="task-panel__empty text-body-small">
          No tasks at this priority right now.
        </p>

        <ul class="task-panel__list">
          <li
            v-for="task in visible"
            :key="task.id"
            class="task-card"
            :class="{
              'task-card--emergency': task.priority === 'emergency',
              'task-card--selected': task.assignedRobotId !== null
                && task.assignedRobotId === selectedRobotId,
            }"
          >
            <!-- The whole card is only interactive once a robot is on it —
                 there is nothing to focus for a queued job. -->
            <component
              :is="task.assignedRobotId ? 'button' : 'div'"
              class="task-card__body"
              :type="task.assignedRobotId ? 'button' : undefined"
              :aria-label="taskLabel(task)"
              @click="task.assignedRobotId && emit('selectRobot', task.assignedRobotId)"
            >
              <!-- Line 1 · id + priority -->
              <div class="d-flex align-center ga-2">
                <span class="task-card__id tabular" translate="no">{{ task.id }}</span>
                <span
                  class="task-card__prio"
                  :style="{ color: `rgb(var(--v-theme-${taskPriorities[task.priority].tone}))` }"
                >
                  <AppIcon :name="taskPriorities[task.priority].icon" class="task-card__prio-icon" />
                  {{ taskPriorities[task.priority].label }}
                </span>
                <v-spacer />
                <span class="task-card__cargo tabular text-medium-emphasis" translate="no">
                  {{ task.cargoId }}
                </span>
              </div>

              <!-- Line 2 · status + robot -->
              <div class="d-flex align-center ga-1 mt-1">
                <AppIcon
                  :name="TASK_STATUS_ICON[task.status]"
                  class="task-card__icon"
                  :style="{ color: `rgb(var(--v-theme-${TASK_STATUS_TONE[task.status]}))` }"
                />
                <span
                  class="text-body-small font-weight-medium"
                  :style="{ color: `rgb(var(--v-theme-${TASK_STATUS_TONE[task.status]}))` }"
                >{{ TASK_STATUS_LABEL[task.status] }}</span>
                <span class="text-body-small text-medium-emphasis text-truncate">
                  ·
                  <template v-if="task.assignedRobotCode">{{ task.assignedRobotCode }}</template>
                  <template v-else>no robot yet</template>
                </span>
              </div>

              <!-- Line 3 · pickup → delivery. Honest about what is undecided. -->
              <div class="task-card__route d-flex align-center ga-1 mt-1 text-body-small">
                <AppIcon name="location" class="task-card__icon" />
                <span class="text-truncate">{{ task.pickupLabel ?? 'Pickup chosen at dispatch' }}</span>
                <AppIcon name="arrowright" class="task-card__icon flex-shrink-0" />
                <span class="text-truncate">{{ task.deliveryLabel ?? 'Delivery chosen at dispatch' }}</span>
              </div>

              <!-- Line 4 · waiting (MEASURED) and ETA (DERIVED) -->
              <div class="d-flex align-center ga-3 mt-1 text-body-small">
                <span class="tabular text-medium-emphasis">
                  Waiting {{ duration(task.waitingSeconds) }}
                </span>
                <span class="tabular text-medium-emphasis">
                  <template v-if="task.etaSeconds === null">ETA — not until assigned</template>
                  <template v-else>ETA est. {{ duration(task.etaSeconds) }}</template>
                </span>
              </div>

              <!-- Why this job is back on the queue, when it is. -->
              <div v-if="task.status === 'interrupted'" class="task-card__note d-flex align-center ga-1 mt-1 text-body-small">
                <AppIcon name="cancel" class="task-card__icon" />
                <span>Stood down for an emergency — awaiting a unit</span>
              </div>
              <div v-else-if="task.resumingFor" class="task-card__note d-flex align-center ga-1 mt-1 text-body-small">
                <AppIcon name="timer" class="task-card__icon" />
                <span>Held for a unit finishing its current run</span>
              </div>
            </component>
          </li>
        </ul>
      </section>

      <v-divider />

      <!-- ── 3 · Notifications ────────────────────────────────────────────── -->
      <section class="pa-4">
        <h3 class="task-panel__section text-title-medium">Recent events</h3>
        <p class="task-panel__derived text-body-small">
          Newest first. Times are simulated minutes since the run started.
        </p>

        <p v-if="!events.length" class="task-panel__empty text-body-small">
          Nothing has happened yet.
        </p>

        <ul class="task-panel__list">
          <li
            v-for="event in newestFirst"
            :key="event.id"
            class="event-row d-flex ga-2"
          >
            <AppIcon
              :name="EVENT_ICON[event.kind]"
              class="event-row__icon"
              :style="{ color: `rgb(var(--v-theme-${EVENT_TONE[event.severity]}))` }"
            />
            <span class="event-row__text text-body-small">{{ event.message }}</span>
            <span class="event-row__time text-body-small tabular text-medium-emphasis">
              {{ eventTime(event.at) }}
            </span>
          </li>
        </ul>
      </section>
    </div>

    <!--
      ⚠️ THE CONFIRMATION NAMES WHAT IT WILL DO. Raising an emergency puts a job
      at the head of the queue and explicitly permits the scheduler to take a
      robot off a low-priority run, so the dialog says both — a bare "Are you
      sure?" would be exactly the failure CLAUDE.md's command rule prohibits.
    -->
    <v-dialog :model-value="confirming !== null" max-width="460" @update:model-value="confirming = null">
      <v-card>
        <v-card-title>Raise an emergency delivery?</v-card-title>
        <v-card-text class="d-flex flex-column ga-3">
          <p>
            This creates an <strong>emergency {{ confirming ? chassisFor(confirming) : '' }}
            delivery</strong> at the head of the queue.
          </p>
          <p class="text-medium-emphasis">
            The scheduler will assign the nearest available
            {{ confirming ? chassisFor(confirming) : '' }} unit. If every capable unit is busy it
            may <strong>cancel a low-priority job that has not yet been picked up</strong> and
            reassign that robot. A unit already carrying a load is never interrupted.
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn class="text-none" variant="text" @click="confirming = null">Cancel</v-btn>
          <v-btn class="text-none" variant="flat" color="error" @click="confirmEmergency">
            Raise emergency
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </aside>
</template>

<style scoped>
.task-panel {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--neutral-bg-hover);
  border-radius: var(--radius-md);
  background-color: rgb(var(--v-theme-background));
}

.task-panel__head {
  flex: 0 0 auto;
}

/* The body scrolls, not the panel — the header and its emergency control stay
   put while the queue moves under them. */
.task-panel__scroll {
  min-height: 0;
  overflow-y: auto;
}

.task-panel__close.v-btn {
  min-width: 28px;
}

.tabular {
  font-variant-numeric: tabular-nums;
}

/* Live figures fade when the feed is not current — the same treatment the map's
   moving layer uses, for the same reason. */
.task-panel--stale {
  opacity: 0.6;
}

.task-panel__section {
  margin: 0;
}

.task-panel__derived {
  margin: 2px 0 12px;
  color: rgb(var(--v-theme-on-surface-weak));
}

.task-panel__empty {
  padding: 12px;
  border: 1px dashed rgb(var(--v-theme-outline-variant));
  border-radius: var(--radius-sm);
  color: rgb(var(--v-theme-on-surface-weak));
  text-align: center;
}

.task-panel__list {
  list-style: none;
  margin: 0;
  padding: 0;
}

/* ── Metric tiles ─────────────────────────────────────────────────────────── */

/* Two per row at 350px; `auto-fit` lets the rail widen without a media query. */
.task-panel__tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
}

.task-panel__tile {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px;
  border: 1px solid rgb(var(--v-theme-outline-variant));
  border-radius: var(--radius-sm);
  background-color: var(--neutral-bg);
}

.task-panel__tile-label {
  color: rgb(var(--v-theme-on-surface-weak));
}

.task-panel__tile-value {
  font-size: 20px;
  font-weight: 600;
  line-height: 24px;
  color: rgb(var(--v-theme-on-surface));
}

/* The definition, not a tooltip: a figure whose window is invisible is a figure
   an operator can read the wrong way. */
.task-panel__tile-hint {
  color: rgb(var(--v-theme-on-surface-weak));
  opacity: 0.8;
}

/* ── A job card ───────────────────────────────────────────────────────────── */

.task-card {
  margin-bottom: 8px;
  border: 1px solid rgb(var(--v-theme-outline-variant));
  border-radius: var(--radius-sm);
  background-color: var(--neutral-bg);
}

.task-card:last-child {
  margin-bottom: 0;
}

/* The card is a <button> only when there is a robot to focus; the reset keeps
   both branches looking identical. */
.task-card__body {
  display: block;
  width: 100%;
  padding: 10px;
  appearance: none;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: inherit;
}

button.task-card__body {
  cursor: pointer;
}

button.task-card__body:focus-visible {
  outline: 2px solid rgb(var(--v-theme-on-surface));
  outline-offset: -2px;
  border-radius: var(--radius-sm);
}

/* Emergency: a left rule as well as the chip's colour, so the card is findable
   in a scrolled list without reading it — a shape, not a tint. */
.task-card--emergency {
  border-color: rgb(var(--v-theme-error));
  border-left-width: 4px;
}

.task-card--selected {
  background-color: rgba(var(--v-theme-primary), 0.14);
}

.task-card__id {
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}

.task-card__prio {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.task-card__prio-icon {
  font-size: 13px;
}

.task-card__icon {
  font-size: 13px;
  flex-shrink: 0;
}

.task-card__route {
  min-width: 0;
  color: rgb(var(--v-theme-on-surface-weak));
}

.task-card__note {
  color: rgb(var(--v-theme-warning));
}

/* ── An event row ─────────────────────────────────────────────────────────── */

.event-row {
  padding: 6px 0;
  border-bottom: 1px solid rgb(var(--v-theme-outline-variant));
}

.event-row:last-child {
  border-bottom: none;
}

.event-row__icon {
  font-size: 14px;
  flex-shrink: 0;
  margin-top: 2px;
}

.event-row__text {
  flex: 1 1 auto;
  min-width: 0;
  color: rgb(var(--v-theme-on-surface));
}

.event-row__time {
  flex-shrink: 0;
}
</style>
