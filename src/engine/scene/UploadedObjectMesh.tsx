import { TransformControls } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import type { RefObject } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import type { Group, Object3D } from 'three'
import { Box3, Vector3 } from 'three'
import { usePhysicsStore } from '../physics/physicsStore'
import { useContextMenuStore } from '../../state/contextMenuStore'
import { useGizmoDragStore } from '../../state/gizmoDragStore'
import type { GizmoMode } from '../../state/gizmoModeStore'
import { useGizmoModeStore } from '../../state/gizmoModeStore'
import { recordedUpdateTransform } from '../../state/historyStore'
import type { SceneObject, Transform } from '../../state/sceneStore'
import { useSceneStore } from '../../state/sceneStore'
import { useSimulationStore } from '../../state/simulationStore'
import { useSnappingStore } from '../../state/snappingStore'
import { useUploadedAssetsStore } from '../../state/uploadedAssetsStore'
import { ensureRemoteAssetResolved } from '../../loaders/AssetLoader/resolveRemoteAsset'
import { eulerDegreesToQuaternion, quaternionToEulerDegrees } from '../../utils/eulerQuaternion'
import { snapToIncrement } from '../../utils/snap'
import { selectModeFromEvent } from '../../utils/selectionModifiers'
import { SelectionOutline } from './SelectionOutline'

/**
 * `SceneObjectMesh`'s snapping logic (`SceneObjects.tsx`), duplicated
 * rather than shared since the two components don't otherwise share a
 * module — behaviorally identical for both axes: an uploaded object's
 * `transform.rotation` is a plain mesh quaternion with no
 * `defaultRotation` tilt composition (D27: no up-axis correction), so
 * §20's Euler-degree snap boundary (`utils/eulerQuaternion.ts`) applies
 * to it exactly as-is, with no compose/decompose step either side.
 */
function snapTransform(transform: Transform, gizmoMode: GizmoMode): Transform {
  const snapping = useSnappingStore.getState()

  if (gizmoMode === 'translate' && snapping.moveEnabled) {
    return {
      ...transform,
      position: transform.position.map((v) => snapToIncrement(v, snapping.moveSnap)) as [
        number,
        number,
        number,
      ],
    }
  }

  if (gizmoMode === 'rotate' && snapping.rotationEnabled) {
    const degrees = quaternionToEulerDegrees(transform.rotation).map((d) =>
      snapToIncrement(d, snapping.rotationSnapDeg),
    ) as [number, number, number]
    return { ...transform, rotation: eulerDegreesToQuaternion(degrees) }
  }

  return transform
}

/**
 * `M5.7`'s uploaded-object renderer — `SceneObjects.tsx`'s
 * `SceneObjectMesh` assumes one shared `BufferGeometry` per object
 * (built-ins, `M2.2`), which doesn't fit an arbitrary parsed upload
 * (often several meshes/materials, `M5.2`-`M5.4`), so this is a
 * deliberately separate component rather than a shape-agnostic
 * rewrite of the original — same interaction contract (click-select,
 * gizmo, snapping, D2 lock, D3 physics sync), different rendering
 * primitive (`<primitive object={cloned}>` wrapped in a `<group>`
 * instead of a single `<mesh geometry={...}>`).
 */
export function UploadedObjectMesh({ object, selected }: { object: SceneObject; selected: boolean }) {
  const select = useSceneStore((s) => s.select)
  const isSoleSelection = useSceneStore(
    (s) => s.selectedIds.length === 1 && s.selectedIds[0] === object.id,
  )
  const isIdle = useSimulationStore((s) => s.phase === 'idle')
  const gizmoMode = useGizmoModeStore((s) => s.mode)
  const setLiveTransform = useGizmoDragStore((s) => s.setLiveTransform)
  const clearLiveTransform = useGizmoDragStore((s) => s.clearLiveTransform)
  const groupRef = useRef<Group>(null)

  // `assetRef.key` is the upload's own id for an `'uploaded'` object
  // (`historyStore.ts`'s `recordedPlaceUploadedAsset`) — the same field
  // a built-in uses for its registry key.
  const record = useUploadedAssetsStore((s) => s.uploads.find((u) => u.id === object.assetRef.key))

  // `M6.10`: no local record means this session never parsed the file
  // itself — either a different device, or the same device after a
  // reload (the upload store is session-scoped, never persisted). If the
  // key is a server asset id (true once the containing scene has been
  // saved), fetch+re-parse it once; the store update this triggers
  // re-renders with `record` populated, same as an ordinary upload.
  useEffect(() => {
    if (!record) ensureRemoteAssetResolved(object.assetRef.key)
  }, [record, object.assetRef.key])

  // Cloned once per mounted instance: the store's own `record.object` is
  // shared across every placed instance of the same upload, and a given
  // `Object3D` can only ever have one parent — each scene instance needs
  // its own independent copy to attach into its own `<group>`.
  const cloned = useMemo(() => record?.object.clone(true) ?? null, [record])

  // A precise (not approximated) bounding box for the selection-outline
  // proxy below, measured from the actual cloned subtree rather than the
  // upload's stored width/height/depth-only metadata (`ParsedAsset`
  // never kept min/max, only size) — cheap, computed once per instance.
  const outlineBox = useMemo(() => {
    if (!cloned) return null
    const box = new Box3().setFromObject(cloned)
    return { size: box.getSize(new Vector3()), center: box.getCenter(new Vector3()) }
  }, [cloned])

  // Identical contract to `SceneObjectMesh`'s own physics-sync `useFrame`
  // (M3.3/§13) — the live Rapier body is the single source of ground
  // truth every frame, skipped only while this object is under an active
  // gizmo drag. Called unconditionally, before any early return.
  useFrame(() => {
    const group = groupRef.current
    if (!group) return

    const dragging = useGizmoDragStore.getState().liveTransform !== null
    const sole = useSceneStore.getState().selectedIds.length === 1 && useSceneStore.getState().selectedIds[0] === object.id
    if (dragging && sole) return

    const body = usePhysicsStore.getState().bodies.get(object.id)?.rigidBody
    if (!body) return

    const t = body.translation()
    const r = body.rotation()
    group.position.set(t.x, t.y, t.z)
    group.quaternion.set(r.x, r.y, r.z, r.w)
  })

  if (!cloned || !outlineBox) return null

  function handleClick(e: ThreeEvent<MouseEvent>) {
    e.stopPropagation()
    select(object.id, selectModeFromEvent(e))
  }

  // `M8.1`/§21 — identical contract to `SceneObjects.tsx`'s own handler.
  function handleContextMenu(e: ThreeEvent<MouseEvent>) {
    e.stopPropagation()
    e.nativeEvent.preventDefault()
    e.nativeEvent.stopPropagation()
    if (useSimulationStore.getState().phase !== 'idle') return
    if (!useSceneStore.getState().selectedIds.includes(object.id)) {
      select(object.id, 'replace')
    }
    useContextMenuStore.getState().openMenu(e.nativeEvent.clientX, e.nativeEvent.clientY)
  }

  function readLiveTransform(): Transform {
    const group = groupRef.current!
    return {
      position: group.position.toArray() as [number, number, number],
      rotation: group.quaternion.toArray() as [number, number, number, number],
      scale: group.scale.toArray() as [number, number, number],
    }
  }

  function handleObjectChange() {
    if (!groupRef.current) return
    setLiveTransform(readLiveTransform())
  }

  function handleDragEnd() {
    if (groupRef.current) recordedUpdateTransform(object.id, snapTransform(readLiveTransform(), gizmoMode))
    clearLiveTransform()
  }

  const showGizmo = isSoleSelection && gizmoMode !== 'select' && isIdle

  return (
    <>
      <group
        ref={groupRef}
        name="scene-object-mesh"
        position={object.transform.position}
        quaternion={object.transform.rotation}
        scale={object.transform.scale}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        <primitive object={cloned as Object3D} />
        <mesh position={outlineBox.center.toArray()} visible={false}>
          <boxGeometry args={outlineBox.size.toArray() as [number, number, number]} />
          <SelectionOutline selected={selected} />
        </mesh>
      </group>
      {showGizmo && (
        <TransformControls
          object={groupRef as RefObject<Object3D>}
          mode={gizmoMode}
          onObjectChange={handleObjectChange}
          onMouseUp={handleDragEnd}
        />
      )}
    </>
  )
}
