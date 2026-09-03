import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { describe, expect, it } from 'vitest'
import { AssetLoadError } from '../AssetLoader/types'
import { loadSTL } from './STLLoader'

function makeBoxMesh(): Mesh {
  return new Mesh(new BoxGeometry(2, 3, 4), new MeshStandardMaterial())
}

describe('loadSTL (§14, M5.3)', () => {
  it('parses a valid binary STL with correct bounding-box dimensions and meshCount === 1', async () => {
    const view = new STLExporter().parse(makeBoxMesh(), { binary: true })
    const file = new File([view], 'box.stl', { type: 'model/stl' })

    const result = await loadSTL(file)

    expect(result.boundingBox.width).toBeCloseTo(2, 1)
    expect(result.boundingBox.height).toBeCloseTo(3, 1)
    expect(result.boundingBox.depth).toBeCloseTo(4, 1)
    expect(result.meshCount).toBe(1)
    expect(result.format).toBe('stl')
    expect(result.filename).toBe('box.stl')
    expect(result.fileSize).toBe(file.size)
  })

  it('parses a valid ASCII STL identically to the equivalent binary STL', async () => {
    const text = new STLExporter().parse(makeBoxMesh(), { binary: false }) as string
    const file = new File([text], 'box-ascii.stl', { type: 'model/stl' })

    const result = await loadSTL(file)

    expect(result.boundingBox.width).toBeCloseTo(2, 1)
    expect(result.boundingBox.height).toBeCloseTo(3, 1)
    expect(result.boundingBox.depth).toBeCloseTo(4, 1)
    expect(result.meshCount).toBe(1)
  })

  it('a truncated/corrupt .stl rejects with a typed AssetLoadError, not an uncaught exception', async () => {
    const corrupt = new File([new Uint8Array([1, 2, 3, 4, 5])], 'corrupt.stl', { type: 'model/stl' })

    await expect(loadSTL(corrupt)).rejects.toBeInstanceOf(AssetLoadError)
    await expect(loadSTL(corrupt)).rejects.toMatchObject({ reason: 'corrupt' })
  })
})
