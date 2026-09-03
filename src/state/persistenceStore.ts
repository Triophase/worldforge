import { create } from 'zustand'
import { apiFetch } from '../utils/apiClient'
import { setLastActiveSceneId } from '../utils/lastActiveScene'
import { persistUploadedAssetsForSave } from './persistUploadedAssets'
import { useSceneStore } from './sceneStore'
import type { SceneJSON } from './draftStore'

export interface MyScenesEntry {
  id: string
  name: string
  updatedAt: string
}

/** The shape `M6.3`'s `GET/POST/PUT /scenes(/:id)` return — D22's own `SceneJSON` plus the server-only fields. */
export type SavedScene = SceneJSON & { id: string; isOwner: boolean; createdAt: string; updatedAt: string }

/**
 * D17's real/deleted/never-existed three-way split, as an actual return
 * type rather than `M6.5`'s original `null`-for-either shortcut — `M6.6`
 * needs to render visibly distinct "this scene was deleted" vs. ordinary
 * "not found" states, which a collapsed `null` can't express. Derived
 * from the response's own HTTP status (`M6.3`'s `410` vs `404`), never
 * by inspecting the body.
 */
export type FetchSceneResult =
  | { status: 'ok'; scene: SavedScene }
  | { status: 'deleted' }
  | { status: 'not-found' }
  | { status: 'error' }

interface PersistenceState {
  /** `null` until the current draft has been saved at least once, or opened from My Scenes. */
  sceneId: string | null
  /** Whether the current device identity owns `sceneId` — drives the Save button's D8/D9 label. */
  isOwner: boolean
  /**
   * D15/M6.8: `'error'` is D15's generic "couldn't reach the server"
   * case (network failure, timeout, or any non-`403` non-2xx response);
   * `'forbidden'` is D8's own permission denial (`M6.3`'s `403` on a
   * denied overwrite) — a **different, already-handled case**, not a
   * connectivity failure, so it must never be relabeled as the generic
   * backend-down message (`backend-api`'s own explicit warning against
   * conflating the two).
   */
  saveStatus: 'idle' | 'saving' | 'error' | 'forbidden'
  /** The document from the most recent `save()` call — kept so `retrySave()` can resubmit it verbatim without the caller re-serializing or the user re-entering anything. */
  lastSaveDocument: SceneJSON | null
  /**
   * `M6.10`: set alongside `saveStatus: 'error'` only when the failure
   * is a specific, named upload-during-save rejection (D11's per-file or
   * per-device cap) rather than a generic connectivity failure —
   * `SaveErrorBanner` shows this verbatim instead of its own generic D15
   * message when present. `null` for every other error, and always reset
   * to `null` at the start of a new `save()` attempt.
   */
  saveErrorMessage: string | null
  myScenesOpen: boolean
  myScenes: MyScenesEntry[] | null
  listStatus: 'idle' | 'loading' | 'error'
  /** `M6.6`: drives `ShareLinkStatusOverlay` while/after opening a `/scene/:id` link — `'idle'` the rest of the time (including before any link has ever been opened). */
  linkOpenStatus: 'idle' | 'loading' | 'deleted' | 'not-found' | 'error'
  /** `M2.10`/`M3.6`-style reset — a blank draft or a freshly loaded demo isn't the previously-open server scene anymore. */
  resetSaveState: () => void
  /** `POST /scenes` (first save/fork) or `PUT /scenes/:id` (overwrite), chosen by `sceneId`+`isOwner` (D8/D9) — the caller supplies the already-serialized document (`draftStore.serializeDraft()`) so this store never needs to import `draftStore` itself. Never mutates/clears scene-graph state on failure (D4/D15) — only a success touches `sceneStore`. */
  save: (document: SceneJSON) => Promise<void>
  /** Re-attempts the last `save()` call verbatim — a no-op if nothing has been attempted yet. */
  retrySave: () => Promise<void>
  /** Dismisses a save error without discarding `lastSaveDocument` — a later manual Save (or `retrySave`) still works. */
  dismissSaveError: () => void
  /** Fetches one scene's full JSON — see `FetchSceneResult`'s own doc comment for the deleted/not-found split. */
  fetchScene: (id: string) => Promise<FetchSceneResult>
  openMyScenesPanel: () => void
  closeMyScenesPanel: () => void
  /** `true` on success. `false` (never throws) on failure — D15: the caller decides how to surface that, this store never assumes a UI shape. */
  deleteScene: (id: string) => Promise<boolean>
}

export const usePersistenceStore = create<PersistenceState>((set, get) => ({
  sceneId: null,
  isOwner: false,
  saveStatus: 'idle',
  lastSaveDocument: null,
  saveErrorMessage: null,
  myScenesOpen: false,
  myScenes: null,
  listStatus: 'idle',
  linkOpenStatus: 'idle',

  resetSaveState: () =>
    set({ sceneId: null, isOwner: false, saveStatus: 'idle', lastSaveDocument: null, saveErrorMessage: null }),

  save: async (document) => {
    const { sceneId, isOwner } = get()
    set({ saveStatus: 'saving', lastSaveDocument: document, saveErrorMessage: null })

    // M6.10: persist any not-yet-server-side uploaded assets referenced
    // by this document first, rewriting their `assetRef.key`s to the
    // server-assigned ids — a single unit with the scene write below, so
    // a failed asset upload never leaves a scene saved half-referencing
    // an asset that doesn't exist server-side.
    const uploadResult = await persistUploadedAssetsForSave(document)
    if ('error' in uploadResult) {
      set({ saveStatus: 'error', saveErrorMessage: uploadResult.error })
      return
    }
    const documentToSend = uploadResult.document

    try {
      const response =
        sceneId && isOwner
          ? await apiFetch(`/scenes/${sceneId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(documentToSend),
            })
          : await apiFetch('/scenes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(documentToSend),
            })

      if (response.status === 403) {
        set({ saveStatus: 'forbidden' })
        return
      }
      if (!response.ok) {
        set({ saveStatus: 'error' })
        return
      }

      const saved: SavedScene = await response.json()
      set({ sceneId: saved.id, isOwner: saved.isOwner, saveStatus: 'idle' })
      useSceneStore.setState({ isDirty: false }) // D4: the draft now matches what was just persisted.
      setLastActiveSceneId(saved.id) // D43: covers both "first save" and "fork" — both land here.
    } catch {
      set({ saveStatus: 'error' }) // network failure/timeout — D15's own case, never touches sceneStore.
    }
  },

  retrySave: async () => {
    const { lastSaveDocument, save } = get()
    if (lastSaveDocument) await save(lastSaveDocument)
  },

  dismissSaveError: () => set({ saveStatus: 'idle', saveErrorMessage: null }),

  fetchScene: async (id) => {
    try {
      const response = await apiFetch(`/scenes/${id}`)
      if (response.status === 410) return { status: 'deleted' }
      if (response.status === 404) return { status: 'not-found' }
      if (!response.ok) return { status: 'error' }
      return { status: 'ok', scene: (await response.json()) as SavedScene }
    } catch {
      return { status: 'error' }
    }
  },

  openMyScenesPanel: () => {
    set({ myScenesOpen: true, listStatus: 'loading' })
    apiFetch('/scenes')
      .then(async (response) => {
        if (!response.ok) {
          set({ listStatus: 'error' })
          return
        }
        const scenes: MyScenesEntry[] = await response.json()
        set({ myScenes: scenes, listStatus: 'idle' })
      })
      .catch(() => set({ listStatus: 'error' }))
  },

  closeMyScenesPanel: () => set({ myScenesOpen: false }),

  deleteScene: async (id) => {
    try {
      const response = await apiFetch(`/scenes/${id}`, { method: 'DELETE' })
      if (!response.ok) return false
      set((state) => ({ myScenes: state.myScenes?.filter((s) => s.id !== id) ?? null }))
      return true
    } catch {
      return false
    }
  },
}))
