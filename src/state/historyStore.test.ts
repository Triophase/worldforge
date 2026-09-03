import RAPIER from '@dimforge/rapier3d-compat'
import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  recordedAddObject,
  recordedCreateJoint,
  recordedDuplicateObjects,
  recordedInsertRobotArmAssembly,
  recordedPlaceUploadedAsset,
  recordedRemoveObjects,
  recordedRenameObject,
  recordedUpdatePhysics,
  recordedUpdateTransform,
  useHistoryStore,
} from './historyStore'
import { usePhysicsStore, loadScene as loadPhysicsScene } from '../engine/physics/physicsStore'
import { useSceneStore } from './sceneStore'
import { useSimulationStore } from './simulationStore'
import { useUploadedAssetsStore } from './uploadedAssetsStore'

function seedUpload(overrides: Partial<{ id: string; filename: string }> = {}) {
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
  const record = {
    id: overrides.id ?? 'upload-1',
    filename: overrides.filename ?? 'Widget.glb',
    format: 'glb' as const,
    fileSize: 1024,
    object: mesh,
    boundingBox: { width: 1, height: 1, depth: 1 },
    meshCount: 1,
    unitScale: 1,
    file: new File([], overrides.filename ?? 'Widget.glb'),
    serverAssetId: null,
  }
  useUploadedAssetsStore.setState((s) => ({ uploads: [...s.uploads, record] }))
  return record
}

const CUBE = { kind: 'builtin' as const, key: 'primitive:cube' }
const WHEEL = { kind: 'builtin' as const, key: 'mechanical:wheel' }

function state() {
  return useSceneStore.getState()
}

describe('historyStore (M2.9, D25)', () => {
  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [] })
    useHistoryStore.setState({ undoStack: [], redoStack: [] })
    useSimulationStore.setState({ phase: 'idle', snapshot: null })
    useUploadedAssetsStore.setState({ uploads: [], lastUploadError: null, lastUploadErrorReason: null })
  })

  it('undo after an add removes exactly that object; redo re-adds it with the same id and fields', () => {
    const obj = recordedAddObject(CUBE, 'Cube')!
    expect(state().objects).toHaveLength(1)

    useHistoryStore.getState().undo()
    expect(state().objects).toHaveLength(0)

    useHistoryStore.getState().redo()
    expect(state().objects).toHaveLength(1)
    expect(state().objects[0]).toEqual(obj)
  })

  it('undo after a delete restores the object at its original position; redo removes it again', () => {
    const a = recordedAddObject(CUBE, 'A')!
    const b = recordedAddObject(CUBE, 'B')!
    const c = recordedAddObject(CUBE, 'C')!
    useHistoryStore.setState({ undoStack: [], redoStack: [] }) // isolate the delete's own entry

    recordedRemoveObjects([b.id])
    expect(state().objects.map((o) => o.id)).toEqual([a.id, c.id])

    useHistoryStore.getState().undo()
    expect(state().objects.map((o) => o.id)).toEqual([a.id, b.id, c.id])
    expect(state().objects[1]).toEqual(b)

    useHistoryStore.getState().redo()
    expect(state().objects.map((o) => o.id)).toEqual([a.id, c.id])
  })

  it('undo after a duplicate removes the duplicate and leaves the original untouched; redo reintroduces it', () => {
    const original = recordedAddObject(CUBE, 'Cube')!
    useHistoryStore.setState({ undoStack: [], redoStack: [] })

    const [duplicate] = recordedDuplicateObjects([original.id])
    expect(state().objects).toHaveLength(2)

    useHistoryStore.getState().undo()
    expect(state().objects).toHaveLength(1)
    expect(state().objects[0]).toEqual(original)

    useHistoryStore.getState().redo()
    expect(state().objects).toHaveLength(2)
    expect(state().objects.find((o) => o.id === duplicate.id)).toEqual(duplicate)
  })

  it('duplicating a three-object selection is a single history entry: one undo reverses all three at once', () => {
    const a = recordedAddObject(CUBE, 'A')!
    const b = recordedAddObject(CUBE, 'B')!
    const c = recordedAddObject(WHEEL, 'C')!
    useHistoryStore.setState({ undoStack: [], redoStack: [] })

    const duplicates = recordedDuplicateObjects([a.id, b.id, c.id])
    expect(duplicates).toHaveLength(3)
    expect(state().objects).toHaveLength(6)
    expect(useHistoryStore.getState().undoStack).toHaveLength(1)

    useHistoryStore.getState().undo()
    expect(state().objects).toHaveLength(3)
    expect(state().objects.map((o) => o.id).sort()).toEqual([a.id, b.id, c.id].sort())
  })

  it('deleting a three-object selection is a single history entry: one undo restores all three at once', () => {
    const a = recordedAddObject(CUBE, 'A')!
    const b = recordedAddObject(CUBE, 'B')!
    const c = recordedAddObject(WHEEL, 'C')!
    useHistoryStore.setState({ undoStack: [], redoStack: [] })

    recordedRemoveObjects([a.id, b.id, c.id])
    expect(state().objects).toHaveLength(0)
    expect(useHistoryStore.getState().undoStack).toHaveLength(1)

    useHistoryStore.getState().undo()
    expect(state().objects).toHaveLength(3)
    expect(state().objects.map((o) => o.id)).toEqual([a.id, b.id, c.id])
  })

  it('undo after a rename restores the previous name exactly; redo reapplies the new name', () => {
    const obj = recordedAddObject(CUBE, 'Cube')!
    useHistoryStore.setState({ undoStack: [], redoStack: [] })

    recordedRenameObject(obj.id, 'Left Wheel')
    expect(state().objects[0].name).toBe('Left Wheel')

    useHistoryStore.getState().undo()
    expect(state().objects[0].name).toBe('Cube')

    useHistoryStore.getState().redo()
    expect(state().objects[0].name).toBe('Left Wheel')
  })

  it('undo after a transform edit restores the exact prior transform; redo reapplies the new one', () => {
    const obj = recordedAddObject(CUBE, 'Cube')!
    useHistoryStore.setState({ undoStack: [], redoStack: [] })

    recordedUpdateTransform(obj.id, { position: [5, 0, 0] })
    expect(state().objects[0].transform.position).toEqual([5, 0, 0])

    useHistoryStore.getState().undo()
    expect(state().objects[0].transform.position).toEqual([0, 0, 0])

    useHistoryStore.getState().redo()
    expect(state().objects[0].transform.position).toEqual([5, 0, 0])
  })

  it('undo after a physics edit restores the exact prior physics values; redo reapplies the new ones (D39)', () => {
    const obj = recordedAddObject(CUBE, 'Cube')!
    useHistoryStore.setState({ undoStack: [], redoStack: [] })

    recordedUpdatePhysics(obj.id, { bodyType: 'dynamic', mass: 5 })
    expect(state().objects[0].physics).toMatchObject({ bodyType: 'dynamic', mass: 5 })

    useHistoryStore.getState().undo()
    expect(state().objects[0].physics).toMatchObject({ bodyType: 'static', mass: 1 })

    useHistoryStore.getState().redo()
    expect(state().objects[0].physics).toMatchObject({ bodyType: 'dynamic', mass: 5 })
  })

  it('a transform commit is written straight into the live Rapier body (M3.3, §13 single ground truth)', () => {
    const obj = recordedAddObject(CUBE, 'Cube')!
    loadPhysicsScene(state().objects)
    useHistoryStore.setState({ undoStack: [], redoStack: [] })

    recordedUpdateTransform(obj.id, { position: [7, 0, 0] })
    let translation = usePhysicsStore.getState().bodies.get(obj.id)!.rigidBody.translation()
    expect(translation).toEqual({ x: 7, y: 0, z: 0 })

    useHistoryStore.getState().undo()
    translation = usePhysicsStore.getState().bodies.get(obj.id)!.rigidBody.translation()
    expect(translation).toEqual({ x: 0, y: 0, z: 0 })

    useHistoryStore.getState().redo()
    translation = usePhysicsStore.getState().bodies.get(obj.id)!.rigidBody.translation()
    expect(translation).toEqual({ x: 7, y: 0, z: 0 })
  })

  it('a transform edit is a single history entry regardless of how it was produced (many intermediate frames still commit once)', () => {
    const obj = recordedAddObject(CUBE, 'Cube')!
    useHistoryStore.setState({ undoStack: [], redoStack: [] })

    // Simulates a drag's single commit-at-drag-end call (M2.6), not one
    // call per intermediate frame.
    recordedUpdateTransform(obj.id, { position: [1, 0, 0] })
    expect(useHistoryStore.getState().undoStack).toHaveLength(1)
  })

  it('a new action after an undo discards the redo stack', () => {
    recordedAddObject(CUBE, 'A')!
    useHistoryStore.getState().undo()
    expect(useHistoryStore.getState().redoStack).toHaveLength(1)

    recordedAddObject(CUBE, 'B')!
    expect(useHistoryStore.getState().redoStack).toHaveLength(0)

    useHistoryStore.getState().redo()
    expect(state().objects.map((o) => o.name)).toEqual(['B']) // the old redo branch is gone
  })

  it('select/clearSelection never push a history entry — undo after only a selection change is a no-op', () => {
    const obj = recordedAddObject(CUBE, 'Cube')!
    useHistoryStore.setState({ undoStack: [], redoStack: [] })

    useSceneStore.getState().select(obj.id)
    useSceneStore.getState().clearSelection()
    expect(useHistoryStore.getState().undoStack).toHaveLength(0)

    useHistoryStore.getState().undo()
    expect(state().objects).toHaveLength(1) // nothing about the scene changed
  })

  it('undo/redo on an empty stack is a no-op', () => {
    useHistoryStore.getState().undo()
    useHistoryStore.getState().redo()
    expect(state().objects).toEqual([])
  })

  it('clearHistory empties both stacks', () => {
    recordedAddObject(CUBE, 'A')!
    useHistoryStore.getState().undo()
    expect(useHistoryStore.getState().redoStack.length).toBeGreaterThan(0)

    useHistoryStore.getState().clearHistory()
    expect(useHistoryStore.getState().undoStack).toEqual([])
    expect(useHistoryStore.getState().redoStack).toEqual([])
  })

  describe('D2 edit lock (M3.4) — every recorded* action refuses while the simulation is not idle', () => {
    for (const phase of ['playing', 'paused'] as const) {
      it(`recordedAddObject is refused while ${phase}`, () => {
        useSimulationStore.setState({ phase })
        const result = recordedAddObject(CUBE, 'Cube')
        expect(result).toBeUndefined()
        expect(state().objects).toEqual([])
        expect(useHistoryStore.getState().undoStack).toEqual([])
      })

      it(`recordedDuplicateObjects is refused while ${phase}`, () => {
        const obj = recordedAddObject(CUBE, 'Cube')!
        useHistoryStore.setState({ undoStack: [], redoStack: [] })
        useSimulationStore.setState({ phase })

        const result = recordedDuplicateObjects([obj.id])

        expect(result).toEqual([])
        expect(state().objects).toHaveLength(1)
        expect(useHistoryStore.getState().undoStack).toEqual([])
      })

      it(`recordedRemoveObjects is refused while ${phase}`, () => {
        const obj = recordedAddObject(CUBE, 'Cube')!
        useHistoryStore.setState({ undoStack: [], redoStack: [] })
        useSimulationStore.setState({ phase })

        recordedRemoveObjects([obj.id])

        expect(state().objects).toHaveLength(1)
        expect(useHistoryStore.getState().undoStack).toEqual([])
      })

      it(`recordedRenameObject is refused while ${phase}`, () => {
        const obj = recordedAddObject(CUBE, 'Cube')!
        useHistoryStore.setState({ undoStack: [], redoStack: [] })
        useSimulationStore.setState({ phase })

        recordedRenameObject(obj.id, 'Renamed')

        expect(state().objects[0].name).toBe('Cube')
      })

      it(`recordedUpdateTransform (gizmo drag / Properties commit) is refused while ${phase}`, () => {
        const obj = recordedAddObject(CUBE, 'Cube')!
        useHistoryStore.setState({ undoStack: [], redoStack: [] })
        useSimulationStore.setState({ phase })

        recordedUpdateTransform(obj.id, { position: [9, 9, 9] })

        expect(state().objects[0].transform.position).toEqual([0, 0, 0])
      })

      it(`recordedUpdatePhysics is refused while ${phase}`, () => {
        const obj = recordedAddObject(CUBE, 'Cube')!
        useHistoryStore.setState({ undoStack: [], redoStack: [] })
        useSimulationStore.setState({ phase })

        recordedUpdatePhysics(obj.id, { mass: 99 })

        expect(state().objects[0].physics.mass).toBe(1)
      })

      it(`undo() and redo() are no-ops while ${phase}`, () => {
        recordedAddObject(CUBE, 'Cube')!
        const stackBefore = useHistoryStore.getState().undoStack
        useSimulationStore.setState({ phase })

        useHistoryStore.getState().undo()
        expect(state().objects).toHaveLength(1)
        expect(useHistoryStore.getState().undoStack).toBe(stackBefore)

        useSimulationStore.setState({ phase: 'idle' })
        useHistoryStore.getState().undo()
        useSimulationStore.setState({ phase })
        const redoStackBefore = useHistoryStore.getState().redoStack
        useHistoryStore.getState().redo()
        expect(state().objects).toEqual([])
        expect(useHistoryStore.getState().redoStack).toBe(redoStackBefore)
      })
    }

    it('editing works again once Reset returns the simulation to idle', () => {
      const obj = recordedAddObject(CUBE, 'Cube')!
      useHistoryStore.setState({ undoStack: [], redoStack: [] })
      useSimulationStore.setState({ phase: 'playing' })

      recordedUpdateTransform(obj.id, { position: [5, 0, 0] })
      expect(state().objects[0].transform.position).toEqual([0, 0, 0]) // still refused

      useSimulationStore.setState({ phase: 'idle' })
      recordedUpdateTransform(obj.id, { position: [5, 0, 0] })
      expect(state().objects[0].transform.position).toEqual([5, 0, 0]) // works again
    })
  })

  describe('recordedCreateJoint (M4.2, D25)', () => {
    it('creates one joint as a single undoable step', () => {
      const a = recordedAddObject(CUBE, 'A')!
      const b = recordedAddObject(CUBE, 'B')!

      const joint = recordedCreateJoint(a.id, b.id, 'fixed')

      expect(joint).toBeDefined()
      expect(state().joints).toHaveLength(1)

      useHistoryStore.getState().undo()
      expect(state().joints).toEqual([])

      useHistoryStore.getState().redo()
      expect(state().joints).toHaveLength(1)
      expect(state().joints[0].id).toBe(joint!.id)
    })

    it('rejects and pushes no history entry when sceneStore.createJoint itself refuses (self-join)', () => {
      const a = recordedAddObject(CUBE, 'A')!
      const stackBefore = useHistoryStore.getState().undoStack

      const result = recordedCreateJoint(a.id, a.id, 'fixed')

      expect(result).toBeUndefined()
      expect(useHistoryStore.getState().undoStack).toBe(stackBefore)
    })

    it('is refused while the simulation is not idle (D2)', () => {
      const a = recordedAddObject(CUBE, 'A')!
      const b = recordedAddObject(CUBE, 'B')!
      useSimulationStore.setState({ phase: 'playing' })

      const result = recordedCreateJoint(a.id, b.id, 'fixed')

      expect(result).toBeUndefined()
      expect(state().joints).toEqual([])
      useSimulationStore.setState({ phase: 'idle' })
    })
  })

  describe('joint cascade rules on delete/duplicate (D5, M4.5)', () => {
    it('deleting a joint endpoint deletes the joint with it, as one undo step', () => {
      const a = recordedAddObject(CUBE, 'A')!
      const b = recordedAddObject(CUBE, 'B')!
      const joint = recordedCreateJoint(a.id, b.id, 'revolute', { motor: { enabled: true, speed: 4 } })!
      useHistoryStore.setState({ undoStack: [], redoStack: [] })

      recordedRemoveObjects([a.id])

      expect(state().objects.map((o) => o.id)).toEqual([b.id])
      expect(state().joints).toEqual([])
      expect(useHistoryStore.getState().undoStack).toHaveLength(1) // one step, not two

      useHistoryStore.getState().undo()

      expect(state().objects.map((o) => o.id).sort()).toEqual([a.id, b.id].sort())
      expect(state().joints).toHaveLength(1)
      expect(state().joints[0]).toEqual(joint) // original type/axis/limits/motor intact
    })

    it('deleting a multi-selection containing both endpoints removes both objects and the joint, still one step', () => {
      const a = recordedAddObject(CUBE, 'A')!
      const b = recordedAddObject(CUBE, 'B')!
      recordedCreateJoint(a.id, b.id, 'fixed')
      useHistoryStore.setState({ undoStack: [], redoStack: [] })

      recordedRemoveObjects([a.id, b.id])

      expect(state().objects).toEqual([])
      expect(state().joints).toEqual([])
      expect(useHistoryStore.getState().undoStack).toHaveLength(1)

      useHistoryStore.getState().undo()
      expect(state().objects).toHaveLength(2)
      expect(state().joints).toHaveLength(1)
    })

    it('deleting an object that is the endpoint of two joints removes both, in the same single step', () => {
      const a = recordedAddObject(CUBE, 'A')!
      const b = recordedAddObject(CUBE, 'B')!
      const c = recordedAddObject(CUBE, 'C')!
      recordedCreateJoint(a.id, b.id, 'fixed')
      recordedCreateJoint(a.id, c.id, 'revolute')
      useHistoryStore.setState({ undoStack: [], redoStack: [] })

      recordedRemoveObjects([a.id])

      expect(state().joints).toEqual([])
      expect(state().objects.map((o) => o.id).sort()).toEqual([b.id, c.id].sort())
      expect(useHistoryStore.getState().undoStack).toHaveLength(1)

      useHistoryStore.getState().undo()
      expect(state().joints).toHaveLength(2)
    })

    it('duplicating a lone joint endpoint produces a free-standing copy; the original joint is untouched', () => {
      const a = recordedAddObject(CUBE, 'A')!
      const b = recordedAddObject(CUBE, 'B')!
      const joint = recordedCreateJoint(a.id, b.id, 'fixed')!
      useHistoryStore.setState({ undoStack: [], redoStack: [] })

      const [duplicate] = recordedDuplicateObjects([b.id])

      expect(state().joints).toEqual([joint]) // unchanged
      expect(state().joints[0].objectA).toBe(a.id)
      expect(state().joints[0].objectB).toBe(b.id)
      expect(state().joints.some((j) => j.objectA === duplicate.id || j.objectB === duplicate.id)).toBe(false)
    })

    it('duplicating both endpoints creates a new joint connecting only the two new copies, one undo step', () => {
      const a = recordedAddObject(CUBE, 'A', { position: [0, 0, 0] })!
      const b = recordedAddObject(CUBE, 'B', { position: [4, 0, 0] })!
      const original = recordedCreateJoint(a.id, b.id, 'revolute', {
        axis: [0, 0, 1],
        motor: { enabled: true, speed: 3 },
      })!
      useHistoryStore.setState({ undoStack: [], redoStack: [] })

      const duplicates = recordedDuplicateObjects([a.id, b.id])

      expect(duplicates).toHaveLength(2)
      expect(state().joints).toHaveLength(2) // original + cascaded
      const newJoint = state().joints.find((j) => j.id !== original.id)!
      const [newA, newB] = duplicates
      expect([newJoint.objectA, newJoint.objectB].sort()).toEqual([newA.id, newB.id].sort())
      expect(newJoint.objectA).not.toBe(a.id)
      expect(newJoint.objectB).not.toBe(b.id)
      expect(newJoint.type).toBe('revolute')
      expect(newJoint.axis).toEqual([0, 0, 1])
      expect(newJoint.motor).toEqual({ enabled: true, speed: 3 })
      expect(useHistoryStore.getState().undoStack).toHaveLength(1)
    })

    it("the cascaded joint's anchor is freshly computed as the new copies' midpoint, not a copy of the original", () => {
      const a = recordedAddObject(CUBE, 'A', { position: [0, 0, 0] })!
      const b = recordedAddObject(CUBE, 'B', { position: [10, 0, 0] })!
      const original = recordedCreateJoint(a.id, b.id, 'fixed')!
      expect(original.anchor).toEqual([5, 0, 0])
      useHistoryStore.setState({ undoStack: [], redoStack: [] })

      recordedDuplicateObjects([a.id, b.id])

      const cascaded = state().joints.find((j) => j.id !== original.id)!
      expect(cascaded.anchor).toEqual([5, 0, 0]) // recomputed from the duplicates' (identical) positions
    })

    it('duplicating only one of a joint’s two endpoints does not cascade the joint', () => {
      const a = recordedAddObject(CUBE, 'A')!
      const b = recordedAddObject(CUBE, 'B')!
      recordedCreateJoint(a.id, b.id, 'fixed')
      useHistoryStore.setState({ undoStack: [], redoStack: [] })

      const duplicates = recordedDuplicateObjects([b.id])

      expect(state().joints).toHaveLength(1) // still just the original
      expect(duplicates).toHaveLength(1)
    })

    it("duplicating a selection where an object has two joints, only one counterpart selected, cascades only that one", () => {
      const a = recordedAddObject(CUBE, 'A')!
      const b = recordedAddObject(CUBE, 'B')!
      const c = recordedAddObject(CUBE, 'C')!
      recordedCreateJoint(a.id, b.id, 'fixed')
      recordedCreateJoint(a.id, c.id, 'revolute')
      useHistoryStore.setState({ undoStack: [], redoStack: [] })

      recordedDuplicateObjects([a.id, b.id]) // c excluded

      expect(state().joints).toHaveLength(3) // 2 original + 1 cascaded (a-b)
    })

    it('undoing a cascaded duplicate removes the new object(s) and the new joint together', () => {
      const a = recordedAddObject(CUBE, 'A')!
      const b = recordedAddObject(CUBE, 'B')!
      recordedCreateJoint(a.id, b.id, 'fixed')
      useHistoryStore.setState({ undoStack: [], redoStack: [] })

      recordedDuplicateObjects([a.id, b.id])
      expect(state().objects).toHaveLength(4)
      expect(state().joints).toHaveLength(2)

      useHistoryStore.getState().undo()

      expect(state().objects).toHaveLength(2)
      expect(state().joints).toHaveLength(1)
    })
  })

  describe('recordedInsertRobotArmAssembly (D20, M4.7)', () => {
    it('inserts four static objects and two motor-off Revolute joints as a single undo step', () => {
      const objects = recordedInsertRobotArmAssembly([0, 0, 0])!

      expect(objects).toHaveLength(4)
      expect(state().objects).toHaveLength(4)
      expect(state().objects.every((o) => o.physics.bodyType === 'static')).toBe(true)
      expect(state().joints).toHaveLength(2)
      expect(state().joints.every((j) => j.type === 'revolute' && !j.motor.enabled)).toBe(true)
      expect(useHistoryStore.getState().undoStack).toHaveLength(1)
    })

    it("positions Arm Segment 1's joint anchor as the midpoint of Base and Arm Segment 1's actual placed positions (D23)", () => {
      recordedInsertRobotArmAssembly([10, 0, 5])
      const base = state().objects.find((o) => o.name === 'Base')!
      const segment1 = state().objects.find((o) => o.name === 'Arm Segment 1')!
      const joint = state().joints.find((j) => j.objectA === base.id && j.objectB === segment1.id)!

      expect(joint.anchor[0]).toBeCloseTo((base.transform.position[0] + segment1.transform.position[0]) / 2)
      expect(joint.anchor[1]).toBeCloseTo((base.transform.position[1] + segment1.transform.position[1]) / 2)
      expect(joint.anchor[2]).toBeCloseTo((base.transform.position[2] + segment1.transform.position[2]) / 2)
    })

    it('undo removes all four objects and both joints together; redo restores all six entities together', () => {
      recordedInsertRobotArmAssembly([0, 0, 0])
      expect(state().objects).toHaveLength(4)
      expect(state().joints).toHaveLength(2)

      useHistoryStore.getState().undo()
      expect(state().objects).toEqual([])
      expect(state().joints).toEqual([])

      useHistoryStore.getState().redo()
      expect(state().objects).toHaveLength(4)
      expect(state().joints).toHaveLength(2)
    })

    it("deleting Base afterward cascades M4.5's rule: removes only the Base<->Arm Segment 1 joint", () => {
      recordedInsertRobotArmAssembly([0, 0, 0])
      const base = state().objects.find((o) => o.name === 'Base')!
      const segment2 = state().objects.find((o) => o.name === 'Arm Segment 2')!
      useHistoryStore.setState({ undoStack: [], redoStack: [] })

      recordedRemoveObjects([base.id])

      expect(state().objects.find((o) => o.name === 'Base')).toBeUndefined()
      expect(state().joints).toHaveLength(1) // only Arm Segment 1 <-> Arm Segment 2 survives
      expect(state().joints[0].objectB).toBe(segment2.id)
    })

    it('is refused while the simulation is not idle (D2)', () => {
      useSimulationStore.setState({ phase: 'playing' })

      const result = recordedInsertRobotArmAssembly([0, 0, 0])

      expect(result).toBeUndefined()
      expect(state().objects).toEqual([])
      useSimulationStore.setState({ phase: 'idle' })
    })
  })

  describe('recordedPlaceUploadedAsset (D27, M5.5)', () => {
    it("places an object referencing the upload, named from the filename with its extension stripped", () => {
      const upload = seedUpload({ filename: 'Widget.glb' })

      const object = recordedPlaceUploadedAsset(upload.id)!

      expect(object.assetRef).toEqual({ kind: 'uploaded', key: upload.id })
      expect(object.name).toBe('Widget')
    })

    it("applies the upload's captured unitScale uniformly to X/Y/Z", () => {
      const upload = seedUpload()
      useUploadedAssetsStore.getState().setUnitScale(upload.id, 2.5)

      const object = recordedPlaceUploadedAsset(upload.id)!

      expect(object.transform.scale).toEqual([2.5, 2.5, 2.5])
    })

    it('defaults to unitScale 1 when never adjusted', () => {
      const upload = seedUpload()

      const object = recordedPlaceUploadedAsset(upload.id)!

      expect(object.transform.scale).toEqual([1, 1, 1])
    })

    it('places at the given position', () => {
      const upload = seedUpload()

      const object = recordedPlaceUploadedAsset(upload.id, [3, 0, 5])!

      expect(object.transform.position).toEqual([3, 0, 5])
    })

    it('a second placement of the same upload gets an auto-incremented name (§10)', () => {
      const upload = seedUpload({ filename: 'Widget.glb' })

      recordedPlaceUploadedAsset(upload.id)
      const second = recordedPlaceUploadedAsset(upload.id)!

      expect(second.name).toBe('Widget 2')
    })

    it('returns undefined for an unknown upload id', () => {
      expect(recordedPlaceUploadedAsset('missing-id')).toBeUndefined()
      expect(state().objects).toEqual([])
    })

    it('is a single undoable step, like any other add', () => {
      const upload = seedUpload()

      const object = recordedPlaceUploadedAsset(upload.id)!
      expect(state().objects).toHaveLength(1)

      useHistoryStore.getState().undo()
      expect(state().objects).toEqual([])

      useHistoryStore.getState().redo()
      expect(state().objects).toHaveLength(1)
      expect(state().objects[0].id).toBe(object.id)
    })

    it('is refused while the simulation is not idle (D2)', () => {
      const upload = seedUpload()
      useSimulationStore.setState({ phase: 'playing' })

      const result = recordedPlaceUploadedAsset(upload.id)

      expect(result).toBeUndefined()
      useSimulationStore.setState({ phase: 'idle' })
    })
  })
})
