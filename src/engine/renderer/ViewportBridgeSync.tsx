import { useFrame } from '@react-three/fiber'
import { useViewportBridgeStore } from '../../state/viewportBridgeStore'

/**
 * Keeps `viewportBridgeStore` synced with the live active camera (which
 * changes when M1.3's projection toggle fires) and the canvas's DOM
 * element, every frame — same "cheap enough, always fresh" pattern as
 * `RenderModeSync`.
 */
export function ViewportBridgeSync() {
  useFrame((state) => {
    const current = useViewportBridgeStore.getState()
    if (current.camera !== state.camera || current.domElement !== state.gl.domElement) {
      useViewportBridgeStore.setState({ camera: state.camera, domElement: state.gl.domElement })
    }
  })

  return null
}
