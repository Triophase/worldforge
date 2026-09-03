import { useState } from 'react'
import { Button, NumberField } from '../../components/ui'
import { recordedCreateJoint } from '../../state/historyStore'
import { useJointCreationRequestStore } from '../../state/jointCreationRequestStore'
import type { JointLimits, JointMotor, JointType } from '../../state/sceneStore'
import { hasJointBetween, useSceneStore } from '../../state/sceneStore'
import styles from './PropertiesPanel.module.css'

const AXES = ['X', 'Y', 'Z'] as const

const JOINT_TYPES: { value: JointType; label: string }[] = [
  { value: 'fixed', label: 'Fixed' },
  { value: 'revolute', label: 'Revolute' },
  { value: 'prismatic', label: 'Prismatic' },
]

/** §15's defaults, mirroring `sceneStore.createJoint`'s own — this form pre-fills with the same values `createJoint` would default to unedited. */
function defaultAxisFor(type: JointType): [number, number, number] {
  return type === 'prismatic' ? [0, 1, 0] : [1, 0, 0]
}

/**
 * §15's Add Joint flow: select Object A (the panel's current single
 * selection, passed in) → Add Joint → choose type → choose Object B
 * (§14's exclusions) → for Revolute/Prismatic, review/edit Axis/Limits/
 * Motor → Create, as one undoable step (D25, via `recordedCreateJoint`).
 * All of this component's field state is local, ephemeral form state —
 * never written to `sceneStore` until Create is pressed; Cancel (or
 * collapsing back to the trigger button) discards it with no mutation
 * and no undo entry. Whether the form is open at all, though, is lifted
 * into `jointCreationRequestStore` (`M8.1`) — the context menu's Add
 * Joint item needs a second entry point into this same open state from
 * a sibling component, not just this file's own trigger button.
 */
export function JointCreationFlow({ objectAId, disabled }: { objectAId: string; disabled: boolean }) {
  const objects = useSceneStore((s) => s.objects)
  const joints = useSceneStore((s) => s.joints)
  const requestedObjectAId = useJointCreationRequestStore((s) => s.requestedObjectAId)
  const requestJointCreation = useJointCreationRequestStore((s) => s.requestJointCreation)
  const clearJointCreationRequest = useJointCreationRequestStore((s) => s.clearRequest)
  const open = requestedObjectAId === objectAId

  const [type, setType] = useState<JointType | ''>('')
  const [objectBId, setObjectBId] = useState('')
  const [axis, setAxis] = useState<[number, number, number]>([1, 0, 0])
  const [limitsEnabled, setLimitsEnabled] = useState(false)
  const [limits, setLimits] = useState<JointLimits>({ min: -1, max: 1 })
  const [motor, setMotor] = useState<JointMotor>({ enabled: false, speed: 0 })

  function reset() {
    clearJointCreationRequest()
    setType('')
    setObjectBId('')
    setAxis([1, 0, 0])
    setLimitsEnabled(false)
    setLimits({ min: -1, max: 1 })
    setMotor({ enabled: false, speed: 0 })
  }

  function handleTypeChange(next: JointType | '') {
    setType(next)
    setObjectBId('')
    if (next) setAxis(defaultAxisFor(next))
  }

  function handleCreate() {
    if (!type || !objectBId) return
    recordedCreateJoint(objectAId, objectBId, type, {
      axis,
      limits: limitsEnabled ? limits : { min: null, max: null },
      motor,
    })
    reset()
  }

  if (!open) {
    return (
      <div className={styles.section}>
        <Button onClick={() => requestJointCreation(objectAId)} disabled={disabled}>
          Add Joint
        </Button>
      </div>
    )
  }

  const objectBOptions = objects.filter(
    (o) => o.id !== objectAId && !hasJointBetween(joints, objectAId, o.id),
  )

  return (
    <section className={styles.section} aria-label="Add Joint">
      <h3 className={styles.sectionTitle}>Add Joint</h3>

      <div className={styles.row}>
        <span className={styles.rowLabel}>Type</span>
        <select
          className={styles.select}
          aria-label="Joint Type"
          value={type}
          onChange={(e) => handleTypeChange(e.target.value as JointType | '')}
        >
          <option value="">Select type…</option>
          {JOINT_TYPES.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {type && (
        <div className={styles.row}>
          <span className={styles.rowLabel}>Object B</span>
          <select
            className={styles.select}
            aria-label="Object B"
            value={objectBId}
            onChange={(e) => setObjectBId(e.target.value)}
          >
            <option value="">Select object…</option>
            {objectBOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {type && type !== 'fixed' && objectBId && (
        <>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Axis</span>
            {AXES.map((label, i) => (
              <NumberField
                key={label}
                label={label}
                value={axis[i]}
                onCommit={(value) => setAxis((a) => a.map((v, idx) => (idx === i ? value : v)) as [number, number, number])}
              />
            ))}
          </div>

          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={limitsEnabled}
              onChange={(e) => setLimitsEnabled(e.target.checked)}
            />
            Limits
          </label>
          {limitsEnabled && (
            <div className={styles.row}>
              <NumberField label="Min" value={limits.min ?? 0} onCommit={(value) => setLimits((l) => ({ ...l, min: value }))} />
              <NumberField label="Max" value={limits.max ?? 0} onCommit={(value) => setLimits((l) => ({ ...l, max: value }))} />
            </div>
          )}

          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={motor.enabled}
              onChange={(e) => setMotor((m) => ({ ...m, enabled: e.target.checked }))}
            />
            Motor
          </label>
          {motor.enabled && (
            <div className={styles.row}>
              <NumberField label="Speed" value={motor.speed} onCommit={(value) => setMotor((m) => ({ ...m, speed: value }))} />
            </div>
          )}
        </>
      )}

      <div className={styles.headerActions}>
        <Button onClick={handleCreate} className={styles.headerButton} disabled={!type || !objectBId}>
          Create
        </Button>
        <Button onClick={reset} className={styles.headerButton}>
          Cancel
        </Button>
      </div>
    </section>
  )
}
