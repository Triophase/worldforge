import { apiFetch } from '../utils/apiClient'
import type { SceneJSON } from './draftStore'
import { useUploadedAssetsStore } from './uploadedAssetsStore'

export type PersistUploadedAssetsResult = { document: SceneJSON } | { error: string }

/**
 * `M6.10`: the "at that point it becomes associated with whichever
 * device identity performed the save" step from §12 — called by
 * `persistenceStore.save()` before the scene document itself is sent.
 * Deliberately a standalone function, not a `persistenceStore` method,
 * so it can import `uploadedAssetsStore` freely with zero risk of the
 * circular-import trap `draftStore.ts`/`persistenceStore.ts` already
 * avoid elsewhere (`uploadedAssetsStore` is a leaf — it imports nothing
 * that could import this back).
 *
 * Scans `document.objects` for every distinct uploaded `assetRef.key`,
 * uploads each not-yet-persisted one's original bytes to `POST /assets`,
 * and returns a **new** document with those keys rewritten to the
 * server-assigned asset ids — the live `sceneStore`/`uploadedAssetsStore`
 * are never mutated by the rewrite itself (only `setServerAssetId`,
 * which records persistence, not identity). A record already carrying a
 * `serverAssetId` (an earlier save, or a remotely-resolved asset that
 * was already known-persisted) is never re-uploaded — the one dedup
 * check the task requires. Aborts on the **first** failed upload and
 * returns `{ error }` — never a partially-remapped document — so a Save
 * can never leave the scene referencing an asset id that doesn't exist
 * server-side (§'s "not saved half-referencing" requirement).
 */
export async function persistUploadedAssetsForSave(document: SceneJSON): Promise<PersistUploadedAssetsResult> {
  const uploadedKeys = new Set(
    document.objects.filter((o) => o.assetRef.kind === 'uploaded').map((o) => o.assetRef.key),
  )
  if (uploadedKeys.size === 0) return { document }

  const keyMap = new Map<string, string>()

  for (const key of uploadedKeys) {
    const record = useUploadedAssetsStore.getState().uploads.find((u) => u.id === key)
    if (!record) continue // a stale reference — nothing to upload, leave the key as-is (matches the existing collider/render fallback for this case)

    if (record.serverAssetId) {
      keyMap.set(key, record.serverAssetId)
      continue
    }

    const formData = new FormData()
    formData.append('file', record.file, record.filename)

    let response: Response
    try {
      response = await apiFetch('/assets', { method: 'POST', body: formData })
    } catch {
      return { error: "Couldn't reach the server while uploading an attached model — the scene was not saved. Try again." }
    }

    if (!response.ok) {
      const body: { reason?: string } | null = await response.json().catch(() => null)
      return { error: assetUploadErrorMessage(body?.reason, record.filename) }
    }

    const saved = (await response.json()) as { id: string }
    useUploadedAssetsStore.getState().setServerAssetId(record.id, saved.id)
    keyMap.set(key, saved.id)
  }

  const objects = document.objects.map((object) => {
    if (object.assetRef.kind !== 'uploaded') return object
    const mapped = keyMap.get(object.assetRef.key)
    return mapped ? { ...object, assetRef: { ...object.assetRef, key: mapped } } : object
  })

  return { document: { ...document, objects } }
}

function assetUploadErrorMessage(reason: string | undefined, filename: string): string {
  switch (reason) {
    case 'device-cap-exceeded':
      return 'This device has exceeded its 200MB total upload storage — the scene was not saved.'
    case 'file-too-large':
      return `"${filename}" exceeds the 25MB per-file limit — the scene was not saved.`
    default:
      return `Couldn't upload "${filename}" — the scene was not saved. Try again.`
  }
}
