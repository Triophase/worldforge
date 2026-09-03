import { useFrame } from '@react-three/fiber'
import { usePhysicsStore } from '../physics/physicsStore'
import { useSimulationStore } from '../../state/simulationStore'

/** Rapier's own default fixed timestep (60Hz) — the "base" §16's speed multiplier scales. */
const BASE_TIMESTEP = 1 / 60

/**
 * The one place `world.step()` is ever called — mounted once in the
 * Canvas (`SceneContent.tsx`), never per-mesh (`SceneObjects.tsx`'s own
 * `useFrame` only *reads* body state, never advances it). §16: speed
 * scales the physics *timestep* passed to each step call, never the
 * `requestAnimationFrame` rate this `useFrame` itself runs at — one
 * step is still taken per rendered frame, just covering more (or less)
 * simulated time. Reads `phase`/`speed` fresh via `.getState()` each
 * frame, not a reactive hook value (the established `useFrame`-staleness
 * rule, M1.3), so a mid-play speed change takes effect on the very next
 * step with no Pause required.
 */
export function SimulationStepper() {
  useFrame(() => {
    const { phase, speed } = useSimulationStore.getState()
    if (phase !== 'playing') return

    const world = usePhysicsStore.getState().world
    if (!world) return

    const timestep = BASE_TIMESTEP * speed
    world.timestep = timestep
    world.step()
    useSimulationStore.getState().advanceElapsed(timestep)
  })
  return null
}
