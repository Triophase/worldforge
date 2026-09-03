import { useSceneStore } from '../../state/sceneStore'
import { EmptyStateActions } from './EmptyStateActions'
import styles from './EmptyState.module.css'

/**
 * §23: shown whenever the current scene has zero objects (a fresh New
 * Scene, or every object deleted) — a viewport **overlay**, not a route
 * change; the toolbar and side panels stay visible and functional
 * underneath/around it. `EmptyStateActions` (`M6.5`, factored out of
 * this file) is the shared "+ Add Asset / Upload CAD / try a demo" row —
 * also reused by the My Scenes panel's own empty state.
 */
export function EmptyState() {
  const isEmpty = useSceneStore((s) => s.objects.length === 0)
  if (!isEmpty) return null

  return (
    <div className={styles.overlay} role="region" aria-label="Empty scene">
      <p className={styles.message}>No objects in this scene yet.</p>
      <EmptyStateActions />
    </div>
  )
}
