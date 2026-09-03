import { useUploadedAssetsStore } from '../../state/uploadedAssetsStore'
import type { ExportAssetEntry } from '../../state/exportScene'
import { detectFormat, FORMAT_LOADERS } from './AssetLoader'

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/**
 * `M7.2`: reverses `M7.1`'s `readAsBase64` embedding — decodes each
 * Export-file `assets` entry back into a `File` and re-parses it through
 * the same `FORMAT_LOADERS` table a fresh upload uses, then registers it
 * in `uploadedAssetsStore` via `M6.10`'s `cacheResolvedAsset` (keyed by
 * the file's own `assetId`, exactly what the imported objects'
 * `assetRef.key`s already reference) — the session's "Uploaded" category
 * gains the reconstituted model with no new registration mechanism.
 * Skips (never fails the whole import for) an entry whose format can't
 * be dispatched or whose bytes fail to parse — `validateImportedScene`
 * only confirmed every reference *resolves to an entry*, not that every
 * entry is *parseable*; a corrupt embedded asset degrades the same way
 * `M5.7`'s existing "missing/unknown upload record" case already does,
 * not a fatal Import error.
 */
export async function decodeAndRegisterImportedAssets(assets: ExportAssetEntry[]): Promise<void> {
  for (const entry of assets) {
    if (useUploadedAssetsStore.getState().uploads.some((u) => u.id === entry.assetId)) continue

    const format = detectFormat(entry.filename)
    const loader = format ? FORMAT_LOADERS[format] : undefined
    if (!loader) continue

    const file = new File([base64ToBytes(entry.data)], entry.filename)
    try {
      const parsed = await loader(file)
      useUploadedAssetsStore.getState().cacheResolvedAsset(entry.assetId, parsed, file)
    } catch {
      // corrupt/unparseable embedded asset bytes — skip, not fatal.
    }
  }
}
