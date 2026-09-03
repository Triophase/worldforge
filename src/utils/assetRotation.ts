import { Quaternion } from 'three'

/**
 * Composes an object's own stored rotation with its asset's baked-in
 * `defaultRotation` (registry data — M2.2's Ramp tilt) into the
 * quaternion actually applied to the mesh/collider. **The one place this
 * composition happens** — M3.1's Rapier body rotation must use this same
 * function, or Ramp's visual tilt and its physics collider will disagree
 * (see `assets/registry.ts`'s `defaultRotation` doc comment).
 */
export function composeMeshQuaternion(
  objectRotation: [number, number, number, number],
  defaultRotation: [number, number, number, number],
): [number, number, number, number] {
  const base = new Quaternion(...defaultRotation)
  const object = new Quaternion(...objectRotation)
  return object.multiply(base).toArray() as [number, number, number, number]
}

/**
 * The inverse of `composeMeshQuaternion`: given a composed (mesh/body)
 * quaternion, recovers the object's own rotation by right-multiplying by
 * the inverse of `defaultRotation`. Needed anywhere a composed rotation
 * must be turned back into the object's own delta (e.g. the M2.6 gizmo
 * committing a rotate-drag on a tilted asset).
 */
export function decomposeMeshQuaternion(
  meshRotation: [number, number, number, number],
  defaultRotation: [number, number, number, number],
): [number, number, number, number] {
  const mesh = new Quaternion(...meshRotation)
  const baseInverse = new Quaternion(...defaultRotation).invert()
  return mesh.multiply(baseInverse).toArray() as [number, number, number, number]
}
