/**
 * vite.storybook.config.mts
 *
 * Dev-server config for the STANDALONE DS Storybook. It reuses the product's
 * entire Vite config (Vue + Vuetify plugins, the @ alias, the dependency
 * pre-bundle list) and only changes the server: a different port, and it serves
 * the Storybook at the root URL.
 *
 * Why the root rewrite: both index.html (product) and storybook.html live in the
 * repo root, so Vite would serve the PRODUCT app at http://localhost:3001/ and
 * only expose the Storybook at /storybook.html. The tiny middleware below maps
 * the root URL to storybook.html so that visiting localhost:3001 IS the
 * Storybook — the product's index.html is never served on this port.
 *
 * Run it with `corepack pnpm dev:storybook` (port 3001). The product app keeps
 * running on `corepack pnpm dev` (port 3000); `corepack pnpm dev:all` starts
 * both at once. This is a DEV-ONLY tool — there is intentionally no Storybook
 * build script, so it can never ship inside the product bundle.
 */

import { mergeConfig, type Plugin } from 'vite'
import base from './vite.config.mts'

// Serve storybook.html at the root URL (and rewrite /index.html too), so the
// product's index.html is unreachable on this server and localhost:3001 always
// lands on the Storybook. Registered in configureServer, so it runs before
// Vite's own HTML-serving middleware.
function storybookAtRoot (): Plugin {
  return {
    name: 'storybook-at-root',
    configureServer (server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/' || req.url === '/index.html') req.url = '/storybook.html'
        next()
      })
    },
  }
}

export default mergeConfig(base, {
  plugins: [storybookAtRoot()],
  server: {
    port: 3001,
    open: true,
  },
})
