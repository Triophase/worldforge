import { BoxGeometry, CapsuleGeometry, ConeGeometry, CylinderGeometry, SphereGeometry } from 'three'
import type { BuiltinAssetDefinition } from '../registry'
import { IDENTITY_ROTATION, registerBuiltinAsset } from '../registry'

/** §11's five basic shapes. */
export const PRIMITIVE_DEFINITIONS: BuiltinAssetDefinition[] = [
  {
    key: 'primitive:cube',
    displayName: 'Cube',
    category: 'primitive',
    createGeometry: () => new BoxGeometry(1, 1, 1),
    collider: { shape: 'box', halfExtents: [0.5, 0.5, 0.5] },
    defaultRotation: IDENTITY_ROTATION,
  },
  {
    key: 'primitive:sphere',
    displayName: 'Sphere',
    category: 'primitive',
    createGeometry: () => new SphereGeometry(0.5, 32, 16),
    collider: { shape: 'sphere', radius: 0.5 },
    defaultRotation: IDENTITY_ROTATION,
  },
  {
    key: 'primitive:cylinder',
    displayName: 'Cylinder',
    category: 'primitive',
    createGeometry: () => new CylinderGeometry(0.5, 0.5, 1, 32),
    collider: { shape: 'cylinder', radius: 0.5, halfHeight: 0.5 },
    defaultRotation: IDENTITY_ROTATION,
  },
  {
    key: 'primitive:cone',
    displayName: 'Cone',
    category: 'primitive',
    createGeometry: () => new ConeGeometry(0.5, 1, 32),
    collider: { shape: 'cone', radius: 0.5, halfHeight: 0.5 },
    defaultRotation: IDENTITY_ROTATION,
  },
  {
    key: 'primitive:capsule',
    displayName: 'Capsule',
    category: 'primitive',
    createGeometry: () => new CapsuleGeometry(0.3, 0.6, 4, 16),
    collider: { shape: 'capsule', radius: 0.3, halfHeight: 0.3 },
    defaultRotation: IDENTITY_ROTATION,
  },
]

for (const definition of PRIMITIVE_DEFINITIONS) registerBuiltinAsset(definition)
