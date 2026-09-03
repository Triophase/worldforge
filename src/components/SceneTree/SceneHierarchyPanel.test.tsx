import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useContextMenuStore } from '../../state/contextMenuStore'
import { useHistoryStore } from '../../state/historyStore'
import { useSceneStore } from '../../state/sceneStore'
import { useSimulationStore } from '../../state/simulationStore'
import { SceneHierarchyPanel } from './SceneHierarchyPanel'

const CUBE = { kind: 'builtin' as const, key: 'primitive:cube' }

describe('SceneHierarchyPanel', () => {
  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [] })
    useHistoryStore.setState({ undoStack: [], redoStack: [] })
    useContextMenuStore.setState({ open: false, x: 0, y: 0 })
    useSimulationStore.setState({ phase: 'idle', snapshot: null })
  })

  it('renders one row per object, in store order, showing each name', () => {
    const { addObject } = useSceneStore.getState()
    addObject(CUBE, 'Cube')
    addObject(CUBE, 'Cube')
    addObject(CUBE, 'Cube')

    render(<SceneHierarchyPanel />)
    const rows = screen.getAllByRole('button')
    expect(rows.map((r) => r.textContent)).toEqual(['Cube', 'Cube 2', 'Cube 3'])
  })

  it('reacts immediately to objects being added or removed', () => {
    render(<SceneHierarchyPanel />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)

    let obj: ReturnType<typeof useSceneStore.getState>['objects'][number]
    act(() => {
      obj = useSceneStore.getState().addObject(CUBE, 'Cube')
    })
    expect(screen.getAllByRole('button')).toHaveLength(1)

    act(() => useSceneStore.getState().removeObject(obj.id))
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('clicking a row selects exactly that object', () => {
    const { addObject } = useSceneStore.getState()
    const a = addObject(CUBE, 'Cube')
    addObject(CUBE, 'Cube')

    render(<SceneHierarchyPanel />)
    fireEvent.click(screen.getByText('Cube'))

    expect(useSceneStore.getState().selectedIds).toEqual([a.id])
  })

  it('clicking empty space below the rows clears the selection', () => {
    const { addObject, select } = useSceneStore.getState()
    const a = addObject(CUBE, 'Cube')
    select(a.id)

    render(<SceneHierarchyPanel />)
    const region = screen.getByRole('region', { name: 'Scene Hierarchy' })
    const list = region.querySelector('div')! // the .list container, not a row
    fireEvent.click(list)

    expect(useSceneStore.getState().selectedIds).toEqual([])
  })

  it('a selection made programmatically (e.g. by a future viewport click) highlights the right row', () => {
    const { addObject, select } = useSceneStore.getState()
    const a = addObject(CUBE, 'Cube')
    const b = addObject(CUBE, 'Cube')

    render(<SceneHierarchyPanel />)
    act(() => select(b.id))

    const rowB = screen.getByText('Cube 2').closest('button')!
    const rowA = screen.getByText('Cube').closest('button')!
    expect(rowB.className).toMatch(/rowSelected/)
    expect(rowA.className).not.toMatch(/rowSelected/)
    void a
  })

  it('the selected row has both a background-fill class and a separate leading-indicator element', () => {
    const { addObject, select } = useSceneStore.getState()
    const a = addObject(CUBE, 'Cube')
    select(a.id)

    render(<SceneHierarchyPanel />)
    const row = screen.getByText('Cube').closest('button')!
    expect(row.className).toMatch(/rowSelected/) // the fill
    expect(row.querySelector('[aria-hidden]')).not.toBeNull() // the leading indicator, a separate element
  })

  describe('multi-select (M2.7)', () => {
    it('shift+clicking a second row adds it to the selection', () => {
      const { addObject, select } = useSceneStore.getState()
      const a = addObject(CUBE, 'Cube')
      const b = addObject(CUBE, 'Cube')
      select(a.id)

      render(<SceneHierarchyPanel />)
      fireEvent.click(screen.getByText('Cube 2'), { shiftKey: true })

      expect(useSceneStore.getState().selectedIds.sort()).toEqual([a.id, b.id].sort())
    })

    it('ctrl/cmd+clicking an already-selected row removes just that one', () => {
      const { addObject } = useSceneStore.getState()
      const a = addObject(CUBE, 'Cube')
      const b = addObject(CUBE, 'Cube')
      useSceneStore.setState({ selectedIds: [a.id, b.id] })

      render(<SceneHierarchyPanel />)
      fireEvent.click(screen.getByText('Cube'), { ctrlKey: true })

      expect(useSceneStore.getState().selectedIds).toEqual([b.id])
    })

    it('a plain click after a multi-selection replaces it with just the clicked row', () => {
      const { addObject } = useSceneStore.getState()
      const a = addObject(CUBE, 'Cube')
      const b = addObject(CUBE, 'Cube')
      useSceneStore.setState({ selectedIds: [a.id, b.id] })

      render(<SceneHierarchyPanel />)
      fireEvent.click(screen.getByText('Cube'))

      expect(useSceneStore.getState().selectedIds).toEqual([a.id])
    })

    it('double-clicking a row enters an editable state; Enter commits the new name', async () => {
      const user = userEvent.setup()
      const { addObject } = useSceneStore.getState()
      const a = addObject(CUBE, 'Cube')

      render(<SceneHierarchyPanel />)
      await user.dblClick(screen.getByText('Cube'))

      const input = screen.getByLabelText('Rename Cube')
      await user.clear(input)
      await user.type(input, 'Left Wheel')
      await user.keyboard('{Enter}')

      expect(useSceneStore.getState().objects.find((o) => o.id === a.id)!.name).toBe('Left Wheel')
      expect(screen.getByText('Left Wheel')).toBeInTheDocument()
      expect(screen.queryByLabelText('Rename Cube')).not.toBeInTheDocument()

      // M2.9: the rename is undoable.
      useHistoryStore.getState().undo()
      expect(useSceneStore.getState().objects.find((o) => o.id === a.id)!.name).toBe('Cube')
    })

    it('blurring the rename input without typing keeps the original name', async () => {
      const user = userEvent.setup()
      const { addObject } = useSceneStore.getState()
      addObject(CUBE, 'Cube')

      render(<SceneHierarchyPanel />)
      await user.dblClick(screen.getByText('Cube'))
      await user.tab()

      expect(screen.getByText('Cube')).toBeInTheDocument()
    })
  })

  describe('context menu (M8.1, §21)', () => {
    it('right-clicking an unselected row selects it and opens the menu at the click coordinates', () => {
      const { addObject } = useSceneStore.getState()
      const a = addObject(CUBE, 'Cube')

      render(<SceneHierarchyPanel />)
      fireEvent.contextMenu(screen.getByText('Cube'), { clientX: 30, clientY: 40 })

      expect(useSceneStore.getState().selectedIds).toEqual([a.id])
      expect(useContextMenuStore.getState()).toMatchObject({ open: true, x: 30, y: 40 })
    })

    it('right-clicking an already-selected row does not change the selection', () => {
      const { addObject, setSelection } = useSceneStore.getState()
      const a = addObject(CUBE, 'A')
      const b = addObject(CUBE, 'B')
      setSelection([a.id, b.id])

      render(<SceneHierarchyPanel />)
      fireEvent.contextMenu(screen.getByText('A'))

      expect(useSceneStore.getState().selectedIds.sort()).toEqual([a.id, b.id].sort())
      expect(useContextMenuStore.getState().open).toBe(true)
    })

    it('right-clicking empty space below the rows opens no menu and clears the selection', () => {
      const { addObject, select } = useSceneStore.getState()
      const a = addObject(CUBE, 'Cube')
      select(a.id)

      render(<SceneHierarchyPanel />)
      const region = screen.getByRole('region', { name: 'Scene Hierarchy' })
      const list = region.querySelector('div')!
      fireEvent.contextMenu(list)

      expect(useSceneStore.getState().selectedIds).toEqual([])
      expect(useContextMenuStore.getState().open).toBe(false)
    })

    it('D2: right-clicking a row while playing opens no menu', () => {
      const { addObject } = useSceneStore.getState()
      addObject(CUBE, 'Cube')
      useSimulationStore.setState({ phase: 'playing' })

      render(<SceneHierarchyPanel />)
      fireEvent.contextMenu(screen.getByText('Cube'))

      expect(useContextMenuStore.getState().open).toBe(false)
    })
  })

  describe('joint nesting (D19, M4.1)', () => {
    it("a joint appears as a row labeled with its type, nested under its objectA's row", () => {
      const { addObject, createJoint } = useSceneStore.getState()
      const a = addObject(CUBE, 'Arm')
      const b = addObject(CUBE, 'Base')
      createJoint(a.id, b.id, 'revolute')

      render(<SceneHierarchyPanel />)

      const jointText = screen.getByText('Joint (Revolute)')
      const armRow = screen.getByText('Arm').closest('div')!
      expect(armRow.parentElement!.contains(jointText)).toBe(true)
    })

    it('a joint row is distinguishable from an object row (different labels, both buttons)', () => {
      const { addObject, createJoint } = useSceneStore.getState()
      const a = addObject(CUBE, 'A')
      const b = addObject(CUBE, 'B')
      createJoint(a.id, b.id, 'fixed')

      render(<SceneHierarchyPanel />)

      expect(screen.getAllByRole('button').map((r) => r.textContent)).toEqual(['A', 'Joint (Fixed)', 'B'])
    })

    it('reacts immediately to a joint being created or deleted', () => {
      const { addObject, createJoint, deleteJoint } = useSceneStore.getState()
      const a = addObject(CUBE, 'A')
      const b = addObject(CUBE, 'B')

      render(<SceneHierarchyPanel />)
      expect(screen.queryByText(/^Joint /)).not.toBeInTheDocument()

      let joint: ReturnType<typeof createJoint>
      act(() => {
        joint = createJoint(a.id, b.id, 'fixed')
      })
      expect(screen.getByText('Joint (Fixed)')).toBeInTheDocument()

      act(() => deleteJoint(joint!.id))
      expect(screen.queryByText(/^Joint /)).not.toBeInTheDocument()
    })
  })

  describe('joint selection (D19, M4.3)', () => {
    it("clicking a joint's row selects it and clears any object selection", () => {
      const { addObject, createJoint, select } = useSceneStore.getState()
      const a = addObject(CUBE, 'A')
      const b = addObject(CUBE, 'B')
      const joint = createJoint(a.id, b.id, 'fixed')!
      select(a.id)

      render(<SceneHierarchyPanel />)
      fireEvent.click(screen.getByText('Joint (Fixed)'))

      expect(useSceneStore.getState().selectedJointId).toBe(joint.id)
      expect(useSceneStore.getState().selectedIds).toEqual([])
    })

    it("selecting an object afterward clears the joint selection", () => {
      const { addObject, createJoint } = useSceneStore.getState()
      const a = addObject(CUBE, 'A')
      const b = addObject(CUBE, 'B')
      const joint = createJoint(a.id, b.id, 'fixed')!
      useSceneStore.setState({ selectedJointId: joint.id })

      render(<SceneHierarchyPanel />)
      fireEvent.click(screen.getByText('A'))

      expect(useSceneStore.getState().selectedJointId).toBeNull()
      expect(useSceneStore.getState().selectedIds).toEqual([a.id])
    })

    it('the selected joint row shows fill + indicator, matching object-row selection styling', () => {
      const { addObject, createJoint } = useSceneStore.getState()
      const a = addObject(CUBE, 'A')
      const b = addObject(CUBE, 'B')
      const joint = createJoint(a.id, b.id, 'fixed')!
      useSceneStore.setState({ selectedJointId: joint.id })

      render(<SceneHierarchyPanel />)
      const row = screen.getByText('Joint (Fixed)').closest('button')!

      expect(row.className).toMatch(/jointRowSelected/)
      expect(row.querySelector('[aria-hidden]')).not.toBeNull()
    })
  })
})
