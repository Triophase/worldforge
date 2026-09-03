import { Group } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SceneJSON } from './draftStore'
import { persistUploadedAssetsForSave } from './persistUploadedAssets'
import { useUploadedAssetsStore } from './uploadedAssetsStore'

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

const BASE_DOCUMENT: SceneJSON = {
  schemaVersion: 1,
  name: 'Scene',
  objects: [],
  joints: [],
  simulation: { speed: 1, snapping: { moveEnabled: true, moveSnap: 0.1, rotationEnabled: true, rotationSnapDeg: 15 } },
}

function objectWith(assetRef: { kind: 'builtin' | 'uploaded'; key: string }) {
  return {
    id: crypto.randomUUID(),
    name: 'Obj',
    assetRef,
    transform: { position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0, 1] as [number, number, number, number], scale: [1, 1, 1] as [number, number, number] },
    physics: { bodyType: 'static' as const, mass: 1, friction: 0.5, restitution: 0.3, gravity: true },
  }
}

function seedUpload(id: string, overrides: Partial<{ serverAssetId: string | null }> = {}) {
  useUploadedAssetsStore.getState().addUpload({
    id,
    filename: `${id}.glb`,
    format: 'glb',
    fileSize: 10,
    object: new Group(),
    boundingBox: { width: 1, height: 1, depth: 1 },
    meshCount: 1,
    file: new File([new Uint8Array([1, 2, 3])], `${id}.glb`),
  })
  if (overrides.serverAssetId) useUploadedAssetsStore.getState().setServerAssetId(id, overrides.serverAssetId)
}

describe('persistUploadedAssetsForSave (M6.10)', () => {
  beforeEach(() => {
    useUploadedAssetsStore.setState({ uploads: [], lastUploadError: null, lastUploadErrorReason: null, progress: null })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('a document with no uploaded objects is returned unchanged, with no network call', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const document = { ...BASE_DOCUMENT, objects: [objectWith({ kind: 'builtin', key: 'primitive:cube' })] }

    const result = await persistUploadedAssetsForSave(document)

    expect(result).toEqual({ document })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uploads a not-yet-persisted asset and rewrites assetRef.key to the server id', async () => {
    seedUpload('local-1')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'server-1', filename: 'local-1.glb' }, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const document = { ...BASE_DOCUMENT, objects: [objectWith({ kind: 'uploaded', key: 'local-1' })] }

    const result = await persistUploadedAssetsForSave(document)

    expect('document' in result).toBe(true)
    const saved = (result as { document: SceneJSON }).document
    expect(saved.objects[0]!.assetRef).toEqual({ kind: 'uploaded', key: 'server-1' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toMatch(/\/assets$/)
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    expect(useUploadedAssetsStore.getState().uploads.find((u) => u.id === 'local-1')?.serverAssetId).toBe('server-1')
  })

  it('does not re-upload an asset that already has a serverAssetId', async () => {
    seedUpload('local-1', { serverAssetId: 'server-1' })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const document = { ...BASE_DOCUMENT, objects: [objectWith({ kind: 'uploaded', key: 'local-1' })] }

    const result = await persistUploadedAssetsForSave(document)

    expect((result as { document: SceneJSON }).document.objects[0]!.assetRef.key).toBe('server-1')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uploads two distinct assets referenced by a mixed built-in/uploaded scene, remapping each independently', async () => {
    seedUpload('local-1')
    seedUpload('local-2')
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = init.body as FormData
      const file = body.get('file') as File
      return jsonResponse({ id: `server-${file.name}`, filename: file.name }, { status: 201 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const document = {
      ...BASE_DOCUMENT,
      objects: [
        objectWith({ kind: 'builtin', key: 'primitive:cube' }),
        objectWith({ kind: 'uploaded', key: 'local-1' }),
        objectWith({ kind: 'uploaded', key: 'local-2' }),
      ],
    }

    const result = await persistUploadedAssetsForSave(document)

    const saved = (result as { document: SceneJSON }).document
    expect(saved.objects[0]!.assetRef).toEqual({ kind: 'builtin', key: 'primitive:cube' })
    expect(saved.objects[1]!.assetRef).toEqual({ kind: 'uploaded', key: 'server-local-1.glb' })
    expect(saved.objects[2]!.assetRef).toEqual({ kind: 'uploaded', key: 'server-local-2.glb' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('aborts with the device-cap error and uploads nothing further when the per-device cap is hit', async () => {
    seedUpload('local-1')
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: 'over cap', reason: 'device-cap-exceeded' }), { status: 413 }))
    vi.stubGlobal('fetch', fetchMock)
    const document = { ...BASE_DOCUMENT, objects: [objectWith({ kind: 'uploaded', key: 'local-1' })] }

    const result = await persistUploadedAssetsForSave(document)

    expect('error' in result).toBe(true)
    expect((result as { error: string }).error).toMatch(/200MB/)
    expect(useUploadedAssetsStore.getState().uploads.find((u) => u.id === 'local-1')?.serverAssetId).toBeNull()
  })

  it('aborts with the per-file error when a single file exceeds the 25MB cap', async () => {
    seedUpload('local-1')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'too big', reason: 'file-too-large' }), { status: 413 })),
    )
    const document = { ...BASE_DOCUMENT, objects: [objectWith({ kind: 'uploaded', key: 'local-1' })] }

    const result = await persistUploadedAssetsForSave(document)

    expect((result as { error: string }).error).toMatch(/25MB/)
  })

  it('a network failure during upload aborts with a retryable error, never a thrown exception', async () => {
    seedUpload('local-1')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const document = { ...BASE_DOCUMENT, objects: [objectWith({ kind: 'uploaded', key: 'local-1' })] }

    const result = await persistUploadedAssetsForSave(document)

    expect('error' in result).toBe(true)
  })
})
