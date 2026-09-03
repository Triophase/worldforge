import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
// Side-effect import: populates the registry.
import './index'
import { getBuiltinAsset, getSharedGeometry, listBuiltinAssets } from './registry'

const EXPECTED_KEYS = [
  'primitive:cube',
  'primitive:sphere',
  'primitive:cylinder',
  'primitive:cone',
  'primitive:capsule',
  'mechanical:box',
  'mechanical:beam',
  'mechanical:wheel',
  'mechanical:axle',
  'mechanical:platform',
  'mechanical:ramp',
]

describe('built-in asset registry', () => {
  it('registers exactly the eleven built-ins §11 lists', () => {
    const keys = listBuiltinAssets().map((d) => d.key)
    expect(keys.sort()).toEqual([...EXPECTED_KEYS].sort())
  })

  it('every collider is one of box/sphere/cylinder/cone/capsule — never a hull or trimesh', () => {
    for (const definition of listBuiltinAssets()) {
      expect(['box', 'sphere', 'cylinder', 'cone', 'capsule']).toContain(definition.collider.shape)
    }
  })

  it("cube's box collider half-extents equal half the cube's edge length on each axis", () => {
    const cube = getBuiltinAsset('primitive:cube')!
    expect(cube.collider).toEqual({ shape: 'box', halfExtents: [0.5, 0.5, 0.5] })

    const geometry = getSharedGeometry('primitive:cube')!
    geometry.computeBoundingBox()
    const size = geometry.boundingBox!.getSize(new Vector3())
    expect(size.x / 2).toBeCloseTo(0.5)
    expect(size.y / 2).toBeCloseTo(0.5)
    expect(size.z / 2).toBeCloseTo(0.5)
  })

  it("sphere's collider radius matches the sphere geometry's radius", () => {
    const sphere = getBuiltinAsset('primitive:sphere')!
    expect(sphere.collider).toEqual({ shape: 'sphere', radius: 0.5 })
  })

  it('every shape has a hand-authored collider whose dimensions match its geometry factory\'s own construction args (spot check via a fresh geometry)', () => {
    // Re-derive a fresh geometry per definition (not the shared/cached one)
    // and confirm its bounding box matches the declared collider — proves
    // the collider wasn't just copy-pasted from a different shape.
    for (const definition of listBuiltinAssets()) {
      const geometry = definition.createGeometry()
      geometry.computeBoundingBox()
      const box = geometry.boundingBox!
      const halfX = (box.max.x - box.min.x) / 2
      const halfY = (box.max.y - box.min.y) / 2
      const halfZ = (box.max.z - box.min.z) / 2

      if (definition.collider.shape === 'box') {
        const [hx, hy, hz] = definition.collider.halfExtents
        expect(hx).toBeCloseTo(halfX, 1)
        expect(hy).toBeCloseTo(halfY, 1)
        expect(hz).toBeCloseTo(halfZ, 1)
      } else if (definition.collider.shape === 'sphere') {
        expect(definition.collider.radius).toBeCloseTo(halfX, 1)
      } else if (definition.collider.shape === 'capsule') {
        // Rapier/physics convention: a capsule's `halfHeight` is the half-
        // length of its cylindrical segment only, excluding the rounded
        // end caps — so the geometry's full bounding-box half-height is
        // `halfHeight + radius`, not `halfHeight` alone.
        expect(definition.collider.radius).toBeCloseTo(halfX, 1)
        expect(definition.collider.halfHeight + definition.collider.radius).toBeCloseTo(halfY, 1)
      } else {
        // cylinder/cone: radius ~ half the X/Z extent, halfHeight ~ half the Y extent
        expect(definition.collider.radius).toBeCloseTo(halfX, 1)
        expect(definition.collider.halfHeight).toBeCloseTo(halfY, 1)
      }
    }
  })

  it("ramp's geometry is a box, matched by a box collider, with a non-identity default rotation", () => {
    const ramp = getBuiltinAsset('mechanical:ramp')!
    expect(ramp.collider.shape).toBe('box')
    expect(ramp.defaultRotation).not.toEqual([0, 0, 0, 1])

    const geometry = getSharedGeometry('mechanical:ramp')!
    expect(geometry.type).toBe('BoxGeometry')
  })

  it('every other built-in has an identity default rotation', () => {
    for (const definition of listBuiltinAssets()) {
      if (definition.key === 'mechanical:ramp') continue
      expect(definition.defaultRotation).toEqual([0, 0, 0, 1])
    }
  })

  it('getSharedGeometry returns the same instance across calls (§30: geometry is reused, not recreated per object)', () => {
    const a = getSharedGeometry('primitive:cube')
    const b = getSharedGeometry('primitive:cube')
    expect(a).toBe(b)
  })
})
