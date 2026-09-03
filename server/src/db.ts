import { Pool } from 'pg'

/**
 * One shared connection pool for the whole process, configured entirely
 * via `DATABASE_URL` (M6.1's Scope) — no host/port/user/password spread
 * across separate env vars. `pg` throws synchronously if `DATABASE_URL`
 * is unset, which is the desired behavior: fail at startup, not on the
 * first query.
 */
// `connectionTimeoutMillis` bounds how long a query waits to acquire a
// connection when Postgres is unreachable — without it, `pg`'s default is
// effectively "wait for the OS-level TCP timeout," which reads as a hang
// to a caller (M6.1's own acceptance criterion: `/health` must fail
// cleanly, fast, not hang, when Postgres is down).
export const pool = new Pool({ connectionString: requireDatabaseUrl(), connectionTimeoutMillis: 3000 })

// `pg.Pool` emits `'error'` on the pool itself when an already-connected,
// currently-idle client is dropped by the server (e.g. Postgres stopping
// or restarting) — confirmed the hard way (M6.1): with no listener here,
// Node's default "unhandled 'error' event" behavior is to throw and crash
// the whole process, which is exactly the "hang or crash" this task's own
// acceptance criterion says `/health` must never cause. The in-flight
// query that was using that client still rejects normally on its own
// promise, so `app.ts`'s `try`/`catch` around `pool.query()` handles the
// user-facing 503 — this listener's only job is to stop that background
// event from taking the process down.
pool.on('error', (error) => {
  console.error('Unexpected idle Postgres client error:', error.message)
})

function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set — see server/.env.example')
  return url
}
