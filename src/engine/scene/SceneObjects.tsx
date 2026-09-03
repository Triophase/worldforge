import { TransformControls } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import type { RefObject } from 'react'
import { useMemo, useRef } from 'react'
import type { Mesh } from 'three'
import { getBuiltinAsset, getSharedGeometry } from '../../assets'
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
import { composeMeshQuaternion, decomposeMeshQuaternion } from '../../utils/assetRotation'
import { eulerDegreesToQuaternion, quaternionToEulerDegrees } from '../../utils/eulerQuaternion'
import { selectModeFromEvent } from '../../utils/selectionModifiers'
import { snapToIncrement } from '../../utils/snap'
import { SelectionOutline } from './SelectionOutline'
import { UploadedObjectMesh } from './UploadedObjectMesh'

const material = { color: '#9ca3af', roughness: 0.6, metalness: 0.1 }

/**
 * §20: snapping applies only to a gizmo drag's committed value, and only
 * for the mode that was active — translate rounds position (all three
 * axes, per §20's own wording), rotate rounds the Euler-degree
 * equivalent before converting back to a quaternion (D21's one
 * conversion boundary, reused here). Scale is never snapped — §20
 * doesn't define a scale-snap at all. Reads the snapping store fresh at
 * commit time rather than as a reactive hook value, since this only ever
 * runs from a discrete drag-end event, not a per-frame callback.
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

function SceneObjectMesh({ object, selected }: { object: SceneObject; selected: boolean }) {
  const select = useSceneStore((s) => s.select)
  // The gizmo only ever attaches to a lone selection (D35/§33 — no group
  // gizmo), independent of whether this mesh's outline is showing (which
  // now reflects mere membership in a possibly-multi selection, M2.7).
  const isSoleSelection = useSceneStore(
    (s) => s.selectedIds.length === 1 && s.selectedIds[0] === object.id,
  )
  // D2: no gizmo dragging while the simulation isn't idle.
  const isIdle = useSimulationStore((s) => s.phase === 'idle')
  const gizmoMode = useGizmoModeStore((s) => s.mode)
  const setLiveTransform = useGizmoDragStore((s) => s.setLiveTransform)
  const clearLiveTransform = useGizmoDragStore((s) => s.clearLiveTransform)
  const meshRef = useRef<Mesh>(null)
  const definition = getBuiltinAsset(object.assetRef.key)
  const geometry = getSharedGeometry(object.assetRef.key)

  const quaternion = useMemo((): [number, number, number, number] => {
    if (!definition) return [0, 0, 0, 1]
    return composeMeshQuaternion(object.transform.rotation, definition.defaultRotation)
  }, [definition, object.transform.rotation])

  // M3.3/§13: the Rapier body is the single source of ground truth every
  // frame, regardless of whether the world is currently being stepped —
  // no easing, no interpolation (§22). Skipped while this specific mesh
  // is under an active gizmo drag, since `TransformControls` already owns
  // `meshRef.current` imperatively then; `handleDragEnd`'s
  // `recordedUpdateTransform` writes the committed pose into the body
  // (`historyStore`'s `syncTransformToPhysics`) so this sync picks up
  // exactly where the drag left off, with no visual snap. Reads stores
  // fresh via `.getState()`, never a reactive hook value, per the
  // established `useFrame`-staleness rule (M1.3). Called unconditionally,
  // before the `!definition || !geometry` early return, per rules-of-hooks.
  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return

    const dragging = useGizmoDragStore.getState().liveTransform !== null
    const sole = useSceneStore.getState().selectedIds.length === 1 && useSceneStore.getState().selectedIds[0] === object.id
    if (dragging && sole) return

    const body = usePhysicsStore.getState().bodies.get(object.id)?.rigidBody
    if (!body) return

    const t = body.translation()
    const r = body.rotation()
    mesh.position.set(t.x, t.y, t.z)
    mesh.quaternion.set(r.x, r.y, r.z, r.w)
  })

  if (!definition || !geometry) return null

  function handleClick(e: ThreeEvent<MouseEvent>) {
    e.stopPropagation()
    select(object.id, selectModeFromEvent(e))
  }

  // `M8.1`/§21: select-first (single selection, only if not already part
  // of the current selection — a multi-selected member stays multi so
  // the menu can show its own reduced item set, §9), then open the menu
  // at the click's viewport coordinates. `stopPropagation` at both the
  // R3F level (no other mesh behind this one also reacts) and the
  // native level (the click never reaches `ViewportRegion`'s own
  // empty-space handler) — D40's "empty space" case is genuinely empty
  // space only. D2: no menu at all while the simulation isn't idle.
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
    const mesh = meshRef.current!
    return {
      position: mesh.position.toArray() as [number, number, number],
      rotation: decomposeMeshQuaternion(
        mesh.quaternion.toArray() as [number, number, number, number],
        definition!.defaultRotation,
      ),
      scale: mesh.scale.toArray() as [number, number, number],
    }
  }

  function handleObjectChange() {
    if (!meshRef.current) return
    setLiveTransform(readLiveTransform())
  }

  function handleDragEnd() {
    if (meshRef.current) recordedUpdateTransform(object.id, snapTransform(readLiveTransform(), gizmoMode))
    clearLiveTransform()
  }

  const showGizmo = isSoleSelection && gizmoMode !== 'select' && isIdle

  return (
    <>
      <mesh
        ref={meshRef}
        name="scene-object-mesh"
        geometry={geometry}
        position={object.transform.position}
        quaternion={quaternion}
        scale={object.transform.scale}
        castShadow
        receiveShadow
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        <meshStandardMaterial {...material} />
        <SelectionOutline selected={selected} />
      </mesh>
      {showGizmo && (
        <TransformControls
          object={meshRef as RefObject<Mesh>}
          mode={gizmoMode}
          onObjectChange={handleObjectChange}
          onMouseUp={handleDragEnd}
        />
      )}
    </>
  )
}

export function SceneObjects() {
  const objects = useSceneStore((s) => s.objects)
  const selectedIds = useSceneStore((s) => s.selectedIds)
  return (
    <>
      {objects.map((object) =>
        object.assetRef.kind === 'uploaded' ? (
          <UploadedObjectMesh key={object.id} object={object} selected={selectedIds.includes(object.id)} />
        ) : (
          <SceneObjectMesh key={object.id} object={object} selected={selectedIds.includes(object.id)} />
        ),
      )}
    </>
  )
}
