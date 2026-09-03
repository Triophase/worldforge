import express from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { requireDeviceId } from './deviceIdentity.js'

/** A minimal throwaway app mounting the middleware on one route — tests
 * the middleware itself in isolation, not any real (still-nonexistent)
 * scene/asset route. */
function testApp() {
  const app = express()
  app.get('/protected', requireDeviceId, (req, res) => {
    res.status(200).json({ deviceId: req.deviceId })
  })
  return app
}

describe('requireDeviceId (D18, M6.2)', () => {
  it('rejects a request with no X-Device-Id header at all', async () => {
    const res = await request(testApp()).get('/protected')

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/required/i)
  })

  it('rejects a request whose header is not a valid UUID', async () => {
    const res = await request(testApp()).get('/protected').set('X-Device-Id', 'not-a-uuid')

    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/uuid/i)
  })

  it('accepts a well-formed UUID v4 and exposes it to the handler as req.deviceId', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const res = await request(testApp()).get('/protected').set('X-Device-Id', id)

    expect(res.status).toBe(200)
    expect(res.body.deviceId).toBe(id)
  })
})
