import { Euler, MathUtils, Quaternion } from 'three'

/**
 * D21: the store holds rotation as a quaternion; Euler degrees exist only
 * at the Properties-panel UI boundary (M2.6). These two functions are
 * that boundary — never converted anywhere else in the codebase.
 */

export function quaternionToEulerDegrees(
  quaternion: [number, number, number, number],
): [number, number, number] {
  const euler = new Euler().setFromQuaternion(new Quaternion(...quaternion))
  return [MathUtils.radToDeg(euler.x), MathUtils.radToDeg(euler.y), MathUtils.radToDeg(euler.z)]
}

export function eulerDegreesToQuaternion(
  degrees: [number, number, number],
): [number, number, number, number] {
  const euler = new Euler(
    MathUtils.degToRad(degrees[0]),
    MathUtils.degToRad(degrees[1]),
    MathUtils.degToRad(degrees[2]),
  )
  return new Quaternion().setFromEuler(euler).toArray() as [number, number, number, number]
}
