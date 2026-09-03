import { loadScene as loadPhysicsScene } from '../engine/physics/physicsStore'
import { decodeAndRegisterImportedAssets } from '../loaders/AssetLoader/importedAssets'
import { getLastActiveSceneId, setLastActiveSceneId } from '../utils/lastActiveScene'
import { useHistoryStore } from './historyStore'
import type { ImportedSceneJSON } from './importValidation'
import { usePersistenceStore } from './persistenceStore'
import type { SavedScene } from './persistenceStore'
import type { JointEntity, SceneObject } from './sceneStore'
import { DEFAULT_SCENE_NAME, useSceneStore } from './sceneStore'
import { SIMULATION_SPEEDS, useSimulationStore } from './simulationStore'
import { useSnappingStore } from './snappingStore'

/** One fixed key, independent of any server scene id (none exist until M6). */
export const LOCAL_DRAFT_STORAGE_KEY = 'cad-simulator:local-draft'

const AUTOSAVE_DEBOUNCE_MS = 1000

/**
 * D22's scene JSON shape, restricted to what M2/M3/M4 actually have data
 * for. `id`/`createdAt`/`updatedAt` are server-Save concepts (D22's own
 * schema comments: `id` is "absent for a not-yet-saved local draft") —
 * none exist until M6.5, so they're omitted rather than faked. `joints`
 * is real as of `M4.1`; `simulation.speed` is real as of `M3.5`, read
 * from `simulationStore`. **Exported** so `M3.6`'s demo scenes
 * (`src/demos/`) can author data conforming to the exact same shape the
 * local draft itself uses — there is only one scene-JSON shape in this
 * codebase, not a draft-specific one and a demo-specific one.
 */
export interface SceneJSON {
  schemaVersion: 1
  name: string
  objects: SceneObject[]
  joints: JointEntity[]
  simulation: {
    speed: number
    snapping: {
      moveEnabled: boolean
      moveSnap: number
      rotationEnabled: boolean
      rotationSnapDeg: number
    }
  }
}

export function serializeDraft(): SceneJSON {
  const scene = useSceneStore.getState()
  const snapping = useSnappingStore.getState()
  return {
    schemaVersion: 1,
    name: scene.name,
    objects: scene.objects,
    joints: scene.joints,
    simulation: {
      speed: useSimulationStore.getState().speed,
      snapping: {
        moveEnabled: snapping.moveEnabled,
        moveSnap: snapping.moveSnap,
        rotationEnabled: snapping.rotationEnabled,
        rotationSnapDeg: snapping.rotationSnapDeg,
      },
    },
  }
}

function writeDraftToStorage() {
  localStorage.setItem(LOCAL_DRAFT_STORAGE_KEY, JSON.stringify(serializeDraft()))
}

/**
 * D4/M2.10: on app startup, restore a locally-autosaved draft before
 * anything else renders — call this from `main.tsx`, synchronously,
 * before `createRoot(...).render(...)`. Sets state directly via
 * `setState` (not `addObject`) so restoring doesn't itself mark the
 * fresh draft dirty or push undo history for edits nobody just made.
 */
export function restoreDraftOnStartup(): void {
  const raw = localStorage.getItem(LOCAL_DRAFT_STORAGE_KEY)
  if (!raw) return

  let draft: Partial<SceneJSON>
  try {
    draft = JSON.parse(raw)
  } catch {
    return
  }
  if (!Array.isArray(draft.objects)) return

  useSceneStore.setState({
    name: typeof draft.name === 'string' ? draft.name : DEFAULT_SCENE_NAME,
    objects: draft.objects,
    joints: Array.isArray(draft.joints) ? draft.joints : [],
    selectedIds: [],
    isDirty: false,
  })
  if (draft.simulation?.snapping) {
    useSnappingStore.setState(draft.simulation.snapping)
  }
  const speed = draft.simulation?.speed
  if (typeof speed === 'number' && (SIMULATION_SPEEDS as readonly number[]).includes(speed)) {
    useSimulationStore.setState({ speed: speed as (typeof SIMULATION_SPEEDS)[number] })
  }
}

/**
 * Debounced local write: any scene-store change while `isDirty` is true
 * (re)starts a ~1s quiet-period timer, after which the whole draft is
 * serialized to `localStorage`. Autosaving never clears `isDirty` itself
 * — only `newScene()` (or, later, a real server Save, M6.5) does; a
 * local write and "no longer differs from the last save" are distinct
 * concepts (D4).
 */
export function startAutosave(): () => void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  return useSceneStore.subscribe((state) => {
    if (!state.isDirty) return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      writeDraftToStorage()
    }, AUTOSAVE_DEBOUNCE_MS)
  })
}

/**
 * Clears the in-memory draft, the local autosave slot, and undo history
 * — the one "discard the current draft" action that exists in M2 (Load/
 * Import/demo-switch, M6.5/M7.2/M3.6, extend this same function rather
 * than duplicating its steps).
 */
export function newScene(): void {
  useSceneStore.getState().resetDraft()
  useHistoryStore.getState().clearHistory()
  usePersistenceStore.getState().resetSaveState() // M6.5: a blank draft isn't the previously-open server scene anymore.
  localStorage.removeItem(LOCAL_DRAFT_STORAGE_KEY)
}

/**
 * Shared by `loadDemoScene` and `M7.2`'s `importScene` — both need a
 * **fresh** id per object (never the source JSON's own placeholder/
 * previously-exported ids) so loading the same demo twice, or importing
 * the same file twice, never collides on id, with joints' `objectA`/
 * `objectB` remapped to match (`M4.1`: a dangling joint reference would
 * otherwise result whenever an object's id changes underneath it).
 */
function regenerateIds(
  sourceObjects: SceneObject[],
  sourceJoints: JointEntity[],
): { objects: SceneObject[]; joints: JointEntity[] } {
  const idMap = new Map<string, string>()
  const objects: SceneObject[] = sourceObjects.map((object) => {
    const id = crypto.randomUUID()
    idMap.set(object.id, id)
    return { ...object, id }
  })
  const joints: JointEntity[] = sourceJoints.map((joint) => ({
    ...joint,
    id: crypto.randomUUID(),
    objectA: idMap.get(joint.objectA) ?? joint.objectA,
    objectB: idMap.get(joint.objectB) ?? joint.objectB,
  }))
  return { objects, joints }
}

/**
 * The shared "replace the draft with this fresh (already id-regenerated)
 * scene" tail — everything `loadDemoScene`/`importScene` do once they've
 * each produced their own `objects`/`joints`. Resets `simulationStore` to
 * `idle` regardless of what was happening before — the physics world is
 * about to be entirely torn down and rebuilt, so no prior snapshot is
 * meaningful. Writes through to `localStorage` immediately (not waiting
 * for the `isDirty`-driven autosave, since this doesn't mark dirty).
 */
function applyFreshDraft(
  scene: Pick<SceneJSON, 'name' | 'simulation'>,
  objects: SceneObject[],
  joints: JointEntity[],
): void {
  useSceneStore.setState({ name: scene.name, objects, joints, selectedIds: [], isDirty: false })
  useSnappingStore.setState(scene.simulation.snapping)
  useSimulationStore.setState({
    phase: 'idle',
    snapshot: null,
    elapsed: 0,
    speed: (SIMULATION_SPEEDS as readonly number[]).includes(scene.simulation.speed)
      ? (scene.simulation.speed as (typeof SIMULATION_SPEEDS)[number])
      : 1,
  })
  useHistoryStore.getState().clearHistory()
  usePersistenceStore.getState().resetSaveState() // M6.5/M7.2: neither a demo nor an import is the previously-open server scene.
  loadPhysicsScene(objects, joints) // §13: tear down the previous world, build a fresh one.
  writeDraftToStorage()
}

/**
 * D26/M3.6: loads a hand-authored (or test-fixture) scene JSON as the
 * current unsaved local draft — the same status a blank New Scene would
 * be in, replacing whatever was previously in the editor. Generic over
 * any conforming `SceneJSON`, not just Falling Box, so `M4.6`'s
 * remaining four demos register against this same function without
 * rework. **Callers own the D4 unsaved-changes warning** (`confirmDiscard`)
 * — this task's own scope excludes wiring it here; whatever later
 * trigger calls this should wrap it in
 * `confirmDiscard(() => loadDemoScene(...))`.
 */
export function loadDemoScene(scene: SceneJSON): void {
  const { objects, joints } = regenerateIds(scene.objects, scene.joints)
  applyFreshDraft(scene, objects, joints)
}

/**
 * `M7.2`'s Import: §27 — "replaces the current draft exactly as opening
 * a demo scene does (D26)," from a user-picked file's already-validated
 * contents (`importValidation.ts#validateImportedScene`) instead of a
 * bundled demo. Decodes+registers every embedded `assets` entry into
 * `uploadedAssetsStore` **before** regenerating ids (an asset entry is
 * keyed by `assetId`, which every referencing object's `assetRef.key`
 * already points at directly — object-id regeneration never touches
 * that reference, so the ordering is a courtesy, not a correctness
 * requirement, but doing it first means the objects are never briefly
 * rendered with an unresolved asset reference). **`scene.id` is never
 * read** — an imported scene is always brand-new and unowned regardless
 * of any id the file carries from when it was originally exported off a
 * saved scene (D9/D26); `applyFreshDraft`'s `resetSaveState()` call is
 * what makes a later Save of an imported scene "Save as new scene," not
 * an overwrite. Callers own the D4 unsaved-changes warning, same
 * convention as `loadDemoScene`.
 */
export async function importScene(scene: ImportedSceneJSON): Promise<void> {
  await decodeAndRegisterImportedAssets(scene.assets)
  const { objects, joints } = regenerateIds(scene.objects, scene.joints)
  applyFreshDraft(scene, objects, joints)
}

/**
 * The shared replacement step behind both `openSavedScene` (`M6.5`, My
 * Scenes) and `openSharedScene` (`M6.6`, a `/scene/:id` link) — object/
 * joint **ids are kept exactly as fetched**, unlike `loadDemoScene`,
 * since this is the same scene being reopened, not a fresh instance; a
 * subsequent Save must `PUT` the same rows, not create new ones.
 */
function applySavedScene(scene: SavedScene): void {
  useSceneStore.setState({
    name: scene.name,
    objects: scene.objects,
    joints: scene.joints,
    selectedIds: [],
    isDirty: false,
  })
  useSnappingStore.setState(scene.simulation.snapping)
  useSimulationStore.setState({
    phase: 'idle',
    snapshot: null,
    elapsed: 0,
    speed: (SIMULATION_SPEEDS as readonly number[]).includes(scene.simulation.speed)
      ? (scene.simulation.speed as (typeof SIMULATION_SPEEDS)[number])
      : 1,
  })
  useHistoryStore.getState().clearHistory()
  usePersistenceStore.setState({ sceneId: scene.id, isOwner: scene.isOwner })
  loadPhysicsScene(scene.objects, scene.joints)
  writeDraftToStorage()
}

/**
 * `M6.5`'s Load: replaces the current draft with a scene already saved
 * on the server, fetched via `persistenceStore.fetchScene`. Returns
 * `false` (and touches nothing) if the fetch failed (D17's deleted
 * state, an ordinary 404, or a network error) — `M6.5`'s own scope
 * doesn't distinguish those cases in the UI (My Scenes only ever lists
 * ids it already knows are real); `M6.6`'s `openSharedScene` is where
 * that distinction actually matters and is surfaced. Callers own the D4
 * unsaved-changes guard, same convention as `loadDemoScene`.
 */
export async function openSavedScene(id: string): Promise<boolean> {
  const result = await usePersistenceStore.getState().fetchScene(id)
  if (result.status !== 'ok') return false
  applySavedScene(result.scene)
  setLastActiveSceneId(result.scene.id) // D43: every scene reachable via My Scenes is already owned by this device.
  return true
}

/**
 * `M6.6`'s share-link open: same replacement as `openSavedScene`, but
 * surfaces D17's real/deleted/not-found three-way split via
 * `persistenceStore.linkOpenStatus` instead of collapsing to a boolean —
 * a share link is the one place in the app where "this specific id
 * doesn't resolve" needs its own visible, distinct message (§M6.6's own
 * acceptance criteria), not just a silent no-op. Ownership
 * (`scene.isOwner`) is trusted exactly as the server reports it (D8) —
 * never recomputed client-side.
 */
export async function openSharedScene(id: string): Promise<void> {
  usePersistenceStore.setState({ linkOpenStatus: 'loading' })
  const result = await usePersistenceStore.getState().fetchScene(id)

  if (result.status !== 'ok') {
    usePersistenceStore.setState({ linkOpenStatus: result.status })
    return
  }

  applySavedScene(result.scene)
  usePersistenceStore.setState({ linkOpenStatus: 'idle' })
  // D43: only when the link already belongs to this device — a
  // non-owner's visit to someone else's scene must not silently become
  // what this device resumes to next time.
  if (result.scene.isOwner) setLastActiveSceneId(result.scene.id)
}

/**
 * `M6.9`/D14: the direct-app-load (not a `/scene/:id` link) resume
 * step. Callers must already have confirmed there is nothing to
 * restore from `M2.10`'s local draft (D43's own precedence — this
 * function never checks that itself, since it has no way to
 * distinguish "no local draft" from "a local draft that happens to be
 * for a different scene" on its own). Returns `true` if a scene was
 * actually resumed; `false` for every other case (no pointer, or the
 * pointer no longer resolves — deleted, never-existed, or a network
 * failure) — D14 treats all of those identically: fall back to the
 * first-time experience, not an error state.
 */
export async function tryResumeLastActiveScene(): Promise<boolean> {
  const lastId = getLastActiveSceneId()
  if (!lastId) return false

  const result = await usePersistenceStore.getState().fetchScene(lastId)
  if (result.status !== 'ok') return false

  applySavedScene(result.scene)
  return true
}

/**
 * The reusable "you have unsaved changes" guard (D4) — every future
 * draft-discarding action (Load, Import, a demo-scene switch) should
 * call this rather than building its own confirmation. Native
 * `window.confirm` is this task's own free implementation choice (no
 * custom-styled modal is required, Out of scope).
 */
export function confirmDiscard(proceed: () => void): void {
  if (!useSceneStore.getState().isDirty) {
    proceed()
    return
  }
  if (window.confirm('You have unsaved changes. Discard them?')) {
    proceed()
  }
}
