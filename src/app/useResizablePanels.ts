import { useCallback, useRef, useState } from 'react'
import { ASSETS_MAX, ASSETS_MIN, PROPERTIES_MAX, PROPERTIES_MIN, clampPanelWidth } from './panelSizing'

function currentTotalWidth(): number {
  return typeof window !== 'undefined' ? window.innerWidth : 1600
}

/** Drives the Assets/Properties panel widths and their drag-to-resize handles. */
export function useResizablePanels() {
  const [assetsWidth, setAssetsWidth] = useState(ASSETS_MIN + 60)
  const [propertiesWidth, setPropertiesWidth] = useState(PROPERTIES_MIN + 60)

  // Always-current snapshot, read from inside long-lived listener closures
  // instead of depending on `assetsWidth`/`propertiesWidth` directly (which
  // would force re-subscribing listeners, or reading stale values, on every
  // resize).
  const widths = useRef({ assetsWidth, propertiesWidth })
  widths.current = { assetsWidth, propertiesWidth }

  const startDragging = useCallback(
    (side: 'assets' | 'properties') => (e: React.MouseEvent) => {
      const startX = e.clientX
      const startWidth = side === 'assets' ? widths.current.assetsWidth : widths.current.propertiesWidth

      function handleMove(ev: MouseEvent) {
        const total = currentTotalWidth()
        if (side === 'assets') {
          const delta = ev.clientX - startX
          setAssetsWidth(
            clampPanelWidth(startWidth + delta, ASSETS_MIN, ASSETS_MAX, widths.current.propertiesWidth, total),
          )
        } else {
          const delta = startX - ev.clientX
          setPropertiesWidth(
            clampPanelWidth(startWidth + delta, PROPERTIES_MIN, PROPERTIES_MAX, widths.current.assetsWidth, total),
          )
        }
      }

      function handleUp() {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
      }

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
    },
    [],
  )

  return {
    assetsWidth,
    propertiesWidth,
    startAssetsDrag: startDragging('assets'),
    startPropertiesDrag: startDragging('properties'),
  }
}
