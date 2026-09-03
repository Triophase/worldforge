import { Quaternion } from 'three'
import { describe, expect, it } from 'vitest'
import { localPointToWorld, localVectorToWorld, relativeRotation, worldPointToLocal, worldVectorToLocal } from './jointMath'

const IDENTITY: [number, number, number, number] = [0, 0, 0, 1]

describe('jointMath (M4.1)', () => {
  it('worldPointToLocal returns the offset unchanged for an identity-rotated body at the origin', () => {
    expect(worldPointToLocal([3, 4, 5], [0, 0, 0], IDENTITY)).toEqual([3, 4, 5])
  })

  it('worldPointToLocal subtracts the body position before rotating', () => {
    expect(worldPointToLocal([5, 5, 5], [2, 2, 2], IDENTITY)).toEqual([3, 3, 3])
  })

  it('worldPointToLocal un-rotates a 90° body rotation about Y', () => {
    const rot90Y = new Quaternion().setFromAxisAngle({ x: 0, y: 1, z: 0 } as never, Math.PI / 2)
    const [x, y, z] = worldPointToLocal([1, 0, 0], [0, 0, 0], rot90Y.toArray() as [number, number, number, number])
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(0)
    expect(z).toBeCloseTo(1)
  })

  it('worldVectorToLocal ignores body position, only un-rotates', () => {
    const rot90Y = new Quaternion().setFromAxisAngle({ x: 0, y: 1, z: 0 } as never, Math.PI / 2)
    const [x, y, z] = worldVectorToLocal([1, 0, 0], rot90Y.toArray() as [number, number, number, number])
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(0)
    expect(z).toBeCloseTo(1)
  })

  it('relativeRotation of identical rotations is identity', () => {
    const q = new Quaternion().setFromAxisAngle({ x: 1, y: 0, z: 0 } as never, 0.4).toArray() as [
      number,
      number,
      number,
      number,
    ]
    const [x, y, z, w] = relativeRotation(q, q)
    expect(x).toBeCloseTo(0)
    expect(y).toBeCloseTo(0)
    expect(z).toBeCloseTo(0)
    expect(w).toBeCloseTo(1)
  })

  it('relativeRotation(numerator, denominator) composed with denominator reproduces numerator', () => {
    const numerator = new Quaternion().setFromAxisAngle({ x: 0, y: 1, z: 0 } as never, 0.9)
    const denominator = new Quaternion().setFromAxisAngle({ x: 1, y: 0, z: 0 } as never, 0.3)
    const rel = relativeRotation(
      numerator.toArray() as [number, number, number, number],
      denominator.toArray() as [number, number, number, number],
    )
    const recomposed = denominator.clone().multiply(new Quaternion(...rel))
    expect(recomposed.x).toBeCloseTo(numerator.x)
    expect(recomposed.y).toBeCloseTo(numerator.y)
    expect(recomposed.z).toBeCloseTo(numerator.z)
    expect(recomposed.w).toBeCloseTo(numerator.w)
  })

  it('localPointToWorld is the exact inverse of worldPointToLocal for the same body pose', () => {
    const bodyRotation = new Quaternion().setFromAxisAngle({ x: 0, y: 1, z: 0 } as never, 0.7).toArray() as [
      number,
      number,
      number,
      number,
    ]
    const bodyPosition: [number, number, number] = [2, -1, 3]
    const worldPoint: [number, number, number] = [5, 5, 5]

    const local = worldPointToLocal(worldPoint, bodyPosition, bodyRotation)
    const [x, y, z] = localPointToWorld(local, bodyPosition, bodyRotation)

    expect(x).toBeCloseTo(worldPoint[0])
    expect(y).toBeCloseTo(worldPoint[1])
    expect(z).toBeCloseTo(worldPoint[2])
  })

  it("localPointToWorld tracks a body's new pose — the same local offset moves with it", () => {
    const local: [number, number, number] = [1, 0, 0]
    const atOrigin = localPointToWorld(local, [0, 0, 0], [0, 0, 0, 1])
    const afterMoving = localPointToWorld(local, [10, 0, 0], [0, 0, 0, 1])

    expect(atOrigin).toEqual([1, 0, 0])
    expect(afterMoving).toEqual([11, 0, 0])
  })

  it('localVectorToWorld is the exact inverse of worldVectorToLocal for the same rotation', () => {
    const bodyRotation = new Quaternion().setFromAxisAngle({ x: 1, y: 0, z: 0 } as never, 1.1).toArray() as [
      number,
      number,
      number,
      number,
    ]
    const worldVector: [number, number, number] = [0, 1, 0]

    const local = worldVectorToLocal(worldVector, bodyRotation)
    const [x, y, z] = localVectorToWorld(local, bodyRotation)

    expect(x).toBeCloseTo(worldVector[0])
    expect(y).toBeCloseTo(worldVector[1])
    expect(z).toBeCloseTo(worldVector[2])
  })
})
