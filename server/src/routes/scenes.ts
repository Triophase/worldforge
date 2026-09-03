import { Router } from 'express'
import type { Pool } from 'pg'
import { requireDeviceId } from '../middleware/deviceIdentity.js'

interface SceneRow {
  id: string
  device_id: string
  name: string
  document: Record<string, unknown>
  created_at: Date
  updated_at: Date
  deleted_at: Date | null
}

/** D22's shape minus id/name/createdAt/updatedAt (those are dedicated
 * columns) — whatever the client sends here is stored/returned as-is,
 * no application-level schema validation (out of scope per the task
 * file: schemaVersion mismatch handling is a client-side Import concern,
 * M7.2). */
function toDocument(body: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, name: _name, createdAt: _createdAt, updatedAt: _updatedAt, ...document } = body
  return document
}

function toSceneResponse(row: SceneRow, deviceId: string) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    isOwner: row.device_id === deviceId,
    ...row.document,
  }
}

/**
 * D8/D9/D13/D17's server half — no frontend consumes this yet (`M6.5`).
 * Ownership gates only the write paths (`PUT`/`DELETE`); `GET
 * /scenes/:id` always succeeds regardless of owner, since D8's
 * non-owner sandbox needs the full scene client-side before the
 * frontend can decide what to disable. A malformed `:id` (not
 * UUID-shaped) is treated identically to "doesn't exist" — the `scenes.
 * id` column is a real Postgres `UUID`, so a malformed value would
 * otherwise surface as an uncaught `22P02` query error.
 */
export function createScenesRouter(pool: Pool): Router {
  const router = Router()
  router.use(requireDeviceId)

  router.post('/', async (req, res) => {
    const body = req.body as Record<string, unknown>
    if (typeof body?.name !== 'string') {
      res.status(400).json({ error: 'name is required and must be a string' })
      return
    }

    const document = toDocument(body)
    const { rows } = await pool.query<SceneRow>(
      `INSERT INTO scenes (device_id, name, document)
       VALUES ($1, $2, $3)
       RETURNING id, device_id, name, document, created_at, updated_at, deleted_at`,
      [req.deviceId, body.name, document],
    )
    res.status(201).json(toSceneResponse(rows[0]!, req.deviceId!))
  })

  router.get('/', async (req, res) => {
    const { rows } = await pool.query<Pick<SceneRow, 'id' | 'name' | 'updated_at'>>(
      `SELECT id, name, updated_at FROM scenes WHERE device_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC`,
      [req.deviceId],
    )
    res.status(200).json(rows.map((r) => ({ id: r.id, name: r.name, updatedAt: r.updated_at.toISOString() })))
  })

  router.get('/:id', async (req, res) => {
    const row = await findScene(pool, req.params.id!)
    if (row === 'not-found') {
      res.status(404).json({ error: 'Scene not found' })
      return
    }
    if (row === null) {
      res.status(410).json({ status: 'deleted', error: 'This scene has been deleted' })
      return
    }
    res.status(200).json(toSceneResponse(row, req.deviceId!))
  })

  router.put('/:id', async (req, res) => {
    const row = await findScene(pool, req.params.id!)
    if (row === 'not-found' || row === null) {
      res.status(404).json({ error: 'Scene not found' })
      return
    }
    if (row.device_id !== req.deviceId) {
      res.status(403).json({ error: 'Only the owning device may save this scene' })
      return
    }

    const body = req.body as Record<string, unknown>
    if (typeof body?.name !== 'string') {
      res.status(400).json({ error: 'name is required and must be a string' })
      return
    }

    const document = toDocument(body)
    const { rows } = await pool.query<SceneRow>(
      `UPDATE scenes SET name = $1, document = $2, updated_at = now()
       WHERE id = $3
       RETURNING id, device_id, name, document, created_at, updated_at, deleted_at`,
      [body.name, document, row.id],
    )
    res.status(200).json(toSceneResponse(rows[0]!, req.deviceId!))
  })

  router.delete('/:id', async (req, res) => {
    const row = await findScene(pool, req.params.id!)
    if (row === 'not-found' || row === null) {
      res.status(404).json({ error: 'Scene not found' })
      return
    }
    if (row.device_id !== req.deviceId) {
      res.status(403).json({ error: 'Only the owning device may delete this scene' })
      return
    }

    await pool.query(`UPDATE scenes SET deleted_at = now() WHERE id = $1`, [row.id])
    res.status(200).json({ status: 'deleted' })
  })

  return router
}

/**
 * Three-way result: a real row, `null` for "exists but soft-deleted"
 * (D17), or the string `'not-found'` for "never existed" — kept
 * distinct rather than both collapsing to `null`, since callers need to
 * tell the two apart (404 vs 410).
 */
async function findScene(pool: Pool, id: string): Promise<SceneRow | null | 'not-found'> {
  let rows: SceneRow[]
  try {
    ;({ rows } = await pool.query<SceneRow>(`SELECT * FROM scenes WHERE id = $1`, [id]))
  } catch {
    return 'not-found' // malformed (non-UUID) id — Postgres' 22P02, treated the same as "doesn't exist"
  }

  const row = rows[0]
  if (!row) return 'not-found'
  if (row.deleted_at !== null) return null
  return row
}
