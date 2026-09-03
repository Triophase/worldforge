import RAPIER from '@dimforge/rapier3d-compat'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useHistoryStore } from './historyStore'
import { IMPORT_INVALID_MESSAGE, IMPORT_NEWER_VERSION_MESSAGE } from './importValidation'
import { useImportStore } from './importStore'
import { usePersistenceStore } from './persistenceStore'
import { DEFAULT_SCENE_NAME, useSceneStore } from './sceneStore'
import { useSimulationStore } from './simulationStore'
import { useSnappingStore } from './snappingStore'

const VALID_SCENE = {
  schemaVersion: 1,
  name: 'From File',
  objects: [],
  joints: [],
  simulation: { speed: 1, snapping: { moveEnabled: true, moveSnap: 0.1, rotationEnabled: true, rotationSnapDeg: 15 } },
  assets: [],
}

function jsonFile(content: unknown, name = 'scene.json'): File {
  return new File([JSON.stringify(content)], name, { type: 'application/json' })
}

describe('useImportStore.importFile (M7.2, §27)', () => {
  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    useImportStore.setState({ status: 'idle', errorMessage: null })
    useSceneStore.setState({ name: DEFAULT_SCENE_NAME, objects: [], joints: [], selectedJointId: null, selectedIds: [], isDirty: false })
    useHistoryStore.setState({ undoStack: [], redoStack: [] })
    useSnappingStore.setState({ moveEnabled: true, moveSnap: 0.1, rotationEnabled: true, rotationSnapDeg: 15 })
    useSimulationStore.setState({ phase: 'idle', snapshot: null, speed: 1, elapsed: 0 })
    usePersistenceStore.setState({ sceneId: null, isOwner: false })
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('a valid file (no unsaved changes) replaces the draft with no confirmation prompt', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm')

    await useImportStore.getState().importFile(jsonFile(VALID_SCENE))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(useSceneStore.getState().name).toBe('From File')
    expect(useImportStore.getState().status).toBe('idle')
  })

  it('with unsaved changes, prompts; canceling leaves the draft untouched', async () => {
    useSceneStore.getState().addObject({ kind: 'builtin', key: 'primitive:cube' }, 'Existing')
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    await useImportStore.getState().importFile(jsonFile(VALID_SCENE))

    expect(useSceneStore.getState().objects).toHaveLength(1)
    expect(useSceneStore.getState().name).not.toBe('From File')
  })

  it('with unsaved changes, confirming proceeds with the replace', async () => {
    useSceneStore.getState().addObject({ kind: 'builtin', key: 'primitive:cube' }, 'Existing')
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    await useImportStore.getState().importFile(jsonFile(VALID_SCENE))

    expect(useSceneStore.getState().name).toBe('From File')
  })

  it('rejects invalid JSON text with the generic message, leaving the draft unchanged', async () => {
    useSceneStore.getState().addObject({ kind: 'builtin', key: 'primitive:cube' }, 'Existing')
    const truncated = new File(['{"schemaVersion": 1, "objects": ['], 'broken.json')

    await useImportStore.getState().importFile(truncated)

    expect(useImportStore.getState().status).toBe('error')
    expect(useImportStore.getState().errorMessage).toBe(IMPORT_INVALID_MESSAGE)
    expect(useSceneStore.getState().objects).toHaveLength(1)
  })

  it('rejects a missing required field with the generic message', async () => {
    const { objects: _drop, ...rest } = VALID_SCENE

    await useImportStore.getState().importFile(jsonFile(rest))

    expect(useImportStore.getState().status).toBe('error')
    expect(useImportStore.getState().errorMessage).toBe(IMPORT_INVALID_MESSAGE)
  })

  it('rejects a newer schemaVersion with the exact D22 wording', async () => {
    await useImportStore.getState().importFile(jsonFile({ ...VALID_SCENE, schemaVersion: 999 }))

    expect(useImportStore.getState().status).toBe('error')
    expect(useImportStore.getState().errorMessage).toBe(IMPORT_NEWER_VERSION_MESSAGE)
  })

  it('an invalid file never even prompts for unsaved changes', async () => {
    useSceneStore.getState().addObject({ kind: 'builtin', key: 'primitive:cube' }, 'Existing')
    const confirmSpy = vi.spyOn(window, 'confirm')

    await useImportStore.getState().importFile(jsonFile({ ...VALID_SCENE, schemaVersion: 999 }))

    expect(confirmSpy).not.toHaveBeenCalled()
  })

  it('dismissError() clears status back to idle', () => {
    useImportStore.setState({ status: 'error', errorMessage: 'x' })
    useImportStore.getState().dismissError()
    expect(useImportStore.getState().status).toBe('idle')
    expect(useImportStore.getState().errorMessage).toBeNull()
  })
})
