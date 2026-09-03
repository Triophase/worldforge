import { create } from 'zustand'

/**
 * The single source of truth for "which object's `JointCreationFlow` is
 * currently open" — was `JointCreationFlow`'s own local `useState`
 * (`M4.2`) until `M8.1` needed a second entry point (the context menu's
 * Add Joint item, which must open the flow with the right-clicked
 * object already standing in as Object A) into the exact same form,
 * living deep inside `PropertiesPanel`. Lifted out rather than
 * duplicated, mirroring `renameRequestStore`'s identical shape/reasoning.
 * The flow's own trigger button (unchanged) and the context menu both
 * just call `requestJointCreation`.
 */
interface JointCreationRequestState {
  requestedObjectAId: string | null
  requestJointCreation: (objectAId: string) => void
  clearRequest: () => void
}

export const useJointCreationRequestStore = create<JointCreationRequestState>((set) => ({
  requestedObjectAId: null,
  requestJointCreation: (objectAId) => set({ requestedObjectAId: objectAId }),
  clearRequest: () => set({ requestedObjectAId: null }),
}))
