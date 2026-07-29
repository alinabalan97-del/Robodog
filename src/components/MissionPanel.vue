<script setup lang="ts">
  /**
   * MissionPanel.vue — the detail rail beside the floor plan.
   *
   * Transcribed from Figma node 6477:83204. Numbers in the styles below are the
   * design's, not estimates: panel radii 12/8, gaps 10/16/8, chip padding 8 and
   * 4/8, tiles 42, card 204 high. Colour comes from theme tokens plus the three
   * documented `--neutral-bg*` alphas in overrides.css — no raw hex here.
   *
   * Section headings run in Archivo SemiBold ($heading-font-family) per the
   * design's type ramp; body copy stays Inter.
   *
   * It renders one mission; it does not dispatch, halt or reroute anything, so
   * nothing here is a physical-world command. If a command is added it must
   * confirm by naming the vehicle or mission affected (CLAUDE.md → Domain rules).
   */
  import { computed } from 'vue'
  import type { Mission, SiteFloor } from '@/data/floorOps'
  import stopTileUrl from '@/assets/stop-tile.svg'
  import stopTileActiveUrl from '@/assets/stop-tile-active.svg'

  const props = defineProps<{
    mission: Mission
    location: SiteFloor
    locationOptions: SiteFloor[]
    editMode: boolean
    /** Live figures are dimmed when the feed is not current. */
    stale: boolean
  }>()

  const emit = defineEmits<{
    close: []
    'update:editMode': [value: boolean]
    'update:location': [value: SiteFloor]
    toggleVehicle: [id: string]
    selectStop: [id: string]
  }>()

  /** Fraction of the strip already travelled, for the scroll indicator. */
  const stopProgress = computed(() => {
    const i = props.mission.stops.findIndex(s => s.id === props.mission.currentStopId)
    return i < 0 ? 0 : (i + 1) / props.mission.stops.length
  })

  async function copyMissionId () {
    try {
      await navigator.clipboard.writeText(props.mission.id)
    } catch {
      // Clipboard can be blocked by permissions; the id stays visible either way.
    }
  }
</script>

<template>
  <div class="rail d-flex flex-column">
    <!-- ── Scope panel ── -->
    <section class="rail__scope">
      <header class="d-flex align-center justify-space-between">
        <h2 class="rail__panel-title">Reported operations</h2>
        <button class="rail__ghost-btn" type="button" aria-label="Reported operations options">
          <v-icon icon="overflow" size="16" />
        </button>
      </header>

      <v-menu>
        <template #activator="{ props: menu }">
          <button v-bind="menu" class="rail__location" type="button">
            <v-icon icon="location" size="20" class="rail__location-pin" />
            <span class="rail__location-inner">
              <span class="rail__location-site">{{ location.site }}</span>
              <span class="rail__floor-chip">{{ location.floor }}</span>
              <v-icon icon="chevronDown" size="20" />
            </span>
          </button>
        </template>
        <v-list>
          <v-list-item
            v-for="opt in locationOptions"
            :key="opt.id"
            :active="opt.id === location.id"
            :title="opt.site"
            :subtitle="opt.floor"
            @click="emit('update:location', opt)"
          />
        </v-list>
      </v-menu>
    </section>

    <!-- ── Mission panel ── -->
    <section class="rail__mission">
      <div class="d-flex align-start ga-2">
        <div class="flex-grow-1">
          <div class="rail__eyebrow">Misson #</div>
          <div class="d-flex align-center ga-2 mt-2">
            <span class="rail__mission-id" translate="no">{{ mission.id }}</span>
            <button
              class="rail__icon-plain"
              type="button"
              :aria-label="`Copy mission number ${mission.id}`"
              @click="copyMissionId"
            >
              <v-icon icon="copy" size="16" />
            </button>
          </div>
        </div>
        <button class="rail__round-btn" type="button" aria-label="Close mission details" @click="emit('close')">
          <v-icon icon="close" size="20" />
        </button>
      </div>

      <!-- Edit mode is a view toggle, not a floor command -->
      <button
        class="rail__edit"
        type="button"
        :aria-pressed="editMode"
        @click="emit('update:editMode', !editMode)"
      >
        <span class="rail__edit-label">Edit mode</span>
        <span class="rail__edit-rule" aria-hidden="true" />
        <v-icon icon="edit" size="20" />
      </button>

      <!-- Readings. Each figure names its unit. -->
      <div class="rail__chips" :class="{ 'rail--stale': stale }">
        <div class="d-flex ga-2">
          <span class="rail__chip">
            <v-icon icon="battery" size="16" />
            Battery level: {{ mission.batteryPct }}%
          </span>
          <span class="rail__chip">
            <v-icon icon="package" size="18" />
            Delivered: {{ mission.deliveredCount }}/{{ mission.deliveryTotal }}
          </span>
        </div>
        <span class="rail__chip rail__chip--lead">
          <span class="rail__chip-tile"><v-icon icon="route" size="18" /></span>
          Mission type: {{ mission.type }}
        </span>
      </div>

      <!-- Vehicles assigned to this mission -->
      <div>
        <h3 class="rail__section-title">Vehicles in work</h3>

        <div v-if="!mission.vehicles.length" class="rail__empty">
          No vehicles assigned yet. Assign one to start this mission.
        </div>

        <div
          v-for="v in mission.vehicles"
          :key="v.id"
          class="rail__vehicle"
          :class="{ 'rail__vehicle--assigned': v.assigned }"
        >
          <img v-if="v.imageUrl" :src="v.imageUrl" alt="" class="rail__vehicle-photo">

          <div class="rail__vehicle-badges">
            <span class="rail__badge rail__badge--payload">{{ v.payloadKg }}kg</span>
            <span class="rail__badge rail__badge--slot">
              <span class="rail__badge-dot" aria-hidden="true" />#{{ v.slot }}
            </span>
          </div>

          <button class="rail__vehicle-menu" type="button" :aria-label="`Options for vehicle ${v.code}`">
            <v-icon icon="overflowVertical" size="16" />
          </button>

          <span class="rail__vehicle-name" translate="no">{{ v.name }}</span>

          <button
            class="rail__vehicle-check"
            type="button"
            role="switch"
            :aria-checked="v.assigned"
            :aria-label="`Assign ${v.name} to mission ${mission.id}`"
            @click="emit('toggleVehicle', v.id)"
          >
            <v-icon v-if="v.assigned" icon="check" size="16" />
          </button>
        </div>
      </div>

      <!-- Progress between two fixed stops -->
      <div :class="{ 'rail--stale': stale }">
        <h3 class="rail__section-title mb-4">Mission state</h3>
        <div class="d-flex align-center">
          <div class="rail__endpoint">
            <span class="rail__endpoint-code" translate="no">{{ mission.progress.fromCode }}</span>
            <span class="rail__endpoint-note">{{ mission.progress.onTime ? 'On time' : 'Delayed' }}</span>
          </div>

          <div class="rail__track">
            <span class="rail__track-rail" />
            <span class="rail__track-fill" :style="{ width: `${mission.progress.fraction * 100}%` }" />
            <span class="rail__track-knob" :style="{ left: `${mission.progress.fraction * 100}%` }" />
          </div>

          <div class="rail__endpoint rail__endpoint--end">
            <span class="rail__endpoint-code" translate="no">{{ mission.progress.toCode }}</span>
            <!-- An estimate, not a measurement — said so in the label. -->
            <span class="rail__endpoint-note">+{{ mission.progress.etaDeltaMinutes }} min</span>
          </div>
        </div>
      </div>

      <!-- Stop sequence -->
      <div>
        <div class="d-flex align-center ga-2 mb-4">
          <h3 class="rail__section-title flex-grow-1 mb-0">Mission stops</h3>
          <span class="rail__current-chip">
            <v-icon icon="dotOutline" size="16" />
            Current stop: {{ mission.currentStopId }}
          </span>
        </div>

        <div class="rail__stops">
          <div class="rail__stops-strip">
            <button
              v-for="stop in mission.stops"
              :key="stop.id"
              class="rail__stop"
              type="button"
              :aria-current="stop.id === mission.currentStopId ? 'step' : undefined"
              :aria-pressed="stop.id === mission.selectedStopId"
              translate="no"
              @click="emit('selectStop', stop.id)"
            >
              <img
                :src="stop.id === mission.selectedStopId ? stopTileActiveUrl : stopTileUrl"
                alt=""
                class="rail__stop-tile"
              >
              <!-- Marks where the vehicle actually is, independent of selection. -->
              <span v-if="stop.id === mission.currentStopId" class="rail__stop-marker" aria-hidden="true" />
              <span
                class="rail__stop-label"
                :class="{ 'rail__stop-label--on-fill': stop.id === mission.selectedStopId }"
              >{{ stop.id }}</span>
            </button>
          </div>

          <div class="rail__stops-scroll">
            <span class="rail__stops-thumb" :style="{ width: `${stopProgress * 100}%` }" />
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
/*
  Strip the user-agent button chrome before anything else.

  Chrome renders a bare <button> with `border: 2px outset ButtonBorder` and a
  `ButtonFace` background. Under every hand-rolled control below that produced a
  pale, thick outline and a lighter fill the design never asked for — which is
  what made this rail read heavier and higher-contrast than Figma: the "white"
  Edit-mode border, the visible plate behind the copy icon, the oversized close
  circle and the chunky checkbox were all UA chrome, not design values.

  `:where()` keeps this at zero specificity so every class below still wins.
*/
:where(.rail) :where(button) {
  appearance: none;
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  line-height: inherit;
  text-align: inherit;
  cursor: pointer;
}

/* Figma 6477:83204: column, 10px between the two panels. */
.rail {
  gap: 10px;
  min-height: 0;
}

/* ── Scope panel (6477:83205) ── */
.rail__scope {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px 16px 12px;
  border: 1px solid var(--neutral-bg-hover);
  border-radius: 12px;
  background-color: var(--neutral-bg);
}

/* Inter, NOT Archivo. Figma's `font/family/title` is Inter; only
   `font/family/Primary` (the "Misson #" / section headings) is Archivo. */
.rail__panel-title {
  font-size: 16px;
  font-weight: 600;
  line-height: 20px;
  letter-spacing: -0.16px;
  color: rgb(var(--v-theme-on-surface));
}

/* Figma `color/grey/300` (#5F6877) for both the 1px stroke and the glyph. */
.rail__ghost-btn {
  display: flex;
  padding: 6px;
  border: 1px solid rgb(var(--v-theme-outline-medium));
  border-radius: 4px;
  color: rgb(var(--v-theme-outline-medium));
}

/* Location selector — a teal-tinted shell wrapping a recessed field. */
.rail__location {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 2px 2px 2px 8px;
  border: 1px solid rgb(var(--v-theme-secondary-deep));
  border-radius: 8px;
  background-color: rgba(var(--v-theme-secondary-deep), 0.6);
}

.rail__location-pin { color: rgb(var(--v-theme-on-surface)); }

.rail__location-inner {
  display: flex;
  flex: 1 0 0;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
  padding: 6px 12px;
  border-radius: 6px;
  background-color: rgb(var(--v-theme-background));
}

.rail__location-site {
  flex: 1 0 0;
  min-width: 0;
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  color: rgb(var(--v-theme-on-surface-weak));
  text-align: start;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rail__floor-chip {
  padding: 6px;
  border-radius: 4px;
  background-color: rgb(var(--v-theme-surface));
  font-size: 14px;
  line-height: 16px;
  color: rgb(var(--v-theme-on-surface));
}

/* ── Mission panel (6485:89614) ── */
.rail__mission {
  display: flex;
  flex: 1 0 0;
  flex-direction: column;
  gap: 16px;
  min-height: 0;
  overflow-y: auto;
  padding: 24px 16px;
  border: 1px solid var(--neutral-bg-active);
  border-radius: 8px;
  background-color: rgb(var(--v-theme-background));
  /* NO inset ring here, deliberately. Figma has `inset 0 0 0 4px` on this frame,
     but this element is also the scroll container: an inset shadow paints to the
     PADDING box, so the ring's right-hand segment lands immediately left of the
     scrollbar and reads as a divider line beside it. Removed on request — the
     1px border still frames the card. */
  /* Scrolls, but shows no scrollbar — same treatment as `.rail__stops-strip`
     below. The rail's content only just overflows, so a native bar renders as a
     near-full-height thumb: a solid grey stripe down the panel edge rather than
     anything that reads as a control. Wheel, trackpad, touch and keyboard
     scrolling are all unaffected. */
  scrollbar-width: none;
}

.rail__mission::-webkit-scrollbar { display: none; }

.rail__eyebrow {
  font-family: var(--heading-font, inherit);
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
  letter-spacing: -0.2px;
  color: rgb(var(--v-theme-on-surface-weak));
}

.rail__mission-id {
  font-size: 20px;
  font-weight: 600;
  line-height: 24px;
  letter-spacing: -0.4px;
  font-variant-numeric: tabular-nums;
  color: rgb(var(--v-theme-on-surface));
}

.rail__icon-plain { color: rgb(var(--v-theme-on-surface)); }

.rail__round-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 18px;
  background-color: var(--neutral-bg);
  color: rgb(var(--v-theme-on-surface));
}

.rail__edit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 36px;
  padding: 10px;
  border-radius: 18px;
  background-color: var(--neutral-bg);
  color: rgb(var(--v-theme-on-surface));
}

.rail__edit-label {
  padding-inline: 4px;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
}

.rail__edit-rule {
  width: 1px;
  height: 20px;
  background-color: var(--neutral-bg-active);
}

/* ── Status chips ── */
.rail__chips {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

.rail__chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px;
  border: 1px solid rgb(var(--v-theme-outline-variant));
  border-radius: 4px;
  font-size: 14px;
  line-height: 16px;
  color: rgb(var(--v-theme-on-surface));
}

.rail__chip--lead {
  gap: 8px;
  padding: 4px 8px 4px 4px;
}

.rail__chip-tile {
  display: flex;
  padding: 5px;
  border-radius: 4px;
  background-color: var(--neutral-bg-hover);
}

.rail--stale { opacity: 0.6; }

/* ── Section headings (Archivo per the design ramp) ── */
.rail__section-title {
  font-family: var(--heading-font, inherit);
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
  letter-spacing: -0.2px;
  color: rgb(var(--v-theme-on-surface-weak));
  padding-bottom: 8px;
}

.rail__empty {
  padding: 16px;
  border: 1px solid rgb(var(--v-theme-outline-variant));
  border-radius: 8px;
  font-size: 14px;
  line-height: 20px;
  color: rgb(var(--v-theme-on-surface-weak));
  text-align: center;
}

/* ── Vehicle card (6485:89785) — photo fills it, controls sit on top ──
 *
 * ⚠️ THE 12px INSET BELOW IS A DELIBERATE DEVIATION FROM FIGMA, requested
 * directly. Node 6485:89785 pins all four overlays at 9px (`left-[9px] top-[9px]`
 * and so on); the `px-[12px]` on that frame is flex padding that never applies,
 * because every child in it is absolutely positioned. We use 12px on purpose so
 * the card follows the same spacing step as the rest of the rail. Don't "fix"
 * these back to 9px on a later Figma pass without asking.
 */
.rail__vehicle {
  position: relative;
  height: 204px;
  margin-bottom: 8px;
  border: 1px solid rgb(var(--v-theme-surface-bright)); /* Figma #23406B */
  border-radius: 8px;
  overflow: hidden;
}

/* The rail stacks these with a margin rather than a gap, so the last one must
   not push the section's own spacing out. Load-bearing now that there is
   normally only one card. */
.rail__vehicle:last-child { margin-bottom: 0; }

/* `.rail__vehicle--assigned` is still bound in the template but carries NO
 * styling, on purpose. Node 6485:89785 rings the assigned card with
 * `inset 0 0 0 4px rgba(119,149,255,0.41)`; that ring sat ON TOP of the 1px
 * #23406B border and read as the card's edge, so it was removed on request —
 * the card's only edge is now that border.
 *
 * Assignment is not lost with it: the checked switch bottom-right still carries
 * the state, as a control with an `aria-checked` and a mark in it rather than as
 * a tint on an edge. That was already the requirement (CLAUDE.md → state is
 * never conveyed by colour alone), which is why the ring was safe to drop.
 */

.rail__vehicle-photo {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  /* `fill`, NOT `cover` — and it is deliberate. The source is a 1024² square and
     the card is 318×204, so `cover` scales it to 318² and throws away a third of
     the frame; anchoring that crop to the bottom then floats the unit high in the
     card with dead space beneath it. Figma stretches the square into the card
     box instead, which is what puts the unit at the size and height the design
     shows. Swap this to `cover` and the photo shrinks and rises. */
  object-fit: fill;
}

.rail__vehicle-badges {
  position: absolute;
  top: 12px;
  left: 12px;
  display: flex;
  gap: 4px;
}

.rail__badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 400; /* Figma body/14 is Regular — the rail's own weight must not leak in */
  line-height: 16px;
  color: rgb(var(--v-theme-background));
}

/* Both badges are light chips sitting ON the photo, which is why they read as
   near-white here and not as dark-theme surfaces. */
.rail__badge--payload { background-color: rgb(var(--v-theme-secondary)); }
.rail__badge--slot { background-color: rgb(var(--v-theme-on-surface)); }

.rail__badge-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: rgb(var(--v-theme-tertiary));
}

.rail__vehicle-menu {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 3px;
  /* A dark chip, deliberately — it recedes into the photo instead of competing
     with the two light badges opposite it. (Node 6485:89785 draws this one
     light; dark was chosen directly, so don't flip it back on a Figma pass.) */
  border: 1px solid rgb(var(--v-theme-outline-variant)); /* #2E3849 */
  border-radius: 4px;
  background-color: rgb(var(--v-theme-background)); /* #020D20 */
  color: rgb(var(--v-theme-on-surface-weak)); /* #9FA4AD */
}

.rail__vehicle-name {
  position: absolute;
  bottom: 12px;
  left: 12px;
  font-size: 14px;
  font-weight: 500;
  line-height: 16px;
  color: rgb(var(--v-theme-secondary-darken-1));
}

.rail__vehicle-check {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 2px;
  border-radius: 4px;
  background-color: rgb(var(--v-theme-primary-medium)); /* #457ED3 */
  color: rgb(var(--v-theme-surface)); /* #162032 */
}

/* ── Mission state ── */
.rail__endpoint {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 79px;
}

.rail__endpoint--end { align-items: flex-end; text-align: right; }

.rail__endpoint-code {
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
  color: rgb(var(--v-theme-on-surface));
}

.rail__endpoint-note {
  font-size: 14px;
  line-height: 20px;
  color: rgb(var(--v-theme-on-surface));
}

.rail__track {
  position: relative;
  flex: 1 0 0;
  min-width: 0;
  height: 14px;
}

.rail__track-rail,
.rail__track-fill {
  position: absolute;
  top: 5px;
  height: 4px;
  border-radius: 13px;
}

.rail__track-rail {
  left: 0;
  right: 0;
  background-color: rgb(var(--v-theme-on-surface-weak));
}

.rail__track-fill {
  left: 0;
  background-color: rgb(var(--v-theme-on-surface));
}

.rail__track-knob {
  position: absolute;
  top: 0;
  width: 14px;
  height: 14px;
  margin-left: -7px;
  border: 3px solid rgb(var(--v-theme-on-surface));
  border-radius: 50%;
  background-color: rgb(var(--v-theme-background));
}

/* ── Mission stops ── */
.rail__current-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px solid var(--neutral-bg-active);
  border-radius: 4px;
  font-size: 14px;
  line-height: 16px;
  color: rgb(var(--v-theme-on-surface-weak));
}

.rail__stops {
  position: relative;
  border: 1px solid rgb(var(--v-theme-outline-variant));
  border-radius: 8px;
  background-color: rgb(var(--v-theme-background));
}

/* The strip scrolls horizontally, so its right edge fades into the card instead
   of chopping a tile in half — that fade IS the "there is more" affordance
   (6485:89693), and without it a half-tile just looks like a rendering fault. */
.rail__stops::after {
  content: '';
  position: absolute;
  top: 16px;
  right: 6px;
  width: 55px;
  height: 58px;
  background: linear-gradient(
    to right,
    rgba(var(--v-theme-background), 0),
    rgb(var(--v-theme-background)) 76%
  );
  pointer-events: none;
}

.rail__stops-strip {
  display: flex;
  gap: 8px;
  padding: 16px;
  overflow-x: auto;
  scrollbar-width: none;
}

.rail__stops-strip::-webkit-scrollbar { display: none; }

/* The tile art is an absolutely-positioned <img> behind the label, so this needs
   to centre its own content — a bare <button> won't, because the rail's UA reset
   hands back `text-align: inherit` and strips the padding that would have
   implied it. Without this the label lands at the top-left of the tile. */
.rail__stop {
  position: relative;
  display: flex;
  flex: 0 0 42px;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
}

.rail__stop-tile {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.rail__stop-marker {
  position: absolute;
  top: -3px;
  left: 50%;
  width: 6px;
  height: 6px;
  margin-left: -3px;
  /* Ring and core are DIFFERENT greens (Figma green-300 over green-600). Setting
     both to `tertiary` makes the ring vanish and the pip read as a plain dot. */
  border: 1.5px solid rgb(var(--v-theme-tertiary-bright));
  border-radius: 2px;
  background-color: rgb(var(--v-theme-tertiary));
}

.rail__stop-label {
  position: relative;
  width: 32px; /* fixed, so "S141" and "S1" sit on the same centre line */
  font-size: 12px;
  font-weight: 500;
  line-height: 14px;
  text-align: center;
  color: rgb(var(--v-theme-on-surface));
}

.rail__stop-label--on-fill { color: rgb(var(--v-theme-background)); }

.rail__stops-scroll {
  width: 280px; /* Figma pins the track length rather than stretching it to the row */
  max-width: calc(100% - 28px);
  height: 3px;
  margin: 0 14px 12px;
  border-radius: 13px;
  background-color: rgb(var(--v-theme-outline-variant));
}

.rail__stops-thumb {
  display: block;
  height: 3px;
  border-radius: 13px;
  background-color: rgb(var(--v-theme-on-surface-variant));
}

/* Keyboard parity for the hand-rolled buttons above. */
.rail__ghost-btn:focus-visible,
.rail__location:focus-visible,
.rail__round-btn:focus-visible,
.rail__edit:focus-visible,
.rail__icon-plain:focus-visible,
.rail__vehicle-menu:focus-visible,
.rail__vehicle-check:focus-visible,
.rail__stop:focus-visible {
  outline: 2px solid rgb(var(--v-theme-on-surface));
  outline-offset: 2px;
}
</style>
