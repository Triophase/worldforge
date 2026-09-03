/**
 * Pure sizing math for the resizable Assets/Properties panels (M0.3).
 * Kept dependency-free of React/DOM so it's testable without real layout
 * (jsdom does not compute actual box dimensions).
 */

export const ASSETS_MIN = 200
export const ASSETS_MAX = 420
export const PROPERTIES_MIN = 220
export const PROPERTIES_MAX = 420
/** Spec §28: "the viewport itself never shrinks below a usable size." */
export const VIEWPORT_MIN = 480

/**
 * `M8.4`'s drawer-mode breakpoint — below this, Assets/Properties stop
 * rendering inline and become overlay drawers instead (§28). Not an
 * arbitrary round number: it's exactly the total width the three
 * regions need at their own established minimums to render inline at
 * all (`ASSETS_MIN + VIEWPORT_MIN + PROPERTIES_MIN`) — below it, inline
 * mode could no longer honor `VIEWPORT_MIN` anyway, so this is the
 * natural point to switch, not a separately-tuned value that could
 * drift out of sync with the three numbers above.
 */
export const DRAWER_BREAKPOINT = ASSETS_MIN + VIEWPORT_MIN + PROPERTIES_MIN

/**
 * Clamp a candidate panel width to [panelMin, panelMax], further bounded so
 * `totalWidth - otherPanelWidth - candidate` never drops below `viewportMin`.
 */
export function clampPanelWidth(
  candidate: number,
  panelMin: number,
  panelMax: number,
  otherPanelWidth: number,
  totalWidth: number,
  viewportMin: number = VIEWPORT_MIN,
): number {
  const maxAllowedByViewport = totalWidth - otherPanelWidth - viewportMin
  const upperBound = Math.min(panelMax, Math.max(panelMin, maxAllowedByViewport))
  return Math.max(panelMin, Math.min(candidate, upperBound))
}
