import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group } from 'three'
import { Vector3 } from 'three'
import { localPointToWorld, localVectorToWorld, worldVectorToLocal } from '../physics/jointMath'
import type { PhysicsJointHandle } from '../physics/physicsStore'
import { usePhysicsStore } from '../physics/physicsStore'
import type { JointEntity } from '../../state/sceneStore'
import { useSceneStore } from '../../state/sceneStore'

const INDICATOR_COLOR = '#38bdf8'
const TORUS_NORMAL = new Vector3(0, 0, 1) // drei/three's default torus lies in the XY plane
const CYLINDER_AXIS = new Vector3(0, 1, 0) // a cylinder's default length runs along Y

/** R3F's own no-op-raycast idiom — §14: indicators are never selectable, never intercept a click meant for whatever is beneath them. */
function neverRaycast(): void {}

function toVec3(v: { x: number; y: number; z: number }): [number, number, number] {
  return [v.x, v.y, v.z]
}

function toQuat(q: { x: number; y: number; z: number; w: number }): [number, number, number, number] {
  return [q.x, q.y, q.z, q.w]
}

/**
 * Recomputes a joint's current world-space anchor/axis from the two
 * connected bodies' *live* transforms (M4.4's own Context: D23 only
 * freezes the *stored* `anchor`, never the rendered position — a
 * mechanism that has visibly moved must not leave its indicator behind).
 * The anchor is the midpoint of both bodies' local-anchor points
 * transformed through their own current pose — if only one body has
 * moved (e.g. a gizmo drag while `idle`, before physics re-enforces the
 * constraint), the indicator shifts partway toward it rather than
 * staying frozen or jumping to a stale position. The axis is derived
 * from Object A's side only (Rapier itself has no single unambiguous
 * "the" world axis once A/B disagree) — an accepted simplification,
 * exact whenever the constraint is actually satisfied (always true once
 * `playing`).
 */
function jointWorldTransform(joint: JointEntity, handle: PhysicsJointHandle): { anchor: Vector3; axis: Vector3 } | null {
  const bodyA = usePhysicsStore.getState().bodies.get(joint.objectA)?.rigidBody
  const bodyB = usePhysicsStore.getState().bodies.get(joint.objectB)?.rigidBody
  if (!bodyA || !bodyB) return null

  const worldAnchorA = localPointToWorld(toVec3(handle.localAnchor1), toVec3(bodyA.translation()), toQuat(bodyA.rotation()))
  const worldAnchorB = localPointToWorld(toVec3(handle.localAnchor2), toVec3(bodyB.translation()), toQuat(bodyB.rotation()))
  const anchor = new Vector3(
    (worldAnchorA[0] + worldAnchorB[0]) / 2,
    (worldAnchorA[1] + worldAnchorB[1]) / 2,
    (worldAnchorA[2] + worldAnchorB[2]) / 2,
  )

  const localAxisA = worldVectorToLocal(joint.axis, handle.creationRotationA)
  const worldAxis = localVectorToWorld(localAxisA, toQuat(bodyA.rotation()))
  const axis = new Vector3(...worldAxis).normalize()

  return { anchor, axis }
}

function RevoluteIndicator({ jointId }: { jointId: string }) {
  const groupRef = useRef<Group>(null)

  useFrame(() => {
    const group = groupRef.current
    if (!group) return

    const joint = useSceneStore.getState().joints.find((j) => j.id === jointId)
    const handle = usePhysicsStore.getState().joints.get(jointId)
    const transform = joint && handle ? jointWorldTransform(joint, handle) : null
    if (!transform) {
      group.visible = false
      return
    }

    group.visible = true
    group.position.copy(transform.anchor)
    group.quaternion.setFromUnitVectors(TORUS_NORMAL, transform.axis)
  })

  return (
    <group ref={groupRef} visible={false}>
      <mesh raycast={neverRaycast}>
        <torusGeometry args={[0.2, 0.015, 8, 32]} />
        <meshBasicMaterial color={INDICATOR_COLOR} />
      </mesh>
    </group>
  )
}

function PrismaticIndicator({ jointId }: { jointId: string }) {
  const groupRef = useRef<Group>(null)

  useFrame(() => {
    const group = groupRef.current
    if (!group) return

    const joint = useSceneStore.getState().joints.find((j) => j.id === jointId)
    const handle = usePhysicsStore.getState().joints.get(jointId)
    const transform = joint && handle ? jointWorldTransform(joint, handle) : null
    if (!transform) {
      group.visible = false
      return
    }

    group.visible = true
    group.position.copy(transform.anchor)
    group.quaternion.setFromUnitVectors(CYLINDER_AXIS, transform.axis)
  })

  return (
    <group ref={groupRef} visible={false}>
      <mesh raycast={neverRaycast}>
        <cylinderGeometry args={[0.015, 0.015, 0.4, 8]} />
        <meshBasicMaterial color={INDICATOR_COLOR} />
      </mesh>
    </group>
  )
}

/**
 * §14: a Revolute joint shows a ring/axis indicator at its anchor; a
 * Prismatic joint shows a short segment along its axis; a Fixed joint
 * shows nothing (no configurable axis exists for one, §14). Pure
 * rendering derived from `sceneStore.joints` + `physicsStore.joints`
 * (M4.1's already-frozen local anchor geometry) — introduces no new
 * store state and is never itself serialized (D22).
 */
export function JointIndicators() {
  const joints = useSceneStore((s) => s.joints)
  return (
    <>
      {joints.map((joint) => {
        if (joint.type === 'revolute') return <RevoluteIndicator key={joint.id} jointId={joint.id} />
        if (joint.type === 'prismatic') return <PrismaticIndicator key={joint.id} jointId={joint.id} />
        return null
      })}
    </>
  )
}
