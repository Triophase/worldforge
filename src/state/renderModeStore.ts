import { create } from 'zustand'

export type RenderMode = 'solid' | 'wireframe'

interface RenderModeState {
  mode: RenderMode
  toggleMode: () => void
}

/**
 * Single global render-mode state (spec §8: "not per-object"). Read by
 * `RenderModeSync` inside the Canvas; written to from the View menu
 * (`Toolbar`), outside it — same DOM-UI-to-Canvas bridge pattern as
 * `cameraViewStore` (M1.3).
 */
export const useRenderModeStore = create<RenderModeState>((set) => ({
  mode: 'solid',
  toggleMode: () => set((state) => ({ mode: state.mode === 'solid' ? 'wireframe' : 'solid' })),
}))
