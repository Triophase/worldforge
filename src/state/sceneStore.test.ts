import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SCENE_NAME, useSceneStore } from './sceneStore'

const CUBE = { kind: 'builtin' as const, key: 'primitive:cube' }

describe('sceneStore', () => {
  beforeEach(() => {
    useSceneStore.setState({
      name: DEFAULT_SCENE_NAME,
      objects: [],
      joints: [],
      selectedJointId: null,
      selectedIds: [],
      isDirty: false,
    })
  })

  describe('renameScene (D31, M6.5)', () => {
    it('defaults to "Untitled Scene"', () => {
      expect(useSceneStore.getState().name).toBe('Untitled Scene')
    })

    it('updates the name and marks the draft dirty', () => {
      useSceneStore.getState().renameScene('Widget Assembly')
      expect(useSceneStore.getState().name).toBe('Widget Assembly')
      expect(useSceneStore.getState().isDirty).toBe(true)
    })

    it('resetDraft restores the default name', () => {
      useSceneStore.getState().renameScene('Widget Assembly')
      useSceneStore.getState().resetDraft()
      expect(useSceneStore.getState().name).toBe(DEFAULT_SCENE_NAME)
    })
  })

  it('addObject on an empty store creates one object with identity transform and D29 physics defaults', () => {
    useSceneStore.getState().addObject(CUBE, 'Cube')
    const objects = useSceneStore.getState().objects
    expect(objects).toHaveLength(1)
    expect(objects[0]).toMatchObject({
      name: 'Cube',
      assetRef: CUBE,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      physics: { bodyType: 'static', mass: 1.0, friction: 0.5, restitution: 0.2, gravity: true },
    })
  })

  it('a second addObject with the same base name produces "Cube 2", a third "Cube 3"', () => {
    const { addObject } = useSceneStore.getState()
    addObject(CUBE, 'Cube')
    addObject(CUBE, 'Cube')
    addObject(CUBE, 'Cube')
    expect(useSceneStore.getState().objects.map((o) => o.name)).toEqual(['Cube', 'Cube 2', 'Cube 3'])
  })

  it('naming is live-computed: deleting "Cube 2" then adding again reuses "Cube 2", not "Cube 4"', () => {
    const { addObject, removeObject } = useSceneStore.getState()
    addObject(CUBE, 'Cube')
    const second = addObject(CUBE, 'Cube')
    addObject(CUBE, 'Cube')

    removeObject(second.id)
    addObject(CUBE, 'Cube')

    expect(useSceneStore.getState().objects.map((o) => o.name)).toEqual(['Cube', 'Cube 3', 'Cube 2'])
  })

  it('renaming an object into an existing name does not alter or renumber the original', () => {
    const { addObject, renameObject } = useSceneStore.getState()
    const first = addObject(CUBE, 'Cube')
    const other = addObject({ kind: 'builtin', key: 'primitive:sphere' }, 'Sphere')

    renameObject(other.id, 'Cube')
    expect(useSceneStore.getState().objects.find((o) => o.id === first.id)?.name).toBe('Cube')
    expect(useSceneStore.getState().objects.find((o) => o.id === other.id)?.name).toBe('Cube')

    addObject(CUBE, 'Cube')
    expect(useSceneStore.getState().objects.at(-1)?.name).toBe('Cube 2')
  })

  it('removeObject removes exactly that object, leaving every other object unchanged', () => {
    const { addObject, removeObject } = useSceneStore.getState()
    const a = addObject(CUBE, 'Cube')
    const b = addObject(CUBE, 'Cube')

    removeObject(a.id)

    const remaining = useSceneStore.getState().objects
    expect(remaining).toHaveLength(1)
    expect(remaining[0]).toEqual(b)
  })

  it('duplicateObject copies transform/physics/assetRef and names "<source> Copy"; duplicating again yields "Copy 2"', () => {
    const { addObject, duplicateObject } = useSceneStore.getState()
    const source = addObject(CUBE, 'Wheel')

    const dup1 = duplicateObject(source.id)!
    expect(dup1.id).not.toBe(source.id)
    expect(dup1.name).toBe('Wheel Copy')
    expect(dup1.transform).toEqual(source.transform)
    expect(dup1.physics).toEqual(source.physics)
    expect(dup1.assetRef).toEqual(source.assetRef)

    const dup2 = duplicateObject(source.id)!
    expect(dup2.name).toBe('Wheel Copy 2')
  })

  it('select replaces selectedIds; clearSelection empties it', () => {
    const { addObject, select, clearSelection } = useSceneStore.getState()
    const a = addObject(CUBE, 'Cube')
    const b = addObject(CUBE, 'Cube')

    select(a.id)
    expect(useSceneStore.getState().selectedIds).toEqual([a.id])
    select(b.id)
    expect(useSceneStore.getState().selectedIds).toEqual([b.id])
    clearSelection()
    expect(useSceneStore.getState().selectedIds).toEqual([])
  })

  it('every generated id is unique, including across deletes', () => {
    const { addObject, removeObject } = useSceneStore.getState()
    const ids = new Set<string>()
    for (let i = 0; i < 20; i++) {
      const obj = addObject(CUBE, 'Cube')
      ids.add(obj.id)
      if (i % 3 === 0) removeObject(obj.id)
    }
    expect(ids.size).toBe(20)
  })

  describe('isDirty (D4/M2.10)', () => {
    it('starts false and every mutating action sets it true', () => {
      const { addObject, removeObject, renameObject, duplicateObject, updateTransform } = useSceneStore.getState()
      expect(useSceneStore.getState().isDirty).toBe(false)

      const obj = addObject(CUBE, 'Cube')
      expect(useSceneStore.getState().isDirty).toBe(true)

      useSceneStore.setState({ isDirty: false })
      renameObject(obj.id, 'Renamed')
      expect(useSceneStore.getState().isDirty).toBe(true)

      useSceneStore.setState({ isDirty: false })
      updateTransform(obj.id, { position: [1, 0, 0] })
      expect(useSceneStore.getState().isDirty).toBe(true)

      useSceneStore.setState({ isDirty: false })
      duplicateObject(obj.id)
      expect(useSceneStore.getState().isDirty).toBe(true)

      useSceneStore.setState({ isDirty: false })
      removeObject(obj.id)
      expect(useSceneStore.getState().isDirty).toBe(true)
    })

    it('select/clearSelection never set isDirty', () => {
      const { addObject, select, clearSelection } = useSceneStore.getState()
      const obj = addObject(CUBE, 'Cube')
      useSceneStore.setState({ isDirty: false })

      select(obj.id)
      clearSelection()
      expect(useSceneStore.getState().isDirty).toBe(false)
    })
  })

  it('resetDraft empties objects/selectedIds and clears isDirty', () => {
    const { addObject, select, resetDraft } = useSceneStore.getState()
    const obj = addObject(CUBE, 'Cube')
    select(obj.id)

    resetDraft()

    expect(useSceneStore.getState().objects).toEqual([])
    expect(useSceneStore.getState().selectedIds).toEqual([])
    expect(useSceneStore.getState().isDirty).toBe(false)
  })

  it('resetDraft also empties joints', () => {
    const { addObject, createJoint, resetDraft } = useSceneStore.getState()
    const a = addObject(CUBE, 'A')
    const b = addObject(CUBE, 'B')
    createJoint(a.id, b.id, 'fixed')

    resetDraft()

    expect(useSceneStore.getState().joints).toEqual([])
  })

  describe('joints (M4.1, D22/D23/§14/§15)', () => {
    it('createJoint adds one fixed joint entity with the correct type and object ids', () => {
      const { addObject, createJoint } = useSceneStore.getState()
      const a = addObject(CUBE, 'A', { position: [0, 0, 0] })
      const b = addObject(CUBE, 'B', { position: [2, 0, 0] })

      const joint = createJoint(a.id, b.id, 'fixed')

      expect(joint).toBeDefined()
      expect(useSceneStore.getState().joints).toHaveLength(1)
      expect(useSceneStore.getState().joints[0]).toMatchObject({ type: 'fixed', objectA: a.id, objectB: b.id })
    })

    it("a joint's anchor is the midpoint of A/B's positions at creation, and does not follow later moves", () => {
      const { addObject, createJoint, updateTransform } = useSceneStore.getState()
      const a = addObject(CUBE, 'A', { position: [0, 0, 0] })
      const b = addObject(CUBE, 'B', { position: [4, 2, 0] })

      const joint = createJoint(a.id, b.id, 'fixed')!
      expect(joint.anchor).toEqual([2, 1, 0])

      updateTransform(a.id, { position: [100, 100, 100] })

      expect(useSceneStore.getState().joints[0].anchor).toEqual([2, 1, 0])
    })

    it('a revolute joint with no explicit axis defaults to world X; prismatic defaults to world Y', () => {
      const { addObject, createJoint } = useSceneStore.getState()
      const a = addObject(CUBE, 'A')
      const b = addObject(CUBE, 'B')

      const revolute = createJoint(a.id, b.id, 'revolute')!
      useSceneStore.getState().deleteJoint(revolute.id)
      const prismatic = createJoint(a.id, b.id, 'prismatic')!

      expect(revolute.axis).toEqual([1, 0, 0])
      expect(prismatic.axis).toEqual([0, 1, 0])
    })

    it('a new joint has unlimited limits and an off motor unless overridden', () => {
      const { addObject, createJoint } = useSceneStore.getState()
      const a = addObject(CUBE, 'A')
      const b = addObject(CUBE, 'B')

      const joint = createJoint(a.id, b.id, 'revolute')!

      expect(joint.limits).toEqual({ min: null, max: null })
      expect(joint.motor).toEqual({ enabled: false, speed: 0 })
    })

    it('a caller can override anchor/axis/limits/motor at creation', () => {
      const { addObject, createJoint } = useSceneStore.getState()
      const a = addObject(CUBE, 'A')
      const b = addObject(CUBE, 'B')

      const joint = createJoint(a.id, b.id, 'revolute', {
        axis: [0, 0, 1],
        limits: { min: -1, max: 1 },
        motor: { enabled: true, speed: 2 },
      })!

      expect(joint.axis).toEqual([0, 0, 1])
      expect(joint.limits).toEqual({ min: -1, max: 1 })
      expect(joint.motor).toEqual({ enabled: true, speed: 2 })
    })

    it('createJoint rejects a self-join and does not mutate joints', () => {
      const { addObject, createJoint } = useSceneStore.getState()
      const a = addObject(CUBE, 'A')

      const result = createJoint(a.id, a.id, 'fixed')

      expect(result).toBeUndefined()
      expect(useSceneStore.getState().joints).toEqual([])
    })

    it('createJoint rejects a second joint (of any type) between an already-connected pair', () => {
      const { addObject, createJoint } = useSceneStore.getState()
      const a = addObject(CUBE, 'A')
      const b = addObject(CUBE, 'B')
      createJoint(a.id, b.id, 'fixed')

      const result = createJoint(b.id, a.id, 'revolute') // reversed order — still the same unordered pair

      expect(result).toBeUndefined()
      expect(useSceneStore.getState().joints).toHaveLength(1)
    })

    it('deleteJoint removes exactly the matching entry', () => {
      const { addObject, createJoint, deleteJoint } = useSceneStore.getState()
      const a = addObject(CUBE, 'A')
      const b = addObject(CUBE, 'B')
      const c = addObject(CUBE, 'C')
      const ab = createJoint(a.id, b.id, 'fixed')!
      createJoint(a.id, c.id, 'fixed')

      deleteJoint(ab.id)

      expect(useSceneStore.getState().joints).toHaveLength(1)
      expect(useSceneStore.getState().joints[0].objectA).toBe(a.id)
      expect(useSceneStore.getState().joints[0].objectB).toBe(c.id)
    })

    it("updateJoint patches only the given fields on the matching joint", () => {
      const { addObject, createJoint, updateJoint } = useSceneStore.getState()
      const a = addObject(CUBE, 'A')
      const b = addObject(CUBE, 'B')
      const joint = createJoint(a.id, b.id, 'revolute')!

      updateJoint(joint.id, { motor: { enabled: true, speed: 5 } })

      const updated = useSceneStore.getState().joints[0]
      expect(updated.motor).toEqual({ enabled: true, speed: 5 })
      expect(updated.axis).toEqual(joint.axis) // untouched fields survive the patch
    })

    it('createJoint/deleteJoint/updateJoint all set isDirty', () => {
      const { addObject, createJoint, deleteJoint, updateJoint } = useSceneStore.getState()
      const a = addObject(CUBE, 'A')
      const b = addObject(CUBE, 'B')
      const joint = createJoint(a.id, b.id, 'fixed')!
      useSceneStore.setState({ isDirty: false })

      updateJoint(joint.id, { motor: { enabled: true, speed: 1 } })
      expect(useSceneStore.getState().isDirty).toBe(true)

      useSceneStore.setState({ isDirty: false })
      deleteJoint(joint.id)
      expect(useSceneStore.getState().isDirty).toBe(true)
    })
  })

  describe('joint selection — mutually exclusive with object selection (M4.3, D19)', () => {
    it('selectJoint sets selectedJointId and clears selectedIds', () => {
      const { addObject, createJoint, select, selectJoint } = useSceneStore.getState()
      const a = addObject(CUBE, 'A')
      const b = addObject(CUBE, 'B')
      const joint = createJoint(a.id, b.id, 'fixed')!
      select(a.id)

      selectJoint(joint.id)

      expect(useSceneStore.getState().selectedJointId).toBe(joint.id)
      expect(useSceneStore.getState().selectedIds).toEqual([])
    })

    it('select/setSelection/clearSelection all clear selectedJointId', () => {
      const { addObject, createJoint, select, setSelection, clearSelection, selectJoint } = useSceneStore.getState()
      const a = addObject(CUBE, 'A')
      const b = addObject(CUBE, 'B')
      const joint = createJoint(a.id, b.id, 'fixed')!

      selectJoint(joint.id)
      select(a.id)
      expect(useSceneStore.getState().selectedJointId).toBeNull()

      selectJoint(joint.id)
      setSelection([b.id])
      expect(useSceneStore.getState().selectedJointId).toBeNull()

      selectJoint(joint.id)
      clearSelection()
      expect(useSceneStore.getState().selectedJointId).toBeNull()
    })

    it('resetDraft also clears selectedJointId', () => {
      const { addObject, createJoint, selectJoint, resetDraft } = useSceneStore.getState()
      const a = addObject(CUBE, 'A')
      const b = addObject(CUBE, 'B')
      const joint = createJoint(a.id, b.id, 'fixed')!
      selectJoint(joint.id)

      resetDraft()

      expect(useSceneStore.getState().selectedJointId).toBeNull()
    })
  })
})
