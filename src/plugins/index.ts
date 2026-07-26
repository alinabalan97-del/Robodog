import { createPinia } from 'pinia'
/**
 * plugins/index.ts
 *
 * Automatically included in `./src/main.ts`
 */

// Types
import type { App } from 'vue'

// Plugins
import vuetify from './vuetify'
import { router } from '@/router'

export function registerPlugins (app: App) {
  app.use(vuetify)
  app.use(createPinia())
  // Router after Pinia — the auth guard reads the auth store.
  app.use(router)
}
