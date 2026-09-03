import { getDeviceId } from './deviceIdentity'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

/**
 * D15/M6.8: bounds how long any backend call can hang before every
 * caller's own `catch` turns it into a visible, retryable error — a
 * stopped backend process fails `fetch()` almost immediately
 * (connection refused), but a backend that accepts a connection and
 * then never responds would otherwise hang indefinitely, which is
 * exactly the "never blocks the editor" guarantee D15 requires.
 */
const REQUEST_TIMEOUT_MS = 10_000

/**
 * The one shared entry point for every backend request (D18) — attaches
 * the current device id as `X-Device-Id` automatically, so no call site
 * has to remember to. `M6.3` onward (scene CRUD, uploads) should call
 * this rather than a bare `fetch()`, exactly the way `M5.1`'s
 * `handleFileSelected` became the one shared upload entry point. Returns
 * the raw `Response` — parsing/error-shape handling is each caller's own
 * concern, since no real endpoint exists yet to know that shape from.
 * Rejects (never hangs) if `REQUEST_TIMEOUT_MS` elapses with no
 * response — indistinguishable from any other network failure to
 * callers, since D15 only cares that it's caught, not why.
 */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('X-Device-Id', getDeviceId())

  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout

  return fetch(`${API_BASE_URL}${path}`, { ...init, headers, signal })
}
