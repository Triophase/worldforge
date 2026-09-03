import { describe, expect, it } from 'vitest'
import { parseShareLinkId } from './shareLink'

describe('parseShareLinkId (D13, M6.6)', () => {
  it('extracts the id from /scene/:id', () => {
    expect(parseShareLinkId('/scene/abc-123')).toBe('abc-123')
  })

  it('tolerates a trailing slash', () => {
    expect(parseShareLinkId('/scene/abc-123/')).toBe('abc-123')
  })

  it('returns null for the app root', () => {
    expect(parseShareLinkId('/')).toBeNull()
  })

  it('returns null for an unrelated path', () => {
    expect(parseShareLinkId('/scenes')).toBeNull()
  })

  it('returns null for a path with extra segments', () => {
    expect(parseShareLinkId('/scene/abc-123/extra')).toBeNull()
  })
})
