import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadScene, usePhysicsStore } from '../engine/physics/physicsStore'
import { loadDemoScene } from '../state/draftStore'
import { useSceneStore } from '../state/sceneStore'
import { useSimulationStore } from '../state/simulationStore'
import { SLIDER_DEMO } from './slider'

describe('SLIDER_DEMO (D26/§17/§18, M4.6)', () => {
  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [] })
    loadScene([])
  })

  it('has a Rail (static) and a Block (dynamic) connected by a Prismatic joint with the motor already on', () => {
    expect(SLIDER_DEMO.objects).toHaveLength(2)
    const rail = SLIDER_DEMO.objects.find((o) => o.name === 'Rail')!
    const block = SLIDER_DEMO.objects.find((o) => o.name === 'Block')!
    expect(rail.physics.bodyType).toBe('static')
    expect(block.physics.bodyType).toBe('dynamic')

    expect(SLIDER_DEMO.joints).toHaveLength(1)
    const joint = SLIDER_DEMO.joints[0]
    expect(joint.type).toBe('prismatic')
    expect(joint.motor.enabled).toBe(true)
    expect(joint.motor.speed).toBeGreaterThan(0)
  })

  it('pressing Play moves the block continuously along the axis', () => {
    loadDemoScene(SLIDER_DEMO)
    const block = useSceneStore.getState().objects.find((o) => o.name === 'Block')!
    const startX = block.transform.position[0]

    useSimulationStore.getState().play()
    const world = usePhysicsStore.getState().world!
    for (let i = 0; i < 30; i++) world.step()

    const x = usePhysicsStore.getState().bodies.get(block.id)!.rigidBody.translation().x
    expect(x).not.toBeCloseTo(startX)
  })

  it('Reset restores the original position', () => {
    loadDemoScene(SLIDER_DEMO)
    const block = useSceneStore.getState().objects.find((o) => o.name === 'Block')!
    const start = block.transform.position

    useSimulationStore.getState().play()
    const world = usePhysicsStore.getState().world!
    for (let i = 0; i < 30; i++) world.step()

    useSimulationStore.getState().reset()

    const restored = usePhysicsStore.getState().bodies.get(block.id)!.rigidBody.translation()
    expect(restored.x).toBeCloseTo(start[0])
    expect(restored.y).toBeCloseTo(start[1])
    expect(restored.z).toBeCloseTo(start[2])
  })
})
