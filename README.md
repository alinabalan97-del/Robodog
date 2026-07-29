# Robodog

> A factory operations management platform for monitoring and coordinating production in real
> time. Operators get a live view of the floor — autonomous vehicles and their missions alongside
> production lines, equipment health and throughput, on one dashboard.

## 🧱 Stack

- Framework: Vue 3 + Vite
- UI library: Vuetify 4
- Charts: Apache ECharts via `vue-echarts` (see `src/components/charts/`)
- Icons: IBM Carbon (`@carbon/icons-vue`)
- State: Pinia · Routing: vue-router 5 · Mocks: MSW
- Language: TypeScript · Package manager: pnpm

## 💿 Install

```bash
corepack pnpm install
```

## 🚀 Commands

```bash
corepack pnpm dev            # product app — port 3000; boots MSW mocks first
corepack pnpm dev:storybook  # standalone DS Storybook — port 3001
corepack pnpm dev:all        # both at once
corepack pnpm build          # type-check + vite build (product app only)
corepack pnpm preview        # serve dist/
node_modules/.bin/vue-tsc --build   # type-check only
```

There is **no test suite and no runnable linter** — type-check plus a dev-server smoke check is
the available verification.

## 🧭 Start here

- `CLAUDE.md` — the authoritative guide to this codebase (architecture, house rules, skills)
- `src/plugins/vuetify.ts` — the design control panel: theme colors + component defaults
- `src/styles/_tokens.scss` — the radius scale (`$radius-sm…2xl`); **edit radius here** (restart after editing)
- `src/styles/settings.scss` — spacing / sizing / type Sass vars, plus the Vuetify radius wiring (restart after editing)
- `src/data/brand.ts` — the brand preset written by `/new-project`
- `src/screens/Storybook.vue` — the design-system Storybook (standalone app, port 3001)

## 📁 Structure

- `src/main.ts` — application entry point
- `src/App.vue` — root component (just a `<RouterView>` by design)
- `src/screens/` — one `.vue` per screen; add a route in `src/router/index.ts`
- `src/components/` — reusable components (imported **explicitly** — no auto-import)
- `src/components/charts/` — the ECharts chart kit
- `src/data/` — typed datasets; every screen is a pure view over one
- `src/api/` — typed contracts + fetch wrapper (`types.ts` · `client.ts` · `<domain>.ts`)
- `src/mocks/` — MSW handlers implementing those contracts (synthetic data only)
- `src/stores/` — Pinia stores
- `src/styles/` — global styles and theme settings
- `public/` — static files

## 💪 Support Vuetify development

This project uses Vuetify — an MIT licensed Open Source project:

- Contribute: https://github.com/vuetifyjs
- Enterprise support: https://support.vuetifyjs.com/
- Sponsor on GitHub: https://github.com/sponsors/vuetifyjs
- Open Collective: https://opencollective.com/vuetify
