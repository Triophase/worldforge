import { OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useRef } from 'react'
import type { OrthographicCamera as ThreeOrthographicCamera, PerspectiveCamera as ThreePerspectiveCamera } from 'three'
import { Vector3 } from 'three'
import { PRESET_DIRECTIONS, useCameraViewStore } from '../../state/cameraViewStore'

/** Preset transitions ease over this long — within spec §22's 150-250ms range. */
const TRANSITION_MS = 200

/**
 * Generalized over both `presetRequest` (camera moves, target fixed) and
 * `M8.2`'s `frameRequest` (both camera *and* target move) — the same
 * eased-move loop drives either, per the task's own "reuse M1.3's
 * existing eased-transition mechanism... with a new target" framing. A
 * preset animation sets `targetStart === targetEnd` (the current
 * target, unchanged), so lerping it every frame is a no-op for that
 * case — no branch needed in the per-frame update below.
 */
interface CameraAnimation {
  cameraStart: Vector3
  cameraEnd: Vector3
  targetStart: Vector3
  targetEnd: Vector3
  /** Milliseconds elapsed since the transition started, accumulated from useFrame's own `delta`. */
  elapsedMs: number
}

/**
 * Owns both camera objects (perspective + orthographic) and the eased
 * preset-view transition. Bridges `cameraViewStore` (written to from the
 * View menu, outside the <Canvas>) with the live camera/OrbitControls
 * (inside it).
 */
export function CameraRig() {
  const projection = useCameraViewStore((s) => s.projection)

  const perspRef = useRef<ThreePerspectiveCamera>(null)
  const orthoRef = useRef<ThreeOrthographicCamera>(null)
  const animation = useRef<CameraAnimation | null>(null)
  const lastPresetRequestId = useRef(0)
  const lastFrameRequestId = useRef(0)

  // Keep both camera objects at the same pose, so switching which one is
  // `makeDefault` never jumps to a stale position (spec §8: the toggle
  // "preserves the current look-at target and camera-to-target distance").
  useLayoutEffect(() => {
    const active = projection === 'perspective' ? perspRef.current : orthoRef.current
    const inactive = projection === 'perspective' ? orthoRef.current : perspRef.current
    if (active && inactive) {
      active.position.copy(inactive.position)
      active.quaternion.copy(inactive.quaternion)
    }
  }, [projection])

  useFrame((state, delta) => {
    const camera = state.camera
    const controls = state.controls as { target?: Vector3; update?: () => void } | null
    const target = controls?.target ?? new Vector3(0, 0, 0)

    // Read fresh from the store rather than a value captured by this
    // closure at the last React render — `useFrame` runs every frame
    // regardless of whether cameraViewStore's changes have triggered a
    // re-render yet (they're independent update cycles; relying on a
    // stale closured `presetRequest` here missed every preset request
    // whose store update hadn't yet propagated through a re-render).
    const presetRequest = useCameraViewStore.getState().presetRequest
    const frameRequest = useCameraViewStore.getState().frameRequest

    if (presetRequest && presetRequest.requestId !== lastPresetRequestId.current) {
      lastPresetRequestId.current = presetRequest.requestId
      const distance = camera.position.distanceTo(target)
      const direction = PRESET_DIRECTIONS[presetRequest.preset]
      const cameraEnd = target.clone().addScaledVector(direction, distance)
      // Restart from the camera's CURRENT position, not the previous
      // animation's target — so retriggering mid-transition resolves
      // cleanly to the new preset with no stuck/glitched state. The
      // orbit target itself never moves for a preset — `targetStart`/
      // `targetEnd` are both the current (unchanged) target.
      animation.current = {
        cameraStart: camera.position.clone(),
        cameraEnd,
        targetStart: target.clone(),
        targetEnd: target.clone(),
        elapsedMs: 0,
      }
    }

    // `M8.2`'s `F`: unlike a preset, the orbit target itself moves — to
    // the selected object's position — while camera-to-target distance
    // *and* the current viewing direction are both preserved, so framing
    // an object never spins the camera to some canonical angle, only
    // recenters it.
    if (frameRequest && frameRequest.requestId !== lastFrameRequestId.current) {
      lastFrameRequestId.current = frameRequest.requestId
      const targetEnd = new Vector3(...frameRequest.position)
      const distance = camera.position.distanceTo(target)
      const direction = camera.position.clone().sub(target).normalize()
      const cameraEnd = targetEnd.clone().addScaledVector(direction, distance)
      animation.current = {
        cameraStart: camera.position.clone(),
        cameraEnd,
        targetStart: target.clone(),
        targetEnd,
        elapsedMs: 0,
      }
    }

    if (animation.current) {
      const anim = animation.current
      anim.elapsedMs += delta * 1000
      const t = Math.min(1, anim.elapsedMs / TRANSITION_MS)
      const eased = 1 - (1 - t) ** 3 // ease-out cubic
      camera.position.lerpVectors(anim.cameraStart, anim.cameraEnd, eased)
      const newTarget = new Vector3().lerpVectors(anim.targetStart, anim.targetEnd, eased)
      if (controls?.target) controls.target.copy(newTarget)
      camera.lookAt(newTarget)
      controls?.update?.()
      if (t >= 1) animation.current = null
    }
  })

  return (
    <>
      <PerspectiveCamera
        ref={perspRef}
        makeDefault={projection === 'perspective'}
        fov={50}
        near={0.1}
        far={1000}
        position={[6, 5, 6]}
      />
      <OrthographicCamera
        ref={orthoRef}
        makeDefault={projection === 'orthographic'}
        zoom={80}
        near={0.1}
        far={1000}
        position={[6, 5, 6]}
      />
    </>
  )
}
