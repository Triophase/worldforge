import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadScene, usePhysicsStore } from '../engine/physics/physicsStore'
import { loadDemoScene } from '../state/draftStore'
import { useSceneStore } from '../state/sceneStore'
import { useSimulationStore } from '../state/simulationStore'
import { BOUNCING_BALL_DEMO } from './bouncingBall'

describe('BOUNCING_BALL_DEMO (D26/§17/§18, M4.6)', () => {
  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [] })
    loadScene([])
  })

  it('has a static Platform and a dynamic Ball with high restitution, no joints at all', () => {
    expect(BOUNCING_BALL_DEMO.objects).toHaveLength(2)
    expect(BOUNCING_BALL_DEMO.joints).toEqual([])
    const platform = BOUNCING_BALL_DEMO.objects.find((o) => o.name === 'Platform')!
    const ball = BOUNCING_BALL_DEMO.objects.find((o) => o.name === 'Ball')!
    expect(platform.physics.bodyType).toBe('static')
    expect(ball.physics.bodyType).toBe('dynamic')
    expect(ball.physics.gravity).toBe(true)
    expect(ball.physics.restitution).toBeGreaterThan(0.6)
  })

  it('pressing Play drops the ball and produces at least one visible bounce before settling', () => {
    loadDemoScene(BOUNCING_BALL_DEMO)
    const ball = useSceneStore.getState().objects.find((o) => o.name === 'Ball')!
    const startY = ball.transform.position[1]

    useSimulationStore.getState().play()
    const world = usePhysicsStore.getState().world!
    const heights: number[] = []
    for (let i = 0; i < 240; i++) {
      world.step()
      heights.push(usePhysicsStore.getState().bodies.get(ball.id)!.rigidBody.translation().y)
    }

    // Falls well below its starting height...
    expect(Math.min(...heights)).toBeLessThan(startY - 1)
    // ...then a bounce sends it measurably back upward before it settles —
    // some later sample is meaningfully higher than the lowest point reached.
    const lowestIndex = heights.indexOf(Math.min(...heights))
    const afterLowest = heights.slice(lowestIndex)
    expect(Math.max(...afterLowest)).toBeGreaterThan(Math.min(...heights) + 0.2)
  })

  it('Reset restores the original starting height', () => {
    loadDemoScene(BOUNCING_BALL_DEMO)
    const ball = useSceneStore.getState().objects.find((o) => o.name === 'Ball')!
    const startY = ball.transform.position[1]

    useSimulationStore.getState().play()
    const world = usePhysicsStore.getState().world!
    for (let i = 0; i < 100; i++) world.step()

    useSimulationStore.getState().reset()

    const restoredY = usePhysicsStore.getState().bodies.get(ball.id)!.rigidBody.translation().y
    expect(restoredY).toBeCloseTo(startY)
  })
})
