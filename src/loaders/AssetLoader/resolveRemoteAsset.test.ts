import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUploadedAssetsStore } from '../../state/uploadedAssetsStore'
import { ensureRemoteAssetResolved } from './resolveRemoteAsset'

describe('ensureRemoteAssetResolved (M6.10)', () => {
  beforeEach(() => {
    useUploadedAssetsStore.setState({ uploads: [], lastUploadError: null, lastUploadErrorReason: null, progress: null })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches, parses, and caches a server asset under its own id', async () => {
    const exporter = new GLTFExporter()
    const buffer = (await exporter.parseAsync(
      new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()),
      { binary: true },
    )) as ArrayBuffer
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(buffer, {
          status: 200,
          headers: { 'Content-Disposition': 'attachment; filename="thing.glb"' },
        }),
      ),
    )

    ensureRemoteAssetResolved('server-1')

    await vi.waitFor(() => {
      expect(useUploadedAssetsStore.getState().uploads.find((u) => u.id === 'server-1')).toBeDefined()
    })
    const record = useUploadedAssetsStore.getState().uploads.find((u) => u.id === 'server-1')!
    expect(record.serverAssetId).toBe('server-1')
    expect(record.filename).toBe('thing.glb')
  })

  it('is a no-op if a record with that id already exists', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    useUploadedAssetsStore.getState().addUpload({
      id: 'server-1',
      filename: 'a.glb',
      format: 'glb',
      fileSize: 1,
      object: new Mesh(),
      boundingBox: { width: 1, height: 1, depth: 1 },
      meshCount: 1,
      file: new File([], 'a.glb'),
    })

    ensureRemoteAssetResolved('server-1')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('leaves no record cached (and does not throw) when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    expect(() => ensureRemoteAssetResolved('server-2')).not.toThrow()
    await vi.waitFor(() => {
      // give the rejected promise a tick to settle
      expect(useUploadedAssetsStore.getState().uploads.find((u) => u.id === 'server-2')).toBeUndefined()
    })
  })

  it('a second call while the first is still in flight does not issue a second fetch', async () => {
    let resolveFetch: (r: Response) => void
    const fetchMock = vi.fn().mockReturnValue(new Promise<Response>((resolve) => (resolveFetch = resolve)))
    vi.stubGlobal('fetch', fetchMock)

    ensureRemoteAssetResolved('server-3')
    ensureRemoteAssetResolved('server-3')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    resolveFetch!(new Response(null, { status: 404 }))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })
})
