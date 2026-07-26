<!--
  src/components/AppIcon.vue

  Renders one icon from the central map (src/icons/carbon.ts) by SEMANTIC KEY.

  Two ways it gets used, and both matter:

  1. Directly — `<app-icon name="medication" />` — when you want a bare glyph with
     no Vuetify icon wrapper.
  2. Indirectly, for every `<v-icon>` and every icon PROP in the app. The Vuetify
     icon set registered in plugins/vuetify.ts resolves an icon string through this
     component, so `prepend-icon="medication"` keeps working exactly as it did with
     the MDI webfont — no call site had to change shape, only the string.

  Sizing/colour are deliberately NOT handled here. The svg renders at
  width/height 1em with Carbon's own fill="currentColor", so it inherits font-size
  and colour from whatever wraps it — which is how Vuetify already sized and
  coloured MDI. That's what preserves every existing `size`, `color`, density and
  button state without touching a single call site.

  Unknown key → renders nothing and warns in dev, rather than throwing. A missing
  icon must never blank a screen on a medical app.
-->
<template>
  <component
    :is="component"
    v-if="component"
    width="1em"
    height="1em"
    aria-hidden="true"
    focusable="false"
  />
</template>

<script lang="ts" setup>
  import { computed } from 'vue'
  import { icons, type IconName } from '@/icons/carbon'

  const props = defineProps<{
    /** Semantic key from the icon map, e.g. 'medication', 'overdue', 'cart'. */
    name: IconName | (string & {})
  }>()

  const component = computed(() => {
    const found = icons[props.name as IconName]
    if (!found && import.meta.env.DEV) {
      console.warn(`[AppIcon] unknown icon "${props.name}" — add it to src/icons/carbon.ts`)
    }
    return found
  })
</script>
