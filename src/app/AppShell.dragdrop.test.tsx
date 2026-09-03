import { fireEvent, render, screen } from '@testing-library/react'
import { BoxGeometry, Mesh, MeshStandardMaterial, PerspectiveCamera } from 'three'
import { beforeEach, describe, expect, it } from 'vitest'
import { ROBOT_ARM_ASSEMBLY } from '../assets/assemblies'
import { ASSET_DRAG_MIME } from '../components/AssetLibrary/AssetLibraryPanel'
import { useSceneStore } from '../state/sceneStore'
import { useUploadedAssetsStore } from '../state/uploadedAssetsStore'
import { useViewportBridgeStore } from '../state/viewportBridgeStore'
import { AppShell } from './AppShell'

/** A minimal DataTransfer-like object — jsdom's own DataTransfer doesn't
 * fully implement setData/getData round-tripping, so drag events are
 * fired with this instead. */
function makeDataTransfer(key: string) {
  const store = new Map<string, string>([[ASSET_DRAG_MIME, key]])
  return {
    setData: (type: string, value: string) => store.set(type, value),
    getData: (type: string) => store.get(type) ?? '',
    types: [...store.keys()],
    effectAllowed: 'copy',
  }
}

describe('AppShell — asset drag-to-place (M2.3)', () => {
  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [] })
    useViewportBridgeStore.setState({ camera: null, domElement: null })
    useUploadedAssetsStore.setState({ uploads: [], lastUploadError: null, lastUploadErrorReason: null, progress: null })
  })

  it('dropping over the viewport with a resolvable camera raycasts and places the object at the hit point', () => {
    const camera = new PerspectiveCamera(50, 800 / 600, 0.1, 1000)
    camera.position.set(0, 10, 0)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()

    const viewportDom = document.createElement('div')
    viewportDom.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }) as DOMRect
    useViewportBridgeStore.setState({ camera, domElement: viewportDom })

    render(<AppShell />)
    const shell = screen.getByText('Worldforge').closest('div')!

    fireEvent.drop(shell, { dataTransfer: makeDataTransfer('mechanical:wheel'), clientX: 400, clientY: 300 })

    const state = useSceneStore.getState()
    expect(state.objects).toHaveLength(1)
    expect(state.objects[0].transform.position[0]).toBeCloseTo(0, 1)
    expect(state.objects[0].transform.position[2]).toBeCloseTo(0, 1)
    expect(state.selectedIds).toEqual([state.objects[0].id])
  })

  it('dropping with no viewport bridge available (or outside its bounds) falls back to origin placement', () => {
    // No camera/domElement registered — simulates dropping before the
    // Canvas has mounted, or genuinely outside the viewport's bounds.
    render(<AppShell />)
    const shell = screen.getByText('Worldforge').closest('div')!

    fireEvent.drop(shell, { dataTransfer: makeDataTransfer('primitive:sphere'), clientX: 9999, clientY: 9999 })

    const state = useSceneStore.getState()
    expect(state.objects).toHaveLength(1)
    expect(state.objects[0].transform.position[0]).toBe(0)
    expect(state.objects[0].transform.position[2]).toBe(0)
    expect(state.objects[0].transform.position[1]).toBeCloseTo(0.5) // sphere radius
  })

  it('a drop with no recognizable asset payload does nothing', () => {
    render(<AppShell />)
    const shell = screen.getByText('Worldforge').closest('div')!

    fireEvent.drop(shell, {
      dataTransfer: { getData: () => '', types: [] } as unknown as DataTransfer,
      clientX: 100,
      clientY: 100,
    })

    expect(useSceneStore.getState().objects).toHaveLength(0)
  })

  it('dragging the Robot Arm card places Base at the raycast hit point, with the rest of the assembly offset relative to it (M4.7)', () => {
    const camera = new PerspectiveCamera(50, 800 / 600, 0.1, 1000)
    camera.position.set(0, 10, 0)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()

    const viewportDom = document.createElement('div')
    viewportDom.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }) as DOMRect
    useViewportBridgeStore.setState({ camera, domElement: viewportDom })

    render(<AppShell />)
    const shell = screen.getByText('Worldforge').closest('div')!

    fireEvent.drop(shell, { dataTransfer: makeDataTransfer(ROBOT_ARM_ASSEMBLY.key), clientX: 400, clientY: 300 })

    const state = useSceneStore.getState()
    expect(state.objects).toHaveLength(4)
    expect(state.joints).toHaveLength(2)
    const base = state.objects.find((o) => o.name === 'Base')!
    const segment1 = state.objects.find((o) => o.name === 'Arm Segment 1')!
    expect(base.transform.position[0]).toBeCloseTo(0, 1)
    expect(base.transform.position[2]).toBeCloseTo(0, 1)
    expect(segment1.transform.position[0]).toBeCloseTo(base.transform.position[0] + 1, 1)
    expect(state.selectedIds).toEqual([base.id])
  })

  it('dragging an uploaded card onto the viewport places it via the uploaded-assets branch, selected', () => {
    useUploadedAssetsStore.getState().addUpload({
      id: 'u1',
      filename: 'Widget.glb',
      format: 'glb',
      fileSize: 100,
      object: new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial()),
      boundingBox: { width: 1, height: 2, depth: 1 },
      meshCount: 1,
      file: new File([], 'Widget.glb'),
    })

    render(<AppShell />)
    const shell = screen.getByText('Worldforge').closest('div')!

    // No viewport bridge registered (mirrors this file's own "falls back
    // to origin placement" case above) — `AppShell`'s real mounted
    // `<Canvas>` only ever has a zero-size `domElement` under jsdom
    // (no real layout), so `raycastGroundPlane`'s hit-point behavior for
    // an uploaded card is covered at the unit level in
    // `useAssetDrop.test.ts` instead, the same way `AppShell.dragdrop`'s
    // own builtin-card coverage happens to never actually exercise a
    // successful non-origin hit either (every camera here looks straight
    // down at the origin).
    fireEvent.drop(shell, { dataTransfer: makeDataTransfer('u1'), clientX: 400, clientY: 300 })

    const state = useSceneStore.getState()
    expect(state.objects).toHaveLength(1)
    expect(state.objects[0].assetRef).toEqual({ kind: 'uploaded', key: 'u1' })
    expect(state.objects[0].transform.scale).toEqual([1, 1, 1])
    expect(state.selectedIds).toEqual([state.objects[0].id])
  })
})
