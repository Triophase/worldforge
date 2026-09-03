import { useEffect } from 'react'
import { useSceneStore } from '../state/sceneStore'

/**
 * D4: warns on tab close/navigation while the draft is dirty, via the
 * browser's own native prompt — no browser lets a page control that
 * prompt's text, so there is nothing else to build here. Reads
 * `isDirty` fresh at unload time rather than as a reactive value, so
 * this only needs to be wired once at the app root.
 */
export function useUnsavedChangesWarning() {
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!useSceneStore.getState().isDirty) return
      e.preventDefault()
      // Legacy browsers require a truthy returnValue to show the prompt.
      e.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])
}
