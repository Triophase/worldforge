import RAPIER from '@dimforge/rapier3d-compat'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSceneStore } from '../../state/sceneStore'
import { usePersistenceStore } from '../../state/persistenceStore'
import { MyScenesPanel } from './MyScenesPanel'

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('MyScenesPanel (§26/D33, M6.5)', () => {
  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [], isDirty: false })
    usePersistenceStore.setState({
      sceneId: null,
      isOwner: false,
      saveStatus: 'idle',
      lastSaveDocument: null,
      myScenesOpen: false,
      myScenes: null,
      listStatus: 'idle',
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders nothing when closed', () => {
    const { container } = render(<MyScenesPanel />)
    expect(container).toBeEmptyDOMElement()
  })

  it('lists each scene by name and last-updated time, with Open/Delete, and no image/thumbnail element', () => {
    usePersistenceStore.setState({
      myScenesOpen: true,
      listStatus: 'idle',
      myScenes: [{ id: 's1', name: 'Robot Arm Rig', updatedAt: '2026-01-01T00:00:00.000Z' }],
    })
    render(<MyScenesPanel />)

    const dialog = screen.getByRole('dialog', { name: 'My Scenes' })
    expect(within(dialog).getByText('Robot Arm Rig')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Open' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('img')).not.toBeInTheDocument()
  })

  it('shows the empty-state text and Add Asset/Upload/Demo shortcuts with zero saved scenes', () => {
    usePersistenceStore.setState({ myScenesOpen: true, listStatus: 'idle', myScenes: [] })
    render(<MyScenesPanel />)

    expect(screen.getByText("You haven't saved any scenes yet.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add Asset' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload CAD' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Falling Box' })).toBeInTheDocument()
  })

  it('clicking Open replaces the scene-store contents with the fetched scene', async () => {
    usePersistenceStore.setState({
      myScenesOpen: true,
      listStatus: 'idle',
      myScenes: [{ id: 's1', name: 'Saved', updatedAt: 'now' }],
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          id: 's1',
          isOwner: true,
          name: 'Saved',
          schemaVersion: 1,
          objects: [
            {
              id: 'obj-1',
              name: 'Loaded Object',
              assetRef: { kind: 'builtin', key: 'primitive:cube' },
              transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
              physics: { bodyType: 'static', mass: 1, friction: 0.5, restitution: 0.2, gravity: true },
            },
          ],
          joints: [],
          simulation: { speed: 1, snapping: { moveEnabled: true, moveSnap: 0.1, rotationEnabled: true, rotationSnapDeg: 15 } },
        }),
      ),
    )

    render(<MyScenesPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))

    await vi.waitFor(() => expect(useSceneStore.getState().objects).toHaveLength(1))
    expect(useSceneStore.getState().objects[0].name).toBe('Loaded Object')
    expect(usePersistenceStore.getState().myScenesOpen).toBe(false) // closes itself once the open succeeds
  })

  it('clicking Delete removes the row, and it stays gone', async () => {
    usePersistenceStore.setState({
      myScenesOpen: true,
      listStatus: 'idle',
      myScenes: [
        { id: 's1', name: 'A', updatedAt: 'now' },
        { id: 's2', name: 'B', updatedAt: 'now' },
      ],
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })))

    render(<MyScenesPanel />)
    const rowA = screen.getByText('A').closest('li')!
    fireEvent.click(within(rowA).getByRole('button', { name: 'Delete' }))

    await vi.waitFor(() => expect(screen.queryByText('A')).not.toBeInTheDocument())
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(usePersistenceStore.getState().myScenes).toEqual([{ id: 's2', name: 'B', updatedAt: 'now' }])
  })

  it('shows a loading indicator while the list is being fetched', () => {
    usePersistenceStore.setState({ myScenesOpen: true, listStatus: 'loading', myScenes: null })
    render(<MyScenesPanel />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('the Close button hides the panel', () => {
    usePersistenceStore.setState({ myScenesOpen: true, listStatus: 'idle', myScenes: [] })
    render(<MyScenesPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(usePersistenceStore.getState().myScenesOpen).toBe(false)
  })

  describe('D15/M6.8: backend-down resilience', () => {
    it('a failed list fetch shows an inline error with Retry — not an empty list, not a frozen panel', () => {
      usePersistenceStore.setState({ myScenesOpen: true, listStatus: 'error', myScenes: null })
      render(<MyScenesPanel />)

      expect(screen.getByRole('alert')).toHaveTextContent(/couldn't reach the server/i)
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
      expect(screen.queryByText("You haven't saved any scenes yet.")).not.toBeInTheDocument()
    })

    it('clicking Retry on a failed list re-fetches and shows the list on success', async () => {
      usePersistenceStore.setState({ myScenesOpen: true, listStatus: 'error', myScenes: null })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([{ id: 's1', name: 'Recovered', updatedAt: 'now' }])))

      render(<MyScenesPanel />)
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

      await vi.waitFor(() => expect(screen.getByText('Recovered')).toBeInTheDocument())
    })

    it('a failed Open shows a row-level error and leaves the current draft (and the list) untouched', async () => {
      useSceneStore.getState().addObject({ kind: 'builtin', key: 'primitive:cube' }, 'Still Editing')
      usePersistenceStore.setState({
        myScenesOpen: true,
        listStatus: 'idle',
        myScenes: [{ id: 's1', name: 'Saved', updatedAt: 'now' }],
      })
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

      render(<MyScenesPanel />)
      fireEvent.click(screen.getByRole('button', { name: 'Open' }))

      await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/couldn't open this scene/i))
      expect(usePersistenceStore.getState().myScenesOpen).toBe(true) // panel stays open, unlike a successful Open
      expect(useSceneStore.getState().objects[0].name).toBe('Still Editing') // untouched
    })

    it('a failed Delete shows a row-level error and the row stays in the list', async () => {
      usePersistenceStore.setState({
        myScenesOpen: true,
        listStatus: 'idle',
        myScenes: [{ id: 's1', name: 'A', updatedAt: 'now' }],
      })
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

      render(<MyScenesPanel />)
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

      await vi.waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/couldn't delete this scene/i))
      expect(screen.getByText('A')).toBeInTheDocument() // still there
      expect(usePersistenceStore.getState().myScenes).toEqual([{ id: 's1', name: 'A', updatedAt: 'now' }])
    })
  })
})
