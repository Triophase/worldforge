import RAPIER from '@dimforge/rapier3d-compat'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadScene as loadPhysicsScene, usePhysicsStore } from '../physics/physicsStore'
import { useContextMenuStore } from '../../state/contextMenuStore'
import { useGizmoDragStore } from '../../state/gizmoDragStore'
import { useGizmoModeStore } from '../../state/gizmoModeStore'
import { useSceneStore } from '../../state/sceneStore'
import { useSimulationStore } from '../../state/simulationStore'
import { useSnappingStore } from '../../state/snappingStore'
import { useUploadedAssetsStore } from '../../state/uploadedAssetsStore'
import { SceneObjects } from './SceneObjects'

function findTransformControls(renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>) {
  return renderer.scene.findAll((node) => node.instance?.constructor?.name === 'TransformControls')[0]
}

function seedUpload(id: string) {
  useUploadedAssetsStore.getState().addUpload({
    id,
    filename: `${id}.glb`,
    format: 'glb',
    fileSize: 100,
    object: new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial()),
    boundingBox: { width: 1, height: 2, depth: 1 },
    meshCount: 1,
    file: new File([], `${id}.glb`),
  })
}

describe('UploadedObjectMesh (M5.7)', () => {
  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [] })
    useUploadedAssetsStore.setState({ uploads: [], lastUploadError: null, lastUploadErrorReason: null, progress: null })
    useGizmoModeStore.setState({ mode: 'translate' })
    useGizmoDragStore.setState({ liveTransform: null })
    useSnappingStore.setState({ moveEnabled: false, moveSnap: 0.1, rotationEnabled: false, rotationSnapDeg: 15 })
    useSimulationStore.setState({ phase: 'idle', snapshot: null })
    // `M6.10`: a missing local record triggers a background `GET /assets/:id`
    // resolve attempt — stubbed to reject so tests never hit a real network call.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    useContextMenuStore.setState({ open: false, x: 0, y: 0 })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders a scene-object-mesh group for an uploaded object at its stored transform', async () => {
    seedUpload('u1')
    useSceneStore.getState().addObject({ kind: 'uploaded', key: 'u1' }, 'Widget', { position: [1, 2, 3] })

    const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)
    const node = renderer.scene.findByProps({ name: 'scene-object-mesh' })
    const position = (node.instance as unknown as { position: { x: number; y: number; z: number } }).position
    expect(position).toMatchObject({ x: 1, y: 2, z: 3 })
    await renderer.unmount()
  })

  it('a missing/unknown upload record renders nothing for that object, without crashing', async () => {
    useSceneStore.getState().addObject({ kind: 'uploaded', key: 'does-not-exist' }, 'Ghost')

    const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)
    expect(renderer.scene.findAll((n) => n.props?.name === 'scene-object-mesh')).toHaveLength(0)
    await renderer.unmount()
  })

  it('M6.10: an object referencing a server asset id with no local record resolves it via GET /assets/:id and renders', async () => {
    const exporter = new GLTFExporter()
    const buffer = (await exporter.parseAsync(
      new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial()),
      { binary: true },
    )) as ArrayBuffer
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(buffer, {
          status: 200,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': 'attachment; filename="server-widget.glb"',
          },
        }),
      ),
    )
    useSceneStore.getState().addObject({ kind: 'uploaded', key: 'server-asset-1' }, 'Widget')

    const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)
    await vi.waitFor(() => {
      expect(useUploadedAssetsStore.getState().uploads.find((u) => u.id === 'server-asset-1')).toBeDefined()
    })
    await renderer.update(<SceneObjects />)

    expect(renderer.scene.findByProps({ name: 'scene-object-mesh' })).toBeDefined()
    expect(useUploadedAssetsStore.getState().uploads.find((u) => u.id === 'server-asset-1')?.serverAssetId).toBe(
      'server-asset-1',
    )
    await renderer.unmount()
  })

  it('two placed instances of the same upload are independent — moving one leaves the other in place', async () => {
    seedUpload('u1')
    const a = useSceneStore.getState().addObject({ kind: 'uploaded', key: 'u1' }, 'Widget', { position: [0, 0, 0] })
    useSceneStore.getState().addObject({ kind: 'uploaded', key: 'u1' }, 'Widget', { position: [5, 0, 0] })

    const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)
    useSceneStore.setState({
      objects: useSceneStore
        .getState()
        .objects.map((o) => (o.id === a.id ? { ...o, transform: { ...o.transform, position: [9, 0, 0] } } : o)),
    })
    await renderer.update(<SceneObjects />)

    const nodes = renderer.scene.findAllByProps({ name: 'scene-object-mesh' })
    const xs = nodes
      .map((n) => (n.instance as unknown as { position: { x: number } }).position.x)
      .sort((x, y) => x - y)
    expect(xs).toEqual([5, 9])
    await renderer.unmount()
  })

  it('clicking an uploaded object selects it and shows a gizmo (sole selection)', async () => {
    seedUpload('u1')
    const obj = useSceneStore.getState().addObject({ kind: 'uploaded', key: 'u1' }, 'Widget')

    const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)
    const node = renderer.scene.findByProps({ name: 'scene-object-mesh' })
    await renderer.fireEvent(node, 'click')

    expect(useSceneStore.getState().selectedIds).toEqual([obj.id])
    await renderer.update(<SceneObjects />)
    expect(findTransformControls(renderer)).toBeDefined()
    await renderer.unmount()
  })

  it('D2: no gizmo for an uploaded object while the simulation is playing', async () => {
    seedUpload('u1')
    const obj = useSceneStore.getState().addObject({ kind: 'uploaded', key: 'u1' }, 'Widget')
    useSceneStore.getState().select(obj.id)

    const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)
    expect(findTransformControls(renderer)).toBeDefined()

    useSimulationStore.setState({ phase: 'playing' })
    await renderer.update(<SceneObjects />)
    expect(findTransformControls(renderer)).toBeUndefined()
    await renderer.unmount()
  })

  it("M3.3: an uploaded object's group position tracks its live Rapier body", async () => {
    seedUpload('u1')
    const obj = useSceneStore.getState().addObject({ kind: 'uploaded', key: 'u1' }, 'Widget', { position: [0, 10, 0] })
    useSceneStore.setState({
      objects: useSceneStore
        .getState()
        .objects.map((o) => ({ ...o, physics: { ...o.physics, bodyType: 'dynamic' as const } })),
    })
    loadPhysicsScene(useSceneStore.getState().objects)

    const world = usePhysicsStore.getState().world!
    for (let i = 0; i < 60; i++) world.step()

    const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)
    await renderer.advanceFrames(1, 1 / 60)

    const node = renderer.scene.findByProps({ name: 'scene-object-mesh' })
    const groupY = (node.instance as unknown as { position: { y: number } }).position.y
    const bodyY = usePhysicsStore.getState().bodies.get(obj.id)!.rigidBody.translation().y
    expect(groupY).toBeCloseTo(bodyY)
    expect(groupY).toBeLessThan(10)
    await renderer.unmount()
  })

  it('M8.1/§21: right-clicking an unselected uploaded object selects it and opens the context menu', async () => {
    seedUpload('u1')
    const obj = useSceneStore.getState().addObject({ kind: 'uploaded', key: 'u1' }, 'Widget')

    const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)
    const node = renderer.scene.findByProps({ name: 'scene-object-mesh' })
    await renderer.fireEvent(node, 'contextMenu', {
      nativeEvent: { preventDefault: () => {}, stopPropagation: () => {}, clientX: 7, clientY: 8 },
    })

    expect(useSceneStore.getState().selectedIds).toEqual([obj.id])
    expect(useContextMenuStore.getState()).toMatchObject({ open: true, x: 7, y: 8 })
    await renderer.unmount()
  })
})
