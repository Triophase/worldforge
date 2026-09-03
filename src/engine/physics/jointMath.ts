import { Quaternion, Vector3 } from 'three'

export type Vec3 = [number, number, number]
export type Quat = [number, number, number, number]

/**
 * A world-space point expressed in a rigid body's local frame:
 * `bodyRotation^-1 * (worldPoint - bodyPosition)`. Rapier's joint anchors
 * are always body-local (M4.1) — this is the one place that conversion
 * happens, mirroring `assetRotation.ts`'s "one composition site" pattern.
 */
export function worldPointToLocal(worldPoint: Vec3, bodyPosition: Vec3, bodyRotation: Quat): Vec3 {
  const inverse = new Quaternion(...bodyRotation).invert()
  const v = new Vector3(...worldPoint).sub(new Vector3(...bodyPosition)).applyQuaternion(inverse)
  return [v.x, v.y, v.z]
}

/** A world-space direction (e.g. a joint axis) expressed in a rigid body's local frame. */
export function worldVectorToLocal(worldVector: Vec3, bodyRotation: Quat): Vec3 {
  const inverse = new Quaternion(...bodyRotation).invert()
  const v = new Vector3(...worldVector).applyQuaternion(inverse)
  return [v.x, v.y, v.z]
}

/**
 * The inverse of `worldPointToLocal` — a body-local point expressed back
 * in world space, using the body's *current* position/rotation (which
 * may differ from the rotation it was computed against). `M4.4`'s joint
 * indicators use this every frame to re-derive a joint's live world-space
 * anchor from its frozen local offset, tracking the connected body as it
 * moves (via gizmo or physics) without ever recomputing the offset itself.
 */
export function localPointToWorld(localPoint: Vec3, bodyPosition: Vec3, bodyRotation: Quat): Vec3 {
  const v = new Vector3(...localPoint).applyQuaternion(new Quaternion(...bodyRotation)).add(new Vector3(...bodyPosition))
  return [v.x, v.y, v.z]
}

/** The inverse of `worldVectorToLocal` — a body-local direction expressed back in world space, using the body's current rotation. */
export function localVectorToWorld(localVector: Vec3, bodyRotation: Quat): Vec3 {
  const v = new Vector3(...localVector).applyQuaternion(new Quaternion(...bodyRotation))
  return [v.x, v.y, v.z]
}

/**
 * The relative orientation `denominator^-1 * numerator` — used as a fixed
 * joint's `frame2` (with `frame1` left identity, aligned to body A's own
 * frame) so the joint locks the two bodies at exactly the relative pose
 * they had at the moment of creation, with no extra twist introduced.
 */
export function relativeRotation(numerator: Quat, denominator: Quat): Quat {
  const num = new Quaternion(...numerator)
  const denomInverse = new Quaternion(...denominator).invert()
  return denomInverse.multiply(num).toArray() as Quat
}
