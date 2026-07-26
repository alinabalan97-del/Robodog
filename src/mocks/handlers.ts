/**
 * src/mocks/handlers.ts
 *
 * ── MOCK BACKEND ───────────────────────────────────────────────────────────
 * Implements the API contracts (src/api/types.ts) with in-memory data so every
 * screen works with no real server. Frontend-only project: this stands in for
 * the backend team's API. When they ship real endpoints, point
 * VITE_API_BASE_URL at them and delete (or keep for tests) this layer — the
 * request/response SHAPES already match, so call sites don't change.
 *
 * ⚠️ All data here is SYNTHETIC. No real patients, credentials, or clinical info.
 */

import { http, HttpResponse, type PathParams } from 'msw'
import type { ApiError, LoginRequest, LoginResponse, User } from '@/api/types'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

// Hardcoded patient name for now (frontend-only; real backend will return the
// authenticated user's name later). Every screen reads auth.user.fullName, so
// setting it here makes the displayed name consistent app-wide.
const PATIENT_FULL_NAME = 'Patricia Rommel'

/** Build the synthetic user for an email — shared by /auth/login and /auth/me so
 *  a restored session matches the one login issued. */
function makeUser (email: string): User {
  const cleaned = (email || '').trim() || 'guest@example.invalid'
  return {
    id: `usr_${cleaned.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    email: cleaned,
    fullName: PATIENT_FULL_NAME,
    role: 'patient',
  }
}

// The mock token encodes the email (`mock-token.<email>`) so /auth/me can rebuild
// the same user with no server-side state — which matters because MSW's in-memory
// state resets on the very page reload we're trying to survive.
function emailFromToken (token: string): string | null {
  const m = /^mock-token\.(.+)$/.exec(token)
  return m ? m[1] : null
}

export const handlers = [
  // DEV: accept ANY credentials so the platform is reachable without real or
  // demo data. The backend team's real /auth/login will enforce auth later —
  // the response SHAPE here already matches the contract, so nothing else changes.
  http.post<PathParams, LoginRequest, LoginResponse>(`${BASE_URL}/auth/login`, async ({ request }) => {
    const { email } = (await request.json()) as LoginRequest
    const user = makeUser(email)
    return HttpResponse.json<LoginResponse>({ user, token: `mock-token.${user.email}` })
  }),

  // GET /auth/me — restore the session from the Bearer token on app boot/reload.
  // Decodes the email the token carries and returns the same user; 401 if absent
  // or malformed, so the store clears a stale token and falls back to sign-in.
  http.get<PathParams, never, User | ApiError>(`${BASE_URL}/auth/me`, ({ request }) => {
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer /, '')
    const email = token && emailFromToken(token)
    if (!email) {
      return HttpResponse.json<ApiError>({ code: 'unauthorized', message: 'Your session has expired. Please sign in again.' }, { status: 401 })
    }
    return HttpResponse.json<User>(makeUser(email))
  }),
]
