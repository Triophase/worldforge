import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadScene, usePhysicsStore } from '../engine/physics/physicsStore'
import { loadDemoScene } from '../state/draftStore'
import { useSceneStore } from '../state/sceneStore'
import { useSimulationStore } from '../state/simulationStore'
import { FALLING_BOX_DEMO } from './fallingBox'

describe('FALLING_BOX_DEMO (D26/D29/§17, M3.6)', () => {
  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [] })
    loadScene([])
  })

  it('has exactly three objects: Ground, Platform (both static), Box (dynamic)', () => {
    expect(FALLING_BOX_DEMO.objects).toHaveLength(3)

    const ground = FALLING_BOX_DEMO.objects.find((o) => o.name === 'Ground')!
    const platform = FALLING_BOX_DEMO.objects.find((o) => o.name === 'Platform')!
    const box = FALLING_BOX_DEMO.objects.find((o) => o.name === 'Box')!

    expect(ground.physics.bodyType).toBe('static')
    expect(platform.physics.bodyType).toBe('static')
    expect(box.physics.bodyType).toBe('dynamic')
    expect(box.physics.gravity).toBe(true)
  })

  it('positions Platform above Ground, and Box above Platform with clear air between them', () => {
    const ground = FALLING_BOX_DEMO.objects.find((o) => o.name === 'Ground')!
    const platform = FALLING_BOX_DEMO.objects.find((o) => o.name === 'Platform')!
    const box = FALLING_BOX_DEMO.objects.find((o) => o.name === 'Box')!

    expect(platform.transform.position[1]).toBeGreaterThan(ground.transform.position[1])
    // Platform's own top surface (unscaled mechanical:platform half-height 0.05) vs Box's bottom
    // (mechanical:box half-height 0.5) — a real, non-overlapping gap.
    const platformTop = platform.transform.position[1] + 0.05
    const boxBottom = box.transform.position[1] - 0.5
    expect(boxBottom).toBeGreaterThan(platformTop)
  })

  it('loading it (via the generic draftStore mechanism) populates exactly these three objects', () => {
    loadDemoScene(FALLING_BOX_DEMO)
    const names = useSceneStore.getState().objects.map((o) => o.name).sort()
    expect(names).toEqual(['Box', 'Ground', 'Platform'])
  })

  it('after loading, the Box falls under gravity and comes to rest on the Platform, not through it', () => {
    loadDemoScene(FALLING_BOX_DEMO)
    const box = useSceneStore.getState().objects.find((o) => o.name === 'Box')!
    const platform = useSceneStore.getState().objects.find((o) => o.name === 'Platform')!

    useSimulationStore.getState().play()
    const world = usePhysicsStore.getState().world!
    for (let i = 0; i < 300; i++) world.step() // several seconds of simulated time

    const boxY = usePhysicsStore.getState().bodies.get(box.id)!.rigidBody.translation().y
    const platformTop = platform.transform.position[1] + 0.05
    // Settled on top of the platform (center height ~= platformTop + box half-height),
    // not embedded in or fallen through it.
    expect(boxY).toBeGreaterThan(platformTop)
    expect(boxY).toBeLessThan(FALLING_BOX_DEMO.objects.find((o) => o.name === 'Box')!.transform.position[1])
  })

  it('Reset after playing restores the Box to its exact original starting position', () => {
    loadDemoScene(FALLING_BOX_DEMO)
    const box = useSceneStore.getState().objects.find((o) => o.name === 'Box')!
    const startY = box.transform.position[1]

    useSimulationStore.getState().play()
    const world = usePhysicsStore.getState().world!
    for (let i = 0; i < 60; i++) world.step()

    useSimulationStore.getState().reset()

    const restoredY = usePhysicsStore.getState().bodies.get(box.id)!.rigidBody.translation().y
    expect(restoredY).toBeCloseTo(startY)
    expect(useSimulationStore.getState().phase).toBe('idle')
  })
})
