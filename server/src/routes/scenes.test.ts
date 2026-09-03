import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { pool } from '../db.js'
import { runMigrations } from '../migrate.js'

const DEVICE_A = '11111111-1111-4111-8111-111111111111'
const DEVICE_B = '22222222-2222-4222-8222-222222222222'
const NEVER_CREATED_ID = '00000000-0000-0000-0000-000000000000'

const app = createApp()

function sceneBody(name: string) {
  return { name, schemaVersion: 1, objects: [], joints: [], simulation: { speed: 1 } }
}

describe('scene CRUD endpoints (D8/D9/D13/D17, M6.3)', () => {
  beforeAll(async () => {
    await runMigrations()
  })

  afterAll(async () => {
    await pool.end()
  })

  it('POST /scenes creates a scene and returns id/createdAt/updatedAt', async () => {
    const res = await request(app).post('/scenes').set('X-Device-Id', DEVICE_A).send(sceneBody('Test Scene'))

    expect(res.status).toBe(201)
    expect(res.body.id).toBeTruthy()
    expect(res.body.createdAt).toBeTruthy()
    expect(res.body.updatedAt).toBeTruthy()
    expect(res.body.name).toBe('Test Scene')
  })

  it('GET /scenes lists only the owning device\'s scenes, with id/name/updatedAt and no thumbnail field', async () => {
    const created = await request(app).post('/scenes').set('X-Device-Id', DEVICE_A).send(sceneBody('Listed Scene'))
    const id = created.body.id

    const res = await request(app).get('/scenes').set('X-Device-Id', DEVICE_A)

    expect(res.status).toBe(200)
    const entry = res.body.find((s: { id: string }) => s.id === id)
    expect(entry).toEqual({ id, name: 'Listed Scene', updatedAt: expect.any(String) })
  })

  it('GET /scenes/:id succeeds for both the owner (isOwner: true) and a non-owner (isOwner: false)', async () => {
    const created = await request(app).post('/scenes').set('X-Device-Id', DEVICE_A).send(sceneBody('Shared Scene'))
    const id = created.body.id

    const ownerView = await request(app).get(`/scenes/${id}`).set('X-Device-Id', DEVICE_A)
    expect(ownerView.status).toBe(200)
    expect(ownerView.body.isOwner).toBe(true)

    const nonOwnerView = await request(app).get(`/scenes/${id}`).set('X-Device-Id', DEVICE_B)
    expect(nonOwnerView.status).toBe(200)
    expect(nonOwnerView.body.isOwner).toBe(false)
    expect(nonOwnerView.body.name).toBe('Shared Scene') // D8: full scene still returned, not blocked
  })

  it('PUT /scenes/:id by the owner updates the scene and its updatedAt', async () => {
    const created = await request(app).post('/scenes').set('X-Device-Id', DEVICE_A).send(sceneBody('Before'))
    const id = created.body.id
    const before = created.body.updatedAt

    await new Promise((r) => setTimeout(r, 10)) // ensure a distinguishable updatedAt
    const put = await request(app).put(`/scenes/${id}`).set('X-Device-Id', DEVICE_A).send(sceneBody('Renamed'))
    expect(put.status).toBe(200)

    const after = await request(app).get(`/scenes/${id}`).set('X-Device-Id', DEVICE_A)
    expect(after.body.name).toBe('Renamed')
    expect(after.body.updatedAt).not.toBe(before)
  })

  it('PUT /scenes/:id by a non-owner is rejected with 403 and leaves the scene unchanged', async () => {
    const created = await request(app).post('/scenes').set('X-Device-Id', DEVICE_A).send(sceneBody('Protected'))
    const id = created.body.id

    const put = await request(app).put(`/scenes/${id}`).set('X-Device-Id', DEVICE_B).send(sceneBody('Hijacked'))
    expect(put.status).toBe(403)

    const after = await request(app).get(`/scenes/${id}`).set('X-Device-Id', DEVICE_A)
    expect(after.body.name).toBe('Protected')
  })

  it('DELETE /scenes/:id by the owner soft-deletes — a subsequent GET returns a distinct "deleted" response, not a 404', async () => {
    const created = await request(app).post('/scenes').set('X-Device-Id', DEVICE_A).send(sceneBody('To Delete'))
    const id = created.body.id

    const del = await request(app).delete(`/scenes/${id}`).set('X-Device-Id', DEVICE_A)
    expect(del.status).toBe(200)

    const after = await request(app).get(`/scenes/${id}`).set('X-Device-Id', DEVICE_A)
    expect(after.status).toBe(410)
    expect(after.body.status).toBe('deleted')
  })

  it('DELETE /scenes/:id by a non-owner is rejected with 403 and the scene remains fetchable', async () => {
    const created = await request(app).post('/scenes').set('X-Device-Id', DEVICE_A).send(sceneBody('Not Yours'))
    const id = created.body.id

    const del = await request(app).delete(`/scenes/${id}`).set('X-Device-Id', DEVICE_B)
    expect(del.status).toBe(403)

    const after = await request(app).get(`/scenes/${id}`).set('X-Device-Id', DEVICE_A)
    expect(after.status).toBe(200)
  })

  it('GET /scenes/:id for an id that was never created returns an ordinary 404 — distinct from a deleted scene\'s 410', async () => {
    const res = await request(app).get(`/scenes/${NEVER_CREATED_ID}`).set('X-Device-Id', DEVICE_A)
    expect(res.status).toBe(404)
  })

  it('a malformed (non-UUID) :id is treated as not-found (404), not a 500', async () => {
    const res = await request(app).get('/scenes/not-a-uuid').set('X-Device-Id', DEVICE_A)
    expect(res.status).toBe(404)
  })
})
