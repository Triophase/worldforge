import type { Mesh, Object3D } from 'three'
import { Vector3 } from 'three'

export interface GeometryData {
  /** Flattened `[x,y,z, x,y,z, ...]` vertex positions, expressed in `root`'s own local frame and pre-scaled by `scale` — never a separate Rapier-side scale step. */
  vertices: Float32Array
  /** Triangle indices into `vertices`, offset per mesh as they're accumulated — always present, even for an unindexed source geometry (a trivial `0,1,2,...` sequence in that case). */
  indices: Uint32Array
}

/**
 * D28's collider generation reads directly from `M5.2`'s already-parsed
 * `Object3D` — never a re-parse of the source file. Every mesh in
 * `root`'s subtree (a parsed upload is commonly a `Group`/`Scene` with
 * several mesh children, not one) is flattened into a single combined
 * vertex/index buffer, each mesh's own local geometry first converted
 * mesh-local → world → `root`-local (`mesh.localToWorld` then
 * `root.worldToLocal`) so a nested mesh's own sub-transform is baked in
 * correctly, exactly like `THREE.Box3.setFromObject`'s own traversal
 * already does for the bounding box. Vertices are pre-scaled by `scale`
 * (the `SceneObject`'s own `transform.scale`) here, not left to a
 * Rapier-side scale API — convex-hull/trimesh colliders have no
 * uniform "resize after construction" operation, unlike a built-in's
 * primitive half-extents/radius.
 */
export function collectGeometryData(root: Object3D, scale: [number, number, number]): GeometryData {
  root.updateMatrixWorld(true)

  const positions: number[] = []
  const indices: number[] = []
  const [sx, sy, sz] = scale
  const v = new Vector3()

  root.traverse((node) => {
    const mesh = node as Mesh
    if (!mesh.isMesh) return

    const geometry = mesh.geometry
    const posAttr = geometry.getAttribute('position')
    if (!posAttr) return

    const vertexOffset = positions.length / 3
    for (let i = 0; i < posAttr.count; i++) {
      v.fromBufferAttribute(posAttr, i)
      mesh.localToWorld(v)
      root.worldToLocal(v)
      positions.push(v.x * sx, v.y * sy, v.z * sz)
    }

    if (geometry.index) {
      for (let i = 0; i < geometry.index.count; i++) {
        indices.push(vertexOffset + geometry.index.getX(i))
      }
    } else {
      for (let i = 0; i < posAttr.count; i++) {
        indices.push(vertexOffset + i)
      }
    }
  })

  return { vertices: new Float32Array(positions), indices: new Uint32Array(indices) }
}
