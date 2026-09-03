import { OrbitControls } from '@react-three/drei'
import { MOUSE } from 'three'
import { PlaybackSync } from '../simulation/PlaybackSync'
import { SimulationStepper } from '../simulation/SimulationStepper'
import { JointIndicators } from '../scene/JointIndicators'
import { SceneObjects } from '../scene/SceneObjects'
import { CameraRig } from './CameraRig'
import { RenderModeSync } from './RenderModeSync'
import { ViewportBridgeSync } from './ViewportBridgeSync'
import { ViewportChrome } from './ViewportChrome'

/**
 * The default camera, lighting, and orbit controls (spec §8) — separated
 * from the `<Canvas>` wrapper (`SceneCanvas.tsx`) so it can be exercised
 * directly with `@react-three/test-renderer`, which supplies its own
 * headless canvas context and must not be handed a component that renders
 * a real `<Canvas>` itself.
 *
 * The camera lives in `CameraRig` (both perspective and orthographic
 * variants, plus the preset-transition logic, M1.3) rather than being
 * declared inline here.
 */
export function SceneContent() {
  return (
    <>
      <CameraRig />

      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 5]} intensity={1} castShadow />

      <ViewportChrome />
      <RenderModeSync />
      <ViewportBridgeSync />
      <SimulationStepper />
      <PlaybackSync />
      <SceneObjects />
      <JointIndicators />

      <OrbitControls
        makeDefault
        enableDamping={false}
        mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.PAN }}
      />
    </>
  )
}
