import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useOnboardingStore } from '../../state/firstTimeStore'
import { FirstTimeHint } from './FirstTimeHint'

describe('FirstTimeHint (§18, M3.7)', () => {
  beforeEach(() => {
    useOnboardingStore.setState({ showHint: false })
  })

  it('renders nothing when showHint is false', () => {
    render(<FirstTimeHint />)
    expect(screen.queryByText('Press Play to start the simulation.')).not.toBeInTheDocument()
  })

  it('shows the exact hint text when showHint is true', () => {
    useOnboardingStore.setState({ showHint: true })
    render(<FirstTimeHint />)
    expect(screen.getByText('Press Play to start the simulation.')).toBeInTheDocument()
  })
})
