import { useEffect } from 'react'
import { useCameraViewStore } from '../state/cameraViewStore'
import { useDismissableMenuStore } from '../state/dismissableMenuStore'
import type { GizmoMode } from '../state/gizmoModeStore'
import { useGizmoModeStore } from '../state/gizmoModeStore'
import { recordedDuplicateObjects, recordedRemoveObjects, useHistoryStore } from '../state/historyStore'
import { usePlaybackBridgeStore } from '../state/playbackBridgeStore'
import { useSceneStore } from '../state/sceneStore'
import { useSimulationStore } from '../state/simulationStore'

const KEY_TO_GIZMO_MODE: Record<string, GizmoMode> = {
  q: 'select',
  w: 'translate',
  e: 'rotate',
  r: 'scale',
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
}

/**
 * D24's full shortcut set, wired **once** at the app root so every
 * binding works regardless of which panel currently has focus — folding
 * `M2.6`'s original per-component Q/W/E/R wiring into this same global
 * handler (not a second, parallel mechanism) alongside the rest. Every
 * key routes to the exact action/handler its on-screen control already
 * calls; this hook adds no new gating logic of its own — D2's play-lock
 * and every other existing precondition are inherited unchanged because
 * they live inside the actions themselves (`recordedRemoveObjects`/
 * `recordedDuplicateObjects` already refuse via `isEditLocked()`).
 *
 * `Ctrl`+`Z`/`Ctrl`+`D` are checked **before** the generic "any modifier
 * held → ignore" bail the single-key shortcuts (Q/W/E/R/Delete/Space/F)
 * use — those two are the only D24 bindings that themselves *require* a
 * modifier.
 */
export function useGlobalShortcuts() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isTextEntryTarget(e.target)) return

      const key = e.key.toLowerCase()
      const mod = e.metaKey || e.ctrlKey

      if (key === 'escape') {
        // D24: closing an open context menu/dropdown takes priority over
        // deselecting. Each such menu already closes itself on this same
        // keypress via its own `useDismissableMenu` listener — this just
        // skips the deselect branch when one is about to.
        if (useDismissableMenuStore.getState().openCount > 0) return
        useSceneStore.getState().clearSelection()
        return
      }

      if (mod && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) useHistoryStore.getState().redo()
        else useHistoryStore.getState().undo()
        return
      }

      if (mod && key === 'd') {
        e.preventDefault()
        recordedDuplicateObjects(useSceneStore.getState().selectedIds)
        return
      }

      // Every remaining D24 binding is a bare key — a held modifier here
      // means this keystroke means something else (a browser/OS
      // shortcut, or simply not one of ours).
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const gizmoMode = KEY_TO_GIZMO_MODE[key]
      if (gizmoMode) {
        e.preventDefault()
        useGizmoModeStore.getState().setMode(gizmoMode)
        return
      }

      if (key === 'delete' || key === 'backspace') {
        e.preventDefault()
        recordedRemoveObjects(useSceneStore.getState().selectedIds)
        return
      }

      if (key === ' ') {
        e.preventDefault() // don't also scroll the page
        const { phase, play, pause } = useSimulationStore.getState()
        if (phase === 'playing') pause()
        else play()
        return
      }

      if (key === 'f') {
        // No single defined target for zero or multiple selected objects.
        const selectedIds = useSceneStore.getState().selectedIds
        if (selectedIds.length !== 1) return
        const object = useSceneStore.getState().objects.find((o) => o.id === selectedIds[0])
        if (!object) return
        // Prefer the object's live (physics-driven) position while the
        // simulation isn't idle — matches the Properties panel's own
        // `livePlaybackTransform ?? object.transform` precedent (D3/M3.4).
        const live = usePlaybackBridgeStore.getState().liveTransform
        useCameraViewStore.getState().requestFrame(live?.position ?? object.transform.position)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
