import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useHistoryStore } from '../../state/historyStore'
import { useSceneStore } from '../../state/sceneStore'
import { JointCreationFlow } from './JointCreationFlow'

const CUBE = { kind: 'builtin' as const, key: 'primitive:cube' }

describe('JointCreationFlow (§15, M4.2)', () => {
  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [] })
    useHistoryStore.setState({ undoStack: [], redoStack: [] })
  })

  it('shows only the Add Joint trigger until clicked', () => {
    const a = useSceneStore.getState().addObject(CUBE, 'A')
    render(<JointCreationFlow objectAId={a.id} disabled={false} />)

    expect(screen.getByRole('button', { name: 'Add Joint' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Joint Type')).not.toBeInTheDocument()
  })

  it('the Add Joint trigger is disabled when the panel says so (D2 lock)', () => {
    const a = useSceneStore.getState().addObject(CUBE, 'A')
    render(<JointCreationFlow objectAId={a.id} disabled={true} />)

    expect(screen.getByRole('button', { name: 'Add Joint' })).toBeDisabled()
  })

  it("the Object B picker excludes Object A and any object already jointed to it", () => {
    const a = useSceneStore.getState().addObject(CUBE, 'A')
    useSceneStore.getState().addObject(CUBE, 'B')
    const c = useSceneStore.getState().addObject(CUBE, 'C')
    useSceneStore.getState().createJoint(a.id, c.id, 'fixed') // A and C already connected

    render(<JointCreationFlow objectAId={a.id} disabled={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Joint' }))
    fireEvent.change(screen.getByLabelText('Joint Type'), { target: { value: 'fixed' } })

    const objectBSelect = screen.getByLabelText('Object B')
    const labels = Array.from(objectBSelect.querySelectorAll('option')).map((o) => o.textContent)
    expect(labels).toContain('B')
    expect(labels).not.toContain('A')
    expect(labels).not.toContain('C')
  })

  it('choosing Revolute pre-fills axis [1,0,0], unset limits, and motor off — once Object B is also chosen', async () => {
    const user = userEvent.setup()
    const a = useSceneStore.getState().addObject(CUBE, 'A')
    const b = useSceneStore.getState().addObject(CUBE, 'B')

    render(<JointCreationFlow objectAId={a.id} disabled={false} />)
    await user.click(screen.getByRole('button', { name: 'Add Joint' }))
    await user.selectOptions(screen.getByLabelText('Joint Type'), 'revolute')
    expect(screen.queryByLabelText('X')).not.toBeInTheDocument() // Axis step waits for Object B

    await user.selectOptions(screen.getByLabelText('Object B'), b.id)

    expect(screen.getByLabelText('X')).toHaveValue(1)
    expect(screen.getByLabelText('Y')).toHaveValue(0)
    expect(screen.getByLabelText('Z')).toHaveValue(0)
    expect(screen.getByLabelText('Limits')).not.toBeChecked()
    expect(screen.getByLabelText('Motor')).not.toBeChecked()
  })

  it('choosing Prismatic pre-fills axis [0,1,0]', async () => {
    const user = userEvent.setup()
    const a = useSceneStore.getState().addObject(CUBE, 'A')
    const b = useSceneStore.getState().addObject(CUBE, 'B')

    render(<JointCreationFlow objectAId={a.id} disabled={false} />)
    await user.click(screen.getByRole('button', { name: 'Add Joint' }))
    await user.selectOptions(screen.getByLabelText('Joint Type'), 'prismatic')
    await user.selectOptions(screen.getByLabelText('Object B'), b.id)

    expect(screen.getByLabelText('X')).toHaveValue(0)
    expect(screen.getByLabelText('Y')).toHaveValue(1)
    expect(screen.getByLabelText('Z')).toHaveValue(0)
  })

  it('choosing Fixed shows no Axis/Limits/Motor fields at all', async () => {
    const user = userEvent.setup()
    const a = useSceneStore.getState().addObject(CUBE, 'A')
    const b = useSceneStore.getState().addObject(CUBE, 'B')

    render(<JointCreationFlow objectAId={a.id} disabled={false} />)
    await user.click(screen.getByRole('button', { name: 'Add Joint' }))
    await user.selectOptions(screen.getByLabelText('Joint Type'), 'fixed')
    await user.selectOptions(screen.getByLabelText('Object B'), b.id)

    expect(screen.queryByLabelText('X')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Limits')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Motor')).not.toBeInTheDocument()
  })

  it('pressing Create with Fixed produces exactly one fixed joint connecting A and B', async () => {
    const user = userEvent.setup()
    const a = useSceneStore.getState().addObject(CUBE, 'A')
    const b = useSceneStore.getState().addObject(CUBE, 'B')

    render(<JointCreationFlow objectAId={a.id} disabled={false} />)
    await user.click(screen.getByRole('button', { name: 'Add Joint' }))
    await user.selectOptions(screen.getByLabelText('Joint Type'), 'fixed')
    await user.selectOptions(screen.getByLabelText('Object B'), b.id)
    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(useSceneStore.getState().joints).toHaveLength(1)
    expect(useSceneStore.getState().joints[0]).toMatchObject({ type: 'fixed', objectA: a.id, objectB: b.id })
  })

  it('editing axis/limits/motor before Create commits the edited values, not the defaults', async () => {
    const user = userEvent.setup()
    const a = useSceneStore.getState().addObject(CUBE, 'A')
    const b = useSceneStore.getState().addObject(CUBE, 'B')

    render(<JointCreationFlow objectAId={a.id} disabled={false} />)
    await user.click(screen.getByRole('button', { name: 'Add Joint' }))
    await user.selectOptions(screen.getByLabelText('Joint Type'), 'revolute')
    await user.selectOptions(screen.getByLabelText('Object B'), b.id)

    await user.click(screen.getByLabelText('Motor'))
    const speedInput = screen.getByLabelText('Speed')
    await user.clear(speedInput)
    await user.type(speedInput, '3')
    fireEvent.blur(speedInput)

    await user.click(screen.getByRole('button', { name: 'Create' }))

    expect(useSceneStore.getState().joints[0].motor).toEqual({ enabled: true, speed: 3 })
  })

  it('Create is a single undo step; Ctrl/Cmd+Z removes the joint entirely', async () => {
    const user = userEvent.setup()
    const a = useSceneStore.getState().addObject(CUBE, 'A')
    const b = useSceneStore.getState().addObject(CUBE, 'B')

    render(<JointCreationFlow objectAId={a.id} disabled={false} />)
    await user.click(screen.getByRole('button', { name: 'Add Joint' }))
    await user.selectOptions(screen.getByLabelText('Joint Type'), 'fixed')
    await user.selectOptions(screen.getByLabelText('Object B'), b.id)
    await user.click(screen.getByRole('button', { name: 'Create' }))
    expect(useSceneStore.getState().joints).toHaveLength(1)

    act(() => useHistoryStore.getState().undo())

    expect(useSceneStore.getState().joints).toEqual([])
  })

  it('Cancel discards the in-progress form with no mutation and no undo entry', async () => {
    const user = userEvent.setup()
    const a = useSceneStore.getState().addObject(CUBE, 'A')
    const b = useSceneStore.getState().addObject(CUBE, 'B')
    const stackBefore = useHistoryStore.getState().undoStack

    render(<JointCreationFlow objectAId={a.id} disabled={false} />)
    await user.click(screen.getByRole('button', { name: 'Add Joint' }))
    await user.selectOptions(screen.getByLabelText('Joint Type'), 'revolute')
    await user.selectOptions(screen.getByLabelText('Object B'), b.id)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(useSceneStore.getState().joints).toEqual([])
    expect(useHistoryStore.getState().undoStack).toBe(stackBefore)
    expect(screen.getByRole('button', { name: 'Add Joint' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Joint Type')).not.toBeInTheDocument()
  })
})
