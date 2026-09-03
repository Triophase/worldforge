import { GLTFLoader as ThreeGLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { measureObject } from '../AssetLoader/measureObject'
import { readAsArrayBuffer, readAsText } from '../AssetLoader/readFile'
import type { AssetFormat, ParsedAsset } from '../AssetLoader/types'
import { AssetLoadError } from '../AssetLoader/types'

function detectFormat(filename: string): AssetFormat {
  return filename.toLowerCase().endsWith('.glb') ? 'glb' : 'gltf'
}

/**
 * `M5.2`'s GLB/GLTF implementation of `AssetLoader/types.ts`'s
 * `FormatLoader` contract. Reads the file client-side (`ArrayBuffer` for
 * binary `.glb`, text for JSON `.gltf` — `GLTFLoader.parse()` branches
 * on `typeof data` itself, so this just picks the right `File` read for
 * the detected extension) — never a network fetch, the file is already
 * local (`M5.1`'s Context).
 *
 * A `.gltf` with an external resource (companion `.bin`, texture image)
 * this single-file upload can't resolve is **not** treated as a load
 * failure: `path: ''` means those references simply never resolve, and
 * Three's own `GLTFLoader`/`LoadingManager` design tolerates a failed
 * texture load without rejecting the overall parse — idea.md §26's
 * "handle missing textures" requirement falls out of that existing
 * behavior for free, not anything built here.
 */
export function loadGLTF(file: File): Promise<ParsedAsset> {
  const format = detectFormat(file.name)
  const loader = new ThreeGLTFLoader()

  const read = format === 'glb' ? readAsArrayBuffer(file) : readAsText(file)

  return read.then(
    (data) =>
      new Promise<ParsedAsset>((resolve, reject) => {
        const fail = (error: unknown) =>
          reject(
            new AssetLoadError('corrupt', error instanceof Error ? error.message : `Failed to parse ${file.name}`),
          )

        // A malformed buffer (e.g. a truncated `.glb`, invalid JSON in a
        // `.gltf`) makes `GLTFLoader.parse()` throw synchronously rather
        // than call its own `onError` — caught here and converted to the
        // same typed `AssetLoadError`, so callers see one consistent
        // rejection shape regardless of which path failed.
        try {
          loader.parse(
            data,
            '',
            (gltf) => {
              const { boundingBox, meshCount } = measureObject(gltf.scene)
              resolve({
                object: gltf.scene,
                boundingBox,
                meshCount,
                filename: file.name,
                format,
                fileSize: file.size,
              })
            },
            fail,
          )
        } catch (error) {
          fail(error)
        }
      }),
  )
}
