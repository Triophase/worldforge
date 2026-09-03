import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSnappingStore } from '../../state/snappingStore'
import { SnappingControls } from './SnappingControls'

describe('SnappingControls (§20/M2.8)', () => {
  beforeEach(() => {
    useSnappingStore.setState({
      moveEnabled: true,
      moveSnap: 0.1,
      rotationEnabled: true,
      rotationSnapDeg: 15,
    })
  })

  it('shows the default increments', () => {
    render(<SnappingControls />)
    expect(screen.getByText('Move snap')).toBeInTheDocument()
    expect(screen.getByText('Rotation snap')).toBeInTheDocument()
    const spinbuttons = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    expect(spinbuttons[0]).toHaveValue(0.1)
    expect(spinbuttons[1]).toHaveValue(15)
  })

  it('toggling the move-snap checkbox flips the store', async () => {
    const user = userEvent.setup()
    render(<SnappingControls />)

    await user.click(screen.getByRole('checkbox', { name: 'Move snap' }))
    expect(useSnappingStore.getState().moveEnabled).toBe(false)
  })

  it('toggling the rotation-snap checkbox flips the store', async () => {
    const user = userEvent.setup()
    render(<SnappingControls />)

    await user.click(screen.getByRole('checkbox', { name: 'Rotation snap' }))
    expect(useSnappingStore.getState().rotationEnabled).toBe(false)
  })

  it('committing a new move-snap increment updates the store', async () => {
    const user = userEvent.setup()
    render(<SnappingControls />)

    const [moveIncrement] = screen.getAllByRole('spinbutton')
    await user.clear(moveIncrement)
    await user.type(moveIncrement, '0.5')
    await user.keyboard('{Enter}')

    expect(useSnappingStore.getState().moveSnap).toBe(0.5)
  })
})
