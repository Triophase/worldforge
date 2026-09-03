import 'dotenv/config'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pool } from './db.js'

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

/**
 * Hand-written SQL files, applied in filename order, tracked in
 * `schema_migrations` so a second run is a no-op (M6.1's own acceptance
 * criterion: idempotent, not destructive re-creation) — a migration tool
 * is explicit implementation detail per §31; this is the free choice
 * made here, kept intentionally small rather than pulling in a framework
 * for three tables.
 */
export async function runMigrations(): Promise<string[]> {
  const client = await pool.connect()
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name TEXT PRIMARY KEY,
         applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    )

    const applied = new Set((await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name))
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort()

    const newlyApplied: string[] = []
    for (const file of files) {
      if (applied.has(file)) continue

      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8')
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
        await client.query('COMMIT')
        newlyApplied.push(file)
      } catch (error) {
        await client.query('ROLLBACK')
        throw new Error(`Migration ${file} failed: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    return newlyApplied
  } finally {
    client.release()
  }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  runMigrations()
    .then((applied) => {
      console.log(applied.length > 0 ? `Applied: ${applied.join(', ')}` : 'No new migrations.')
      return pool.end()
    })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
