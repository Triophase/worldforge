import { create } from 'zustand'

/** `'select'` means Q — no gizmo, pure picking (D24). */
export type GizmoMode = 'select' | 'translate' | 'rotate' | 'scale'

interface GizmoModeState {
  mode: GizmoMode
  setMode: (mode: GizmoMode) => void
}

/** UI/session state — not the scene store (state-architecture, §34). */
export const useGizmoModeStore = create<GizmoModeState>((set) => ({
  mode: 'translate',
  setMode: (mode) => set({ mode }),
}))
