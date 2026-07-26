# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

> **{{PROJECT_NAME}}** — {{PROJECT_DESCRIPTION}}
>
> Domain: {{PROJECT_DOMAIN}}

<!-- TEMPLATE-ONLY:start — /new-project deletes this whole block when it configures the repo -->

**⚠️ This repo is an UNCONFIGURED PROJECT TEMPLATE.** The tokens above are placeholders. It ships a
working design system, chart kit, and Storybook — but **no product screens and no product
identity**. Both are built per project.

**Before doing product work, check whether the template has been configured:**

```bash
grep -rn '{{[A-Z_]*}}' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.claude .
```

`--exclude-dir=.claude` matters: the skills *document* the tokens in prose, so without it this
check never comes back clean.

If it returns hits, the project is still unconfigured. Run the **`/new-project`** skill — a short
brand-intake quiz that fills in the identity, colors, and radius. Do not silently invent a product
name, description, or domain to fill a token; either run the quiz or ask.

The full token list is in `README.md`. The live one is `src/data/brand.ts` → `brand.identity`:
screens import it, so a rename inside the app is one edit there. Files that can't import a TS
module (`index.html`, `storybook.html`, `package.json`, `README.md`, this file) carry the literal
token instead.

**No stock logo ships.** A wordmark drawn as vector paths can't be find-and-replaced, so the
template includes no logo component rather than baking another product's name into artwork. When
you build one, put it in `src/components/` and bind `:aria-label="brand.identity.name"`.

<!-- TEMPLATE-ONLY:end -->

### Domain rules

<!-- TEMPLATE-ONLY:start — replace with the real domain rules; keep the domain-agnostic list below -->

`{{PROJECT_DOMAIN}}` is a placeholder for what this product actually is. **When `/new-project` sets
the domain, write the domain-specific rules here** — the constraints that apply because of what the
product does (regulated data, safety-critical figures, financial accuracy, minors, etc.). Until
then, only the domain-agnostic rules below apply.

<!-- TEMPLATE-ONLY:end -->

These hold for **every** project built on this template, whatever the domain:

- **Never fabricate data that looks authoritative.** Figures, units, labels, names, prices, and
  statistics in an unbuilt product are placeholders — keep them *clearly* synthetic, and flag
  anything that would need a subject-matter expert to sign off.
- **Clarity and accessibility are requirements, not polish.** Legible type, sufficient contrast,
  unambiguous states (error/success/warning), accessible labels on every interactive element.
- **No destructive or irreversible actions without explicit confirmation** in the UI.

## ⛔ Two mandatory skills

**Any UI change — a screen, component, layout, color, spacing, or style — requires loading
`/vuetify-ds` first.** Every time, not just the first. It is the authority on the design system,
the component-selection order, and the tokens-not-hex rule. If a request involves UI and you
haven't loaded it, stop and load it.

**Any chart, graph, plot, or dashboard visualization goes through the chart kit** in
`src/components/charts` (Apache ECharts + `vue-echarts`). Never drop in a raw `<v-chart>`, and
**never add a second charting library** (D3, Observable Plot, Chart.js, Carbon/Ant charts). The
selection order and the theming rules live in `/vuetify-ds` → *Chart / data-viz selection logic*;
the presets are `LineChart` · `BarChart` · `AreaChart` · `DonutChart` · `GaugeChart` ·
`ScatterChart` · `RadarChart` · `HeatmapChart`, and `Storybook.vue`'s **Data viz** section shows
correct usage of each.

Two chart rules worth repeating here because breaking them is silent: colors/fonts/sizes come from
`src/data/chartTheme.ts` alone — never a hardcoded chart hex/px — and **status colors
(success/error/warning) are reserved for state, never a data-series color.**

The `categorical` palette was validated colorblind-safe against the real light/dark surfaces and
**its order is load-bearing.** If you add or reorder one, re-validate before shipping — load the
`dataviz` skill for the method and its checker. **No validator script ships in this repo**, so
"re-run the validator" means that skill, not a local file.

## Skills

`vuetify-ds` is the **one authority** on this project's design conventions; every other skill
defers to it. Skills auto-activate on their descriptions — this table is the tie-breaker.

| The task is… | Skill | Timing |
|---|---|---|
| Colors, spacing, radius, type, choosing/composing a Vuetify component | **vuetify-ds** | always, first (mandatory) |
| How a screen is *arranged* — composition, hierarchy, structure, UX copy | **frontend-design** | while designing |
| Auditing a finished screen — a11y, forms, focus, states, motion, copy | **web-design-guidelines** | after building |
| Vue/TS *code* — component typing, watchers, Volar/vue-tsc, defineModel | **vue-best-practices** | while coding |
| Starting a new project or rebranding this one | **new-project** | at project start |

When several apply to one screen: **vuetify-ds** (styling, always) → **frontend-design** (arrange)
→ build → **web-design-guidelines** (audit).

- **Reviewer skills must never define a design language.** Any critique skill is a *reviewer only* —
  don't let one generate a competing `design.md`, invent a palette or type scale, or ask the
  designer to define a design language. The DS already exists in `vuetify.ts` + `settings.scss` +
  `src/data/brand.ts`; point every review back at it.
- **The vue-ecosystem reference skills** (vuetify/vue/pinia/router) are for **upstream API facts
  only** — never for project conventions.

## Commands

All commands run from the **repo root** — the app lives at the root, not in a subfolder.

```bash
corepack pnpm install
corepack pnpm dev            # product app — Vite dev server on port 3000; boots MSW mocks first
corepack pnpm dev:storybook  # standalone DS Storybook on port 3001 (no router/MSW)
corepack pnpm dev:all        # both of the above at once (product :3000 + Storybook :3001)
corepack pnpm build          # type-check + vite build (product app only; Storybook has no build)
corepack pnpm preview        # serve dist/
node_modules/.bin/vue-tsc --build   # type-check only
```

- Use **`corepack pnpm`**, not bare `pnpm`.
- For type-check prefer `node_modules/.bin/vue-tsc --build` — the `corepack pnpm run type-check`
  wrapper currently fails a pre-run dep check.
- **There is no test suite and no runnable linter.** `eslint.config.js` references
  `eslint-config-vuetify`, which is not installed and has no npm script. Don't claim tests/lint
  passed; type-check + a dev-server smoke check is the available verification.
- After editing `src/styles/settings.scss`, **restart the dev server** (Sass is build-time; theme
  colors and component defaults in `vuetify.ts` hot-reload).

## Architecture

**Frontend-only engagement.** This codebase owns the UI layer, not the backend/auth/DB. It is built
*against* a backend via typed contracts plus a mock layer, so a real backend drops in by matching
the shapes.

Stack: Vue 3 + Vite + TypeScript, **Vuetify 4**, Pinia, vue-router 5, MSW. Icons: **IBM Carbon**
(`@carbon/icons-vue`), referenced by semantic key from `src/icons/carbon.ts`.
`@/*` aliases to `src/*`. Form validation uses Vuetify's built-in field `:rules` — no extra dep.

### Two components that are infrastructure, not product code

- **`src/components/AppIcon.vue`** is Vuetify's **global icon renderer**, wired in `vuetify.ts`
  (`component: props => h(AppIcon, …)`). Every `<v-icon>` and every component-internal icon routes
  through it. **Deleting it breaks the entire icon layer.** It looks like a product component; it
  isn't.
- **`src/components/AppPictogram.vue`** is imported by the Storybook.

Their key maps are `src/icons/carbon.ts` and `src/icons/pictograms.ts`. Add a key there — never
import a Carbon component straight into a screen.

<!-- TEMPLATE-ONLY:start — rewrite as the project grows; most of this is false once screens exist -->

### What the template ships (and what it doesn't)

**Ships — treat as the stable base:** the design system (`src/plugins/vuetify.ts` + `src/styles/`),
the chart kit (`src/components/charts/` + `chartTheme.ts` + `chartSamples.ts`), the Storybook, the
brand preset (`src/data/brand.ts`), the two icon components above, and the seams (`src/api/`,
`src/mocks/`, `src/stores/`, `src/router/`).

**Does NOT ship — build per project:** product screens (`src/screens/` holds only `Storybook.vue`,
which is not a route) · shared chrome (top bar, backdrop, nav shell) · a logo component · product
datasets in `src/data/` · anything in `src/assets/`, which is empty.

Because there are no product screens, **`src/router/index.ts` ships an empty `routes` array.** The
first screen you add is also the first route. The auth guard, session rehydration, and catch-all
are intact and switch themselves on as routes appear: the guard keys off `meta.requiresAuth` /
`meta.public` (not paths), each redirect is `hasRoute`-guarded so a missing target can't crash
navigation, and the catch-all only registers once a route named `home` exists. Read that file's
header before adding the first route.

Until then `corepack pnpm dev` renders a blank `<RouterView>` and vue-router logs *"No match found
for location /"*. **That is the expected unconfigured state, not a bug.** The Storybook on port
3001 is unaffected — it doesn't use the router.

<!-- TEMPLATE-ONLY:end -->

### Boot chain

`main.ts` → (dev only) `await startMocks()` from `src/mocks/browser.ts` so the very first API call
is intercepted → `createApp(App)` → `registerPlugins()` (`src/plugins/index.ts`: vuetify, then
Pinia, then **router last** because its auth guard reads the auth store) → mount.

`App.vue` is nearly empty by design: just a `<RouterView>`. Screens are reached through the router,
not through `App.vue`.

The DS **Storybook** (`src/screens/Storybook.vue`) is **not part of the product app** — it is a
separate standalone app with its own entry (`storybook.html` → `src/storybook.ts`, which mounts
`Storybook.vue` with only Vuetify + Pinia — no router, no MSW). It runs on its own dev server on
**port 3001** via `corepack pnpm dev:storybook` (the product app stays on 3000); `corepack pnpm
dev:all` runs both at once. There is intentionally **no Storybook build script**, no product route,
and no in-app link to it, so it can never ship in the product bundle. See
`vite.storybook.config.mts`.

### How screens are composed

`src/router/index.ts` is the single place URLs map to screens. Adding a page = drop a `.vue` in
`src/screens/` + one route entry; no `App.vue` edit. Keep the landing and sign-in screens eagerly
imported; make every other screen lazy (`() => import(...)`) so each is its own chunk.

There is **no shared shell wrapper**, by design. Each screen is self-contained: it declares its own
`<v-app>` and its own chrome. If a project needs a persistent top bar or background, build it as a
component in `src/components/` and import it explicitly into each screen — the template ships none,
so nothing constrains what a given product's chrome looks like.

**Toasts are per-screen.** Each screen owns a local `<v-snackbar>` bound to a `snack` ref plus a
`notify(text, color)` helper, and passes `notify` down to child components that need it. There is
**no** app-wide snackbar and no injection contract — every screen that needs toasts declares its
own. Pre-auth screens omit the authenticated chrome; `Storybook.vue` owns its own `<v-app>` as a
standalone app.

### ⚠️ Local components are NOT auto-imported

**`unplugin-vue-components` is not installed.** Only Vuetify `<v-*>` components auto-import (via
`vite-plugin-vuetify`); every local component needs an explicit
`import X from '@/components/X.vue'`. Kebab-case tags in templates still resolve to that import.
See `src/components/README.md`.

### API seam

Screens and stores **never call `fetch`**. The layering:

- `src/api/types.ts` — the contracts. These types *are* the spec a backend team wires into. Keep
  them transport-agnostic: data shapes only.
- `src/api/client.ts` — one typed fetch wrapper; the only place that knows `BASE_URL`
  (`VITE_API_BASE_URL ?? '/api'`) and error shape. Non-2xx throws `ApiException` carrying
  `{ code, message, status }`, with a UI-safe fallback message.
- `src/api/<domain>.ts` — named callers (e.g. `auth.ts` → `login()`), so the operation set is
  discoverable in one place.
- `src/mocks/handlers.ts` — MSW implements those contracts in-memory; `src/mocks/browser.ts` boots
  the worker (needs `public/mockServiceWorker.js`, `onUnhandledRequest: 'bypass'`).

Swapping mocks → real API is a `VITE_API_BASE_URL` change; **no call site changes**. All mock data
is synthetic — **never put real user data in `src/mocks/`.** Note the dev login handler accepts
*any* credentials on purpose so the app is reachable without demo data.

Stores wrap the callers and add UI-safe error handling — see `stores/auth.ts` re-throwing network
failures as a friendly `ApiException` (never leak internals to a user-facing surface).

### State

Pinia option-stores in `src/stores/`: `auth` (user + token, persisted to `localStorage` under
`app.token`) and `app` (an empty scaffold to extend). Product state — carts, filters, wizards — is
added per project.

## Where to build new code

| Building… | Goes in | Notes |
|---|---|---|
| A **full screen / page** | `src/screens/` | One `.vue` per screen; declare its own `<v-app>` and its own chrome. Add a route in `src/router/index.ts`. Import components explicitly. |
| A **reusable component** | `src/components/` | Must be imported explicitly (see above). |
| A **chart / data viz** | `src/components/charts/` | Use a kit preset first; new presets go here on `BaseChart` + `chartTheme.ts`. See the chart mandate above. |
| A **screen's dataset** | `src/data/<screen>.ts` | A typed contract + a synthetic data object. See the house rule below. |
| **API contracts / callers** | `src/api/` | `types.ts` · `client.ts` · `<domain>.ts`. |
| **Mock endpoints** | `src/mocks/handlers.ts` | Implement the contract; synthetic data only. |
| **Shared state** | `src/stores/` | Pinia. |

## Reference map

- `src/data/brand.ts` — the brand preset (`/new-project` writes it); `brand.identity` is live.
- `src/plugins/vuetify.ts` — the design control panel: theme colors (light/dark) + component
  defaults. Hot-reloads.
- `src/styles/settings.scss` — radius / spacing / sizing / type Sass vars. Restart required.
- `src/styles/overrides.css` — small documented fixes for Vuetify quirks with no prop/token lever;
  imported last in `main.ts` so it wins. Also defines `.section-panel` / `--section-radius`.
- `src/styles/sass-variables-reference.md` — the full ~764-var Sass catalog (reference only).
- `src/screens/Storybook.vue` — the DS Storybook: a standalone app on port 3001, and **the
  reference for every component and chart here**. Its *Colors* section renders the live theme, so
  any token not filed into `colorGroups` shows up under *Uncategorised*.
- `src/data/chartSamples.ts` — the synthetic datasets the Storybook charts render; the shape
  reference for the chart-kit props.
- `src/components/README.md` — what's in that folder and the explicit-import rule. Where it and
  this file disagree, this file wins.

## House rules

- Follow existing code style; keep code in TypeScript. Files carry substantial header comments
  explaining *why* — match that density when editing them.
- Use theme tokens + Vuetify utility classes, never hardcoded hex/px.
- **Never hardcode the product name.** Read `brand.identity` from `src/data/brand.ts` and
  interpolate it (`` `${brand.identity.shortName} Settings` ``). A find-and-replace rename must
  never be necessary.
  <!-- TEMPLATE-ONLY:start -->
  Outside the app — in files that can't import TS — use the `{{PROJECT_NAME}}` token instead.
  <!-- TEMPLATE-ONLY:end -->
- **Screens are dataset-driven.** Every screen renders from a typed dataset in `src/data/` (a
  contract + a synthetic data object) — no figures, labels, names, counts, or copy hardcoded in
  the template. Import the dataset, bind the template to it, and wrap mutable UI state in refs
  seeded from it. This keeps each screen a pure view, so a real backend drops in by producing the
  same shape (see the API seam in `src/api/`). Applies to *every* page as it's built.
