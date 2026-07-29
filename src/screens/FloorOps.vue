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
  import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
  import { useTheme } from 'vuetify'
  import AppIcon from '@/components/AppIcon.vue'
  import FloorMap from '@/components/FloorMap.vue'
  import MissionPanel from '@/components/MissionPanel.vue'
  import { brand } from '@/data/brand'
  import { floorOps, type FeedStatus, type SiteFloor } from '@/data/floorOps'
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
  const zoom = ref(1)
  const mapView = ref<'2d' | '3d'>('2d')
  const selectedVehicleId = ref<string | null>(floorOps.mission.vehicles[0]?.id ?? null)
  const activeNavId = ref('missions')

  // ── Feed freshness ─────────────────────────────────────────────────────────
  // Binding domain rule: never present stale telemetry as live. The age below is
  // the single source for that, and it really does climb — the header degrades on
  // its own if frames stop arriving.
  //
  // ⚠️ There is no telemetry socket yet. `receiveFrame()` stands in for one on a
  // timer so the mechanism is exercised end-to-end; wiring src/api/ replaces the
  // interval with real frames and nothing else here changes.
  const feedAge = ref(floorOps.feed.ageSeconds)
  const staleAfter = floorOps.feed.staleAfterSeconds
  let ageTimer: number | undefined
  let frameTimer: number | undefined

  function receiveFrame () {
    feedAge.value = 0
  }

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
    ageTimer = window.setInterval(() => { feedAge.value += 1 }, 1000)
    frameTimer = window.setInterval(receiveFrame, 4000)
  })
  onBeforeUnmount(() => {
    window.clearInterval(ageTimer)
    window.clearInterval(frameTimer)
  })

  // ── Hall counters. Each carries a word, not just an icon and a number. ──────
  const counters = computed(() => [
    { id: 'people', icon: 'userMultiple', value: hall.value.peopleOnFloor, label: 'people on floor' },
    { id: 'vehicles', icon: 'vehicle', value: hall.value.vehiclesActive, label: 'vehicles active' },
    { id: 'alerts', icon: 'alert', value: hall.value.openAlerts, label: 'open alerts', tone: 'error' },
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
    const onMap = floorOps.map.vehicles.find(v => v.id === id)
    if (onMap?.alert) notify(`${onMap.code}: ${onMap.alert}`, 'warning')
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

        <div class="d-flex align-center flex-shrink-0">
          <div class="d-flex align-center ga-3 px-6">
            <div class="d-flex align-center ga-3">
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
        <!-- ── Mission detail rail ── -->
        <MissionPanel
          v-if="panelOpen"
          v-model:edit-mode="editMode"
          v-model:location="location"
          class="ops-layout__rail"
          :mission="mission"
          :location-options="floorOps.locationOptions"
          :stale="!feedIsLive"
          @close="panelOpen = false"
          @toggle-vehicle="toggleVehicle"
          @select-stop="selectStop"
        />

        <!-- ── The floor plan: this screen's anchor ── -->
        <!-- No `section-panel` here. That class is the 24px outer-panel tier and
           pins its radius with !important, but the design puts this container on
           the 8px step — so the radius is set in the scoped block instead. -->
      <section ref="mapRegion" class="ops-layout__map pa-4 d-flex flex-column ga-3">
          <header class="d-flex align-center flex-wrap ga-3">
            <v-menu>
              <template #activator="{ props: menu }">
                <v-btn v-bind="menu" class="text-none px-2" variant="text" append-icon="chevronDown">
                  <!-- headline-small IS 24px/32px/0 tracking. No weight class —
                       the scale's own 400 is what the design asks for. -->
                  <span class="text-headline-small">{{ hall.name }}</span>
                </v-btn>
              </template>
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

            <v-chip
              v-for="c in counters"
              :key="c.id"
              class="tabular"
              variant="tonal"
              size="large"
              :color="c.tone"
              :aria-label="`${c.value} ${c.label}`"
            >
              <template #prepend>
                <AppIcon :name="c.icon" class="me-2" />
              </template>
              {{ c.value }}
            </v-chip>

            <!-- Freshness. Word + icon, and it degrades on its own. -->
            <v-chip
              variant="flat"
              size="large"
              :color="feedPresentation.color"
              :aria-label="`Telemetry feed: ${feedPresentation.label}`"
            >
              <template #prepend>
                <AppIcon :name="feedPresentation.icon" class="me-2" />
              </template>
              {{ feedPresentation.label }}
            </v-chip>
          </header>

          <div class="ops-layout__canvas">
            <FloorMap
              :map="floorOps.map"
              :feed-status="feedStatus"
              :zoom="zoom"
              :view="mapView"
              :selected-vehicle-id="selectedVehicleId"
              @select-vehicle="selectVehicle"
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

.topbar__search {
  flex: 0 0 463px;
  width: 463px;
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

.ops-main {
  height: 100vh;
}

/* Figma frame 1010109366: rail 56 · sidebar 350 · 12 gap · map 1005 · 16 right
   margin · 8 bottom. The rail is the v-navigation-drawer, so this grid starts
   at the sidebar. */
.ops-layout {
  display: grid;
  grid-template-columns: 350px minmax(0, 1fr);
  gap: 12px;
  padding: 0 16px 8px 0;
  /* Keep in step with the v-app-bar height above (16 top inset + 60 navigation). */
  height: calc(100vh - 76px);
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

.ops-layout__map {
  min-width: 0;
  min-height: 0;
  /* #7F8692 @ 16% — the same translucent grey the rail's panels use, already
     published as a var so the two can't drift apart. */
  border: 1px solid var(--neutral-bg-hover);
  border-radius: var(--radius-md); /* 8px — the content tier, not the 24px section tier */
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
