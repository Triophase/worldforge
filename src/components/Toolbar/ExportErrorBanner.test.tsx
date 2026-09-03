import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useExportStore } from '../../state/exportScene'
import { ExportErrorBanner } from './ExportErrorBanner'

describe('ExportErrorBanner (M7.1, §25/D15)', () => {
  beforeEach(() => {
    useExportStore.setState({ status: 'idle', errorMessage: null })
  })

  it('renders nothing while idle or exporting', () => {
    useExportStore.setState({ status: 'idle' })
    expect(render(<ExportErrorBanner />).container).toBeEmptyDOMElement()

    useExportStore.setState({ status: 'exporting' })
    expect(render(<ExportErrorBanner />).container).toBeEmptyDOMElement()
  })

  it('shows the specific error message with Retry and Dismiss actions', () => {
    useExportStore.setState({ status: 'error', errorMessage: "Couldn't reach the server to fetch an uploaded model for export. Try again." })
    render(<ExportErrorBanner />)

    expect(screen.getByRole('alert')).toHaveTextContent(/uploaded model for export/i)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
  })

  it('clicking Retry calls exportScene() again', () => {
    useExportStore.setState({ status: 'error', errorMessage: 'x' })
    const exportSpy = vi.fn().mockResolvedValue(undefined)
    useExportStore.setState({ exportScene: exportSpy })

    render(<ExportErrorBanner />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(exportSpy).toHaveBeenCalledTimes(1)
  })

  it('clicking Dismiss clears the error', () => {
    useExportStore.setState({ status: 'error', errorMessage: 'x' })
    render(<ExportErrorBanner />)

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(useExportStore.getState().status).toBe('idle')
  })
})
