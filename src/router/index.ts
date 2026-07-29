/**
 * src/router/index.ts
 *
 * App routing. Each route maps a URL to a screen in src/screens/. To add a page:
 * drop a `<Name>.vue` in src/screens/, add one entry to `routes` below, done — no
 * App.vue edits.
 *
 * CURRENT STATE: one screen ships — FloorOps, the live floor operations console. It
 * is the landing route (`home`), so it is eagerly imported per the convention below.
 * There is still NO sign-in screen: the guard's `hasRoute(SIGNIN_ROUTE)` check is
 * what keeps `requiresAuth` from throwing on a redirect target that doesn't exist,
 * so the console is reachable without authenticating until a SignIn screen lands.
 * That is deliberate scaffolding, not an auth hole to rely on — build sign-in before
 * this goes anywhere real.
 *
 * The DS Storybook does not use this router at all (port 3001, see storybook.html /
 * src/storybook.ts / vite.storybook.config.mts).
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
import FloorOps from '@/screens/FloorOps.vue'
import { useAuthStore } from '@/stores/auth'

/** Route names the auth guard redirects to. Rename here, not in the guard. */
const LANDING_ROUTE = 'home'
const SIGNIN_ROUTE = 'signin'

const routes: RouteRecordRaw[] = [
  // Landing screen — eagerly imported because it is on the first-paint path.
  { path: '/', name: 'home', component: FloorOps, meta: { requiresAuth: true } },

  // Every OTHER screen should be lazy so it becomes its own chunk, e.g.
  //   { path: '/signin', name: 'signin', meta: { public: true },
  //     component: () => import('@/screens/SignIn.vue') },
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
