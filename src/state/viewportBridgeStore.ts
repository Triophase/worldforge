import type { Camera } from 'three'
import { create } from 'zustand'

interface ViewportBridgeState {
  camera: Camera | null
  domElement: HTMLElement | null
}

/**
 * The Canvas-to-DOM counterpart of `cameraViewStore`/`renderModeStore`
 * (which bridge DOM-UI-to-Canvas). `ViewportBridgeSync` (inside the
 * Canvas) keeps this synced with the live active camera and the canvas's
 * DOM element, so DOM-side code (M2.3's drag-to-place raycast) can reach
 * them without needing to be inside the R3F tree itself.
 */
export const useViewportBridgeStore = create<ViewportBridgeState>(() => ({
  camera: null,
  domElement: null,
}))
