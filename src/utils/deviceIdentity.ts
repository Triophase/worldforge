const STORAGE_KEY = 'deviceId'

/**
 * D18: an anonymous per-device UUID v4, the entire stand-in for accounts
 * (D7) — generated once on first need, persisted to `localStorage`, and
 * returned unchanged on every later call in this or a future session.
 * Infrastructure, not UI/scene state (state-architecture) — deliberately
 * a plain function, not a Zustand store, since nothing needs to
 * reactively re-render when it changes (it never changes after the first
 * call). No recovery path if storage is cleared (D16) — a fresh call
 * after that just generates a new one, exactly like a first-ever visit.
 */
export function getDeviceId(): string {
  const existing = localStorage.getItem(STORAGE_KEY)
  if (existing) return existing

  const id = crypto.randomUUID()
  localStorage.setItem(STORAGE_KEY, id)
  return id
}
