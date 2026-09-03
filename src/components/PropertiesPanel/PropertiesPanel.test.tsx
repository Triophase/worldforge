import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGizmoDragStore } from '../../state/gizmoDragStore'
import { useHistoryStore } from '../../state/historyStore'
import { usePlaybackBridgeStore } from '../../state/playbackBridgeStore'
import { useSceneStore } from '../../state/sceneStore'
import { useSimulationStore } from '../../state/simulationStore'
import { useSnappingStore } from '../../state/snappingStore'
import { PropertiesPanel } from './PropertiesPanel'

const CUBE = { kind: 'builtin' as const, key: 'primitive:cube' }

describe('PropertiesPanel Transform section (M2.6) / header actions (M2.7)', () => {
  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [] })
    useGizmoDragStore.setState({ liveTransform: null })
    useSnappingStore.setState({ moveEnabled: true, moveSnap: 0.1, rotationEnabled: true, rotationSnapDeg: 15 })
    useHistoryStore.setState({ undoStack: [], redoStack: [] })
    useSimulationStore.setState({ phase: 'idle', snapshot: null })
    usePlaybackBridgeStore.setState({ liveTransform: null })
  })

  it('shows "No object selected" when nothing is selected', () => {
    render(<PropertiesPanel />)
    expect(screen.getByText('No object selected')).toBeInTheDocument()
  })

  it('shows "N objects selected" when more than one id is selected, with Duplicate/Delete but no Transform fields', () => {
    const a = useSceneStore.getState().addObject(CUBE, 'A')
    const b = useSceneStore.getState().addObject(CUBE, 'B')
    useSceneStore.setState({ selectedIds: [a.id, b.id] })
    render(<PropertiesPanel />)
    expect(screen.getByText('2 objects selected')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Duplicate/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Delete/ })).toBeInTheDocument()
    expect(screen.queryByText('Position')).not.toBeInTheDocument()
  })

  it('shows Position/Rotation/Scale fields for a single selection', () => {
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube', { position: [1, 2, 3] })
    useSceneStore.getState().select(obj.id)
    render(<PropertiesPanel />)

    expect(screen.getByText('Position')).toBeInTheDocument()
    expect(screen.getByText('Rotation')).toBeInTheDocument()
    expect(screen.getByText('Scale')).toBeInTheDocument()

    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    expect(inputs).toHaveLength(12) // Position/Rotation/Scale (9) + Physics Mass/Friction/Restitution (3, M3.2)
    expect(inputs[0]).toHaveValue(1)
    expect(inputs[1]).toHaveValue(2)
    expect(inputs[2]).toHaveValue(3)
  })

  it('editing a position field and pressing Enter commits it and moves the object', async () => {
    const user = userEvent.setup()
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
    useSceneStore.getState().select(obj.id)
    render(<PropertiesPanel />)

    const [positionX] = screen.getAllByRole('spinbutton')
    await user.clear(positionX)
    await user.type(positionX, '5')
    await user.keyboard('{Enter}')

    expect(useSceneStore.getState().objects[0].transform.position).toEqual([5, 0, 0])
  })

  it('typing a non-multiple value with snapping enabled commits it exactly as typed (§20: fields are never snapped)', async () => {
    const user = userEvent.setup()
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
    useSceneStore.getState().select(obj.id)
    render(<PropertiesPanel />)

    const [positionX] = screen.getAllByRole('spinbutton')
    await user.clear(positionX)
    await user.type(positionX, '1.234')
    await user.keyboard('{Enter}')

    expect(useSceneStore.getState().objects[0].transform.position[0]).toBeCloseTo(1.234)
  })

  it('typing without blurring or pressing Enter does not commit', async () => {
    const user = userEvent.setup()
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
    useSceneStore.getState().select(obj.id)
    render(<PropertiesPanel />)

    const [positionX] = screen.getAllByRole('spinbutton')
    await user.clear(positionX)
    await user.type(positionX, '5')

    expect(useSceneStore.getState().objects[0].transform.position).toEqual([0, 0, 0])
  })

  it('a non-identity stored quaternion displays as the equivalent Euler degrees', () => {
    const obj = useSceneStore
      .getState()
      .addObject(CUBE, 'Cube', { rotation: [0, 0.3826834, 0, 0.9238795] }) // 45deg about Y
    useSceneStore.getState().select(obj.id)
    render(<PropertiesPanel />)

    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    // Position X/Y/Z = inputs[0..2], Rotation X/Y/Z = inputs[3..5].
    expect(Number(inputs[3].value)).toBeCloseTo(0, 1)
    expect(Number(inputs[4].value)).toBeCloseTo(45, 1)
    expect(Number(inputs[5].value)).toBeCloseTo(0, 1)
  })

  it('editing a Rotation field commits an equivalent quaternion, not raw degrees', async () => {
    const user = userEvent.setup()
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
    useSceneStore.getState().select(obj.id)
    render(<PropertiesPanel />)

    const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    const rotationY = inputs[4]
    await user.clear(rotationY)
    await user.type(rotationY, '90')
    await user.keyboard('{Enter}')

    const rotation = useSceneStore.getState().objects[0].transform.rotation
    expect(rotation[1]).toBeCloseTo(Math.sin(Math.PI / 4))
    expect(rotation[3]).toBeCloseTo(Math.cos(Math.PI / 4))
  })

  it('the displayed transform tracks a live gizmo drag before it commits', () => {
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
    useSceneStore.getState().select(obj.id)
    useGizmoDragStore.setState({
      liveTransform: { position: [7, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    })
    render(<PropertiesPanel />)

    const [positionX] = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    expect(positionX).toHaveValue(7)
    // Store itself is untouched — the drag hasn't committed.
    expect(useSceneStore.getState().objects[0].transform.position).toEqual([0, 0, 0])
  })

  describe('header actions (M2.7)', () => {
    it('a single selection shows an editable Name field pre-filled with the object name', () => {
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      useSceneStore.getState().select(obj.id)
      render(<PropertiesPanel />)

      expect(screen.getByLabelText('Object name')).toHaveValue('Cube')
    })

    it('committing an edited Name field renames the object (blur/Enter, §9 single source of truth)', async () => {
      const user = userEvent.setup()
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      useSceneStore.getState().select(obj.id)
      render(<PropertiesPanel />)

      const nameInput = screen.getByLabelText('Object name')
      await user.clear(nameInput)
      await user.type(nameInput, 'Left Wheel')
      await user.keyboard('{Enter}')

      expect(useSceneStore.getState().objects[0].name).toBe('Left Wheel')
    })

    it('M8.2: Duplicate and Delete each show their D24 shortcut in their tooltip', async () => {
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      useSceneStore.getState().select(obj.id)
      render(<PropertiesPanel />)

      fireEvent.focus(screen.getByRole('button', { name: /Duplicate/ }))
      expect(await screen.findByRole('tooltip')).toHaveTextContent(/Duplicate \((Ctrl|Cmd)\+D\)/)

      fireEvent.blur(screen.getByRole('button', { name: /Duplicate/ }))
      fireEvent.focus(screen.getByRole('button', { name: /Delete/ }))
      expect(await screen.findByRole('tooltip')).toHaveTextContent('Delete (Delete)')
    })

    it('Duplicate with one object selected duplicates it and selects the duplicate', () => {
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      useSceneStore.getState().select(obj.id)
      render(<PropertiesPanel />)

      fireEvent.click(screen.getByRole('button', { name: /Duplicate/ }))

      const state = useSceneStore.getState()
      expect(state.objects).toHaveLength(2)
      expect(state.selectedIds).toHaveLength(1)
      expect(state.selectedIds[0]).not.toBe(obj.id)
    })

    it('Duplicate with three objects selected calls duplicateObject exactly three times and selects the three new duplicates', () => {
      const a = useSceneStore.getState().addObject(CUBE, 'A')
      const b = useSceneStore.getState().addObject(CUBE, 'B')
      const c = useSceneStore.getState().addObject(CUBE, 'C')
      useSceneStore.setState({ selectedIds: [a.id, b.id, c.id] })
      render(<PropertiesPanel />)

      fireEvent.click(screen.getByRole('button', { name: /Duplicate/ }))

      const state = useSceneStore.getState()
      expect(state.objects).toHaveLength(6)
      expect(state.selectedIds).toHaveLength(3)
      for (const id of [a.id, b.id, c.id]) expect(state.selectedIds).not.toContain(id)
      // M2.9: one gesture, one undo entry — not three.
      expect(useHistoryStore.getState().undoStack).toHaveLength(1)
    })

    it('Delete with two objects selected removes both and clears the selection', () => {
      const a = useSceneStore.getState().addObject(CUBE, 'A')
      const b = useSceneStore.getState().addObject(CUBE, 'B')
      useSceneStore.setState({ selectedIds: [a.id, b.id] })
      render(<PropertiesPanel />)

      fireEvent.click(screen.getByRole('button', { name: /Delete/ }))

      const state = useSceneStore.getState()
      expect(state.objects).toEqual([])
      expect(state.selectedIds).toEqual([])
      // M2.9: one gesture, one undo entry — not two.
      expect(useHistoryStore.getState().undoStack).toHaveLength(1)
    })

    it('Delete with a single object selected removes it and clears the selection', () => {
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      useSceneStore.getState().select(obj.id)
      render(<PropertiesPanel />)

      fireEvent.click(screen.getByRole('button', { name: /Delete/ }))

      const state = useSceneStore.getState()
      expect(state.objects).toEqual([])
      expect(state.selectedIds).toEqual([])
    })
  })

  describe('Physics section (M3.2)', () => {
    it('shows Body Type/Mass/Friction/Restitution/Gravity populated from the selected object', () => {
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      useSceneStore.getState().select(obj.id)
      render(<PropertiesPanel />)

      expect(screen.getByLabelText('Body Type')).toHaveValue('static')
      const inputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
      expect(inputs[9]).toHaveValue(1) // Mass default
      expect(inputs[10]).toHaveValue(0.5) // Friction default
      expect(inputs[11]).toHaveValue(0.2) // Restitution default
      expect(screen.getByRole('checkbox', { name: 'Gravity' })).toBeChecked()
    })

    it('changing Body Type commits it to the store', async () => {
      const user = userEvent.setup()
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      useSceneStore.getState().select(obj.id)
      render(<PropertiesPanel />)

      await user.selectOptions(screen.getByLabelText('Body Type'), 'dynamic')

      expect(useSceneStore.getState().objects[0].physics.bodyType).toBe('dynamic')
    })

    it('editing Mass and committing (blur/Enter) updates the store; reselecting shows the new value', async () => {
      const user = userEvent.setup()
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      useSceneStore.getState().select(obj.id)
      const { unmount } = render(<PropertiesPanel />)

      const inputs = screen.getAllByRole('spinbutton')
      await user.clear(inputs[9])
      await user.type(inputs[9], '5')
      await user.keyboard('{Enter}')

      expect(useSceneStore.getState().objects[0].physics.mass).toBe(5)

      unmount()
      useSceneStore.getState().clearSelection()
      useSceneStore.getState().select(obj.id)
      render(<PropertiesPanel />)
      expect((screen.getAllByRole('spinbutton')[9] as HTMLInputElement)).toHaveValue(5)
    })

    it('toggling Gravity off persists in the store', async () => {
      const user = userEvent.setup()
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      useSceneStore.getState().select(obj.id)
      render(<PropertiesPanel />)

      await user.click(screen.getByRole('checkbox', { name: 'Gravity' }))

      expect(useSceneStore.getState().objects[0].physics.gravity).toBe(false)
    })

    it('a negative Mass is clamped to a positive minimum, not written as-is', async () => {
      const user = userEvent.setup()
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      useSceneStore.getState().select(obj.id)
      render(<PropertiesPanel />)

      const inputs = screen.getAllByRole('spinbutton')
      await user.clear(inputs[9])
      await user.type(inputs[9], '-5')
      await user.keyboard('{Enter}')

      expect(useSceneStore.getState().objects[0].physics.mass).toBeGreaterThan(0)
    })

    it('a Restitution above 1 is clamped to 1', async () => {
      const user = userEvent.setup()
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      useSceneStore.getState().select(obj.id)
      render(<PropertiesPanel />)

      const inputs = screen.getAllByRole('spinbutton')
      await user.clear(inputs[11])
      await user.type(inputs[11], '3')
      await user.keyboard('{Enter}')

      expect(useSceneStore.getState().objects[0].physics.restitution).toBe(1)
    })

    it('no Physics fields are shown when more than one object is selected', () => {
      const a = useSceneStore.getState().addObject(CUBE, 'A')
      const b = useSceneStore.getState().addObject(CUBE, 'B')
      useSceneStore.setState({ selectedIds: [a.id, b.id] })
      render(<PropertiesPanel />)

      expect(screen.queryByLabelText('Body Type')).not.toBeInTheDocument()
      expect(screen.queryByRole('checkbox', { name: 'Gravity' })).not.toBeInTheDocument()
    })
  })

  describe('D2 edit lock (M3.4)', () => {
    it('all fields and header buttons become disabled while playing', () => {
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      useSceneStore.getState().select(obj.id)
      useSimulationStore.setState({ phase: 'playing' })
      render(<PropertiesPanel />)

      expect(screen.getByLabelText('Object name')).toBeDisabled()
      expect(screen.getByRole('button', { name: /Duplicate/ })).toBeDisabled()
      expect(screen.getByRole('button', { name: /Delete/ })).toBeDisabled()
      expect(screen.getByLabelText('Body Type')).toBeDisabled()
      expect(screen.getByRole('checkbox', { name: 'Gravity' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Add Joint' })).toBeDisabled()
      for (const input of screen.getAllByRole('spinbutton')) expect(input).toBeDisabled()
    })

    it('all fields and header buttons stay disabled while paused too, not just playing', () => {
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      useSceneStore.getState().select(obj.id)
      useSimulationStore.setState({ phase: 'paused' })
      render(<PropertiesPanel />)

      expect(screen.getByLabelText('Object name')).toBeDisabled()
      expect(screen.getAllByRole('spinbutton')[0]).toBeDisabled()
    })

    it('fields are editable again once idle', () => {
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      useSceneStore.getState().select(obj.id)
      render(<PropertiesPanel />)

      expect(screen.getByLabelText('Object name')).toBeEnabled()
      expect(screen.getByRole('button', { name: /Duplicate/ })).toBeEnabled()
      expect(screen.getAllByRole('spinbutton')[0]).toBeEnabled()
    })

    it('shows the live playback position while playing, not the stale sceneStore value', () => {
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube') // sceneStore position stays [0,0,0]
      useSceneStore.getState().select(obj.id)
      useSimulationStore.setState({ phase: 'playing' })
      usePlaybackBridgeStore.setState({
        liveTransform: { position: [3, 4, 5], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      })
      render(<PropertiesPanel />)

      const [positionX, positionY, positionZ] = screen.getAllByRole('spinbutton') as HTMLInputElement[]
      expect(positionX).toHaveValue(3)
      expect(positionY).toHaveValue(4)
      expect(positionZ).toHaveValue(5)
    })

    it('switching the selected object while playing updates which live values are shown', () => {
      const a = useSceneStore.getState().addObject(CUBE, 'A')
      const b = useSceneStore.getState().addObject(CUBE, 'B')
      useSceneStore.getState().select(a.id)
      useSimulationStore.setState({ phase: 'playing' })
      usePlaybackBridgeStore.setState({
        liveTransform: { position: [1, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      })
      render(<PropertiesPanel />)
      expect((screen.getAllByRole('spinbutton')[0] as HTMLInputElement)).toHaveValue(1)

      act(() => {
        useSceneStore.getState().select(b.id)
        usePlaybackBridgeStore.setState({
          liveTransform: { position: [2, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
        })
      })

      expect((screen.getAllByRole('spinbutton')[0] as HTMLInputElement)).toHaveValue(2)
    })
  })

  describe('Add Joint entry point (§15, M4.2)', () => {
    it('is visible for a single selection and creates a real joint through the full panel', () => {
      const a = useSceneStore.getState().addObject(CUBE, 'A')
      const b = useSceneStore.getState().addObject(CUBE, 'B')
      useSceneStore.getState().select(a.id)
      render(<PropertiesPanel />)

      fireEvent.click(screen.getByRole('button', { name: 'Add Joint' }))
      fireEvent.change(screen.getByLabelText('Joint Type'), { target: { value: 'fixed' } })
      fireEvent.change(screen.getByLabelText('Object B'), { target: { value: b.id } })
      fireEvent.click(screen.getByRole('button', { name: 'Create' }))

      expect(useSceneStore.getState().joints).toHaveLength(1)
      expect(useSceneStore.getState().joints[0]).toMatchObject({ objectA: a.id, objectB: b.id, type: 'fixed' })
    })

    it('is not shown when more than one object is selected', () => {
      const a = useSceneStore.getState().addObject(CUBE, 'A')
      const b = useSceneStore.getState().addObject(CUBE, 'B')
      useSceneStore.setState({ selectedIds: [a.id, b.id] })
      render(<PropertiesPanel />)

      expect(screen.queryByRole('button', { name: 'Add Joint' })).not.toBeInTheDocument()
    })
  })

  describe('Joint section (§19, M4.3)', () => {
    it('auto-shows the Joint section alongside Transform/Physics when the object has exactly one joint', () => {
      const a = useSceneStore.getState().addObject(CUBE, 'A')
      const b = useSceneStore.getState().addObject(CUBE, 'B')
      useSceneStore.getState().createJoint(a.id, b.id, 'revolute')
      useSceneStore.getState().select(a.id)

      render(<PropertiesPanel />)

      expect(screen.getByText('Transform')).toBeInTheDocument()
      expect(screen.getByText('Physics')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Joint' })).toBeInTheDocument()
      expect(screen.getByText('Revolute')).toBeInTheDocument()
    })

    it('an endpoint object also shows the Joint section (not only Object A)', () => {
      const a = useSceneStore.getState().addObject(CUBE, 'A')
      const b = useSceneStore.getState().addObject(CUBE, 'B')
      useSceneStore.getState().createJoint(a.id, b.id, 'fixed')
      useSceneStore.getState().select(b.id)

      render(<PropertiesPanel />)

      expect(screen.getByRole('heading', { name: 'Joint' })).toBeInTheDocument()
    })

    it('does not auto-show a Joint section when the object is an endpoint of two joints', () => {
      const a = useSceneStore.getState().addObject(CUBE, 'A')
      const b = useSceneStore.getState().addObject(CUBE, 'B')
      const c = useSceneStore.getState().addObject(CUBE, 'C')
      useSceneStore.getState().createJoint(a.id, b.id, 'fixed')
      useSceneStore.getState().createJoint(a.id, c.id, 'revolute')
      useSceneStore.getState().select(a.id)

      render(<PropertiesPanel />)

      expect(screen.queryByRole('heading', { name: 'Joint' })).not.toBeInTheDocument()
    })

    it('a directly-selected joint shows only the Joint section — no Transform, no Physics, no header actions', () => {
      const a = useSceneStore.getState().addObject(CUBE, 'A')
      const b = useSceneStore.getState().addObject(CUBE, 'B')
      const joint = useSceneStore.getState().createJoint(a.id, b.id, 'revolute')!
      useSceneStore.setState({ selectedJointId: joint.id, selectedIds: [] })

      render(<PropertiesPanel />)

      expect(screen.getByRole('heading', { name: 'Joint' })).toBeInTheDocument()
      expect(screen.queryByText('Transform')).not.toBeInTheDocument()
      expect(screen.queryByText('Physics')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Duplicate/ })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument()
    })
  })
})
