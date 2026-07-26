# {{PROJECT_NAME}}

> {{PROJECT_DESCRIPTION}}

<!-- TEMPLATE-ONLY:start — /new-project deletes this whole block when it configures the repo -->

**This repo is an unconfigured project template.** The tokens above (and the handful listed
below) are placeholders — run the `/new-project` skill in Claude Code to answer a short
brand-intake quiz, and it fills them in along with the design-system colors and radius.

Until then the app still builds and runs: the design system, chart kit, and Storybook are a
working default. Only the *identity* is blank, and it is blank visibly on purpose so an
unconfigured template is never mistaken for a finished brand.

## 🏷️ Placeholder tokens

| Token | Meaning | Where it lives |
|---|---|---|
| `{{PROJECT_NAME}}` | Full product name | `src/data/brand.ts`, `index.html`, `storybook.html`, `README.md`, `CLAUDE.md` |
| `{{PROJECT_SHORT_NAME}}` | Short name / wordmark fallback | `src/data/brand.ts` |
| `{{PROJECT_DESCRIPTION}}` | One-line description of the product | `src/data/brand.ts`, `README.md`, `CLAUDE.md` |
| `{{PROJECT_TAGLINE}}` | Marketing tagline (optional) | `src/data/brand.ts` |
| `{{PROJECT_SLUG}}` | npm-safe package name | `package.json` |
| `{{PROJECT_DOMAIN}}` | What the product *is* — drives the domain rules | `CLAUDE.md` |

`src/data/brand.ts` is the **live** source: screens read `brand.identity.name`, so anything
inside the app renames itself from that one edit. The other files can't import a TS module, so
they carry the literal token instead.

### Verifying a configure pass

Two greps. Neither should return a hit once the project is configured:

```bash
# 1. unreplaced tokens — .claude is excluded because the skills DOCUMENT the tokens in prose,
#    so without that flag this check can never come back clean
grep -rn '{{[A-Z_]*}}' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.claude .

# 2. template-only prose that should have been deleted, not filled in
grep -rn 'TEMPLATE-ONLY' --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.claude .
```

Blocks wrapped in `TEMPLATE-ONLY:start` / `:end` markers describe the *unconfigured* state. They
are **deleted** during configuration, not rewritten — that's what keeps a configured project from
carrying stale scaffolding forever.

### No stock logo ships

The template deliberately includes **no logo component**. A wordmark drawn as vector paths
can't be find-and-replaced, so shipping one would leave every new project with someone else's
name baked into artwork. Build the lockup as a component in `src/components/` when you have it,
and give it `:aria-label="brand.identity.name"` so the accessible name tracks the brand preset.

<!-- TEMPLATE-ONLY:end -->

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
- `src/styles/settings.scss` — radius / spacing / sizing / type Sass vars (restart after editing)
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
