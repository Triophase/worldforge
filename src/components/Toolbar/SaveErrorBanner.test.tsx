import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePersistenceStore } from '../../state/persistenceStore'
import { SaveErrorBanner } from './SaveErrorBanner'

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

const DOCUMENT = {
  schemaVersion: 1 as const,
  name: 'x',
  objects: [],
  joints: [],
  simulation: { speed: 1, snapping: { moveEnabled: true, moveSnap: 0.1, rotationEnabled: true, rotationSnapDeg: 15 } },
}

describe('SaveErrorBanner (D15/D8, M6.8)', () => {
  beforeEach(() => {
    usePersistenceStore.setState({
      sceneId: null,
      isOwner: false,
      saveStatus: 'idle',
      lastSaveDocument: null,
      saveErrorMessage: null,
      myScenesOpen: false,
      myScenes: null,
      listStatus: 'idle',
      linkOpenStatus: 'idle',
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders nothing while idle or saving', () => {
    usePersistenceStore.setState({ saveStatus: 'idle' })
    expect(render(<SaveErrorBanner />).container).toBeEmptyDOMElement()

    usePersistenceStore.setState({ saveStatus: 'saving' })
    expect(render(<SaveErrorBanner />).container).toBeEmptyDOMElement()
  })

  it('shows a generic backend-down message with a Retry action for "error"', () => {
    usePersistenceStore.setState({ saveStatus: 'error' })
    render(<SaveErrorBanner />)

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't reach the server/i)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('shows a distinct permission-denied message with no Retry action for "forbidden"', () => {
    usePersistenceStore.setState({ saveStatus: 'forbidden' })
    render(<SaveErrorBanner />)

    expect(screen.getByRole('alert')).toHaveTextContent(/don't have permission/i)
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })

  it('M6.10: shows the specific asset-cap message when saveErrorMessage is set, instead of the generic one', () => {
    usePersistenceStore.setState({
      saveStatus: 'error',
      saveErrorMessage: 'This device has exceeded its 200MB total upload storage — the scene was not saved.',
    })
    render(<SaveErrorBanner />)

    expect(screen.getByRole('alert')).toHaveTextContent(/200MB/)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('clicking Retry resubmits the last save document and succeeds once the backend is back', async () => {
    usePersistenceStore.setState({ saveStatus: 'error', lastSaveDocument: DOCUMENT })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ ...DOCUMENT, id: 's1', isOwner: true, createdAt: 'now', updatedAt: 'now' }, { status: 201 })),
    )

    render(<SaveErrorBanner />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await vi.waitFor(() => expect(usePersistenceStore.getState().saveStatus).toBe('idle'))
    expect(usePersistenceStore.getState().sceneId).toBe('s1')
  })

  it('clicking Dismiss clears the error without discarding lastSaveDocument', () => {
    usePersistenceStore.setState({ saveStatus: 'error', lastSaveDocument: DOCUMENT })
    render(<SaveErrorBanner />)

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))

    expect(usePersistenceStore.getState().saveStatus).toBe('idle')
    expect(usePersistenceStore.getState().lastSaveDocument).toEqual(DOCUMENT)
  })
})
