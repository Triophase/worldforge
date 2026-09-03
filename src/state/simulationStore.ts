import { create } from 'zustand'
import type { BodySnapshot } from '../engine/physics/physicsStore'
import { restoreBodies, snapshotBodies } from '../engine/physics/physicsStore'
import { usePlaybackBridgeStore } from './playbackBridgeStore'
import type { JointMotor } from './sceneStore'
import { useSceneStore } from './sceneStore'

export type SimulationPhase = 'idle' | 'playing' | 'paused'

/** §16: the four selectable speeds — scales the physics timestep, never the render frame rate. */
export const SIMULATION_SPEEDS = [0.25, 0.5, 1, 2] as const
export type SimulationSpeed = (typeof SIMULATION_SPEEDS)[number]

interface SimulationState {
  phase: SimulationPhase
  /** The D3 snapshot taken the instant Play was last pressed from `idle`. `null` only while `idle`. */
  snapshot: Record<string, BodySnapshot> | null
  /** D3's joint half (M4.1): each joint's `motor` at the instant Play was last pressed. `null` only while `idle`, exactly like `snapshot`. */
  jointMotorSnapshot: Record<string, JointMotor> | null
  /** D22's `simulation.speed` — persisted scene state, not transport-only UI state (M3.5). Changeable at any phase, including `playing`. */
  speed: SimulationSpeed
  /** D30: elapsed *simulated* time since the current Play started, in seconds. Frozen while `paused`, `0` again after Reset. */
  elapsed: number
  play: () => void
  pause: () => void
  reset: () => void
  setSpeed: (speed: SimulationSpeed) => void
  /** Called by `SimulationStepper` after each step with the timestep just applied — not a UI action. */
  advanceElapsed: (dt: number) => void
}

/** M4.1: reads each joint's `motor` straight from `sceneStore` — Rapier's own joint objects expose no "current motor target" getter, and `sceneStore.joints[].motor` is already the value physics is built from, so it is both the simplest and the correct source to snapshot. */
function snapshotJointMotors(): Record<string, JointMotor> {
  const snapshot: Record<string, JointMotor> = {}
  for (const joint of useSceneStore.getState().joints) {
    snapshot[joint.id] = { ...joint.motor }
  }
  return snapshot
}

/**
 * D3's joint half of Reset (M4.1): reverts each joint's `motor` field in
 * `sceneStore` back to its Play-press value. Unlike `restoreBodies`
 * (which writes straight into the live Rapier bodies, bypassing
 * `sceneStore` entirely), this writes into `sceneStore` and relies on
 * `physicsStore`'s passive sync to mirror the reverted value into the
 * live Rapier joint — the same path a live motor-speed edit made while
 * `playing` (D2's exception, `M4.3`) would have gone through in the
 * first place, via `updateJoint`, so reverting the same way is exactly
 * what "undoes" it. Only touches joints whose motor actually differs
 * from the snapshot, so a Reset with no live-edited joints never
 * replaces the `joints` array or marks the draft dirty.
 */
function restoreJointMotors(jointMotorSnapshot: Record<string, JointMotor>): void {
  if (Object.keys(jointMotorSnapshot).length === 0) return

  let changed = false
  useSceneStore.setState((state) => {
    const joints = state.joints.map((j) => {
      const target = jointMotorSnapshot[j.id]
      if (!target) return j
      if (j.motor.enabled === target.enabled && j.motor.speed === target.speed) return j
      changed = true
      return { ...j, motor: { ...target } }
    })
    return changed ? { joints, isDirty: true } : {}
  })
}

/**
 * §16/D3: `idle` → `playing` ⇄ `paused` (Play/Pause toggle without
 * re-snapshotting — the Reset target stays the original Play-start
 * snapshot throughout a play/pause/play cycle) → `idle` (via Reset).
 * Stepping itself lives in `engine/simulation/SimulationStepper.tsx`
 * (a single `useFrame` mounted once in the Canvas, reading `phase`/
 * `speed` fresh each frame) — this store only owns the state machine,
 * the snapshot (M4.1: bodies and joint-motor state), the selected
 * `speed` (M3.5, D22's `simulation.speed` — persisted, restored/
 * serialized by `draftStore.ts` same as `snappingStore`), and the D30
 * timeline's `elapsed` accumulator.
 */
export const useSimulationStore = create<SimulationState>((set, get) => ({
  phase: 'idle',
  snapshot: null,
  jointMotorSnapshot: null,
  speed: 1,
  elapsed: 0,

  play: () => {
    const { phase } = get()
    if (phase === 'playing') return
    if (phase === 'idle') {
      set({ phase: 'playing', snapshot: snapshotBodies(), jointMotorSnapshot: snapshotJointMotors() })
      return
    }
    // 'paused' -> 'playing': resume, no new snapshot (§16).
    set({ phase: 'playing' })
  },

  pause: () => {
    if (get().phase !== 'playing') return
    set({ phase: 'paused' })
  },

  reset: () => {
    const { snapshot, jointMotorSnapshot } = get()
    if (snapshot) restoreBodies(snapshot)
    if (jointMotorSnapshot) restoreJointMotors(jointMotorSnapshot)
    usePlaybackBridgeStore.getState().clearLiveTransform()
    set({ phase: 'idle', snapshot: null, jointMotorSnapshot: null, elapsed: 0 })
  },

  setSpeed: (speed) => set({ speed }),

  advanceElapsed: (dt) => set((s) => ({ elapsed: s.elapsed + dt })),
}))

/**
 * D2: the single shared guard every scene-mutating action checks —
 * state-architecture's "one guard, not ad hoc per call site." Locked for
 * both `playing` and `paused`, not `playing` alone — see
 * `.ai/decisions.md`'s `M3.4` entry for why (D2's own sentence says
 * "while playing"; this task's own Scope text says editing "re-enables
 * ... upon reaching idle," which locking only `playing` would contradict,
 * and un-locking `paused` would let an edit commit against `sceneStore`'s
 * stale pre-Play transform while the live body has already moved).
 */
export function isEditLocked(): boolean {
  return useSimulationStore.getState().phase !== 'idle'
}
