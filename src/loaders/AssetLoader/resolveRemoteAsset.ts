import { useUploadedAssetsStore } from '../../state/uploadedAssetsStore'
import { apiFetch } from '../../utils/apiClient'
import { detectFormat, FORMAT_LOADERS } from './AssetLoader'

/**
 * `M6.10`: a scene opened in a session that never itself parsed a given
 * upload (a different device, or the same device after a reload — the
 * session-scoped `uploadedAssetsStore` never survives either) has no
 * local record for a persisted asset's id — `object.assetRef.key` is
 * the server asset id once a scene has been saved (`persistUploadedAssets.ts`'s
 * save-time rewrite). Module-level, not store state: nothing besides
 * this function needs to observe "is a fetch in flight," so a plain
 * `Set` avoids a state update per fetch start/end.
 */
const pendingResolves = new Set<string>()

/**
 * Fetches `GET /assets/:id` (D10: deliberately ungated, any device can
 * read) and re-parses the bytes with the same format loader an upload
 * would have used, then caches the result under `assetId` via
 * `uploadedAssetsStore.cacheResolvedAsset` so every consumer that
 * already looks up `uploads.find(u => u.id === key)` — `UploadedObjectMesh`,
 * `physicsStore`'s collider generation — resolves it exactly like an
 * ordinary session-local upload, no separate code path needed. A no-op
 * if already cached or a resolve for this id is already in flight;
 * fire-and-forget (callers don't await — the store update is what
 * triggers a re-render/rebuild).
 */
export function ensureRemoteAssetResolved(assetId: string): void {
  if (pendingResolves.has(assetId)) return
  if (useUploadedAssetsStore.getState().uploads.some((u) => u.id === assetId)) return
  pendingResolves.add(assetId)

  fetchAndParseRemoteAsset(assetId)
    .then((result) => {
      if (result) useUploadedAssetsStore.getState().cacheResolvedAsset(assetId, result.parsed, result.file)
    })
    .catch(() => {
      // Matches every other loader's own "typed rejection, never an
      // uncaught exception" contract (`types.ts`) — a failed resolve just
      // leaves the object rendering nothing, same as M5.7's pre-existing
      // "missing/unknown upload record" case, not a crash.
    })
    .finally(() => pendingResolves.delete(assetId))
}

async function fetchAndParseRemoteAsset(assetId: string) {
  const response = await apiFetch(`/assets/${assetId}`)
  if (!response.ok) return null

  const disposition = response.headers.get('Content-Disposition') ?? ''
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? assetId
  const format = detectFormat(filename)
  const loader = format ? FORMAT_LOADERS[format] : undefined
  if (!loader) return null

  // `response.arrayBuffer()`, not `.blob()`: a `File` wrapping a `Blob`
  // fetched from a real `Response` reads back as its own `toString()`
  // ("[object Blob]") under jsdom's `FileReader` (confirmed empirically
  // here) — the same cross-realm Blob/File interop gap `M5.2`'s memory
  // note already found for `.arrayBuffer()`/`.text()` directly on a
  // jsdom `File`, just hit from the opposite direction. A `File` built
  // from a real `ArrayBuffer` has no such issue.
  const buffer = await response.arrayBuffer()
  const file = new File([buffer], filename)
  const parsed = await loader(file)
  return { parsed, file }
}
