import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useHistoryStore } from '../../state/historyStore'
import type { JointEntity } from '../../state/sceneStore'
import { useSceneStore } from '../../state/sceneStore'
import { useSimulationStore } from '../../state/simulationStore'
import { JointPropertiesSection } from './JointPropertiesSection'

const CUBE = { kind: 'builtin' as const, key: 'primitive:cube' }

function makeJoint(overrides: Partial<JointEntity> = {}): JointEntity {
  return {
    id: 'joint-1',
    type: 'revolute',
    objectA: 'a',
    objectB: 'b',
    anchor: [0, 0, 0],
    axis: [1, 0, 0],
    limits: { min: null, max: null },
    motor: { enabled: false, speed: 0 },
    ...overrides,
  }
}

describe('JointPropertiesSection (§19, M4.3)', () => {
  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [] })
    useHistoryStore.setState({ undoStack: [], redoStack: [] })
    useSimulationStore.setState({ phase: 'idle', snapshot: null, jointMotorSnapshot: null })
  })

  it('shows Type/Axis/Limits/Motor/Speed for a Revolute joint', () => {
    const a = useSceneStore.getState().addObject(CUBE, 'A')
    const b = useSceneStore.getState().addObject(CUBE, 'B')
    const joint = useSceneStore.getState().createJoint(a.id, b.id, 'revolute')!
    useSceneStore.setState({ joints: [joint] })

    render(<JointPropertiesSection joint={useSceneStore.getState().joints[0]} />)

    expect(screen.getByText('Revolute')).toBeInTheDocument()
    expect(screen.getByLabelText('X')).toBeInTheDocument()
    expect(screen.getByLabelText('Limits')).toBeInTheDocument()
    expect(screen.getByLabelText('Motor')).toBeInTheDocument()
    expect(screen.getByLabelText('Speed')).toBeInTheDocument()
  })

  it('shows only the Type field for a Fixed joint — no Axis/Limits/Motor/Speed', () => {
    render(<JointPropertiesSection joint={makeJoint({ type: 'fixed' })} />)

    expect(screen.getByText('Fixed')).toBeInTheDocument()
    expect(screen.queryByLabelText('X')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Limits')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Motor')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Speed')).not.toBeInTheDocument()
  })

  it('has no anchor/position field of any kind (D23)', () => {
    render(<JointPropertiesSection joint={makeJoint()} />)
    expect(screen.queryByLabelText(/anchor/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/position/i)).not.toBeInTheDocument()
  })

  it("editing the axis while idle commits via updateJoint as a single undoable step", () => {
    const a = useSceneStore.getState().addObject(CUBE, 'A')
    const b = useSceneStore.getState().addObject(CUBE, 'B')
    const joint = useSceneStore.getState().createJoint(a.id, b.id, 'revolute')!
    useHistoryStore.setState({ undoStack: [], redoStack: [] })

    render(<JointPropertiesSection joint={joint} />)
    const xField = screen.getByLabelText('X')
    fireEvent.change(xField, { target: { value: '0' } })
    fireEvent.blur(xField)

    expect(useSceneStore.getState().joints[0].axis[0]).toBe(0)

    useHistoryStore.getState().undo()
    expect(useSceneStore.getState().joints[0].axis[0]).toBe(1)
  })

  it('while playing: Axis/Limits/Motor fields are disabled, but Motor Speed stays editable', () => {
    useSimulationStore.setState({ phase: 'playing' })
    render(<JointPropertiesSection joint={makeJoint()} />)

    expect(screen.getByLabelText('X')).toBeDisabled()
    expect(screen.getByLabelText('Limits')).toBeDisabled()
    expect(screen.getByLabelText('Motor')).toBeDisabled()
    expect(screen.getByLabelText('Speed')).toBeEnabled()
  })

  it('while paused: Motor Speed is also disabled, unlike while playing', () => {
    useSimulationStore.setState({ phase: 'paused' })
    render(<JointPropertiesSection joint={makeJoint()} />)

    expect(screen.getByLabelText('Speed')).toBeDisabled()
  })

  it('changing Motor Speed while playing updates the live joint immediately and pushes no undo entry (D2/D25)', () => {
    const a = useSceneStore.getState().addObject(CUBE, 'A')
    const b = useSceneStore.getState().addObject(CUBE, 'B')
    const joint = useSceneStore.getState().createJoint(a.id, b.id, 'revolute', { motor: { enabled: true, speed: 2 } })!
    useHistoryStore.setState({ undoStack: [], redoStack: [] })
    useSimulationStore.setState({ phase: 'playing' })

    render(<JointPropertiesSection joint={joint} />)
    const speedField = screen.getByLabelText('Speed')
    fireEvent.change(speedField, { target: { value: '5' } })
    fireEvent.blur(speedField)

    expect(useSceneStore.getState().joints[0].motor.speed).toBe(5)
    expect(useHistoryStore.getState().undoStack).toHaveLength(0)
  })

  it('toggling Limits shows Min/Max fields; unchecking reverts to unlimited', async () => {
    const user = userEvent.setup()
    const a = useSceneStore.getState().addObject(CUBE, 'A')
    const b = useSceneStore.getState().addObject(CUBE, 'B')
    const joint = useSceneStore.getState().createJoint(a.id, b.id, 'revolute')!

    function Wrapper() {
      const live = useSceneStore((s) => s.joints.find((j) => j.id === joint.id))!
      return <JointPropertiesSection joint={live} />
    }
    render(<Wrapper />)

    await user.click(screen.getByLabelText('Limits'))
    expect(screen.getByLabelText('Min')).toBeInTheDocument()
    expect(screen.getByLabelText('Max')).toBeInTheDocument()

    await user.click(screen.getByLabelText('Limits'))
    expect(screen.queryByLabelText('Min')).not.toBeInTheDocument()
    expect(useSceneStore.getState().joints[0].limits).toEqual({ min: null, max: null })
  })
})
