import type { JointType } from '../state/sceneStore'
import { getBottomOffsetY } from './placement'

/**
 * D20/§11's one V1 Assembly: Robot Arm. Not a `BuiltinAssetDefinition` —
 * an assembly inserts **multiple** independent objects plus joints in one
 * action (`M4.7`), never a single mesh/collider like `registry.ts`'s
 * built-ins, so it gets its own small registry here rather than being
 * shoehorned into that one.
 *
 * Positions are authored **relative to Base** (index 0) — the assembly's
 * reference point for placement (§11's rule, applied once to the whole
 * assembly, not per-part). This is the same relative layout `M4.6`'s
 * `demos/roboticArm.ts` uses for its own (motor-on, pre-configured)
 * starting pose — kept in sync deliberately; a future change to one
 * should be mirrored in the other.
 */
export interface AssemblyPart {
  name: string
  assetKey: string
  /** Offset from Base's own placed position — `[0,0,0]` for Base itself. */
  offset: [number, number, number]
  scale: [number, number, number]
}

export interface AssemblyJointSpec {
  /** Index into `parts` — the joint's Object A. */
  partAIndex: number
  /** Index into `parts` — the joint's Object B. */
  partBIndex: number
  type: JointType
  axis: [number, number, number]
}

export const ROBOT_ARM_ASSEMBLY = {
  key: 'assembly:robot-arm',
  displayName: 'Robot Arm',
  parts: [
    { name: 'Base', assetKey: 'mechanical:box', offset: [0, 0, 0], scale: [1, 1, 1] },
    { name: 'Arm Segment 1', assetKey: 'mechanical:beam', offset: [1, 0.7, 0], scale: [1, 1, 1] },
    { name: 'Arm Segment 2', assetKey: 'mechanical:beam', offset: [3, 0.7, 0], scale: [1, 1, 1] },
    { name: 'End Effector', assetKey: 'mechanical:box', offset: [4, 0.7, 0], scale: [0.4, 0.4, 0.4] },
  ] as AssemblyPart[],
  // §14's default revolute axis (world X) doesn't suit an arm meant to
  // visibly articulate in the vertical plane it's laid out in — Z, same
  // choice `roboticArm.ts`'s demo makes, for the same reason.
  joints: [
    { partAIndex: 0, partBIndex: 1, type: 'revolute', axis: [0, 0, 1] },
    { partAIndex: 1, partBIndex: 2, type: 'revolute', axis: [0, 0, 1] },
  ] as AssemblyJointSpec[],
}

/** Base's own ground-clamped Y (§11's placement rule) — every other part's Y is authored relative to this, not independently ground-clamped. */
export function robotArmBaseY(): number {
  return getBottomOffsetY(ROBOT_ARM_ASSEMBLY.parts[0].assetKey)
}
