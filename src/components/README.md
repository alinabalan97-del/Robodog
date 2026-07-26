# Components

## ⚠️ Components here are NOT auto-imported

This folder previously carried the Vuetify-CLI scaffold README claiming
[unplugin-vue-components](https://github.com/unplugin/unplugin-vue-components) auto-registers
everything in `src/components`. **That plugin is not installed.** Only Vuetify's own `<v-*>`
components auto-import, via `vite-plugin-vuetify`.

Every local component needs an explicit import:

```vue
<template>
  <app-pictogram name="analytics" :size="48" />
</template>

<script lang="ts" setup>
  import AppPictogram from '@/components/AppPictogram.vue'
</script>
```

Kebab-case tags (`<app-pictogram>`) are fine — they resolve to the explicit import.

## What's here

This repo is a **template**: it ships only the components that are infrastructure or design-system
surface. Product components are built per project.

| | What it is |
|---|---|
| `AppIcon.vue` | **Vuetify's global icon renderer** — wired in `src/plugins/vuetify.ts` as `component: props => h(AppIcon, …)`. Every `<v-icon>` and every component-internal icon goes through it. **Don't delete it**; it looks like a product component but the whole icon layer depends on it. |
| `AppPictogram.vue` | Renders an IBM Carbon pictogram by semantic key. Used by the Storybook. |
| `charts/` | The ECharts chart kit — 8 dataset-driven presets on a shared `BaseChart` bridge. See the repo `CLAUDE.md` data-viz mandate before adding one. |

Icon and pictogram keys live in `src/icons/carbon.ts` and `src/icons/pictograms.ts` — add the key
there, never import a Carbon component straight into a screen.

## Adding a component

Read `.claude/skills/vuetify-ds/SKILL.md` first — it's the styling authority and defines the
selection order. In short:

1. **Check the Storybook** (`src/screens/Storybook.vue`) for something that already fits.
2. **Else pull from the full Vuetify library** — it's all available and already themed; you don't
   register anything. Then **add it to the Storybook** so the preview tracks what the DS covers.
3. **Only then** hand-build — and never hand-roll markup/CSS for something Vuetify provides.

Colors, radius, spacing, and type come from theme tokens and utility classes. No raw hex, no raw px.

## Where things go

- A **reusable component** → here.
- A **chart** → `charts/`, as a preset on `BaseChart` + `src/data/chartTheme.ts`.
- A **full screen** → `src/screens/`, plus a route in `src/router/index.ts`.
- A screen's **data** → `src/data/<screen>.ts`; screens render from a typed dataset, not hardcoded
  copy. See the house rules in the repo `CLAUDE.md`.
