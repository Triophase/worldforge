/** §20: rounds `value` to the nearest multiple of `increment`. */
export function snapToIncrement(value: number, increment: number): number {
  if (increment <= 0) return value
  return Math.round(value / increment) * increment
}
