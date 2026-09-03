import type { Mesh, Object3D } from 'three'
import { Box3, Vector3 } from 'three'
import type { AssetBoundingBox } from './types'

/**
 * §12's bounding-box/mesh-count metadata, computed identically for every
 * format — the one place this measurement happens, so `M5.3`/`M5.4`
 * reuse it rather than each re-deriving their own.
 */
export function measureObject(object: Object3D): { boundingBox: AssetBoundingBox; meshCount: number } {
  const box = new Box3().setFromObject(object)
  const size = box.getSize(new Vector3())

  let meshCount = 0
  object.traverse((node) => {
    if ((node as Mesh).isMesh) meshCount++
  })

  return {
    boundingBox: { width: size.x, height: size.y, depth: size.z },
    meshCount,
  }
}
