import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadScene } from '../engine/physics/physicsStore'
import { useSceneStore } from './sceneStore'
import { initFirstTimeExperienceIfNeeded, useOnboardingStore } from './firstTimeStore'

const CUBE = { kind: 'builtin' as const, key: 'primitive:cube' }

describe('firstTimeStore (§18/D26, M3.7 — temporary, superseded by M6.9)', () => {
  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [], isDirty: false })
    useOnboardingStore.setState({ showHint: false })
    localStorage.clear()
    loadScene([])
  })

  it('on a genuinely first-ever visit: loads Falling Box and shows the hint', () => {
    initFirstTimeExperienceIfNeeded()

    const names = useSceneStore.getState().objects.map((o) => o.name).sort()
    expect(names).toEqual(['Box', 'Ground', 'Platform'])
    expect(useOnboardingStore.getState().showHint).toBe(true)
  })

  it('marks the browser as seen so a later call does not show the hint again', () => {
    initFirstTimeExperienceIfNeeded()
    useOnboardingStore.setState({ showHint: false }) // simulate the hint already having been dismissed
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [] }) // simulate returning to empty (e.g. New Scene)

    initFirstTimeExperienceIfNeeded()

    const names = useSceneStore.getState().objects.map((o) => o.name).sort()
    expect(names).toEqual(['Box', 'Ground', 'Platform']) // still loads Falling Box...
    expect(useOnboardingStore.getState().showHint).toBe(false) // ...but never shows the hint again
  })

  it('does nothing when a real local draft already restored some objects (never overrides D4)', () => {
    useSceneStore.getState().addObject(CUBE, 'My Cube')

    initFirstTimeExperienceIfNeeded()

    expect(useSceneStore.getState().objects).toHaveLength(1)
    expect(useSceneStore.getState().objects[0].name).toBe('My Cube')
    expect(useOnboardingStore.getState().showHint).toBe(false)
  })
})
