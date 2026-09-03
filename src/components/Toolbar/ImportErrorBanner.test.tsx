import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useImportStore } from '../../state/importStore'
import { ImportErrorBanner } from './ImportErrorBanner'

describe('ImportErrorBanner (M7.2, §25/§27)', () => {
  beforeEach(() => {
    useImportStore.setState({ status: 'idle', errorMessage: null })
  })

  it('renders nothing while idle or importing', () => {
    useImportStore.setState({ status: 'idle' })
    expect(render(<ImportErrorBanner />).container).toBeEmptyDOMElement()

    useImportStore.setState({ status: 'importing' })
    expect(render(<ImportErrorBanner />).container).toBeEmptyDOMElement()
  })

  it('shows the specific error message with a Dismiss action and no Retry', () => {
    useImportStore.setState({ status: 'error', errorMessage: "This file isn't a valid scene export." })
    render(<ImportErrorBanner />)

    expect(screen.getByRole('alert')).toHaveTextContent(/valid scene export/i)
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })

  it('clicking Dismiss clears the error', () => {
    useImportStore.setState({ status: 'error', errorMessage: 'x' })
    render(<ImportErrorBanner />)

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(useImportStore.getState().status).toBe('idle')
  })
})
