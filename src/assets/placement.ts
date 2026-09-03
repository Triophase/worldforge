import { Box3, Plane, Raycaster, Vector2, Vector3 } from 'three'
import type { Camera, Object3D } from 'three'
import { getSharedGeometry } from './registry'

const boundingBoxCache = new Map<string, Box3>()

/**
 * The Y position that places `key`'s geometry with its bounding box's
 * bottom face exactly at world Y=0 (§11's placement rule), computed from
 * the *untilted* local geometry — Ramp's `defaultRotation` (registry.ts)
 * is intentionally not factored in here; see that file's doc comment for
 * why the tilt is applied at render time, not to the placement geometry.
 */
export function getBottomOffsetY(key: string): number {
  let box = boundingBoxCache.get(key)
  if (!box) {
    const geometry = getSharedGeometry(key)
    if (!geometry) return 0
    geometry.computeBoundingBox()
    box = geometry.boundingBox!
    boundingBoxCache.set(key, box)
  }
  return -box.min.y
}

/**
 * The `M5.7` equivalent of `getBottomOffsetY` for an uploaded asset:
 * there's no shared/cached registry geometry to measure (every upload is
 * its own arbitrary `Object3D` subtree), so this measures the parsed
 * object directly. Multiplies by `unitScale` (D27) since — unlike a
 * built-in, whose placement scale is always `[1,1,1]` — an uploaded
 * instance's initial `transform.scale` is the captured unit-scale, and
 * the offset must already account for that or the object won't actually
 * rest at Y=0 once scaled.
 */
export function getUploadedBottomOffsetY(object: Object3D, unitScale: number): number {
  const box = new Box3().setFromObject(object)
  return -box.min.y * unitScale
}

const GROUND_PLANE = new Plane(new Vector3(0, 1, 0), 0)

/**
 * Raycasts from `camera` through the point on `domElement` at
 * (clientX, clientY) against the world Y=0 plane. Returns `null` if the
 * point is outside `domElement`'s bounds or the ray never crosses the
 * plane (§11: "falling back to the click-to-add placement" is the
 * caller's job when this returns `null`, not this function's).
 */
export function raycastGroundPlane(
  camera: Camera,
  domElement: HTMLElement,
  clientX: number,
  clientY: number,
): Vector3 | null {
  const rect = domElement.getBoundingClientRect()
  const withinBounds =
    clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
  if (!withinBounds || rect.width === 0 || rect.height === 0) return null

  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1
  const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1

  const raycaster = new Raycaster()
  raycaster.setFromCamera(new Vector2(ndcX, ndcY), camera)

  const hit = new Vector3()
  return raycaster.ray.intersectPlane(GROUND_PLANE, hit) ? hit : null
}
