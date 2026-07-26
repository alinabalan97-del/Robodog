/**
 * storybook.ts
 *
 * Dedicated entry for the DS Storybook — a SEPARATE app from the product.
 *
 * The Storybook (src/screens/Storybook.vue) is the design-system component
 * preview. It used to live inside the product app as a dev-only /storybook
 * route reachable via a floating switch button. It now runs as its own Vite
 * dev server (see vite.storybook.config.mts, port 3001) so it is fully walled
 * off from the product: its own URL, its own tab, and it can never ship inside
 * the app bundle.
 *
 * It needs far less than the product: only Vuetify (the DS itself) plus Pinia
 * (in case a previewed component reads a store). No router — the Storybook is a
 * single page, so there is no auth guard to bounce it to /signin. No MSW — it
 * renders from the synthetic sample data in src/data/, never the mock backend.
 */

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import vuetify from '@/plugins/vuetify'
import Storybook from '@/screens/Storybook.vue'

// Same global styles the product loads (fonts + Vuetify-quirk overrides), so
// the preview matches the app pixel-for-pixel.
import 'unfonts.css'
import '@/styles/overrides.css'

const app = createApp(Storybook)
app.use(vuetify)
app.use(createPinia())
app.mount('#storybook')
