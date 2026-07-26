<template>
  <!-- The routed product app. Screens render here through the router. The DS
       Storybook is no longer part of this app — it runs as its own standalone
       dev server on port 3001 (see storybook.html / src/storybook.ts). There is
       intentionally no in-app switch to it, so it stays walled off from the
       product. -->
  <RouterView />
</template>

<script lang="ts" setup>
  // Routing + auth are handled by src/router. App.vue is deliberately thin.
</script>
