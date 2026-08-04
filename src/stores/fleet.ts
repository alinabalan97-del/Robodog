/**
 * src/stores/fleet.ts
 *
 * ── THE SIMULATION LAYER ─────────────────────────────────────────────────────
 *
 * THE single source of truth for where every robot is, what it is doing and
 * where it is going. Both visualisations read this store; neither owns a robot
 * position, and neither contains any warehouse behaviour. That is what makes 2D
 * and 3D synchronised by construction rather than by a sync routine — switching
 * view mounts a different renderer over the same reactive state, so positions,
 * headings, routes, tasks and statuses cannot drift and nothing resets.
 *
 * THREE LAYERS, and this file is the seam between them:
 *
 *   SIMULATION   `src/sim/fleetSim.ts` + `src/sim/navGraph.ts` + `src/data/fleet.ts`
 *                — dispatch, routing, traffic, battery, warehouse state. Plain
 *                TypeScript with no Vue and no Three in it, which is what lets it
 *                be soaked headlessly instead of only watched in a browser.
 *   THIS STORE   owns the engine, drives its clock, and republishes each tick as
 *                reactive state. No behaviour of its own.
 *   RENDERERS    `FloorMap.vue` (2D) and `warehouse/WarehouseViewer.vue` (3D).
 *                Pure views. Neither may contain business logic.
 *
 * ⚠️ THIS IS A SIMULATION, NOT TELEMETRY (CLAUDE.md → Domain rules). These are
 * invented robots doing invented work. The store is deliberately shaped like the
 * telemetry contract a fleet-management backend would satisfy, so the swap is
 * mechanical — delete `tick()` and feed `applyTelemetry()` instead, and every
 * consumer is unchanged — but nothing here is a measurement, and every surface
 * that renders it is required to say so.
 *
 * WHY THE ENGINE IS NOT REACTIVE: it is a large mutable object graph with its own
 * identity checks, ticking sixty times a second. Wrapping it in a Pinia proxy
 * would cost a fortune and break it. Only the snapshots it emits are reactive,
 * and each tick replaces the array wholesale so Vue diffs once instead of
 * fielding thousands of per-property notifications.
 */

import { defineStore } from 'pinia'
import { markRaw } from 'vue'
import { FleetSim } from '@/sim/fleetSim'
import type { AsrsTelemetry } from '@/sim/asrsSim'
import type { TrafficTelemetry } from '@/sim/trafficControl'
import { fleetRobots, robotTypes, stations, taskPriorities, taskPriorityOrder } from '@/data/fleet'
import type {
  ChargerTelemetry,
  FleetEvent,
  FleetMetrics,
  FleetTelemetry,
  RobotRoutePath,
  RobotState,
  RobotSize,
  RobotTelemetry,
  RobotTypeId,
  TaskKind,
  TaskPriority,
  TaskTelemetry,
  UnitLivery,
} from '@/data/fleet'

/** Re-exported so renderers can type against the fleet without reaching past the store. */
export type { RobotState, RobotTelemetry, RobotTypeId, TaskPriority, FleetEvent, FleetMetrics, UnitLivery }

/** One job as a renderer sees it — the simulation's own shape, unmodified. */
export type FleetTask = TaskTelemetry

/**
 * One end of a live emergency job, already resolved to a floor position.
 *
 * ⚠️ RESOLVED BY THE SCREEN, NOT BY THE RENDERER. A `TaskTelemetry` carries
 * station LABELS, and turning a label into a coordinate is a lookup — the kind
 * of thing that must not live in a `.vue` file, or the 2D and 3D views would
 * each own a copy and could disagree about where an emergency is. `FloorOps.vue`
 * derives these once and hands the same array to whichever view is mounted.
 *
 * `role` is drawn as a different SHAPE in both views, not merely a different
 * colour: on a flashing pair an operator has to tell "collect here" from
 * "deliver here" at a glance and in bad light.
 */
export interface EmergencyMark {
  id: string
  x: number
  y: number
  role: 'pickup' | 'delivery'
  /** The station's own name. */
  label: string
  /** The job this end belongs to, for the accessible name. */
  taskLabel: string
}

/**
 * ── THE PRIORITY PRESENTATION TABLE ──────────────────────────────────────────
 *
 * Re-exported from `src/data/fleet.ts` rather than redefined, so the scheduler
 * and every surface that draws it read ONE table. A second copy keyed by the
 * same ids is how a chip ends up disagreeing with the queue it describes.
 *
 * `tone` and `routeTone` are theme token NAMES. Components resolve them through
 * `rgb(var(--v-theme-…))` and the 3D layers resolve them at runtime — no hexes
 * anywhere, so the priority colours re-theme with the app.
 */
export { taskPriorities, taskPriorityOrder }

/** Every job status gets a word too — never a bare colour on a dispatch surface. */
export const TASK_STATUS_LABEL: Record<TaskTelemetry['status'], string> = {
  queued: 'Queued',
  assigned: 'Assigned',
  toPickup: 'Collecting',
  carrying: 'In transit',
  delivering: 'Delivering',
  interrupted: 'Interrupted',
}

export const TASK_STATUS_TONE: Record<TaskTelemetry['status'], string> = {
  queued: 'on-surface-weak',
  assigned: 'primary-bright',
  toPickup: 'primary-bright',
  carrying: 'secondary',
  delivering: 'secondary-deep',
  interrupted: 'warning',
}

export const TASK_STATUS_ICON: Record<TaskTelemetry['status'], string> = {
  queued: 'clock',
  assigned: 'workOrder',
  toPickup: 'arrowright',
  carrying: 'package',
  delivering: 'shipping',
  interrupted: 'cancel',
}

/** The notification feed's icons — one per event kind, paired with its message. */
export const EVENT_ICON: Record<FleetEvent['kind'], string> = {
  'emergency-created': 'alertFilled',
  'robot-reassigned': 'repeat',
  'task-interrupted': 'cancel',
  'task-resumed': 'play',
  'emergency-completed': 'checkFilled',
  'emergency-unassignable': 'warning',
}

export const EVENT_TONE: Record<FleetEvent['severity'], string> = {
  critical: 'error',
  warning: 'warning',
  info: 'info',
}

/**
 * What a renderer is handed for one robot.
 *
 * It is `RobotTelemetry` — the simulation's own output shape, unmodified. The
 * store deliberately adds nothing: a field the renderers need but the telemetry
 * contract lacks is a gap in the CONTRACT, and papering over it here would mean
 * the real backend produced something the views could not draw.
 */
export type FleetRobot = RobotTelemetry

/**
 * One ASRS stacker crane, one frame.
 *
 * The machine that runs a rail inside a storage aisle: `x` moves along that
 * rail, `carriageM` moves up the mast, and the two are reported separately
 * because they are two independent axes on the real machine. See
 * `src/sim/asrsSim.ts` for why they are also SEQUENCED.
 */
export type FleetCrane = AsrsTelemetry

/**
 * One charging stall. Equipment, not decoration: the 3D scene builds a dock at
 * each of these and reads `state` to show whether it is free, spoken for, or
 * actually delivering current.
 */
export type FleetCharger = ChargerTelemetry

/**
 * ── THE ROBOT MODEL REGISTRY ─────────────────────────────────────────────────
 *
 * Adding a chassis to the 3D view is ONE entry in `robotTypes` — the registry is
 * the type table itself rather than a second list beside it, because two lists
 * keyed by the same ids drift. The viewer reads this, spawns whatever has a
 * `url`, and draws a schematic marker for whatever does not.
 *
 * ⚠️ A `null` url NEVER falls back to another chassis. A robot that is visibly a
 * placeholder is honest; a Type C drawn as a Type A is a lie an operator would
 * act on.
 */
export interface RobotModel {
  url: string | null
  /** Real-world size in metres — what the viewer scales the GLB to hit. */
  sizeM: RobotSize
  yawOffset: number
}

export const ROBOT_MODELS: Record<RobotTypeId, RobotModel> = Object.fromEntries(
  Object.values(robotTypes).map(type => [
    type.id,
    { url: type.modelUrl, sizeM: type.sizeM, yawOffset: type.yawOffset },
  ]),
) as Record<RobotTypeId, RobotModel>

/**
 * ── PER-UNIT IDENTITY, BY ROBOT ID ──────────────────────────────────────────
 *
 * Built from the roster rather than declared beside it, so a unit cannot end up
 * with paint no robot wears or a robot end up with no entry — the two lists
 * keyed by the same ids are the thing that drifts.
 *
 * ⚠️ PER-UNIT, NOT PER-CHASSIS, AND THAT IS THE POINT ON A FIVE-ROBOT FLOOR.
 * `robotLivery.accent` still carries a fallback per chassis, which was enough
 * when three colours told an operator what KIND of machine they were looking at
 * and the code told them which one. With two forklifts on the floor, identical
 * paint means reading a label to tell them apart — and the label is the first
 * thing to go at wall-display distance. Colour, hull marking and call-sign are
 * three redundant channels on purpose: colour alone fails a colourblind operator
 * and fails in bad light.
 */
export const UNIT_LIVERY: Record<string, UnitLivery> = Object.fromEntries(
  fleetRobots.filter(def => def.livery).map(def => [def.id, def.livery!]),
)

/** The call-sign a floor team says out loud, or null for a unit without one. */
export const unitName = (robotId: string): string | null =>
  UNIT_LIVERY[robotId]?.name ?? null

/** Every state gets a word — no surface in this app conveys status by colour alone. */
export const ROBOT_STATE_LABEL: Record<RobotState, string> = {
  idle: 'Idle',
  toPickup: 'Moving to pickup',
  carrying: 'Carrying cargo',
  delivering: 'Delivering cargo',
  returning: 'Returning',
  waiting: 'Waiting',
  error: 'Error',
  goingToCharge: 'Going to charge',
  waitingForCharge: 'Waiting for a stall',
  docking: 'Docking',
  charging: 'Charging',
  chargingComplete: 'Charge complete',
  emergencyLowBattery: 'Low battery',
  // ── Priority scheduling ────────────────────────────────────────────────────
  // ⚠️ "Low battery" above and "Emergency task" below are two different
  // emergencies and the words have to keep them apart: one unit cannot finish,
  // the other is running the most important job in the building.
  assigned: 'Assigned',
  executingPriorityTask: 'Priority task',
  waitingForPriorityTask: 'Held for emergency',
  taskInterrupted: 'Task interrupted',
  resumingPreviousTask: 'Resuming task',
  // ── Dock service ───────────────────────────────────────────────────────────
  // The dock pair's own words. Deliberately plainer than the rest of the
  // vocabulary — a bay is the one place in the hall where an operator is often
  // reading the screen to answer somebody standing at a trailer.
  goingToLoadingDock: 'Going to loading dock',
  loadingAtDock: 'Loading',
  transportingCargo: 'Transporting cargo',
  returningToDock: 'Returning to dock',
  waitingForNextTask: 'Waiting for next task',
}

/**
 * Status colour per state. Reserved theme status tokens only, and always paired
 * with the label above — never used on its own to carry meaning.
 */
export const ROBOT_STATE_TONE: Record<RobotState, string> = {
  idle: 'on-surface-weak',
  toPickup: 'primary-bright',
  carrying: 'secondary',
  delivering: 'secondary-deep',
  returning: 'info',
  waiting: 'warning',
  error: 'error',
  // The charging family shares one hue so it reads as one activity at a glance,
  // and the five states are told apart by their labels and icons — never by the
  // shade alone. `emergencyLowBattery` is the exception and deliberately borrows
  // the error tone: a unit below the critical level is an attention state, not a
  // routine one.
  goingToCharge: 'tertiary',
  waitingForCharge: 'tertiary',
  docking: 'tertiary-bright',
  charging: 'tertiary-bright',
  chargingComplete: 'success',
  emergencyLowBattery: 'error',
  // The priority family: `assigned` is a neutral hand-over, the three that
  // involve urgent work borrow the priority palette's own tones so a robot row
  // and a task row agree about severity, and `taskInterrupted` is a warning
  // because something an operator did not ask for happened to that unit's work.
  assigned: 'primary-bright',
  executingPriorityTask: 'error',
  waitingForPriorityTask: 'warning',
  taskInterrupted: 'warning',
  resumingPreviousTask: 'info',
  // The dock family borrows the ORDINARY working tones rather than a hue of its
  // own: a dock unit collecting is doing the same class of thing as any other
  // unit collecting, and giving the posting its own colour would read as a
  // severity that is not there. The words and icons are what tell them apart.
  goingToLoadingDock: 'primary-bright',
  loadingAtDock: 'secondary',
  transportingCargo: 'secondary-deep',
  returningToDock: 'info',
  waitingForNextTask: 'on-surface-weak',
}

/**
 * The icon that carries each state alongside its label.
 *
 * ⚠️ REQUIRED, NOT DECORATION. Floor displays get glanced at in bad light, and
 * the domain rules forbid conveying state by colour alone — so every state here
 * has a shape as well as a tone. Keys are semantic names from
 * `src/icons/carbon.ts`, never vendor icon names.
 */
export const ROBOT_STATE_ICON: Record<RobotState, string> = {
  idle: 'pause',
  toPickup: 'arrowright',
  carrying: 'package',
  delivering: 'shipping',
  returning: 'arrowleft',
  waiting: 'clock',
  error: 'warning',
  goingToCharge: 'charger',
  waitingForCharge: 'clock',
  docking: 'connected',
  charging: 'battery',
  chargingComplete: 'success',
  emergencyLowBattery: 'warning',
  assigned: 'workOrder',
  executingPriorityTask: 'alertFilled',
  waitingForPriorityTask: 'timer',
  taskInterrupted: 'cancel',
  resumingPreviousTask: 'repeat',
  // Keys checked against `src/icons/carbon.ts` — an unknown key renders nothing,
  // which on a colour-plus-shape contract silently drops the shape half.
  goingToLoadingDock: 'shipping',
  loadingAtDock: 'package',
  transportingCargo: 'cube',
  returningToDock: 'arrowLeft',
  waitingForNextTask: 'timer',
}

/** Every stall status gets a word too, for the same reason as the robot states. */
export const CHARGER_STATE_LABEL: Record<ChargerTelemetry['state'], string> = {
  free: 'Free',
  reserved: 'Reserved',
  charging: 'Occupied',
}

export const CHARGER_STATE_TONE: Record<ChargerTelemetry['state'], string> = {
  free: 'on-surface-weak',
  reserved: 'warning',
  charging: 'tertiary-bright',
}

export const CHARGER_STATE_ICON: Record<ChargerTelemetry['state'], string> = {
  free: 'success',
  reserved: 'clock',
  charging: 'battery',
}

/** The clock rates an operator can pick. 1 is real time. */
export const SIM_RATES = [0.5, 1, 2, 4] as const
export type SimRate = (typeof SIM_RATES)[number]

interface FleetState {
  robots: FleetRobot[]
  /**
   * The ASRS stacker cranes.
   *
   * Published beside the fleet frame rather than inside it — see
   * `FleetSim.craneTelemetry`. One engine owns both; this is not a second model.
   */
  cranes: FleetCrane[]
  chargers: FleetCharger[]
  /**
   * The road network's live state — which lane blocks are held, which junctions
   * are contested, how deep the queues are, and any pair inside its safe gap.
   *
   * ⚠️ NOT PART OF `FleetTelemetry`, and published here for the overlay that
   * draws it. A real fleet-management backend reports what its VEHICLES are
   * doing, not the internals of whoever arbitrated the aisles, so this comes off
   * a separate accessor — see `FleetSim.trafficTelemetry`. Null until the first
   * frame, which is also what a view should treat as "no answer yet" rather than
   * as "nothing is reserved".
   */
  traffic: TrafficTelemetry | null
  /** Simulated seconds since the run started. */
  elapsedSeconds: number
  tasksCompleted: number
  tasksActive: number
  tasksQueued: number
  /**
   * Every live job, IN THE SCHEDULER'S OWN ORDER.
   *
   * ⚠️ NEVER RE-SORT THIS IN A COMPONENT. The order is the simulation's next-out
   * order; a panel that re-derived it could show a different answer to "what
   * runs next" than the model will actually give, which on a dispatch surface is
   * worse than showing nothing. Filter it, slice it, but do not reorder it.
   */
  tasks: FleetTask[]
  queuedByPriority: Record<TaskPriority, number>
  /** Rolling notification feed, oldest first. See `FleetEvent`. */
  events: FleetEvent[]
  metrics: FleetMetrics
  running: boolean
  paused: boolean
  rate: SimRate
  /** Seconds since the last accepted frame — what the freshness chip reads. */
  frameAgeSeconds: number
  /** Set when the compiled road network is unsound. Surfaced, never swallowed. */
  networkFault: string | null
}

/**
 * The engine instance. Module-scoped and `markRaw`-guarded rather than held in
 * store state: one warehouse, one simulation, however many components mount.
 */
let engine: FleetSim | null = null

function ensureEngine (): FleetSim {
  if (!engine) engine = markRaw(new FleetSim())
  return engine
}

export const useFleetStore = defineStore('fleet', {
  state: (): FleetState => ({
    robots: [],

    cranes: [],
    traffic: null,
    chargers: [],
    elapsedSeconds: 0,
    tasksCompleted: 0,
    tasksActive: 0,
    tasksQueued: 0,
    tasks: [],
    queuedByPriority: { emergency: 0, high: 0, normal: 0, low: 0 },
    events: [],
    metrics: {
      totalTasks: 0,
      tasksCompleted: 0,
      emergencyTasksCompleted: 0,
      averageDeliverySeconds: null,
      averageEmergencyResponseSeconds: null,
      highPriorityCompletionRate: null,
      robotUtilisation: 0,
      averageQueueSeconds: null,
      tasksInterrupted: 0,
      tasksResumed: 0,
    },
    running: false,
    paused: false,
    rate: 1,
    frameAgeSeconds: 0,
    networkFault: null,
  }),

  getters: {
    byId: state => (id: string) => state.robots.find(r => r.id === id) ?? null,
    /** Head-count per state, for the hall counters. Keyed by the state vocabulary. */
    countByState: (state): Record<RobotState, number> => {
      // Built from the vocabulary itself rather than written out: a literal here
      // silently returns NaN for any state added later, and the states have been
      // added to twice already.
      const counts = Object.fromEntries(
        (Object.keys(ROBOT_STATE_LABEL) as RobotState[]).map(key => [key, 0]),
      ) as Record<RobotState, number>
      for (const robot of state.robots) counts[robot.state] += 1
      return counts
    },
    /** The live emergency jobs — what the maps flash and the header counts. */
    emergencyTasks: (state) => state.tasks.filter(task => task.priority === 'emergency'),
    /** One job by id, for a panel that has only the id a robot reported. */
    taskById: state => (id: string | null) =>
      (id ? state.tasks.find(task => task.id === id) ?? null : null),
    /** Units moving cargo right now — the number an operator reads as "working". */
    working: (state) => state.robots.filter(
      r => r.state === 'toPickup' || r.state === 'carrying' || r.state === 'delivering'
        // The dock pair's equivalents. Excluding them would report two of the
        // busiest units in the hall as not working.
        || r.state === 'goingToLoadingDock' || r.state === 'loadingAtDock'
        || r.state === 'transportingCargo' || r.state === 'returningToDock',
    ).length,
    /** Units needing attention. Drives the alert counter. */
    alerting: (state) => state.robots.filter(r => r.alert !== null).length,
    fleetSize: () => fleetRobots.length,
    stationCount: () => stations.length,
  },

  actions: {
    /**
     * Bring the fleet up.
     *
     * `size` is accepted for call-site compatibility but is NOT a knob: the
     * roster is declared in `src/data/fleet.ts`, where each unit has a chassis, a
     * home bay and a starting charge. Inventing extra units here would produce
     * robots with no waiting bay to stand down to.
     */
    seed (size?: number) {
      const sim = ensureEngine()
      if (size !== undefined && size !== fleetRobots.length) {
        console.warn(
          `[fleet] seed(${size}) ignored — the roster is ${fleetRobots.length} units, `
          + 'declared in src/data/fleet.ts. Edit `fleetRobots` to change the fleet.',
        )
      }
      if (!sim.connectivity.ok) {
        this.networkFault = 'The warehouse road network is not fully drivable — see the console.'
      }
      this.publish(sim.telemetry())
      this.cranes = sim.craneTelemetry()
      this.traffic = sim.trafficTelemetry()
    },

    /**
     * Advance the simulation. `deltaSeconds` is wall-clock; the rate multiplier is
     * applied here so every caller gets the operator's chosen speed for free.
     *
     * Clamped because a backgrounded tab hands back a delta of many seconds, and
     * integrating that in one step would carry every unit straight through the
     * racking and past every reservation it holds.
     */
    tick (deltaSeconds: number) {
      const wall = Math.min(Math.max(deltaSeconds, 0), 0.1)
      if (!wall) return

      if (this.paused) {
        // A paused view is a stopped clock. Letting the age climb makes the
        // surface degrade exactly as it would on a dropped feed — a frozen
        // picture must never keep wearing the "live" treatment.
        this.frameAgeSeconds += wall
        return
      }

      const step = wall * this.rate
      const sim = ensureEngine()
      // ONE tick, for one warehouse. The cranes used to be a second engine
      // stepped on the next line, which was only ever *usually* in step — a
      // caller that returned early between the two, or ticked one twice, would
      // have put two moments of the same building on one screen. `FleetSim`
      // steps them now, inside its own tick.
      sim.tick(step)
      this.publish(sim.telemetry())
      this.cranes = sim.craneTelemetry()
      this.traffic = sim.trafficTelemetry()
      this.frameAgeSeconds = 0
    },

    /** Copy one simulation frame into reactive state. The only writer. */
    publish (frame: FleetTelemetry) {
      this.robots = frame.robots
      this.chargers = frame.chargers
      this.elapsedSeconds = frame.elapsedSeconds
      this.tasksCompleted = frame.tasksCompleted
      this.tasksActive = frame.tasksActive
      this.tasksQueued = frame.tasksQueued
      this.tasks = frame.tasks
      this.queuedByPriority = frame.queuedByPriority
      this.events = frame.events
      this.metrics = frame.metrics
    },

    /**
     * Raise an urgent delivery.
     *
     * ⚠️ THIS IS A PHYSICAL-WORLD COMMAND (CLAUDE.md → Domain rules): it puts a
     * job at the head of the queue and can pull a robot off the work it is
     * doing. The confirmation naming what it creates belongs to the CALLER — a
     * store action cannot name a vehicle it has not chosen yet — so every call
     * site is required to confirm first. See `FloorOps.vue`.
     *
     * Returns the new task's id, or null when the stage takes no mobile unit.
     */
    raiseEmergency (kind: TaskKind = 'container'): string | null {
      const id = ensureEngine().raiseEmergency(kind)
      // Republish immediately: the operator pressed a button and has to see the
      // job appear, not wait for the next animation frame to prove it worked.
      this.publish(engine!.telemetry())
      return id
    },

    /**
     * The selected unit's assignment, split into driven and remaining. Read from
     * the engine rather than stored, because it changes only when something asks
     * for it — publishing sixteen full routes every frame would be waste.
     */
    routeFor (robotId: string | null): RobotRoutePath | null {
      if (!robotId) return null
      return ensureEngine().routeFor(robotId)
    },

    /** Drop-in for real telemetry: same shape, no simulation. */
    applyTelemetry (updates: Array<Partial<FleetRobot> & { id: string }>) {
      this.robots = this.robots.map(robot => {
        const update = updates.find(u => u.id === robot.id)
        return update ? { ...robot, ...update } : robot
      })
      this.frameAgeSeconds = 0
    },

    togglePaused () {
      this.paused = !this.paused
      if (!this.paused) this.frameAgeSeconds = 0
    },

    cycleRate () {
      const index = SIM_RATES.indexOf(this.rate)
      this.rate = SIM_RATES[(index + 1) % SIM_RATES.length]!
    },

    start () { this.running = true; this.frameAgeSeconds = 0 },
    stop () { this.running = false },
  },
})
