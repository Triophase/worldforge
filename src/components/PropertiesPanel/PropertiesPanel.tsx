import { Copy, Trash2 } from 'lucide-react'
import { Button, NumberField, Panel, Tooltip } from '../../components/ui'
import { useGizmoDragStore } from '../../state/gizmoDragStore'
import {
  recordedDuplicateObjects,
  recordedRemoveObjects,
  recordedRenameObject,
  recordedUpdatePhysics,
  recordedUpdateTransform,
} from '../../state/historyStore'
import { usePlaybackBridgeStore } from '../../state/playbackBridgeStore'
import type { BodyType, PhysicsProps, Transform } from '../../state/sceneStore'
import { useSceneStore } from '../../state/sceneStore'
import { useSimulationStore } from '../../state/simulationStore'
import { eulerDegreesToQuaternion, quaternionToEulerDegrees } from '../../utils/eulerQuaternion'
import { modifierKeyLabel } from '../../utils/platform'
import { useCommitOnBlur } from '../../utils/useCommitOnBlur'
import { CollapsibleSection } from './CollapsibleSection'
import { JointCreationFlow } from './JointCreationFlow'
import { JointPropertiesSection } from './JointPropertiesSection'
import styles from './PropertiesPanel.module.css'

const AXES = ['X', 'Y', 'Z'] as const

const BODY_TYPES: { value: BodyType; label: string }[] = [
  { value: 'static', label: 'Static' },
  { value: 'dynamic', label: 'Dynamic' },
  { value: 'kinematic', label: 'Kinematic' },
]

/**
 * Right panel: header (Name field for a single selection, "N objects
 * selected" otherwise, plus Duplicate/Delete acting on the whole
 * selection — M2.7), the Transform section (Position/Rotation/Scale,
 * M2.6), the Physics section (Body Type/Mass/Friction/Restitution/
 * Gravity, M3.2, always shown since every object has a body per D29),
 * and the Joint section (M4.3) — shown automatically alongside
 * Transform/Physics when the selected object is the endpoint of
 * exactly one joint, or as the panel's *only* content when a joint's
 * own Hierarchy row is directly selected (`sceneStore.selectedJointId`,
 * a selection kind mutually exclusive with `selectedIds`, per D19). All
 * sections show only for exactly one selection (§9).
 */
export function PropertiesPanel() {
  const objects = useSceneStore((s) => s.objects)
  const joints = useSceneStore((s) => s.joints)
  const selectedIds = useSceneStore((s) => s.selectedIds)
  const selectedJointId = useSceneStore((s) => s.selectedJointId)
  const setSelection = useSceneStore((s) => s.setSelection)
  const clearSelection = useSceneStore((s) => s.clearSelection)
  const liveTransform = useGizmoDragStore((s) => s.liveTransform)
  // D2: read-only, live-updating display while the simulation isn't idle
  // — sceneStore's own transform is never touched during play (§13), so
  // `PlaybackSync` is the only source for the object's *current* pose.
  const livePlaybackTransform = usePlaybackBridgeStore((s) => s.liveTransform)
  const isLocked = useSimulationStore((s) => s.phase !== 'idle')

  const object = selectedIds.length === 1 ? objects.find((o) => o.id === selectedIds[0]) : undefined
  const nameField = useCommitOnBlur(object?.name ?? '', (name) => object && recordedRenameObject(object.id, name))

  if (selectedJointId) {
    const joint = joints.find((j) => j.id === selectedJointId)
    return (
      <Panel className={styles.panel} role="region" aria-label="Properties">
        {joint && <JointPropertiesSection joint={joint} />}
      </Panel>
    )
  }

  function handleDuplicate() {
    // §9/state-architecture: one call covering the whole selection, so
    // M2.9's undo stack sees a single entry per gesture, not one per id.
    // The result of duplicating becomes the new selection, matching a
    // fresh add-then-select elsewhere in the spec.
    const duplicates = recordedDuplicateObjects(selectedIds)
    setSelection(duplicates.map((d) => d.id))
  }

  function handleDelete() {
    recordedRemoveObjects(selectedIds)
    clearSelection()
  }

  if (selectedIds.length === 0) {
    return (
      <Panel className={styles.panel} role="region" aria-label="Properties">
        <p className={styles.placeholder}>No object selected</p>
      </Panel>
    )
  }

  if (!object) {
    // selectedIds.length > 1
    return (
      <Panel className={styles.panel} role="region" aria-label="Properties">
        <div className={styles.header}>
          <span className={styles.multiLabel}>{selectedIds.length} objects selected</span>
          <div className={styles.headerActions}>
            <Tooltip label={`Duplicate (${modifierKeyLabel()}+D)`}>
              <Button onClick={handleDuplicate} className={styles.headerButton} disabled={isLocked}>
                <Copy size={14} aria-hidden /> Duplicate
              </Button>
            </Tooltip>
            <Tooltip label="Delete (Delete)">
              <Button onClick={handleDelete} className={styles.headerButton} disabled={isLocked}>
                <Trash2 size={14} aria-hidden /> Delete
              </Button>
            </Tooltip>
          </div>
        </div>
      </Panel>
    )
  }

  const transform = livePlaybackTransform ?? liveTransform ?? object.transform
  const rotationDegrees = quaternionToEulerDegrees(transform.rotation)

  function commit(patch: Partial<Transform>) {
    recordedUpdateTransform(object!.id, patch)
  }

  function commitPositionAxis(axis: number, value: number) {
    const position = [...transform.position] as [number, number, number]
    position[axis] = value
    commit({ position })
  }

  function commitRotationAxis(axis: number, value: number) {
    const degrees = [...rotationDegrees] as [number, number, number]
    degrees[axis] = value
    commit({ rotation: eulerDegreesToQuaternion(degrees) })
  }

  function commitScaleAxis(axis: number, value: number) {
    const scale = [...transform.scale] as [number, number, number]
    scale[axis] = value
    commit({ scale })
  }

  function commitPhysics(patch: Partial<PhysicsProps>) {
    recordedUpdatePhysics(object!.id, patch)
  }

  // §19: auto-shown only when unambiguous — an endpoint of more than one
  // joint means the others are reached via their own Hierarchy rows instead.
  const endpointJoints = joints.filter((j) => j.objectA === object.id || j.objectB === object.id)
  const autoJoint = endpointJoints.length === 1 ? endpointJoints[0] : undefined

  return (
    <Panel className={styles.panel} role="region" aria-label="Properties">
      <div className={styles.header}>
        <input
          className={styles.nameInput}
          aria-label="Object name"
          value={nameField.draft}
          disabled={isLocked}
          onChange={nameField.onChange}
          onFocus={nameField.onFocus}
          onBlur={nameField.onBlur}
          onKeyDown={nameField.onKeyDown}
        />
        <div className={styles.headerActions}>
          <Tooltip label={`Duplicate (${modifierKeyLabel()}+D)`}>
            <Button onClick={handleDuplicate} className={styles.headerButton} disabled={isLocked}>
              <Copy size={14} aria-hidden /> Duplicate
            </Button>
          </Tooltip>
          <Tooltip label="Delete (Delete)">
            <Button onClick={handleDelete} className={styles.headerButton} disabled={isLocked}>
              <Trash2 size={14} aria-hidden /> Delete
            </Button>
          </Tooltip>
        </div>
      </div>

      <CollapsibleSection title="Transform">
        <div className={styles.row}>
          <span className={styles.rowLabel}>Position</span>
          {AXES.map((axis, i) => (
            <NumberField
              key={axis}
              label={axis}
              value={transform.position[i]}
              onCommit={(value) => commitPositionAxis(i, value)}
              disabled={isLocked}
            />
          ))}
        </div>

        <div className={styles.row}>
          <span className={styles.rowLabel}>Rotation</span>
          {AXES.map((axis, i) => (
            <NumberField
              key={axis}
              label={axis}
              value={rotationDegrees[i]}
              onCommit={(value) => commitRotationAxis(i, value)}
              disabled={isLocked}
            />
          ))}
        </div>

        <div className={styles.row}>
          <span className={styles.rowLabel}>Scale</span>
          {AXES.map((axis, i) => (
            <NumberField
              key={axis}
              label={axis}
              value={transform.scale[i]}
              onCommit={(value) => commitScaleAxis(i, value)}
              disabled={isLocked}
            />
          ))}
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Physics">
        <div className={styles.row}>
          <span className={styles.rowLabel}>Body Type</span>
          <select
            className={styles.select}
            aria-label="Body Type"
            value={object.physics.bodyType}
            disabled={isLocked}
            onChange={(e) => commitPhysics({ bodyType: e.target.value as BodyType })}
          >
            {BODY_TYPES.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.row}>
          <NumberField
            label="Mass"
            value={object.physics.mass}
            onCommit={(value) => commitPhysics({ mass: Math.max(0.01, value) })}
            disabled={isLocked}
          />
        </div>

        <div className={styles.row}>
          <NumberField
            label="Friction"
            value={object.physics.friction}
            onCommit={(value) => commitPhysics({ friction: Math.max(0, value) })}
            disabled={isLocked}
          />
        </div>

        <div className={styles.row}>
          <NumberField
            label="Restitution"
            value={object.physics.restitution}
            onCommit={(value) => commitPhysics({ restitution: Math.min(1, Math.max(0, value)) })}
            disabled={isLocked}
          />
        </div>

        <label className={styles.toggleLabel}>
          <input
            type="checkbox"
            checked={object.physics.gravity}
            disabled={isLocked}
            onChange={(e) => commitPhysics({ gravity: e.target.checked })}
          />
          Gravity
        </label>
      </CollapsibleSection>

      {autoJoint && <JointPropertiesSection joint={autoJoint} />}

      <JointCreationFlow objectAId={object.id} disabled={isLocked} />
    </Panel>
  )
}
