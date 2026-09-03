import { NumberField } from '../../components/ui'
import { recordedUpdateJoint } from '../../state/historyStore'
import type { JointEntity, JointType } from '../../state/sceneStore'
import { useSceneStore } from '../../state/sceneStore'
import { useSimulationStore } from '../../state/simulationStore'
import { CollapsibleSection } from './CollapsibleSection'
import styles from './PropertiesPanel.module.css'

const AXES = ['X', 'Y', 'Z'] as const

const JOINT_TYPE_LABEL: Record<JointType, string> = {
  fixed: 'Fixed',
  revolute: 'Revolute',
  prismatic: 'Prismatic',
}

/**
 * §19's Joint section: Type (read-only — D23, type can't change after
 * creation, only delete-and-recreate via `M4.2`'s flow), and for
 * Revolute/Prismatic, Axis/Limits/Motor/Speed. A Fixed joint shows only
 * Type (§14 — no configurable properties beyond its two objects).
 * Rendered both as the auto-shown section alongside Transform/Physics
 * (a selected object with exactly one joint) and as the sole content of
 * the panel when a joint's own Hierarchy row is directly selected —
 * `PropertiesPanel.tsx` decides which; this component only renders the
 * fields.
 */
export function JointPropertiesSection({ joint }: { joint: JointEntity }) {
  const phase = useSimulationStore((s) => s.phase)
  // D2: every field locks while not idle, **except** Motor Speed, which
  // per this task's own named exception stays live while `playing` —
  // still locked while `paused` alongside everything else (no verification-
  // loop step exercises Speed while paused, and "no other field gets this
  // exception" reads most consistently as scoped to `playing` specifically).
  const fieldsLocked = phase !== 'idle'
  const speedLocked = phase === 'paused'

  function commit(patch: Partial<JointEntity>) {
    recordedUpdateJoint(joint.id, patch)
  }

  function commitSpeed(speed: number) {
    if (phase === 'playing') {
      // D2's exception: bypasses the recorded wrapper entirely (no undo
      // entry, per D25 — undo is off while playing anyway) and writes
      // straight to sceneStore; M4.1's passive physics sync mirrors it
      // into the live Rapier joint on its own.
      useSceneStore.getState().updateJoint(joint.id, { motor: { ...joint.motor, speed } })
      return
    }
    commit({ motor: { ...joint.motor, speed } })
  }

  return (
    <CollapsibleSection title="Joint">
      <div className={styles.row}>
        <span className={styles.rowLabel}>Type</span>
        <span>{JOINT_TYPE_LABEL[joint.type]}</span>
      </div>

      {joint.type !== 'fixed' && (
        <>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Axis</span>
            {AXES.map((label, i) => (
              <NumberField
                key={label}
                label={label}
                value={joint.axis[i]}
                disabled={fieldsLocked}
                onCommit={(value) => commit({ axis: joint.axis.map((v, idx) => (idx === i ? value : v)) as [number, number, number] })}
              />
            ))}
          </div>

          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={joint.limits.min !== null && joint.limits.max !== null}
              disabled={fieldsLocked}
              onChange={(e) => commit({ limits: e.target.checked ? { min: -1, max: 1 } : { min: null, max: null } })}
            />
            Limits
          </label>
          {joint.limits.min !== null && joint.limits.max !== null && (
            <div className={styles.row}>
              <NumberField
                label="Min"
                value={joint.limits.min}
                disabled={fieldsLocked}
                onCommit={(value) => commit({ limits: { ...joint.limits, min: value } })}
              />
              <NumberField
                label="Max"
                value={joint.limits.max}
                disabled={fieldsLocked}
                onCommit={(value) => commit({ limits: { ...joint.limits, max: value } })}
              />
            </div>
          )}

          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={joint.motor.enabled}
              disabled={fieldsLocked}
              onChange={(e) => commit({ motor: { ...joint.motor, enabled: e.target.checked } })}
            />
            Motor
          </label>
          <div className={styles.row}>
            <NumberField label="Speed" value={joint.motor.speed} disabled={speedLocked} onCommit={commitSpeed} />
          </div>
        </>
      )}
    </CollapsibleSection>
  )
}
