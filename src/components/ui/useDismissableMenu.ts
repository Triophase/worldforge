import { useEffect } from 'react'
import type { RefObject } from 'react'
import { useDismissableMenuStore } from '../../state/dismissableMenuStore'

/**
 * `M0.2`'s `Dropdown` close behavior (outside click, `Escape`), factored
 * out so `M8.1`'s right-click context menu can reuse the exact same
 * dismissal semantics rather than reimplementing them — the task's own
 * explicit requirement. `containerRef` should be the menu's own root
 * element; a click landing outside it closes the menu. Also registers
 * into `dismissableMenuStore`'s open count while `open` — `M8.2`'s
 * global `Escape` shortcut reads that count to know whether *some*
 * dismissable menu is open, without needing to know which one.
 */
export function useDismissableMenu(open: boolean, onClose: () => void, containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return

    useDismissableMenuStore.setState((s) => ({ openCount: s.openCount + 1 }))

    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      useDismissableMenuStore.setState((s) => ({ openCount: s.openCount - 1 }))
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose, containerRef])
}
