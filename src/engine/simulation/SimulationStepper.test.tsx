import RAPIER from '@dimforge/rapier3d-compat'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadScene, usePhysicsStore } from '../physics/physicsStore'
import { useSceneStore } from '../../state/sceneStore'
import { useSimulationStore } from '../../state/simulationStore'
import { SimulationStepper } from './SimulationStepper'

const CUBE = { kind: 'builtin' as const, key: 'primitive:cube' }

describe('SimulationStepper (§13/§16, M3.4) — the one place world.step() is called', () => {
  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [] })
    useSimulationStore.setState({ phase: 'idle', snapshot: null, speed: 1, elapsed: 0 })
    loadScene([])
  })

  it('never advances the world while idle', async () => {
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube', { position: [0, 10, 0] })
    useSceneStore.setState({
      objects: useSceneStore.getState().objects.map((o) => ({ ...o, physics: { ...o.physics, bodyType: 'dynamic' as const } })),
    })
    loadScene(useSceneStore.getState().objects)

    const renderer = await ReactThreeTestRenderer.create(<SimulationStepper />)
    await renderer.advanceFrames(10, 1 / 60)

    const position = usePhysicsStore.getState().bodies.get(obj.id)!.rigidBody.translation()
    expect(position.y).toBeCloseTo(10)
    await renderer.unmount()
  })

  it('never advances the world while paused', async () => {
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube', { position: [0, 10, 0] })
    useSceneStore.setState({
      objects: useSceneStore.getState().objects.map((o) => ({ ...o, physics: { ...o.physics, bodyType: 'dynamic' as const } })),
    })
    loadScene(useSceneStore.getState().objects)
    useSimulationStore.setState({ phase: 'paused' })

    const renderer = await ReactThreeTestRenderer.create(<SimulationStepper />)
    await renderer.advanceFrames(10, 1 / 60)

    const position = usePhysicsStore.getState().bodies.get(obj.id)!.rigidBody.translation()
    expect(position.y).toBeCloseTo(10)
    await renderer.unmount()
  })

  it('advances the world every frame while playing', async () => {
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube', { position: [0, 10, 0] })
    useSceneStore.setState({
      objects: useSceneStore.getState().objects.map((o) => ({ ...o, physics: { ...o.physics, bodyType: 'dynamic' as const } })),
    })
    loadScene(useSceneStore.getState().objects)
    useSimulationStore.setState({ phase: 'playing' })

    const renderer = await ReactThreeTestRenderer.create(<SimulationStepper />)
    await renderer.advanceFrames(10, 1 / 60)

    const position = usePhysicsStore.getState().bodies.get(obj.id)!.rigidBody.translation()
    expect(position.y).toBeLessThan(10)
    await renderer.unmount()
  })

  it('does not throw when no world exists yet', async () => {
    usePhysicsStore.setState({ world: null, bodies: new Map() })
    const renderer = await ReactThreeTestRenderer.create(<SimulationStepper />)
    useSimulationStore.setState({ phase: 'playing' })
    await renderer.advanceFrames(1, 1 / 60)
    await renderer.unmount()
  })

  describe('speed scaling (§16, M3.5)', () => {
    it('at 2x, one step advances the world using twice the base timestep', async () => {
      useSceneStore.getState().addObject(CUBE, 'Cube', { position: [0, 10, 0] })
      useSceneStore.setState({
        objects: useSceneStore.getState().objects.map((o) => ({ ...o, physics: { ...o.physics, bodyType: 'dynamic' as const } })),
      })
      loadScene(useSceneStore.getState().objects)
      useSimulationStore.setState({ phase: 'playing', speed: 2 })

      const renderer = await ReactThreeTestRenderer.create(<SimulationStepper />)
      await renderer.advanceFrames(1, 1 / 60)

      expect(usePhysicsStore.getState().world!.timestep).toBeCloseTo(2 / 60)
      await renderer.unmount()
    })

    it('a body falls a smaller distance per real-world frame count at 0.25x than at 1x', async () => {
      const slow = useSceneStore.getState().addObject(CUBE, 'Slow', { position: [0, 10, 0] })
      useSceneStore.setState({
        objects: useSceneStore.getState().objects.map((o) => ({ ...o, physics: { ...o.physics, bodyType: 'dynamic' as const } })),
      })
      loadScene(useSceneStore.getState().objects)
      useSimulationStore.setState({ phase: 'playing', speed: 0.25 })
      const slowRenderer = await ReactThreeTestRenderer.create(<SimulationStepper />)
      await slowRenderer.advanceFrames(30, 1 / 60)
      const slowY = usePhysicsStore.getState().bodies.get(slow.id)!.rigidBody.translation().y
      await slowRenderer.unmount()

      useSceneStore.setState({ objects: [] })
      const fast = useSceneStore.getState().addObject(CUBE, 'Fast', { position: [0, 10, 0] })
      useSceneStore.setState({
        objects: useSceneStore.getState().objects.map((o) => ({ ...o, physics: { ...o.physics, bodyType: 'dynamic' as const } })),
      })
      loadScene(useSceneStore.getState().objects)
      useSimulationStore.setState({ phase: 'playing', speed: 1 })
      const fastRenderer = await ReactThreeTestRenderer.create(<SimulationStepper />)
      await fastRenderer.advanceFrames(30, 1 / 60)
      const fastY = usePhysicsStore.getState().bodies.get(fast.id)!.rigidBody.translation().y
      await fastRenderer.unmount()

      // Both start at y=10; the slower run has fallen less (higher y).
      expect(slowY).toBeGreaterThan(fastY)
    })

    it('changing speed mid-play takes effect on the very next step, no Pause required', async () => {
      useSceneStore.getState().addObject(CUBE, 'Cube', { position: [0, 10, 0] })
      useSceneStore.setState({
        objects: useSceneStore.getState().objects.map((o) => ({ ...o, physics: { ...o.physics, bodyType: 'dynamic' as const } })),
      })
      loadScene(useSceneStore.getState().objects)
      useSimulationStore.setState({ phase: 'playing', speed: 1 })

      const renderer = await ReactThreeTestRenderer.create(<SimulationStepper />)
      await renderer.advanceFrames(1, 1 / 60)
      expect(usePhysicsStore.getState().world!.timestep).toBeCloseTo(1 / 60)

      useSimulationStore.getState().setSpeed(2)
      await renderer.advanceFrames(1, 1 / 60)
      expect(usePhysicsStore.getState().world!.timestep).toBeCloseTo(2 / 60)
      await renderer.unmount()
    })
  })

  describe('elapsed time accumulation (D30, M3.5)', () => {
    it('accumulates elapsed simulated time (scaled by speed) only while playing', async () => {
      useSceneStore.getState().addObject(CUBE, 'Cube')
      loadScene(useSceneStore.getState().objects)
      useSimulationStore.setState({ phase: 'playing', speed: 2 })

      const renderer = await ReactThreeTestRenderer.create(<SimulationStepper />)
      await renderer.advanceFrames(10, 1 / 60)

      // 10 steps at speed 2x, base timestep 1/60 => 10 * 2/60 seconds.
      expect(useSimulationStore.getState().elapsed).toBeCloseTo((10 * 2) / 60)
      await renderer.unmount()
    })

    it('does not accumulate while paused', async () => {
      useSceneStore.getState().addObject(CUBE, 'Cube')
      loadScene(useSceneStore.getState().objects)
      useSimulationStore.setState({ phase: 'paused' })

      const renderer = await ReactThreeTestRenderer.create(<SimulationStepper />)
      await renderer.advanceFrames(10, 1 / 60)

      expect(useSimulationStore.getState().elapsed).toBe(0)
      await renderer.unmount()
    })
  })
})
