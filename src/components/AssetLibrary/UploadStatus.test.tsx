import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUploadedAssetsStore } from '../../state/uploadedAssetsStore'
import { UploadStatus } from './UploadStatus'

describe('UploadStatus (§24/§25/§29, M5.6)', () => {
  beforeEach(() => {
    useUploadedAssetsStore.setState({ uploads: [], lastUploadError: null, lastUploadErrorReason: null, progress: null })
  })

  it('renders nothing while idle', () => {
    const { container } = render(<UploadStatus onRetry={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a determinate progress bar while uploading, never an indeterminate spinner state', () => {
    useUploadedAssetsStore.setState({ progress: 40 })
    render(<UploadStatus onRetry={vi.fn()} />)

    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', '40')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
  })

  it('shows the mapped error message and an icon, not color alone (§29)', () => {
    useUploadedAssetsStore.setState({
      lastUploadError: '"huge.glb" is over the 25MB upload limit. Try a smaller file.',
      lastUploadErrorReason: 'oversized',
    })
    render(<UploadStatus onRetry={vi.fn()} />)

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('25MB')
    expect(alert.querySelector('svg')).toBeInTheDocument() // the icon, alongside the text
  })

  it('"Try Another File" calls the retry callback', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    useUploadedAssetsStore.setState({ lastUploadError: 'nope', lastUploadErrorReason: 'corrupt' })
    render(<UploadStatus onRetry={onRetry} />)

    await user.click(screen.getByRole('button', { name: 'Try Another File' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('an error state takes precedence over a stale progress value', () => {
    useUploadedAssetsStore.setState({ progress: 50, lastUploadError: 'nope', lastUploadErrorReason: 'unsupported' })
    render(<UploadStatus onRetry={vi.fn()} />)

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
})
