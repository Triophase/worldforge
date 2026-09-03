import RAPIER from '@dimforge/rapier3d-compat'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { Toolbar } from '../components/Toolbar/Toolbar'
import { useCameraViewStore } from '../state/cameraViewStore'
import { useDismissableMenuStore } from '../state/dismissableMenuStore'
import { useGizmoModeStore } from '../state/gizmoModeStore'
import { recordedAddObject, useHistoryStore } from '../state/historyStore'
import { usePersistenceStore } from '../state/persistenceStore'
import { usePlaybackBridgeStore } from '../state/playbackBridgeStore'
import { useSceneStore } from '../state/sceneStore'
import { useSimulationStore } from '../state/simulationStore'
import { useGlobalShortcuts } from './useGlobalShortcuts'

const CUBE = { kind: 'builtin' as const, key: 'primitive:cube' }

function Host() {
  useGlobalShortcuts()
  return <input aria-label="text field" />
}

describe('useGlobalShortcuts (D24, M8.2)', () => {
  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [], isDirty: false })
    useGizmoModeStore.setState({ mode: 'translate' })
    useSimulationStore.setState({ phase: 'idle', snapshot: null, elapsed: 0 })
    useHistoryStore.setState({ undoStack: [], redoStack: [] })
    useDismissableMenuStore.setState({ openCount: 0 })
    useCameraViewStore.setState({ presetRequest: null, frameRequest: null })
    usePlaybackBridgeStore.setState({ liveTransform: null })
    usePersistenceStore.setState({ sceneId: null, isOwner: false })
  })

  describe('gizmo mode (Q/W/E/R)', () => {
    it('W/E/R/Q set translate/rotate/scale/select respectively', async () => {
      const user = userEvent.setup()
      render(<Host />)

      await user.keyboard('e')
      expect(useGizmoModeStore.getState().mode).toBe('rotate')
      await user.keyboard('r')
      expect(useGizmoModeStore.getState().mode).toBe('scale')
      await user.keyboard('w')
      expect(useGizmoModeStore.getState().mode).toBe('translate')
      await user.keyboard('q')
      expect(useGizmoModeStore.getState().mode).toBe('select')
    })

    it('is case-insensitive', async () => {
      const user = userEvent.setup()
      render(<Host />)
      await user.keyboard('E')
      expect(useGizmoModeStore.getState().mode).toBe('rotate')
    })

    it('ignores the key when a modifier is held (e.g. Ctrl+R)', async () => {
      const user = userEvent.setup()
      render(<Host />)
      await user.keyboard('{Control>}r{/Control}')
      expect(useGizmoModeStore.getState().mode).toBe('translate')
    })
  })

  describe('delete / duplicate', () => {
    it('Delete removes the selection', async () => {
      const user = userEvent.setup()
      const obj = recordedAddObject(CUBE, 'Cube')!
      useSceneStore.getState().select(obj.id)
      render(<Host />)

      await user.keyboard('{Delete}')

      expect(useSceneStore.getState().objects).toHaveLength(0)
    })

    it('Backspace does the same as Delete', async () => {
      const user = userEvent.setup()
      const obj = recordedAddObject(CUBE, 'Cube')!
      useSceneStore.getState().select(obj.id)
      render(<Host />)

      await user.keyboard('{Backspace}')

      expect(useSceneStore.getState().objects).toHaveLength(0)
    })

    it('Ctrl/Cmd+D duplicates the current selection', async () => {
      const user = userEvent.setup()
      const obj = recordedAddObject(CUBE, 'Cube')!
      useSceneStore.getState().select(obj.id)
      render(<Host />)

      await user.keyboard('{Control>}d{/Control}')

      expect(useSceneStore.getState().objects).toHaveLength(2)
    })
  })

  describe('undo / redo', () => {
    it('Ctrl/Cmd+Z undoes the last action; Ctrl/Cmd+Shift+Z redoes it', async () => {
      const user = userEvent.setup()
      recordedAddObject(CUBE, 'Cube')
      render(<Host />)
      expect(useSceneStore.getState().objects).toHaveLength(1)

      await user.keyboard('{Control>}z{/Control}')
      expect(useSceneStore.getState().objects).toHaveLength(0)

      await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
      expect(useSceneStore.getState().objects).toHaveLength(1)
    })
  })

  describe('Space (Play/Pause toggle)', () => {
    it('toggles play/pause regardless of current phase', async () => {
      const user = userEvent.setup()
      render(<Host />)

      await user.keyboard(' ')
      expect(useSimulationStore.getState().phase).toBe('playing')

      await user.keyboard(' ')
      expect(useSimulationStore.getState().phase).toBe('paused')
    })
  })

  describe('F (frame camera on selection)', () => {
    it('requests a frame move when exactly one object is selected', async () => {
      const user = userEvent.setup()
      const obj = recordedAddObject(CUBE, 'Cube', { position: [3, 4, 5] })!
      useSceneStore.getState().select(obj.id)
      render(<Host />)

      await user.keyboard('f')

      expect(useCameraViewStore.getState().frameRequest?.position).toEqual([3, 4, 5])
    })

    it('prefers the live playback position while not idle', async () => {
      const user = userEvent.setup()
      const obj = recordedAddObject(CUBE, 'Cube', { position: [0, 0, 0] })!
      useSceneStore.getState().select(obj.id)
      usePlaybackBridgeStore.setState({
        liveTransform: { position: [9, 9, 9], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      })
      render(<Host />)

      await user.keyboard('f')

      expect(useCameraViewStore.getState().frameRequest?.position).toEqual([9, 9, 9])
    })

    it('does nothing with zero objects selected', async () => {
      const user = userEvent.setup()
      render(<Host />)
      await user.keyboard('f')
      expect(useCameraViewStore.getState().frameRequest).toBeNull()
    })

    it('does nothing with more than one object selected', async () => {
      const user = userEvent.setup()
      const a = recordedAddObject(CUBE, 'A')!
      const b = recordedAddObject(CUBE, 'B')!
      useSceneStore.getState().setSelection([a.id, b.id])
      render(<Host />)
      await user.keyboard('f')
      expect(useCameraViewStore.getState().frameRequest).toBeNull()
    })
  })

  describe('Escape', () => {
    it('deselects when nothing is open', async () => {
      const user = userEvent.setup()
      const obj = recordedAddObject(CUBE, 'Cube')!
      useSceneStore.getState().select(obj.id)
      render(<Host />)

      await user.keyboard('{Escape}')

      expect(useSceneStore.getState().selectedIds).toEqual([])
    })

    it('does not deselect when a dismissable menu is open — menu-close takes priority', async () => {
      const user = userEvent.setup()
      const obj = recordedAddObject(CUBE, 'Cube')!
      useSceneStore.getState().select(obj.id)
      useDismissableMenuStore.setState({ openCount: 1 })
      render(<Host />)

      await user.keyboard('{Escape}')

      expect(useSceneStore.getState().selectedIds).toEqual([obj.id])
    })

    it('M8.5 regression: closing the Share popover does not also clear the current selection', async () => {
      const obj = recordedAddObject(CUBE, 'Cube')!
      useSceneStore.getState().select(obj.id)
      usePersistenceStore.setState({ sceneId: 's1', isOwner: true })

      function ToolbarHost() {
        useGlobalShortcuts()
        return <Toolbar />
      }
      render(<ToolbarHost />)

      fireEvent.click(screen.getByRole('button', { name: 'Share' }))
      expect(screen.getByRole('dialog', { name: 'Share this scene' })).toBeInTheDocument()

      fireEvent.keyDown(document, { key: 'Escape' })

      expect(screen.queryByRole('dialog', { name: 'Share this scene' })).not.toBeInTheDocument()
      expect(useSceneStore.getState().selectedIds).toEqual([obj.id])
    })
  })

  describe('text-input safety', () => {
    it('Delete/Ctrl+D/Space do not fire while a text field is focused', async () => {
      const user = userEvent.setup()
      const obj = recordedAddObject(CUBE, 'Cube')!
      useSceneStore.getState().select(obj.id)
      render(<Host />)

      const input = screen.getByLabelText('text field')
      await user.click(input)
      await user.keyboard('{Delete}')
      await user.keyboard('{Control>}d{/Control}')
      await user.keyboard(' ')

      expect(useSceneStore.getState().objects).toHaveLength(1)
      expect(useSimulationStore.getState().phase).toBe('idle')
      expect(input).toHaveValue(' ') // the space reached the field itself
    })
  })

  describe('D2 play-lock (inherited, no new gating)', () => {
    it('Delete/Ctrl+D/undo have no effect while playing, but Space still toggles', async () => {
      const user = userEvent.setup()
      const obj = recordedAddObject(CUBE, 'Cube')!
      useSceneStore.getState().select(obj.id)
      useSimulationStore.setState({ phase: 'playing' })
      render(<Host />)

      await user.keyboard('{Delete}')
      expect(useSceneStore.getState().objects).toHaveLength(1)

      await user.keyboard('{Control>}d{/Control}')
      expect(useSceneStore.getState().objects).toHaveLength(1)

      await user.keyboard('{Control>}z{/Control}')
      expect(useSceneStore.getState().objects).toHaveLength(1)

      await user.keyboard(' ')
      expect(useSimulationStore.getState().phase).toBe('paused')
    })
  })
})
