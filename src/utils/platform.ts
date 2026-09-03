/** `M8.2`: which modifier-key label a tooltip should show — "Cmd" on macOS/iOS, "Ctrl" everywhere else. */
export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  const platform = navigator.platform ?? navigator.userAgent ?? ''
  return /Mac|iPhone|iPad|iPod/.test(platform)
}

export function modifierKeyLabel(): 'Cmd' | 'Ctrl' {
  return isMac() ? 'Cmd' : 'Ctrl'
}
