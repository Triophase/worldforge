import { create } from 'zustand'
import type { Transform } from './sceneStore'

interface GizmoDragState {
  /** The dragged object's live transform, updated every frame while a gizmo drag is in progress; `null` otherwise. */
  liveTransform: Transform | null
  setLiveTransform: (transform: Transform) => void
  clearLiveTransform: () => void
}

/**
 * The Canvas-to-DOM bridge for the gizmo's in-progress drag (M2.6):
 * `SceneObjectMesh`'s `TransformControls` writes here on every
 * `onObjectChange` frame so the Properties panel's fields can update live
 * *without* committing to `sceneStore` until drag-end (D25: one commit
 * per gesture). Same bridge shape as `viewportBridgeStore` (M2.3).
 */
export const useGizmoDragStore = create<GizmoDragState>((set) => ({
  liveTransform: null,
  setLiveTransform: (transform) => set({ liveTransform: transform }),
  clearLiveTransform: () => set({ liveTransform: null }),
}))
