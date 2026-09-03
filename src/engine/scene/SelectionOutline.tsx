import { Outlines } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'

/** Within spec §22's 150-250ms eased range. */
const FADE_MS = 200

/**
 * A material-independent selection outline (§9: "not a color/material
 * change... composes with any material") that eases in/out via scale
 * (§22) rather than an instant snap — wraps drei's `<Outlines>`, which
 * renders a distinct silhouette mesh, never touching the object's own
 * material.
 *
 * Always mounted; visibility and scale are driven imperatively via a ref
 * every frame (`object3D.visible`, `.scale`), never through React state —
 * a React state change triggered from inside `useFrame` isn't reliably
 * observable in this project's test tooling without extra `act()`
 * plumbing `advanceFrames` doesn't provide (see `.ai/memory/M2.5.md`).
 * Using plain mutable Object3D properties instead sidesteps that
 * entirely and is the more idiomatic imperative-animation pattern anyway.
 */
export function SelectionOutline({ selected }: { selected: boolean }) {
  const groupRef = useRef<Group>(null)
  const progress = useRef(selected ? 1 : 0)

  useFrame((_, delta) => {
    const target = selected ? 1 : 0
    const step = (delta * 1000) / FADE_MS
    progress.current =
      target > progress.current
        ? Math.min(target, progress.current + step)
        : Math.max(target, progress.current - step)

    const group = groupRef.current
    if (group) {
      const eased = 1 - (1 - progress.current) ** 3
      group.scale.setScalar(eased)
      group.visible = progress.current > 0.001
    }
  })

  return (
    <group ref={groupRef} visible={selected}>
      <Outlines thickness={3} color="#6d8dfc" transparent opacity={0.9} />
    </group>
  )
}
