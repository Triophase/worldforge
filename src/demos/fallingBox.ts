import type { SceneJSON } from '../state/draftStore'

/**
 * D26/§17: the Falling Box demo — also `idea.md` §19's first-time-
 * experience scene (D26: "there is only one such scene, not two similar
 * ones to keep in sync"). Three objects, D29's explicit-body-type
 * requirement for demo scenes: `Ground` and `Platform` static, `Box`
 * dynamic. Ids here are human-readable placeholders — `loadDemoScene`
 * (`draftStore.ts`) replaces them with fresh UUIDs at load time, so
 * these values are never actually written into `sceneStore`.
 *
 * Layout (Y-up, matching this project's ground-plane convention):
 * `Ground` (18×0.1×18, `mechanical:platform` scaled 6× in X/Z) sits at
 * the origin, top surface at y≈0.05. `Platform` (3×0.1×3, unscaled) is
 * raised well above it, top surface at y≈1.05. `Box` (1.2×1×1.2) starts
 * at y=3 — its bottom (y=2.5) is well clear of Platform's top (y=1.05),
 * satisfying "positioned above Platform with clear air between them."
 * Both footprints are centered on the same X/Z axis, so a falling Box
 * lands squarely on Platform rather than missing it.
 */
export const FALLING_BOX_DEMO: SceneJSON = {
  schemaVersion: 1,
  name: 'Falling Box',
  objects: [
    {
      id: 'ground',
      name: 'Ground',
      assetRef: { kind: 'builtin', key: 'mechanical:platform' },
      transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [6, 1, 6] },
      physics: { bodyType: 'static', mass: 1.0, friction: 0.5, restitution: 0.2, gravity: true },
    },
    {
      id: 'platform',
      name: 'Platform',
      assetRef: { kind: 'builtin', key: 'mechanical:platform' },
      transform: { position: [0, 1, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      physics: { bodyType: 'static', mass: 1.0, friction: 0.5, restitution: 0.2, gravity: true },
    },
    {
      id: 'box',
      name: 'Box',
      assetRef: { kind: 'builtin', key: 'mechanical:box' },
      transform: { position: [0, 3, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      physics: { bodyType: 'dynamic', mass: 1.0, friction: 0.5, restitution: 0.2, gravity: true },
    },
  ],
  joints: [],
  simulation: {
    speed: 1,
    snapping: { moveEnabled: true, moveSnap: 0.1, rotationEnabled: true, rotationSnapDeg: 15 },
  },
}
