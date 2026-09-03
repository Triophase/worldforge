import { Group } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getLastActiveSceneId } from '../utils/lastActiveScene'
import { useSceneStore } from './sceneStore'
import { usePersistenceStore } from './persistenceStore'
import { useUploadedAssetsStore } from './uploadedAssetsStore'
import type { SceneJSON } from './draftStore'

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

const DOCUMENT: SceneJSON = {
  schemaVersion: 1,
  name: 'My Scene',
  objects: [],
  joints: [],
  simulation: { speed: 1, snapping: { moveEnabled: true, moveSnap: 0.1, rotationEnabled: true, rotationSnapDeg: 15 } },
}

describe('persistenceStore (M6.5)', () => {
  beforeEach(() => {
    usePersistenceStore.setState({
      sceneId: null,
      isOwner: false,
      saveStatus: 'idle',
      lastSaveDocument: null,
      saveErrorMessage: null,
      myScenesOpen: false,
      myScenes: null,
      listStatus: 'idle',
      linkOpenStatus: 'idle',
    })
    useSceneStore.setState({ isDirty: true })
    useUploadedAssetsStore.setState({ uploads: [], lastUploadError: null, lastUploadErrorReason: null, progress: null })
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('M6.10: uploaded-asset persistence during save', () => {
    function documentWithUpload(uploadId: string): SceneJSON {
      return {
        ...DOCUMENT,
        objects: [
          {
            id: 'obj-1',
            name: 'Widget',
            assetRef: { kind: 'uploaded', key: uploadId },
            transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
            physics: { bodyType: 'static', mass: 1, friction: 0.5, restitution: 0.3, gravity: true },
          },
        ],
      }
    }

    function seedUpload(id: string) {
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
    }

    it('save() uploads a referenced not-yet-persisted asset before POSTing the scene, with the remapped key', async () => {
      seedUpload('local-1')
      const fetchMock = vi.fn((url: string, _init?: RequestInit) => {
        if (String(url).endsWith('/assets')) return Promise.resolve(jsonResponse({ id: 'server-1' }, { status: 201 }))
        return Promise.resolve(
          jsonResponse({ ...DOCUMENT, id: 's1', isOwner: true, createdAt: 'now', updatedAt: 'now' }, { status: 201 }),
        )
      })
      vi.stubGlobal('fetch', fetchMock)

      await usePersistenceStore.getState().save(documentWithUpload('local-1'))

      expect(fetchMock).toHaveBeenCalledTimes(2)
      const sceneCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/scenes'))!
      const sentBody = JSON.parse(sceneCall[1]!.body as string)
      expect(sentBody.objects[0].assetRef).toEqual({ kind: 'uploaded', key: 'server-1' })
      expect(usePersistenceStore.getState().saveStatus).toBe('idle')
    })

    it('save() does not re-upload an asset already persisted by an earlier save', async () => {
      seedUpload('local-1')
      useUploadedAssetsStore.getState().setServerAssetId('local-1', 'server-1')
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse({ ...DOCUMENT, id: 's1', isOwner: true, createdAt: 'now', updatedAt: 'now' }, { status: 201 }),
      )
      vi.stubGlobal('fetch', fetchMock)

      await usePersistenceStore.getState().save(documentWithUpload('local-1'))

      expect(fetchMock).toHaveBeenCalledTimes(1) // /scenes only — no /assets call
      expect(String(fetchMock.mock.calls[0]![0])).toMatch(/\/scenes$/)
    })

    it('save() fails as a whole with a named-cap message when the asset upload hits the 200MB device cap, never calling /scenes', async () => {
      seedUpload('local-1')
      const fetchMock = vi
        .fn()
        .mockResolvedValue(new Response(JSON.stringify({ error: 'over cap', reason: 'device-cap-exceeded' }), { status: 413 }))
      vi.stubGlobal('fetch', fetchMock)

      await usePersistenceStore.getState().save(documentWithUpload('local-1'))

      expect(usePersistenceStore.getState().saveStatus).toBe('error')
      expect(usePersistenceStore.getState().saveErrorMessage).toMatch(/200MB/)
      expect(fetchMock).toHaveBeenCalledTimes(1) // only the /assets attempt — /scenes never called
      expect(usePersistenceStore.getState().sceneId).toBeNull()
    })
  })

  it('save() with no sceneId POSTs, then stores the returned id/isOwner and clears isDirty', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ ...DOCUMENT, id: 's1', isOwner: true, createdAt: 'now', updatedAt: 'now' }, { status: 201 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await usePersistenceStore.getState().save(DOCUMENT)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toMatch(/\/scenes$/)
    expect(init.method).toBe('POST')
    expect(usePersistenceStore.getState().sceneId).toBe('s1')
    expect(usePersistenceStore.getState().isOwner).toBe(true)
    expect(useSceneStore.getState().isDirty).toBe(false)
    expect(getLastActiveSceneId()).toBe('s1') // D43: a successful save (first-save or fork) is a resume trigger.
  })

  it('save() with an owned sceneId PUTs to that scene', async () => {
    usePersistenceStore.setState({ sceneId: 's1', isOwner: true })
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ ...DOCUMENT, id: 's1', isOwner: true, createdAt: 'now', updatedAt: 'later' }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await usePersistenceStore.getState().save(DOCUMENT)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toMatch(/\/scenes\/s1$/)
    expect(init.method).toBe('PUT')
  })

  it('save() with a sceneId but isOwner false POSTs (fork), never overwriting someone else\'s scene', async () => {
    usePersistenceStore.setState({ sceneId: 's1', isOwner: false })
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ ...DOCUMENT, id: 's2', isOwner: true, createdAt: 'now', updatedAt: 'now' }, { status: 201 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await usePersistenceStore.getState().save(DOCUMENT)

    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toMatch(/\/scenes$/)
    expect(init.method).toBe('POST')
    expect(usePersistenceStore.getState().sceneId).toBe('s2')
  })

  it('save() sets saveStatus to error on a failed response, without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })))

    await usePersistenceStore.getState().save(DOCUMENT)

    expect(usePersistenceStore.getState().saveStatus).toBe('error')
  })

  describe('D15/M6.8: backend-down resilience', () => {
    it('a network failure (fetch rejects) sets saveStatus to "error" and never touches sceneStore', async () => {
      const cube = useSceneStore.getState().addObject({ kind: 'builtin', key: 'primitive:cube' }, 'Cube')
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

      await usePersistenceStore.getState().save(DOCUMENT)

      expect(usePersistenceStore.getState().saveStatus).toBe('error')
      expect(usePersistenceStore.getState().sceneId).toBeNull() // untouched — no fake id assigned
      expect(useSceneStore.getState().objects).toEqual([cube]) // the draft itself is completely unaffected
    })

    it('a 403 sets saveStatus to "forbidden", distinct from a generic network failure', async () => {
      usePersistenceStore.setState({ sceneId: 's1', isOwner: true }) // simulates stale ownership info
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })))

      await usePersistenceStore.getState().save(DOCUMENT)

      expect(usePersistenceStore.getState().saveStatus).toBe('forbidden')
    })

    it('retrySave() resubmits the exact last document with no caller re-serialization', async () => {
      const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(
        jsonResponse({ ...DOCUMENT, id: 's1', isOwner: true, createdAt: 'now', updatedAt: 'now' }, { status: 201 }),
      )
      vi.stubGlobal('fetch', fetchMock)

      await usePersistenceStore.getState().save(DOCUMENT)
      expect(usePersistenceStore.getState().saveStatus).toBe('error')

      await usePersistenceStore.getState().retrySave()

      expect(fetchMock).toHaveBeenCalledTimes(2)
      const secondCallBody = JSON.parse(fetchMock.mock.calls[1]![1].body)
      expect(secondCallBody).toEqual(DOCUMENT)
      expect(usePersistenceStore.getState().saveStatus).toBe('idle')
      expect(usePersistenceStore.getState().sceneId).toBe('s1')
    })

    it('retrySave() is a no-op if no save has ever been attempted', async () => {
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      await usePersistenceStore.getState().retrySave()

      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('dismissSaveError() clears saveStatus without discarding lastSaveDocument', () => {
      usePersistenceStore.setState({ saveStatus: 'error', lastSaveDocument: DOCUMENT })
      usePersistenceStore.getState().dismissSaveError()

      expect(usePersistenceStore.getState().saveStatus).toBe('idle')
      expect(usePersistenceStore.getState().lastSaveDocument).toBe(DOCUMENT)
    })

    it('deleteScene() returns false (never throws) on a network failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
      await expect(usePersistenceStore.getState().deleteScene('s1')).resolves.toBe(false)
    })

    it('openMyScenesPanel() sets listStatus to "error" (not an empty list) on a network failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

      usePersistenceStore.getState().openMyScenesPanel()

      await vi.waitFor(() => expect(usePersistenceStore.getState().listStatus).toBe('error'))
      expect(usePersistenceStore.getState().myScenes).toBeNull() // never silently becomes []
    })
  })

  it('openMyScenesPanel() opens the panel and populates myScenes from GET /scenes', async () => {
    const list = [{ id: 's1', name: 'A', updatedAt: 'now' }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(list)))

    usePersistenceStore.getState().openMyScenesPanel()
    expect(usePersistenceStore.getState().myScenesOpen).toBe(true)

    await vi.waitFor(() => expect(usePersistenceStore.getState().myScenes).toEqual(list))
  })

  it('deleteScene() removes the row from myScenes on success', async () => {
    usePersistenceStore.setState({
      myScenes: [
        { id: 's1', name: 'A', updatedAt: 'now' },
        { id: 's2', name: 'B', updatedAt: 'now' },
      ],
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })))

    await usePersistenceStore.getState().deleteScene('s1')

    expect(usePersistenceStore.getState().myScenes).toEqual([{ id: 's2', name: 'B', updatedAt: 'now' }])
  })

  it('fetchScene() distinguishes deleted (410) from not-found (404) from other errors (D17, M6.6)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 410 })))
    expect(await usePersistenceStore.getState().fetchScene('s1')).toEqual({ status: 'deleted' })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))
    expect(await usePersistenceStore.getState().fetchScene('s1')).toEqual({ status: 'not-found' })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })))
    expect(await usePersistenceStore.getState().fetchScene('s1')).toEqual({ status: 'error' })
  })

  it('fetchScene() returns the scene on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ ...DOCUMENT, id: 's1', isOwner: true, createdAt: 'now', updatedAt: 'now' })),
    )
    const result = await usePersistenceStore.getState().fetchScene('s1')
    expect(result.status).toBe('ok')
    expect(result.status === 'ok' && result.scene.id).toBe('s1')
  })

  it('resetSaveState() clears sceneId/isOwner', () => {
    usePersistenceStore.setState({ sceneId: 's1', isOwner: true })
    usePersistenceStore.getState().resetSaveState()

    expect(usePersistenceStore.getState().sceneId).toBeNull()
    expect(usePersistenceStore.getState().isOwner).toBe(false)
  })
})
