import { create } from 'zustand'
import { readAsText } from '../loaders/AssetLoader/readFile'
import { confirmDiscard, importScene } from './draftStore'
import { IMPORT_INVALID_MESSAGE, validateImportedScene } from './importValidation'

interface ImportState {
  status: 'idle' | 'importing' | 'error'
  errorMessage: string | null
  /**
   * §27's full flow for one picked file: read → parse JSON → validate
   * (§27's exact order, `importValidation.ts`) — **before** ever
   * touching the current draft, matching every acceptance criterion's
   * "the current draft is left unchanged" wording. Only once a file
   * validates does the D4 unsaved-changes guard run, gating the actual
   * replace — `window.confirm` (inside `confirmDiscard`) is synchronous,
   * so capturing its decision via a flag and continuing past it is safe,
   * the same "callers own the guard" convention every other draft-
   * replacing action already follows, just inverted here since Import
   * doesn't know whether to ask until *after* the file is validated.
   */
  importFile: (file: File) => Promise<void>
  dismissError: () => void
}

export const useImportStore = create<ImportState>((set) => ({
  status: 'idle',
  errorMessage: null,

  importFile: async (file) => {
    set({ status: 'importing', errorMessage: null })

    let text: string
    try {
      text = await readAsText(file)
    } catch {
      set({ status: 'error', errorMessage: IMPORT_INVALID_MESSAGE })
      return
    }

    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      set({ status: 'error', errorMessage: IMPORT_INVALID_MESSAGE })
      return
    }

    const result = validateImportedScene(raw)
    if ('error' in result) {
      set({ status: 'error', errorMessage: result.error })
      return
    }

    let confirmed = false
    confirmDiscard(() => {
      confirmed = true
    })
    if (!confirmed) {
      set({ status: 'idle' })
      return
    }

    await importScene(result.scene)
    set({ status: 'idle' })
  },

  dismissError: () => set({ status: 'idle', errorMessage: null }),
}))
