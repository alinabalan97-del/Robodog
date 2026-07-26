---
name: vuetify-ds
description: >-
  THE styling/token authority for this app (Vue 3 + Vuetify 4) — colors, radius, spacing,
  type, and components. Use when building or restyling any UI: picking theme colors, applying
  spacing/radius utilities, changing component defaults, or composing a card, header, list, dialog,
  etc. The DS is the styling config (vuetify.ts + settings.scss) and applies to the WHOLE Vuetify
  library; the Storybook (src/screens/Storybook.vue) previews only a curated subset — when a needed
  component isn't there, pull it from the full Vuetify library and add it to the Storybook. This
  owns HOW things look; for how a screen is arranged (composition, hierarchy, copy) use
  frontend-design, and to audit a finished screen (accessibility, forms, states) use
  web-design-guidelines.
---

# Vuetify Design System

Stack: **Vue 3 + Vite + Vuetify 4 + Pinia**, TypeScript, **pnpm** (run via `corepack pnpm`).
Icons: **IBM Carbon** via `@carbon/icons-vue`, referenced by SEMANTIC KEY (`icon="settings"`),
never a vendor name and never `mdi-*`. App code lives at the repo root. Run with `corepack pnpm dev`.

**Adding or changing an icon:** add the key to `src/icons/carbon.ts` (importing the `…24` variant),
then use it in any Vuetify icon prop or `<app-icon name="…" />`. Don't import a Carbon component
directly into a screen — the map is the single source of truth, and it's what makes a future icon
swap one file instead of nineteen. Sizing and color need nothing special: the svg renders at `1em`
with `fill="currentColor"`, so `size`/`color` props and text-color classes work as they always did.

## What "the DS" actually is

The design system is the **styling configuration**, not a fixed list of components:

| Layer | File | What it holds | Reloads how |
|---|---|---|---|
| **Theme** | `src/plugins/vuetify.ts` → `theme.themes` | Brand color palette (light + dark) + theme variables (border/emphasis/state opacities) | **Hot-reload** |
| **Defaults** | `src/plugins/vuetify.ts` → `defaults` | Default look of each component (variant, shape, size, density…) | **Hot-reload** |
| **Style scales** | `src/styles/settings.scss` | Radius, spacing, sizing, type — build-time Sass vars | **Restart dev server** |

This config styles the **entire Vuetify 4 component library uniformly**. Any `<v-...>` you drop
into a screen automatically inherits these colors, radii, spacing, and defaults — you do **not**
have to register a component anywhere to use it.

`vuetify.ts` is the **design control panel**: the single place to change how the whole app looks
globally. The full per-component Sass knob list (~764 vars) lives in
`src/styles/sass-variables-reference.md` (reference only; set the few you need in `settings.scss`).

## The DS preview is a curated subset — not the limit

`src/screens/Storybook.vue` is a **living preview** ("kitchen sink") of the components
the app has adopted so far, rendered with the real theme. It exists to *see* the styling, not to
*bound* it. The **full Vuetify library is available** in any screen — the Storybook just shows the
slice that's been used/curated. It is a **standalone dev-only app** — not a product route and not
linked from the app — served on **port 3001** by `corepack pnpm dev:storybook` (or `dev:all` to run
it alongside the product app on 3000). Toggle light/dark + density at the top of the page to check
every state at once.

## Component selection logic (follow this every time you build a screen)

1. **Check the preview first.** Look in `Storybook.vue` for a component (and snippet) that
   fits the request. If one fits, copy it and tweak props. Mine `Storybook.vue` for the
   composed, DS-correct patterns — it ships with the DS, whereas screens may not exist yet.
2. **If nothing fits, search the full Vuetify library** (https://vuetifyjs.com — the complete
   component set). Pick the component whose semantics match the request.
3. **If you find one there, do BOTH:**
   - Use it in the screen — it inherits the DS styling automatically.
   - **Add it to the preview**: drop its `<v-...>` into a new `<section>` in
     `Storybook.vue` so the preview grows to reflect what the DS now covers (see "Adding a
     component to the preview" below).
4. **Never hand-roll** bespoke markup/CSS for something Vuetify already provides — start from a
   Vuetify component + props, not from scratch.

## Chart / data-viz selection logic (same rule, for charts)

Charts do **not** come from Vuetify — they come from the **ECharts chart kit** in
`src/components/charts` (Apache ECharts + `vue-echarts`). Same three-step order as components:

1. **Check the kit first.** Presets: `LineChart` · `BarChart` · `AreaChart` · `DonutChart` ·
   `GaugeChart` · `ScatterChart` · `RadarChart` · `HeatmapChart` — dataset-driven (typed props:
   `data` + key names). See them in the **Data viz** section of `Storybook.vue`. If one fits, use it.
2. **Else modify/extend a preset** — adjust its props or its ECharts `option`; styling still flows
   from the tokens.
3. **Only then build a custom chart** — a new preset on the same `BaseChart` bridge +
   `baseChartOption` theme, wired to `src/data/chartTheme.ts` tokens, registering any new ECharts
   module in `BaseChart.vue`'s `use([...])`, and **added to the Storybook Data viz section**.

The data-viz DS is one variables file, `src/data/chartTheme.ts` (categorical / sequential /
diverging palettes + mark sizes + type), compiled to the ECharts theme in `baseOption.ts`. Never
hardcode a chart hex/px; never add a second charting library; **status colors are reserved for
state, never a series color**. The `categorical` order is load-bearing (validated colorblind-safe);
if you change it, re-validate with the `dataviz` skill's checker — no validator script ships here.

## State ownership: pick the component by which states it already has

Interaction states split in two, and the split decides which component to reach for:

- **Default states — free from the DS.** hover, focus, ripple, `disabled`, `loading`, and `active`
  *on components that expose it*. Theme-styled; you write nothing.
- **Custom states — always app code.** Domain meaning (selected, in-cart, flagged) and bespoke
  interactions (a button that appears on hover) are never built in — a `ref` + handler + your own CSS.

**The rule:**

| You want… | Use | Because |
|---|---|---|
| an interaction the DS already ships (hover / ripple / focus / `disabled` / `loading`) | `v-card`, `v-list-item`, `v-btn`, `v-chip` | the state is built-in and theme-styled — zero code |
| a **custom** interaction the DS has no concept of (reveal-on-hover, bespoke selected look) | **`v-sheet`** + scoped CSS/refs | a theme-styled but *stateless* surface — no built-in overlay/ripple to fight |

`v-sheet` is the right base for custom precisely because it has **no** interaction states: your
hover/reveal is the only state, not layered under Vuetify's. The same thing on `v-card` means
suppressing its overlay + ripple first.

**Know a component's states before choosing:** cmd-click any `<v-…>` to its `.d.ts` (or the Vuetify
API tab) and scan props for state words — `hover`, `active`, `loading`, `disabled`, `selected`.
Presence = the state exists and is styled. ⚠️ **`v-card` has no `active`/selected state; `v-sheet`
has none at all** — so "selected" always costs code, even on a card.

Default vs custom, side by side:

```vue
<!-- DEFAULT: v-card owns hover + ripple + focus + click -->
<v-card link @click="open()">…</v-card>

<!-- CUSTOM: v-sheet is a blank styled surface; you author the state -->
<v-sheet class="row" rounded="sm" border>
  <span class="flex-grow-1">…</span>
  <v-btn class="row-btn" size="small">Add</v-btn>
</v-sheet>
```
```css
.row-btn { opacity: 0; transition: opacity .15s ease; }   /* reserved, not display:none → no shift */
.row:hover .row-btn,
.row:focus-within .row-btn { opacity: 1; }                /* :focus-within = keyboard parity */
```

**Going custom, you inherit the accessibility the DS would have given you.** A `v-card link` provides
the focus ring + keyboard activation free; a `v-sheet` does not. Always pair `:hover` with
`:focus-within` (or `:focus-visible`), and reserve revealed elements with opacity — not `display` —
so nothing shifts. On a high-trust product this is a requirement, not polish.

## Adding a component to the preview

`Storybook.vue` is plain sections — copy an existing one. Each is:

```vue
<section class="mb-12">
  <div class="text-h5 font-weight-bold mb-1">My Group</div>
  <div class="text-body-2 text-medium-emphasis mb-4">VNewComponent · VOther</div>
  <!-- drop the <v-...> examples here, showing the variants/states you care about -->
  <v-new-component variant="tonal" rounded="lg" />
</section>
```

Vuetify `<v-…>` components need no import (`vite-plugin-vuetify` auto-imports them). **Local
components do NOT auto-import** (`unplugin-vue-components` isn't installed) — add an explicit
`import` for any `src/components/*` you use. Add the new component to either the closest existing
group or a new `<section>`. If it has
styling props worth standardizing app-wide, also uncomment/add its block in `vuetify.ts`
`defaults`.

## ⚠️ Defining a color ≠ applying it (and the Storybook can mislead)

Two separate things:

- **`theme.colors.primary` only NAMES** what `primary` means (a hex). It does **not** make any
  component use it. Most inputs (checkbox, radio, switch, text field, slider) ship with **no
  default color** → they render in the text color (black in light theme), even though `primary`
  exists in the palette.
- To brand a component you must **assign** the color — per-instance (`color="primary"`) or, better,
  as a global default in `vuetify.ts` `defaults` (e.g. `VCheckbox: { color: 'primary' }`).

**The Storybook can lie:** `Storybook.vue` examples sometimes hardcode `color="primary"`
inline, so a control looks branded there but renders black on a real screen that omits the prop.
When something looks branded in the Storybook, **confirm it's set in `vuetify.ts` `defaults`** — not
just inline on the example. If it should be app-wide, set the default (single source of truth) and
drop the redundant inline props. Active brand defaults today: `VCheckbox`, `VRadioGroup`, `VSwitch`
= `color: 'primary'`.

## Colors

Theme tokens defined in `vuetify.ts` for both `light` and `dark` (stock Vuetify set — edit a hex
to rebrand): `background`, `surface`, `surface-bright`, `surface-light`, `surface-variant`,
`primary`, `primary-darken-1`, `secondary`, `secondary-darken-1`, `error`, `info`, `success`,
`warning`. Plus `variables` (border color/opacity, emphasis opacities, state opacities) used
app-wide.

**Use a token — never a raw hex in a component.** Three ways:

- **`color` prop**: `<v-btn color="primary">`, `<v-sheet color="surface-light">`.
- **Utility classes**: background `bg-primary` / `bg-surface-light`; text `text-primary`,
  `text-medium-emphasis`, `text-white`.
- **CSS var** inside `:style`: `rgb(var(--v-theme-primary))`,
  `backgroundColor: \`rgb(var(--v-theme-${name}))\``.

Switch theme at runtime via `useTheme()` (`theme.global.name.value = 'dark'`) — see the toggle in
`Storybook.vue` — its **Colors** section renders live swatches for both themes.

## Radius

One shared scale (`$rounded` map in `settings.scss`), same tokens for every component that accepts
`rounded`: `0` · `sm` 12 · `rounded`/`md` 16 · `lg` 24 · `xl` 48 · `2xl` 52 · `pill` 9999 ·
`circle` 50%. Apply with the **`rounded` prop** (`<v-card rounded="pill">`) or the **utility class**
(`class="rounded-lg"`). To reshape the whole scale, edit the `$rounded` map (then restart).

### Card radius: two tiers, both variable-driven — attach these, don't hardcode

The app has **two card-radius tiers**, each controlled by ONE variable. When you build a screen,
wire a card to its tier — never pin a raw `rounded` value on a card that belongs to a tier:

| Tier | What it is | How to attach | Variable |
|---|---|---|---|
| **Content card** | the cards a user reads (concern, step, product, panel) | **omit `rounded`** — it inherits the default | `VCard: { rounded: 'md' }` (16px) in `vuetify.ts` |
| **Section panel** | the outer `bg-background-*` containers that WRAP content | add **`class="section-panel"`** (no `rounded`) | `--section-radius` (24px) in `overrides.css` |

The two tiers keep nesting concentric (24 outside, 16 inside), and each moves from a single edit. A
section panel is itself a `v-card`/`v-sheet`, so it can't carry its own `VCard` default — that's why
it attaches via the `.section-panel` class instead of a prop.

**When generating a new screen:**
- Wrap each section's outer container in `class="section-panel"` (never `rounded="lg"`).
- Leave content cards with **no `rounded`** so they inherit the `md` default.
- **Only pass an explicit `rounded="…"`** when the request calls for a radius that isn't one of
  these tiers — a deliberate one-off (a `pill` promo, a `sm` compact row, a specific value the user
  asked for). That's the sole exception; otherwise every card attaches to a tier.

## Spacing

Base unit `$spacer: 4px` (`settings.scss`) drives every spacing utility and most component padding.

- **Padding / margin**: `pa-N`, `px-/py-`, `pt-/pr-/pb-/pl-`, and `ma-*` equivalents. `pa-1` = 4px,
  `pa-4` = 16px, `pa-8` = 32px. Negative margin: `ma-n2`.
- **Flex/grid gap**: `ga-N` (`ga-2`, `ga-3`) on flex containers.
- **Grid**: `<v-row>` / `<v-col cols sm md>` with `$grid-gutter` (default 24px).

Layout uses flex utilities throughout: `d-flex align-center justify-center flex-wrap flex-grow-1
w-100`. Copy these patterns from `Storybook.vue` rather than writing custom CSS.

## Type

Font is **Onest** (`$body-font-family` in `settings.scss`; loaded via `unplugin-fonts`). Use
typography utility classes, never raw font-size.

⚠️ **Vuetify 4 uses the MD3 type scale.** The classes that actually apply a size are
`text-{display|headline|title|body|label}-{large|medium|small}` (15 steps). The **legacy
`text-h1…h6` / `text-subtitle-1/2` / `text-body-1/2` / `text-caption` / `text-overline` classes
are NO-OPS in v4** — they render at default size. See the live scale (with px/weight) in the
**Typography** section of `Storybook.vue`. Common sizes: `headline-small` 24 · `title-large`
22 · `title-medium` 16/500 · `body-large` 16 · `body-medium` 14 · `body-small` 12 · `label-small` 11.

**Two rules for applying type:**

1. **Plain elements you author** (`<h1>`, `<h2>`, `<p>`, `<div>`, `<span>`) have no size → give
   them an MD3 `text-*` class. Page title → `text-headline-small`; section heading →
   `text-title-medium`; lead paragraph → `text-body-medium`; eyebrow → `text-label-small`
   (in sentence/title case — **do not** add `text-uppercase`; see the casing rule in Don't).
2. **Vuetify component slots** (`v-card-title`, `v-list-item-title`, `v-card-subtitle`, `v-btn`,
   `v-chip`…) are **already sized** by the component (their values mostly match the MD3 scale, e.g.
   `v-card-title` = 22/400 = `title-large`). **Don't add a size class to them** — only add
   `font-weight-*`, `text-medium-emphasis`, or a color class. Add a `text-*` size class only to
   deliberately override the default.

Weight/emphasis utilities (`font-weight-bold/medium/regular`, `text-medium-emphasis`) work on
everything regardless of the above.

## Restyling components

Two scopes:

- **Global default** (every instance) → uncomment the component block in `vuetify.ts` `defaults`
  and set the prop. The file ships a full commented menu of each common component's styling props
  with Vuetify's default (`—` = no fixed default; supply your own). Hot-reloads. Example:
  ```ts
  defaults: { VCard: { variant: 'outlined', rounded: 'lg' } }
  ```
- **One instance** → set props inline: `<v-card variant="tonal" rounded="xl" elevation="2"
  color="surface">`.
- **Density for a subtree** → wrap in `<v-defaults-provider :defaults="{ global: { density } }">`.

Common props (from the `defaults` menu): `variant` (`elevated` | `flat` | `tonal` | `outlined` |
`text` | `plain`), `size` (`x-small`…`x-large`), `density` (`default` | `comfortable` |
`compact`), `rounded`, `color`, `elevation` (0–24), `border`, `tile`, `flat`.

### State styling — three scopes, one boundary

- **A state's *parameters* (color, intensity)** → config, no CSS. The overlay opacities live in
  `vuetify.ts` `theme.variables` and tune every component at once (hot-reload): `hover-opacity`,
  `focus-opacity`, `pressed-opacity`, `activated-opacity`, `selected-opacity`, `disabled-opacity`.
  Raise `hover-opacity` → every hover across the app strengthens.
- **A state's *form* (e.g. hover fill → colored border)** → central CSS in `src/styles/overrides.css`
  (imported last, wins). One rule, whole platform — but it targets Vuetify internals: per-component
  selectors, usually `!important`, version-fragile. Reserve it for form changes a prop/token can't
  express.
  ```css
  .v-card:hover > .v-card__overlay { opacity: 0 !important; }        /* kill the fill */
  .v-card--link:hover { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: -2px; }
  ```
- **A state the component doesn't have** → neither config nor CSS can invent it; that's app code
  (see "State ownership" above).

**Active/selected is class-driven — never per-item color.** Bind `:active` (a boolean), let Vuetify
stamp `.v-…--active`, and style that class once (or let `color` on the parent cascade):

```vue
<v-list-item v-for="i in items" :key="i.id" :active="i.id === current" :title="i.label" />
```
```css
.nav :deep(.v-list-item--active) { background-color: rgba(var(--v-theme-primary), 0.12); }
.nav :deep(.v-list-item--active .v-list-item__overlay) { opacity: 0; }  /* custom look → drop default overlay */
```

## Workflow

1. Iterate look in **`Storybook.vue`** (`corepack pnpm dev:storybook`, port 3001); toggle
   light/dark + density to check every state.
2. Change **colors / defaults** in `vuetify.ts` (hot-reload) — verify in the Storybook.
3. Change **radius / spacing / type** in `settings.scss` — **restart `corepack pnpm dev`**.
4. Build screens via the **selection logic** above; when you adopt a new Vuetify component, add it
   to the Storybook preview.
5. Check live token values any time in the Storybook's **Colors** and **Spacing, radius & sizing**
   sections. Any theme token not filed into `colorGroups` shows up there under *Uncategorised*.

## Don't

- Don't treat the Storybook as the limit — the whole Vuetify library is usable and styled by the DS.
- Don't adopt a new Vuetify component without adding it to the Storybook preview.
- Don't hardcode hex colors, px paddings, or px radii — use tokens, `pa-*`, and `rounded-*`.
- Don't hand-roll markup/CSS when a Vuetify component + props will do.
- Don't build a custom interaction on a component that already ships it — reach for `v-sheet` only
  when the DS has no such state; otherwise use the component that owns it.
- Don't hand-roll a custom state without keyboard parity — pair `:hover` with
  `:focus-within`/`:focus-visible`, and reserve revealed elements with opacity, not `display`.
- Don't set active/selected color per item — bind `:active` and style the `--active` class once.
- Don't pin a card's radius — a section container gets `class="section-panel"`, a content card gets
  no `rounded` (inherits `md`). Set `rounded="…"` only for a deliberate one-off the user asked for.
- Don't put color in `settings.scss` (Sass/build-time) or raw Sass dimensions in `vuetify.ts`.
- Don't forget to restart the dev server after editing `settings.scss`.
- **Don't uppercase text unless the user explicitly asks.** No `text-uppercase` utility, no
  all-caps string literals, no `text-transform: uppercase` in CSS. Write labels, eyebrows, section
  headers, buttons, and chips in sentence case (or Title Case where a proper name warrants it).
  All-caps is opt-in per request only — never a default styling choice.
