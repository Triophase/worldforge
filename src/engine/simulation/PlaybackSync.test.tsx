import RAPIER from '@dimforge/rapier3d-compat'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadScene } from '../physics/physicsStore'
import { usePlaybackBridgeStore } from '../../state/playbackBridgeStore'
import { useSceneStore } from '../../state/sceneStore'
import { useSimulationStore } from '../../state/simulationStore'
import { PlaybackSync } from './PlaybackSync'

const CUBE = { kind: 'builtin' as const, key: 'primitive:cube' }
const RAMP = { kind: 'builtin' as const, key: 'mechanical:ramp' }

describe('PlaybackSync (D2: read-only live Properties display, M3.4)', () => {
  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [] })
    useSimulationStore.setState({ phase: 'idle', snapshot: null })
    usePlaybackBridgeStore.setState({ liveTransform: null })
    loadScene([])
  })

  it('never writes a live transform while idle, even with a selection', async () => {
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube', { position: [1, 2, 3] })
    useSceneStore.getState().select(obj.id)
    loadScene(useSceneStore.getState().objects)

    const renderer = await ReactThreeTestRenderer.create(<PlaybackSync />)
    await renderer.advanceFrames(1, 1 / 60)

    expect(usePlaybackBridgeStore.getState().liveTransform).toBeNull()
    await renderer.unmount()
  })

  it('writes the sole-selected object’s current position while playing', async () => {
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube', { position: [1, 2, 3] })
    useSceneStore.getState().select(obj.id)
    loadScene(useSceneStore.getState().objects)
    useSimulationStore.setState({ phase: 'playing' })

    const renderer = await ReactThreeTestRenderer.create(<PlaybackSync />)
    await renderer.advanceFrames(1, 1 / 60)

    expect(usePlaybackBridgeStore.getState().liveTransform?.position).toEqual([1, 2, 3])
    await renderer.unmount()
  })

  it('keeps updating (still writes) while paused, not just playing', async () => {
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube', { position: [4, 5, 6] })
    useSceneStore.getState().select(obj.id)
    loadScene(useSceneStore.getState().objects)
    useSimulationStore.setState({ phase: 'paused' })

    const renderer = await ReactThreeTestRenderer.create(<PlaybackSync />)
    await renderer.advanceFrames(1, 1 / 60)

    expect(usePlaybackBridgeStore.getState().liveTransform?.position).toEqual([4, 5, 6])
    await renderer.unmount()
  })

  it('decomposes the tilted asset’s composed rotation back to its own rotation (Ramp)', async () => {
    const obj = useSceneStore.getState().addObject(RAMP, 'Ramp')
    useSceneStore.getState().select(obj.id)
    loadScene(useSceneStore.getState().objects)
    useSimulationStore.setState({ phase: 'playing' })

    const renderer = await ReactThreeTestRenderer.create(<PlaybackSync />)
    await renderer.advanceFrames(1, 1 / 60)

    // Ramp's own stored rotation is identity; the body's raw rotation is
    // the tilted (composed) one — the bridge must show the decomposed,
    // object-own value, matching what the Properties panel expects.
    const rotation = usePlaybackBridgeStore.getState().liveTransform!.rotation
    rotation.forEach((component, i) => expect(component).toBeCloseTo(obj.transform.rotation[i]))
    await renderer.unmount()
  })

  it('writes nothing when zero or more than one object is selected', async () => {
    const a = useSceneStore.getState().addObject(CUBE, 'A')
    const b = useSceneStore.getState().addObject(CUBE, 'B')
    loadScene(useSceneStore.getState().objects)
    useSimulationStore.setState({ phase: 'playing' })

    const renderer = await ReactThreeTestRenderer.create(<PlaybackSync />)
    await renderer.advanceFrames(1, 1 / 60)
    expect(usePlaybackBridgeStore.getState().liveTransform).toBeNull()

    useSceneStore.setState({ selectedIds: [a.id, b.id] })
    await renderer.advanceFrames(1, 1 / 60)
    expect(usePlaybackBridgeStore.getState().liveTransform).toBeNull()

    await renderer.unmount()
  })
})
