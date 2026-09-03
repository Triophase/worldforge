import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadScene, usePhysicsStore } from '../engine/physics/physicsStore'
import { loadDemoScene } from '../state/draftStore'
import { useSceneStore } from '../state/sceneStore'
import { useSimulationStore } from '../state/simulationStore'
import { ROTATING_WHEEL_DEMO } from './rotatingWheel'

describe('ROTATING_WHEEL_DEMO (D26/§17/§18, M4.6)', () => {
  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [] })
    loadScene([])
  })

  it('has an Axle (static) and a Wheel (dynamic) connected by a Revolute joint with the motor already on', () => {
    expect(ROTATING_WHEEL_DEMO.objects).toHaveLength(2)
    const axle = ROTATING_WHEEL_DEMO.objects.find((o) => o.name === 'Axle')!
    const wheel = ROTATING_WHEEL_DEMO.objects.find((o) => o.name === 'Wheel')!
    expect(axle.physics.bodyType).toBe('static')
    expect(wheel.physics.bodyType).toBe('dynamic')

    expect(ROTATING_WHEEL_DEMO.joints).toHaveLength(1)
    const joint = ROTATING_WHEEL_DEMO.joints[0]
    expect(joint.type).toBe('revolute')
    expect(joint.motor.enabled).toBe(true)
    expect(joint.motor.speed).toBeGreaterThan(0)
  })

  it('pressing Play spins the wheel continuously around the joint axis', () => {
    loadDemoScene(ROTATING_WHEEL_DEMO)
    const wheel = useSceneStore.getState().objects.find((o) => o.name === 'Wheel')!

    useSimulationStore.getState().play()
    const world = usePhysicsStore.getState().world!
    for (let i = 0; i < 60; i++) world.step()

    const rotation = usePhysicsStore.getState().bodies.get(wheel.id)!.rigidBody.rotation()
    expect(rotation.w).not.toBeCloseTo(1) // no longer at its starting orientation
  })

  it('Reset restores the original orientation and motor speed', () => {
    loadDemoScene(ROTATING_WHEEL_DEMO)
    const wheel = useSceneStore.getState().objects.find((o) => o.name === 'Wheel')!
    const startRotation = { ...wheel.transform }.rotation

    useSimulationStore.getState().play()
    const world = usePhysicsStore.getState().world!
    for (let i = 0; i < 60; i++) world.step()

    useSimulationStore.getState().reset()

    const restored = usePhysicsStore.getState().bodies.get(wheel.id)!.rigidBody.rotation()
    expect(restored.x).toBeCloseTo(startRotation[0])
    expect(restored.y).toBeCloseTo(startRotation[1])
    expect(restored.z).toBeCloseTo(startRotation[2])
    expect(restored.w).toBeCloseTo(startRotation[3])
    expect(useSceneStore.getState().joints[0].motor.speed).toBe(ROTATING_WHEEL_DEMO.joints[0].motor.speed)
  })
})
