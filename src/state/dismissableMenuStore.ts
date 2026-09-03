import { create } from 'zustand'

/**
 * `M8.2`: a plain count of how many `useDismissableMenu`-driven menus
 * (every toolbar `Dropdown` instance plus `M8.1`'s `ObjectContextMenu`)
 * are open right now. `useGlobalShortcuts.ts`'s `Escape` handler reads
 * this to decide whether to deselect — D24's "close an open menu/
 * dropdown takes priority over deselecting" — without needing to know
 * *which* menu is open or call anything on it directly: each menu's own
 * `useDismissableMenu` instance already closes itself on the exact same
 * `Escape` keypress via its own listener, this store just tells the
 * global handler to skip its deselect branch when that's about to happen.
 */
interface DismissableMenuState {
  openCount: number
}

export const useDismissableMenuStore = create<DismissableMenuState>(() => ({
  openCount: 0,
}))
