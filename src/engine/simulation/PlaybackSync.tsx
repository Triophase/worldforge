import { useFrame } from '@react-three/fiber'
import { getBuiltinAsset } from '../../assets'
import { usePlaybackBridgeStore } from '../../state/playbackBridgeStore'
import { useSceneStore } from '../../state/sceneStore'
import { useSimulationStore } from '../../state/simulationStore'
import { decomposeMeshQuaternion } from '../../utils/assetRotation'
import { usePhysicsStore } from '../physics/physicsStore'

/**
 * D2: "the Properties panel continues to show the selected object's
 * live transform... read-only" while the simulation isn't `idle`. Writes
 * the sole-selected object's current position/rotation into
 * `playbackBridgeStore` every frame — `sceneStore` itself is never
 * touched during play (per §13, only the live body and mesh are), so
 * this is the DOM-side panel's only way to see the current pose.
 * Rotation is decomposed back out of the asset's `defaultRotation` (the
 * same boundary `SceneObjects.tsx`'s gizmo commit uses) since the body's
 * raw rotation is the *composed*, tilt-inclusive quaternion.
 */
export function PlaybackSync() {
  useFrame(() => {
    const bridge = usePlaybackBridgeStore.getState()
    if (useSimulationStore.getState().phase === 'idle') return

    const selectedIds = useSceneStore.getState().selectedIds
    if (selectedIds.length !== 1) return
    const id = selectedIds[0]

    const object = useSceneStore.getState().objects.find((o) => o.id === id)
    const definition = object && getBuiltinAsset(object.assetRef.key)
    const body = usePhysicsStore.getState().bodies.get(id)?.rigidBody
    if (!object || !definition || !body) return

    const t = body.translation()
    const r = body.rotation()
    bridge.setLiveTransform({
      position: [t.x, t.y, t.z],
      rotation: decomposeMeshQuaternion([r.x, r.y, r.z, r.w], definition.defaultRotation),
      scale: object.transform.scale,
    })
  })
  return null
}
