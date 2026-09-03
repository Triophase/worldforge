import { BoxGeometry, CylinderGeometry, Quaternion, Vector3 } from 'three'
import type { BuiltinAssetDefinition } from '../registry'
import { IDENTITY_ROTATION, registerBuiltinAsset } from '../registry'

/** Ramp's default incline — 22.5° tilt around X (spec: exact angle is a free choice). */
const RAMP_TILT_RADIANS = Math.PI / 8
const rampQuaternion = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), RAMP_TILT_RADIANS)
const RAMP_ROTATION: [number, number, number, number] = [
  rampQuaternion.x,
  rampQuaternion.y,
  rampQuaternion.z,
  rampQuaternion.w,
]

/** §11's six mechanical components — every collider stays box/cylinder, per D28. */
export const MECHANICAL_DEFINITIONS: BuiltinAssetDefinition[] = [
  {
    key: 'mechanical:box',
    displayName: 'Box',
    category: 'mechanical',
    // Crate-proportioned — deliberately distinct default size from primitive:cube.
    createGeometry: () => new BoxGeometry(1.2, 1, 1.2),
    collider: { shape: 'box', halfExtents: [0.6, 0.5, 0.6] },
    defaultRotation: IDENTITY_ROTATION,
  },
  {
    key: 'mechanical:beam',
    displayName: 'Beam',
    category: 'mechanical',
    createGeometry: () => new BoxGeometry(2, 0.2, 0.2),
    collider: { shape: 'box', halfExtents: [1, 0.1, 0.1] },
    defaultRotation: IDENTITY_ROTATION,
  },
  {
    key: 'mechanical:wheel',
    displayName: 'Wheel',
    category: 'mechanical',
    createGeometry: () => new CylinderGeometry(0.5, 0.5, 0.3, 32),
    collider: { shape: 'cylinder', radius: 0.5, halfHeight: 0.15 },
    defaultRotation: IDENTITY_ROTATION,
  },
  {
    key: 'mechanical:axle',
    displayName: 'Axle',
    category: 'mechanical',
    createGeometry: () => new CylinderGeometry(0.1, 0.1, 1.5, 16),
    collider: { shape: 'cylinder', radius: 0.1, halfHeight: 0.75 },
    defaultRotation: IDENTITY_ROTATION,
  },
  {
    key: 'mechanical:platform',
    displayName: 'Platform',
    category: 'mechanical',
    createGeometry: () => new BoxGeometry(3, 0.1, 3),
    collider: { shape: 'box', halfExtents: [1.5, 0.05, 1.5] },
    defaultRotation: IDENTITY_ROTATION,
  },
  {
    key: 'mechanical:ramp',
    displayName: 'Ramp',
    category: 'mechanical',
    // A plain elongated box — the tilt is `defaultRotation`, composed at
    // render (and later, physics-body) time, NOT baked into the geometry's
    // vertices. That keeps `collider` below matching `createGeometry()`'s
    // actual (untilted) shape exactly, per §11/D28 ("its collider remains
    // an exact box") — baking the tilt into vertices instead would leave
    // M3.1's future Rapier collider (built from this same descriptor)
    // axis-aligned while the mesh rendered tilted, a real visual/physical
    // mismatch this design avoids.
    createGeometry: () => new BoxGeometry(2, 0.1, 1),
    collider: { shape: 'box', halfExtents: [1, 0.05, 0.5] },
    defaultRotation: RAMP_ROTATION,
  },
]

for (const definition of MECHANICAL_DEFINITIONS) registerBuiltinAsset(definition)
