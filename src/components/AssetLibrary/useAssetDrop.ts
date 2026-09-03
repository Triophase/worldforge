import type { DragEvent } from 'react'
import { ROBOT_ARM_ASSEMBLY } from '../../assets/assemblies'
import { getBottomOffsetY, getUploadedBottomOffsetY, raycastGroundPlane } from '../../assets/placement'
import { getBuiltinAsset } from '../../assets/registry'
import { recordedAddObject, recordedInsertRobotArmAssembly, recordedPlaceUploadedAsset } from '../../state/historyStore'
import { useSceneStore } from '../../state/sceneStore'
import { useUploadedAssetsStore } from '../../state/uploadedAssetsStore'
import { useViewportBridgeStore } from '../../state/viewportBridgeStore'
import { ASSET_DRAG_MIME } from './AssetLibraryPanel'

/**
 * Drop-anywhere-in-the-app handler for M2.3's drag-to-place: raycasts
 * against the ground plane if the drop lands over the viewport, otherwise
 * (or if the raycast misses) falls back to the exact origin-offset
 * placement click-to-add uses (§11's stated fallback) — this is why the
 * handler lives at the app-shell level, not scoped to the viewport's own
 * DOM element: a drop over the Properties panel must still succeed.
 */
export function useAssetDrop() {
  const select = useSceneStore((s) => s.select)

  function onDragOver(e: DragEvent) {
    if (e.dataTransfer.types.includes(ASSET_DRAG_MIME)) e.preventDefault()
  }

  function onDrop(e: DragEvent) {
    const key = e.dataTransfer.getData(ASSET_DRAG_MIME)
    if (!key) return

    if (key === ROBOT_ARM_ASSEMBLY.key) {
      e.preventDefault()
      const { camera, domElement } = useViewportBridgeStore.getState()
      const hit = camera && domElement ? raycastGroundPlane(camera, domElement, e.clientX, e.clientY) : null
      const origin: [number, number, number] = hit ? [hit.x, 0, hit.z] : [0, 0, 0]
      const objects = recordedInsertRobotArmAssembly(origin)
      if (objects) select(objects[0].id) // Base — D2: refused (returns undefined) while the simulation isn't idle.
      return
    }

    const definition = getBuiltinAsset(key)
    if (definition) {
      e.preventDefault()

      const y = getBottomOffsetY(key)
      const { camera, domElement } = useViewportBridgeStore.getState()
      const hit = camera && domElement ? raycastGroundPlane(camera, domElement, e.clientX, e.clientY) : null

      const position: [number, number, number] = hit ? [hit.x, y, hit.z] : [0, y, 0]
      const object = recordedAddObject({ kind: 'builtin', key }, definition.displayName, { position })
      if (object) select(object.id) // D2: refused (returns undefined) while the simulation isn't idle.
      return
    }

    // M5.7: not a builtin key either — try the uploaded-assets store
    // (drag payload is the upload's own id for an uploaded card).
    const record = useUploadedAssetsStore.getState().uploads.find((u) => u.id === key)
    if (!record) return
    e.preventDefault()

    const y = getUploadedBottomOffsetY(record.object, record.unitScale)
    const { camera, domElement } = useViewportBridgeStore.getState()
    const hit = camera && domElement ? raycastGroundPlane(camera, domElement, e.clientX, e.clientY) : null

    const position: [number, number, number] = hit ? [hit.x, y, hit.z] : [0, y, 0]
    const object = recordedPlaceUploadedAsset(key, position)
    if (object) select(object.id) // D2: refused (returns undefined) while the simulation isn't idle.
  }

  return { onDragOver, onDrop }
}
