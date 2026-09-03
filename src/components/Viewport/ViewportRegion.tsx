import type { MouseEvent as ReactMouseEvent } from 'react'
import { SceneCanvas } from '../../engine/renderer/SceneCanvas'
import { useSceneStore } from '../../state/sceneStore'
import { EmptyState } from './EmptyState'
import { GizmoModeToolbar } from './GizmoModeToolbar'
import { SnappingControls } from './SnappingControls'
import styles from './ViewportRegion.module.css'

/**
 * Center viewport region. No `Panel` chrome, per idea.md §3 (the viewport
 * isn't boxed like a panel). Hosts M1.1's live R3F canvas plus a top-left
 * DOM overlay stack: M2.6's gizmo-mode toolbar and M2.8's snapping
 * controls (§20 doesn't pin an exact location beyond "near the gizmo
 * controls" being a sensible free choice), and M3.7's `EmptyState`
 * overlay (renders `null` whenever the scene isn't empty).
 */
export function ViewportRegion() {
  const clearSelection = useSceneStore((s) => s.clearSelection)

  // D40/`M8.1`: reached only when a right-click hit no object — every
  // mesh's own `onContextMenu` (`SceneObjects.tsx`/`UploadedObjectMesh.tsx`)
  // stops propagation, at both the R3F and native DOM level, before this
  // native handler on the wrapper div (the single `<canvas>` element's
  // own contextmenu event bubbles here regardless of R3F's internal
  // raycast routing) ever sees the event. Exactly matches what a
  // left-click on empty space already does (`SceneCanvas`'s own
  // `onPointerMissed`) — deselect, no menu.
  function handleEmptySpaceContextMenu(e: ReactMouseEvent) {
    e.preventDefault()
    clearSelection()
  }

  return (
    <div
      className={styles.viewport}
      role="region"
      aria-label="Viewport"
      onContextMenu={handleEmptySpaceContextMenu}
    >
      <SceneCanvas />
      <div className={styles.overlayStack}>
        <GizmoModeToolbar />
        <SnappingControls />
      </div>
      <EmptyState />
    </div>
  )
}
