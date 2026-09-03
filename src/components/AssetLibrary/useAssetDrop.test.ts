import { renderHook } from '@testing-library/react'
import type { DragEvent } from 'react'
import { BoxGeometry, Mesh, MeshStandardMaterial, PerspectiveCamera } from 'three'
import { beforeEach, describe, expect, it } from 'vitest'
import { raycastGroundPlane } from '../../assets/placement'
import { useSceneStore } from '../../state/sceneStore'
import { useUploadedAssetsStore } from '../../state/uploadedAssetsStore'
import { useViewportBridgeStore } from '../../state/viewportBridgeStore'
import { ASSET_DRAG_MIME } from './AssetLibraryPanel'
import { useAssetDrop } from './useAssetDrop'

function makeDataTransfer(key: string) {
  const store = new Map<string, string>([[ASSET_DRAG_MIME, key]])
  return {
    setData: (type: string, value: string) => store.set(type, value),
    getData: (type: string) => store.get(type) ?? '',
    types: [...store.keys()],
    effectAllowed: 'copy',
  } as unknown as DataTransfer
}

/**
 * Unit-level coverage of `useAssetDrop`'s raycast-hit branch — a real,
 * non-origin camera position, unlike `AppShell.dragdrop.test.tsx`'s own
 * tests (whose cameras all look straight down at the origin, so they
 * can't distinguish "raycast succeeded" from "fell back to the origin").
 * Calling the hook directly (no `<AppShell>`/`<Canvas>` mount) sidesteps
 * that file's real Canvas always reporting a zero-size `domElement`
 * under jsdom (no real layout), which would make `raycastGroundPlane`
 * bail out via its own `rect.width === 0` guard regardless of camera.
 */
describe('useAssetDrop (M2.3/M5.7)', () => {
  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [] })
    useUploadedAssetsStore.setState({ uploads: [], lastUploadError: null, lastUploadErrorReason: null, progress: null })
    useViewportBridgeStore.setState({ camera: null, domElement: null })
  })

  it('places an uploaded card at the real raycast hit point, not the origin fallback', () => {
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

    const camera = new PerspectiveCamera(50, 800 / 600, 0.1, 1000)
    camera.position.set(2, 10, 3)
    camera.lookAt(2, 0, 3)
    camera.updateMatrixWorld()
    const domElement = document.createElement('div')
    domElement.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600 }) as DOMRect
    useViewportBridgeStore.setState({ camera, domElement })
    const expectedHit = raycastGroundPlane(camera, domElement, 400, 300)!

    const { result } = renderHook(() => useAssetDrop())
    result.current.onDrop({
      dataTransfer: makeDataTransfer('u1'),
      clientX: 400,
      clientY: 300,
      preventDefault: () => {},
    } as unknown as DragEvent)

    const state = useSceneStore.getState()
    expect(state.objects).toHaveLength(1)
    expect(state.objects[0].assetRef).toEqual({ kind: 'uploaded', key: 'u1' })
    expect(state.objects[0].transform.position[0]).toBeCloseTo(expectedHit.x)
    expect(state.objects[0].transform.position[2]).toBeCloseTo(expectedHit.z)
    expect(state.selectedIds).toEqual([state.objects[0].id])
  })

  it('with no viewport bridge registered, an uploaded card falls back to origin placement', () => {
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

    const { result } = renderHook(() => useAssetDrop())
    result.current.onDrop({
      dataTransfer: makeDataTransfer('u1'),
      clientX: 9999,
      clientY: 9999,
      preventDefault: () => {},
    } as unknown as DragEvent)

    const state = useSceneStore.getState()
    expect(state.objects).toHaveLength(1)
    expect(state.objects[0].transform.position[0]).toBe(0)
    expect(state.objects[0].transform.position[2]).toBe(0)
  })

  it('a drag payload matching neither a builtin, the assembly, nor an upload does nothing', () => {
    const { result } = renderHook(() => useAssetDrop())
    result.current.onDrop({
      dataTransfer: makeDataTransfer('not-a-real-key'),
      clientX: 400,
      clientY: 300,
      preventDefault: () => {},
    } as unknown as DragEvent)

    expect(useSceneStore.getState().objects).toHaveLength(0)
  })
})
