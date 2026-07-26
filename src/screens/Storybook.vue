<!--
  Storybook.vue

  A living "kitchen sink" of the components the app is likely to use, rendered
  with the real theme + defaults from src/plugins/vuetify.ts. This is the DS
  preview (formerly ComponentGallery) — a STANDALONE app, kept separate from the
  product screens.

  USE THIS TO DESIGN, NOT TO SHIP:
   - Tune component look by editing `defaults` / `theme` in src/plugins/vuetify.ts
     (hot-reloads), or SASS vars in src/styles/settings.scss (restart server).
   - Toggle light/dark + density at the top to check every state at once.
   - Add a component: just drop its <v-...> tag into a new <Section>. autoImport
     (vite.config.mts) means no import needed.

  It runs on its own dev server on port 3001 (`corepack pnpm dev:storybook`, or
  `dev:all` to run it alongside the product app) — see storybook.html /
  src/storybook.ts / vite.storybook.config.mts. There is no build script for it,
  so it never ships in the product bundle. Owns its own <v-app> chrome.
-->
<template>
  <v-app>
    <!-- ── Controls bar ──────────────────────────────────── -->
    <v-app-bar flat border="b">
      <v-app-bar-title class="font-weight-bold">Storybook</v-app-bar-title>

      <template #append>
        <v-btn-toggle
          v-model="density"
          class="mr-4"
          density="comfortable"
          divided
          mandatory
        >
          <v-btn value="default" size="small">Cozy</v-btn>
          <v-btn value="comfortable" size="small">Comfort</v-btn>
          <v-btn value="compact" size="small">Compact</v-btn>
        </v-btn-toggle>

        <v-btn
          :prepend-icon="isDark ? 'night' : 'sun'"
          variant="tonal"
          @click="toggleTheme"
        >
          {{ isDark ? 'Dark' : 'Light' }}
        </v-btn>
      </template>
    </v-app-bar>

    <v-main>
      <!-- density cascades to every component that accepts it -->
      <v-defaults-provider :defaults="{ global: { density } }">
        <v-container class="py-8" max-width="1100">

          <!-- ── EDIT MAP · the control-panel index ──────── -->
          <section class="mb-12">
            <div class="text-h5 font-weight-bold mb-1">Edit the design — where every knob lives</div>
            <div class="text-body-2 text-medium-emphasis mb-4" style="max-width: 760px">
              Everything below is changed by <strong>editing one file</strong> — no code, no
              terminal. Paths are project-relative (open them in your editor).
              <strong>Hot-reload</strong> = the change appears in the browser instantly on save;
              <strong>RESTART</strong> = restart the dev server after saving (those live in Sass,
              which is compiled at build time).
            </div>

            <div class="edit-map">
              <div class="edit-row edit-head">
                <span>What it changes</span><span>File to open</span><span>How &amp; reload</span>
              </div>
              <template v-for="grp in editMap" :key="grp.group">
                <div class="edit-group">{{ grp.group }}</div>
                <div v-for="e in grp.rows" :key="e.what" class="edit-row">
                  <span>{{ e.what }}</span>
                  <span class="mono">{{ e.file }}</span>
                  <span>{{ e.where }}</span>
                </div>
              </template>
            </div>
          </section>

          <v-divider class="mb-12" />

          <!-- ── TYPOGRAPHY ──────────────────────────────── -->
          <section class="mb-12">
            <div class="text-h5 font-weight-bold mb-1">Typography</div>
            <div class="text-body-2 text-medium-emphasis mb-2" style="max-width: 720px">
              The MD3 type scale Vuetify 4.1.2 actually ships (font: Onest). Use these
              <strong>text-*</strong> classes. Heads-up: the legacy <strong>text-h1…h6</strong> /
              <strong>text-subtitle-*</strong> / <strong>text-body-1/2</strong> / <strong>text-caption</strong> /
              <strong>text-overline</strong> classes are <strong>no-ops in v4</strong> — they render at
              default size, so prefer the scale below.
            </div>

            <template v-for="group in typeScale" :key="group.family">
              <div class="text-label-large text-primary mt-5 mb-1">{{ group.family }}</div>
              <div
                v-for="t in group.items"
                :key="t.cls"
                class="d-flex align-baseline justify-space-between ga-4 py-2"
                style="border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity))"
              >
                <div :class="t.cls" class="text-truncate" style="min-width: 0">{{ group.sample }}</div>
                <div
                  class="d-flex ga-5 flex-shrink-0 text-medium-emphasis align-baseline"
                  style="font-family: monospace; font-size: 12px"
                >
                  <span>{{ t.cls }}</span>
                  <span style="width: 48px; text-align: right">{{ t.px }}px</span>
                  <span style="width: 32px; text-align: right">{{ t.weight }}</span>
                </div>
              </div>
            </template>
          </section>

          <v-divider class="mb-12" />

          <!-- ── SPACING · RADIUS · SIZING ───────────────── -->
          <section class="mb-12">
            <div class="text-h5 font-weight-bold mb-1">Spacing, radius &amp; sizing</div>
            <div class="text-body-2 text-medium-emphasis mb-5" style="max-width: 720px">
              The token scales behind every utility class and <code>size</code> prop, in real px
              (root 16px, density&nbsp;=&nbsp;default) — so you don't have to look them up.
            </div>

            <!-- Spacing scale -->
            <div class="text-overline">Spacing — <code>pa-N</code> · <code>ma-N</code> · <code>ga-N</code> = 4 × N px (base $spacer = 4px)</div>
            <div class="d-flex flex-wrap align-end ga-4 mb-6">
              <div v-for="s in spacingScale" :key="s.n" class="d-flex flex-column align-center ga-1">
                <div class="spacing-swatch" :style="{ width: Math.max(s.px, 2) + 'px', height: Math.max(s.px, 2) + 'px' }" />
                <span class="mono text-label-small">{{ s.n }}</span>
                <span class="mono text-label-small text-medium-emphasis">{{ s.px }}px</span>
              </div>
            </div>

            <!-- Radius scale -->
            <div class="text-overline">Radius — the <code>rounded-*</code> scale (<code>$rounded</code> in settings.scss)</div>
            <div class="d-flex flex-wrap ga-5 mb-6">
              <div v-for="r in radiusScale" :key="r.cls" class="d-flex flex-column align-center ga-1">
                <div class="radius-swatch" :class="r.cls" />
                <span class="mono text-label-small">{{ r.cls }}</span>
                <span class="mono text-label-small text-medium-emphasis">{{ r.px }}</span>
              </div>
            </div>

            <!-- Component size scale -->
            <div class="text-overline">Size scale — what each <code>size="…"</code> token renders as (px)</div>
            <div class="sizing-table">
              <div class="sizing-row sizing-head">
                <span>Component</span>
                <span v-for="tk in sizeTokens" :key="tk">{{ tk }}</span>
              </div>
              <div v-for="row in sizeScale" :key="row.label" class="sizing-row">
                <span>{{ row.label }}</span>
                <span
                  v-for="(px, i) in row.px"
                  :key="i"
                  :class="sizeTokens[i] === 'default' ? 'font-weight-bold text-high-emphasis' : 'text-medium-emphasis'"
                >{{ px }}</span>
              </div>
            </div>
            <div class="text-body-small text-medium-emphasis mt-2" style="max-width: 720px">
              The <strong>default</strong> column (bold) is the DS baseline. Icon buttons add 12px over the
              plain button height. <strong>VCheckbox / VRadio don't take a <code>size</code> prop</strong>
              (fixed 40px control). <code>VAvatar</code>, <code>VIcon</code> &amp; <code>VProgressCircular</code>
              also accept an arbitrary <code>size="N"</code> in px.
            </div>

            <!-- Density scale -->
            <div class="text-overline mt-6">Density scale — what each density token renders as (component height, px)</div>
            <div class="sizing-table density-cols">
              <div class="sizing-row sizing-head">
                <span>Component</span>
                <span v-for="tk in densityTokens" :key="tk">{{ tk }}</span>
              </div>
              <div v-for="row in densityScale" :key="row.label" class="sizing-row">
                <span>{{ row.label }}</span>
                <span
                  v-for="(px, i) in row.px"
                  :key="i"
                  :class="i === 0 ? 'font-weight-bold text-high-emphasis' : 'text-medium-emphasis'"
                >{{ px }}</span>
              </div>
            </div>
            <div class="text-body-small text-medium-emphasis mt-2" style="max-width: 720px">
              Density adjusts <strong>height &amp; padding only</strong> — never width or font-size.
              Columns match the toggle up top: <strong>Cozy</strong> = <code>default</code> ·
              <strong>Comfort</strong> = <code>comfortable</code> · <strong>Compact</strong> =
              <code>compact</code> (each step is a per-component −1…−4 × the 4px spacer). The
              <strong>Cozy</strong> column (bold) is Vuetify's baseline — but this app sets
              <strong>inputs</strong> to <code>comfortable</code> (48) app-wide in <code>vuetify.ts</code>.
              Toggle density live at the top to see it move. Selection controls (VCheckbox / VRadio /
              VSwitch) take density on their <em>group</em>, not the individual control.
            </div>
          </section>

          <v-divider class="mb-12" />

          <!-- ── COLORS ──────────────────────────────────── -->
          <section class="mb-12">
            <div class="text-h5 font-weight-bold mb-1">Colors</div>
            <div class="text-body-2 text-medium-emphasis mb-4" style="max-width: 720px">
              The live theme tokens (toggle light/dark up top to see both). Use them via
              <code>color="…"</code>, <code>bg-*</code> / <code>text-*</code> classes, or
              <code>rgb(var(--v-theme-*))</code> — never a raw hex. Edit them in
              <code>src/plugins/vuetify.ts</code>; anything you add appears under
              <em>Uncategorised</em> below until you file it into a group.
            </div>

            <template v-for="grp in colorGroups" :key="grp.group">
              <div class="text-overline mt-4">{{ grp.group }}</div>
              <div class="d-flex flex-wrap ga-4 mb-2">
                <div v-for="t in grp.tokens" :key="t" class="d-flex flex-column align-center ga-1" style="width: 108px">
                  <div class="color-swatch" :style="{ backgroundColor: `rgb(var(--v-theme-${t}))` }" />
                  <span class="mono text-label-small text-center" style="word-break: break-all">{{ t }}</span>
                </div>
              </div>
            </template>

            <!-- Safety net: any theme color token the curated groups above don't claim. The
                 groups are a hand-written list, so a token added while rebranding (a new brand
                 accent, an extra surface) would otherwise never show up here. This block reads
                 the live theme, so it appears on its own — and an empty render means the
                 curated list is still complete. -->
            <template v-if="ungroupedTokens.length">
              <div class="text-overline mt-4">Uncategorised — live tokens no group above claims</div>
              <div class="d-flex flex-wrap ga-4 mb-2">
                <div v-for="t in ungroupedTokens" :key="t" class="d-flex flex-column align-center ga-1" style="width: 108px">
                  <div class="color-swatch" :style="{ backgroundColor: `rgb(var(--v-theme-${t}))` }" />
                  <span class="mono text-label-small text-center" style="word-break: break-all">{{ t }}</span>
                </div>
              </div>
              <div class="text-body-2 text-medium-emphasis mt-2" style="max-width: 720px">
                Add these to <code>colorGroups</code> in this file to file them under a heading.
              </div>
            </template>

            <!-- Opacity/emphasis tokens — the theme.variables bucket the palette grid can't show.
                 These aren't separate colors: each is on-surface at a fixed opacity, chosen by
                 MEANING (importance, interaction, edge) — not appearance. Read live from the theme. -->
            <div class="text-subtitle-1 font-weight-bold mt-8 mb-1">Opacity &amp; emphasis</div>
            <div class="text-body-2 text-medium-emphasis mb-4" style="max-width: 720px">
              Not extra colors — <code>on-surface</code> at a fixed opacity, applied by meaning.
              Edited in <code>src/plugins/vuetify.ts</code> → <code>theme.themes.*.variables</code>
              (hot-reload). Values below are live for the active theme.
            </div>

            <div class="text-overline mt-4">Text emphasis — text importance, never a different color</div>
            <div class="d-flex flex-column ga-2 mb-2">
              <div v-for="e in emphasisLevels" :key="e.cls" class="d-flex align-baseline flex-wrap ga-3">
                <span :class="e.cls" class="text-body-large" style="min-width: 220px">The quick brown fox jumps</span>
                <span class="mono text-label-small text-medium-emphasis">{{ e.cls }} · {{ themeVars[e.varName] }}</span>
              </div>
            </div>

            <div class="text-overline mt-6">Interaction-state overlays — on-surface over a surface tile</div>
            <div class="d-flex flex-wrap ga-4 mb-2">
              <div v-for="s in stateOverlays" :key="s" class="d-flex flex-column align-center ga-1" style="width: 108px">
                <div class="state-swatch">
                  <div class="state-swatch__overlay" :style="{ backgroundColor: `rgba(var(--v-theme-on-surface), var(--v-${s}-opacity))` }" />
                </div>
                <span class="mono text-label-small text-center">{{ s }}</span>
                <span class="mono text-label-small text-medium-emphasis">{{ themeVars[`${s}-opacity`] }}</span>
              </div>
            </div>

            <div class="text-overline mt-6">Border — border-color at border-opacity</div>
            <div class="d-flex align-center flex-wrap ga-3 mb-2">
              <div class="border-swatch" />
              <span class="mono text-label-small text-medium-emphasis">border-color · {{ themeVars['border-opacity'] }}</span>
            </div>

            <div class="text-body-small text-medium-emphasis mt-6" style="max-width: 720px">
              Colors (and every other knob) are edited in the files listed in
              <strong>“Edit the design — where every knob lives”</strong> at the top of this page.
              The palette lives in <code>src/plugins/vuetify.ts</code> →
              <code>theme.themes.*.colors</code>, the opacity/emphasis tokens in
              <code>theme.themes.*.variables</code> (both hot-reload).
            </div>
          </section>

          <v-divider class="mb-12" />

          <!-- ── ICONS ───────────────────────────────────── -->
          <section class="mb-12">
            <div class="text-h5 font-weight-bold mb-1">Icons</div>
            <div class="text-body-2 text-medium-emphasis mb-4">VIcon · AppIcon · IBM Carbon</div>

            <div class="text-body-medium text-medium-emphasis mb-4">
              Icons are IBM Carbon, referenced by <strong>semantic key</strong> — never a vendor
              name. Keys live in <code>src/icons/carbon.ts</code>; any Vuetify icon prop
              (<code>icon</code>, <code>prepend-icon</code>, …) takes one, as does
              <code>&lt;app-icon name="…" /&gt;</code>. Add a key there to add an icon.
            </div>

            <div class="text-overline">Sizes — driven by font-size, so every existing size prop still applies</div>
            <div class="d-flex flex-wrap align-end ga-5 mb-4">
              <div v-for="s in iconSizes" :key="s.token" class="d-flex flex-column align-center ga-1">
                <v-icon icon="medication" :size="s.token" />
                <span class="mono text-label-small">{{ s.token }}</span>
                <span class="mono text-label-small text-medium-emphasis">{{ s.px }}px</span>
              </div>
            </div>

            <div class="text-overline">Colors — Carbon svgs use fill="currentColor", so color props/classes carry over</div>
            <div class="d-flex flex-wrap align-center ga-4 mb-4">
              <v-icon icon="cardiac" color="primary" />
              <v-icon icon="checkFilled" color="success" />
              <v-icon icon="alert" color="warning" />
              <v-icon icon="alertFilled" color="error" />
              <v-icon icon="info" color="info" />
              <v-icon icon="user" class="text-medium-emphasis" />
            </div>

            <div class="text-overline">A sample of the app's vocabulary</div>
            <div class="d-flex flex-wrap ga-6">
              <div
                v-for="key in sampleIcons"
                :key="key"
                class="d-flex flex-column align-center ga-1"
                style="width: 88px"
              >
                <v-icon :icon="key" size="large" />
                <span class="text-label-small text-medium-emphasis text-center">{{ key }}</span>
              </div>
            </div>
          </section>

          <v-divider class="mb-12" />

          <!-- ── PICTOGRAMS ──────────────────────────────── -->
          <section class="mb-12">
            <div class="text-h5 font-weight-bold mb-1">Pictograms</div>
            <div class="text-body-2 text-medium-emphasis mb-4">AppPictogram · IBM Carbon Pictograms</div>

            <div class="text-body-medium text-medium-emphasis mb-4">
              Pictograms are large, line-drawn <strong>illustrations</strong> — a separate artifact
              from icons — for <strong>empty states, onboarding and section headers</strong>. Like
              icons they're referenced by <strong>semantic key</strong> (keys in
              <code>src/icons/pictograms.ts</code>) via <code>&lt;app-pictogram name="…" /&gt;</code>.
              They are <strong>decorative</strong>: never the only signal for a clinical state — keep
              those on status icons + text.
            </div>

            <div class="text-overline">Sizes — explicit px (default 48), not font-size</div>
            <div class="d-flex flex-wrap align-center ga-6 mb-4">
              <app-pictogram name="healthcare" :size="32" />
              <app-pictogram name="healthcare" :size="48" />
              <app-pictogram name="healthcare" :size="64" />
              <app-pictogram name="healthcare" :size="96" />
            </div>

            <div class="text-overline">Colors — fill="currentColor", so text-color classes tint them</div>
            <div class="d-flex flex-wrap align-center ga-6 mb-4">
              <app-pictogram name="heartHealth" :size="48" class="text-primary" />
              <app-pictogram name="heartHealth" :size="48" class="text-secondary" />
              <app-pictogram name="heartHealth" :size="48" class="text-success" />
              <app-pictogram name="heartHealth" :size="48" class="text-medium-emphasis" />
            </div>

            <div class="text-overline">Canonical use — an empty state</div>
            <v-card variant="tonal" rounded="lg" class="mb-6" max-width="420">
              <div class="d-flex flex-column align-center text-center pa-8 ga-2">
                <app-pictogram name="records" :size="72" class="text-primary mb-2" />
                <div class="text-title-medium">No records yet</div>
                <div class="text-body-medium text-medium-emphasis">
                  Your treatment history will appear here once your clinician adds it.
                </div>
                <v-btn color="primary" variant="flat" rounded="lg" class="mt-3">Add a record</v-btn>
              </div>
            </v-card>

            <div class="text-overline">A sample of the app's vocabulary</div>
            <div class="d-flex flex-wrap ga-6">
              <div
                v-for="key in samplePictograms"
                :key="key"
                class="d-flex flex-column align-center ga-2"
                style="width: 104px"
              >
                <app-pictogram :name="key" :size="48" class="text-medium-emphasis" />
                <span class="text-label-small text-medium-emphasis text-center">{{ key }}</span>
              </div>
            </div>
          </section>

          <v-divider class="mb-12" />

          <!-- ── BUTTONS ─────────────────────────────────── -->
          <section class="mb-12">
            <div class="text-h5 font-weight-bold mb-1">Buttons</div>
            <div class="text-body-2 text-medium-emphasis mb-4">VBtn · VIconBtn · VFab · VBtnToggle</div>

            <div class="text-overline">Variants</div>
            <div class="d-flex flex-wrap ga-2 mb-4">
              <v-btn variant="elevated">Elevated</v-btn>
              <v-btn variant="flat">Flat</v-btn>
              <v-btn variant="tonal">Tonal</v-btn>
              <v-btn variant="outlined">Outlined</v-btn>
              <v-btn variant="text">Text</v-btn>
              <v-btn variant="plain">Plain</v-btn>
            </div>

            <div class="text-overline">Colors &amp; sizes</div>
            <div class="d-flex flex-wrap align-center ga-2 mb-4">
              <v-btn color="primary">Primary</v-btn>
              <v-btn color="secondary">Secondary</v-btn>
              <v-btn color="success">Success</v-btn>
              <v-btn color="error">Error</v-btn>
              <v-btn color="primary" size="x-small">x-small · 20</v-btn>
              <v-btn color="primary" size="small">small · 28</v-btn>
              <v-btn color="primary">default · 36</v-btn>
              <v-btn color="primary" size="large">large · 44</v-btn>
              <v-btn color="primary" size="x-large">x-large · 52</v-btn>
            </div>

            <div class="text-overline">States &amp; icons</div>
            <div class="d-flex flex-wrap align-center ga-2">
              <v-btn color="primary" prepend-icon="save">Save</v-btn>
              <v-btn color="primary" append-icon="arrowRight">Next</v-btn>
              <v-btn color="primary" :loading="loading" @click="fakeLoad">Loading</v-btn>
              <v-btn color="primary" disabled>Disabled</v-btn>
              <v-btn icon="favoriteFilled" color="error" />
              <v-fab icon="plus" color="primary" size="small" />
            </div>

            <div class="text-overline mt-6">Segmented — VBtnToggle</div>
            <div class="d-flex flex-wrap align-center ga-6">
              <!-- default: joined, divided segments (the stock VBtnToggle look) -->
              <div class="d-flex flex-column ga-1">
                <span class="mono text-label-small text-medium-emphasis">default · divided</span>
                <v-btn-toggle v-model="segView" mandatory divided density="comfortable">
                  <v-btn value="list">List</v-btn>
                  <v-btn value="grid">Grid</v-btn>
                </v-btn-toggle>
              </div>
              <!-- pill-switch variant via the shared .pill-toggle class (overrides.css) -->
              <div class="d-flex flex-column ga-1">
                <span class="mono text-label-small text-medium-emphasis">.pill-toggle</span>
                <v-btn-toggle v-model="segUnit" mandatory variant="text" class="pill-toggle">
                  <v-btn value="kg" class="text-none">kg</v-btn>
                  <v-btn value="lb" class="text-none">lb</v-btn>
                </v-btn-toggle>
              </div>
            </div>
          </section>

          <v-divider class="mb-12" />

          <!-- ── AVATARS ─────────────────────────────────── -->
          <section class="mb-12">
            <div class="text-h5 font-weight-bold mb-1">Avatars</div>
            <div class="text-body-2 text-medium-emphasis mb-4">VAvatar — circular by default; <code>rounded="…"</code> for a squircle. <code>size="N"</code> takes arbitrary px.</div>

            <div class="text-overline">Sizes</div>
            <div class="d-flex flex-wrap align-end ga-5 mb-4">
              <div v-for="(px, i) in [24, 32, 40, 48, 56]" :key="px" class="d-flex flex-column align-center ga-1">
                <v-avatar :size="sizeTokens[i] === 'default' ? undefined : sizeTokens[i]" color="primary">
                  <v-icon icon="user" />
                </v-avatar>
                <span class="mono text-label-small">{{ sizeTokens[i] }}</span>
                <span class="mono text-label-small text-medium-emphasis">{{ px }}px</span>
              </div>
            </div>

            <div class="text-overline">Shape — rounded prop (radius scale)</div>
            <div class="d-flex flex-wrap align-center ga-4">
              <v-avatar size="56" color="secondary" rounded="0"><v-icon icon="user" /></v-avatar>
              <v-avatar size="56" color="secondary" rounded><v-icon icon="user" /></v-avatar>
              <v-avatar size="56" color="secondary" rounded="lg"><v-icon icon="user" /></v-avatar>
              <v-avatar size="56" color="secondary"><v-icon icon="user" /></v-avatar>
            </div>
          </section>

          <v-divider class="mb-12" />

          <!-- ── SELECTION CONTROLS ──────────────────────── -->
          <section class="mb-12">
            <div class="text-h5 font-weight-bold mb-1">Selection controls</div>
            <div class="text-body-2 text-medium-emphasis mb-4">VCheckbox · VRadioGroup · VSwitch</div>

            <v-row>
              <v-col cols="12" md="4">
                <div class="text-overline">Checkboxes</div>
                <v-checkbox v-model="check1" label="Accept terms" hide-details />
                <v-checkbox v-model="check2" label="Subscribe" hide-details />
                <v-checkbox label="Disabled" disabled hide-details />
                <v-checkbox :model-value="true" label="Indeterminate" indeterminate hide-details />
              </v-col>

              <v-col cols="12" md="4">
                <div class="text-overline">Radio group</div>
                <v-radio-group v-model="radio" hide-details>
                  <v-radio label="Option one" value="one" />
                  <v-radio label="Option two" value="two" />
                  <v-radio label="Option three" value="three" />
                </v-radio-group>
              </v-col>

              <v-col cols="12" md="4">
                <div class="text-overline">Switches</div>
                <v-switch v-model="switch1" label="Notifications" hide-details />
                <v-switch v-model="switch2" label="Dark mode" hide-details />
                <v-switch label="Disabled" disabled hide-details />
              </v-col>
            </v-row>
          </section>

          <v-divider class="mb-12" />

          <!-- ── TEXT INPUTS ─────────────────────────────── -->
          <section class="mb-12">
            <div class="text-h5 font-weight-bold mb-1">Text inputs</div>
            <div class="text-body-2 text-medium-emphasis mb-4">VTextField · VTextarea · VFileInput · VNumberInput</div>

            <v-row>
              <v-col cols="12" md="6">
                <div class="text-overline">Variants (your default = outlined)</div>
                <v-text-field v-model="text1" label="Default (outlined)" class="mb-2" />
                <v-text-field label="Outlined" variant="outlined" class="mb-2" />
                <v-text-field label="Filled" variant="filled" class="mb-2" />
                <v-text-field label="Underlined" variant="underlined" />
              </v-col>

              <v-col cols="12" md="6">
                <div class="text-overline">Solo family (label aligns with the text — no notch)</div>
                <v-text-field label="Solo" variant="solo" model-value="Aligned value" class="mb-2" />
                <v-text-field label="Solo-filled" variant="solo-filled" model-value="Aligned value" class="mb-2" />
                <v-text-field label="Solo-inverted" variant="solo-inverted" model-value="Aligned value" />
              </v-col>

              <v-col cols="12" md="6">
                <div class="text-overline">With affordances</div>
                <v-text-field label="Search" prepend-inner-icon="search" class="mb-2" />
                <v-text-field
                  label="Password"
                  :type="showPw ? 'text' : 'password'"
                  :append-inner-icon="showPw ? 'viewOff' : 'view'"
                  model-value="secret123"
                  class="mb-2"
                  @click:append-inner="showPw = !showPw"
                />
                <v-text-field
                  label="With error"
                  model-value="bad value"
                  :error-messages="['This field has an error']"
                  variant="outlined"
                />
              </v-col>

              <v-col cols="12" md="6">
                <v-textarea label="Message" rows="3" auto-grow />
              </v-col>
              <v-col cols="12" md="3">
                <v-file-input label="Attachment" prepend-icon="attachment" />
              </v-col>
              <v-col cols="12" md="3">
                <v-number-input v-model="num" label="Quantity" control-variant="split" />
              </v-col>
            </v-row>
          </section>

          <v-divider class="mb-12" />

          <!-- ── SELECTS & PICKERS ───────────────────────── -->
          <section class="mb-12">
            <div class="text-h5 font-weight-bold mb-1">Selects &amp; pickers</div>
            <div class="text-body-2 text-medium-emphasis mb-4">VSelect · VAutocomplete · VCombobox</div>

            <v-row>
              <v-col cols="12" md="4">
                <v-select v-model="sel" :items="fruits" label="Select" variant="outlined" />
              </v-col>
              <v-col cols="12" md="4">
                <v-autocomplete :items="fruits" label="Autocomplete" variant="outlined" />
              </v-col>
              <v-col cols="12" md="4">
                <v-combobox :items="fruits" label="Combobox (multi)" variant="outlined" multiple chips />
              </v-col>
            </v-row>
          </section>

          <v-divider class="mb-12" />

          <!-- ── SLIDERS & RATING ────────────────────────── -->
          <section class="mb-12">
            <div class="text-h5 font-weight-bold mb-1">Sliders &amp; rating</div>
            <div class="text-body-2 text-medium-emphasis mb-4">VSlider · VRangeSlider · VRating</div>

            <v-row align="center">
              <v-col cols="12" md="4">
                <v-slider v-model="slider" label="Volume" color="primary" thumb-label />
              </v-col>
              <v-col cols="12" md="4">
                <v-range-slider v-model="range" label="Range" color="primary" />
              </v-col>
              <v-col cols="12" md="4">
                <v-rating v-model="rating" color="warning" active-color="warning" />
              </v-col>
            </v-row>
          </section>

          <v-divider class="mb-12" />

          <!-- ── CHIPS ───────────────────────────────────── -->
          <section class="mb-12">
            <div class="text-h5 font-weight-bold mb-1">Chips</div>
            <div class="text-body-2 text-medium-emphasis mb-4">VChip · VChipGroup</div>

            <div class="d-flex flex-wrap ga-2 mb-4">
              <v-chip>Default</v-chip>
              <v-chip color="primary" variant="tonal">Tonal</v-chip>
              <v-chip color="primary">Primary</v-chip>
              <v-chip color="success" variant="flat">Filled</v-chip>
              <v-chip color="error" variant="outlined">Outlined</v-chip>
              <v-chip prepend-icon="user">With icon</v-chip>
              <v-chip closable>Closable</v-chip>
            </div>

            <div class="text-overline">Sizes</div>
            <div class="d-flex flex-wrap align-center ga-2 mb-4">
              <v-chip size="x-small">x-small · 20</v-chip>
              <v-chip size="small">small · 26</v-chip>
              <v-chip>default · 32</v-chip>
              <v-chip size="large">large · 38</v-chip>
              <v-chip size="x-large">x-large · 44</v-chip>
            </div>

            <v-chip-group v-model="chipSel" color="primary" selected-class="text-primary">
              <v-chip v-for="f in fruits" :key="f" :value="f" filter>{{ f }}</v-chip>
            </v-chip-group>
          </section>

          <v-divider class="mb-12" />

          <!-- ── SLIDE GROUP (scrolling chip/segment strip) ── -->
          <section class="mb-12">
            <div class="text-h5 font-weight-bold mb-1">Slide group</div>
            <div class="text-body-2 text-medium-emphasis mb-4">VSlideGroup · VSlideGroupItem — a horizontally scrollable, single-select strip (used for the dashboard's care-strategy categories)</div>

            <v-slide-group v-model="slideSel" mandatory show-arrows>
              <v-slide-group-item
                v-for="cat in ['Action Plan', 'Follow-up Care', 'Supplements', 'Lifestyle']"
                :key="cat"
                :value="cat"
                #default="{ isSelected, toggle }"
              >
                <v-chip
                  label
                  class="me-2"
                  :color="isSelected ? 'primary' : undefined"
                  :variant="isSelected ? 'flat' : 'tonal'"
                  @click="toggle"
                >{{ cat }}</v-chip>
              </v-slide-group-item>
            </v-slide-group>
          </section>

          <v-divider class="mb-12" />

          <!-- ── CARDS & SURFACES ────────────────────────── -->
          <section class="mb-12">
            <div class="text-h5 font-weight-bold mb-1">Cards &amp; surfaces</div>
            <div class="text-body-2 text-medium-emphasis mb-4">VCard · VSheet · VExpansionPanels</div>

            <v-row>
              <v-col cols="12" md="5">
                <v-card>
                  <v-card-item>
                    <v-card-title>Card title</v-card-title>
                    <v-card-subtitle>Supporting subtitle</v-card-subtitle>
                  </v-card-item>
                  <v-card-text>
                    Cards use your defaults: rounded-md (16px), flat, thin hairline border.
                  </v-card-text>
                  <v-card-actions>
                    <v-btn color="primary">Action</v-btn>
                    <v-btn>Cancel</v-btn>
                  </v-card-actions>
                </v-card>
              </v-col>

              <v-col cols="12" md="7">
                <v-expansion-panels>
                  <v-expansion-panel v-for="n in 3" :key="n" :title="`Panel ${n}`">
                    <template #text>Hidden content for panel {{ n }}.</template>
                  </v-expansion-panel>
                </v-expansion-panels>
              </v-col>
            </v-row>

            <!-- VCard ships its own interaction states (VSheet ships NONE — it's a
                 static container). These are the built-in props; hover/click one to see. -->
            <div class="text-overline mt-8">Interactive states — <code>hover</code> · <code>link</code>/<code>@click</code> (ripple) · <code>loading</code> · <code>disabled</code>. VSheet has none of these.</div>
            <v-row>
              <v-col cols="12" sm="6" md="3">
                <v-card hover class="pa-4 fill-height">
                  <div class="text-title-small font-weight-medium mb-1">Hover</div>
                  <div class="text-body-small text-medium-emphasis">Elevation lifts on hover.</div>
                </v-card>
              </v-col>
              <v-col cols="12" sm="6" md="3">
                <v-card link class="pa-4 fill-height" @click="notify('Card clicked')">
                  <div class="text-title-small font-weight-medium mb-1">Clickable</div>
                  <div class="text-body-small text-medium-emphasis">Cursor, focus ring &amp; ripple.</div>
                </v-card>
              </v-col>
              <v-col cols="12" sm="6" md="3">
                <v-card loading class="pa-4 fill-height">
                  <div class="text-title-small font-weight-medium mb-1">Loading</div>
                  <div class="text-body-small text-medium-emphasis">Indeterminate bar on top.</div>
                </v-card>
              </v-col>
              <v-col cols="12" sm="6" md="3">
                <v-card disabled class="pa-4 fill-height" @click="notify('never fires')">
                  <div class="text-title-small font-weight-medium mb-1">Disabled</div>
                  <div class="text-body-small text-medium-emphasis">Dimmed &amp; non-interactive.</div>
                </v-card>
              </v-col>
            </v-row>

            <!-- Selection is NOT a built-in VCard state (no `active` prop) — you bind
                 your own from a ref. This is the pattern the dashboard's concern cards use. -->
            <div class="text-overline mt-8">Selectable — VCard has <strong>no</strong> built-in <code>active</code> state; bind your own (<code>color</code> + <code>variant</code> from a ref).</div>
            <v-row>
              <v-col v-for="plan in plans" :key="plan" cols="12" sm="4">
                <v-card
                  link
                  :color="selectedPlan === plan ? 'primary' : undefined"
                  :variant="selectedPlan === plan ? 'tonal' : 'outlined'"
                  class="pa-4 fill-height d-flex align-center justify-space-between"
                  @click="selectedPlan = plan"
                >
                  <span class="text-title-small font-weight-medium">{{ plan }}</span>
                  <v-icon v-if="selectedPlan === plan" icon="checkFilled" color="primary" size="18" />
                </v-card>
              </v-col>
            </v-row>
          </section>

          <v-divider class="mb-12" />

          <!-- ── ELEVATION & SHADOWS ─────────────────────── -->
          <section class="mb-12">
            <div class="text-h5 font-weight-bold mb-1">Elevation &amp; shadows</div>
            <div class="text-body-2 text-medium-emphasis mb-4">
              Vuetify 4 elevation <strong>0–5</strong> — set via the <code>elevation</code> prop on
              VCard / VSheet / VBtn (e.g. <code>elevation="5"</code>). Higher = bigger, softer shadow.
              Note: Vuetify 4 caps elevation at 5; values above 5 render <em>no</em> shadow.
            </div>

            <div class="d-flex flex-wrap ga-8">
              <div
                v-for="e in [0, 1, 2, 3, 4, 5]"
                :key="e"
                class="text-center"
              >
                <v-sheet
                  :elevation="e"
                  color="surface"
                  rounded="lg"
                  width="96"
                  height="72"
                  class="d-flex align-center justify-center"
                >
                  <span class="text-h6 font-weight-bold">{{ e }}</span>
                </v-sheet>
                <div class="text-caption text-medium-emphasis mt-2">elevation="{{ e }}"</div>
              </div>
            </div>
          </section>

          <v-divider class="mb-12" />

          <!-- ── LISTS ───────────────────────────────────── -->
          <section class="mb-12">
            <div class="text-h5 font-weight-bold mb-1">Lists</div>
            <div class="text-body-2 text-medium-emphasis mb-4">VList · VListItem (nav style by default)</div>

            <v-row>
              <v-col cols="12" md="6">
                <div class="text-overline">Display — read-only rows</div>
                <v-card max-width="420">
                  <v-list>
                    <v-list-subheader>Patients</v-list-subheader>
                    <v-list-item
                      v-for="p in people"
                      :key="p.name"
                      :subtitle="p.role"
                      :title="p.name"
                    >
                      <template #prepend>
                        <v-avatar color="primary">{{ p.name.charAt(0) }}</v-avatar>
                      </template>
                      <template #append>
                        <v-icon icon="chevronRight" />
                      </template>
                    </v-list-item>
                  </v-list>
                </v-card>
              </v-col>

              <v-col cols="12" md="6">
                <!-- VListItem has a built-in active state — surfaced with `nav` +
                     v-model:selected + activeColor. Click a row; one stays selected. -->
                <div class="text-overline">Interactive — clickable, built-in active state (<code>nav</code> · <code>v-model:selected</code> · <code>color</code>)</div>
                <v-card max-width="420">
                  <v-list v-model:selected="navSel" nav mandatory color="primary">
                    <v-list-item
                      v-for="item in navItems"
                      :key="item.value"
                      :value="item.value"
                      :prepend-icon="item.icon"
                      :title="item.title"
                    />
                  </v-list>
                </v-card>
              </v-col>
            </v-row>
          </section>

          <v-divider class="mb-12" />

          <!-- ── DATA TABLE ──────────────────────────────── -->
          <section class="mb-12">
            <div class="text-h5 font-weight-bold mb-1">Data table</div>
            <div class="text-body-2 text-medium-emphasis mb-4">VDataTable</div>

            <v-card>
              <v-data-table :headers="tableHeaders" :items="tableItems" :items-per-page="5">
                <template #item.status="{ value }">
                  <v-chip :color="value === 'Active' ? 'success' : 'secondary'" size="small">{{ value }}</v-chip>
                </template>
              </v-data-table>
            </v-card>
          </section>

          <v-divider class="mb-12" />

          <!-- ── NAVIGATION ──────────────────────────────── -->
          <section class="mb-12">
            <div class="text-h5 font-weight-bold mb-1">Navigation</div>
            <div class="text-body-2 text-medium-emphasis mb-4">VTabs · VWindow · VBreadcrumbs · VPagination</div>

            <v-tabs v-model="tab" color="primary" class="mb-2">
              <v-tab value="overview">Overview</v-tab>
              <v-tab value="details">Details</v-tab>
              <v-tab value="activity">Activity</v-tab>
            </v-tabs>
            <v-divider class="mb-3" />

            <!-- VWindow — the swipeable panel container paired with the tabs above
                 (used by TreatmentDetail.vue for its tabbed body). -->
            <v-window v-model="tab" class="mb-4">
              <v-window-item value="overview">
                <div class="text-body-2 text-medium-emphasis">Overview panel content.</div>
              </v-window-item>
              <v-window-item value="details">
                <div class="text-body-2 text-medium-emphasis">Details panel content.</div>
              </v-window-item>
              <v-window-item value="activity">
                <div class="text-body-2 text-medium-emphasis">Activity panel content.</div>
              </v-window-item>
            </v-window>

            <v-breadcrumbs :items="['Home', 'Patients', 'Detail']" class="mb-4" />

            <v-pagination v-model="page" :length="6" color="primary" />
          </section>

          <v-divider class="mb-12" />

          <!-- ── FEEDBACK ────────────────────────────────── -->
          <section class="mb-12">
            <div class="text-h5 font-weight-bold mb-1">Feedback &amp; status</div>
            <div class="text-body-2 text-medium-emphasis mb-4">
              VAlert · VProgressLinear · VProgressCircular · VSkeletonLoader · VBadge · VTooltip · VSnackbar · VDialog
            </div>

            <div class="text-overline">Alerts</div>
            <v-alert type="info" class="mb-2" text="An informational message." />
            <v-alert type="success" class="mb-2" text="Saved successfully." />
            <v-alert type="warning" class="mb-2" text="Heads up — check this." />
            <v-alert type="error" class="mb-4" text="Something went wrong." />

            <div class="text-overline">Progress</div>
            <v-progress-linear :model-value="60" class="mb-3" />
            <div class="d-flex align-center ga-4 mb-4">
              <v-progress-circular :model-value="40" color="primary" />
              <v-progress-circular indeterminate color="primary" />
              <v-badge content="3" color="error"><v-icon icon="notificationFilled" /></v-badge>
              <v-tooltip text="A helpful tooltip">
                <template #activator="{ props }">
                  <v-btn v-bind="props" variant="tonal">Hover me</v-btn>
                </template>
              </v-tooltip>
            </div>

            <div class="text-overline">Skeleton loader</div>
            <v-skeleton-loader type="article" class="mb-4" max-width="420" />

            <div class="text-overline">Overlays</div>
            <div class="d-flex ga-2 align-center">
              <v-btn color="primary" @click="notify('Snackbar message')">Show snackbar</v-btn>
              <v-btn color="primary" variant="tonal" @click="dialog = true">Open dialog</v-btn>

              <!-- dropdown menu (used by the Home top bar: notifications / profile / filters) -->
              <v-menu location="bottom start">
                <template #activator="{ props }">
                  <v-btn v-bind="props" variant="outlined" append-icon="chevronDown">Menu</v-btn>
                </template>
                <v-list density="comfortable" width="200" rounded="lg" elevation="6" nav>
                  <v-list-item prepend-icon="user" title="View profile" />
                  <v-list-item prepend-icon="settings" title="Account settings" />
                  <v-divider class="my-1" />
                  <v-list-item prepend-icon="logout" title="Sign out" base-color="error" />
                </v-list>
              </v-menu>
            </div>
          </section>

          <v-divider class="mb-12" />

          <section class="mb-12">
            <div class="text-h5 font-weight-bold mb-1">Timeline</div>
            <div class="text-body-2 text-medium-emphasis mb-4">
              VTimeline · VTimelineItem — used by TreatmentDetail.vue for the dose-titration plan.
              Dot color carries state (done / current / upcoming).
            </div>

            <v-timeline side="end" align="start" density="comfortable" truncate-line="both">
              <v-timeline-item dot-color="success" size="small" fill-dot>
                <template #icon><v-icon icon="check" size="14" color="white" /></template>
                <div class="d-flex align-center ga-2">
                  <span class="text-body-1 font-weight-bold">2.5 mg</span>
                  <v-chip color="success" variant="tonal" size="x-small" label>Completed</v-chip>
                </div>
                <div class="text-body-2 text-medium-emphasis">First titration step.</div>
              </v-timeline-item>
              <v-timeline-item dot-color="primary" size="small" fill-dot>
                <template #icon><v-icon icon="dot" size="14" color="white" /></template>
                <div class="d-flex align-center ga-2">
                  <span class="text-body-1 font-weight-bold">7.5 mg</span>
                  <v-chip color="primary" variant="tonal" size="x-small" label>Current</v-chip>
                </div>
                <div class="text-body-2 text-medium-emphasis">Current target dose.</div>
              </v-timeline-item>
              <v-timeline-item dot-color="surface-variant" size="small" fill-dot>
                <template #icon><v-icon icon="dotOutline" size="14" color="white" /></template>
                <div class="d-flex align-center ga-2">
                  <span class="text-body-1 font-weight-bold">10 mg</span>
                  <v-chip color="surface-light" size="x-small" label class="text-medium-emphasis">Upcoming</v-chip>
                </div>
                <div class="text-body-2 text-medium-emphasis">Long-term maintenance.</div>
              </v-timeline-item>
            </v-timeline>
          </section>

          <v-divider class="mb-12" />

          <!-- ── STEPPER ─────────────────────────────────── -->
          <section class="mb-12">
            <div class="text-h5 font-weight-bold mb-1">Stepper</div>
            <div class="text-body-2 text-medium-emphasis mb-4">
              VStepper · VStepperVertical — multi-step flows (onboarding, intake). The active
              step is built-in state (<code>v-model</code>); completed steps get a check.
            </div>

            <div class="text-overline">Horizontal</div>
            <v-stepper v-model="step" :items="stepItems" flat class="mb-8" border rounded="lg">
              <template #item.1><div class="pa-4 text-body-medium text-medium-emphasis">Create your account.</div></template>
              <template #item.2><div class="pa-4 text-body-medium text-medium-emphasis">Add your profile details.</div></template>
              <template #item.3><div class="pa-4 text-body-medium text-medium-emphasis">Review and confirm.</div></template>
            </v-stepper>

            <div class="text-overline">Vertical</div>
            <v-stepper-vertical v-model="stepV" flat border rounded="lg" style="max-width: 520px">
              <v-stepper-vertical-item :value="1" title="Account">
                <div class="text-body-medium text-medium-emphasis">Create your account.</div>
              </v-stepper-vertical-item>
              <v-stepper-vertical-item :value="2" title="Profile">
                <div class="text-body-medium text-medium-emphasis">Add your profile details.</div>
              </v-stepper-vertical-item>
              <v-stepper-vertical-item :value="3" title="Confirm">
                <div class="text-body-medium text-medium-emphasis">Review and confirm.</div>
              </v-stepper-vertical-item>
            </v-stepper-vertical>
          </section>

          <v-divider class="mb-12" />

          <!-- ── DATE & TIME ─────────────────────────────── -->
          <section class="mb-12">
            <div class="text-h5 font-weight-bold mb-1">Date &amp; time</div>
            <div class="text-body-2 text-medium-emphasis mb-4">
              VDateInput · VDatePicker · VTimePicker — the selected value is built-in
              <code>v-model</code> state; the field opens the picker in a popover.
            </div>

            <div class="text-overline">Field — VDateInput (opens a picker)</div>
            <v-row class="mb-2">
              <v-col cols="12" md="6">
                <v-date-input v-model="date" label="Appointment date" prepend-icon="" prepend-inner-icon="calendar" />
              </v-col>
            </v-row>

            <div class="text-overline">Inline — VDatePicker · VTimePicker</div>
            <div class="d-flex flex-wrap ga-6">
              <v-date-picker v-model="date" show-adjacent-months />
              <v-time-picker v-model="time" format="24hr" />
            </div>
          </section>

          <v-divider class="mb-12" />

          <!-- ── OTP INPUT ───────────────────────────────── -->
          <section class="mb-12">
            <div class="text-h5 font-weight-bold mb-1">OTP input</div>
            <div class="text-body-2 text-medium-emphasis mb-4">
              VOtpInput — segmented verification code (2FA / email confirm). Per-cell focus
              &amp; fill state, plus a built-in <code>loading</code> state.
            </div>

            <v-otp-input v-model="otp" :length="6" variant="outlined" style="max-width: 440px" />
          </section>

          <v-divider class="mb-12" />

          <!-- ── FILE UPLOAD ─────────────────────────────── -->
          <section class="mb-12">
            <div class="text-h5 font-weight-bold mb-1">File upload</div>
            <div class="text-body-2 text-medium-emphasis mb-4">
              VFileUpload — a drag-and-drop dropzone (richer than the VFileInput field shown
              above). Built-in drag/hover, <code>clearable</code> and per-file states.
            </div>

            <v-file-upload
              v-model="upload"
              icon="upload"
              title="Drag lab results here"
              clearable
              multiple
              density="comfortable"
              show-size
              style="max-width: 520px"
            />
          </section>

          <v-divider class="mb-12" />

          <!-- ── CAROUSEL ────────────────────────────────── -->
          <section class="mb-12">
            <div class="text-h5 font-weight-bold mb-1">Carousel</div>
            <div class="text-body-2 text-medium-emphasis mb-4">
              VCarousel · VCarouselItem — active-slide state (<code>v-model</code>); arrows and
              delimiter dots are built in. Slides tint from theme tokens (no raw color).
            </div>

            <v-carousel
              v-model="carouselSel"
              height="220"
              hide-delimiter-background
              show-arrows="hover"
              class="rounded-lg"
              style="max-width: 640px"
            >
              <v-carousel-item v-for="(slide, i) in carouselSlides" :key="i">
                <v-sheet :color="slide.color" height="100%" class="d-flex flex-column align-center justify-center text-center px-6">
                  <div class="text-title-large text-white">{{ slide.title }}</div>
                  <div class="text-body-medium text-white" style="opacity: 0.85">{{ slide.body }}</div>
                </v-sheet>
              </v-carousel-item>
            </v-carousel>
          </section>

          <v-divider class="mb-12" />

          <!-- ── DATA TABLE ──────────────────────────────── -->
          <section class="mb-12">
            <div class="text-h5 font-weight-bold mb-1">Data table</div>
            <div class="text-body-2 text-medium-emphasis mb-4">
              VTable — a simple static table styled by the theme. Pairs a value with a status
              chip per row (as used by the Report detail's Test Results tab).
            </div>

            <v-card border rounded="lg" style="overflow: hidden; max-width: 560px">
              <v-table density="comfortable">
                <thead>
                  <tr>
                    <th class="text-left">Test</th>
                    <th class="text-left">Result</th>
                    <th class="text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in tableRows" :key="row.name">
                    <td class="font-weight-medium">{{ row.name }}</td>
                    <td>{{ row.value }}</td>
                    <td>
                      <v-chip :color="row.color" variant="tonal" size="small" class="font-weight-medium">
                        {{ row.status }}
                      </v-chip>
                    </td>
                  </tr>
                </tbody>
              </v-table>
            </v-card>
          </section>

          <!-- ── DATA VIZ (ECharts kit) ───────────── -->
          <section class="mb-12">
            <div class="text-h5 font-weight-bold mb-1">Data viz</div>
            <div class="text-body-2 text-medium-emphasis mb-4" style="max-width: 720px">
              The chart kit — pre-themed <strong>Apache ECharts</strong> charts
              (<strong>Line · Bar · Area · Donut · Gauge · Scatter · Radar · Heatmap</strong>).
              Colors, fonts, mark sizes and
              dark-mode come from the data-viz DS in <strong>src/data/chartTheme.ts</strong> — the
              palette is validated colorblind-safe. Pass a typed dataset + key names; the look is
              baked in. Toggle dark above to see the charts re-theme.
            </div>

            <v-row>
              <v-col cols="12" md="6">
                <v-card class="pa-4" border>
                  <div class="text-title-medium font-weight-bold mb-1">Line · single series</div>
                  <div class="text-body-small text-medium-emphasis mb-3">Adherence % over 8 weeks (synthetic)</div>
                  <LineChart :data="adherenceTrend" x="week" y="value" y-label="Adherence %" title="Adherence over 8 weeks" />
                </v-card>
              </v-col>
              <v-col cols="12" md="6">
                <v-card class="pa-4" border>
                  <div class="text-title-medium font-weight-bold mb-1">Line · multi series</div>
                  <div class="text-body-small text-medium-emphasis mb-3">Three cohorts (synthetic)</div>
                  <LineChart :data="cohortTrend" x="week" y="value" series="series" title="Cohort comparison" />
                </v-card>
              </v-col>
              <v-col cols="12" md="6">
                <v-card class="pa-4" border>
                  <div class="text-title-medium font-weight-bold mb-1">Bar · single series</div>
                  <div class="text-body-small text-medium-emphasis mb-3">Doses logged per day (synthetic)</div>
                  <BarChart :data="dosesByDay" x="label" y="value" title="Doses per day" />
                </v-card>
              </v-col>
              <v-col cols="12" md="6">
                <v-card class="pa-4" border>
                  <div class="text-title-medium font-weight-bold mb-1">Bar · stacked</div>
                  <div class="text-body-small text-medium-emphasis mb-3">Dose types per day (synthetic)</div>
                  <BarChart :data="doseTypesByDay" x="label" y="value" series="segment" title="Dose types per day" />
                </v-card>
              </v-col>
              <v-col cols="12" md="6">
                <v-card class="pa-4" border>
                  <div class="text-title-medium font-weight-bold mb-1">Area · single series</div>
                  <div class="text-body-small text-medium-emphasis mb-3">Adherence % over 8 weeks (synthetic)</div>
                  <AreaChart :data="adherenceTrend" x="week" y="value" y-label="Adherence %" title="Adherence area" />
                </v-card>
              </v-col>
              <v-col cols="12" md="6">
                <v-card class="pa-4" border>
                  <div class="text-title-medium font-weight-bold mb-1">Donut · part-to-whole</div>
                  <div class="text-body-small text-medium-emphasis mb-3">Treatment plan breakdown (synthetic)</div>
                  <DonutChart :data="planBreakdown" name="name" value="value" title="Plan breakdown" />
                </v-card>
              </v-col>
              <v-col cols="12" md="6">
                <v-card class="pa-4" border>
                  <div class="text-title-medium font-weight-bold mb-1">Gauge · single KPI</div>
                  <div class="text-body-small text-medium-emphasis mb-3">Health score (synthetic)</div>
                  <GaugeChart :value="healthScore" unit=" pts" label="Health score" title="Health score gauge" />
                </v-card>
              </v-col>
              <v-col cols="12" md="6">
                <v-card class="pa-4" border>
                  <div class="text-title-medium font-weight-bold mb-1">Scatter · correlation</div>
                  <div class="text-body-small text-medium-emphasis mb-3">Two biomarkers (synthetic)</div>
                  <ScatterChart :data="biomarkerScatter" x="x" y="y" x-label="Marker A" y-label="Marker B" title="Biomarker correlation" />
                </v-card>
              </v-col>
              <v-col cols="12" md="6">
                <v-card class="pa-4" border>
                  <div class="text-title-medium font-weight-bold mb-1">Radar · profile</div>
                  <div class="text-body-small text-medium-emphasis mb-3">Body-system profile, baseline vs current (synthetic)</div>
                  <RadarChart :indicators="systemIndicators" :series="systemProfiles" title="Body-system profile" :height="300" />
                </v-card>
              </v-col>
              <v-col cols="12" md="6">
                <v-card class="pa-4" border>
                  <div class="text-title-medium font-weight-bold mb-1">Heatmap · intensity</div>
                  <div class="text-body-small text-medium-emphasis mb-3">Adherence by weekday × week — uses the sequential palette (synthetic)</div>
                  <HeatmapChart :data="adherenceHeat" x="week" y="day" value="value" title="Adherence heatmap" :height="300" />
                </v-card>
              </v-col>
            </v-row>
          </section>

        </v-container>
      </v-defaults-provider>
    </v-main>

    <!-- overlays -->
    <v-snackbar v-model="snackbar" :timeout="2500">
      {{ snackText }}
      <template #actions>
        <v-btn variant="text" @click="snackbar = false">Close</v-btn>
      </template>
    </v-snackbar>

    <v-dialog v-model="dialog" max-width="420">
      <v-card>
        <v-card-title>Dialog title</v-card-title>
        <v-card-text>Dialogs inherit your card styling automatically.</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="dialog = false">Cancel</v-btn>
          <v-btn color="primary" @click="dialog = false">Confirm</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-app>
</template>

<script lang="ts" setup>
  import { computed, ref } from 'vue'
  import { useTheme } from 'vuetify'
  import type { AppIconName } from '@/icons/carbon'
  import AppPictogram from '@/components/AppPictogram.vue'
  import type { PictogramName } from '@/icons/pictograms'
  import { AreaChart, BarChart, DonutChart, GaugeChart, HeatmapChart, LineChart, RadarChart, ScatterChart } from '@/components/charts'
  import { adherenceHeat, adherenceTrend, biomarkerScatter, cohortTrend, doseTypesByDay, dosesByDay, healthScore, planBreakdown, systemIndicators, systemProfiles } from '@/data/chartSamples'

  // ── theme + density toggles ──────────────────────────
  const theme = useTheme()
  const isDark = computed(() => theme.global.name.value === 'dark')
  function toggleTheme () {
    theme.global.name.value = isDark.value ? 'light' : 'dark'
  }
  const density = ref<'default' | 'comfortable' | 'compact'>('comfortable')

  // ── icons ────────────────────────────────────────────
  // A representative slice of the app's vocabulary, not the whole map — the
  // point is to show the naming and how the DS sizes/colors them. Full list:
  // src/icons/carbon.ts.
  const sampleIcons: AppIconName[] = [
    'medication', 'pill', 'injection', 'lab', 'stethoscope', 'clinic',
    'weight', 'cardiac', 'activity', 'nutrition', 'hydration', 'vitals',
    'calendar', 'clock', 'overdue', 'history', 'records', 'notes',
    'messages', 'notification', 'cart', 'store', 'shipping', 'user',
    'levelLow', 'levelMedium', 'levelHigh',
  ]

  // ── pictograms ───────────────────────────────────────
  // Illustrative Carbon PICTOGRAMS (a separate, larger artifact from icons) for
  // empty states, onboarding and section headers — NOT UI glyphs. Full map:
  // src/icons/pictograms.ts; rendered by AppPictogram.vue.
  const samplePictograms: PictogramName[] = [
    'healthcare', 'doctorPatient', 'medication', 'prescription', 'stethoscope',
    'heartHealth', 'dna', 'telemedicine', 'appointments', 'records',
    'progress', 'goals', 'insights', 'onboardingWelcome', 'accountSecurity', 'profile',
  ]

  // ── demo state ───────────────────────────────────────
  const loading = ref(false)
  function fakeLoad () {
    loading.value = true
    setTimeout(() => (loading.value = false), 1500)
  }

  const check1 = ref(true)
  const check2 = ref(false)
  const radio = ref('one')
  const switch1 = ref(true)
  const switch2 = ref(false)

  const text1 = ref('Hello world')
  const showPw = ref(false)
  const num = ref(1)

  const fruits = ['Apple', 'Banana', 'Cherry', 'Date', 'Elderberry']
  const sel = ref('Apple')
  const chipSel = ref<string[]>([])
  const slideSel = ref('Action Plan')
  // segmented toggles — VBtnToggle single-select (default divided + pill-switch variant)
  const segView = ref('list')
  const segUnit = ref('kg')

  const slider = ref(40)
  const range = ref([20, 70])
  const rating = ref(3)

  const tab = ref('overview')
  const page = ref(1)

  // selectable cards — VCard has no built-in `active`, so selection is app state
  const plans = ['Standard', 'Priority', 'Concierge']
  const selectedPlan = ref('Priority')

  // interactive list — VListItem's built-in active state, driven by v-model:selected
  const navItems = [
    { value: 'messages', icon: 'messages', title: 'Messages' },
    { value: 'medication', icon: 'medication', title: 'Medications' },
    { value: 'history', icon: 'history', title: 'History' },
  ]
  const navSel = ref(['messages'])

  // stepper — the active step is v-model state (1-based)
  const stepItems = ['Account', 'Profile', 'Confirm']
  const step = ref(1)
  const stepV = ref(1)

  // date & time pickers — selected value is v-model state
  const date = ref(new Date())
  const time = ref('09:30')

  // otp verification code
  const otp = ref('')

  // file-upload dropzone (array because `multiple`)
  const upload = ref<File[]>([])

  // carousel — active slide index; slides tint from theme tokens
  const carouselSel = ref(0)
  const carouselSlides = [
    { color: 'primary', title: 'Track your plan', body: 'Doses, trends and reminders in one place.' },
    { color: 'secondary', title: 'Stay on schedule', body: 'A gentle nudge when a dose is due.' },
    { color: 'success', title: 'See your progress', body: 'Weekly summaries of how you\'re doing.' },
  ]

  // ── data table (static demo rows; status → semantic token) ───
  const tableRows = [
    { name: 'LDL Cholesterol', value: '145 mg/dL', status: 'High', color: 'error' },
    { name: 'HbA1C', value: '5.3%', status: 'Optimal', color: 'success' },
    { name: 'Blood Pressure', value: '130/85 mmHg', status: 'Watch', color: 'warning' },
  ]

  // ── type scale (the live MD3 classes in Vuetify 4.1.2) ───
  // px / weight read straight from vuetify/lib/styles/main.css so the labels match
  // what renders. The legacy text-h*/body-N classes are absent in v4 (no-ops).
  const typeScale = [
    // Specimen strings are deliberately domain-neutral: this is a template, so the
    // type scale must read the same whatever product is built on it. They are NOT
    // bound to brand.identity — a long product name would overflow display-large.
    { family: 'Display', sample: 'Typeface', items: [
      { cls: 'text-display-large', px: 57, weight: 400 },
      { cls: 'text-display-medium', px: 45, weight: 400 },
      { cls: 'text-display-small', px: 36, weight: 400 },
    ] },
    { family: 'Headline', sample: 'Section overview', items: [
      { cls: 'text-headline-large', px: 32, weight: 400 },
      { cls: 'text-headline-medium', px: 28, weight: 400 },
      { cls: 'text-headline-small', px: 24, weight: 400 },
    ] },
    { family: 'Title', sample: 'Card title goes here', items: [
      { cls: 'text-title-large', px: 22, weight: 400 },
      { cls: 'text-title-medium', px: 16, weight: 500 },
      { cls: 'text-title-small', px: 14, weight: 500 },
    ] },
    { family: 'Body', sample: 'Supporting paragraph text, set at a comfortable reading measure.', items: [
      { cls: 'text-body-large', px: 16, weight: 400 },
      { cls: 'text-body-medium', px: 14, weight: 400 },
      { cls: 'text-body-small', px: 12, weight: 400 },
    ] },
    { family: 'Label', sample: 'Status label', items: [
      { cls: 'text-label-large', px: 14, weight: 500 },
      { cls: 'text-label-medium', px: 12, weight: 500 },
      { cls: 'text-label-small', px: 11, weight: 500 },
    ] },
  ]

  // ── token scales (foundations reference) ─────────────
  // Real px so nobody has to look them up. Sources (verified against the installed
  // Vuetify 4 source + src/styles/settings.scss):
  //  • spacing: $spacer = 4px  →  pa-N / ma-N / ga-N = 4 × N
  //  • radius:  the $rounded map in settings.scss (NOT the stale comment above it)
  //  • sizing:  each component's size-prop scale, computed at root 16px / density=default
  const spacingScale = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16].map(n => ({ n, px: n * 4 }))

  const radiusScale = [
    { cls: 'rounded-0', px: '0' },
    { cls: 'rounded-sm', px: '12px' },
    { cls: 'rounded', px: '16px' },
    { cls: 'rounded-lg', px: '24px' },
    { cls: 'rounded-xl', px: '48px' },
    { cls: 'rounded-2xl', px: '52px' },
    { cls: 'rounded-pill', px: '9999' },
    { cls: 'rounded-circle', px: '50%' },
  ]

  // The five shared size tokens, and what each renders as per component (px).
  const sizeTokens = ['x-small', 'small', 'default', 'large', 'x-large']
  const sizeScale = [
    { label: 'Button (height)', px: [20, 28, 36, 44, 52] },
    { label: 'Icon button (box)', px: [32, 40, 48, 56, 64] },
    { label: 'Avatar', px: [24, 32, 40, 48, 56] },
    { label: 'Chip (height)', px: [20, 26, 32, 38, 44] },
    { label: 'Icon (font-size)', px: [16, 20, 24, 28, 32] },
    { label: 'Progress circular', px: [16, 24, 32, 48, 64] },
  ]

  // Density scale — component height (px) at each density level, verified against the
  // installed Vuetify source: each component's `$…-density` map × $spacer (4px) applied
  // to its base height. Columns use the gallery toggle's names (Cozy = default,
  // Comfort = comfortable, Compact = compact). Sources:
  //  • input (VField)  56 · $input-density (0,-2,-4) → 56/48/40
  //  • button (VBtn)   36 · $button-density (0,-2,-3) → 36/28/24
  //  • chip (VChip)    32 · $chip-density (0,-1,-2) → 32/28/24
  //  • list 1-line     48 · $list-density (0,-1,-2) → 48/44/40
  //  • table row       52 · $table-density (0,-2,-4) → 52/44/36
  //  • tabs (VTabs)    48 · $tabs-density (0,-1,-3) → 48/44/36
  const densityTokens = ['Cozy', 'Comfort', 'Compact']
  const densityScale = [
    { label: 'Text field (input)', px: [56, 48, 40] },
    { label: 'Button (height)', px: [36, 28, 24] },
    { label: 'Chip (height)', px: [32, 28, 24] },
    { label: 'List item (1-line)', px: [48, 44, 40] },
    { label: 'Table row', px: [52, 44, 36] },
    { label: 'Tabs (height)', px: [48, 44, 36] },
  ]

  // Theme color tokens, grouped, rendered live from --v-theme-* (so light/dark toggle
  // works). The names mirror the palette in src/plugins/vuetify.ts → theme.themes.
  const colorGroups = [
    { group: 'Brand', tokens: ['primary', 'primary-darken-1', 'secondary', 'secondary-darken-1'] },
    { group: 'Surfaces', tokens: ['background', 'surface', 'surface-bright', 'surface-light', 'surface-variant'] },
    { group: 'Status', tokens: ['error', 'info', 'success', 'warning'] },
  ]

  // Everything in the LIVE theme that `colorGroups` doesn't already list. That array is
  // hand-curated, so on a rebrand (this repo is a template) a newly added token would be
  // invisible here — the grid would look complete while silently omitting it. Enumerating
  // the real theme catches that. `on-*` pairs are excluded: they're the foreground colors
  // Vuetify derives for each surface, not palette entries a designer picks.
  const groupedTokens = new Set(colorGroups.flatMap(g => g.tokens))
  const ungroupedTokens = computed(() =>
    Object.keys(theme.current.value.colors)
      .filter(t => !t.startsWith('on-') && !groupedTokens.has(t))
      .sort(),
  )

  // The opacity/emphasis half of the palette — theme.variables, not theme.colors, so the
  // swatch grid above can't surface them. Read live (like the colors) so numbers track light/dark.
  const emphasisLevels = [
    { cls: 'text-high-emphasis', varName: 'high-emphasis-opacity' },
    { cls: 'text-medium-emphasis', varName: 'medium-emphasis-opacity' },
    { cls: 'text-disabled', varName: 'disabled-opacity' },
  ]
  const stateOverlays = ['hover', 'focus', 'selected', 'activated', 'pressed', 'dragged', 'idle']
  const themeVars = computed(() => theme.current.value.variables)

  // ── THE CONTROL-PANEL INDEX ─────────────────────────────────────────────
  // Every knob a designer can swap by hand, grouped by what it changes, mapped to
  // the ONE file to open. Project-relative paths. `reload` flags whether the edit
  // shows instantly (hot-reload — vuetify.ts / .ts data / CSS) or needs a dev-server
  // restart (RESTART — Sass in settings.scss is build-time). Rendered as the first
  // section of the Storybook so it's the first thing a designer sees.
  const editMap = [
    {
      group: 'Colors',
      rows: [
        { what: 'Brand & status palette (light + dark)', file: 'src/plugins/vuetify.ts', where: 'theme.themes.*.colors · hot-reload' },
        { what: 'Color-with-opacity knobs — border / emphasis / state overlays', file: 'src/plugins/vuetify.ts', where: 'theme.themes.*.variables · hot-reload' },
      ],
    },
    {
      group: 'Data viz',
      rows: [
        { what: 'Chart palettes (categorical / sequential / diverging) + mark sizes + type', file: 'src/data/chartTheme.ts', where: 'whole file · hot-reload — re-run the palette validator after changing categorical' },
      ],
    },
    {
      group: 'Spacing, radius & sizing',
      rows: [
        { what: 'Spacing base ($spacer = 4px) — drives every pa-/ma-/ga- utility', file: 'src/styles/settings.scss', where: '$spacer · RESTART' },
        { what: 'Radius scale — sm / md / lg / xl / pill …', file: 'src/styles/settings.scss', where: '$rounded map · RESTART' },
        { what: 'Component size scale (x-small … x-large)', file: 'src/styles/settings.scss', where: 'size scales · RESTART' },
      ],
    },
    {
      group: 'Special radii',
      rows: [
        { what: 'Content-card radius (md / 16px) — app-wide default', file: 'src/plugins/vuetify.ts', where: 'defaults.VCard.rounded · hot-reload' },
        { what: 'Section-panel radius (24px) — the outer wrapper tier', file: 'src/styles/overrides.css', where: '--section-radius + .section-panel · hot-reload' },
      ],
    },
    {
      group: 'Type',
      rows: [
        { what: 'Font family (Onest) + type scale', file: 'src/styles/settings.scss', where: '$body-font-family, type vars · RESTART' },
      ],
    },
    {
      group: 'Components',
      rows: [
        { what: 'Default look of every component (variant / size / density / rounded / color)', file: 'src/plugins/vuetify.ts', where: 'defaults · hot-reload' },
        { what: 'Vuetify-quirk CSS fixes (last-word overrides)', file: 'src/styles/overrides.css', where: 'documented rules · hot-reload' },
      ],
    },
    {
      group: 'Identity & icons',
      rows: [
        { what: 'Product name / description / brand copy (live)', file: 'src/data/brand.ts', where: 'identity · hot-reload' },
        { what: 'Icon set — semantic keys → IBM Carbon', file: 'src/icons/carbon.ts', where: 'appIcons + vuetifyAliases · hot-reload' },
      ],
    },
    {
      group: 'Read-only reference',
      rows: [
        { what: 'Live token viewer (swatches / spacing / radius)', file: 'this Storybook — Colors + Spacing sections', where: '—' },
        { what: 'Full Sass variable catalog (~764 vars)', file: 'src/styles/sass-variables-reference.md', where: 'reference doc' },
      ],
    },
  ]

  // Per-token px for the icon showcase row (mirrors the Icon row above).
  const iconSizes = [
    { token: 'x-small', px: '16' },
    { token: 'small', px: '20' },
    { token: 'default', px: '24' },
    { token: 'large', px: '28' },
    { token: 'x-large', px: '32' },
  ]

  const snackbar = ref(false)
  const snackText = ref('Snackbar message')
  function notify (text: string) {
    snackText.value = text
    snackbar.value = true
  }
  const dialog = ref(false)

  const people = [
    { name: 'Ava Stone', role: 'Cardiology' },
    { name: 'Ben Cole', role: 'Neurology' },
    { name: 'Cara Diaz', role: 'Pediatrics' },
  ]

  const tableHeaders = [
    { title: 'Name', key: 'name' },
    { title: 'Role', key: 'role' },
    { title: 'Visits', key: 'visits' },
    { title: 'Status', key: 'status' },
  ]
  const tableItems = [
    { name: 'Ava Stone', role: 'Cardiology', visits: 12, status: 'Active' },
    { name: 'Ben Cole', role: 'Neurology', visits: 4, status: 'Inactive' },
    { name: 'Cara Diaz', role: 'Pediatrics', visits: 9, status: 'Active' },
    { name: 'Dan Frey', role: 'Oncology', visits: 2, status: 'Inactive' },
    { name: 'Eve Lang', role: 'Radiology', visits: 7, status: 'Active' },
  ]
</script>

<style scoped>
  /* monospace numeric labels for the token-scale references */
  .mono { font-family: monospace; }

  /* spacing scale — a primary square whose side IS the px value */
  .spacing-swatch {
    background-color: rgb(var(--v-theme-primary));
    border-radius: 2px;
    flex-shrink: 0;
  }

  /* radius scale — a fixed 56px tile carrying each rounded-* class so the corner
     radius is shown to scale (pill/circle read as a full round at this size) */
  .radius-swatch {
    width: 56px;
    height: 56px;
    background-color: rgba(var(--v-theme-primary), 0.14);
    border: 1.5px solid rgb(var(--v-theme-primary));
  }

  /* size-scale table — a compact monospace grid (Component + 5 tokens) */
  .sizing-table {
    font-family: monospace;
    font-size: 13px;
    max-width: 640px;
    border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    border-radius: 8px;
    overflow: hidden;
  }
  .sizing-row {
    display: grid;
    grid-template-columns: 1.5fr repeat(5, 1fr);
  }
  /* the density table has 3 value columns (Cozy/Comfort/Compact), not 5 */
  .density-cols .sizing-row {
    grid-template-columns: 1.5fr repeat(3, 1fr);
  }
  .sizing-row > span {
    padding: 8px 10px;
    text-align: right;
  }
  .sizing-row > span:first-child {
    text-align: left;
  }
  .sizing-row + .sizing-row {
    border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  }
  .sizing-head {
    background-color: rgba(var(--v-theme-on-surface), 0.04);
    font-weight: 600;
  }

  /* color swatch — a token-filled tile; the border keeps white surfaces visible */
  .color-swatch {
    width: 100%;
    height: 52px;
    border-radius: 8px;
    border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  }

  /* state-overlay swatch — a real surface tile with the state overlay layered on top,
     so the tile shows the true strength of the overlay (not the raw rgba on white) */
  .state-swatch {
    position: relative;
    width: 100%;
    height: 52px;
    border-radius: 8px;
    background-color: rgb(var(--v-theme-surface));
    border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    overflow: hidden;
  }
  .state-swatch__overlay {
    position: absolute;
    inset: 0;
  }

  /* border swatch — shows the border token (color + opacity) on an empty tile */
  .border-swatch {
    width: 108px;
    height: 52px;
    border-radius: 8px;
    border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  }

  /* "where each token lives" — a compact 3-column monospace index */
  .edit-map {
    font-family: monospace;
    font-size: 12.5px;
    max-width: 880px;
    border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    border-radius: 8px;
    overflow: hidden;
  }
  .edit-row {
    display: grid;
    grid-template-columns: 1.4fr 1.3fr 1.6fr;
  }
  .edit-row > span {
    padding: 8px 12px;
    min-width: 0;
    word-break: break-word;
  }
  .edit-row + .edit-row {
    border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  }
  .edit-head {
    background-color: rgba(var(--v-theme-on-surface), 0.04);
    font-weight: 600;
  }
  /* group sub-header spanning the full table width, splitting the rows by category */
  .edit-group {
    padding: 6px 12px;
    font-weight: 700;
    color: rgb(var(--v-theme-primary));
    background-color: rgba(var(--v-theme-primary), 0.06);
    border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  }
</style>
