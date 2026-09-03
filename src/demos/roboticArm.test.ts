import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadScene, usePhysicsStore } from '../engine/physics/physicsStore'
import { loadDemoScene } from '../state/draftStore'
import { useSceneStore } from '../state/sceneStore'
import { useSimulationStore } from '../state/simulationStore'
import { ROBOTIC_ARM_DEMO } from './roboticArm'

describe('ROBOTIC_ARM_DEMO (D20/D26/§17/§18, M4.6)', () => {
  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [] })
    loadScene([])
  })

  it("matches D20's composition: Base, Arm Segment 1, Arm Segment 2, End Effector, plus a Ground, connected by exactly two revolute joints", () => {
    const names = ROBOTIC_ARM_DEMO.objects.map((o) => o.name).sort()
    expect(names).toEqual(['Arm Segment 1', 'Arm Segment 2', 'Base', 'End Effector', 'Ground'])
    expect(ROBOTIC_ARM_DEMO.joints).toHaveLength(2)
    expect(ROBOTIC_ARM_DEMO.joints.every((j) => j.type === 'revolute')).toBe(true)
  })

  it('at least one joint has its motor enabled by default (moves on Play, unlike a manually-added assembly)', () => {
    expect(ROBOTIC_ARM_DEMO.joints.some((j) => j.motor.enabled && j.motor.speed > 0)).toBe(true)
  })

  it('pressing Play visibly moves at least one arm segment', () => {
    loadDemoScene(ROBOTIC_ARM_DEMO)
    const segment1 = useSceneStore.getState().objects.find((o) => o.name === 'Arm Segment 1')!

    useSimulationStore.getState().play()
    const world = usePhysicsStore.getState().world!
    for (let i = 0; i < 60; i++) world.step()

    const rotation = usePhysicsStore.getState().bodies.get(segment1.id)!.rigidBody.rotation()
    expect(rotation.w).not.toBeCloseTo(1)
  })

  it('Reset restores the authored starting pose', () => {
    loadDemoScene(ROBOTIC_ARM_DEMO)
    const segment1 = useSceneStore.getState().objects.find((o) => o.name === 'Arm Segment 1')!
    const start = segment1.transform.position

    useSimulationStore.getState().play()
    const world = usePhysicsStore.getState().world!
    for (let i = 0; i < 60; i++) world.step()

    useSimulationStore.getState().reset()

    const restored = usePhysicsStore.getState().bodies.get(segment1.id)!.rigidBody.translation()
    expect(restored.x).toBeCloseTo(start[0])
    expect(restored.y).toBeCloseTo(start[1])
    expect(restored.z).toBeCloseTo(start[2])
  })
})
