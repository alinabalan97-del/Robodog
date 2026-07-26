/**
 * src/api/client.ts
 *
 * Thin typed fetch wrapper. ONE place that knows the base URL and how errors are
 * shaped — so screens/stores call `api.post('/auth/login', body)` and never touch
 * fetch directly. Swap mocks → real backend by changing VITE_API_BASE_URL only;
 * no call sites change.
 */

import type { ApiError } from './types'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

/** Thrown for any non-2xx response. Carries the parsed {code,message} for the UI. */
export class ApiException extends Error {
  code: string
  status: number
  constructor (status: number, body: ApiError) {
    super(body.message)
    this.name = 'ApiException'
    this.code = body.code
    this.status = status
  }
}

async function request<T> (method: string, path: string, body?: unknown, token?: string | null): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  // Bearer auth: sent when a caller passes the session token (e.g. /auth/me on
  // reload). The real backend identifies the user from this header.
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!res.ok) {
    const fallback: ApiError = { code: 'unknown_error', message: 'Something went wrong. Please try again.' }
    const errBody = await res.json().catch(() => fallback)
    throw new ApiException(res.status, errBody as ApiError)
  }

  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string, token?: string | null) => request<T>('GET', path, undefined, token),
  post: <T>(path: string, body?: unknown, token?: string | null) => request<T>('POST', path, body, token),
}
