/**
 * `M7.1`: the one shared "download text content as a file" primitive —
 * Export Scene is the first feature that needs it, but nothing here is
 * Export-specific. A real browser `<a download>` click, not a
 * `window.location` navigation — works for content generated entirely
 * client-side with no server round-trip.
 */
export function downloadTextFile(filename: string, content: string, mimeType = 'application/json'): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
