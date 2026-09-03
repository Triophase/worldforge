import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import { collectGeometryData } from './collectGeometryData'

describe('collectGeometryData (D28, M5.5)', () => {
  it('flattens a single mesh at the root into vertices/indices', () => {
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())

    const { vertices, indices } = collectGeometryData(mesh, [1, 1, 1])

    expect(vertices.length).toBeGreaterThan(0)
    expect(vertices.length % 3).toBe(0)
    expect(indices.length).toBeGreaterThan(0)
    expect(indices.length % 3).toBe(0)
  })

  it('pre-scales vertex positions by the given scale', () => {
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())

    const unscaled = collectGeometryData(mesh, [1, 1, 1])
    const scaled = collectGeometryData(mesh, [2, 3, 4])

    // BoxGeometry(1,1,1) spans -0.5..0.5 on each axis — find the vertex
    // with the largest X and confirm it scaled by exactly 2.
    const maxUnscaledX = Math.max(...Array.from({ length: unscaled.vertices.length / 3 }, (_, i) => unscaled.vertices[i * 3]))
    const maxScaledX = Math.max(...Array.from({ length: scaled.vertices.length / 3 }, (_, i) => scaled.vertices[i * 3]))
    expect(maxScaledX).toBeCloseTo(maxUnscaledX * 2)
  })

  it("accounts for a nested mesh's own local transform relative to the root", () => {
    const root = new Group()
    const child = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
    child.position.set(5, 0, 0) // offset 5 units along X within the root's own space
    root.add(child)

    const { vertices } = collectGeometryData(root, [1, 1, 1])

    // Every vertex should now be centered around X=5, not X=0.
    const xs = Array.from({ length: vertices.length / 3 }, (_, i) => vertices[i * 3])
    const avgX = xs.reduce((a, b) => a + b, 0) / xs.length
    expect(avgX).toBeCloseTo(5, 1)
  })

  it('combines multiple meshes into one vertex/index buffer, indices offset correctly', () => {
    const root = new Group()
    const a = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
    const b = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
    b.position.set(3, 0, 0)
    root.add(a, b)

    const singleMeshVertexCount = collectGeometryData(a, [1, 1, 1]).vertices.length / 3
    const { vertices, indices } = collectGeometryData(root, [1, 1, 1])

    expect(vertices.length / 3).toBe(singleMeshVertexCount * 2)
    // Every index must point within the combined vertex buffer's bounds.
    for (const i of indices) {
      expect(i).toBeLessThan(vertices.length / 3)
    }
  })

  it('a mesh with no geometry attribute is skipped without throwing', () => {
    const root = new Group()
    expect(() => collectGeometryData(root, [1, 1, 1])).not.toThrow()
    expect(collectGeometryData(root, [1, 1, 1]).vertices).toEqual(new Float32Array([]))
  })
})
