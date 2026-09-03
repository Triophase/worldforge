import { beforeEach, describe, expect, it } from 'vitest'
import { getLastActiveSceneId, setLastActiveSceneId } from './lastActiveScene'

describe('lastActiveScene (D43, M6.9)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns null when nothing has ever been set', () => {
    expect(getLastActiveSceneId()).toBeNull()
  })

  it('round-trips a set value', () => {
    setLastActiveSceneId('scene-123')
    expect(getLastActiveSceneId()).toBe('scene-123')
  })

  it('a later set overwrites the previous value', () => {
    setLastActiveSceneId('scene-1')
    setLastActiveSceneId('scene-2')
    expect(getLastActiveSceneId()).toBe('scene-2')
  })
})
