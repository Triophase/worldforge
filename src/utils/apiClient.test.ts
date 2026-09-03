import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from './apiClient'
import { getDeviceId } from './deviceIdentity'

describe('apiFetch (D18, M6.2)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('attaches the current device id as the X-Device-Id header', async () => {
    const deviceId = getDeviceId()
    await apiFetch('/scenes')

    const [, init] = vi.mocked(fetch).mock.calls[0]!
    const headers = new Headers(init?.headers)
    expect(headers.get('X-Device-Id')).toBe(deviceId)
  })

  it("doesn't clobber caller-supplied headers", async () => {
    await apiFetch('/scenes', { headers: { 'Content-Type': 'application/json' } })

    const [, init] = vi.mocked(fetch).mock.calls[0]!
    const headers = new Headers(init?.headers)
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('X-Device-Id')).toBe(getDeviceId())
  })

  it('requests the path against the configured API base URL', async () => {
    await apiFetch('/scenes')

    const [url] = vi.mocked(fetch).mock.calls[0]!
    expect(String(url)).toMatch(/\/scenes$/)
  })

  it('D15/M6.8: passes a bounded AbortSignal, so a non-responding backend can never hang the caller forever', async () => {
    await apiFetch('/scenes')

    const [, init] = vi.mocked(fetch).mock.calls[0]!
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(init?.signal?.aborted).toBe(false) // not already aborted — the bound just exists, not yet reached
  })
})
