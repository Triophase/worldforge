import { describe, expect, it } from 'vitest'
import {
  ASSETS_MAX,
  ASSETS_MIN,
  DRAWER_BREAKPOINT,
  PROPERTIES_MIN,
  VIEWPORT_MIN,
  clampPanelWidth,
} from './panelSizing'

describe('DRAWER_BREAKPOINT (M8.4)', () => {
  it('is exactly the sum of the three regions own established minimums', () => {
    expect(DRAWER_BREAKPOINT).toBe(ASSETS_MIN + VIEWPORT_MIN + PROPERTIES_MIN)
  })
})

describe('clampPanelWidth', () => {
  it('passes through a candidate within bounds unchanged', () => {
    expect(clampPanelWidth(300, ASSETS_MIN, ASSETS_MAX, 260, 1600, VIEWPORT_MIN)).toBe(300)
  })

  it('clamps to the panel minimum', () => {
    expect(clampPanelWidth(50, ASSETS_MIN, ASSETS_MAX, 260, 1600, VIEWPORT_MIN)).toBe(ASSETS_MIN)
  })

  it('clamps to the panel maximum', () => {
    expect(clampPanelWidth(999, ASSETS_MIN, ASSETS_MAX, 260, 1600, VIEWPORT_MIN)).toBe(ASSETS_MAX)
  })

  it('never lets the viewport shrink below its minimum, even if that is stricter than the panel max', () => {
    // total 900, other panel 260, viewport min 480 -> at most 900-260-480=160
    // available for this panel, which is below ASSETS_MIN (200), so the
    // panel-min floor wins (the panel simply can't grow at all here).
    const result = clampPanelWidth(999, ASSETS_MIN, ASSETS_MAX, 260, 900, VIEWPORT_MIN)
    expect(result).toBe(ASSETS_MIN)
  })

  it('stays within panel bounds when the viewport constraint is looser than the panel max', () => {
    // total 2000, other panel 260, viewport min 480 -> up to 1260 available,
    // far more than ASSETS_MAX, so the panel's own max still governs.
    const result = clampPanelWidth(999, ASSETS_MIN, ASSETS_MAX, 260, 2000, VIEWPORT_MIN)
    expect(result).toBe(ASSETS_MAX)
  })
})
