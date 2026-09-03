import { create } from 'zustand'
import { applyPhysicsProps, applyTransform } from '../engine/physics/physicsStore'
import { ROBOT_ARM_ASSEMBLY, robotArmBaseY } from '../assets/assemblies'
import type { JointEntity, JointOverrides, JointType, PhysicsProps, SceneObject, Transform } from './sceneStore'
import { useSceneStore } from './sceneStore'
import { isEditLocked } from './simulationStore'
import { useUploadedAssetsStore } from './uploadedAssetsStore'

type HistoryEntry =
  /** `joints` (D5, M4.5): a cascaded joint created alongside a duplicated pair — empty for a plain `recordedAddObject`. */
  | { type: 'add'; objects: SceneObject[]; joints: JointEntity[] }
  /** `joints` (D5, M4.5): every joint cascade-deleted because one of its endpoints was among `entries` — same single undo step, per §9. */
  | { type: 'remove'; entries: { object: SceneObject; index: number }[]; joints: JointEntity[] }
  | { type: 'rename'; id: string; before: string; after: string }
  | { type: 'transform'; id: string; before: Transform; after: Transform }
  | { type: 'physics'; id: string; before: PhysicsProps; after: PhysicsProps }
  | { type: 'jointCreate'; joint: JointEntity }
  | { type: 'jointUpdate'; id: string; before: JointEntity; after: JointEntity }

interface HistoryState {
  undoStack: HistoryEntry[]
  redoStack: HistoryEntry[]
  undo: () => void
  redo: () => void
  clearHistory: () => void
}

/**
 * D25's undo/redo scope for everything M2 introduced: add, delete,
 * duplicate (single or a whole multi-selection, one entry per gesture —
 * see `recordedDuplicateObjects`/`recordedRemoveObjects` below), rename,
 * and a coalesced transform edit. In-memory only, never persisted;
 * `clearHistory` exists for a later Load/Import task to call, unused by
 * anything in M2 itself. Kept entirely separate from `sceneStore`
 * (state-architecture) — this store never appears in `sceneStore`'s own
 * state, only observes and replays it via the `recorded*` action
 * wrappers below, which are what UI components call **instead of**
 * `sceneStore`'s raw actions for anything that should be undoable.
 * Selection is never recorded here, by design (D25).
 */
export const useHistoryStore = create<HistoryState>((set, get) => ({
  undoStack: [],
  redoStack: [],

  undo: () => {
    if (isEditLocked()) return // D25: undo is disabled entirely while the simulation isn't idle.
    const { undoStack, redoStack } = get()
    const entry = undoStack[undoStack.length - 1]
    if (!entry) return
    applyReverse(entry)
    set({ undoStack: undoStack.slice(0, -1), redoStack: [...redoStack, entry] })
  },

  redo: () => {
    if (isEditLocked()) return
    const { undoStack, redoStack } = get()
    const entry = redoStack[redoStack.length - 1]
    if (!entry) return
    applyForward(entry)
    set({ redoStack: redoStack.slice(0, -1), undoStack: [...undoStack, entry] })
  },

  clearHistory: () => set({ undoStack: [], redoStack: [] }),
}))

/** Pushes a new entry and discards the redo stack (the standard convention). */
function pushEntry(entry: HistoryEntry) {
  useHistoryStore.setState((s) => ({ undoStack: [...s.undoStack, entry], redoStack: [] }))
}

function applyReverse(entry: HistoryEntry) {
  switch (entry.type) {
    case 'add': {
      const addedIds = new Set(entry.objects.map((o) => o.id))
      const addedJointIds = new Set(entry.joints.map((j) => j.id))
      useSceneStore.setState((s) => ({
        objects: s.objects.filter((o) => !addedIds.has(o.id)),
        selectedIds: s.selectedIds.filter((id) => !addedIds.has(id)),
        joints: s.joints.filter((j) => !addedJointIds.has(j.id)),
      }))
      break
    }
    case 'remove': {
      useSceneStore.setState((s) => {
        const objects = [...s.objects]
        const ascending = [...entry.entries].sort((a, b) => a.index - b.index)
        for (const { object, index } of ascending) {
          objects.splice(Math.min(index, objects.length), 0, object)
        }
        return { objects, joints: [...s.joints, ...entry.joints] }
      })
      break
    }
    case 'rename':
      useSceneStore.getState().renameObject(entry.id, entry.before)
      break
    case 'transform':
      useSceneStore.getState().updateTransform(entry.id, entry.before)
      syncTransformToPhysics(entry.id)
      break
    case 'physics':
      useSceneStore.getState().updatePhysics(entry.id, entry.before)
      applyPhysicsProps(entry.id, entry.before)
      break
    case 'jointCreate':
      // Direct setState, not `deleteJoint` — mirrors `entry.objects`'
      // own add/remove pattern above; `physicsStore`'s passive sync
      // (M4.1) reacts to the array reference change on its own.
      useSceneStore.setState((s) => ({ joints: s.joints.filter((j) => j.id !== entry.joint.id) }))
      break
    case 'jointUpdate':
      useSceneStore.getState().updateJoint(entry.id, entry.before)
      break
  }
}

function applyForward(entry: HistoryEntry) {
  switch (entry.type) {
    case 'add':
      useSceneStore.setState((s) => ({
        objects: [...s.objects, ...entry.objects],
        joints: [...s.joints, ...entry.joints],
      }))
      break
    case 'remove': {
      const removedIds = new Set(entry.entries.map((e) => e.object.id))
      const removedJointIds = new Set(entry.joints.map((j) => j.id))
      useSceneStore.setState((s) => ({
        objects: s.objects.filter((o) => !removedIds.has(o.id)),
        selectedIds: s.selectedIds.filter((id) => !removedIds.has(id)),
        joints: s.joints.filter((j) => !removedJointIds.has(j.id)),
      }))
      break
    }
    case 'rename':
      useSceneStore.getState().renameObject(entry.id, entry.after)
      break
    case 'transform':
      useSceneStore.getState().updateTransform(entry.id, entry.after)
      syncTransformToPhysics(entry.id)
      break
    case 'physics':
      useSceneStore.getState().updatePhysics(entry.id, entry.after)
      applyPhysicsProps(entry.id, entry.after)
      break
    case 'jointCreate':
      useSceneStore.setState((s) => ({ joints: [...s.joints, entry.joint] }))
      break
    case 'jointUpdate':
      useSceneStore.getState().updateJoint(entry.id, entry.after)
      break
  }
}

/** M3.3: pushes the store's current transform for `id` into its live Rapier body — §13's single source of ground truth. */
function syncTransformToPhysics(id: string): void {
  const object = useSceneStore.getState().objects.find((o) => o.id === id)
  if (object) applyTransform(object)
}

/**
 * The undoable action wrappers — UI components call these instead of
 * `sceneStore`'s raw actions for any user-initiated edit. Each records
 * exactly one history entry per call, which is what makes a batch
 * Duplicate/Delete across a multi-selection (M2.7) a single undo step:
 * the caller passes the whole id list in one call, not one call per id.
 *
 * D2: every one of these is also the single shared edit-lock guard —
 * each starts by checking `isEditLocked()` and no-ops (refuses the
 * edit, pushes no history) while the simulation isn't `idle`. This is
 * what "adding/deleting objects, dragging gizmos, and Properties-panel
 * commits are locked during playing/paused" reduces to: the UI layer is
 * unchanged, these wrappers just refuse to act.
 */

export function recordedAddObject(
  ...args: Parameters<ReturnType<typeof useSceneStore.getState>['addObject']>
): SceneObject | undefined {
  if (isEditLocked()) return undefined
  const object = useSceneStore.getState().addObject(...args)
  pushEntry({ type: 'add', objects: [object], joints: [] })
  return object
}

/**
 * D5/M4.5: duplicating a selection that contains **both** endpoints of a
 * joint also creates a new joint of the same type/axis/limits/motor,
 * connecting only the two new copies — never the originals, never a
 * translated copy of the original anchor. Reuses `sceneStore.createJoint`
 * itself for the new joint (not a hand-built entity) so D23's anchor
 * computation runs fresh from the two new copies' positions, exactly as
 * any other joint creation would. A selection with only one of a joint's
 * two endpoints, or neither, never cascades that joint (D5) — the
 * `selectedSet.has(...)` check on **both** sides is what enforces this.
 */
export function recordedDuplicateObjects(ids: string[]): SceneObject[] {
  if (isEditLocked()) return []
  const idMap = new Map<string, string>() // original id -> duplicate id
  const duplicates = ids
    .map((id) => {
      const duplicate = useSceneStore.getState().duplicateObject(id)
      if (duplicate) idMap.set(id, duplicate.id)
      return duplicate
    })
    .filter((o): o is SceneObject => o !== undefined)
  if (duplicates.length === 0) return []

  const selectedSet = new Set(ids)
  const cascadedJoints: JointEntity[] = []
  for (const joint of useSceneStore.getState().joints) {
    if (!selectedSet.has(joint.objectA) || !selectedSet.has(joint.objectB)) continue
    const newA = idMap.get(joint.objectA)
    const newB = idMap.get(joint.objectB)
    if (!newA || !newB) continue
    const newJoint = useSceneStore.getState().createJoint(newA, newB, joint.type, {
      axis: joint.axis,
      limits: joint.limits,
      motor: joint.motor,
    })
    if (newJoint) cascadedJoints.push(newJoint)
  }

  pushEntry({ type: 'add', objects: duplicates, joints: cascadedJoints })
  return duplicates
}

/**
 * D5/§9/M4.5: deleting an object that is the endpoint of one or more
 * joints cascades those joints' deletion too, as part of this **same**
 * single undo step — not a separate one. `cascadedJoints` is computed
 * from the pre-delete `joints` array (any joint with *either* endpoint
 * among `ids`), then explicitly deleted — `sceneStore.removeObject`
 * itself never touches `joints` (M4.1's own scope excluded that; this
 * task is what "M4.5" in that scope note refers to).
 */
export function recordedRemoveObjects(ids: string[]): void {
  if (isEditLocked()) return
  const { objects, joints } = useSceneStore.getState()
  const idSet = new Set(ids)
  const entries = ids
    .map((id) => ({ object: objects.find((o) => o.id === id), index: objects.findIndex((o) => o.id === id) }))
    .filter((e): e is { object: SceneObject; index: number } => e.object !== undefined)
  const cascadedJoints = joints.filter((j) => idSet.has(j.objectA) || idSet.has(j.objectB))

  for (const id of ids) useSceneStore.getState().removeObject(id)
  for (const joint of cascadedJoints) useSceneStore.getState().deleteJoint(joint.id)

  if (entries.length > 0 || cascadedJoints.length > 0) {
    pushEntry({ type: 'remove', entries, joints: cascadedJoints })
  }
}

export function recordedRenameObject(id: string, newName: string): void {
  if (isEditLocked()) return
  const before = useSceneStore.getState().objects.find((o) => o.id === id)?.name
  if (before === undefined || before === newName) return
  useSceneStore.getState().renameObject(id, newName)
  pushEntry({ type: 'rename', id, before, after: newName })
}

export function recordedUpdateTransform(id: string, transform: Partial<Transform>): void {
  if (isEditLocked()) return
  const before = useSceneStore.getState().objects.find((o) => o.id === id)?.transform
  if (!before) return
  useSceneStore.getState().updateTransform(id, transform)
  const after = useSceneStore.getState().objects.find((o) => o.id === id)!.transform
  syncTransformToPhysics(id)
  pushEntry({ type: 'transform', id, before, after })
}

/** D39 (refines D25): a Physics-field commit is exactly as undoable as a Transform commit — same one-entry-per-edit pattern. */
export function recordedUpdatePhysics(id: string, physics: Partial<PhysicsProps>): void {
  if (isEditLocked()) return
  const before = useSceneStore.getState().objects.find((o) => o.id === id)?.physics
  if (!before) return
  useSceneStore.getState().updatePhysics(id, physics)
  const after = useSceneStore.getState().objects.find((o) => o.id === id)!.physics
  applyPhysicsProps(id, after)
  pushEntry({ type: 'physics', id, before, after })
}

/**
 * §15's Create step, as one undoable step (D25) — M4.2's own scope.
 * Reuses `sceneStore.createJoint`'s validation/defaulting exactly (never
 * re-implemented here); a rejected create (self-join, duplicate pair, or
 * D2-locked) returns `undefined` and pushes no history entry. Unlike
 * `recordedUpdateTransform`/`recordedUpdatePhysics`, this never calls a
 * `physicsStore` function directly — `M4.1`'s passive sync already
 * reacts to `sceneStore.joints`' array reference changing on its own.
 */
export function recordedCreateJoint(
  objectAId: string,
  objectBId: string,
  type: JointType,
  overrides?: JointOverrides,
): JointEntity | undefined {
  if (isEditLocked()) return undefined
  const joint = useSceneStore.getState().createJoint(objectAId, objectBId, type, overrides)
  if (!joint) return undefined
  pushEntry({ type: 'jointCreate', joint })
  return joint
}

/**
 * M4.3: axis/limits/motor edits on an existing joint, one undo step per
 * commit gesture — same shape as `recordedUpdatePhysics`. **Not** the
 * path for a live Motor Speed edit while `playing` — D2's one named
 * exception for that field calls `sceneStore.updateJoint` directly
 * instead (mirroring `TransportBar.tsx`'s Speed buttons, `M3.5`'s own
 * precedent for a control D2's lock doesn't cover), which is exactly
 * why undo is disabled for that edit per D25's "undo is off entirely
 * while playing" — there is no wrapper call to disable in the first
 * place.
 */
export function recordedUpdateJoint(jointId: string, partial: Partial<JointEntity>): void {
  if (isEditLocked()) return
  const before = useSceneStore.getState().joints.find((j) => j.id === jointId)
  if (!before) return
  useSceneStore.getState().updateJoint(jointId, partial)
  const after = useSceneStore.getState().joints.find((j) => j.id === jointId)!
  pushEntry({ type: 'jointUpdate', id: jointId, before, after })
}

/**
 * D20/M4.7: inserts the Robot Arm assembly's four objects (D29 defaults
 * — `static`, exactly like any other freshly-added object) plus its two
 * Revolute joints (motor off, per `createJoint`'s own default — D29's
 * spirit extended to joints) as **one** undo step, reusing the existing
 * `'add'` entry shape (`objects` + `joints`) `M4.5`'s cascade already
 * established — no new `HistoryEntry` variant needed. `origin` is where
 * Base (index 0, the assembly's reference point per §11) lands; every
 * other part's position is Base's placed position plus its authored
 * `offset` (`assets/assemblies.ts`), never independently ground-clamped.
 * Each joint's anchor is computed fresh by `sceneStore.createJoint`
 * itself from the just-placed objects' actual positions (D23), not
 * hand-derived here. Selection is the caller's job (matching
 * `recordedAddObject`/`recordedDuplicateObjects`'s existing convention
 * — D25 never records selection).
 */
export function recordedInsertRobotArmAssembly(origin: [number, number, number]): SceneObject[] | undefined {
  if (isEditLocked()) return undefined

  const baseY = robotArmBaseY()
  const objects = ROBOT_ARM_ASSEMBLY.parts.map((part) =>
    useSceneStore.getState().addObject({ kind: 'builtin', key: part.assetKey }, part.name, {
      position: [origin[0] + part.offset[0], baseY + part.offset[1], origin[2] + part.offset[2]],
      scale: part.scale,
    }),
  )

  const joints: JointEntity[] = []
  for (const spec of ROBOT_ARM_ASSEMBLY.joints) {
    const joint = useSceneStore
      .getState()
      .createJoint(objects[spec.partAIndex].id, objects[spec.partBIndex].id, spec.type, { axis: spec.axis })
    if (joint) joints.push(joint)
  }

  pushEntry({ type: 'add', objects, joints })
  return objects
}

/**
 * D27/M5.5: places one instance of an already-uploaded asset into the
 * scene — an ordinary, single-object undoable add (D25 already covers a
 * Transform edit, and a placement's `scale` is just its initial
 * Transform, so no new undo mechanism is needed; reuses
 * `recordedAddObject` directly rather than duplicating its logic).
 * `unitScale` is read from the upload record itself (`M5.5`'s own
 * captured value, `uploadedAssetsStore.setUnitScale`) and applied
 * uniformly to X/Y/Z — never re-entered per placement. The display name
 * is the source filename with its extension stripped (§10's "asset
 * type name" for an upload, matching `M5.7`'s own naming rule so a
 * second placement becomes "<name> 2" via `recordedAddObject`'s
 * existing collision-avoidance, not a new counter). `M5.7`'s real
 * click/drag library-card UI calls this same function — this task does
 * not duplicate placement logic for a UI it doesn't yet build.
 */
export function recordedPlaceUploadedAsset(
  uploadId: string,
  position: [number, number, number] = [0, 0, 0],
): SceneObject | undefined {
  const record = useUploadedAssetsStore.getState().uploads.find((u) => u.id === uploadId)
  if (!record) return undefined

  const displayName = record.filename.replace(/\.[^./]+$/, '')
  const scale: [number, number, number] = [record.unitScale, record.unitScale, record.unitScale]
  return recordedAddObject({ kind: 'uploaded', key: uploadId }, displayName, { position, scale })
}
