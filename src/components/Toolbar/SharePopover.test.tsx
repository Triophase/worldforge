import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePersistenceStore } from '../../state/persistenceStore'
import { SharePopover } from './SharePopover'

function stubClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  return writeText
}

describe('SharePopover (D32, M6.7)', () => {
  beforeEach(() => {
    usePersistenceStore.setState({
      sceneId: null,
      isOwner: false,
      saveStatus: 'idle',
      lastSaveDocument: null,
      myScenesOpen: false,
      myScenes: null,
      listStatus: 'idle',
      linkOpenStatus: 'idle',
    })
    vi.useRealTimers()
  })

  it('is disabled for a never-saved draft (no server id)', () => {
    render(<SharePopover />)
    expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled()
  })

  it('clicking a disabled Share button never opens a popover', () => {
    render(<SharePopover />)
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('is enabled once the scene has a server id, and opens a popover with the correct URL', () => {
    usePersistenceStore.setState({ sceneId: 'abc-123' })
    render(<SharePopover />)

    const button = screen.getByRole('button', { name: 'Share' })
    expect(button).toBeEnabled()

    fireEvent.click(button)
    const link = screen.getByRole('textbox', { name: 'Shareable link' })
    expect(link).toHaveValue(`${window.location.origin}/scene/abc-123`)
  })

  it('is enabled for a non-owned scene too — D32 does not gate sharing on ownership', () => {
    usePersistenceStore.setState({ sceneId: 'abc-123', isOwner: false })
    render(<SharePopover />)
    expect(screen.getByRole('button', { name: 'Share' })).toBeEnabled()
  })

  it('Copy places the exact URL on the clipboard and shows a reverting confirmation', () => {
    vi.useFakeTimers()
    const writeText = stubClipboard()
    usePersistenceStore.setState({ sceneId: 'abc-123' })
    render(<SharePopover />)

    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    fireEvent.click(screen.getByRole('button', { name: /copy/i }))

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/scene/abc-123`)
    expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(screen.getByRole('button', { name: /^copy$/i })).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('Save alone never touches the clipboard — only Copy does', async () => {
    const writeText = stubClipboard()
    usePersistenceStore.setState({ sceneId: null })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'abc-123', isOwner: true, name: 'x' }), { status: 201 })),
    )

    await usePersistenceStore.getState().save({
      schemaVersion: 1,
      name: 'x',
      objects: [],
      joints: [],
      simulation: { speed: 1, snapping: { moveEnabled: true, moveSnap: 0.1, rotationEnabled: true, rotationSnapDeg: 15 } },
    })

    expect(writeText).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
