import { Canvas } from '@react-three/fiber'
import { useSceneStore } from '../../state/sceneStore'
import { SceneContent } from './SceneContent'

/**
 * The R3F `<Canvas>` mount point. Lighting/camera/controls live in
 * `SceneContent` (kept separate so it's testable without a real `<Canvas>`
 * — see that file's comment).
 */
export function SceneCanvas() {
  const clearSelection = useSceneStore((s) => s.clearSelection)

  return (
    <Canvas
      shadows
      style={{ width: '100%', height: '100%', display: 'block' }}
      // R3F's own "no object was hit" signal — fires for a click on the
      // grid/chrome/empty sky, exactly the "empty space" case (§9).
      onPointerMissed={() => clearSelection()}
    >
      <SceneContent />
    </Canvas>
  )
}
