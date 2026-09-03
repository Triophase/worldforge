import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { pool } from '../db.js'
import { runMigrations } from '../migrate.js'

const DEVICE_A = '11111111-1111-4111-8111-111111111111'

const app = createApp()

describe('asset upload/download endpoints (D10-D12, M6.4)', () => {
  beforeAll(async () => {
    await runMigrations()
  })

  afterAll(async () => {
    await pool.end()
  })

  it('POST /assets stores a small file and GET /assets/:id returns byte-identical content', async () => {
    const content = Buffer.from('a small glb-shaped payload, contents do not matter here')

    const upload = await request(app)
      .post('/assets')
      .set('X-Device-Id', DEVICE_A)
      .attach('file', content, 'widget.glb')

    expect(upload.status).toBe(201)
    expect(upload.body.id).toBeTruthy()
    expect(upload.body.filename).toBe('widget.glb')

    const download = await request(app).get(`/assets/${upload.body.id}`)
    expect(download.status).toBe(200)
    expect(Buffer.compare(download.body, content)).toBe(0)
  })

  it('rejects a file over the 25MB per-file cap with a distinct error', async () => {
    const oversized = Buffer.alloc(25 * 1024 * 1024 + 1)

    const res = await request(app).post('/assets').set('X-Device-Id', DEVICE_A).attach('file', oversized, 'huge.glb')

    expect(res.status).toBe(413)
    expect(res.body.reason).toBe('file-too-large')
  })

  it('rejects an upload that would push a device over its 200MB total, with a distinct error from the per-file cap', async () => {
    const deviceNearCap = '33333333-3333-4333-8333-333333333333'
    // Seed 199MB of "already stored" usage directly — the DB doesn't
    // enforce `file_size` matching `data`'s real length, so this avoids
    // an actual 199MB transfer just to set up the test.
    await pool.query(
      `INSERT INTO assets (device_id, filename, format, file_size, data) VALUES ($1, $2, $3, $4, $5)`,
      [deviceNearCap, 'existing.glb', 'glb', 199 * 1024 * 1024, Buffer.from('x')],
    )

    const pushesOverCap = Buffer.alloc(2 * 1024 * 1024) // 199MB + 2MB > 200MB
    const res = await request(app)
      .post('/assets')
      .set('X-Device-Id', deviceNearCap)
      .attach('file', pushesOverCap, 'tips-it-over.glb')

    expect(res.status).toBe(413)
    expect(res.body.reason).toBe('device-cap-exceeded')
    expect(res.body.reason).not.toBe('file-too-large')
  })

  it('caps are per-device — a different device well under its own cap still succeeds', async () => {
    const deviceOverCap = '44444444-4444-4444-8444-444444444444'
    await pool.query(
      `INSERT INTO assets (device_id, filename, format, file_size, data) VALUES ($1, $2, $3, $4, $5)`,
      [deviceOverCap, 'existing.glb', 'glb', 200 * 1024 * 1024, Buffer.from('x')],
    )

    const freshDevice = '55555555-5555-4555-8555-555555555555'
    const res = await request(app)
      .post('/assets')
      .set('X-Device-Id', freshDevice)
      .attach('file', Buffer.from('tiny'), 'ok.glb')

    expect(res.status).toBe(201)
  })

  it('GET /assets/:id is not owner-gated — a different device (or none) can still read it', async () => {
    const content = Buffer.from('readable by anyone with the link')
    const upload = await request(app).post('/assets').set('X-Device-Id', DEVICE_A).attach('file', content, 'open.glb')

    const otherDevice = '66666666-6666-4666-8666-666666666666'
    const asOther = await request(app).get(`/assets/${upload.body.id}`).set('X-Device-Id', otherDevice)
    expect(asOther.status).toBe(200)

    const withNoHeader = await request(app).get(`/assets/${upload.body.id}`)
    expect(withNoHeader.status).toBe(200)
  })

  it('there is no route that deletes an asset', async () => {
    const upload = await request(app).post('/assets').set('X-Device-Id', DEVICE_A).attach('file', Buffer.from('x'), 'x.glb')

    const del = await request(app).delete(`/assets/${upload.body.id}`).set('X-Device-Id', DEVICE_A)
    expect(del.status).not.toBe(200)
    expect(del.status).not.toBe(204)
  })
})
