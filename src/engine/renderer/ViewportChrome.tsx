import { GizmoHelper, GizmoViewport, Grid } from '@react-three/drei'

/**
 * Viewport chrome (D34): grid, axes, origin marker, orientation gizmo.
 * Pure rendering, fed by no store and writing back to no store — these are
 * never scene objects (no `id`/`name`/transform record per §5's schema),
 * never appear in the Hierarchy, are never serialized, and are unaffected
 * by Undo/Reset. Always rendered, regardless of any application state.
 */
export function ViewportChrome() {
  return (
    <>
      <Grid
        args={[20, 20]}
        cellColor="#3a3a42"
        sectionColor="#52525c"
        fadeDistance={40}
        infiniteGrid
      />
      <axesHelper args={[5]} />
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshBasicMaterial color="#e4e4e7" />
      </mesh>

      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport />
      </GizmoHelper>
    </>
  )
}
