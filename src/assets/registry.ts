import type { BufferGeometry } from 'three'

/**
 * A collider **descriptor** only — plain data, never passed to a physics
 * engine at this point in the build. M3.1 reads these to construct real
 * Rapier colliders. Every built-in uses an exact primitive shape (D28:
 * convex-hull/trimesh is reserved exclusively for uploaded models, M5).
 */
export type ColliderDescriptor =
  | { shape: 'box'; halfExtents: [number, number, number] }
  | { shape: 'sphere'; radius: number }
  | { shape: 'cylinder'; radius: number; halfHeight: number }
  | { shape: 'cone'; radius: number; halfHeight: number }
  | { shape: 'capsule'; radius: number; halfHeight: number }

export type BuiltinCategory = 'primitive' | 'mechanical'

export interface BuiltinAssetDefinition {
  /** `assetRef.key`, e.g. `"primitive:cube"` (D22's key namespace example). */
  key: string
  /** §10's base display name, e.g. `"Cube"`. */
  displayName: string
  category: BuiltinCategory
  createGeometry: () => BufferGeometry
  /** Untilted/local-space collider — matches `createGeometry()` before `defaultRotation` is applied. */
  collider: ColliderDescriptor
  /**
   * Quaternion [x,y,z,w], identity for every built-in except Ramp. This is
   * the shape's own inherent base orientation (e.g. Ramp's incline) —
   * composed with the object's `transform.rotation` at render time
   * (`SceneObjects`), never baked into the geometry's vertices, so that
   * the collider descriptor above still matches the geometry exactly.
   * **M3.1 must apply this same composition** when building the Rapier
   * body's rotation, or a Ramp's visual tilt and its physical collider
   * will disagree.
   */
  defaultRotation: [number, number, number, number]
}

const IDENTITY_ROTATION: [number, number, number, number] = [0, 0, 0, 1]

/** Registered once, populated by `primitives/index.ts` and `mechanical/index.ts`. */
const definitions = new Map<string, BuiltinAssetDefinition>()

/** Geometry is created once per key and shared across every instance (§30 perf guidance). */
const geometryCache = new Map<string, BufferGeometry>()

export function registerBuiltinAsset(definition: BuiltinAssetDefinition): void {
  definitions.set(definition.key, definition)
}

export function getBuiltinAsset(key: string): BuiltinAssetDefinition | undefined {
  return definitions.get(key)
}

export function listBuiltinAssets(): BuiltinAssetDefinition[] {
  return [...definitions.values()]
}

export function getSharedGeometry(key: string): BufferGeometry | undefined {
  const definition = definitions.get(key)
  if (!definition) return undefined

  let geometry = geometryCache.get(key)
  if (!geometry) {
    geometry = definition.createGeometry()
    geometryCache.set(key, geometry)
  }
  return geometry
}

export { IDENTITY_ROTATION }
