import RAPIER from '@dimforge/rapier3d-compat'
import { fireEvent, render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadScene } from '../../engine/physics/physicsStore'
import { useSceneStore } from '../../state/sceneStore'
import { useSimulationStore } from '../../state/simulationStore'
import { TransportBar } from './TransportBar'

const dir = dirname(fileURLToPath(import.meta.url))

describe('TransportBar (§16/§17, M3.4/M3.5)', () => {
  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [] })
    useSimulationStore.setState({ phase: 'idle', snapshot: null, speed: 1, elapsed: 0 })
    loadScene([])
  })

  it('M8.2: Play and Pause both show the Space shortcut in their tooltip', async () => {
    render(<TransportBar />)

    fireEvent.focus(screen.getByRole('button', { name: 'Play' }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Play (Space)')

    fireEvent.blur(screen.getByRole('button', { name: 'Play' }))
    fireEvent.focus(screen.getByRole('button', { name: 'Pause' }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Pause (Space)')
  })

  it('M8.3: Play/Pause each get the transport-toggle highlight class, swapping which is "active" as phase changes', () => {
    render(<TransportBar />)
    expect(screen.getByRole('button', { name: 'Play' }).className).toMatch(/playPauseButton/)
    expect(screen.getByRole('button', { name: 'Pause' }).className).toMatch(/playPauseButton/)

    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled() // no longer the "active" highlighted one
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled()
  })

  it('M8.3: the Play/Pause highlight transition uses the shared 150-250ms theme token, never a hardcoded duration', () => {
    const css = readFileSync(join(dir, 'TransportBar.module.css'), 'utf-8')
    const rule = css.slice(css.indexOf('.playPauseButton {'), css.indexOf('.playPauseButton:not'))
    expect(rule).toContain('var(--transition-fast)')
    expect(rule).not.toMatch(/\d+ms/)
  })

  it('while idle: Play is enabled, Pause and Reset are disabled', () => {
    render(<TransportBar />)
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled()
  })

  it('clicking Play transitions to playing: Play disables, Pause and Reset enable', () => {
    render(<TransportBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))

    expect(useSimulationStore.getState().phase).toBe('playing')
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Reset' })).toBeEnabled()
  })

  it('clicking Pause while playing transitions to paused: Play re-enables, Pause disables, Reset stays enabled', () => {
    render(<TransportBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))

    expect(useSimulationStore.getState().phase).toBe('paused')
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reset' })).toBeEnabled()
  })

  it('clicking Reset returns to idle: Reset disables again', () => {
    render(<TransportBar />)
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    expect(useSimulationStore.getState().phase).toBe('idle')
    expect(screen.getByRole('button', { name: 'Play' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled()
  })

  describe('speed selector (M3.5)', () => {
    it('1x is pressed by default; all four speeds are always enabled, including while playing', () => {
      useSimulationStore.setState({ phase: 'playing' })
      render(<TransportBar />)

      expect(screen.getByRole('button', { name: '1x' })).toHaveAttribute('aria-pressed', 'true')
      for (const speed of ['0.25x', '0.5x', '2x']) {
        expect(screen.getByRole('button', { name: speed })).toHaveAttribute('aria-pressed', 'false')
        expect(screen.getByRole('button', { name: speed })).toBeEnabled()
      }
    })

    it('clicking a speed commits it to the store and updates which button is pressed', () => {
      render(<TransportBar />)
      fireEvent.click(screen.getByRole('button', { name: '2x' }))

      expect(useSimulationStore.getState().speed).toBe(2)
      expect(screen.getByRole('button', { name: '2x' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: '1x' })).toHaveAttribute('aria-pressed', 'false')
    })
  })

  it('renders the Timeline (elapsed-time display) — see Timeline.test.tsx for its own behavior', () => {
    useSimulationStore.setState({ elapsed: 4.3 })
    render(<TransportBar />)
    expect(screen.getByText('04.30s')).toBeInTheDocument()
  })

  it('M8.5/§9: the active speed is signaled by more than color alone (bold weight, not just a background swap)', () => {
    const css = readFileSync(join(dir, 'TransportBar.module.css'), 'utf-8')
    const rule = css.slice(css.indexOf(".speedButton[aria-pressed='true']"))
    expect(rule).toMatch(/font-weight:\s*700/)
  })
})
