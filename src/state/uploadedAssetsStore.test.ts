import { Group } from 'three'
import { beforeEach, describe, expect, it } from 'vitest'
import { useUploadedAssetsStore } from './uploadedAssetsStore'

describe('uploadedAssetsStore (D27, M5.1/M5.5)', () => {
  beforeEach(() => {
    useUploadedAssetsStore.setState({ uploads: [], lastUploadError: null, lastUploadErrorReason: null })
  })

  it('addUpload defaults unitScale to 1', () => {
    useUploadedAssetsStore.getState().addUpload({
      id: 'a',
      filename: 'model.glb',
      format: 'glb',
      fileSize: 10,
      object: new Group(),
      boundingBox: { width: 1, height: 1, depth: 1 },
      meshCount: 1,
      file: new File([], 'model.glb'),
    })

    expect(useUploadedAssetsStore.getState().uploads[0].unitScale).toBe(1)
  })

  it('setUnitScale updates exactly the matching record, leaving others untouched', () => {
    useUploadedAssetsStore.getState().addUpload({
      id: 'a',
      filename: 'a.glb',
      format: 'glb',
      fileSize: 10,
      object: new Group(),
      boundingBox: { width: 1, height: 1, depth: 1 },
      meshCount: 1,
      file: new File([], 'a.glb'),
    })
    useUploadedAssetsStore.getState().addUpload({
      id: 'b',
      filename: 'b.glb',
      format: 'glb',
      fileSize: 10,
      object: new Group(),
      boundingBox: { width: 1, height: 1, depth: 1 },
      meshCount: 1,
      file: new File([], 'b.glb'),
    })

    useUploadedAssetsStore.getState().setUnitScale('a', 3)

    const uploads = useUploadedAssetsStore.getState().uploads
    expect(uploads.find((u) => u.id === 'a')!.unitScale).toBe(3)
    expect(uploads.find((u) => u.id === 'b')!.unitScale).toBe(1)
  })

  it('addUpload defaults serverAssetId to null', () => {
    useUploadedAssetsStore.getState().addUpload({
      id: 'a',
      filename: 'model.glb',
      format: 'glb',
      fileSize: 10,
      object: new Group(),
      boundingBox: { width: 1, height: 1, depth: 1 },
      meshCount: 1,
      file: new File([], 'model.glb'),
    })

    expect(useUploadedAssetsStore.getState().uploads[0].serverAssetId).toBeNull()
  })

  it('M6.10: setServerAssetId marks exactly the matching record as persisted', () => {
    useUploadedAssetsStore.getState().addUpload({
      id: 'a',
      filename: 'a.glb',
      format: 'glb',
      fileSize: 10,
      object: new Group(),
      boundingBox: { width: 1, height: 1, depth: 1 },
      meshCount: 1,
      file: new File([], 'a.glb'),
    })

    useUploadedAssetsStore.getState().setServerAssetId('a', 'server-id-1')

    expect(useUploadedAssetsStore.getState().uploads[0].serverAssetId).toBe('server-id-1')
  })

  it('M6.10: cacheResolvedAsset adds a record keyed by the server asset id, already marked persisted', () => {
    useUploadedAssetsStore
      .getState()
      .cacheResolvedAsset(
        'server-id-1',
        { object: new Group(), boundingBox: { width: 1, height: 1, depth: 1 }, meshCount: 1, filename: 'x.glb', format: 'glb', fileSize: 10 },
        new File([], 'x.glb'),
      )

    const record = useUploadedAssetsStore.getState().uploads.find((u) => u.id === 'server-id-1')
    expect(record?.serverAssetId).toBe('server-id-1')
    expect(record?.unitScale).toBe(1)
  })

  it('M6.10: cacheResolvedAsset is a no-op if a record with that id already exists', () => {
    useUploadedAssetsStore.getState().addUpload({
      id: 'server-id-1',
      filename: 'original.glb',
      format: 'glb',
      fileSize: 10,
      object: new Group(),
      boundingBox: { width: 1, height: 1, depth: 1 },
      meshCount: 1,
      file: new File([], 'original.glb'),
    })

    useUploadedAssetsStore
      .getState()
      .cacheResolvedAsset(
        'server-id-1',
        { object: new Group(), boundingBox: { width: 1, height: 1, depth: 1 }, meshCount: 1, filename: 'x.glb', format: 'glb', fileSize: 10 },
        new File([], 'x.glb'),
      )

    expect(useUploadedAssetsStore.getState().uploads).toHaveLength(1)
    expect(useUploadedAssetsStore.getState().uploads[0].filename).toBe('original.glb')
  })
})
