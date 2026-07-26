/**
 * main.ts
 *
 * Bootstraps Vuetify and other plugins then mounts the App`
 */

// Composables
import { createApp } from 'vue'

// Plugins
import { registerPlugins } from '@/plugins'

// Components
import App from './App.vue'

// Styles
import 'unfonts.css'
// Global Vuetify-quirk overrides — imported last so it wins over component CSS.
import './styles/overrides.css'

async function bootstrap () {
  // Dev-only: boot the mock backend (MSW) before mounting so the very first
  // API call is intercepted. Frontend-only project — see src/mocks/.
  if (import.meta.env.DEV) {
    const { startMocks } = await import('./mocks/browser')
    await startMocks()
  }

  const app = createApp(App)
  registerPlugins(app)
  app.mount('#app')
}

bootstrap()
