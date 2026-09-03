import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSimulationStore } from '../../state/simulationStore'
import { Timeline } from './Timeline'

describe('Timeline (D30, idea.md §17, M3.5)', () => {
  beforeEach(() => {
    useSimulationStore.setState({ phase: 'idle', snapshot: null, speed: 1, elapsed: 0 })
  })

  it('shows 00.00s by default', () => {
    render(<Timeline />)
    expect(screen.getByText('00.00s')).toBeInTheDocument()
  })

  it('formats elapsed seconds as zero-padded MM.SSs', () => {
    useSimulationStore.setState({ elapsed: 4.3 })
    render(<Timeline />)
    expect(screen.getByText('04.30s')).toBeInTheDocument()
  })

  it('has no fixed cap — a large elapsed value is shown in full, not clamped', () => {
    useSimulationStore.setState({ elapsed: 123.456 })
    render(<Timeline />)
    expect(screen.getByText('123.46s')).toBeInTheDocument()
  })

  it('is not interactive: click and drag events produce no store change', () => {
    useSimulationStore.setState({ elapsed: 4.3 })
    render(<Timeline />)
    const timeline = screen.getByText('04.30s')

    fireEvent.click(timeline)
    fireEvent.mouseDown(timeline)
    fireEvent.mouseMove(timeline)
    fireEvent.mouseUp(timeline)

    expect(useSimulationStore.getState().elapsed).toBe(4.3)
    expect(useSimulationStore.getState().phase).toBe('idle')
  })

  it('updates live as elapsed changes (e.g. while playing)', () => {
    render(<Timeline />)
    expect(screen.getByText('00.00s')).toBeInTheDocument()

    act(() => useSimulationStore.setState({ elapsed: 1.5 }))

    expect(screen.getByText('01.50s')).toBeInTheDocument()
  })
})
