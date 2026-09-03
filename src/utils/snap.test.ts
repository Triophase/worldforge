import { describe, expect, it } from 'vitest'
import { snapToIncrement } from './snap'

describe('snapToIncrement (§20)', () => {
  it('rounds to the nearest multiple of the increment', () => {
    expect(snapToIncrement(1.27, 0.1)).toBeCloseTo(1.3)
    expect(snapToIncrement(1.24, 0.1)).toBeCloseTo(1.2)
  })

  it('rounds a degree value to the nearest multiple of 15', () => {
    expect(snapToIncrement(37, 15)).toBe(30)
    expect(snapToIncrement(38, 15)).toBe(45)
  })

  it('handles a whole-unit increment', () => {
    expect(snapToIncrement(3.6, 1)).toBe(4)
  })

  it('leaves the value unchanged for a non-positive increment', () => {
    expect(snapToIncrement(1.27, 0)).toBe(1.27)
    expect(snapToIncrement(1.27, -1)).toBe(1.27)
  })
})
