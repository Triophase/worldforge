import { create } from 'zustand'
import type { AssetLoadErrorReason, ParsedAsset } from '../loaders/AssetLoader/types'

/**
 * `M5.1` established the slice's shape; `M5.2` populates `uploads` with
 * real parsed data — `id` plus every `ParsedAsset` field (the parsed
 * `Object3D`, bounding box, mesh count, filename/format/fileSize).
 * `unitScale` (D27, `M5.5`) is captured once per upload — a single
 * numeric value, default `1`, that becomes every placed instance's
 * uniform `transform.scale` (`M5.7`'s click/drag placement reads this
 * field directly; it is never re-derived per placement). Session-scoped
 * only (D11's own wording, `M5.1`'s Context): never written to
 * `localStorage` or a server, kept entirely separate from
 * `sceneStore`/`draftStore` per state-architecture's existing boundary
 * convention (§30) — an uploaded asset isn't scene content until an
 * object actually references it.
 */
export interface UploadedAssetRecord extends ParsedAsset {
  id: string
  unitScale: number
  /**
   * `M6.10`: the raw bytes this record was parsed from — kept so a Save
   * can re-`POST` them to `M6.4`'s `/assets` without re-prompting the
   * user. For a record resolved *remotely* (`cacheResolvedAsset`, a
   * scene opened by a session that never itself uploaded the file), this
   * is the file reconstructed from `GET /assets/:id`'s response, not the
   * original browser `File` object — byte-identical, still re-uploadable
   * if needed, so no second "kind" of record is required.
   */
  file: File
  /**
   * `M6.10`: `null` until this upload has been persisted server-side by
   * a Save (or was itself resolved from a persisted asset via
   * `cacheResolvedAsset`, which sets it immediately since the bytes are
   * already known-persisted). A non-null value is what lets a
   * subsequent Save of the same scene skip re-uploading — checked by
   * `id`, never re-derived from `assetRef.key` (which never changes on
   * the live record itself, only in the outgoing save document).
   */
  serverAssetId: string | null
}

interface UploadedAssetsState {
  uploads: UploadedAssetRecord[]
  /**
   * §24, `M5.6`: `0`-`100` while a file is being read/parsed/recorded,
   * `null` while idle. Coarse, stage-based checkpoints (selected → read
   * → parsed → stored), not real byte-level progress — Three.js's
   * synchronous/local-file loaders (`M5.2`/`M5.3`) expose no mid-parse
   * progress callback for a `File` already in memory (only for a
   * network `.load()`, which this app never uses, per `M5.1`'s
   * Context) — but it is still determinate (always advances toward
   * `100` from a known starting point), never an indeterminate spinner.
   */
  progress: number | null
  /** Set on any rejected upload attempt (oversized, corrupt, unsupported); cleared on the next accepted one. Final, display-ready copy (§25) — never a raw loader/parser exception message, mapped before it ever reaches this store. */
  lastUploadError: string | null
  /** `M5.2`: the rejection's machine-readable reason, alongside the human-readable `lastUploadError` message — `'oversized'` for M5.1's own cap, or a loader's `AssetLoadError.reason`. */
  lastUploadErrorReason: AssetLoadErrorReason | 'oversized' | null
  addUpload: (record: Omit<UploadedAssetRecord, 'unitScale' | 'serverAssetId'>) => void
  /** D27: updates one upload's captured unit-scale value — never a per-placement setting, the same record's value applies to every instance placed from it. */
  setUnitScale: (id: string, unitScale: number) => void
  setProgress: (value: number | null) => void
  setUploadError: (message: string, reason: AssetLoadErrorReason | 'oversized') => void
  clearUploadError: () => void
  /** `M6.10`: records that a save has persisted this upload server-side under `serverAssetId` — a later save of the same scene reads this to skip re-uploading. */
  setServerAssetId: (id: string, serverAssetId: string) => void
  /**
   * `M6.10`: caches a record fetched+re-parsed from `GET /assets/:id`
   * under the server asset id itself (so `object.assetRef.key` — the
   * server id, once a scene has been saved — resolves through the same
   * `uploads.find(u => u.id === key)` lookup every other consumer
   * already uses). A no-op if a record with that id already exists —
   * whichever arrived first (a real upload, or an earlier resolve) wins.
   */
  cacheResolvedAsset: (assetId: string, parsed: ParsedAsset, file: File) => void
}

export const useUploadedAssetsStore = create<UploadedAssetsState>((set) => ({
  uploads: [],
  progress: null,
  lastUploadError: null,
  lastUploadErrorReason: null,
  addUpload: (record) => set((s) => ({ uploads: [...s.uploads, { ...record, unitScale: 1, serverAssetId: null }] })),
  setUnitScale: (id, unitScale) =>
    set((s) => ({ uploads: s.uploads.map((u) => (u.id === id ? { ...u, unitScale } : u)) })),
  setProgress: (value) => set({ progress: value }),
  setUploadError: (message, reason) => set({ lastUploadError: message, lastUploadErrorReason: reason, progress: null }),
  clearUploadError: () => set({ lastUploadError: null, lastUploadErrorReason: null }),
  setServerAssetId: (id, serverAssetId) =>
    set((s) => ({ uploads: s.uploads.map((u) => (u.id === id ? { ...u, serverAssetId } : u)) })),
  cacheResolvedAsset: (assetId, parsed, file) =>
    set((s) =>
      s.uploads.some((u) => u.id === assetId)
        ? s
        : { uploads: [...s.uploads, { id: assetId, ...parsed, unitScale: 1, file, serverAssetId: assetId }] },
    ),
}))
