import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadScene, usePhysicsStore } from '../engine/physics/physicsStore'
import { usePlaybackBridgeStore } from './playbackBridgeStore'
import { useSceneStore } from './sceneStore'
import { isEditLocked, useSimulationStore } from './simulationStore'

const CUBE = { kind: 'builtin' as const, key: 'primitive:cube' }

describe('simulationStore (§16/D2/D3, M3.4)', () => {
  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [], isDirty: false })
    useSimulationStore.setState({ phase: 'idle', snapshot: null })
    usePlaybackBridgeStore.setState({ liveTransform: null })
  })

  it('starts idle; isEditLocked is false while idle', () => {
    expect(useSimulationStore.getState().phase).toBe('idle')
    expect(isEditLocked()).toBe(false)
  })

  it('play() from idle transitions to playing and captures a snapshot of every body', () => {
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube', { position: [1, 2, 3] })
    useSceneStore.setState({
      objects: useSceneStore.getState().objects.map((o) => ({ ...o, physics: { ...o.physics, bodyType: 'dynamic' as const } })),
    })
    loadScene(useSceneStore.getState().objects)

    useSimulationStore.getState().play()

    expect(useSimulationStore.getState().phase).toBe('playing')
    expect(useSimulationStore.getState().snapshot?.[obj.id].position).toEqual([1, 2, 3])
    expect(isEditLocked()).toBe(true)
  })

  it('pause() stops without altering body state or re-snapshotting', () => {
    useSceneStore.getState().addObject(CUBE, 'Cube', { position: [0, 10, 0] })
    useSceneStore.setState({
      objects: useSceneStore.getState().objects.map((o) => ({ ...o, physics: { ...o.physics, bodyType: 'dynamic' as const } })),
    })
    loadScene(useSceneStore.getState().objects)

    useSimulationStore.getState().play()
    const snapshotAtPlay = useSimulationStore.getState().snapshot

    useSimulationStore.getState().pause()

    expect(useSimulationStore.getState().phase).toBe('paused')
    expect(useSimulationStore.getState().snapshot).toBe(snapshotAtPlay) // same object reference — never replaced
    expect(isEditLocked()).toBe(true)
  })

  it('play() again after pause resumes without taking a new snapshot', () => {
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube', { position: [0, 10, 0] })
    useSceneStore.setState({
      objects: useSceneStore.getState().objects.map((o) => ({ ...o, physics: { ...o.physics, bodyType: 'dynamic' as const } })),
    })
    loadScene(useSceneStore.getState().objects)

    useSimulationStore.getState().play()
    const originalSnapshot = useSimulationStore.getState().snapshot!

    const world = usePhysicsStore.getState().world!
    for (let i = 0; i < 20; i++) world.step()
    useSimulationStore.getState().pause()
    const pausedPosition = usePhysicsStore.getState().bodies.get(obj.id)!.rigidBody.translation().y

    useSimulationStore.getState().play()

    expect(useSimulationStore.getState().phase).toBe('playing')
    expect(useSimulationStore.getState().snapshot).toBe(originalSnapshot)
    expect(originalSnapshot[obj.id].position[1]).toBeCloseTo(10)
    expect(pausedPosition).toBeLessThan(10) // paused-state value differs from the untouched original snapshot
  })

  it('reset() restores the original snapshot values and returns to idle', () => {
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube', { position: [0, 10, 0] })
    useSceneStore.setState({
      objects: useSceneStore.getState().objects.map((o) => ({ ...o, physics: { ...o.physics, bodyType: 'dynamic' as const } })),
    })
    loadScene(useSceneStore.getState().objects)

    useSimulationStore.getState().play()
    const world = usePhysicsStore.getState().world!
    for (let i = 0; i < 30; i++) world.step()

    useSimulationStore.getState().reset()

    expect(useSimulationStore.getState().phase).toBe('idle')
    expect(isEditLocked()).toBe(false)
    const restored = usePhysicsStore.getState().bodies.get(obj.id)!.rigidBody.translation()
    expect(restored.y).toBeCloseTo(10)
  })

  it('reset() clears the playback bridge live transform', () => {
    usePlaybackBridgeStore.setState({
      liveTransform: { position: [1, 1, 1], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    })

    useSimulationStore.getState().reset()

    expect(usePlaybackBridgeStore.getState().liveTransform).toBeNull()
  })

  it('play() is a no-op while already playing', () => {
    useSceneStore.getState().addObject(CUBE, 'Cube')
    loadScene(useSceneStore.getState().objects)
    useSimulationStore.getState().play()
    const snapshotAfterFirstPlay = useSimulationStore.getState().snapshot

    useSimulationStore.getState().play()

    expect(useSimulationStore.getState().snapshot).toBe(snapshotAfterFirstPlay)
  })

  it('pause() is a no-op unless currently playing', () => {
    useSimulationStore.getState().pause()
    expect(useSimulationStore.getState().phase).toBe('idle')
  })

  describe('joint motor snapshot/restore (D3 extended, M4.1)', () => {
    it('play() snapshots every existing joint’s motor enabled/speed', () => {
      const a = useSceneStore.getState().addObject(CUBE, 'A')
      const b = useSceneStore.getState().addObject(CUBE, 'B', { position: [2, 0, 0] })
      const joint = useSceneStore.getState().createJoint(a.id, b.id, 'revolute', { motor: { enabled: true, speed: 2 } })!
      loadScene(useSceneStore.getState().objects, useSceneStore.getState().joints)

      useSimulationStore.getState().play()

      expect(useSimulationStore.getState().jointMotorSnapshot?.[joint.id]).toEqual({ enabled: true, speed: 2 })
    })

    it("changing a joint's motor speed while playing, then Reset, restores the Play-press value — not the live-adjusted one", () => {
      const a = useSceneStore.getState().addObject(CUBE, 'A')
      const b = useSceneStore.getState().addObject(CUBE, 'B', { position: [2, 0, 0] })
      const joint = useSceneStore.getState().createJoint(a.id, b.id, 'revolute', { motor: { enabled: true, speed: 2 } })!
      loadScene(useSceneStore.getState().objects, useSceneStore.getState().joints)

      useSimulationStore.getState().play()
      useSceneStore.getState().updateJoint(joint.id, { motor: { enabled: true, speed: 9 } })
      expect(useSceneStore.getState().joints[0].motor.speed).toBe(9)

      useSimulationStore.getState().reset()

      expect(useSceneStore.getState().joints[0].motor).toEqual({ enabled: true, speed: 2 })
    })

    it('reset() with no joints in the scene never touches sceneStore.joints or isDirty', () => {
      useSceneStore.getState().addObject(CUBE, 'Cube')
      loadScene(useSceneStore.getState().objects)
      useSceneStore.setState({ isDirty: false })

      useSimulationStore.getState().play()
      useSimulationStore.getState().reset()

      expect(useSceneStore.getState().joints).toEqual([])
      expect(useSceneStore.getState().isDirty).toBe(false)
    })

    it("reset() leaves isDirty false if no joint's motor actually changed while playing", () => {
      const a = useSceneStore.getState().addObject(CUBE, 'A')
      const b = useSceneStore.getState().addObject(CUBE, 'B', { position: [2, 0, 0] })
      useSceneStore.getState().createJoint(a.id, b.id, 'revolute', { motor: { enabled: true, speed: 2 } })
      loadScene(useSceneStore.getState().objects, useSceneStore.getState().joints)
      useSceneStore.setState({ isDirty: false })

      useSimulationStore.getState().play()
      useSimulationStore.getState().reset()

      expect(useSceneStore.getState().isDirty).toBe(false)
    })

    it('jointMotorSnapshot is null while idle and cleared again after reset()', () => {
      useSceneStore.getState().addObject(CUBE, 'Cube')
      loadScene(useSceneStore.getState().objects)
      expect(useSimulationStore.getState().jointMotorSnapshot).toBeNull()

      useSimulationStore.getState().play()
      useSimulationStore.getState().reset()

      expect(useSimulationStore.getState().jointMotorSnapshot).toBeNull()
    })
  })
})
