import { NumberField } from '../../components/ui'
import { useSnappingStore } from '../../state/snappingStore'
import styles from './SnappingControls.module.css'

/**
 * §20's move-snap/rotation-snap toggles and increment fields. Placed
 * alongside `GizmoModeToolbar` (a free layout choice — the spec doesn't
 * pin an exact location). Applies only to gizmo drags (`SceneObjects.tsx`
 * reads this store at drag-end); typing into a Properties field is never
 * affected, regardless of these settings.
 */
export function SnappingControls() {
  const moveEnabled = useSnappingStore((s) => s.moveEnabled)
  const moveSnap = useSnappingStore((s) => s.moveSnap)
  const rotationEnabled = useSnappingStore((s) => s.rotationEnabled)
  const rotationSnapDeg = useSnappingStore((s) => s.rotationSnapDeg)
  const toggleMoveEnabled = useSnappingStore((s) => s.toggleMoveEnabled)
  const toggleRotationEnabled = useSnappingStore((s) => s.toggleRotationEnabled)
  const setMoveSnap = useSnappingStore((s) => s.setMoveSnap)
  const setRotationSnapDeg = useSnappingStore((s) => s.setRotationSnapDeg)

  return (
    <div className={styles.panel} role="group" aria-label="Snapping">
      <div className={styles.row}>
        <label className={styles.toggleLabel}>
          <input type="checkbox" checked={moveEnabled} onChange={toggleMoveEnabled} />
          Move snap
        </label>
        <NumberField label="units" value={moveSnap} onCommit={setMoveSnap} />
      </div>
      <div className={styles.row}>
        <label className={styles.toggleLabel}>
          <input type="checkbox" checked={rotationEnabled} onChange={toggleRotationEnabled} />
          Rotation snap
        </label>
        <NumberField label="deg" value={rotationSnapDeg} onCommit={setRotationSnapDeg} />
      </div>
    </div>
  )
}
