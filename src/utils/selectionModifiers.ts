import type { SelectMode } from '../state/sceneStore'

interface ModifierKeys {
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}

/**
 * §9: Shift adds, Ctrl/Cmd toggles, no modifier replaces. Shared between
 * the viewport click handler and the Hierarchy row click handler so both
 * surfaces behave identically, per the task's explicit requirement.
 */
export function selectModeFromEvent(e: ModifierKeys): SelectMode {
  if (e.shiftKey) return 'add'
  if (e.ctrlKey || e.metaKey) return 'toggle'
  return 'replace'
}
