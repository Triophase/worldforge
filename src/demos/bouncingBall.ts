import type { SceneJSON } from '../state/draftStore'

/**
 * D26/§17/idea.md §18: a Sphere dropped above a static Platform with a
 * high `restitution` (0.85 — a free implementation choice, no exact
 * value is specified) for a clearly visible bounce. No joints at all —
 * grouped into `M4.6` only because it's one of the two demos remaining
 * after `M3.6`'s Falling Box, not because it depends on the joint stack.
 */
export const BOUNCING_BALL_DEMO: SceneJSON = {
  schemaVersion: 1,
  name: 'Bouncing Ball',
  objects: [
    {
      id: 'platform',
      name: 'Platform',
      assetRef: { kind: 'builtin', key: 'mechanical:platform' },
      transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [2, 1, 2] },
      physics: { bodyType: 'static', mass: 1.0, friction: 0.5, restitution: 0.2, gravity: true },
    },
    {
      id: 'ball',
      name: 'Ball',
      assetRef: { kind: 'builtin', key: 'primitive:sphere' },
      transform: { position: [0, 3, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      physics: { bodyType: 'dynamic', mass: 1.0, friction: 0.3, restitution: 0.85, gravity: true },
    },
  ],
  joints: [],
  simulation: {
    speed: 1,
    snapping: { moveEnabled: true, moveSnap: 0.1, rotationEnabled: true, rotationSnapDeg: 15 },
  },
}
