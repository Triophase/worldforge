import { Vector3 } from 'three'
import { create } from 'zustand'

export type CameraPreset = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'isometric'
export type Projection = 'perspective' | 'orthographic'

/** Unit direction from the orbit target to the camera, per preset (spec §8/idea.md §5). */
export const PRESET_DIRECTIONS: Record<CameraPreset, Vector3> = {
  front: new Vector3(0, 0, 1),
  back: new Vector3(0, 0, -1),
  left: new Vector3(-1, 0, 0),
  right: new Vector3(1, 0, 0),
  top: new Vector3(0, 1, 0),
  bottom: new Vector3(0, -1, 0),
  isometric: new Vector3(1, 1, 1).normalize(),
}

interface CameraViewState {
  projection: Projection
  presetRequest: { preset: CameraPreset; requestId: number } | null
  /**
   * `M8.2`'s `F` shortcut — a world position to center the orbit target
   * on, at the current camera-to-target distance and direction. A
   * one-shot signal, same `requestId` pattern as `presetRequest` (a
   * separate counter isn't needed — `CameraRig` tracks each kind's last-
   * seen id independently, so sharing `nextRequestId` is safe).
   */
  frameRequest: { position: [number, number, number]; requestId: number } | null
  requestPreset: (preset: CameraPreset) => void
  requestFrame: (position: [number, number, number]) => void
  toggleProjection: () => void
}

let nextRequestId = 1

/**
 * Bridges the View menu/toolbar (outside the R3F <Canvas>) with
 * `CameraRig` (inside it). `presetRequest`/`frameRequest` are one-shot
 * signals — each call gets a fresh `requestId` so CameraRig can detect a
 * *repeated* request (e.g. "Top" twice in a row, or `F` pressed twice)
 * as a new request, not a no-op.
 */
export const useCameraViewStore = create<CameraViewState>((set) => ({
  projection: 'perspective',
  presetRequest: null,
  frameRequest: null,
  requestPreset: (preset) => set({ presetRequest: { preset, requestId: nextRequestId++ } }),
  requestFrame: (position) => set({ frameRequest: { position, requestId: nextRequestId++ } }),
  toggleProjection: () =>
    set((state) => ({
      projection: state.projection === 'perspective' ? 'orthographic' : 'perspective',
    })),
}))
