import type { MouseEvent as ReactMouseEvent } from 'react'
import { Panel } from '../../components/ui'
import { useContextMenuStore } from '../../state/contextMenuStore'
import { recordedRenameObject } from '../../state/historyStore'
import { useRenameRequestStore } from '../../state/renameRequestStore'
import type { JointEntity, JointType, SceneObject } from '../../state/sceneStore'
import { useSceneStore } from '../../state/sceneStore'
import { useSimulationStore } from '../../state/simulationStore'
import { useCommitOnBlur } from '../../utils/useCommitOnBlur'
import { selectModeFromEvent } from '../../utils/selectionModifiers'
import styles from './SceneHierarchyPanel.module.css'

interface HierarchyRowProps {
  object: SceneObject
  isSelected: boolean
  editing: boolean
  onSelect: (e: ReactMouseEvent) => void
  onContextMenu: (e: ReactMouseEvent) => void
  onStartEdit: () => void
  onStopEdit: () => void
}

function HierarchyRow({ object, isSelected, editing, onSelect, onContextMenu, onStartEdit, onStopEdit }: HierarchyRowProps) {
  const field = useCommitOnBlur(object.name, (name) => recordedRenameObject(object.id, name))

  if (editing) {
    return (
      <span className={isSelected ? styles.rowSelected : styles.row}>
        <span className={styles.indicator} aria-hidden />
        <input
          className={styles.rowInput}
          autoFocus
          aria-label={`Rename ${object.name}`}
          value={field.draft}
          onChange={field.onChange}
          onBlur={() => {
            field.onBlur()
            onStopEdit()
          }}
          onKeyDown={(e) => {
            field.onKeyDown(e)
            if (e.key === 'Escape') onStopEdit()
          }}
        />
      </span>
    )
  }

  return (
    <button
      type="button"
      className={isSelected ? styles.rowSelected : styles.row}
      onClick={onSelect}
      onDoubleClick={onStartEdit}
      onContextMenu={onContextMenu}
    >
      {/* Leading indicator — never rely on background fill alone (§9/§29). */}
      <span className={styles.indicator} aria-hidden />
      <span className={styles.rowLabel}>{object.name}</span>
    </button>
  )
}

const JOINT_TYPE_LABEL: Record<JointType, string> = {
  fixed: 'Fixed',
  revolute: 'Revolute',
  prismatic: 'Prismatic',
}

/**
 * D19: a joint's Hierarchy row is a **display convention only** — nested
 * under whichever object was Object A at creation, never a real
 * parent-child transform relationship. Clicking it selects the joint
 * itself (M4.3's new selection kind, `sceneStore.selectJoint`) — no
 * rename, no multi-select modifiers (§15/§19 never describe either for
 * a joint row), just a plain click like an object row's own `onClick`.
 */
function JointRow({ joint, isSelected, onSelect }: { joint: JointEntity; isSelected: boolean; onSelect: () => void }) {
  return (
    <button type="button" className={isSelected ? styles.jointRowSelected : styles.jointRow} onClick={onSelect}>
      <span className={styles.indicator} aria-hidden />
      <span className={styles.rowLabel}>Joint ({JOINT_TYPE_LABEL[joint.type]})</span>
    </button>
  )
}

/**
 * The Scene Hierarchy (idea.md §8): a flat, always-current list of every
 * object (D19 — the scene is flat) plus, nested under each object, any
 * joint whose `objectA` it is (M4.1's display-only nesting — see
 * `JointRow`). Reflects and drives `sceneStore.selectedIds`, including
 * §9's shift/ctrl-click multi-select (M2.7) — identical semantics to the
 * viewport's own click handler. A joint row is independently clickable
 * (M4.3) into `sceneStore.selectedJointId` — a different, mutually
 * exclusive selection kind (no multi-select modifiers for joints, §19
 * never describes any).
 */
export function SceneHierarchyPanel() {
  const objects = useSceneStore((s) => s.objects)
  const joints = useSceneStore((s) => s.joints)
  const selectedIds = useSceneStore((s) => s.selectedIds)
  const selectedJointId = useSceneStore((s) => s.selectedJointId)
  const select = useSceneStore((s) => s.select)
  const selectJoint = useSceneStore((s) => s.selectJoint)
  const clearSelection = useSceneStore((s) => s.clearSelection)
  const editingId = useRenameRequestStore((s) => s.requestedId)
  const requestRename = useRenameRequestStore((s) => s.requestRename)
  const clearRenameRequest = useRenameRequestStore((s) => s.clearRequest)

  // §21/D40: identical gating to the viewport's own context-menu entry
  // point (`SceneObjects.tsx`) — no menu at all while the simulation
  // isn't idle (D2's edit lock covers every item the menu could open).
  function handleRowContextMenu(e: ReactMouseEvent, id: string) {
    e.preventDefault()
    if (useSimulationStore.getState().phase !== 'idle') return
    if (!useSceneStore.getState().selectedIds.includes(id)) {
      select(id, 'replace')
    }
    useContextMenuStore.getState().openMenu(e.clientX, e.clientY)
  }

  return (
    <Panel className={styles.panel} role="region" aria-label="Scene Hierarchy">
      <h2 className={styles.title}>Scene</h2>
      <div
        className={styles.list}
        onClick={(e) => {
          // Only empty space (a click that lands on this container itself,
          // not bubbled up from a row button) clears the selection.
          if (e.target === e.currentTarget) clearSelection()
        }}
        onContextMenu={(e) => {
          // D40: right-clicking empty space (reached only when no row's
          // own handler already stopped propagation) deselects and shows
          // no menu, exactly matching the left-click case above.
          if (e.target === e.currentTarget) clearSelection()
        }}
      >
        {objects.map((object) => (
          <div key={object.id}>
            <HierarchyRow
              object={object}
              isSelected={selectedIds.includes(object.id)}
              editing={editingId === object.id}
              onSelect={(e) => select(object.id, selectModeFromEvent(e))}
              onContextMenu={(e) => handleRowContextMenu(e, object.id)}
              onStartEdit={() => requestRename(object.id)}
              onStopEdit={clearRenameRequest}
            />
            {joints
              .filter((joint) => joint.objectA === object.id)
              .map((joint) => (
                <JointRow
                  key={joint.id}
                  joint={joint}
                  isSelected={selectedJointId === joint.id}
                  onSelect={() => selectJoint(joint.id)}
                />
              ))}
          </div>
        ))}
      </div>
    </Panel>
  )
}
