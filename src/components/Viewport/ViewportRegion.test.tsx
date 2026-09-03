import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useContextMenuStore } from '../../state/contextMenuStore'
import { useSceneStore } from '../../state/sceneStore'
import { ViewportRegion } from './ViewportRegion'

describe('ViewportRegion', () => {
  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [] })
    useContextMenuStore.setState({ open: false, x: 0, y: 0 })
  })

  it('mounts exactly one canvas element inside the viewport region', () => {
    render(<ViewportRegion />)
    const region = screen.getByRole('region', { name: 'Viewport' })
    const canvases = region.querySelectorAll('canvas')
    expect(canvases).toHaveLength(1)
  })

  it('survives a simulated resize of its container without throwing', () => {
    render(<ViewportRegion />)
    const region = screen.getByRole('region', { name: 'Viewport' })
    expect(() => {
      Object.defineProperty(region, 'clientWidth', { value: 400, configurable: true })
      Object.defineProperty(region, 'clientHeight', { value: 300, configurable: true })
      window.dispatchEvent(new Event('resize'))
    }).not.toThrow()
  })

  it('M8.1/D40: right-clicking empty viewport space clears the selection and opens no context menu', () => {
    useSceneStore.setState({ selectedIds: ['obj-1'] })
    render(<ViewportRegion />)
    const region = screen.getByRole('region', { name: 'Viewport' })

    fireEvent.contextMenu(region)

    expect(useSceneStore.getState().selectedIds).toEqual([])
    expect(useContextMenuStore.getState().open).toBe(false)
  })
})
