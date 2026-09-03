import { create } from 'zustand'

interface SnappingState {
  moveEnabled: boolean
  moveSnap: number
  rotationEnabled: boolean
  rotationSnapDeg: number
  toggleMoveEnabled: () => void
  toggleRotationEnabled: () => void
  setMoveSnap: (value: number) => void
  setRotationSnapDeg: (value: number) => void
}

/**
 * §20/D38: an editing preference, not scene-graph state — field names
 * match D22's `simulation.snapping` schema exactly (`moveEnabled`,
 * `moveSnap`, `rotationEnabled`, `rotationSnapDeg`) so a later
 * save/export task (M6.5/M7.1/M7.2) can read this store straight into
 * that shape with no renaming. Defaults match D22's example: both
 * enabled, `0.1` units / `15` degrees.
 */
export const useSnappingStore = create<SnappingState>((set) => ({
  moveEnabled: true,
  moveSnap: 0.1,
  rotationEnabled: true,
  rotationSnapDeg: 15,
  toggleMoveEnabled: () => set((s) => ({ moveEnabled: !s.moveEnabled })),
  toggleRotationEnabled: () => set((s) => ({ rotationEnabled: !s.rotationEnabled })),
  setMoveSnap: (value) => set({ moveSnap: value }),
  setRotationSnapDeg: (value) => set({ rotationSnapDeg: value }),
}))
