import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { useGizmoModeStore } from '../../state/gizmoModeStore'
import { GizmoModeToolbar } from './GizmoModeToolbar'

const dir = dirname(fileURLToPath(import.meta.url))

describe('GizmoModeToolbar (D24 on-screen equivalent, idea.md §30)', () => {
  beforeEach(() => {
    useGizmoModeStore.setState({ mode: 'translate' })
  })

  it('marks the current mode button pressed', () => {
    render(<GizmoModeToolbar />)
    expect(screen.getByRole('button', { name: /Translate/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /Rotate/ })).toHaveAttribute('aria-pressed', 'false')
  })

  it('clicking a mode button sets the store mode', async () => {
    const user = userEvent.setup()
    render(<GizmoModeToolbar />)

    await user.click(screen.getByRole('button', { name: /Rotate/ }))
    expect(useGizmoModeStore.getState().mode).toBe('rotate')

    await user.click(screen.getByRole('button', { name: /Select/ }))
    expect(useGizmoModeStore.getState().mode).toBe('select')
  })

  it('all four modes are reachable by button', () => {
    render(<GizmoModeToolbar />)
    expect(screen.getByRole('button', { name: /Select \(Q\)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Translate \(W\)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rotate \(E\)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Scale \(R\)/ })).toBeInTheDocument()
  })

  it('M8.5/§9: the active mode is signaled by more than color alone (an outline ring, not just a background swap)', () => {
    const css = readFileSync(join(dir, 'GizmoModeToolbar.module.css'), 'utf-8')
    const rule = css.slice(css.indexOf(".button[aria-pressed='true']"))
    expect(rule).toMatch(/outline:/)
  })
})
