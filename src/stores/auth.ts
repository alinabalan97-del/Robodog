// Utilities
import { defineStore } from 'pinia'
import * as authApi from '@/api/auth'
import { ApiException } from '@/api/client'
import type { User } from '@/api/types'

// localStorage key for the session token. Deliberately generic rather than
// brand-named: it is a storage identifier, not display copy, so it survives a
// rename without orphaning every signed-in session on the configured product.
const TOKEN_KEY = 'app.token'

/**
 * Auth state for the app. Holds the signed-in user + token and exposes the
 * login flow. Screens read `isAuthenticated` to gate access; App.vue uses it to
 * decide whether to show Sign-in or the app.
 */
export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,
    token: localStorage.getItem(TOKEN_KEY) as string | null,
    loading: false,
    /** True once restore() has run — so the guard rehydrates the session only once. */
    restored: false,
  }),
  getters: {
    isAuthenticated: state => !!state.user,
  },
  actions: {
    /**
     * Rehydrate the in-memory session from the persisted token on app boot, so a
     * page reload (or deep link) keeps the user signed in instead of bouncing to
     * /signin. No-op when there's no token. A rejected/expired token is cleared.
     * The router guard awaits this once before gating the first navigation.
     */
    async restore () {
      this.restored = true
      if (!this.token) return
      try {
        this.user = await authApi.me(this.token)
      } catch {
        // Stale/invalid token — drop it and fall through to the sign-in screen.
        this.user = null
        this.token = null
        localStorage.removeItem(TOKEN_KEY)
      }
    },
    /** Calls the (mocked) /auth/login. Throws ApiException on bad credentials. */
    async login (email: string, password: string) {
      this.loading = true
      try {
        const { user, token } = await authApi.login({ email, password })
        this.user = user
        this.token = token
        this.restored = true
        localStorage.setItem(TOKEN_KEY, token)
        return user
      } catch (e) {
        // Re-throw with a UI-safe message; never leak internals on a medical app.
        if (e instanceof ApiException) throw e
        throw new ApiException(0, { code: 'network_error', message: 'Unable to reach the server. Check your connection and try again.' })
      } finally {
        this.loading = false
      }
    },
    logout () {
      this.user = null
      this.token = null
      localStorage.removeItem(TOKEN_KEY)
    },
  },
})
