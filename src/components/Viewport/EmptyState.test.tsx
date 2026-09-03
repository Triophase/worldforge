import RAPIER from '@dimforge/rapier3d-compat'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadScene } from '../../engine/physics/physicsStore'
import { useSceneStore } from '../../state/sceneStore'
import { EmptyState } from './EmptyState'

const CUBE = { kind: 'builtin' as const, key: 'primitive:cube' }

describe('EmptyState (§23, M3.7)', () => {
  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [], isDirty: false })
    loadScene([])
    vi.restoreAllMocks()
  })

  it('shows the overlay with its three action groups when the scene is empty', () => {
    render(<EmptyState />)
    expect(screen.getByRole('region', { name: 'Empty scene' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add Asset' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Upload CAD' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Falling Box' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Bouncing Ball' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rotating Wheel' })).toBeInTheDocument()
  })

  it('renders nothing when the scene has at least one object', () => {
    useSceneStore.getState().addObject(CUBE, 'Cube')
    render(<EmptyState />)
    expect(screen.queryByRole('region', { name: 'Empty scene' })).not.toBeInTheDocument()
  })

  it('"Upload CAD" and all three demo shortcuts are enabled (M4.6/M5.1)', () => {
    render(<EmptyState />)
    expect(screen.getByRole('button', { name: 'Upload CAD' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Falling Box' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Bouncing Ball' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Rotating Wheel' })).toBeEnabled()
  })

  it('"Upload CAD" opens the native file picker (M5.1)', () => {
    render(<EmptyState />)
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})

    fireEvent.click(screen.getByRole('button', { name: 'Upload CAD' }))

    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('"Bouncing Ball" loads its demo', () => {
    render(<EmptyState />)
    fireEvent.click(screen.getByRole('button', { name: 'Bouncing Ball' }))
    expect(useSceneStore.getState().objects.map((o) => o.name).sort()).toEqual(['Ball', 'Platform'])
  })

  it('"Rotating Wheel" loads its demo', () => {
    render(<EmptyState />)
    fireEvent.click(screen.getByRole('button', { name: 'Rotating Wheel' }))
    expect(useSceneStore.getState().objects.map((o) => o.name).sort()).toEqual(['Axle', 'Wheel'])
  })

  it('"+ Add Asset" moves focus to the Assets panel search input', () => {
    document.body.innerHTML += '<input id="asset-library-search" aria-label="Search assets" />'
    render(<EmptyState />)

    fireEvent.click(screen.getByRole('button', { name: '+ Add Asset' }))

    expect(document.getElementById('asset-library-search')).toHaveFocus()
  })

  it('"Falling Box" loads the demo immediately when the draft is clean', () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    render(<EmptyState />)

    fireEvent.click(screen.getByRole('button', { name: 'Falling Box' }))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(useSceneStore.getState().objects.map((o) => o.name).sort()).toEqual(['Box', 'Ground', 'Platform'])
  })

  it('"Falling Box" prompts before loading when the draft is dirty, and respects cancellation', () => {
    useSceneStore.setState({ isDirty: true })
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<EmptyState />)

    fireEvent.click(screen.getByRole('button', { name: 'Falling Box' }))

    expect(useSceneStore.getState().objects).toEqual([])
  })
})
