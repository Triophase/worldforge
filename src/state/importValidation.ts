import type { ExportAssetEntry, ExportSceneJSON } from './exportScene'
import type { JointEntity, SceneObject } from './sceneStore'

/** D22: exactly one schema version exists in V1 — no migration path yet. */
export const SUPPORTED_SCHEMA_VERSION = 1

export const IMPORT_INVALID_MESSAGE = "This file isn't a valid scene export."
export const IMPORT_NEWER_VERSION_MESSAGE = 'This file was created by a newer version of the app.'

/**
 * `M7.1`'s `ExportSceneJSON` **is** the shape a valid Import file has —
 * one shared type, not a second Import-specific one (matching D22's own
 * "there is only one scene-JSON shape" convention `M2.10` already
 * established for `SceneJSON` itself). `id` is intentionally never read
 * out of a validated file (see `draftStore.ts`'s `importScene`) — §27
 * treats Import exactly like opening a demo scene (D26), and a demo
 * scene never carries a server association either.
 */
export type ImportedSceneJSON = ExportSceneJSON

/**
 * §27's validation order, exactly: valid JSON (the caller's job, before
 * this is ever called) → required top-level fields → `schemaVersion`
 * supported → every uploaded object resolves within `assets`. Returns
 * the **first** failure — never a list, never partial data. A dangling
 * asset reference collapses to the same generic message as a missing
 * field (the task file's own explicit "treated as a missing-required-
 * field problem, not a separate error class" wording) — `schemaVersion`
 * newer than supported is the **only** distinctly-worded failure (D22's
 * own decision).
 */
export function validateImportedScene(raw: unknown): { scene: ImportedSceneJSON } | { error: string } {
  if (typeof raw !== 'object' || raw === null) return { error: IMPORT_INVALID_MESSAGE }
  const obj = raw as Record<string, unknown>

  const schemaVersion = obj.schemaVersion
  if (typeof schemaVersion !== 'number') return { error: IMPORT_INVALID_MESSAGE }
  if (schemaVersion > SUPPORTED_SCHEMA_VERSION) return { error: IMPORT_NEWER_VERSION_MESSAGE }
  if (schemaVersion !== SUPPORTED_SCHEMA_VERSION) return { error: IMPORT_INVALID_MESSAGE }

  if (!Array.isArray(obj.objects)) return { error: IMPORT_INVALID_MESSAGE }
  if (!Array.isArray(obj.joints)) return { error: IMPORT_INVALID_MESSAGE }
  if (typeof obj.simulation !== 'object' || obj.simulation === null) return { error: IMPORT_INVALID_MESSAGE }

  const objects = obj.objects as SceneObject[]
  const assets: ExportAssetEntry[] = Array.isArray(obj.assets) ? (obj.assets as ExportAssetEntry[]) : []
  const assetIds = new Set(assets.map((a) => a?.assetId))
  for (const object of objects) {
    if (object?.assetRef?.kind === 'uploaded' && !assetIds.has(object.assetRef.key)) {
      return { error: IMPORT_INVALID_MESSAGE }
    }
  }

  return {
    scene: {
      schemaVersion: SUPPORTED_SCHEMA_VERSION,
      name: typeof obj.name === 'string' && obj.name.trim() ? obj.name : 'Untitled Scene',
      objects,
      joints: obj.joints as JointEntity[],
      simulation: obj.simulation as ExportSceneJSON['simulation'],
      assets,
    },
  }
}
