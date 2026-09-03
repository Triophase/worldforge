import type { SceneJSON } from '../state/draftStore'

/**
 * D26/§17/idea.md §18: a Block attached to a static Rail by a Prismatic
 * joint, motor enabled by default — pressing Play slides it continuously
 * along the rail. `Rail` is `mechanical:beam` (2 units long by default)
 * scaled 2× in X to 4 units, giving the Block visible room to travel;
 * `limits` bounds the slide to `±1.5` so it stays within the rail's
 * length rather than sliding off it forever.
 */
export const SLIDER_DEMO: SceneJSON = {
  schemaVersion: 1,
  name: 'Slider',
  objects: [
    {
      id: 'rail',
      name: 'Rail',
      assetRef: { kind: 'builtin', key: 'mechanical:beam' },
      transform: { position: [0, 0.5, 0], rotation: [0, 0, 0, 1], scale: [2, 1, 1] },
      physics: { bodyType: 'static', mass: 1.0, friction: 0.5, restitution: 0.2, gravity: true },
    },
    {
      id: 'block',
      name: 'Block',
      assetRef: { kind: 'builtin', key: 'mechanical:box' },
      transform: { position: [0, 0.6, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      physics: { bodyType: 'dynamic', mass: 1.0, friction: 0.5, restitution: 0.2, gravity: true },
    },
  ],
  joints: [
    {
      id: 'rail-block',
      type: 'prismatic',
      objectA: 'rail',
      objectB: 'block',
      anchor: [0, 0.5, 0],
      axis: [1, 0, 0],
      limits: { min: -1.5, max: 1.5 },
      motor: { enabled: true, speed: 1.5 },
    },
  ],
  simulation: {
    speed: 1,
    snapping: { moveEnabled: true, moveSnap: 0.1, rotationEnabled: true, rotationSnapDeg: 15 },
  },
}
