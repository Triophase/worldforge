import { Router } from 'express'
import type { Request, Response } from 'express'
import multer, { MulterError } from 'multer'
import type { Pool } from 'pg'
import { requireDeviceId } from '../middleware/deviceIdentity.js'

const MAX_FILE_BYTES = 25 * 1024 * 1024 // D11
const MAX_DEVICE_TOTAL_BYTES = 200 * 1024 * 1024 // D11

interface AssetRow {
  id: string
  filename: string
  format: string
  file_size: string // bigint comes back as a string from `pg` by default
  data: Buffer
  created_at: Date
}

function formatFromFilename(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop()
  return ext || 'unknown'
}

/**
 * D10-D12's server-side upload storage — no frontend calls this yet
 * (`M6.10`). Blob storage backed by the same database (D6a's own
 * latitude): the file's bytes live directly in `assets.data` (`bytea`),
 * not a separate object-storage service. Reads (`GET /assets/:id`) are
 * deliberately **not** gated by `requireDeviceId` at all — D10 requires
 * any device opening a shared link to be able to fetch the custom asset
 * it references, regardless of who originally uploaded it.
 */
export function createAssetsRouter(pool: Pool): Router {
  const router = Router()
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES } })

  router.post('/', requireDeviceId, (req, res, next) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err) {
        if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({ error: 'File exceeds the 25MB per-file limit', reason: 'file-too-large' })
          return
        }
        next(err)
        return
      }
      handleUpload(pool, req, res).catch(next)
    })
  })

  router.get('/:id', async (req, res) => {
    const { rows } = await pool.query<AssetRow>(
      `SELECT id, filename, format, file_size, data, created_at FROM assets WHERE id = $1`,
      [req.params.id],
    )
    const row = rows[0]
    if (!row) {
      res.status(404).json({ error: 'Asset not found' })
      return
    }

    res.set('Content-Type', 'application/octet-stream')
    res.set('Content-Disposition', `attachment; filename="${row.filename}"`)
    res.status(200).send(row.data)
  })

  return router
}

async function handleUpload(pool: Pool, req: Request, res: Response) {
  const file = req.file
  if (!file) {
    res.status(400).json({ error: 'file is required' })
    return
  }

  const { rows: usageRows } = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(file_size), 0) AS total FROM assets WHERE device_id = $1`,
    [req.deviceId],
  )
  const currentTotal = Number(usageRows[0]!.total)
  if (currentTotal + file.size > MAX_DEVICE_TOTAL_BYTES) {
    res.status(413).json({ error: 'This device has exceeded its 200MB total upload storage', reason: 'device-cap-exceeded' })
    return
  }

  const { rows } = await pool.query<Pick<AssetRow, 'id' | 'filename' | 'format' | 'file_size' | 'created_at'>>(
    `INSERT INTO assets (device_id, filename, format, file_size, data)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, filename, format, file_size, created_at`,
    [req.deviceId, file.originalname, formatFromFilename(file.originalname), file.size, file.buffer],
  )
  const row = rows[0]!
  res.status(201).json({
    id: row.id,
    filename: row.filename,
    format: row.format,
    fileSize: Number(row.file_size),
    createdAt: row.created_at.toISOString(),
  })
}
