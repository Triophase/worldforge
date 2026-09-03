import RAPIER from '@dimforge/rapier3d-compat'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePersistenceStore } from '../../state/persistenceStore'
import { ShareLinkStatusOverlay } from './ShareLinkStatusOverlay'

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('ShareLinkStatusOverlay (D17, M6.6)', () => {
  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    usePersistenceStore.setState({ linkOpenStatus: 'idle' })
    window.history.replaceState(null, '', '/')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders nothing while idle or loading', () => {
    usePersistenceStore.setState({ linkOpenStatus: 'idle' })
    expect(render(<ShareLinkStatusOverlay />).container).toBeEmptyDOMElement()

    usePersistenceStore.setState({ linkOpenStatus: 'loading' })
    expect(render(<ShareLinkStatusOverlay />).container).toBeEmptyDOMElement()
  })

  it('shows an explicit "deleted" message', () => {
    usePersistenceStore.setState({ linkOpenStatus: 'deleted' })
    render(<ShareLinkStatusOverlay />)
    expect(screen.getByText(/deleted by its owner/i)).toBeInTheDocument()
  })

  it('shows a distinct "not-found" message', () => {
    usePersistenceStore.setState({ linkOpenStatus: 'not-found' })
    render(<ShareLinkStatusOverlay />)
    expect(screen.getByText(/doesn't point to a real scene/i)).toBeInTheDocument()
    expect(screen.queryByText(/deleted by its owner/i)).not.toBeInTheDocument()
  })

  it('dismissing clears linkOpenStatus and resets the URL', () => {
    window.history.replaceState(null, '', '/scene/abc-123')
    usePersistenceStore.setState({ linkOpenStatus: 'not-found' })
    render(<ShareLinkStatusOverlay />)

    fireEvent.click(screen.getByRole('button', { name: 'Start a New Scene' }))

    expect(usePersistenceStore.getState().linkOpenStatus).toBe('idle')
    expect(window.location.pathname).toBe('/')
  })

  describe('D15/M6.8: backend-down resilience', () => {
    it('shows a Retry action for a generic connectivity "error" — unlike deleted/not-found', () => {
      usePersistenceStore.setState({ linkOpenStatus: 'error' })
      render(<ShareLinkStatusOverlay />)

      expect(screen.getByText(/couldn't reach the server/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    })

    it('deleted/not-found never show a Retry action — retrying would just reproduce the same real outcome', () => {
      usePersistenceStore.setState({ linkOpenStatus: 'deleted' })
      render(<ShareLinkStatusOverlay />)
      expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    })

    it('clicking Retry re-opens the same id from the URL and succeeds once the backend is back', async () => {
      window.history.replaceState(null, '', '/scene/abc-123')
      usePersistenceStore.setState({ linkOpenStatus: 'error' })
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          jsonResponse({
            id: 'abc-123',
            isOwner: true,
            name: 'Recovered',
            schemaVersion: 1,
            objects: [],
            joints: [],
            simulation: { speed: 1, snapping: { moveEnabled: true, moveSnap: 0.1, rotationEnabled: true, rotationSnapDeg: 15 } },
          }),
        ),
      )

      render(<ShareLinkStatusOverlay />)
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

      await vi.waitFor(() => expect(usePersistenceStore.getState().linkOpenStatus).toBe('idle'))
      expect(usePersistenceStore.getState().sceneId).toBe('abc-123')
    })
  })
})
