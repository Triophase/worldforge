import { useEffect, useState } from 'react'
import { DRAWER_BREAKPOINT } from './panelSizing'

/**
 * `M8.4`/§28: a **live**, reactive layout-mode signal — re-evaluated on
 * every `resize`, not a one-time check at mount — so narrowing/widening
 * the window switches Assets/Properties between inline and drawer mode
 * without a reload (state-architecture's own requirement). Reads
 * `window.innerWidth` directly rather than `matchMedia`, matching this
 * codebase's existing `useResizablePanels.ts` precedent for reading live
 * window width.
 */
export function useIsNarrowViewport(): boolean {
  const [isNarrow, setIsNarrow] = useState(() => window.innerWidth < DRAWER_BREAKPOINT)

  useEffect(() => {
    function handleResize() {
      setIsNarrow(window.innerWidth < DRAWER_BREAKPOINT)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return isNarrow
}
