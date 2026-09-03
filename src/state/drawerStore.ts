import { create } from 'zustand'

/**
 * `M8.4`/§28: the Assets/Properties drawer open/closed state at narrow
 * widths. Both default `false` (closed) — §28's own explicit "a drawer
 * never auto-opens just because the window is narrow" — and there is no
 * persistence across a reload (Out of scope), so `false` on every fresh
 * mount is the entire mechanism, not something that needs resetting
 * anywhere. Pure UI/session state — never touches `sceneStore`.
 */
interface DrawerState {
  assetsOpen: boolean
  propertiesOpen: boolean
  toggleAssets: () => void
  toggleProperties: () => void
  closeAssets: () => void
  closeProperties: () => void
}

export const useDrawerStore = create<DrawerState>((set) => ({
  assetsOpen: false,
  propertiesOpen: false,
  toggleAssets: () => set((s) => ({ assetsOpen: !s.assetsOpen })),
  toggleProperties: () => set((s) => ({ propertiesOpen: !s.propertiesOpen })),
  closeAssets: () => set({ assetsOpen: false }),
  closeProperties: () => set({ propertiesOpen: false }),
}))
