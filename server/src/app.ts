import cors from 'cors'
import express from 'express'
import type { Express, NextFunction, Request, Response } from 'express'
import type { Pool } from 'pg'
import { pool as defaultPool } from './db.js'
import { createAssetsRouter } from './routes/assets.js'
import { createScenesRouter } from './routes/scenes.js'

/**
 * The Express app itself, separate from `index.ts`'s `listen()` call —
 * so tests (`app.test.ts`) can exercise routes via `supertest`-style
 * requests against the app object without binding a real port. Takes an
 * optional `Pool` (defaulting to the shared one) purely so
 * `app.test.ts`'s "Postgres unreachable" case can inject a second real
 * `pg.Pool` pointed at a bad address — a genuine failed connection
 * attempt, not a mocked query function (D36: no mocking the persistence
 * layer, even in a test for the route's own error handling).
 */
export function createApp(pool: Pool = defaultPool): Express {
  const app = express()
  app.use(cors())
  app.use(express.json())

  app.get('/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1')
      res.status(200).json({ status: 'ok' })
    } catch (error) {
      // D15's own principle applied to the backend's own self-check: a
      // down Postgres is a clean, typed 503, never an unhandled
      // rejection or a hung request (`db.ts`'s `connectionTimeoutMillis`
      // is what bounds how long this can take).
      res.status(503).json({ status: 'error', message: error instanceof Error ? error.message : 'Database unreachable' })
    }
  })

  // M6.3: the real protected routes — `M6.2`'s own `/_debug/device-id`
  // placeholder is retired now that one exists.
  app.use('/scenes', createScenesRouter(pool))
  // M6.4: upload storage — `GET /assets/:id` is deliberately not gated
  // by `requireDeviceId` at all (see `routes/assets.ts`'s own comment).
  app.use('/assets', createAssetsRouter(pool))

  // Express 5 forwards a rejected async route-handler promise here
  // automatically (no per-route try/catch needed in `routes/scenes.ts`
  // for anything beyond the deliberate `findScene` malformed-id case) —
  // without this, an unexpected error would fall through to Express's
  // default HTML error page, inconsistent with every other response
  // this API returns being JSON.
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error)
    res.status(500).json({ error: 'Internal server error' })
  })

  return app
}
