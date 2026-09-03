import type { ChangeEvent } from 'react'
import { useRef } from 'react'
import { handleFileSelected, UPLOAD_ACCEPT } from '../../loaders/AssetLoader/AssetLoader'

/**
 * M5.1's one shared upload flow (§12) — both `AssetLibraryPanel`'s "+
 * Upload Asset" and `EmptyState`'s "Upload CAD" use this hook rather
 * than each inventing their own file-picker wiring. Each caller renders
 * its own hidden `<input type="file">` (native pickers require a
 * same-call-stack `.click()` from a real user gesture, so the input
 * can't live in one shared component far from the triggering button),
 * but both route the selected file through the exact same
 * `handleFileSelected` — the "one implementation, not two" the task
 * requires is that shared function, not a shared DOM node.
 */
export function useFileUpload() {
  const inputRef = useRef<HTMLInputElement>(null)

  function trigger() {
    inputRef.current?.click()
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFileSelected(file)
    e.target.value = '' // lets the same file be re-selected later
  }

  return { inputRef, trigger, onChange, accept: UPLOAD_ACCEPT }
}
