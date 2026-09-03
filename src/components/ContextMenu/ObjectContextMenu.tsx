import { useRef } from 'react'
import { useDismissableMenu } from '../ui/useDismissableMenu'
import { useContextMenuStore } from '../../state/contextMenuStore'
import { recordedDuplicateObjects, recordedRemoveObjects, recordedUpdatePhysics } from '../../state/historyStore'
import { useGizmoModeStore } from '../../state/gizmoModeStore'
import { useJointCreationRequestStore } from '../../state/jointCreationRequestStore'
import { useRenameRequestStore } from '../../state/renameRequestStore'
import { useSceneStore } from '../../state/sceneStore'
import styles from './ObjectContextMenu.module.css'

/** D29: exactly what switching Body Type to Dynamic in the Physics section itself would set — "Add Physics" is shorthand for this, not a separate mechanism. */
const ADD_PHYSICS_DEFAULTS = { bodyType: 'dynamic' as const, mass: 1.0, friction: 0.5, restitution: 0.2, gravity: true }

/**
 * `M8.1`/§21: the seven-item right-click menu, mounted once
 * (`AppShell.tsx`) and positioned at whatever `clientX`/`clientY` the
 * triggering right-click reported (`contextMenuStore`). Reads
 * `sceneStore.selectedIds` **live**, not a snapshot passed at open time
 * — the right-click handlers that call `openMenu` have already done any
 * select-first work (§21) before this ever renders, so by the time this
 * mounts, selection already reflects the target. §9: a multi-selection
 * shows only Duplicate/Delete; every item is otherwise the exact same
 * call its on-screen equivalent already makes (M2.6/M2.7/M3.2/M4.2) —
 * no new business logic lives here. Play-lock (D2) is enforced by every
 * right-click handler refusing to call `openMenu` at all while not
 * `idle` (this component itself never checks simulation phase), and,
 * redundantly, by every `recorded*` action's own `isEditLocked()` guard.
 */
export function ObjectContextMenu() {
  const open = useContextMenuStore((s) => s.open)
  const x = useContextMenuStore((s) => s.x)
  const y = useContextMenuStore((s) => s.y)
  const closeMenu = useContextMenuStore((s) => s.closeMenu)
  const selectedIds = useSceneStore((s) => s.selectedIds)
  const setGizmoMode = useGizmoModeStore((s) => s.setMode)
  const requestRename = useRenameRequestStore((s) => s.requestRename)
  const requestJointCreation = useJointCreationRequestStore((s) => s.requestJointCreation)
  const menuRef = useRef<HTMLDivElement>(null)

  useDismissableMenu(open, closeMenu, menuRef)

  if (!open || selectedIds.length === 0) return null

  const isMulti = selectedIds.length > 1
  const soleId = selectedIds[0]!

  function runAndClose(action: () => void) {
    action()
    closeMenu()
  }

  return (
    <div ref={menuRef} className={styles.menu} role="menu" style={{ left: x, top: y }}>
      {!isMulti && (
        <>
          <button type="button" role="menuitem" className={styles.item} onClick={() => runAndClose(() => setGizmoMode('translate'))}>
            Move
          </button>
          <button type="button" role="menuitem" className={styles.item} onClick={() => runAndClose(() => setGizmoMode('rotate'))}>
            Rotate
          </button>
        </>
      )}
      <button type="button" role="menuitem" className={styles.item} onClick={() => runAndClose(() => recordedDuplicateObjects(selectedIds))}>
        Duplicate
      </button>
      {!isMulti && (
        <>
          <button type="button" role="menuitem" className={styles.item} onClick={() => runAndClose(() => requestRename(soleId))}>
            Rename
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => runAndClose(() => recordedUpdatePhysics(soleId, ADD_PHYSICS_DEFAULTS))}
          >
            Add Physics
          </button>
          <button type="button" role="menuitem" className={styles.item} onClick={() => runAndClose(() => requestJointCreation(soleId))}>
            Add Joint
          </button>
        </>
      )}
      <button type="button" role="menuitem" className={styles.item} onClick={() => runAndClose(() => recordedRemoveObjects(selectedIds))}>
        Delete
      </button>
    </div>
  )
}
