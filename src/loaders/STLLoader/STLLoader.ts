import { Mesh, MeshStandardMaterial } from 'three'
import { STLLoader as ThreeSTLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { measureObject } from '../AssetLoader/measureObject'
import { readAsArrayBuffer } from '../AssetLoader/readFile'
import type { ParsedAsset } from '../AssetLoader/types'
import { AssetLoadError } from '../AssetLoader/types'

/**
 * `M5.3`'s STL implementation of `M5.2`'s `FormatLoader` contract.
 * `THREE.STLLoader.parse()` auto-detects binary vs. ASCII STL from the
 * same `ArrayBuffer` (§14: both are valid STL) and is synchronous,
 * throwing directly on malformed input rather than using a callback —
 * caught here and converted to the same typed `AssetLoadError` `M5.2`
 * established. STL geometry is always a single triangle soup with no
 * named sub-meshes (§14) — wrapping it in exactly one `Mesh` and
 * reusing `measureObject`'s own traversal naturally yields
 * `meshCount === 1` without a hardcoded special case.
 */
export async function loadSTL(file: File): Promise<ParsedAsset> {
  const buffer = await readAsArrayBuffer(file)
  const loader = new ThreeSTLLoader()

  let mesh: Mesh
  try {
    mesh = new Mesh(loader.parse(buffer), new MeshStandardMaterial())
  } catch (error) {
    throw new AssetLoadError('corrupt', error instanceof Error ? error.message : `Failed to parse ${file.name}`)
  }

  const { boundingBox, meshCount } = measureObject(mesh)
  return { object: mesh, boundingBox, meshCount, filename: file.name, format: 'stl', fileSize: file.size }
}
