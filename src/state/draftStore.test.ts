import RAPIER from '@dimforge/rapier3d-compat'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePhysicsStore } from '../engine/physics/physicsStore'
import { getLastActiveSceneId, setLastActiveSceneId } from '../utils/lastActiveScene'
import {
  LOCAL_DRAFT_STORAGE_KEY,
  confirmDiscard,
  importScene,
  loadDemoScene,
  newScene,
  openSavedScene,
  openSharedScene,
  restoreDraftOnStartup,
  serializeDraft,
  startAutosave,
  tryResumeLastActiveScene,
} from './draftStore'
import { useHistoryStore } from './historyStore'
import { usePersistenceStore } from './persistenceStore'
import { DEFAULT_SCENE_NAME, useSceneStore } from './sceneStore'
import { useSimulationStore } from './simulationStore'
import { useSnappingStore } from './snappingStore'
import { useUploadedAssetsStore } from './uploadedAssetsStore'

const CUBE = { kind: 'builtin' as const, key: 'primitive:cube' }

describe('draftStore (D4/M2.10)', () => {
  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    useSceneStore.setState({ name: DEFAULT_SCENE_NAME, objects: [], joints: [], selectedJointId: null, selectedIds: [], isDirty: false })
    useHistoryStore.setState({ undoStack: [], redoStack: [] })
    useSnappingStore.setState({ moveEnabled: true, moveSnap: 0.1, rotationEnabled: true, rotationSnapDeg: 15 })
    useSimulationStore.setState({ phase: 'idle', snapshot: null, speed: 1, elapsed: 0 })
    usePersistenceStore.setState({ sceneId: null, isOwner: false, saveStatus: 'idle', lastSaveDocument: null, myScenesOpen: false, myScenes: null, listStatus: 'idle', linkOpenStatus: 'idle' })
    useUploadedAssetsStore.setState({ uploads: [], lastUploadError: null, lastUploadErrorReason: null, progress: null })
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('isDirty starts false; addObject sets it true', () => {
    expect(useSceneStore.getState().isDirty).toBe(false)
    useSceneStore.getState().addObject(CUBE, 'Cube')
    expect(useSceneStore.getState().isDirty).toBe(true)
  })

  it('serializeDraft reflects the current objects, snapping settings, and simulation speed', () => {
    useSceneStore.getState().addObject(CUBE, 'Cube')
    useSnappingStore.setState({ moveSnap: 0.5 })
    useSimulationStore.setState({ speed: 2 })

    const draft = serializeDraft()
    expect(draft.schemaVersion).toBe(1)
    expect(draft.objects).toEqual(useSceneStore.getState().objects)
    expect(draft.simulation.snapping.moveSnap).toBe(0.5)
    expect(draft.simulation.speed).toBe(2)
  })

  it('serializeDraft reflects the current scene name (D31)', () => {
    useSceneStore.getState().renameScene('Widget Assembly')
    expect(serializeDraft().name).toBe('Widget Assembly')
  })

  it('restoreDraftOnStartup restores the persisted scene name', () => {
    useSceneStore.getState().renameScene('Widget Assembly')
    localStorage.setItem(LOCAL_DRAFT_STORAGE_KEY, JSON.stringify(serializeDraft()))
    useSceneStore.setState({ name: DEFAULT_SCENE_NAME })

    restoreDraftOnStartup()

    expect(useSceneStore.getState().name).toBe('Widget Assembly')
  })

  it('restoreDraftOnStartup falls back to the default name when the persisted draft has none', () => {
    localStorage.setItem(LOCAL_DRAFT_STORAGE_KEY, JSON.stringify({ objects: [], joints: [] }))
    restoreDraftOnStartup()
    expect(useSceneStore.getState().name).toBe(DEFAULT_SCENE_NAME)
  })

  it('restoreDraftOnStartup restores the persisted simulation speed', () => {
    useSimulationStore.setState({ speed: 0.5 })
    localStorage.setItem(LOCAL_DRAFT_STORAGE_KEY, JSON.stringify(serializeDraft()))
    useSimulationStore.setState({ speed: 1 })

    restoreDraftOnStartup()

    expect(useSimulationStore.getState().speed).toBe(0.5)
  })

  it('restoreDraftOnStartup ignores an invalid persisted speed rather than applying it', () => {
    localStorage.setItem(
      LOCAL_DRAFT_STORAGE_KEY,
      JSON.stringify({ ...serializeDraft(), simulation: { ...serializeDraft().simulation, speed: 99 } }),
    )

    restoreDraftOnStartup()

    expect(useSimulationStore.getState().speed).toBe(1)
  })

  describe('autosave debounce', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('writes to localStorage after the debounce window once dirty', () => {
      const stop = startAutosave()
      useSceneStore.getState().addObject(CUBE, 'Cube')

      expect(localStorage.getItem(LOCAL_DRAFT_STORAGE_KEY)).toBeNull()
      vi.advanceTimersByTime(1000)

      const saved = JSON.parse(localStorage.getItem(LOCAL_DRAFT_STORAGE_KEY)!)
      expect(saved.objects).toEqual(useSceneStore.getState().objects)
      stop()
    })

    it('resets the debounce timer on each further mutation', () => {
      const stop = startAutosave()
      useSceneStore.getState().addObject(CUBE, 'A')
      vi.advanceTimersByTime(600)
      useSceneStore.getState().addObject(CUBE, 'B')
      vi.advanceTimersByTime(600)

      // 1200ms total elapsed, but the second mutation reset the clock at
      // t=600, so only 600ms of quiet has passed — not yet written.
      expect(localStorage.getItem(LOCAL_DRAFT_STORAGE_KEY)).toBeNull()

      vi.advanceTimersByTime(400)
      const saved = JSON.parse(localStorage.getItem(LOCAL_DRAFT_STORAGE_KEY)!)
      expect(saved.objects).toHaveLength(2)
      stop()
    })
  })

  it('restoreDraftOnStartup loads a pre-populated local draft before anything else, without marking it dirty', () => {
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
    localStorage.setItem(LOCAL_DRAFT_STORAGE_KEY, JSON.stringify(serializeDraft()))
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [], isDirty: false })

    restoreDraftOnStartup()

    expect(useSceneStore.getState().objects).toEqual([obj])
    expect(useSceneStore.getState().isDirty).toBe(false)
  })

  it('restoreDraftOnStartup does nothing when no local draft exists', () => {
    restoreDraftOnStartup()
    expect(useSceneStore.getState().objects).toEqual([])
  })

  it('restoreDraftOnStartup ignores a corrupt local draft rather than throwing', () => {
    localStorage.setItem(LOCAL_DRAFT_STORAGE_KEY, 'not json')
    expect(() => restoreDraftOnStartup()).not.toThrow()
    expect(useSceneStore.getState().objects).toEqual([])
  })

  it('newScene empties objects/selectedIds, clears isDirty, clears local storage, and clears undo history', () => {
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
    useSceneStore.getState().select(obj.id)
    useHistoryStore.setState({ undoStack: [{ type: 'add', objects: [obj], joints: [] }], redoStack: [] })
    localStorage.setItem(LOCAL_DRAFT_STORAGE_KEY, JSON.stringify(serializeDraft()))

    newScene()

    expect(useSceneStore.getState().objects).toEqual([])
    expect(useSceneStore.getState().selectedIds).toEqual([])
    expect(useSceneStore.getState().isDirty).toBe(false)
    expect(localStorage.getItem(LOCAL_DRAFT_STORAGE_KEY)).toBeNull()
    expect(useHistoryStore.getState().undoStack).toEqual([])
  })

  it('newScene also resets scene name and persistence save-state (M6.5) — a blank draft is not the previously-open server scene', () => {
    useSceneStore.getState().renameScene('Widget Assembly')
    usePersistenceStore.setState({ sceneId: 's1', isOwner: true })

    newScene()

    expect(useSceneStore.getState().name).toBe(DEFAULT_SCENE_NAME)
    expect(usePersistenceStore.getState().sceneId).toBeNull()
    expect(usePersistenceStore.getState().isOwner).toBe(false)
  })

  describe('confirmDiscard', () => {
    it('runs the callback immediately when not dirty, with no prompt', () => {
      const confirmSpy = vi.spyOn(window, 'confirm')
      const proceed = vi.fn()

      confirmDiscard(proceed)

      expect(confirmSpy).not.toHaveBeenCalled()
      expect(proceed).toHaveBeenCalledOnce()
    })

    it('prompts when dirty, and runs the callback only if confirmed', () => {
      useSceneStore.getState().addObject(CUBE, 'Cube')
      const proceed = vi.fn()
      vi.spyOn(window, 'confirm').mockReturnValue(true)

      confirmDiscard(proceed)
      expect(proceed).toHaveBeenCalledOnce()
    })

    it('does not run the callback when the prompt is declined', () => {
      useSceneStore.getState().addObject(CUBE, 'Cube')
      const proceed = vi.fn()
      vi.spyOn(window, 'confirm').mockReturnValue(false)

      confirmDiscard(proceed)
      expect(proceed).not.toHaveBeenCalled()
    })
  })

  describe('loadDemoScene (D26, M3.6)', () => {
    // A minimal, test-only fixture — proves the mechanism is generic
    // over any conforming SceneJSON, not hardcoded to Falling Box.
    const FIXTURE_DEMO = {
      schemaVersion: 1 as const,
      name: 'Fixture Demo',
      objects: [
        {
          id: 'placeholder-a',
          name: 'A',
          assetRef: CUBE,
          transform: { position: [1, 2, 3] as [number, number, number], rotation: [0, 0, 0, 1] as [number, number, number, number], scale: [1, 1, 1] as [number, number, number] },
          physics: { bodyType: 'dynamic' as const, mass: 2, friction: 0.5, restitution: 0.2, gravity: true },
        },
      ],
      joints: [] as [],
      simulation: {
        speed: 2 as const,
        snapping: { moveEnabled: false, moveSnap: 0.25, rotationEnabled: false, rotationSnapDeg: 5 },
      },
    }

    it('replaces the current draft with the demo scene, as an unsaved (not dirty) draft', () => {
      useSceneStore.getState().addObject(CUBE, 'Pre-existing object')

      loadDemoScene(FIXTURE_DEMO)

      const objects = useSceneStore.getState().objects
      expect(objects).toHaveLength(1)
      expect(objects[0].name).toBe('A')
      expect(objects[0].transform.position).toEqual([1, 2, 3])
      expect(useSceneStore.getState().isDirty).toBe(false)
      expect(useSceneStore.getState().selectedIds).toEqual([])
    })

    it("assigns each object a fresh id, never the demo JSON's own placeholder id", () => {
      loadDemoScene(FIXTURE_DEMO)
      expect(useSceneStore.getState().objects[0].id).not.toBe('placeholder-a')
    })

    it('loading the same demo twice produces different ids each time', () => {
      loadDemoScene(FIXTURE_DEMO)
      const firstId = useSceneStore.getState().objects[0].id
      loadDemoScene(FIXTURE_DEMO)
      const secondId = useSceneStore.getState().objects[0].id
      expect(secondId).not.toBe(firstId)
    })

    it('restores snapping and simulation speed from the demo', () => {
      loadDemoScene(FIXTURE_DEMO)
      expect(useSnappingStore.getState()).toMatchObject(FIXTURE_DEMO.simulation.snapping)
      expect(useSimulationStore.getState().speed).toBe(2)
    })

    it('resets simulation phase/snapshot/elapsed to idle regardless of prior state', () => {
      useSimulationStore.setState({ phase: 'playing', snapshot: {}, elapsed: 42 })
      loadDemoScene(FIXTURE_DEMO)
      expect(useSimulationStore.getState()).toMatchObject({ phase: 'idle', snapshot: null, elapsed: 0 })
    })

    it('clears undo history', () => {
      useSceneStore.getState().addObject(CUBE, 'Cube')
      useHistoryStore.setState({ undoStack: [{ type: 'add', objects: [], joints: [] }], redoStack: [] })
      loadDemoScene(FIXTURE_DEMO)
      expect(useHistoryStore.getState().undoStack).toEqual([])
    })

    it('builds a fresh Rapier body for every object in the loaded demo', () => {
      loadDemoScene(FIXTURE_DEMO)
      const id = useSceneStore.getState().objects[0].id
      expect(usePhysicsStore.getState().bodies.has(id)).toBe(true)
    })

    it('writes through to localStorage immediately, without needing isDirty/autosave', () => {
      loadDemoScene(FIXTURE_DEMO)
      const saved = JSON.parse(localStorage.getItem(LOCAL_DRAFT_STORAGE_KEY)!)
      expect(saved.objects[0].name).toBe('A')
    })

    it('loading again after the draft was edited discards those edits and restores the authored layout', () => {
      loadDemoScene(FIXTURE_DEMO)
      const id = useSceneStore.getState().objects[0].id
      useSceneStore.getState().updateTransform(id, { position: [99, 99, 99] })
      expect(useSceneStore.getState().objects[0].transform.position).toEqual([99, 99, 99])

      loadDemoScene(FIXTURE_DEMO)

      expect(useSceneStore.getState().objects[0].transform.position).toEqual([1, 2, 3])
    })

    it('resets persistence save-state too (M6.5) — a demo is not the previously-open server scene', () => {
      usePersistenceStore.setState({ sceneId: 's1', isOwner: true })
      loadDemoScene(FIXTURE_DEMO)
      expect(usePersistenceStore.getState().sceneId).toBeNull()
      expect(usePersistenceStore.getState().isOwner).toBe(false)
    })
  })

  const SAVED_SCENE_FIXTURE = {
    id: 's1',
    isOwner: true,
    createdAt: 'now',
    updatedAt: 'now',
    schemaVersion: 1 as const,
    name: 'Saved Scene',
    objects: [
      {
        id: 'kept-id',
        name: 'A',
        assetRef: CUBE,
        transform: { position: [4, 5, 6] as [number, number, number], rotation: [0, 0, 0, 1] as [number, number, number, number], scale: [1, 1, 1] as [number, number, number] },
        physics: { bodyType: 'static' as const, mass: 1, friction: 0.5, restitution: 0.2, gravity: true },
      },
    ],
    joints: [] as [],
    simulation: { speed: 1, snapping: { moveEnabled: true, moveSnap: 0.1, rotationEnabled: true, rotationSnapDeg: 15 } },
  }

  describe('openSavedScene (M6.5)', () => {
    it('replaces the draft with the fetched scene, keeping its own object/joint ids as-is', async () => {
      vi.spyOn(usePersistenceStore.getState(), 'fetchScene').mockResolvedValue({ status: 'ok', scene: SAVED_SCENE_FIXTURE })

      const ok = await openSavedScene('s1')

      expect(ok).toBe(true)
      expect(useSceneStore.getState().name).toBe('Saved Scene')
      expect(useSceneStore.getState().objects[0].id).toBe('kept-id') // unlike loadDemoScene, ids are preserved
      expect(useSceneStore.getState().isDirty).toBe(false)
      expect(usePersistenceStore.getState().sceneId).toBe('s1')
      expect(usePersistenceStore.getState().isOwner).toBe(true)
      expect(getLastActiveSceneId()).toBe('s1') // D43: every My Scenes entry is already owned by this device.
    })

    it('returns false and leaves the current draft untouched when the fetch fails (deleted/not-found)', async () => {
      useSceneStore.getState().addObject(CUBE, 'Still Here')
      vi.spyOn(usePersistenceStore.getState(), 'fetchScene').mockResolvedValue({ status: 'not-found' })

      const ok = await openSavedScene('does-not-exist')

      expect(ok).toBe(false)
      expect(useSceneStore.getState().objects).toHaveLength(1)
      expect(useSceneStore.getState().objects[0].name).toBe('Still Here')
      expect(getLastActiveSceneId()).toBeNull()
    })
  })

  describe('openSharedScene (D8/D13/D17, M6.6)', () => {
    it('replaces the draft and sets sceneId/isOwner on success, trusting the server-reported ownership', async () => {
      vi.spyOn(usePersistenceStore.getState(), 'fetchScene').mockResolvedValue({
        status: 'ok',
        scene: { ...SAVED_SCENE_FIXTURE, isOwner: false },
      })

      await openSharedScene('s1')

      expect(useSceneStore.getState().name).toBe('Saved Scene')
      expect(usePersistenceStore.getState().sceneId).toBe('s1')
      expect(usePersistenceStore.getState().isOwner).toBe(false)
      expect(usePersistenceStore.getState().linkOpenStatus).toBe('idle')
      // D43: a non-owner's visit must never become what this device resumes to next time.
      expect(getLastActiveSceneId()).toBeNull()
    })

    it('sets lastActiveSceneId when the opened link already belongs to this device', async () => {
      vi.spyOn(usePersistenceStore.getState(), 'fetchScene').mockResolvedValue({
        status: 'ok',
        scene: { ...SAVED_SCENE_FIXTURE, isOwner: true },
      })

      await openSharedScene('s1')

      expect(getLastActiveSceneId()).toBe('s1')
    })

    it('sets linkOpenStatus to "deleted" and leaves the draft untouched for a deleted scene', async () => {
      useSceneStore.getState().addObject(CUBE, 'Still Here')
      vi.spyOn(usePersistenceStore.getState(), 'fetchScene').mockResolvedValue({ status: 'deleted' })

      await openSharedScene('s1')

      expect(usePersistenceStore.getState().linkOpenStatus).toBe('deleted')
      expect(useSceneStore.getState().objects).toHaveLength(1)
      expect(useSceneStore.getState().objects[0].name).toBe('Still Here')
    })

    it('sets linkOpenStatus to "not-found" for an id that never existed — distinct from "deleted"', async () => {
      vi.spyOn(usePersistenceStore.getState(), 'fetchScene').mockResolvedValue({ status: 'not-found' })

      await openSharedScene('does-not-exist')

      expect(usePersistenceStore.getState().linkOpenStatus).toBe('not-found')
    })

    it('composes with confirmDiscard — a dirty draft is guarded before a share link replaces it', async () => {
      useSceneStore.getState().addObject(CUBE, 'Unsaved Work')
      vi.spyOn(window, 'confirm').mockReturnValue(false)

      confirmDiscard(() => openSharedScene('s1'))

      // `proceed` (and therefore `openSharedScene`/`fetchScene`) never
      // ran — observable via untouched state, not a spy call count
      // (Zustand's `set()`-driven state-object copying can carry a
      // `vi.spyOn`-mutated action reference forward into later state
      // snapshots even after `restoreAllMocks()`, making call-count
      // assertions on a store action unreliable across tests in the
      // same file — asserting on real state sidesteps that entirely).
      expect(useSceneStore.getState().objects).toHaveLength(1)
      expect(useSceneStore.getState().objects[0].name).toBe('Unsaved Work')
      expect(usePersistenceStore.getState().linkOpenStatus).toBe('idle')
    })
  })

  describe('tryResumeLastActiveScene (D14/D43, M6.9)', () => {
    it('returns false with no lastActiveSceneId pointer at all', async () => {
      expect(getLastActiveSceneId()).toBeNull()
      expect(await tryResumeLastActiveScene()).toBe(false)
      expect(useSceneStore.getState().objects).toEqual([])
    })

    it('resumes the pointed-at scene when it resolves', async () => {
      setLastActiveSceneId('s1')
      vi.spyOn(usePersistenceStore.getState(), 'fetchScene').mockResolvedValue({ status: 'ok', scene: SAVED_SCENE_FIXTURE })

      const resumed = await tryResumeLastActiveScene()

      expect(resumed).toBe(true)
      expect(useSceneStore.getState().name).toBe('Saved Scene')
      expect(useSceneStore.getState().objects[0].id).toBe('kept-id')
      expect(usePersistenceStore.getState().sceneId).toBe('s1')
    })

    it('returns false and touches nothing when the pointer no longer resolves (deleted)', async () => {
      setLastActiveSceneId('s1')
      vi.spyOn(usePersistenceStore.getState(), 'fetchScene').mockResolvedValue({ status: 'deleted' })

      const resumed = await tryResumeLastActiveScene()

      expect(resumed).toBe(false)
      expect(useSceneStore.getState().objects).toEqual([])
    })

    it('returns false for a not-found pointer — same fallback as deleted, D14 treats both as "nothing to resume"', async () => {
      setLastActiveSceneId('s1')
      vi.spyOn(usePersistenceStore.getState(), 'fetchScene').mockResolvedValue({ status: 'not-found' })

      expect(await tryResumeLastActiveScene()).toBe(false)
    })

    it('returns false on a network failure fetching the pointer', async () => {
      setLastActiveSceneId('s1')
      vi.spyOn(usePersistenceStore.getState(), 'fetchScene').mockResolvedValue({ status: 'error' })

      expect(await tryResumeLastActiveScene()).toBe(false)
    })
  })

  describe('importScene (D9/D26, M7.2)', () => {
    const IMPORTED_FIXTURE = {
      schemaVersion: 1 as const,
      name: 'Imported Scene',
      objects: [
        {
          id: 'placeholder-a',
          name: 'A',
          assetRef: CUBE,
          transform: { position: [7, 8, 9] as [number, number, number], rotation: [0, 0, 0, 1] as [number, number, number, number], scale: [1, 1, 1] as [number, number, number] },
          physics: { bodyType: 'dynamic' as const, mass: 1, friction: 0.5, restitution: 0.2, gravity: true },
        },
      ],
      joints: [] as [],
      simulation: { speed: 1, snapping: { moveEnabled: true, moveSnap: 0.1, rotationEnabled: true, rotationSnapDeg: 15 } },
      assets: [] as { assetId: string; filename: string; format: string; data: string }[],
    }

    it('replaces the current draft, exactly like loadDemoScene, with a fresh id and no server association', async () => {
      useSceneStore.getState().addObject(CUBE, 'Pre-existing object')
      usePersistenceStore.setState({ sceneId: 's1', isOwner: true })

      await importScene(IMPORTED_FIXTURE)

      const objects = useSceneStore.getState().objects
      expect(objects).toHaveLength(1)
      expect(objects[0].name).toBe('A')
      expect(objects[0].id).not.toBe('placeholder-a')
      expect(useSceneStore.getState().isDirty).toBe(false)
      expect(usePersistenceStore.getState().sceneId).toBeNull() // D9: always a fresh, unowned draft
    })

    it("ignores any id the imported file's own JSON carried — never adopted as sceneId", async () => {
      await importScene({ ...IMPORTED_FIXTURE, id: 'original-server-id' } as typeof IMPORTED_FIXTURE & { id: string })
      expect(usePersistenceStore.getState().sceneId).toBeNull()
    })

    it('clears undo history and rebuilds physics, matching loadDemoScene', async () => {
      useHistoryStore.setState({ undoStack: [{ type: 'add', objects: [], joints: [] }], redoStack: [] })
      await importScene(IMPORTED_FIXTURE)
      expect(useHistoryStore.getState().undoStack).toEqual([])
      const id = useSceneStore.getState().objects[0].id
      expect(usePhysicsStore.getState().bodies.has(id)).toBe(true)
    })

    it('registers embedded assets into uploadedAssetsStore before the objects referencing them are placed', async () => {
      const scene = {
        ...IMPORTED_FIXTURE,
        objects: [
          {
            id: 'placeholder-a',
            name: 'Widget',
            assetRef: { kind: 'uploaded' as const, key: 'asset-1' },
            transform: { position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0, 1] as [number, number, number, number], scale: [1, 1, 1] as [number, number, number] },
            physics: { bodyType: 'static' as const, mass: 1, friction: 0.5, restitution: 0.2, gravity: true },
          },
        ],
        assets: [{ assetId: 'asset-1', filename: 'thing.xyz', format: 'xyz', data: 'YQ==' }],
      }

      await importScene(scene)

      // `thing.xyz` isn't a recognized format, so registration is skipped
      // per `decodeAndRegisterImportedAssets`'s own graceful degrade — the
      // object still gets placed (with a still-unresolved assetRef), never
      // blocking the rest of the import.
      expect(useSceneStore.getState().objects).toHaveLength(1)
      expect(useSceneStore.getState().objects[0].assetRef).toEqual({ kind: 'uploaded', key: 'asset-1' })
    })

    it('writes through to localStorage immediately', async () => {
      await importScene(IMPORTED_FIXTURE)
      const saved = JSON.parse(localStorage.getItem(LOCAL_DRAFT_STORAGE_KEY)!)
      expect(saved.objects[0].name).toBe('A')
    })
  })
})
