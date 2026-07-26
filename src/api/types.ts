/**
 * src/api/types.ts
 *
 * ── API CONTRACTS ──────────────────────────────────────────────────────────
 * The integration seam between this frontend and the (future) backend.
 * These types ARE the spec the backend team wires into: request/response shapes
 * for every endpoint the UI calls. Screens and stores import from here; the mock
 * layer (src/mocks) implements these shapes today, a real API matches them later.
 *
 * Frontend-only project: we own these contracts, not the server behind them.
 * Keep them backend-agnostic — no transport details, just data.
 */

/** A signed-in user. Backend returns this from /auth/login and /auth/me. */
export interface User {
  id: string
  email: string
  fullName: string
  /** Drives which surfaces a user can see (patient portal vs clinic dashboard). */
  role: 'patient' | 'clinician'
}

/** POST /auth/login — request body. */
export interface LoginRequest {
  email: string
  password: string
}

/** POST /auth/login — success response. */
export interface LoginResponse {
  user: User
  /** Opaque session token. The frontend stores it; the backend defines its format. */
  token: string
}

/** Shape of a non-2xx API error body. Endpoints return this on failure. */
export interface ApiError {
  /** Stable machine code, e.g. 'invalid_credentials'. */
  code: string
  /** Human-readable, safe to show in the UI. */
  message: string
}
