import { Mesh, BoxGeometry, MeshStandardMaterial } from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { beforeEach, describe, expect, it } from 'vitest'
import { useUploadedAssetsStore } from '../../state/uploadedAssetsStore'
import { decodeAndRegisterImportedAssets } from './importedAssets'

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

describe('decodeAndRegisterImportedAssets (M7.2)', () => {
  beforeEach(() => {
    useUploadedAssetsStore.setState({ uploads: [], lastUploadError: null, lastUploadErrorReason: null, progress: null })
  })

  it('decodes a base64 GLB entry and registers it in uploadedAssetsStore keyed by assetId', async () => {
    const exporter = new GLTFExporter()
    const buffer = (await exporter.parseAsync(
      new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()),
      { binary: true },
    )) as ArrayBuffer
    const data = bytesToBase64(new Uint8Array(buffer))

    await decodeAndRegisterImportedAssets([{ assetId: 'asset-1', filename: 'widget.glb', format: 'glb', data }])

    const record = useUploadedAssetsStore.getState().uploads.find((u) => u.id === 'asset-1')
    expect(record).toBeDefined()
    expect(record?.filename).toBe('widget.glb')
    expect(record?.serverAssetId).toBe('asset-1')
  })

  it('skips (does not register, does not throw) an entry with an unrecognized format/filename', async () => {
    await decodeAndRegisterImportedAssets([{ assetId: 'asset-2', filename: 'thing.xyz', format: 'xyz', data: 'YQ==' }])

    expect(useUploadedAssetsStore.getState().uploads).toHaveLength(0)
  })

  it('skips (does not throw) an entry with corrupt/unparseable bytes for its declared format', async () => {
    await decodeAndRegisterImportedAssets([{ assetId: 'asset-3', filename: 'corrupt.glb', format: 'glb', data: 'YQ==' }])

    expect(useUploadedAssetsStore.getState().uploads).toHaveLength(0)
  })

  it('is a no-op for an assetId already present in the store', async () => {
    useUploadedAssetsStore.getState().addUpload({
      id: 'asset-1',
      filename: 'existing.glb',
      format: 'glb',
      fileSize: 1,
      object: new Mesh(),
      boundingBox: { width: 1, height: 1, depth: 1 },
      meshCount: 1,
      file: new File([], 'existing.glb'),
    })

    await decodeAndRegisterImportedAssets([{ assetId: 'asset-1', filename: 'widget.glb', format: 'glb', data: 'YQ==' }])

    expect(useUploadedAssetsStore.getState().uploads).toHaveLength(1)
    expect(useUploadedAssetsStore.getState().uploads[0]!.filename).toBe('existing.glb')
  })

  it('an empty assets array does nothing', async () => {
    await decodeAndRegisterImportedAssets([])
    expect(useUploadedAssetsStore.getState().uploads).toHaveLength(0)
  })
})
