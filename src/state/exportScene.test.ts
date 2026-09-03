import { Group } from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSceneStore } from './sceneStore'
import { usePersistenceStore } from './persistenceStore'
import { useUploadedAssetsStore } from './uploadedAssetsStore'
import { buildExportDocument, exportFilename, useExportStore } from './exportScene'

describe('exportFilename (M7.1)', () => {
  it('derives a safe .json filename from the scene name', () => {
    expect(exportFilename('My Robot Arm!')).toBe('My-Robot-Arm.json')
  })

  it('falls back to "scene.json" for a name that sanitizes to nothing', () => {
    expect(exportFilename('!!!')).toBe('scene.json')
  })
})

describe('buildExportDocument (M7.1, D22)', () => {
  beforeEach(() => {
    useSceneStore.setState({
      name: 'Untitled Scene',
      objects: [],
      joints: [],
      selectedIds: [],
      selectedJointId: null,
      isDirty: false,
    })
    usePersistenceStore.setState({ sceneId: null, isOwner: false })
    useUploadedAssetsStore.setState({ uploads: [], lastUploadError: null, lastUploadErrorReason: null, progress: null })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('a scene with no uploaded objects produces assets: [] and no id when never saved', async () => {
    useSceneStore.getState().addObject({ kind: 'builtin', key: 'primitive:cube' }, 'Cube')

    const result = await buildExportDocument()

    expect('document' in result).toBe(true)
    const doc = (result as { document: { assets: unknown[]; id?: string } }).document
    expect(doc.assets).toEqual([])
    expect(doc.id).toBeUndefined()
  })

  it('includes id when the draft has a server sceneId', async () => {
    usePersistenceStore.setState({ sceneId: 's1', isOwner: true })

    const result = await buildExportDocument()

    expect((result as { document: { id?: string } }).document.id).toBe('s1')
  })

  it('embeds a session-uploaded (not-yet-saved) asset from the in-memory record, keyed by its local id', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    useUploadedAssetsStore.getState().addUpload({
      id: 'local-1',
      filename: 'widget.glb',
      format: 'glb',
      fileSize: 4,
      object: new Group(),
      boundingBox: { width: 1, height: 1, depth: 1 },
      meshCount: 1,
      file: new File([bytes], 'widget.glb'),
    })
    useSceneStore.getState().addObject({ kind: 'uploaded', key: 'local-1' }, 'Widget')

    const result = await buildExportDocument()

    const doc = (result as { document: { assets: { assetId: string; filename: string; format: string; data: string }[] } }).document
    expect(doc.assets).toHaveLength(1)
    expect(doc.assets[0]).toMatchObject({ assetId: 'local-1', filename: 'widget.glb', format: 'glb' })
    expect(doc.assets[0]!.data.length).toBeGreaterThan(0)
  })

  it('fetches a server-persisted asset (no local record) from the backend and embeds it', async () => {
    useSceneStore.getState().addObject({ kind: 'uploaded', key: 'server-1' }, 'Widget')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([9, 9, 9]), {
          status: 200,
          headers: { 'Content-Disposition': 'attachment; filename="remote.glb"' },
        }),
      ),
    )

    const result = await buildExportDocument()

    const doc = (result as { document: { assets: { assetId: string; filename: string; data: string }[] } }).document
    expect(doc.assets).toHaveLength(1)
    expect(doc.assets[0]).toMatchObject({ assetId: 'server-1', filename: 'remote.glb' })
    expect(doc.assets[0]!.data.length).toBeGreaterThan(0)
  })

  it('aborts with an error, embedding nothing, when a server asset fetch fails', async () => {
    useSceneStore.getState().addObject({ kind: 'uploaded', key: 'server-1' }, 'Widget')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const result = await buildExportDocument()

    expect('error' in result).toBe(true)
  })

  it('reflects current in-editor state, not any last-saved snapshot', async () => {
    useSceneStore.getState().renameScene('Live Edit In Progress')

    const result = await buildExportDocument()

    expect((result as { document: { name: string } }).document.name).toBe('Live Edit In Progress')
  })
})

describe('useExportStore (M7.1)', () => {
  beforeEach(() => {
    useExportStore.setState({ status: 'idle', errorMessage: null })
    useSceneStore.setState({
      name: 'Untitled Scene',
      objects: [],
      joints: [],
      selectedIds: [],
      selectedJointId: null,
      isDirty: false,
    })
    usePersistenceStore.setState({ sceneId: null, isOwner: false })
    useUploadedAssetsStore.setState({ uploads: [], lastUploadError: null, lastUploadErrorReason: null, progress: null })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exportScene() triggers a download and ends idle when nothing needs fetching', async () => {
    const download = vi.fn()

    await useExportStore.getState().exportScene(download)

    expect(download).toHaveBeenCalledTimes(1)
    const [filename, content] = download.mock.calls[0]!
    expect(filename).toBe('Untitled-Scene.json')
    expect(JSON.parse(content).schemaVersion).toBe(1)
    expect(useExportStore.getState().status).toBe('idle')
  })

  it('exportScene() sets status to error and never downloads when an asset fetch fails', async () => {
    useSceneStore.getState().addObject({ kind: 'uploaded', key: 'server-1' }, 'Widget')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const download = vi.fn()

    await useExportStore.getState().exportScene(download)

    expect(download).not.toHaveBeenCalled()
    expect(useExportStore.getState().status).toBe('error')
    expect(useExportStore.getState().errorMessage).toBeTruthy()
  })

  it('dismissError() clears status back to idle', () => {
    useExportStore.setState({ status: 'error', errorMessage: 'x' })
    useExportStore.getState().dismissError()

    expect(useExportStore.getState().status).toBe('idle')
    expect(useExportStore.getState().errorMessage).toBeNull()
  })
})
