import { create } from 'zustand'
import { detectFormat } from '../loaders/AssetLoader/AssetLoader'
import { readAsBase64 } from '../loaders/AssetLoader/readFile'
import { apiFetch } from '../utils/apiClient'
import { downloadTextFile } from '../utils/downloadFile'
import { serializeDraft } from './draftStore'
import type { SceneJSON } from './draftStore'
import { usePersistenceStore } from './persistenceStore'
import { useUploadedAssetsStore } from './uploadedAssetsStore'

export interface ExportAssetEntry {
  assetId: string
  filename: string
  format: string
  /** base64, no `data:...;base64,` prefix. */
  data: string
}

/**
 * D22's export-only shape: the ordinary `SceneJSON` (objects/joints/
 * simulation/name) plus `id` (only when the draft has been saved at
 * least once — `usePersistenceStore.getState().sceneId`, never faked)
 * and `assets` (always present, `[]` for a scene with no uploaded
 * objects) — never sent to the server, which has no `assets` column at
 * all (D10 already has the file, referenced by id).
 */
export type ExportSceneJSON = SceneJSON & { id?: string; assets: ExportAssetEntry[] }

const ASSET_FETCH_ERROR = "Couldn't reach the server to fetch an uploaded model for export. Try again."

/**
 * §27: Export always reflects **current in-editor state**, so this
 * calls `serializeDraft()` directly (the same serializer `M6.5`'s Save
 * uses) rather than anything that could reflect a stale last-saved
 * snapshot. For each distinct uploaded `assetRef.key` referenced by the
 * scene, resolves its raw bytes from whichever place actually holds
 * them — `uploadedAssetsStore.uploads` covers **both** a fresh
 * this-session upload (`M5`) **and** an already-`M6.10`-resolved
 * server asset (that store is keyed by server id once resolved, so one
 * lookup covers both) — falling back to a direct `GET /assets/:id`
 * (`M6.4`, D10's ungated read) for a server-persisted asset this
 * session hasn't resolved yet (no need to fully re-parse into a scene
 * graph the way `resolveRemoteAsset.ts` does for rendering — Export only
 * needs the raw bytes). Aborts on the first failed fetch, returning
 * `{error}` — never a partial file.
 */
export async function buildExportDocument(): Promise<{ document: ExportSceneJSON } | { error: string }> {
  const base = serializeDraft()
  const sceneId = usePersistenceStore.getState().sceneId

  const uploadedKeys = Array.from(
    new Set(base.objects.filter((o) => o.assetRef.kind === 'uploaded').map((o) => o.assetRef.key)),
  )

  const assets: ExportAssetEntry[] = []
  for (const key of uploadedKeys) {
    const record = useUploadedAssetsStore.getState().uploads.find((u) => u.id === key)
    if (record) {
      const data = await readAsBase64(record.file)
      assets.push({ assetId: key, filename: record.filename, format: record.format, data })
      continue
    }

    let response: Response
    try {
      response = await apiFetch(`/assets/${key}`)
    } catch {
      return { error: ASSET_FETCH_ERROR }
    }
    if (!response.ok) return { error: ASSET_FETCH_ERROR }

    const disposition = response.headers.get('Content-Disposition') ?? ''
    const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? key
    const format = detectFormat(filename) ?? 'unknown'
    const buffer = await response.arrayBuffer()
    const data = await readAsBase64(new File([buffer], filename))
    assets.push({ assetId: key, filename, format, data })
  }

  return { document: { ...base, ...(sceneId ? { id: sceneId } : {}), assets } }
}

/** Derived from the scene name (free implementation choice, per the task file) — non-filename-safe characters stripped, whitespace collapsed to `-`. */
export function exportFilename(sceneName: string): string {
  const safe = sceneName.trim().replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-')
  return `${safe || 'scene'}.json`
}

interface ExportState {
  status: 'idle' | 'exporting' | 'error'
  errorMessage: string | null
  /** `download` is a parameter (defaulting to the real browser download), not a bare module call, purely so tests can inject a spy — same pattern `AssetLoader.ts`'s `parseUploadedFile`/`parse` param already established. */
  exportScene: (download?: (filename: string, content: string) => void) => Promise<void>
  dismissError: () => void
}

export const useExportStore = create<ExportState>((set) => ({
  status: 'idle',
  errorMessage: null,

  exportScene: async (download = downloadTextFile) => {
    set({ status: 'exporting', errorMessage: null })
    const result = await buildExportDocument()
    if ('error' in result) {
      set({ status: 'error', errorMessage: result.error })
      return
    }
    download(exportFilename(result.document.name), JSON.stringify(result.document, null, 2))
    set({ status: 'idle' })
  },

  dismissError: () => set({ status: 'idle', errorMessage: null }),
}))
