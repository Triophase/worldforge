import type { Object3D } from 'three'

/** idea.md §11/spec §12's target format list. */
export type AssetFormat = 'glb' | 'gltf' | 'stl' | 'obj' | 'fbx'

export interface AssetBoundingBox {
  width: number
  height: number
  depth: number
}

/**
 * §12's metadata list, plus the parsed scene graph itself. `filename`/
 * `format`/`fileSize` are sourced from the original `File` object, never
 * re-derived from parsed content (`M5.2`'s own acceptance criterion) —
 * every format loader receives the same `File` and must read these the
 * same way.
 */
export interface ParsedAsset {
  object: Object3D
  boundingBox: AssetBoundingBox
  meshCount: number
  filename: string
  format: AssetFormat
  fileSize: number
}

export type AssetLoadErrorReason = 'corrupt' | 'unsupported'

/** A typed, recognizable rejection — never an uncaught exception (`M5.2`'s own requirement). */
export class AssetLoadError extends Error {
  reason: AssetLoadErrorReason

  constructor(reason: AssetLoadErrorReason, message: string) {
    super(message)
    this.name = 'AssetLoadError'
    this.reason = reason
  }
}

/**
 * The one contract every format loader implements (§12: "modular", one
 * implementation per format) — `M5.2` (GLB/GLTF) is the first; `M5.3`
 * (STL/OBJ) and `M5.4` (FBX) conform to this same shape without
 * modifying anything here.
 */
export type FormatLoader = (file: File) => Promise<ParsedAsset>
