import { OrbitControls } from '@react-three/drei'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { beforeEach, describe, expect, it } from 'vitest'
import { CameraRig } from './CameraRig'
import { useCameraViewStore } from '../../state/cameraViewStore'

function Scene() {
  return (
    <>
      <CameraRig />
      <OrbitControls makeDefault enableDamping={false} />
    </>
  )
}

type TestCamera = {
  position: { x: number; y: number; z: number; distanceTo: (v: unknown) => number }
  isPerspectiveCamera?: boolean
  isOrthographicCamera?: boolean
}

/** Picks whichever camera instance `cameraViewStore.projection` currently says is active. */
function activeCamera(renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>) {
  const type = useCameraViewStore.getState().projection === 'perspective' ? 'PerspectiveCamera' : 'OrthographicCamera'
  return renderer.scene.findAllByType(type)[0].instance as unknown as TestCamera
}

describe('CameraRig', () => {
  beforeEach(() => {
    useCameraViewStore.setState({ projection: 'perspective', presetRequest: null, frameRequest: null })
  })

  it('exposes exactly one perspective and one orthographic camera object', async () => {
    const renderer = await ReactThreeTestRenderer.create(<Scene />)
    expect(renderer.scene.findAllByType('PerspectiveCamera')).toHaveLength(1)
    expect(renderer.scene.findAllByType('OrthographicCamera')).toHaveLength(1)
    await renderer.unmount()
  })

  it('moves the camera to the Top preset direction, preserving camera-to-target distance', async () => {
    const renderer = await ReactThreeTestRenderer.create(<Scene />)
    const before = activeCamera(renderer)
    const startDistance = before.position.distanceTo({ x: 0, y: 0, z: 0 })

    useCameraViewStore.getState().requestPreset('top')
    await renderer.advanceFrames(60, 1 / 60) // 1s of simulated time — well past the 200ms transition

    const after = activeCamera(renderer)
    // Top: camera ends up on the +Y axis above the target.
    expect(after.position.y).toBeGreaterThan(0)
    expect(Math.abs(after.position.x)).toBeLessThan(0.01)
    expect(Math.abs(after.position.z)).toBeLessThan(0.01)
    expect(after.position.distanceTo({ x: 0, y: 0, z: 0 })).toBeCloseTo(startDistance, 1)

    await renderer.unmount()
  })

  it('the transition is eased over time, not an instant cut', async () => {
    const renderer = await ReactThreeTestRenderer.create(<Scene />)
    const startX = activeCamera(renderer).position.x

    useCameraViewStore.getState().requestPreset('top')
    await renderer.advanceFrames(6, 1 / 60) // ~100ms — mid-transition (duration is 200ms)

    const midX = activeCamera(renderer).position.x
    expect(midX).toBeLessThan(startX) // moved, but not yet arrived at x=0
    expect(midX).toBeGreaterThan(0.01)

    await renderer.advanceFrames(60, 1 / 60) // finish it
    expect(Math.abs(activeCamera(renderer).position.x)).toBeLessThan(0.01)

    await renderer.unmount()
  })

  it('a second preset triggered mid-transition ends at the second preset, not stuck', async () => {
    const renderer = await ReactThreeTestRenderer.create(<Scene />)

    useCameraViewStore.getState().requestPreset('top')
    await renderer.advanceFrames(3, 1 / 60) // a few frames into the transition, not finished
    useCameraViewStore.getState().requestPreset('front')
    await renderer.advanceFrames(60, 1 / 60) // let the second transition fully resolve

    const after = activeCamera(renderer)
    // Front: camera ends up on the +Z axis, not still trending toward +Y.
    expect(after.position.z).toBeGreaterThan(0)
    expect(Math.abs(after.position.y)).toBeLessThan(0.01)

    await renderer.unmount()
  })

  it('toggling projection preserves the camera position (no jump to a default framing)', async () => {
    const renderer = await ReactThreeTestRenderer.create(<Scene />)

    useCameraViewStore.getState().requestPreset('top')
    await renderer.advanceFrames(60, 1 / 60)
    const beforeToggle = activeCamera(renderer)
    const posBefore = { x: beforeToggle.position.x, y: beforeToggle.position.y, z: beforeToggle.position.z }

    useCameraViewStore.getState().toggleProjection()
    await renderer.advanceFrames(1, 1 / 60)

    const afterToggle = activeCamera(renderer)
    expect(afterToggle.isOrthographicCamera).toBe(true)
    expect(afterToggle.position.x).toBeCloseTo(posBefore.x, 2)
    expect(afterToggle.position.y).toBeCloseTo(posBefore.y, 2)
    expect(afterToggle.position.z).toBeCloseTo(posBefore.z, 2)

    await renderer.unmount()
  })

  describe('M8.2: frame-on-selection (F)', () => {
    // The default scene starts the camera at [6,5,6] looking at the
    // origin. A frame request to `targetEnd` preserves the camera's
    // current offset from the target (direction × distance), so the
    // camera's own absolute end position is fully predictable without
    // needing to read the (drei-portalled, not visible to this test
    // renderer — same limitation `M1.2`'s memory note already found for
    // `GizmoHelper`) live `OrbitControls.target` directly: `cameraEnd =
    // startPosition + (targetEnd - startTarget)`.

    it('moves the camera by the same delta as the requested target, preserving the original offset', async () => {
      const renderer = await ReactThreeTestRenderer.create(<Scene />)
      const startDistance = activeCamera(renderer).position.distanceTo({ x: 0, y: 0, z: 0 })

      useCameraViewStore.getState().requestFrame([5, 0, 0])
      await renderer.advanceFrames(60, 1 / 60) // well past the transition

      const after = activeCamera(renderer)
      // start [6,5,6] + delta [5,0,0] = [11,5,6]
      expect(after.position.x).toBeCloseTo(11, 1)
      expect(after.position.y).toBeCloseTo(5, 1)
      expect(after.position.z).toBeCloseTo(6, 1)
      expect(after.position.distanceTo({ x: 5, y: 0, z: 0 })).toBeCloseTo(startDistance, 1)

      await renderer.unmount()
    })

    it('the frame transition is eased over time, not an instant cut', async () => {
      const renderer = await ReactThreeTestRenderer.create(<Scene />)
      const startX = activeCamera(renderer).position.x // 6

      useCameraViewStore.getState().requestFrame([5, 0, 0])
      await renderer.advanceFrames(6, 1 / 60) // ~100ms — mid-transition (duration is 200ms)

      const midX = activeCamera(renderer).position.x
      expect(midX).toBeGreaterThan(startX)
      expect(midX).toBeLessThan(11)

      await renderer.advanceFrames(60, 1 / 60)
      expect(activeCamera(renderer).position.x).toBeCloseTo(11, 1)

      await renderer.unmount()
    })

    it('a repeated F request mid-transition ends heading toward the second target, not stuck on the first', async () => {
      const renderer = await ReactThreeTestRenderer.create(<Scene />)

      useCameraViewStore.getState().requestFrame([5, 0, 0])
      await renderer.advanceFrames(3, 1 / 60) // partway through, not finished
      useCameraViewStore.getState().requestFrame([0, 0, 8])
      await renderer.advanceFrames(60, 1 / 60)

      const after = activeCamera(renderer)
      // A "frame" animation translates camera and target by the same
      // delta, so the offset between them (and thus the second request's
      // own computed distance/direction) is unchanged mid-transition —
      // the second request resolves to start [6,5,6] + delta [0,0,8] =
      // [6,5,14], not wherever the interrupted first request left off.
      expect(after.position.x).toBeCloseTo(6, 1)
      expect(after.position.y).toBeCloseTo(5, 1)
      expect(after.position.z).toBeCloseTo(14, 1)

      await renderer.unmount()
    })
  })
})
