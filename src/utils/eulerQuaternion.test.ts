import { describe, expect, it } from 'vitest'
import { eulerDegreesToQuaternion, quaternionToEulerDegrees } from './eulerQuaternion'

describe('eulerQuaternion (D21 UI boundary)', () => {
  it('identity quaternion converts to zero degrees', () => {
    const [x, y, z] = quaternionToEulerDegrees([0, 0, 0, 1])
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(0)
    expect(z).toBeCloseTo(0)
  })

  it('zero degrees converts to the identity quaternion', () => {
    const q = eulerDegreesToQuaternion([0, 0, 0])
    expect(q[0]).toBeCloseTo(0)
    expect(q[1]).toBeCloseTo(0)
    expect(q[2]).toBeCloseTo(0)
    expect(q[3]).toBeCloseTo(1)
  })

  it('a known non-identity quaternion round-trips through degrees', () => {
    // 90 degrees about X.
    const original = eulerDegreesToQuaternion([90, 0, 0])
    const degrees = quaternionToEulerDegrees(original)
    expect(degrees[0]).toBeCloseTo(90)
    expect(degrees[1]).toBeCloseTo(0)
    expect(degrees[2]).toBeCloseTo(0)

    const roundTripped = eulerDegreesToQuaternion(degrees)
    expect(roundTripped[0]).toBeCloseTo(original[0])
    expect(roundTripped[1]).toBeCloseTo(original[1])
    expect(roundTripped[2]).toBeCloseTo(original[2])
    expect(roundTripped[3]).toBeCloseTo(original[3])
  })

  it('45 degrees about Y produces the expected quaternion components', () => {
    const q = eulerDegreesToQuaternion([0, 45, 0])
    expect(q[0]).toBeCloseTo(0)
    expect(q[1]).toBeCloseTo(Math.sin(Math.PI / 8))
    expect(q[2]).toBeCloseTo(0)
    expect(q[3]).toBeCloseTo(Math.cos(Math.PI / 8))
  })
})
