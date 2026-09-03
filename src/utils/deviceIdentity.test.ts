import { beforeEach, describe, expect, it } from 'vitest'
import { getDeviceId } from './deviceIdentity'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('getDeviceId (D18, M6.2)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('generates a valid UUID v4 on first call and persists it to localStorage', () => {
    const id = getDeviceId()

    expect(id).toMatch(UUID_V4)
    expect(localStorage.getItem('deviceId')).toBe(id)
  })

  it('returns the exact same value on a subsequent call — no regeneration', () => {
    const first = getDeviceId()
    const second = getDeviceId()

    expect(second).toBe(first)
  })

  it('reads back a value already present in localStorage instead of generating a new one', () => {
    localStorage.setItem('deviceId', 'existing-fixed-value')

    expect(getDeviceId()).toBe('existing-fixed-value')
  })
})
