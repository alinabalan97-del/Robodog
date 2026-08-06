<script setup lang="ts">
  /**
   * FloorOps.vue — live floor operations for one production hall.
   *
   * THE SCREEN'S ONE JOB: let a floor operator see the live state of a hall and
   * drill into the mission they are responsible for. The floor plan is therefore
   * the anchor and gets the space; the mission rail is a detail view beside it,
   * not a peer. Nothing else competes.
   *
   * This screen is a pure view over `src/data/floorOps.ts` — every figure, name,
   * coordinate and code comes from that dataset and all of it is synthetic. When
   * a backend lands it produces the same shapes (see src/api/) and this file is
   * unchanged.
   *
   * Per CLAUDE.md there is no shared shell: this screen declares its own <v-app>,
   * its own chrome and its own snackbar.
   */
  import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
  import { useTheme } from 'vuetify'
  import AppIcon from '@/components/AppIcon.vue'
  import FloorMap from '@/components/FloorMap.vue'
  import FleetPanel from '@/components/FleetPanel.vue'
  import MissionPanel from '@/components/MissionPanel.vue'
  import TaskPanel from '@/components/TaskPanel.vue'
  import { brand } from '@/data/brand'
  import { floorOps, type FeedStatus, type SiteFloor } from '@/data/floorOps'
  import { useFleetStore } from '@/stores/fleet'
  import type { EmergencyMark } from '@/stores/fleet'
  import { fleetRobots, stations } from '@/data/fleet'
  import type { TaskKind } from '@/data/fleet'
  import logoUrl from '@/assets/Logo.png'
  // Exported from the Figma navigation node — Carbon ships no matching sparkle glyph,
  // so this is the design's own asset rather than a near-miss substitute.
  import aiSparkleUrl from '@/assets/ai-sparkle.svg'

  const theme = useTheme()
  const isDark = computed(() => theme.global.name.value === 'dark')
  function toggleTheme () {
    theme.global.name.value = isDark.value ? 'light' : 'dark'
  }

  // ── Mutable UI state, seeded from the dataset ──────────────────────────────
  const location = ref<SiteFloor>(floorOps.location)
  const hall = ref(floorOps.hall)
  const mission = ref(floorOps.mission)
  const panelOpen = ref(true)
  const editMode = ref(false)
  /**
   * Async so Three.js is a separate chunk. This screen is EAGERLY routed (it is
   * the landing route), and a static import would put the whole 3D stack in the
   * first payload for every operator, including the ones who never leave 2D.
   * Switching views is still seamless — the parent's state is untouched by the
   * chunk fetch, and the viewer shows its own loading surface meanwhile.
   */
  const WarehouseViewer = defineAsyncComponent(
    () => import('@/components/warehouse/WarehouseViewer.vue'),
  )

  /**
   * The fleet lives in a store, not in this component, and BOTH views render it.
   * That is the whole synchronisation story: 2D and 3D are two renderers over one
   * reactive array, so a view switch cannot move a robot, drop a route or reset a
   * status — there is nothing per-view to reset.
   */
  const fleet = useFleetStore()
  fleet.seed(fleetRobots.length)

  let fleetFrame = 0
  let lastFrameMs = 0

  /**
   * One rAF loop for the whole screen, owned here rather than by either view —
   * so the fleet keeps advancing across a 2D↔3D switch instead of restarting
   * with the renderer. Paused when the tab is hidden: rAF already throttles, but
   * this also stops a backgrounded wall display burning battery on a sim nobody
   * is watching.
   */
  function stepFleet (nowMs: number) {
    fleetFrame = requestAnimationFrame(stepFleet)
    if (document.hidden) { lastFrameMs = nowMs; return }
    if (lastFrameMs) fleet.tick((nowMs - lastFrameMs) / 1000)
    lastFrameMs = nowMs
  }

  const zoom = ref(1)
  const mapView = ref<'2d' | '3d'>('2d')
  /**
   * The 3D traffic overlay — reservations, junction pressure and safety rings.
   *
   * Off by default and deliberately not persisted: it answers "why is that robot
   * stopped", which is a question an operator asks occasionally, and leaving it
   * on buries the floor it explains under its own markup.
   */
  const showTraffic = ref(false)

  /**
   * Tell the store when the aisle ledger is actually being drawn.
   *
   * ⚠️ THE SNAPSHOT IS REBUILT PER FRAME AND HAS ONE CONSUMER — this overlay, in
   * this view. Publishing it unconditionally meant the engine walked its whole
   * ledger and the store woke every watcher of `traffic` sixty times a second so
   * that a hidden layer could ignore the result. The demand is declared here
   * because this is the only place that knows both halves of the condition:
   * which view is mounted, and whether the operator has the overlay on.
   *
   * `immediate` so the initial 2D view starts with it off rather than paying for
   * one frame of it before the watcher first runs.
   */
  watch(
    () => mapView.value === '3d' && showTraffic.value,
    wanted => fleet.setTrafficWanted(wanted),
    { immediate: true },
  )
  /**
   * The focused unit. Seeded from the fleet itself, not from the mission
   * dataset — the fleet IS the live vehicle layer now, and pointing this at a
   * code that is not on the floor would leave the plan with nothing highlighted.
   */
  const selectedVehicleId = ref<string | null>(fleet.robots[0]?.id ?? null)
  const activeNavId = ref('missions')

  /**
   * Which detail view the left rail is showing.
   *
   * Three views over ONE selection, not three panels: the roster answers "what
   * is this robot doing", the task board answers "what is the floor doing and in
   * what order", and the mission card answers "what am I responsible for". The
   * rail is 350px, so they take turns rather than stacking.
   */
  const railTab = ref<'fleet' | 'tasks' | 'mission'>('fleet')

  const selectedRobot = computed(() => fleet.byId(selectedVehicleId.value ?? ''))

  /**
   * The urgency of the selected unit's job — what colours its route in BOTH
   * views. Read from the robot rather than looked up in the task list, because
   * the robot's own frame is the thing the maps are already drawing.
   */
  const routePriority = computed(() => selectedRobot.value?.taskPriority ?? null)

  /**
   * ── WHERE THE LIVE EMERGENCIES ARE ─────────────────────────────────────────
   *
   * Derived HERE, once, and handed to whichever renderer is mounted — the same
   * arrangement `robotRoute` uses and for the same reason: resolving a station
   * id to a floor position is a lookup, and a lookup that lived in a `.vue` file
   * would exist twice and could disagree between 2D and 3D about where an
   * emergency is.
   *
   * Only jobs that are still live appear: the simulation drops a task from
   * `tasks` the moment it is delivered, so a beacon can never outlive its work.
   * A queued emergency contributes NO marks — the scheduler has not chosen its
   * bays yet, and flashing a guess would be inventing a position.
   */
  const stationById = new Map(stations.map(station => [station.id, station]))

  const emergencyMarks = computed<EmergencyMark[]>(() => {
    const marks: EmergencyMark[] = []
    for (const task of fleet.emergencyTasks) {
      const ends = [
        { role: 'pickup' as const, id: task.pickupStationId },
        { role: 'delivery' as const, id: task.deliveryStationId },
      ]
      for (const end of ends) {
        const station = end.id ? stationById.get(end.id) : undefined
        if (!station) continue
        marks.push({
          id: `${task.id}:${end.role}`,
          x: station.x,
          y: station.y,
          role: end.role,
          label: station.label,
          taskLabel: task.label,
        })
      }
    }
    return marks
  })

  /**
   * The focused unit's assignment, driven and remaining — handed to whichever
   * renderer is mounted so both draw the same route.
   *
   * Reading the unit's position is what makes this re-derive as it advances: the
   * route itself lives in the engine (publishing sixteen full paths every frame
   * would be waste), so the dependency has to be something that does tick.
   */
  const robotRoute = computed(() => {
    const robot = selectedRobot.value
    if (!robot) return null
    void robot.x
    void robot.y
    return fleet.routeFor(robot.id)
  })

  // ── Feed freshness ─────────────────────────────────────────────────────────
  // Binding domain rule: never present stale telemetry as live. The age below is
  // the single source for that, and it really does climb — the header degrades on
  // its own if frames stop arriving.
  //
  // ⚠️ There is no telemetry socket yet, so the age is the SIMULATION's own frame
  // age. That makes the chip honest rather than decorative: pause the simulation
  // and the header really does go stale and then disconnected, because the
  // positions on screen really have stopped being current. Wiring src/api/
  // replaces the source of this number and nothing else here changes.
  const staleAfter = floorOps.feed.staleAfterSeconds
  const feedAge = computed(() => Math.floor(fleet.frameAgeSeconds))

  const feedStatus = computed<FeedStatus>(() => {
    if (feedAge.value > staleAfter * 4) return 'disconnected'
    if (feedAge.value > staleAfter) return 'stale'
    return 'live'
  })

  const feedIsLive = computed(() => feedStatus.value === 'live')

  /** Word + icon for every state — the header never signals freshness by colour alone. */
  const feedPresentation = computed(() => {
    switch (feedStatus.value) {
      case 'live':
        return { label: 'Live', icon: 'dot', color: 'primary' }
      case 'stale':
        return { label: `Stale · ${feedAge.value}s`, icon: 'alert', color: 'warning' }
      default:
        return { label: 'Disconnected', icon: 'disconnected', color: 'error' }
    }
  })

  onMounted(() => {
    fleet.start()
    fleetFrame = requestAnimationFrame(stepFleet)
  })
  onBeforeUnmount(() => {
    cancelAnimationFrame(fleetFrame)
    fleet.stop()
  })

  // ── Hall counters. Each carries a word, not just an icon and a number. ──────
  // The vehicle and alert counts are the LIVE fleet's, not the dataset's — a
  // header that disagreed with the plan under it would be worse than no header.
  // People on floor stays synthetic; nothing in this build models them.
  const counters = computed(() => [
    { id: 'people', icon: 'userMultiple', value: hall.value.peopleOnFloor, label: 'people on floor' },
    { id: 'vehicles', icon: 'vehicle', value: fleet.working, label: 'robots working' },
    // Live emergencies get a counter of their own beside the alert count, and
    // they are not the same thing: an alert is a robot that needs attention, an
    // emergency is WORK that does. Folding them together would let a busy floor
    // hide an urgent delivery behind three flat batteries.
    {
      id: 'emergency',
      icon: 'alertFilled',
      value: fleet.queuedByPriority.emergency,
      label: 'emergency tasks live',
      tone: 'error',
    },
    { id: 'alerts', icon: 'alert', value: fleet.alerting, label: 'open alerts', tone: 'error' },
  ])

  // ── Map controls ───────────────────────────────────────────────────────────
  const mapRegion = useTemplateRef<HTMLElement>('mapRegion')

  function zoomBy (delta: number) {
    zoom.value = Math.min(3, Math.max(1, Number((zoom.value + delta).toFixed(2))))
  }

  async function toggleFullscreen () {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else if (mapRegion.value) {
      await mapRegion.value.requestFullscreen().catch(() => {
        notify('This browser blocked full screen for the floor plan.', 'warning')
      })
    }
  }

  // ── Selection ──────────────────────────────────────────────────────────────
  function selectVehicle (id: string) {
    selectedVehicleId.value = id
    railTab.value = 'fleet'
    const robot = fleet.byId(id)
    if (robot?.alert) notify(`${robot.code}: ${robot.alert}`, 'warning')
  }

  function toggleVehicle (id: string) {
    mission.value = {
      ...mission.value,
      vehicles: mission.value.vehicles.map(v =>
        v.id === id ? { ...v, assigned: !v.assigned } : v,
      ),
    }
  }

  function selectStop (id: string) {
    mission.value = { ...mission.value, currentStopId: id }
  }

  // ── Toasts are per-screen (CLAUDE.md) — no app-wide snackbar exists. ────────
  const snack = ref({ show: false, text: '', color: 'surface-bright' })
  function notify (text: string, color = 'surface-bright') {
    snack.value = { show: true, text, color }
  }

  // ── Real-time notifications ────────────────────────────────────────────────
  //
  // ⚠️ DRIVEN BY EVENT ID, NOT BY ARRAY LENGTH. The feed is a capped ring, so it
  // stops growing once it is full and a length watcher would go silent exactly
  // when the floor got busiest. Ids are monotonic, so "everything above the
  // highest id I have shown" is the only correct definition of new.
  //
  // The panel keeps the whole feed; this only raises the ones an operator should
  // not have to be looking at the rail to see.
  let lastEventId = 0

  /** Which events interrupt. The rest are in the feed and that is enough. */
  const TOASTED: ReadonlyArray<string> = [
    'emergency-created',
    'robot-reassigned',
    'task-interrupted',
    'task-resumed',
    'emergency-completed',
    'emergency-unassignable',
  ]

  const EVENT_COLOR: Record<string, string> = {
    critical: 'error',
    warning: 'warning',
    info: 'surface-bright',
  }

  // ⚠️ KEYED ON THE HIGHEST ID, NOT ON THE ARRAY. The store republishes a fresh
  // copy of the feed on every tick, so watching the array — deeply, as this used
  // to — woke this handler sixty times a second and walked the whole ring each
  // time, to discover nothing had happened on all but a handful of them. The
  // feed is append-only with monotonic ids, so its last id is a complete summary
  // of whether there is anything new, and the handler now runs only when there
  // genuinely is.
  watch(() => fleet.events[fleet.events.length - 1]?.id ?? 0, () => {
    const events = fleet.events
    // Only the newest qualifying event is raised. A burst — an emergency created,
    // a robot reassigned and a task interrupted all inside one tick — is one
    // situation, and three stacked toasts would bury the map they are about.
    let newest: (typeof events)[number] | null = null
    for (const event of events) {
      if (event.id <= lastEventId) continue
      if (TOASTED.includes(event.kind)) newest = event
    }
    if (events.length) lastEventId = Math.max(lastEventId, events[events.length - 1]!.id)
    if (newest) notify(newest.message, EVENT_COLOR[newest.severity] ?? 'surface-bright')
  })

  /**
   * Raise an urgent delivery.
   *
   * ⚠️ THE CONFIRMATION HAS ALREADY HAPPENED. `TaskPanel` will not emit this
   * without a dialog naming what it creates and what it may interrupt — a
   * physical-world command, per CLAUDE.md. This handler only carries it into the
   * simulation and reports the outcome, including the honest failure case where
   * the backlog could not take it.
   */
  function raiseEmergency (kind: TaskKind) {
    const id = fleet.raiseEmergency(kind)
    if (!id) {
      notify('That stage takes no mobile unit — no emergency was raised.', 'warning')
      return
    }
    // The feed's own `emergency-created` event carries the detail; this only
    // confirms the button did something, which a queue of fourteen jobs might
    // otherwise hide.
    railTab.value = 'tasks'
  }
</script>

<template>
  <v-app>
    <a class="skip-link" href="#floor-main">Skip to the floor plan</a>

    <!-- ── Top chrome ── -->
    <!--
      TOP BAR — transcribed from Figma node 6477:83173 ("navigation"), not estimated.
      Every number below came out of the file, so treat it as the spec:

        bar        60 high · px 16 · pb 16 (content row is the top 44) · no border
        logo       368 wide · left edge 16 · pushed apart from the rest (space-between)
        group A    px 24 · gap 12   →  [search + AI] then Submit
        search     463×44 · radius 99 · px 20 · gap 12 · bg surface · 1px outline-variant
                   icon 16 · placeholder Inter 400 14/20 on-surface-weak
        AI         44 circle · p 10 · icon 24 · gradient -52.56deg
                   primary-accent 10.6% → secondary-accent 112.23%
        Submit     px 16 · py 12 · radius 99 · gap 8 · icon 18 · Inter 500 14/16
        group B    gap 16   →  [two 40 circles, gap 12] then account
        tool btn   40 circle · p 10 · icon 20 · bg background · 1px outline-variant
        account    gap 8 · avatar 36 (tertiary, initials 14/16) · column gap 2
                   name Inter 500 14/16 · chevron 16 (gap 8) · role Inter 400 12/14

      Gaps are DS utilities (ga-3 = 12, ga-4 = 16, ga-2 = 8, px-6 = 24, px-4 = 16).
    -->
    <!-- `background`, not Vuetify's default `surface`: the Figma navigation frame
         carries no fill of its own and sits on the page base (#020D20). Defaulting
         to `surface` is what made the bar read a shade too light. -->
    <!-- 76 = the design's 16px top inset + the 60 navigation frame. Carrying the
         inset as bar height (rather than a margin) keeps Vuetify's layout offset
         math correct, and the bar shares the page colour so it reads as space. -->
    <v-app-bar flat height="76" color="background">
      <div class="topbar d-flex align-center justify-space-between w-100 px-4 pt-4 pb-4">
        <router-link to="/" class="d-flex align-center text-decoration-none flex-shrink-0">
          <!-- 368 wide per the design frame. 1× raster — it will soften on a HiDPI
               wall display; a 2× export or an SVG would fix that. -->
          <img :src="logoUrl" :alt="`${brand.identity.name} home`" width="368" height="35">
        </router-link>

        <!-- Allowed to shrink, so the search field absorbs a narrow viewport
             instead of the account block falling off the end. `min-width: 0` is
             what lets a flex child shrink below its content at all. -->
        <div class="d-flex align-center topbar__group">
          <div class="d-flex align-center ga-3 px-6 topbar__controls">
            <div class="d-flex align-center ga-3 topbar__controls">
              <v-text-field
                class="topbar__search"
                name="floor-search"
                type="search"
                autocomplete="off"
                spellcheck="false"
                :placeholder="floorOps.searchPlaceholder"
                :aria-label="floorOps.searchPlaceholder"
                prepend-inner-icon="search"
                variant="solo"
                flat
                hide-details
              />

              <button class="topbar__ai" type="button" aria-label="Ask the assistant">
                <img :src="aiSparkleUrl" alt="" width="24" height="24">
              </button>
            </div>

            <v-btn class="topbar__submit text-none" variant="flat" rounded="pill">
              <template #prepend>
                <v-icon icon="workOrder" size="18" />
              </template>
              Submit Work
            </v-btn>
          </div>

          <div class="d-flex align-center ga-4">
            <div class="d-flex align-center ga-3">
              <v-btn
                class="topbar__tool"
                icon
                size="40"
                variant="flat"
                :aria-label="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
                @click="toggleTheme"
              >
                <v-icon :icon="isDark ? 'light' : 'night'" size="20" />
              </v-btn>

              <v-btn class="topbar__tool" icon size="40" variant="flat" aria-label="Messages">
                <v-icon icon="chat" size="20" />
              </v-btn>
            </div>

            <v-menu>
              <template #activator="{ props: menu }">
                <v-btn v-bind="menu" class="topbar__user text-none px-0" variant="text" height="36">
                  <div class="d-flex align-center ga-2">
                    <!-- `tertiary` (#64A179) is the identity green; the status greens
                         (`success`) stay reserved for state, per vuetify-ds. -->
                    <v-avatar color="tertiary" size="36">
                      <span class="topbar__initials">{{ floorOps.user.initials }}</span>
                    </v-avatar>
                    <div class="text-start d-none d-md-block topbar__identity">
                      <div class="d-flex align-center ga-2">
                        <span class="topbar__name">{{ floorOps.user.name }}</span>
                        <v-icon icon="chevronDown" size="16" />
                      </div>
                      <div class="topbar__role">{{ floorOps.user.role }}</div>
                    </div>
                  </div>
                </v-btn>
              </template>
              <v-list>
                <v-list-item title="Account settings" />
                <v-list-item title="Sign out" />
              </v-list>
            </v-menu>
          </div>
        </div>
      </div>
    </v-app-bar>

    <!-- ── Icon rail. Figma: 56 wide, 40px targets on a 48px pitch, 8px inset. ── -->
    <!-- border="0": Vuetify draws a divider on the drawer's edge by default, and
         the design has no rule between the rail and the content. -->
    <v-navigation-drawer permanent :width="56" color="background" border="0">
      <div class="d-flex flex-column align-center h-100 px-2 py-2 ga-2">
        <v-btn
          v-for="item in floorOps.nav"
          :key="item.id"
          icon
          size="40"
          variant="text"
          :active="item.id === activeNavId"
          :aria-label="item.label"
          :aria-current="item.id === activeNavId ? 'page' : undefined"
          @click="activeNavId = item.id"
        >
          <v-icon :icon="item.icon" size="20" />
        </v-btn>

        <v-spacer />

        <v-btn icon size="40" variant="text" aria-label="Settings">
          <v-icon icon="settings" size="20" />
        </v-btn>
      </div>
    </v-navigation-drawer>

    <v-main id="floor-main" class="ops-main">
      <!-- The visible hall name lives inside a menu control, so the document's
           heading is stated here rather than fought into the button. -->
      <h1 class="visually-hidden">{{ hall.name }} — live floor operations</h1>

      <div class="ops-layout">
        <!-- ── Detail rail ──────────────────────────────────────────────────
             Two detail views over one selection, not two panels: the fleet
             roster and the mission it belongs to answer different questions
             about the same floor, and the rail is only 350 wide. Switching is a
             segmented control rather than a second column so the plan keeps the
             space it needs to stay the anchor of the screen. -->
        <div v-if="panelOpen" class="ops-layout__rail d-flex flex-column ga-3">
          <div class="rail-toggle" role="group" aria-label="Detail view">
            <button
              class="rail-toggle__seg"
              :class="{ 'rail-toggle__seg--on': railTab === 'fleet' }"
              type="button"
              :aria-pressed="railTab === 'fleet'"
              @click="railTab = 'fleet'"
            >
              <v-icon icon="vehicle" size="16" />Fleet
            </button>
            <button
              class="rail-toggle__seg"
              :class="{ 'rail-toggle__seg--on': railTab === 'tasks' }"
              type="button"
              :aria-pressed="railTab === 'tasks'"
              @click="railTab = 'tasks'"
            >
              <v-icon icon="workOrder" size="16" />Tasks
              <!-- The live emergency count rides the tab itself: an urgent job
                   raised while the operator is on another view has to be
                   visible without switching to find it. Icon + number, and the
                   word is on the chip's accessible name. -->
              <span
                v-if="fleet.queuedByPriority.emergency > 0"
                class="rail-toggle__badge tabular"
                :aria-label="`${fleet.queuedByPriority.emergency} emergency tasks live`"
              >{{ fleet.queuedByPriority.emergency }}</span>
            </button>
            <button
              class="rail-toggle__seg"
              :class="{ 'rail-toggle__seg--on': railTab === 'mission' }"
              type="button"
              :aria-pressed="railTab === 'mission'"
              @click="railTab = 'mission'"
            >
              <v-icon icon="cube" size="16" />Mission
            </button>
          </div>

          <FleetPanel
            v-if="railTab === 'fleet'"
            class="ops-layout__panel"
            :robots="fleet.robots"
            :selected-id="selectedVehicleId"
            :paused="fleet.paused"
            :rate="fleet.rate"
            :tasks-completed="fleet.tasksCompleted"
            :tasks-queued="fleet.tasksQueued"
            :network-fault="fleet.networkFault"
            @select="selectVehicle"
            @toggle-pause="fleet.togglePaused()"
            @cycle-rate="fleet.cycleRate()"
            @close="panelOpen = false"
          />

          <TaskPanel
            v-else-if="railTab === 'tasks'"
            class="ops-layout__panel"
            :tasks="fleet.tasks"
            :queued-by-priority="fleet.queuedByPriority"
            :events="fleet.events"
            :metrics="fleet.metrics"
            :selected-robot-id="selectedVehicleId"
            :stale="!feedIsLive"
            @select-robot="selectVehicle"
            @raise-emergency="raiseEmergency"
            @close="panelOpen = false"
          />

          <MissionPanel
            v-else
            v-model:edit-mode="editMode"
            v-model:location="location"
            class="ops-layout__panel"
            :mission="mission"
            :location-options="floorOps.locationOptions"
            :stale="!feedIsLive"
            @close="panelOpen = false"
            @toggle-vehicle="toggleVehicle"
            @select-stop="selectStop"
          />
        </div>

        <!-- ── The floor plan: this screen's anchor ── -->
        <!-- No `section-panel` here. That class is the 24px outer-panel tier and
           pins its radius with !important, but the design puts this container on
           the 8px step — so the radius is set in the scoped block instead. -->
      <section ref="mapRegion" class="ops-layout__map pa-4 d-flex flex-column ga-3">
          <header class="d-flex align-center flex-wrap ga-3">
            <!-- headline-small IS 24px/32px/0 tracking. No weight class — the
                 scale's own 400 is what the design asks for. -->
            <!-- `my-0`, not `mb-0`: `align-center` centres each item's MARGIN box,
                 so zeroing only the bottom margin left the h2's UA top margin to
                 push the text half its height below the row's centre line. -->
            <h2 class="text-headline-small my-0">{{ hall.name }}</h2>

            <!-- The chevron is its OWN bordered control, not an append-icon on a
                 button wrapping the title — the design boxes the arrow alone. It
                 therefore needs its own accessible name, since the title beside
                 it is no longer part of the button. -->
            <v-menu>
              <template #activator="{ props: menu }">
                <v-btn
                  v-bind="menu"
                  class="ops-hall-toggle"
                  variant="text"
                  icon="chevronDown"
                  :aria-label="`Change production hall — currently ${hall.name}`"
                /></template>
              <v-list>
                <v-list-item
                  v-for="opt in floorOps.hallOptions"
                  :key="opt.id"
                  :active="opt.id === hall.id"
                  :title="opt.name"
                  @click="hall = opt"
                />
              </v-list>
            </v-menu>

            <v-spacer />

            <v-btn
              v-if="!panelOpen"
              class="text-none"
              variant="tonal"
              size="small"
              @click="panelOpen = true"
            >
              Show mission
            </v-btn>

            <!-- The counters are their own group so they can sit tighter (8px)
                 than the header's 12px rhythm, without pulling the Live chip in
                 with them — it is a different kind of thing and keeps its
                 distance. -->
            <div class="d-flex align-center ga-2">
              <v-chip
                v-for="c in counters"
                :key="c.id"
                class="tabular ops-chip"
                variant="outlined"
                size="large"
                :color="c.tone"
                :aria-label="`${c.value} ${c.label}`"
              >
                <template #prepend>
                  <AppIcon :name="c.icon" class="me-2" />
                </template>
                {{ c.value }}
              </v-chip>
            </div>

            <!-- Freshness. Word + icon, and it degrades on its own. -->
            <!-- The brand gradient is applied ONLY while the feed is live. A
                 stale or dropped feed keeps its own status colour, because a
                 frozen view that still wears the "live" treatment is exactly the
                 failure CLAUDE.md's first domain rule exists to prevent. -->
            <v-chip
              variant="flat"
              size="large"
              :class="{ 'ops-live': feedStatus === 'live' }"
              :color="feedPresentation.color"
              :aria-label="`Telemetry feed: ${feedPresentation.label}`"
            >
              <template #prepend>
                <AppIcon :name="feedPresentation.icon" class="me-2" />
              </template>
              {{ feedPresentation.label }}
            </v-chip>
          </header>

          <!-- 2D and 3D are two renderers over ONE simulation. Both read the
               same `fleet.robots`, the same `robotRoute` and the same
               `selectedVehicleId`, and neither owns any of it — so switching
               swaps the visualisation and nothing else. Robot positions, routes,
               tasks and states all live in the simulation layer and are
               untouched by the toggle. Neither renderer contains any warehouse
               behaviour; they only draw what the simulation has decided. -->
          <div class="ops-layout__canvas">
            <FloorMap
              v-if="mapView === '2d'"
              :map="floorOps.map"
              :vehicles="fleet.robots"
              :cranes="fleet.cranes"
              :robot-route="robotRoute"
              :route-priority="routePriority"
              :emergency-marks="emergencyMarks"
              :feed-status="feedStatus"
              :zoom="zoom"
              :selected-vehicle-id="selectedVehicleId"
              @select-vehicle="selectVehicle"
            />
            <WarehouseViewer
              v-else
              :map="floorOps.map"
              :vehicles="fleet.robots"
              :cranes="fleet.cranes"
              :chargers="fleet.chargers"
              :traffic="fleet.traffic"
              :show-traffic="showTraffic"
              :robot-route="robotRoute"
              :route-priority="routePriority"
              :emergency-marks="emergencyMarks"
              :zoom="zoom"
              :selected-vehicle-id="selectedVehicleId"
              @select-vehicle="selectVehicle"
              @select-object="notify(`Selected ${$event}`)"
            />
          </div>

          <!-- Figma 6485:103411 — 32 high, radius 8, `background` fill, hairline
               border. The active 2D segment carries its own blue gradient. -->
          <footer class="d-flex align-end justify-space-between">
            <div class="map-toggle" role="group" aria-label="Floor plan view">
              <button
                class="map-toggle__seg"
                :class="{ 'map-toggle__seg--on': mapView === '2d' }"
                type="button"
                :aria-pressed="mapView === '2d'"
                @click="mapView = '2d'"
              >
                <v-icon icon="layers" size="16" />2D
              </button>
              <button
                class="map-toggle__seg"
                :class="{ 'map-toggle__seg--on': mapView === '3d' }"
                type="button"
                :aria-pressed="mapView === '3d'"
                @click="mapView = '3d'"
              >
                <v-icon icon="cube" size="16" />3D
              </button>
            </div>

            <div class="d-flex align-center ga-2">
              <!-- ⚠️ 3D ONLY, and hidden rather than disabled in 2D. The overlay
                   is a floor decal built by `trafficLayer.ts`; the SVG map has no
                   equivalent, and a control that silently does nothing in one of
                   two views is worse than one that is not offered. `aria-pressed`
                   carries the state, so it is never colour alone. -->
              <button
                v-if="mapView === '3d'"
                class="map-ctl"
                :class="{ 'map-ctl--on': showTraffic }"
                type="button"
                :aria-pressed="showTraffic"
                aria-label="Traffic overlay"
                @click="showTraffic = !showTraffic"
              >
                <v-icon icon="route" size="16" />
              </button>
              <button class="map-ctl" type="button" aria-label="Zoom in" @click="zoomBy(0.25)">
                <v-icon icon="plus" size="16" />
              </button>
              <button class="map-ctl" type="button" aria-label="Zoom out" @click="zoomBy(-0.25)">
                <v-icon icon="minus" size="16" />
              </button>
              <button class="map-ctl" type="button" aria-label="Full screen floor plan" @click="toggleFullscreen">
                <v-icon icon="maximize" size="16" />
              </button>
            </div>
          </footer>
        </section>
      </div>
    </v-main>

    <!-- Screen-local toasts (CLAUDE.md). The live region is what makes an alert
         raised by selecting a vehicle audible to a screen reader. -->
    <v-snackbar v-model="snack.show" :color="snack.color" location="bottom right">
      <span role="status" aria-live="polite">{{ snack.text }}</span>
    </v-snackbar>
  </v-app>
</template>

<style scoped>
/* Reachable by keyboard, out of the way for everyone else. */
.skip-link {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 3000;
  padding: 0.5rem 1rem;
  background-color: rgb(var(--v-theme-surface-bright));
  color: rgb(var(--v-theme-on-surface));
  transform: translateY(-150%);
}

.skip-link:focus-visible {
  transform: translateY(0);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* Counts sit side by side in the header — align the digits. */
.tabular {
  font-variant-numeric: tabular-nums;
}

/* ── Top bar ────────────────────────────────────────────────────────────────
   Explicit pixel values below are deliberate: the header was specced against a
   reference and these are box dimensions, not DS scale steps. Colour comes from
   theme tokens only, and the gaps between elements are utility classes in the
   template — nothing here re-implements spacing or colour. */

/* 463 is the design width and stays the CEILING, not a floor.
   ⚠️ IT USED TO BE `flex: 0 0 463px` AND THAT CLIPPED THE OPERATOR'S OWN NAME.
   The bar's two groups were both `flex-shrink-0`, so below about 1400px the row
   was wider than the viewport and the overflow fell off the right-hand end —
   the account block rendered as "Rob…/Adm…" with the menu chevron cut away, on
   exactly the 1280-wide ruggedized tablets this screen is built for. The search
   field is the one element here with slack in it, so it is the one that gives. */
.topbar__search {
  flex: 0 1 463px;
  width: 463px;
  min-width: 180px;
}

/* Field shell: surface fill + 1px hairline, radius 99. Vuetify's `solo` variant
   supplies no border of its own, which is why it is drawn here. */
.topbar__search :deep(.v-field) {
  height: 44px;
  padding-inline: 20px;
  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgb(var(--v-theme-outline-variant));
  border-radius: 99px;
  box-shadow: none;
}

.topbar__search :deep(.v-field__input) {
  min-height: 42px;
  padding: 0;
  font-size: 14px;
  line-height: 20px;
}

/* The magnifier sits directly on the field — no filled plate behind it. */
.topbar__search :deep(.v-field__prepend-inner) {
  padding: 0;
  margin-inline-end: 12px;
  align-items: center;
  background: none;
}

.topbar__search :deep(.v-field__prepend-inner .v-icon) {
  font-size: 16px;
  color: rgb(var(--v-theme-on-surface-weak));
  opacity: 1;
}

.topbar__search :deep(input::placeholder) {
  color: rgb(var(--v-theme-on-surface-weak));
  opacity: 1;
}

/* Assistant sweep, exactly as authored in the design file. */
.topbar__ai {
  display: flex;
  align-items: center;
  padding: 10px;
  /* Gradient only — no outline. The UA's default button border is what was
     showing as a faint ring. */
  border: none;
  border-radius: 99px;
  background-image: linear-gradient(
    -52.56deg,
    rgb(var(--v-theme-primary-accent)) 10.598%,
    rgb(var(--v-theme-secondary-accent)) 112.23%
  );
}

.topbar__ai:focus-visible {
  outline: 2px solid rgb(var(--v-theme-on-surface));
  outline-offset: 2px;
}

/* Recessed circle: the bar sits on `surface`, so `background` reads as darker. */
.topbar__tool {
  background-color: rgb(var(--v-theme-background));
  border: 1px solid rgb(var(--v-theme-outline-variant));
}

.topbar__submit {
  height: 40px;
  padding-inline: 16px;
  background-color: rgb(var(--v-theme-primary-bright));
  /* Figma `Primary/text strong` (#020D20) — dark ink on the bright CTA, for both
     the label and the icon, which inherits it. */
  color: rgb(var(--v-theme-background));
  font-size: 14px;
  font-weight: 500;
  line-height: 16px;
  letter-spacing: 0;
}

/* The right-hand group shrinks; the account block inside it does not.
   ⚠️ `min-width: 0` ON EVERY CONTAINER IN THE CHAIN, not just the outer one —
   that is the whole fix and it is easy to get half right. A flex item defaults
   to `min-width: auto`, which refuses to shrink below its CONTENT, so a single
   un-zeroed wrapper anywhere between the bar and the search field pins the
   search at its full 463px and the overflow reappears further along the row.
   The search itself keeps a 180px floor so it never collapses to an icon. */
.topbar__group,
.topbar__controls {
  min-width: 0;
  flex-shrink: 1;
}

/* Account block: 2px between the name row and the role. */
.topbar__identity {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.topbar__initials {
  font-size: 14px;
  font-weight: 400;
  line-height: 16px;
}

.topbar__name {
  font-size: 14px;
  font-weight: 500;
  line-height: 16px;
  color: rgb(var(--v-theme-on-surface));
}

.topbar__role {
  font-size: 12px;
  font-weight: 400;
  line-height: 14px;
  color: rgb(var(--v-theme-on-surface-weak));
}

/* `min-height`, not `height` — see `.ops-layout` below for why. */
.ops-main {
  min-height: 100vh;
}

/* Figma frame 1010109366: rail 56 · sidebar 350 · 12 gap · map 1005 · 16 right
   margin · 8 bottom. The rail is the v-navigation-drawer, so this grid starts
   at the sidebar. */
.ops-layout {
  display: grid;
  grid-template-columns: 350px minmax(0, 1fr);
  gap: 12px;
  padding: 0 16px 8px 0;
  /* ⚠️ `min-height`, not `height`. On a panel much wider than the building's own
     aspect ratio, `FloorMap.vue`'s plan is width-locked and its height can
     legitimately exceed one screen's worth of vertical space (see the note on
     `.floor-map__svg`) — a fixed `height` here would clip that, which is exactly
     the empty-side-margins bug this pairs with. `min-height` keeps the console
     filling exactly one screen in the normal case (nothing to grow into) and
     lets it grow — and the page scroll — only when the plan genuinely needs
     more room. Same pattern the sub-1280px breakpoint below already uses. */
  min-height: calc(100vh - 76px);
}

/* ── The detail rail's view switch ──────────────────────────────────────────
   Same segmented control as the 2D/3D toggle under the plan, so "which view am
   I in" looks the same wherever it is asked. */
.rail-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  height: 32px;
  padding-right: 4px;
  border: 1px solid rgb(var(--v-theme-outline-variant));
  border-radius: var(--radius-md);
  background-color: rgb(var(--v-theme-background));
}

.rail-toggle__seg {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  flex: 1 1 0;
  height: 100%;
  padding: 6px;
  border-radius: var(--radius-md);
  font-size: 14px;
  line-height: 20px;
  color: rgb(var(--v-theme-on-surface-weak));
  appearance: none;
  border: none;
  background: none;
  font-family: inherit;
  cursor: pointer;
}

.rail-toggle__seg--on {
  color: rgb(var(--v-theme-on-surface));
  background-image: linear-gradient(
    129.73deg,
    rgb(var(--v-theme-primary)) 17.176%,
    rgb(var(--v-theme-primary-deep)) 100%
  );
}

.rail-toggle__seg--on .v-icon { opacity: 0.6; }

/* Live emergency count on the Tasks tab. Sits on the segment rather than in the
   panel because its whole job is to be seen from the OTHER two views. */
.rail-toggle__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: var(--radius-sm);
  background-color: rgb(var(--v-theme-error));
  color: rgb(var(--v-theme-background));
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.rail-toggle__seg:focus-visible {
  outline: 2px solid rgb(var(--v-theme-on-surface));
  outline-offset: 2px;
}

/* Whichever panel is showing takes the height the toggle leaves. */
.ops-layout__panel {
  flex: 1 1 auto;
  min-height: 0;
}

.ops-layout__rail {
  /* NOT a scroll container. The rail already has one: `.rail__mission` is
     `flex: 1 0 0` + `overflow-y: auto`, so it absorbs the leftover height and
     scrolls its own content. Making this column scroll as well just stacked a
     second, unstyled native scrollbar (arrows and all) alongside the styled one.
     Nothing is clipped by this — the only fixed-height sibling above the mission
     card is the scope card, and the card flexes to whatever is left. */
  overflow: hidden;
  min-height: 0;
}

/* ── Map panel header ────────────────────────────────────────────────────── */

/* Forcing width/height alone is not enough to centre the glyph: VBtn keeps the
   min-width and horizontal padding from its size variant, so the content box
   stays wider than the square we drew and the icon settles off-centre inside it.
   Zero both, then let the content flexbox do the centring against the real box. */
.ops-hall-toggle.v-btn {
  width: 28px;
  height: 28px;
  min-width: 28px;
  padding: 0;
  border: 1px solid rgb(var(--v-theme-outline-variant)); /* #2E3849 */
  border-radius: var(--radius-sm);
}

.ops-hall-toggle.v-btn :deep(.v-btn__content) {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.ops-hall-toggle.v-btn :deep(.v-icon) {
  margin: 0;
  font-size: 16px;
}

/* `outlined` rather than `tonal`: the chips carry a flat background and a neutral
   hairline, but their icon and value stay in the status colour, so severity is
   still readable without the fill. */
.ops-chip.v-chip {
  border-color: rgb(var(--v-theme-outline-medium)); /* #5F6877 */
  background-color: rgb(var(--v-theme-background)); /* #020D20 */
}

/* Brand gradient. `background-image` beats the `color` prop's background-color
   without needing !important, and leaves the chip's own text colour intact. */
.ops-live.v-chip {
  background-image: linear-gradient(
    135deg,
    rgb(var(--v-theme-primary)) 0%,
    rgb(var(--v-theme-primary-violet)) 100%
  );
  /* Dark ink on the bright gradient. Scoped to `.ops-live`, so a stale or dropped
     feed keeps its own foreground along with its own fill. The icon rides
     currentColor, so it follows without a second rule. */
  color: rgb(var(--v-theme-background)); /* #020D20 */
}

.ops-layout__map {
  min-width: 0;
  min-height: 0;
  /* #7F8692 @ 16% — the same translucent grey the rail's panels use, already
     published as a var so the two can't drift apart. */
  border: 1px solid var(--neutral-bg-hover);
  border-radius: var(--radius-md); /* 8px — the content tier, not the 24px section tier */
  /* ⚠️ THE FRAME IS THE APP'S `background`, AND IT STAYS THERE. This was briefly
     a light neutral of its own and it was the wrong surface to move: the dark
     navy frame is what the whole console's chrome is built on, so lifting it
     detached the map from the top bar and the rail around it. What the plan
     needed was a lighter FLOOR, not lighter paper — that is `map-floor`, set on
     `.hall` in FloorMap.vue, and it is the only thing that changed. */
  background-color: rgb(var(--v-theme-background));
  /* Dot grid. A background-image rather than a pseudo-element, so it paints over
     the fill and under every child automatically — the plan needs no z-index.
     ⚠️ The 24px pitch is NOT from Figma: the Warehouse frame is too large for
     get_design_context to return, and black at 9% over #020D20 is too faint to
     measure off a screenshot. The colour and dot size are as specified; the
     spacing is the DS's own 24px step. Correct it if the file says otherwise. */
  background-image: radial-gradient(rgba(0, 0, 0, 0.09) 1px, transparent 1px);
  background-size: 24px 24px;
}

/* Same UA-chrome reset as MissionPanel: the map controls and the AI button are
   hand-rolled <button>s, so Chrome's default outset border sits under them. */
:where(.topbar, .map-toggle, .ops-layout__map) :where(button) {
  appearance: none;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

/* ── Map controls (Figma 6485:103411) ── */
.map-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 32px;
  padding-right: 4px;
  border: 1px solid rgb(var(--v-theme-outline-variant));
  border-radius: 8px;
  background-color: rgb(var(--v-theme-background));
}

.map-toggle__seg {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 100%;
  padding: 6px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 20px;
  color: rgb(var(--v-theme-on-surface-weak));
}

.map-toggle__seg--on {
  color: rgb(var(--v-theme-on-surface));
  background-image: linear-gradient(
    129.73deg,
    rgb(var(--v-theme-primary)) 17.176%,
    rgb(var(--v-theme-primary-deep)) 100%
  );
}

/* The active segment's icon is held back so the label leads. */
.map-toggle__seg--on .v-icon { opacity: 0.6; }

.map-ctl {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border: 1px solid rgb(var(--v-theme-outline-variant));
  border-radius: 8px;
  background-color: rgb(var(--v-theme-background));
  color: rgb(var(--v-theme-on-surface));
}

.map-ctl:hover { background-color: var(--neutral-bg); }

/* A pressed toggle. The border weight changes with the fill, so the on state is
   readable without relying on the colour — the same rule the vehicle markers
   follow, and the reason `aria-pressed` carries it for assistive tech too. */
.map-ctl--on {
  border-color: rgb(var(--v-theme-primary-bright));
  background-color: rgba(var(--v-theme-primary-bright), 0.16);
  color: rgb(var(--v-theme-primary-bright));
}

.map-toggle__seg:focus-visible,
.map-ctl:focus-visible {
  outline: 2px solid rgb(var(--v-theme-on-surface));
  outline-offset: 2px;
}

/* The drawing gets whatever vertical space the header and footer leave. */
.ops-layout__canvas {
  flex: 1 1 auto;
  min-height: 0;
}

/* Below a laptop the rail stops being a column and stacks above the plan. */
@media (max-width: 1279px) {
  .ops-layout {
    grid-template-columns: minmax(0, 1fr);
    height: auto;
  }

  .ops-layout__canvas {
    min-height: 60vh;
  }
}
</style>
