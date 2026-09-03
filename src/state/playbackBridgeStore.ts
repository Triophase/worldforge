import { create } from 'zustand'
import type { Transform } from './sceneStore'

interface PlaybackBridgeState {
  /** The sole-selected object's live transform while `playing`/`paused` (D2's read-only live display); `null` while `idle`. */
  liveTransform: Transform | null
  setLiveTransform: (transform: Transform) => void
  clearLiveTransform: () => void
}

/**
 * Canvas→DOM bridge (the same shape/pattern as `viewportBridgeStore` and
 * `gizmoDragStore`) for the Properties panel's read-only live display
 * while the simulation isn't `idle` — `sceneStore.objects[i].transform`
 * is never updated by physics stepping (only the live Rapier body and
 * the mesh are, per §13), so the Properties panel needs this separate
 * channel to show the object's *current* position/rotation during
 * play/pause rather than its stale pre-Play value.
 * `engine/simulation/PlaybackSync.tsx` writes here every frame.
 */
export const usePlaybackBridgeStore = create<PlaybackBridgeState>((set) => ({
  liveTransform: null,
  setLiveTransform: (transform) => set({ liveTransform: transform }),
  clearLiveTransform: () => set({ liveTransform: null }),
}))
