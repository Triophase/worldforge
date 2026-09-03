import { create } from 'zustand'

export interface AssetRef {
  kind: 'builtin' | 'uploaded'
  key: string
}

export interface Transform {
  position: [number, number, number]
  /** Quaternion [x, y, z, w] — D21. Euler only exists at the Properties-panel UI boundary. */
  rotation: [number, number, number, number]
  scale: [number, number, number]
}

/**
 * §9's click semantics: `'replace'` is a plain click, `'add'` is Shift+Click
 * (never removes), `'toggle'` is Ctrl/Cmd+Click (removes if already present,
 * including emptying the selection if it was the sole member).
 */
export type SelectMode = 'replace' | 'add' | 'toggle'

export type BodyType = 'static' | 'dynamic' | 'kinematic'

export interface PhysicsProps {
  bodyType: BodyType
  mass: number
  friction: number
  restitution: number
  gravity: boolean
}

export interface SceneObject {
  id: string
  name: string
  assetRef: AssetRef
  transform: Transform
  physics: PhysicsProps
}

export type JointType = 'fixed' | 'revolute' | 'prismatic'

export interface JointLimits {
  min: number | null
  max: number | null
}

export interface JointMotor {
  enabled: boolean
  speed: number
}

/** D22's joint schema exactly. D19: `objectA` is also the Hierarchy's nesting key — a display convention only, never a transform parent. */
export interface JointEntity {
  id: string
  type: JointType
  objectA: string
  objectB: string
  /** D23: the midpoint of A/B's world positions at creation — a one-time snapshot, never recomputed. */
  anchor: [number, number, number]
  axis: [number, number, number]
  limits: JointLimits
  motor: JointMotor
}

export interface JointOverrides {
  anchor?: [number, number, number]
  axis?: [number, number, number]
  limits?: JointLimits
  motor?: JointMotor
}

/** §14's no-self-joint validation rule, exposed for M4.2's UI to reuse rather than re-implementing. */
export function isSelfJoint(objectAId: string, objectBId: string): boolean {
  return objectAId === objectBId
}

/** §14's no-duplicate-pair validation rule (any joint type, either order) — exposed for M4.2's Object B picker filter. */
export function hasJointBetween(joints: JointEntity[], objectAId: string, objectBId: string): boolean {
  return joints.some(
    (j) =>
      (j.objectA === objectAId && j.objectB === objectBId) ||
      (j.objectA === objectBId && j.objectB === objectAId),
  )
}

/** §15: world X for a revolute joint, world Y for a prismatic joint. Fixed's axis field is present but inert (§14). */
function defaultAxisFor(type: JointType): [number, number, number] {
  return type === 'prismatic' ? [0, 1, 0] : [1, 0, 0]
}

/** D22/D31: a never-saved (or freshly reset) draft's default name. */
export const DEFAULT_SCENE_NAME = 'Untitled Scene'

interface SceneState {
  /** D31: edited inline in the toolbar (`SceneNameEditor`, `M6.5`) — part of D22's document, serialized on every Save. */
  name: string
  objects: SceneObject[]
  joints: JointEntity[]
  selectedIds: string[]
  /**
   * M4.3/D19: a joint's own Hierarchy row is a distinct, mutually
   * exclusive selection kind from `selectedIds` — never both non-empty
   * at once. Selecting a joint clears `selectedIds` (so the viewport's
   * "exactly one selected object" gizmo check, unchanged since M2.6,
   * naturally shows no gizmo); selecting an object the normal way
   * clears this back to `null`.
   */
  selectedJointId: string | null
  /**
   * D4/M2.10: true once any scene-content mutation has happened since the
   * last `resetDraft()`. Every mutating action below sets this — a later
   * task that adds a new mutating action (Physics edits M3.2, joints
   * M4.1+) must set it too. Never touched by `select`/`setSelection`/
   * `clearSelection` (selection is not scene content, D22 doesn't
   * serialize it, and D25 never treats it as an edit).
   */
  isDirty: boolean
  renameScene: (name: string) => void
  addObject: (assetRef: AssetRef, baseName: string, initialTransform?: Partial<Transform>) => SceneObject
  removeObject: (id: string) => void
  renameObject: (id: string, newName: string) => void
  duplicateObject: (id: string) => SceneObject | undefined
  updateTransform: (id: string, transform: Partial<Transform>) => void
  updatePhysics: (id: string, physics: Partial<PhysicsProps>) => void
  /** §14 validators run first; rejects (returns `undefined`, no mutation) on a self-join or an existing joint between the pair. */
  createJoint: (
    objectAId: string,
    objectBId: string,
    type: JointType,
    overrides?: JointOverrides,
  ) => JointEntity | undefined
  deleteJoint: (jointId: string) => void
  /** M4.3's editing UI commits axis/limits/motor edits through this — not exercised by any UI in M4.1. */
  updateJoint: (jointId: string, partial: Partial<JointEntity>) => void
  select: (id: string, mode?: SelectMode) => void
  setSelection: (ids: string[]) => void
  /** M4.3: selects a joint's own Hierarchy row — clears `selectedIds` (mutually exclusive, see `selectedJointId`'s doc comment). */
  selectJoint: (jointId: string) => void
  clearSelection: () => void
  /** Low-level reset to an empty, clean draft — `draftStore.newScene()` orchestrates the rest (history, local storage). */
  resetDraft: () => void
}

const DEFAULT_TRANSFORM: Transform = {
  position: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
}

/** D29's default physics values for a freshly added/duplicated object. */
const DEFAULT_PHYSICS: PhysicsProps = {
  bodyType: 'static',
  mass: 1.0,
  friction: 0.5,
  restitution: 0.2,
  gravity: true,
}

/**
 * §10's auto-naming algorithm: computed fresh from the current `objects`
 * array every call — never a persistent per-type counter. This is what
 * makes a manual rename-into-collision safe, and a deleted-then-re-added
 * name reusable.
 */
function nextAvailableName(objects: SceneObject[], baseName: string): string {
  const existingNames = new Set(objects.map((o) => o.name))
  if (!existingNames.has(baseName)) return baseName

  let n = 2
  while (existingNames.has(`${baseName} ${n}`)) n++
  return `${baseName} ${n}`
}

function generateId(): string {
  return crypto.randomUUID()
}

export const useSceneStore = create<SceneState>((set, get) => ({
  name: DEFAULT_SCENE_NAME,
  objects: [],
  joints: [],
  selectedJointId: null,
  selectedIds: [],
  isDirty: false,

  renameScene: (name) => set({ name, isDirty: true }),

  addObject: (assetRef, baseName, initialTransform) => {
    const name = nextAvailableName(get().objects, baseName)
    const object: SceneObject = {
      id: generateId(),
      name,
      assetRef,
      transform: { ...DEFAULT_TRANSFORM, ...initialTransform },
      physics: { ...DEFAULT_PHYSICS },
    }
    set((state) => ({ objects: [...state.objects, object], isDirty: true }))
    return object
  },

  removeObject: (id) => {
    set((state) => ({ objects: state.objects.filter((o) => o.id !== id), isDirty: true }))
  },

  renameObject: (id, newName) => {
    set((state) => ({
      objects: state.objects.map((o) => (o.id === id ? { ...o, name: newName } : o)),
      isDirty: true,
    }))
  },

  duplicateObject: (id) => {
    const source = get().objects.find((o) => o.id === id)
    if (!source) return undefined

    // D42: source's current name + " Copy", with §10's collision rule
    // layered on top of that result (so a second duplicate becomes
    // "<name> Copy 2", not "<name> Copy Copy").
    const name = nextAvailableName(get().objects, `${source.name} Copy`)
    const duplicate: SceneObject = {
      id: generateId(),
      name,
      assetRef: { ...source.assetRef },
      transform: {
        position: [...source.transform.position],
        rotation: [...source.transform.rotation],
        scale: [...source.transform.scale],
      },
      physics: { ...source.physics },
    }
    set((state) => ({ objects: [...state.objects, duplicate], isDirty: true }))
    return duplicate
  },

  updateTransform: (id, transform) => {
    set((state) => ({
      objects: state.objects.map((o) =>
        o.id === id ? { ...o, transform: { ...o.transform, ...transform } } : o,
      ),
      isDirty: true,
    }))
  },

  updatePhysics: (id, physics) => {
    set((state) => ({
      objects: state.objects.map((o) =>
        o.id === id ? { ...o, physics: { ...o.physics, ...physics } } : o,
      ),
      isDirty: true,
    }))
  },

  createJoint: (objectAId, objectBId, type, overrides) => {
    if (isSelfJoint(objectAId, objectBId)) return undefined

    const { objects, joints } = get()
    if (hasJointBetween(joints, objectAId, objectBId)) return undefined

    const objectA = objects.find((o) => o.id === objectAId)
    const objectB = objects.find((o) => o.id === objectBId)
    if (!objectA || !objectB) return undefined

    const anchor: [number, number, number] = overrides?.anchor ?? [
      (objectA.transform.position[0] + objectB.transform.position[0]) / 2,
      (objectA.transform.position[1] + objectB.transform.position[1]) / 2,
      (objectA.transform.position[2] + objectB.transform.position[2]) / 2,
    ]

    const joint: JointEntity = {
      id: generateId(),
      type,
      objectA: objectAId,
      objectB: objectBId,
      anchor,
      axis: overrides?.axis ?? defaultAxisFor(type),
      limits: overrides?.limits ?? { min: null, max: null },
      motor: overrides?.motor ?? { enabled: false, speed: 0 },
    }
    set((state) => ({ joints: [...state.joints, joint], isDirty: true }))
    return joint
  },

  deleteJoint: (jointId) => {
    set((state) => ({ joints: state.joints.filter((j) => j.id !== jointId), isDirty: true }))
  },

  updateJoint: (jointId, partial) => {
    set((state) => ({
      joints: state.joints.map((j) => (j.id === jointId ? { ...j, ...partial } : j)),
      isDirty: true,
    }))
  },

  select: (id, mode = 'replace') => {
    if (mode === 'replace') {
      set({ selectedIds: [id], selectedJointId: null })
      return
    }
    set((state) => {
      const isSelected = state.selectedIds.includes(id)
      if (mode === 'add') {
        return isSelected ? { selectedJointId: null } : { selectedIds: [...state.selectedIds, id], selectedJointId: null }
      }
      // 'toggle'
      return {
        selectedIds: isSelected
          ? state.selectedIds.filter((sid) => sid !== id)
          : [...state.selectedIds, id],
        selectedJointId: null,
      }
    })
  },

  setSelection: (ids) => set({ selectedIds: ids, selectedJointId: null }),
  selectJoint: (jointId) => set({ selectedJointId: jointId, selectedIds: [] }),
  clearSelection: () => set({ selectedIds: [], selectedJointId: null }),

  resetDraft: () =>
    set({ name: DEFAULT_SCENE_NAME, objects: [], joints: [], selectedIds: [], selectedJointId: null, isDirty: false }),
}))

// Development-only debug hook (M2.1's own verification loop, and M2.2's)
// — never present in a production build, and no later task should come
// to depend on it existing.
if (import.meta.env.DEV) {
  ;(window as unknown as { __sceneStore: typeof useSceneStore }).__sceneStore = useSceneStore
}
