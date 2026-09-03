import type { SceneJSON } from '../state/draftStore'

/**
 * D26/§17/idea.md §18: a Wheel mounted on a static Axle by a Revolute
 * joint, motor enabled by default — pressing Play spins it continuously.
 * Ids here are human-readable placeholders — `loadDemoScene`
 * (`draftStore.ts`) replaces them (and every joint's `objectA`/`objectB`
 * reference) with fresh UUIDs at load time.
 *
 * Both `Axle` and `Wheel` carry a 90°-about-Z `rotation` so their
 * shared cylinder axis (Y by default, per `assets/mechanical/index.ts`)
 * points along world X instead — a wheel needs to spin around a
 * *horizontal* axle, not stand up like a cylinder on end. The joint's
 * `axis: [1, 0, 0]` matches that same horizontal direction, so the
 * motor actually spins the wheel like a wheel rather than around its
 * own flat face.
 */
const ROTATE_90_ABOUT_Z: [number, number, number, number] = [0, 0, 0.7071068, 0.7071068]

export const ROTATING_WHEEL_DEMO: SceneJSON = {
  schemaVersion: 1,
  name: 'Rotating Wheel',
  objects: [
    {
      id: 'axle',
      name: 'Axle',
      assetRef: { kind: 'builtin', key: 'mechanical:axle' },
      transform: { position: [0, 1, 0], rotation: ROTATE_90_ABOUT_Z, scale: [1, 1, 1] },
      physics: { bodyType: 'static', mass: 1.0, friction: 0.5, restitution: 0.2, gravity: true },
    },
    {
      id: 'wheel',
      name: 'Wheel',
      assetRef: { kind: 'builtin', key: 'mechanical:wheel' },
      transform: { position: [0, 1, 0], rotation: ROTATE_90_ABOUT_Z, scale: [1, 1, 1] },
      physics: { bodyType: 'dynamic', mass: 1.0, friction: 0.5, restitution: 0.2, gravity: true },
    },
  ],
  joints: [
    {
      id: 'axle-wheel',
      type: 'revolute',
      objectA: 'axle',
      objectB: 'wheel',
      anchor: [0, 1, 0],
      axis: [1, 0, 0],
      limits: { min: null, max: null },
      motor: { enabled: true, speed: 3 },
    },
  ],
  simulation: {
    speed: 1,
    snapping: { moveEnabled: true, moveSnap: 0.1, rotationEnabled: true, rotationSnapDeg: 15 },
  },
}
