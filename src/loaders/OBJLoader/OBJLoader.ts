import { OBJLoader as ThreeOBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { measureObject } from '../AssetLoader/measureObject'
import { readAsText } from '../AssetLoader/readFile'
import type { ParsedAsset } from '../AssetLoader/types'
import { AssetLoadError } from '../AssetLoader/types'

/**
 * `M5.3`'s OBJ implementation of `M5.2`'s `FormatLoader` contract. Every
 * distinct `o`/`g` group in the file becomes its own `Mesh` child of the
 * returned `Group` (`THREE.OBJLoader`'s own behavior) — `measureObject`'s
 * shared mesh-count traversal reports that count directly, no OBJ-
 * specific logic needed. No `.mtl` companion is ever provided (`M5.1`
 * accepts one file per upload) — `OBJLoader` already falls back to its
 * own default material per node with no material data, which is idea.md
 * §26's "missing textures" graceful handling applied to OBJ, for free.
 *
 * `THREE.OBJLoader.parse()` is synchronous but, unlike `STLLoader`,
 * **does not throw** on unparseable text — its line-based parser just
 * warns and skips anything it doesn't recognize, so genuinely garbage
 * input silently produces an empty `Group`. A result with zero meshes
 * is treated as the same `'corrupt'` rejection `M5.2` established for
 * GLB/GLTF, rather than a silently-empty "successful" upload.
 */
export async function loadOBJ(file: File): Promise<ParsedAsset> {
  const text = await readAsText(file)
  const loader = new ThreeOBJLoader()

  let group: ReturnType<ThreeOBJLoader['parse']>
  try {
    group = loader.parse(text)
  } catch (error) {
    throw new AssetLoadError('corrupt', error instanceof Error ? error.message : `Failed to parse ${file.name}`)
  }

  const { boundingBox, meshCount } = measureObject(group)
  if (meshCount === 0) {
    throw new AssetLoadError('corrupt', `"${file.name}" doesn't contain any recognizable OBJ geometry.`)
  }

  return { object: group, boundingBox, meshCount, filename: file.name, format: 'obj', fileSize: file.size }
}
