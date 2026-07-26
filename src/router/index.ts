/**
 * src/router/index.ts
 *
 * App routing. Each route maps a URL to a screen in src/screens/. To add a page:
 * drop a `<Name>.vue` in src/screens/, add one entry to `routes` below, done — no
 * App.vue edits.
 *
 * ⚠️ TEMPLATE STATE: `routes` is EMPTY. This repo ships no product screens, so there
 * is nothing to route to yet — the first screen you build is also the first route.
 * Everything else here (the auth guard, session rehydration, the catch-all) is intact
 * scaffolding that switches itself on as soon as you add the matching routes.
 *
 * Until then the product app (`corepack pnpm dev`, port 3000) renders a blank
 * `<RouterView>` and vue-router logs "No match found for location /". That is the
 * expected unconfigured state, not a bug. The DS Storybook is unaffected — it is a
 * separate standalone app that does not use this router at all (port 3001, see
 * storybook.html / src/storybook.ts / vite.storybook.config.mts).
 *
 * CONVENTIONS once you start adding screens:
 *   - Keep the landing screen and the sign-in screen EAGERLY imported (they are on
 *     the first-paint path); make every other screen lazy — `() => import(...)` —
 *     so each becomes its own chunk.
 *   - Mark protected screens `meta: { requiresAuth: true }` and pre-auth screens
 *     `meta: { public: true }`. The guard below keys off those two flags, so you
 *     never have to edit the guard itself.
 *   - Name the landing route `home` and the sign-in route `signin` (the constants
 *     below) — or change the constants. They are the only two names the guard knows.
 *
 * AUTH FLOW: a global `beforeEach` guard bounces `meta.requiresAuth` routes to the
 * sign-in route when the auth store isn't authenticated, and bounces an already
 * signed-in user off `meta.public` routes back to the landing route. On a fresh load
 * the guard first rehydrates the session from the persisted token (auth.restore() →
 * GET /auth/me), so a reload or deep link keeps the user signed in instead of
 * dropping to sign-in. The dev login mock accepts any credentials on purpose.
 */

import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

/** Route names the auth guard redirects to. Rename here, not in the guard. */
const LANDING_ROUTE = 'home'
const SIGNIN_ROUTE = 'signin'

const routes: RouteRecordRaw[] = [
  // No product screens ship with the template — add yours here. For example:
  //
  //   import Home from '@/screens/Home.vue'
  //   import SignIn from '@/screens/SignIn.vue'
  //
  //   { path: '/', name: 'home', component: Home, meta: { requiresAuth: true } },
  //   { path: '/signin', name: 'signin', component: SignIn, meta: { public: true } },
  //   { path: '/settings', name: 'settings', meta: { requiresAuth: true },
  //     component: () => import('@/screens/Settings.vue') },
]

// Fallback → the landing route. Added only once a landing route actually exists:
// with an empty `routes`, a catch-all redirecting to '/' would resolve to itself
// and spin forever.
if (routes.some(r => r.name === LANDING_ROUTE)) {
  routes.push({ path: '/:pathMatch(.*)*', redirect: '/' })
}

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

// Auth guard. Runs at navigation time (pinia is registered before the router, so the
// store is available here). Protected routes require a signed-in user; pre-auth
// routes redirect away once authenticated.
//
// Each redirect is guarded by `hasRoute` because the template ships no screens: a
// redirect to a route that doesn't exist yet throws at navigation time, which would
// be a runtime crash type-checking can't catch. When the target is missing we let the
// navigation through — the app is mid-build, and a blank screen beats a hard error.
router.beforeEach(async to => {
  const auth = useAuthStore()

  // On the first navigation after a load, rehydrate the session from the saved token
  // before gating — otherwise a reload (incl. Vite's dev re-optimize reload) would
  // look unauthenticated and bounce to sign-in.
  if (!auth.restored && auth.token && !auth.user) await auth.restore()

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return router.hasRoute(SIGNIN_ROUTE) ? { name: SIGNIN_ROUTE } : true
  }

  if (to.meta.public && auth.isAuthenticated) {
    return router.hasRoute(LANDING_ROUTE) ? { name: LANDING_ROUTE } : true
  }

  return true
})
