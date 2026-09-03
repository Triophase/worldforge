import type { NextFunction, Request, Response } from 'express'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * D18: the entire ownership mechanism is this one header — no cookie,
 * no server-side session (`backend-api`'s prime directive #2). Any route
 * that needs to know "which device is this" mounts this middleware
 * first; a missing or malformed header is a client error (400), never a
 * silent pass-through with an `undefined` identity (M6.3/M6.4's owner
 * checks would otherwise be trivially bypassable).
 */
export function requireDeviceId(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('X-Device-Id')

  if (!header) {
    res.status(400).json({ error: 'X-Device-Id header is required' })
    return
  }

  if (!UUID_V4.test(header)) {
    res.status(400).json({ error: 'X-Device-Id must be a valid UUID' })
    return
  }

  req.deviceId = header
  next()
}
