import { create } from 'zustand'

/**
 * The single source of truth for "which object's Hierarchy row is
 * currently in rename-edit mode" — was `SceneHierarchyPanel`'s own
 * local `useState` (`M2.7`) until `M8.1` needed a second entry point
 * (the context menu's Rename item) into the exact same affordance,
 * living in a sibling component. Lifted out rather than duplicated, per
 * the task's own "opens the same inline-rename affordance... already
 * provide" requirement — double-click (unchanged) and the context menu
 * both just call `requestRename`.
 */
interface RenameRequestState {
  requestedId: string | null
  requestRename: (id: string) => void
  clearRequest: () => void
}

export const useRenameRequestStore = create<RenameRequestState>((set) => ({
  requestedId: null,
  requestRename: (id) => set({ requestedId: id }),
  clearRequest: () => set({ requestedId: null }),
}))
