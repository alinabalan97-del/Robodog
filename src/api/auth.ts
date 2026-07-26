/**
 * src/api/auth.ts
 *
 * Auth endpoint callers. Screens/stores use these named functions instead of
 * raw paths, so the set of auth operations is discoverable in one place.
 */

import { api } from './client'
import type { LoginRequest, LoginResponse, User } from './types'

export function login (body: LoginRequest) {
  return api.post<LoginResponse>('/auth/login', body)
}

/**
 * GET /auth/me — resolve the signed-in user from a stored session token. Called
 * on app boot to restore the session after a page reload (the token persists in
 * localStorage; the in-memory user does not). Throws ApiException on an invalid
 * or expired token.
 */
export function me (token: string) {
  return api.get<User>('/auth/me', token)
}
