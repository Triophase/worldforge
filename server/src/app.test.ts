import { Pool } from 'pg'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { pool } from './db.js'
import { runMigrations } from './migrate.js'

describe('GET /health (M6.1)', () => {
  beforeAll(async () => {
    await runMigrations()
  })

  afterAll(async () => {
    await pool.end()
  })

  it('returns 200 with a small JSON body when Postgres is reachable', async () => {
    const app = createApp()
    const res = await request(app).get('/health')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  it('returns a clean 503 (not a hang or crash) when Postgres is unreachable', async () => {
    // A real `pg.Pool` pointed at a port nothing listens on — a genuine
    // failed connection attempt, not a mocked query (D36) — bounded by
    // `connectionTimeoutMillis` so this stays fast.
    const deadPool = new Pool({
      connectionString: 'postgres://nobody:nobody@127.0.0.1:1/nothing',
      connectionTimeoutMillis: 500,
    })
    const app = createApp(deadPool)

    const res = await request(app).get('/health')

    expect(res.status).toBe(503)
    expect(res.body.status).toBe('error')
    await deadPool.end()
  })
})

describe('device-identity middleware wired end to end through createApp() (M6.2/M6.3)', () => {
  it('a /scenes request with no X-Device-Id header is rejected', async () => {
    const app = createApp()
    const res = await request(app).get('/scenes')
    expect(res.status).toBe(400)
  })
})
