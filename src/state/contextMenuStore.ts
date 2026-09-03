import { create } from 'zustand'

/**
 * `M8.1`'s right-click context menu — pure UI/session state, the same
 * "Canvas triggers DOM state" bridge pattern `gizmoDragStore`/
 * `viewportBridgeStore` already established, just triggered from either
 * the Canvas (`SceneObjects.tsx`'s meshes) or plain DOM (Scene Hierarchy
 * rows). `x`/`y` are viewport (`clientX`/`clientY`) coordinates — the
 * menu itself renders `position: fixed` there. Never holds *which*
 * object the menu acts on — the menu reads `sceneStore.selectedIds`
 * directly, since the right-click handler that opens this has already
 * done any select-first work (§21) before calling `openMenu`.
 */
interface ContextMenuState {
  open: boolean
  x: number
  y: number
  openMenu: (x: number, y: number) => void
  closeMenu: () => void
}

export const useContextMenuStore = create<ContextMenuState>((set) => ({
  open: false,
  x: 0,
  y: 0,
  openMenu: (x, y) => set({ open: true, x, y }),
  closeMenu: () => set({ open: false }),
}))
