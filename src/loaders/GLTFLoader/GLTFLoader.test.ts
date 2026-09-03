import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { AssetLoadError } from '../AssetLoader/types'
import { loadGLTF } from './GLTFLoader'

/** A 2x3x4 box — deterministic, easy-to-assert bounding-box dimensions. */
function makeBoxMesh(): Mesh {
  return new Mesh(new BoxGeometry(2, 3, 4), new MeshStandardMaterial())
}

async function exportGLB(mesh: Mesh): Promise<File> {
  const exporter = new GLTFExporter()
  const buffer = (await exporter.parseAsync(mesh, { binary: true })) as ArrayBuffer
  return new File([buffer], 'box.glb', { type: 'model/gltf-binary' })
}

async function exportGLTF(mesh: Mesh): Promise<File> {
  const exporter = new GLTFExporter()
  const json = (await exporter.parseAsync(mesh, { binary: false })) as object
  return new File([JSON.stringify(json)], 'box.gltf', { type: 'model/gltf+json' })
}

/**
 * A minimal, hand-authored glTF referencing an external texture image
 * that this single-file upload never provides — deliberately bypassing
 * `GLTFExporter` here (its `embedImages` path needs real canvas-based
 * PNG encoding, unreliable under jsdom) since this test only needs a
 * `materials[0]` pointing at an unresolvable `images[0].uri`, which is
 * plain JSON, no binary encoding involved.
 */
function makeGltfWithMissingTexture(): object {
  // A single degenerate triangle — geometry correctness doesn't matter
  // for this test, only that parsing succeeds despite the dangling
  // texture reference.
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])
  const base64 = Buffer.from(positions.buffer as ArrayBuffer).toString('base64')

  return {
    asset: { version: '2.0' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    textures: [{ source: 0 }],
    images: [{ uri: 'missing-texture.png' }],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        max: [1, 1, 0],
        min: [0, 0, 0],
      },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }],
    buffers: [{ byteLength: positions.byteLength, uri: `data:application/octet-stream;base64,${base64}` }],
  }
}

describe('loadGLTF (§12, M5.2)', () => {
  let glbFile: File
  let gltfFile: File

  beforeAll(async () => {
    glbFile = await exportGLB(makeBoxMesh())
    gltfFile = await exportGLTF(makeBoxMesh())
  })

  it('parses a valid .glb and extracts matching bounding-box dimensions and mesh count', async () => {
    const result = await loadGLTF(glbFile)

    expect(result.boundingBox.width).toBeCloseTo(2, 1)
    expect(result.boundingBox.height).toBeCloseTo(3, 1)
    expect(result.boundingBox.depth).toBeCloseTo(4, 1)
    expect(result.meshCount).toBe(1)
  })

  it('parses a valid embedded .gltf identically to the equivalent .glb', async () => {
    const result = await loadGLTF(gltfFile)

    expect(result.boundingBox.width).toBeCloseTo(2, 1)
    expect(result.boundingBox.height).toBeCloseTo(3, 1)
    expect(result.boundingBox.depth).toBeCloseTo(4, 1)
    expect(result.meshCount).toBe(1)
  })

  it('the returned filename/format/fileSize come from the File object, not parsed content', async () => {
    const result = await loadGLTF(glbFile)

    expect(result.filename).toBe('box.glb')
    expect(result.format).toBe('glb')
    expect(result.fileSize).toBe(glbFile.size)
  })

  it('detects .gltf (non-.glb extension) as format "gltf"', async () => {
    const result = await loadGLTF(gltfFile)
    expect(result.format).toBe('gltf')
  })

  it('a .gltf referencing an unresolvable external texture still parses successfully', async () => {
    const json = makeGltfWithMissingTexture()
    const file = new File([JSON.stringify(json)], 'missing-texture.gltf', { type: 'model/gltf+json' })

    const result = await loadGLTF(file)

    expect(result.meshCount).toBe(1)
  })

  it('a truncated/corrupt .glb rejects with a typed AssetLoadError, not an uncaught exception', async () => {
    const corrupt = new File([new Uint8Array([0x00, 0x01, 0x02, 0x03])], 'corrupt.glb', {
      type: 'model/gltf-binary',
    })

    await expect(loadGLTF(corrupt)).rejects.toBeInstanceOf(AssetLoadError)
    await expect(loadGLTF(corrupt)).rejects.toMatchObject({ reason: 'corrupt' })
  })

  it('a .gltf file with malformed JSON rejects with a typed AssetLoadError', async () => {
    const corrupt = new File(['{ this is not valid json'], 'corrupt.gltf', { type: 'model/gltf+json' })

    await expect(loadGLTF(corrupt)).rejects.toBeInstanceOf(AssetLoadError)
  })
})
