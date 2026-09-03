import type { SceneJSON } from '../state/draftStore'

/**
 * D26/§17/D20/idea.md §18: the same object/joint composition as D20's
 * built-in Robot Arm assembly (Base, Arm Segment 1, Arm Segment 2, two
 * revolute joints, End effector, `M4.7`), pre-configured with Joint 1's
 * motor already on — unlike inserting the assembly from the Asset
 * Library (D29's motor-off-by-default), this demo is meant to visibly
 * move the instant Play is pressed.
 *
 * **Composition judgment call** (D20's text names four objects and
 * "two revolute joints" — it doesn't spell out which pairs connect):
 * `Base` —[Joint 1, shoulder]— `Arm Segment 1` —[Joint 2, elbow]—
 * `Arm Segment 2`, with `End Effector` positioned at Arm Segment 2's
 * tip but **not** itself a joint endpoint (kept `static` so it never
 * looks like it's "left behind" as the arm swings) — the only reading
 * that fits exactly two revolute joints across four named objects
 * without inventing a third (fixed) joint D20 never mentions. `M4.7`
 * (the live Asset-Library insertion action) should reuse this exact
 * composition rather than deriving its own.
 */
export const ROBOTIC_ARM_DEMO: SceneJSON = {
  schemaVersion: 1,
  name: 'Robotic Arm',
  objects: [
    {
      id: 'ground',
      name: 'Ground',
      assetRef: { kind: 'builtin', key: 'mechanical:platform' },
      transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [2, 1, 2] },
      physics: { bodyType: 'static', mass: 1.0, friction: 0.5, restitution: 0.2, gravity: true },
    },
    {
      id: 'base',
      name: 'Base',
      assetRef: { kind: 'builtin', key: 'mechanical:box' },
      transform: { position: [0, 0.5, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      physics: { bodyType: 'static', mass: 1.0, friction: 0.5, restitution: 0.2, gravity: true },
    },
    {
      id: 'arm-segment-1',
      name: 'Arm Segment 1',
      assetRef: { kind: 'builtin', key: 'mechanical:beam' },
      transform: { position: [1, 1.2, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      physics: { bodyType: 'dynamic', mass: 1.0, friction: 0.5, restitution: 0.2, gravity: true },
    },
    {
      id: 'arm-segment-2',
      name: 'Arm Segment 2',
      assetRef: { kind: 'builtin', key: 'mechanical:beam' },
      transform: { position: [3, 1.2, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      physics: { bodyType: 'dynamic', mass: 1.0, friction: 0.5, restitution: 0.2, gravity: true },
    },
    {
      id: 'end-effector',
      name: 'End Effector',
      assetRef: { kind: 'builtin', key: 'mechanical:box' },
      transform: { position: [4, 1.2, 0], rotation: [0, 0, 0, 1], scale: [0.4, 0.4, 0.4] },
      physics: { bodyType: 'static', mass: 1.0, friction: 0.5, restitution: 0.2, gravity: true },
    },
  ],
  joints: [
    {
      id: 'base-arm1',
      type: 'revolute',
      objectA: 'base',
      objectB: 'arm-segment-1',
      anchor: [0, 1.2, 0],
      axis: [0, 0, 1],
      limits: { min: null, max: null },
      motor: { enabled: true, speed: 1.2 },
    },
    {
      id: 'arm1-arm2',
      type: 'revolute',
      objectA: 'arm-segment-1',
      objectB: 'arm-segment-2',
      anchor: [2, 1.2, 0],
      axis: [0, 0, 1],
      limits: { min: null, max: null },
      motor: { enabled: false, speed: 0 },
    },
  ],
  simulation: {
    speed: 1,
    snapping: { moveEnabled: true, moveSnap: 0.1, rotationEnabled: true, rotationSnapDeg: 15 },
  },
}
