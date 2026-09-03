import RAPIER from '@dimforge/rapier3d-compat'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadScene as loadPhysicsScene, usePhysicsStore } from '../physics/physicsStore'
import { useContextMenuStore } from '../../state/contextMenuStore'
import { useGizmoDragStore } from '../../state/gizmoDragStore'
import { useGizmoModeStore } from '../../state/gizmoModeStore'
import { recordedUpdateTransform, useHistoryStore } from '../../state/historyStore'
import { useSceneStore } from '../../state/sceneStore'
import { useSimulationStore } from '../../state/simulationStore'
import { useSnappingStore } from '../../state/snappingStore'
import { eulerDegreesToQuaternion, quaternionToEulerDegrees } from '../../utils/eulerQuaternion'
import { SceneObjects } from './SceneObjects'

const CUBE = { kind: 'builtin' as const, key: 'primitive:cube' }
const WHEEL = { kind: 'builtin' as const, key: 'mechanical:wheel' }

function findTransformControls(renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>) {
  // `.find()` throws when nothing matches; `.findAll()[0]` lets "no gizmo
  // mounted" resolve to `undefined` instead.
  return renderer.scene.findAll((node) => node.instance?.constructor?.name === 'TransformControls')[0]
}

describe('SceneObjects', () => {
  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [] })
    useGizmoModeStore.setState({ mode: 'translate' })
    useGizmoDragStore.setState({ liveTransform: null })
    useSnappingStore.setState({ moveEnabled: false, moveSnap: 0.1, rotationEnabled: false, rotationSnapDeg: 15 })
    useHistoryStore.setState({ undoStack: [], redoStack: [] })
    useSimulationStore.setState({ phase: 'idle', snapshot: null })
    useContextMenuStore.setState({ open: false, x: 0, y: 0 })
  })

  it('renders exactly one mesh per store object', async () => {
    useSceneStore.getState().addObject(CUBE, 'Cube')
    useSceneStore.getState().addObject(WHEEL, 'Wheel')

    const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)
    expect(renderer.scene.findAllByType('Mesh')).toHaveLength(2)
    await renderer.unmount()
  })

  it('removing an object from the store removes its mesh, with no orphan left behind', async () => {
    const cube = useSceneStore.getState().addObject(CUBE, 'Cube')
    useSceneStore.getState().addObject(WHEEL, 'Wheel')

    const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)
    expect(renderer.scene.findAllByType('Mesh')).toHaveLength(2)

    useSceneStore.getState().removeObject(cube.id)
    await renderer.update(<SceneObjects />)

    expect(renderer.scene.findAllByType('Mesh')).toHaveLength(1)
    await renderer.unmount()
  })

  it("a mesh's position/scale come directly from the object's transform", async () => {
    useSceneStore.getState().addObject(CUBE, 'Cube', { position: [1, 2, 3], scale: [2, 2, 2] })

    const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)
    const mesh = renderer.scene.findByType('Mesh')
    const instance = mesh.instance as unknown as {
      position: { x: number; y: number; z: number }
      scale: { x: number; y: number; z: number }
    }
    expect(instance.position).toMatchObject({ x: 1, y: 2, z: 3 })
    expect(instance.scale).toMatchObject({ x: 2, y: 2, z: 2 })
    await renderer.unmount()
  })

  it('updating transform.position in the store moves the corresponding mesh', async () => {
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
    const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)

    useSceneStore.setState({
      objects: useSceneStore.getState().objects.map((o) =>
        o.id === obj.id ? { ...o, transform: { ...o.transform, position: [5, 0, 0] } } : o,
      ),
    })
    await renderer.update(<SceneObjects />)

    const mesh = renderer.scene.findByType('Mesh')
    const position = (mesh.instance as unknown as { position: { x: number } }).position
    expect(position.x).toBe(5)
    await renderer.unmount()
  })

  it("ramp's mesh renders with a non-identity quaternion by default (D34's defaultRotation composed in)", async () => {
    useSceneStore.getState().addObject({ kind: 'builtin', key: 'mechanical:ramp' }, 'Ramp')

    const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)
    const mesh = renderer.scene.findByType('Mesh')
    const quaternion = (mesh.instance as unknown as { quaternion: { x: number; y: number; z: number; w: number } })
      .quaternion
    expect(quaternion.w).not.toBeCloseTo(1) // identity would be (0,0,0,1)

    await renderer.unmount()
  })

  describe('selection (M2.5)', () => {
    // The outline wrapper group is always mounted (SelectionOutline.tsx) —
    // visibility/scale are driven imperatively, not by conditional
    // mounting. "Has an outline" means this group is visible.
    function outlineVisible(mesh: { children: { type?: string; instance: unknown }[] }) {
      const group = mesh.children.find((c) => c.type === 'Group')
      return (group?.instance as { visible: boolean } | undefined)?.visible ?? false
    }

    it('clicking a mesh selects exactly that object', async () => {
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)

      const mesh = renderer.scene.findByType('Mesh')
      await renderer.fireEvent(mesh, 'click')

      expect(useSceneStore.getState().selectedIds).toEqual([obj.id])
      await renderer.unmount()
    })

    it('a selected mesh shows a visible outline; an unselected one does not', async () => {
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)

      let mesh = renderer.scene.findByProps({ name: 'scene-object-mesh' })
      expect(outlineVisible(mesh)).toBe(false)

      useSceneStore.getState().select(obj.id)
      await renderer.update(<SceneObjects />)
      await renderer.advanceFrames(1, 1 / 60)

      mesh = renderer.scene.findByProps({ name: 'scene-object-mesh' })
      expect(outlineVisible(mesh)).toBe(true)
      await renderer.unmount()
    })

    it("selecting an object doesn't change its own material — the outline is a separate rendering layer", async () => {
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)

      const meshBefore = renderer.scene.findByProps({ name: 'scene-object-mesh' })
      const materialBefore = (meshBefore.instance as unknown as { material: unknown }).material

      useSceneStore.getState().select(obj.id)
      await renderer.update(<SceneObjects />)
      await renderer.advanceFrames(1, 1 / 60)

      const meshAfter = renderer.scene.findByProps({ name: 'scene-object-mesh' })
      const materialAfter = (meshAfter.instance as unknown as { material: unknown }).material
      expect(materialAfter).toBe(materialBefore)
      await renderer.unmount()
    })

    it('no mesh shows an outline when selectedIds is empty', async () => {
      useSceneStore.getState().addObject(CUBE, 'Cube')
      useSceneStore.getState().addObject(WHEEL, 'Wheel')

      const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)
      for (const mesh of renderer.scene.findAllByType('Mesh')) {
        expect(outlineVisible(mesh)).toBe(false)
      }
      await renderer.unmount()
    })

    it('every selected mesh shows an outline in a multi-selection (M2.7)', async () => {
      const a = useSceneStore.getState().addObject(CUBE, 'Cube')
      const b = useSceneStore.getState().addObject(WHEEL, 'Wheel')
      useSceneStore.setState({ selectedIds: [a.id, b.id] })

      const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)
      await renderer.advanceFrames(1, 1 / 60)
      for (const mesh of renderer.scene.findAllByProps({ name: 'scene-object-mesh' })) {
        expect(outlineVisible(mesh)).toBe(true)
      }
      await renderer.unmount()
    })
  })

  describe('transform gizmo (M2.6)', () => {
    it('no gizmo when nothing is selected', async () => {
      useSceneStore.getState().addObject(CUBE, 'Cube')
      const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)
      expect(findTransformControls(renderer)).toBeUndefined()
      await renderer.unmount()
    })

    it('a gizmo appears once exactly one object is selected', async () => {
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)
      expect(findTransformControls(renderer)).toBeUndefined()

      useSceneStore.getState().select(obj.id)
      await renderer.update(<SceneObjects />)

      expect(findTransformControls(renderer)).toBeDefined()
      await renderer.unmount()
    })

    it('no gizmo when more than one id is selected (defensive)', async () => {
      const a = useSceneStore.getState().addObject(CUBE, 'Cube')
      const b = useSceneStore.getState().addObject(WHEEL, 'Wheel')
      const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)

      useSceneStore.setState({ selectedIds: [a.id, b.id] })
      await renderer.update(<SceneObjects />)

      expect(findTransformControls(renderer)).toBeUndefined()
      await renderer.unmount()
    })

    it("gizmo mode 'select' (Q) hides the gizmo even while selected", async () => {
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)

      useSceneStore.getState().select(obj.id)
      await renderer.update(<SceneObjects />)
      expect(findTransformControls(renderer)).toBeDefined()

      useGizmoModeStore.getState().setMode('select')
      await renderer.update(<SceneObjects />)
      expect(findTransformControls(renderer)).toBeUndefined()
      await renderer.unmount()
    })

    it('D2/M3.4: no gizmo while the simulation is playing or paused, even while sole-selected', async () => {
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      useSceneStore.getState().select(obj.id)
      const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)
      expect(findTransformControls(renderer)).toBeDefined()

      useSimulationStore.setState({ phase: 'playing' })
      await renderer.update(<SceneObjects />)
      expect(findTransformControls(renderer)).toBeUndefined()

      useSimulationStore.setState({ phase: 'paused' })
      await renderer.update(<SceneObjects />)
      expect(findTransformControls(renderer)).toBeUndefined()

      useSimulationStore.setState({ phase: 'idle' })
      await renderer.update(<SceneObjects />)
      expect(findTransformControls(renderer)).toBeDefined()
      await renderer.unmount()
    })

    it('dragging the gizmo commits exactly one position update, at drag-end', async () => {
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)

      useSceneStore.getState().select(obj.id)
      await renderer.update(<SceneObjects />)

      const controlsNode = findTransformControls(renderer)!
      const controls = controlsNode.instance as unknown as {
        dispatchEvent: (e: { type: string }) => void
      }
      const mesh = renderer.scene.findByProps({ name: 'scene-object-mesh' })
      const position = (mesh.instance as unknown as { position: { set: (x: number, y: number, z: number) => void } })
        .position

      // Two intermediate drag frames — neither should reach the store yet.
      position.set(1, 0, 0)
      controls.dispatchEvent({ type: 'objectChange' })
      position.set(2, 0, 0)
      controls.dispatchEvent({ type: 'objectChange' })

      expect(useSceneStore.getState().objects.find((o) => o.id === obj.id)!.transform.position).toEqual([0, 0, 0])
      expect(useGizmoDragStore.getState().liveTransform?.position).toEqual([2, 0, 0])

      // Drag-end: exactly one commit, with the final position.
      position.set(3, 0, 0)
      controls.dispatchEvent({ type: 'mouseUp' })

      expect(useSceneStore.getState().objects.find((o) => o.id === obj.id)!.transform.position).toEqual([3, 0, 0])
      expect(useGizmoDragStore.getState().liveTransform).toBeNull()

      await renderer.unmount()
    })
  })

  describe('multi-select (M2.7)', () => {
    it('shift+clicking a second mesh adds it without removing the first', async () => {
      const a = useSceneStore.getState().addObject(CUBE, 'Cube')
      const b = useSceneStore.getState().addObject(WHEEL, 'Wheel')
      useSceneStore.getState().select(a.id)

      const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)
      // `addObject` order matches scene render order — `meshes[1]` is `b`.
      const meshes = renderer.scene.findAllByProps({ name: 'scene-object-mesh' })
      await renderer.fireEvent(meshes[1], 'click', { shiftKey: true })

      expect(useSceneStore.getState().selectedIds.sort()).toEqual([a.id, b.id].sort())
      await renderer.unmount()
    })

    it('ctrl/cmd+clicking an already-selected mesh removes just that one', async () => {
      const a = useSceneStore.getState().addObject(CUBE, 'Cube')
      const b = useSceneStore.getState().addObject(WHEEL, 'Wheel')
      useSceneStore.setState({ selectedIds: [a.id, b.id] })

      const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)
      const meshes = renderer.scene.findAllByProps({ name: 'scene-object-mesh' })
      await renderer.fireEvent(meshes[0], 'click', { ctrlKey: true })

      expect(useSceneStore.getState().selectedIds).toEqual([b.id])
      await renderer.unmount()
    })

    it('ctrl/cmd+clicking the sole selected mesh empties the selection', async () => {
      const a = useSceneStore.getState().addObject(CUBE, 'Cube')
      useSceneStore.getState().select(a.id)

      const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)
      const mesh = renderer.scene.findByProps({ name: 'scene-object-mesh' })
      await renderer.fireEvent(mesh, 'click', { metaKey: true })

      expect(useSceneStore.getState().selectedIds).toEqual([])
      await renderer.unmount()
    })

    it('a plain click after a multi-selection replaces it with just the clicked object', async () => {
      const a = useSceneStore.getState().addObject(CUBE, 'Cube')
      const b = useSceneStore.getState().addObject(WHEEL, 'Wheel')
      useSceneStore.setState({ selectedIds: [a.id, b.id] })

      const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)
      const meshes = renderer.scene.findAllByProps({ name: 'scene-object-mesh' })
      await renderer.fireEvent(meshes[0], 'click')

      expect(useSceneStore.getState().selectedIds).toEqual([a.id])
      await renderer.unmount()
    })
  })

  describe('snapping (M2.8)', () => {
    it('a translate drag snaps the committed position to the move-snap increment when enabled', async () => {
      useSnappingStore.setState({ moveEnabled: true, moveSnap: 0.1 })
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      useSceneStore.getState().select(obj.id)
      const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)

      const controls = findTransformControls(renderer)!.instance as unknown as {
        dispatchEvent: (e: { type: string }) => void
      }
      const mesh = renderer.scene.findByProps({ name: 'scene-object-mesh' })
      const position = (
        mesh.instance as unknown as { position: { set: (x: number, y: number, z: number) => void } }
      ).position
      position.set(1.27, 0, 0)
      controls.dispatchEvent({ type: 'mouseUp' })

      const committed = useSceneStore.getState().objects.find((o) => o.id === obj.id)!.transform.position
      expect(committed[0]).toBeCloseTo(1.3)
      await renderer.unmount()
    })

    it('a translate drag is committed raw (unrounded) when move-snap is disabled', async () => {
      useSnappingStore.setState({ moveEnabled: false })
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      useSceneStore.getState().select(obj.id)
      const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)

      const controls = findTransformControls(renderer)!.instance as unknown as {
        dispatchEvent: (e: { type: string }) => void
      }
      const mesh = renderer.scene.findByProps({ name: 'scene-object-mesh' })
      const position = (
        mesh.instance as unknown as { position: { set: (x: number, y: number, z: number) => void } }
      ).position
      position.set(1.27, 0, 0)
      controls.dispatchEvent({ type: 'mouseUp' })

      const committed = useSceneStore.getState().objects.find((o) => o.id === obj.id)!.transform.position
      expect(committed[0]).toBeCloseTo(1.27)
      await renderer.unmount()
    })

    it('a rotate drag snaps the committed rotation to the rotation-snap increment (in degrees) when enabled', async () => {
      useSnappingStore.setState({ rotationEnabled: true, rotationSnapDeg: 15 })
      useGizmoModeStore.setState({ mode: 'rotate' })
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      useSceneStore.getState().select(obj.id)
      const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)

      const controls = findTransformControls(renderer)!.instance as unknown as {
        dispatchEvent: (e: { type: string }) => void
      }
      const mesh = renderer.scene.findByProps({ name: 'scene-object-mesh' })
      const quaternion = (
        mesh.instance as unknown as { quaternion: { set: (x: number, y: number, z: number, w: number) => void } }
      ).quaternion
      const raw = eulerDegreesToQuaternion([0, 37, 0])
      quaternion.set(raw[0], raw[1], raw[2], raw[3])
      controls.dispatchEvent({ type: 'mouseUp' })

      const committedRotation = useSceneStore.getState().objects.find((o) => o.id === obj.id)!.transform.rotation
      const degrees = quaternionToEulerDegrees(committedRotation)
      expect(degrees[1]).toBeCloseTo(30)
      await renderer.unmount()
    })

    it('scale is never snapped, even with move/rotation snap enabled', async () => {
      useSnappingStore.setState({ moveEnabled: true, rotationEnabled: true })
      useGizmoModeStore.setState({ mode: 'scale' })
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      useSceneStore.getState().select(obj.id)
      const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)

      const controls = findTransformControls(renderer)!.instance as unknown as {
        dispatchEvent: (e: { type: string }) => void
      }
      const mesh = renderer.scene.findByProps({ name: 'scene-object-mesh' })
      const scale = (mesh.instance as unknown as { scale: { set: (x: number, y: number, z: number) => void } }).scale
      scale.set(1.23, 1, 1)
      controls.dispatchEvent({ type: 'mouseUp' })

      const committed = useSceneStore.getState().objects.find((o) => o.id === obj.id)!.transform.scale
      expect(committed[0]).toBeCloseTo(1.23)
      await renderer.unmount()
    })
  })

  describe('undo/redo (M2.9)', () => {
    it('a gizmo drag with many intermediate frames still commits exactly one undo entry, and undo restores the exact prior transform', async () => {
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      useSceneStore.getState().select(obj.id)
      const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)

      const controls = findTransformControls(renderer)!.instance as unknown as {
        dispatchEvent: (e: { type: string }) => void
      }
      const mesh = renderer.scene.findByProps({ name: 'scene-object-mesh' })
      const position = (
        mesh.instance as unknown as { position: { set: (x: number, y: number, z: number) => void } }
      ).position

      for (const x of [1, 2, 3, 4]) {
        position.set(x, 0, 0)
        controls.dispatchEvent({ type: 'objectChange' })
      }
      position.set(5, 0, 0)
      controls.dispatchEvent({ type: 'mouseUp' })

      expect(useHistoryStore.getState().undoStack).toHaveLength(1)
      expect(useSceneStore.getState().objects[0].transform.position).toEqual([5, 0, 0])

      useHistoryStore.getState().undo()
      expect(useSceneStore.getState().objects[0].transform.position).toEqual([0, 0, 0])

      useHistoryStore.getState().redo()
      expect(useSceneStore.getState().objects[0].transform.position).toEqual([5, 0, 0])

      await renderer.unmount()
    })
  })

  describe('render/physics sync (M3.3)', () => {
    it("a dynamic body's mesh Y position matches the Rapier body's translation.y after 60 manual steps", async () => {
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube', { position: [0, 10, 0] })
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

      const mesh = renderer.scene.findByProps({ name: 'scene-object-mesh' })
      const meshY = (mesh.instance as unknown as { position: { y: number } }).position.y
      const bodyY = usePhysicsStore.getState().bodies.get(obj.id)!.rigidBody.translation().y
      expect(meshY).toBeCloseTo(bodyY)
      expect(meshY).toBeLessThan(10) // it actually fell
      await renderer.unmount()
    })

    it("the mesh's quaternion equals the body's rotation exactly — no Euler round-trip, no interpolation", async () => {
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      loadPhysicsScene(useSceneStore.getState().objects)
      const body = usePhysicsStore.getState().bodies.get(obj.id)!.rigidBody
      body.setRotation({ x: 0, y: 0.3826834, z: 0, w: 0.9238795 }, true) // 45deg about Y

      const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)
      await renderer.advanceFrames(1, 1 / 60)

      const mesh = renderer.scene.findByProps({ name: 'scene-object-mesh' })
      const q = (mesh.instance as unknown as { quaternion: { x: number; y: number; z: number; w: number } })
        .quaternion
      expect(q.y).toBeCloseTo(0.3826834)
      expect(q.w).toBeCloseTo(0.9238795)
      await renderer.unmount()
    })

    it("a static body's mesh transform never changes frame-over-frame, even after many world steps (D29 default)", async () => {
      useSceneStore.getState().addObject(CUBE, 'Cube', { position: [1, 2, 3] })
      loadPhysicsScene(useSceneStore.getState().objects)

      const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)
      const world = usePhysicsStore.getState().world!
      for (let i = 0; i < 30; i++) world.step()
      await renderer.advanceFrames(5, 1 / 60)

      const mesh = renderer.scene.findByProps({ name: 'scene-object-mesh' })
      const pos = (mesh.instance as unknown as { position: { x: number; y: number; z: number } }).position
      expect(pos).toMatchObject({ x: 1, y: 2, z: 3 })
      await renderer.unmount()
    })

    it('an idle Properties-panel-style Position commit immediately moves the mesh and writes through to the live Rapier body', async () => {
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      loadPhysicsScene(useSceneStore.getState().objects)

      const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)
      recordedUpdateTransform(obj.id, { position: [9, 0, 0] })
      await renderer.advanceFrames(1, 1 / 60)

      const mesh = renderer.scene.findByProps({ name: 'scene-object-mesh' })
      const pos = (mesh.instance as unknown as { position: { x: number } }).position
      expect(pos.x).toBeCloseTo(9)
      expect(usePhysicsStore.getState().bodies.get(obj.id)!.rigidBody.translation().x).toBeCloseTo(9)
      await renderer.unmount()
    })

    it('syncs 20 objects simultaneously with no errors', async () => {
      for (let i = 0; i < 20; i++) {
        useSceneStore.getState().addObject(CUBE, `Cube ${i}`, { position: [i, 0, 0] })
      }
      loadPhysicsScene(useSceneStore.getState().objects)

      const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)
      await renderer.advanceFrames(3, 1 / 60)

      expect(renderer.scene.findAllByProps({ name: 'scene-object-mesh' })).toHaveLength(20)
      await renderer.unmount()
    })
  })

  describe('context menu (M8.1, §21)', () => {
    function nativeEvent(x: number, y: number) {
      return { preventDefault: () => {}, stopPropagation: () => {}, clientX: x, clientY: y }
    }

    it('right-clicking an unselected object selects it (replace) and opens the menu at the click coordinates', async () => {
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)
      const mesh = renderer.scene.findByProps({ name: 'scene-object-mesh' })

      await renderer.fireEvent(mesh, 'contextMenu', { nativeEvent: nativeEvent(50, 60) })

      expect(useSceneStore.getState().selectedIds).toEqual([obj.id])
      expect(useContextMenuStore.getState()).toMatchObject({ open: true, x: 50, y: 60 })
      await renderer.unmount()
    })

    it('right-clicking an already-multi-selected member keeps the multi-selection intact', async () => {
      const a = useSceneStore.getState().addObject(CUBE, 'A')
      const b = useSceneStore.getState().addObject(CUBE, 'B')
      useSceneStore.getState().setSelection([a.id, b.id])
      const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)
      const mesh = renderer.scene.findAllByProps({ name: 'scene-object-mesh' })[0]!

      await renderer.fireEvent(mesh, 'contextMenu', { nativeEvent: nativeEvent(1, 1) })

      expect(useSceneStore.getState().selectedIds.sort()).toEqual([a.id, b.id].sort())
      expect(useContextMenuStore.getState().open).toBe(true)
      await renderer.unmount()
    })

    it('D2: right-clicking a selected object while playing opens no menu', async () => {
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      useSceneStore.getState().select(obj.id)
      useSimulationStore.setState({ phase: 'playing' })
      const renderer = await ReactThreeTestRenderer.create(<SceneObjects />)
      const mesh = renderer.scene.findByProps({ name: 'scene-object-mesh' })

      await renderer.fireEvent(mesh, 'contextMenu', { nativeEvent: nativeEvent(1, 1) })

      expect(useContextMenuStore.getState().open).toBe(false)
      await renderer.unmount()
    })
  })
})
