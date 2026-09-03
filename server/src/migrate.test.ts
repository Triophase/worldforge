import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { pool } from './db.js'
import { runMigrations } from './migrate.js'

describe('runMigrations (M6.1)', () => {
  beforeAll(async () => {
    await runMigrations()
  })

  afterAll(async () => {
    await pool.end()
  })

  it('creates both the scenes and assets tables', async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
    )
    const names = rows.map((r) => r.table_name)
    expect(names).toContain('scenes')
    expect(names).toContain('assets')
  })

  it('running a second time is idempotent — exits cleanly with no newly-applied migrations', async () => {
    const secondRun = await runMigrations()
    expect(secondRun).toEqual([])
  })

  it('does not duplicate rows in schema_migrations across repeated runs', async () => {
    await runMigrations()
    await runMigrations()
    const { rows } = await pool.query('SELECT name FROM schema_migrations')
    const names = rows.map((r) => r.name)
    expect(new Set(names).size).toBe(names.length) // no duplicates
  })
})
