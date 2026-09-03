import RAPIER from '@dimforge/rapier3d-compat'
import { create } from 'zustand'
import { getBuiltinAsset } from '../../assets'
import type { JointEntity, SceneObject } from '../../state/sceneStore'
import { useSceneStore } from '../../state/sceneStore'
import { useUploadedAssetsStore } from '../../state/uploadedAssetsStore'
import { composeMeshQuaternion } from '../../utils/assetRotation'
import { ensureRemoteAssetResolved } from '../../loaders/AssetLoader/resolveRemoteAsset'
import { collectGeometryData } from './collectGeometryData'
import { relativeRotation, worldPointToLocal, worldVectorToLocal } from './jointMath'

/** §13: Earth-like gravity, Y-up (matching this project's ground-plane convention). */
const GRAVITY = { x: 0, y: -9.81, z: 0 }

/** Shared by body creation and `applyPhysicsProps`'s live Body Type change (M3.2). */
function rapierBodyType(bodyType: SceneObject['physics']['bodyType']): RAPIER.RigidBodyType {
  switch (bodyType) {
    case 'dynamic':
      return RAPIER.RigidBodyType.Dynamic
    case 'kinematic':
      return RAPIER.RigidBodyType.KinematicPositionBased
    case 'static':
    default:
      return RAPIER.RigidBodyType.Fixed
  }
}

function rigidBodyDescFor(bodyType: SceneObject['physics']['bodyType']): RAPIER.RigidBodyDesc {
  return new RAPIER.RigidBodyDesc(rapierBodyType(bodyType))
}

/**
 * D28: every built-in gets its exact hand-authored collider shape, never a
 * convex-hull/bounding-box fallback — `collider` here is M2.2's registry
 * descriptor. Dimensions are scaled by the object's own `transform.scale`
 * so the collider matches what's actually rendered; `sphere`/`capsule`/
 * `cylinder`/`cone` colliders are inherently single-radius shapes in
 * Rapier, so a non-uniform X/Z scale on those (an edge case no built-in
 * asset currently produces) only applies the X scale to the radius.
 */
function colliderDescForBuiltin(object: SceneObject): RAPIER.ColliderDesc {
  const definition = getBuiltinAsset(object.assetRef.key)!
  const { collider } = definition
  const [sx, sy, sz] = object.transform.scale

  let desc: RAPIER.ColliderDesc
  switch (collider.shape) {
    case 'box':
      desc = RAPIER.ColliderDesc.cuboid(
        collider.halfExtents[0] * sx,
        collider.halfExtents[1] * sy,
        collider.halfExtents[2] * sz,
      )
      break
    case 'sphere':
      desc = RAPIER.ColliderDesc.ball(collider.radius * sx)
      break
    case 'cylinder':
      desc = RAPIER.ColliderDesc.cylinder(collider.halfHeight * sy, collider.radius * sx)
      break
    case 'cone':
      desc = RAPIER.ColliderDesc.cone(collider.halfHeight * sy, collider.radius * sx)
      break
    case 'capsule':
      desc = RAPIER.ColliderDesc.capsule(collider.halfHeight * sy, collider.radius * sx)
      break
  }

  return desc
}

/**
 * D28: an uploaded mesh gets a **convex hull** (dynamic or kinematic —
 * kinematic is treated as dynamic for collider purposes, since it can
 * still move) or a **full triangle mesh** (static) built directly from
 * `M5.2`'s already-parsed geometry (`collectGeometryData`, never a
 * re-parse). `RAPIER.ColliderDesc.convexHull()` can return `null` for
 * degenerate/near-coplanar geometry — falls back to a bounding-box
 * cuboid (from the upload's own already-computed `boundingBox`, §12's
 * metadata) rather than leaving the object with no collider at all.
 * §11's built-in colliders are entirely untouched by this function.
 */
function colliderDescForUploaded(object: SceneObject): RAPIER.ColliderDesc {
  const record = useUploadedAssetsStore.getState().uploads.find((u) => u.id === object.assetRef.key)
  const [sx, sy, sz] = object.transform.scale

  if (!record) {
    // `M6.10`: a persisted asset this session never itself parsed (a
    // different device, or a reload) has no local record yet either —
    // kick off the same background resolve `UploadedObjectMesh` uses, so
    // a *later* rebuild of this body (e.g. a Body Type change) can pick
    // up the real geometry. This specific body creation still degrades
    // to a placeholder cuboid — physics bodies are built synchronously,
    // the fetch+parse is not.
    ensureRemoteAssetResolved(object.assetRef.key)
    return RAPIER.ColliderDesc.cuboid(0.5 * sx, 0.5 * sy, 0.5 * sz)
  }

  const { vertices, indices } = collectGeometryData(record.object, object.transform.scale)
  const isConvex = object.physics.bodyType === 'dynamic' || object.physics.bodyType === 'kinematic'

  const desc = isConvex ? RAPIER.ColliderDesc.convexHull(vertices) : RAPIER.ColliderDesc.trimesh(vertices, indices)
  if (desc) return desc

  const { width, height, depth } = record.boundingBox
  return RAPIER.ColliderDesc.cuboid((width * sx) / 2, (height * sy) / 2, (depth * sz) / 2)
}

function colliderDescFor(object: SceneObject): RAPIER.ColliderDesc {
  const desc =
    object.assetRef.kind === 'uploaded' ? colliderDescForUploaded(object) : colliderDescForBuiltin(object)
  return desc.setFriction(object.physics.friction).setRestitution(object.physics.restitution).setMass(object.physics.mass)
}

export interface PhysicsBodyHandle {
  rigidBody: RAPIER.RigidBody
  collider: RAPIER.Collider
}

/**
 * M4.1: `localAnchor1`/`localAnchor2` and `creationRotationA`/
 * `creationRotationB` are frozen at the moment the joint is created (D23:
 * the anchor never moves after creation) and reused by `applyJointProps`
 * whenever axis/limits/motor change — recomputing from the bodies'
 * *current* (possibly-simulated) pose instead would silently shift the
 * joint's physical attachment point on every edit.
 */
export interface PhysicsJointHandle {
  joint: RAPIER.ImpulseJoint
  localAnchor1: RAPIER.Vector
  localAnchor2: RAPIER.Vector
  creationRotationA: [number, number, number, number]
  creationRotationB: [number, number, number, number]
}

interface PhysicsState {
  world: RAPIER.World | null
  bodies: Map<string, PhysicsBodyHandle>
  joints: Map<string, PhysicsJointHandle>
}

export const usePhysicsStore = create<PhysicsState>(() => ({
  world: null,
  bodies: new Map(),
  joints: new Map(),
}))

let rapierReady = false

/**
 * One-time WASM init (idempotent — safe to call more than once) followed
 * by building the world from whatever is in `sceneStore` right now. Call
 * once at app startup, after any draft restore (`draftStore`) has already
 * run, so the initial world reflects the restored scene, not an empty one.
 */
export async function initPhysics(): Promise<void> {
  if (!rapierReady) {
    await RAPIER.init()
    rapierReady = true
  }
  const scene = useSceneStore.getState()
  loadScene(scene.objects, scene.joints)
}

/** No registry `defaultRotation` exists for an upload — identity, composed with nothing (M2.2's tilt composition is a built-in-only concept). */
const NO_TILT: [number, number, number, number] = [0, 0, 0, 1]

/**
 * The object's position/rotation as Rapier wants them — rotation composed
 * with the asset's `defaultRotation` exactly as `SceneObjects.tsx` composes
 * it for the mesh (M2.2's Ramp tilt), via the one shared `assetRotation.ts`
 * function, so a body's orientation can never visually/physically diverge.
 * An uploaded object has no registry entry (and D27 explicitly never
 * applies an up-axis correction) — its own `transform.rotation` is used
 * as-is, composed with an identity "tilt".
 */
function rapierTransformFor(object: SceneObject): { translation: RAPIER.Vector; rotation: RAPIER.Rotation } {
  const defaultRotation =
    object.assetRef.kind === 'uploaded' ? NO_TILT : getBuiltinAsset(object.assetRef.key)?.defaultRotation
  if (!defaultRotation) throw new Error(`Unknown built-in asset: ${object.assetRef.key}`)

  const [x, y, z] = object.transform.position
  const [qx, qy, qz, qw] = composeMeshQuaternion(object.transform.rotation, defaultRotation)
  return { translation: { x, y, z }, rotation: { x: qx, y: qy, z: qz, w: qw } }
}

function createBody(world: RAPIER.World, object: SceneObject): PhysicsBodyHandle {
  const { translation, rotation } = rapierTransformFor(object)

  const rigidBodyDesc = rigidBodyDescFor(object.physics.bodyType).setTranslation(
    translation.x,
    translation.y,
    translation.z,
  ).setRotation(rotation)
  const rigidBody = world.createRigidBody(rigidBodyDesc)
  rigidBody.setGravityScale(object.physics.gravity ? 1.0 : 0.0, true)

  const collider = world.createCollider(colliderDescFor(object), rigidBody)
  return { rigidBody, collider }
}

const IDENTITY_ROTATION: RAPIER.Rotation = { x: 0, y: 0, z: 0, w: 1 }

/**
 * D22/§14: builds the Rapier `JointData` descriptor for a joint entity,
 * given its (already-frozen) local geometry. A fixed joint's `frame2` is
 * computed from `creationRotationA`/`creationRotationB` so the two bodies
 * lock at exactly the relative pose they had at creation, with no extra
 * twist. Revolute uses `revoluteWithAxes` (independent per-body local
 * axes) since the two bodies may not share an orientation at creation;
 * prismatic has no such variant in Rapier's API, so its single `axis`
 * param is expressed in body A's local frame only — an accepted
 * simplification (exact when both bodies share an orientation at
 * creation, the common case for this app's demo scenes), not a bug to
 * chase, since Rapier itself offers no per-body-axis prismatic
 * constructor.
 */
function buildJointData(
  entity: JointEntity,
  geometry: Pick<PhysicsJointHandle, 'localAnchor1' | 'localAnchor2' | 'creationRotationA' | 'creationRotationB'>,
): RAPIER.JointData {
  const { localAnchor1, localAnchor2, creationRotationA, creationRotationB } = geometry

  let data: RAPIER.JointData
  switch (entity.type) {
    case 'fixed': {
      const [x, y, z, w] = relativeRotation(creationRotationA, creationRotationB)
      data = RAPIER.JointData.fixed(localAnchor1, IDENTITY_ROTATION, localAnchor2, { x, y, z, w })
      break
    }
    case 'revolute': {
      const [ax1, ay1, az1] = worldVectorToLocal(entity.axis, creationRotationA)
      const [ax2, ay2, az2] = worldVectorToLocal(entity.axis, creationRotationB)
      data = RAPIER.JointData.revoluteWithAxes(
        localAnchor1,
        localAnchor2,
        { x: ax1, y: ay1, z: az1 },
        { x: ax2, y: ay2, z: az2 },
      )
      break
    }
    case 'prismatic': {
      const [ax, ay, az] = worldVectorToLocal(entity.axis, creationRotationA)
      data = RAPIER.JointData.prismatic(localAnchor1, localAnchor2, { x: ax, y: ay, z: az })
      break
    }
  }

  if (entity.limits.min !== null && entity.limits.max !== null) {
    data.limitsEnabled = true
    data.limits = [entity.limits.min, entity.limits.max]
  }
  return data
}

/** §14: a fixed joint has no motor — a no-op for that type. */
function applyMotor(joint: RAPIER.ImpulseJoint, entity: JointEntity): void {
  if (entity.type === 'fixed') return
  const unitJoint = joint as RAPIER.RevoluteImpulseJoint | RAPIER.PrismaticImpulseJoint
  unitJoint.configureMotorVelocity(entity.motor.enabled ? entity.motor.speed : 0, entity.motor.enabled ? 1 : 0)
}

function createRapierJoint(
  world: RAPIER.World,
  bodyA: RAPIER.RigidBody,
  bodyB: RAPIER.RigidBody,
  entity: JointEntity,
): PhysicsJointHandle {
  const posA = bodyA.translation()
  const rotA = bodyA.rotation()
  const posB = bodyB.translation()
  const rotB = bodyB.rotation()

  const creationRotationA: [number, number, number, number] = [rotA.x, rotA.y, rotA.z, rotA.w]
  const creationRotationB: [number, number, number, number] = [rotB.x, rotB.y, rotB.z, rotB.w]

  const [lx1, ly1, lz1] = worldPointToLocal(entity.anchor, [posA.x, posA.y, posA.z], creationRotationA)
  const [lx2, ly2, lz2] = worldPointToLocal(entity.anchor, [posB.x, posB.y, posB.z], creationRotationB)

  const geometry = {
    localAnchor1: { x: lx1, y: ly1, z: lz1 },
    localAnchor2: { x: lx2, y: ly2, z: lz2 },
    creationRotationA,
    creationRotationB,
  }

  const jointData = buildJointData(entity, geometry)
  const joint = world.createImpulseJoint(jointData, bodyA, bodyB, true)
  applyMotor(joint, entity)

  return { joint, ...geometry }
}

/**
 * §13: exactly one Rapier world per scene. Disposes the previous world
 * (and every body/collider/joint in it, via Rapier's own `World.free()`)
 * and constructs a fresh one containing only `objects`' bodies and
 * `joints`' constraints.
 */
export function loadScene(objects: SceneObject[], joints: JointEntity[] = []): void {
  usePhysicsStore.getState().world?.free()

  const world = new RAPIER.World(GRAVITY)
  const bodies = new Map<string, PhysicsBodyHandle>()
  for (const object of objects) {
    bodies.set(object.id, createBody(world, object))
  }

  const jointHandles = new Map<string, PhysicsJointHandle>()
  for (const joint of joints) {
    const bodyA = bodies.get(joint.objectA)?.rigidBody
    const bodyB = bodies.get(joint.objectB)?.rigidBody
    if (bodyA && bodyB) jointHandles.set(joint.id, createRapierJoint(world, bodyA, bodyB, joint))
  }

  usePhysicsStore.setState({ world, bodies, joints: jointHandles })
}

/** Adds a live Rapier joint for a newly-created joint entity. A no-op if either endpoint has no live body yet. */
export function addJoint(entity: JointEntity): void {
  const { world, bodies, joints } = usePhysicsStore.getState()
  if (!world) return
  const bodyA = bodies.get(entity.objectA)?.rigidBody
  const bodyB = bodies.get(entity.objectB)?.rigidBody
  if (!bodyA || !bodyB) return

  const handle = createRapierJoint(world, bodyA, bodyB, entity)
  const next = new Map(joints)
  next.set(entity.id, handle)
  usePhysicsStore.setState({ joints: next })
}

/** Removes a joint's live Rapier counterpart. Both bodies remain, now unconstrained relative to each other. */
export function removeJoint(jointId: string): void {
  const { world, joints } = usePhysicsStore.getState()
  const handle = joints.get(jointId)
  if (!world || !handle) return

  world.removeImpulseJoint(handle.joint, true)
  const next = new Map(joints)
  next.delete(jointId)
  usePhysicsStore.setState({ joints: next })
}

/**
 * M4.1: rebuilds the live Rapier joint from an updated entity's
 * axis/limits/motor. Rapier exposes no live setter for axis or for
 * toggling `limitsEnabled` after creation, so this removes and recreates
 * the joint — reusing the ORIGINAL local anchors/creation-time rotations
 * already stored on the handle (never recomputed from the bodies'
 * current pose), so an edit can never shift the joint's attachment point.
 */
export function applyJointProps(jointId: string, entity: JointEntity): void {
  const { world, joints } = usePhysicsStore.getState()
  const handle = joints.get(jointId)
  if (!world || !handle) return

  const bodyA = handle.joint.body1()
  const bodyB = handle.joint.body2()
  world.removeImpulseJoint(handle.joint, true)

  const jointData = buildJointData(entity, handle)
  const joint = world.createImpulseJoint(jointData, bodyA, bodyB, true)
  applyMotor(joint, entity)

  const next = new Map(joints)
  next.set(jointId, { ...handle, joint })
  usePhysicsStore.setState({ joints: next })
}

/**
 * M3.2: live-updates an already-existing body/collider's physics fields
 * in place — no world rebuild. Body Type uses Rapier's own
 * `setBodyType` (supported for changing type post-creation); Mass/
 * Friction/Restitution/Gravity are simple in-place setters. A no-op if
 * the object has no live body yet (nothing selected/created).
 *
 * M5.5/D28: for an **uploaded** mesh, the collider's *shape* (convex
 * hull vs. trimesh) depends on the new Body Type — Rapier has no way to
 * change an existing collider's fundamental shape in place, so this
 * removes and recreates it (reusing `colliderDescFor`'s own dispatch,
 * not a second collider-generation path) rather than just adjusting
 * mass/friction/restitution on the old one. A built-in's collider shape
 * never depends on body type, so this rebuild is skipped for those —
 * only its setters run, exactly as before.
 */
export function applyPhysicsProps(id: string, physics: SceneObject['physics']): void {
  const state = usePhysicsStore.getState()
  const handle = state.bodies.get(id)
  if (!handle || !state.world) return

  handle.rigidBody.setBodyType(rapierBodyType(physics.bodyType), true)
  handle.rigidBody.setGravityScale(physics.gravity ? 1.0 : 0.0, true)

  const object = useSceneStore.getState().objects.find((o) => o.id === id)
  if (object?.assetRef.kind === 'uploaded') {
    state.world.removeCollider(handle.collider, true)
    const collider = state.world.createCollider(colliderDescFor({ ...object, physics }), handle.rigidBody)
    usePhysicsStore.setState({ bodies: new Map(state.bodies).set(id, { rigidBody: handle.rigidBody, collider }) })
    return
  }

  handle.collider.setMass(physics.mass)
  handle.collider.setFriction(physics.friction)
  handle.collider.setRestitution(physics.restitution)
}

/**
 * M3.3: writes an idle Transform edit (gizmo commit or a Properties-panel
 * field commit) straight into the live body — §13's "there is only ever
 * one source of ground truth per frame (the Rapier body)". Without this,
 * the next frame's render/physics sync (`SceneObjects.tsx`'s `useFrame`)
 * would immediately overwrite the edit with the body's stale pre-edit
 * translation/rotation. A no-op if the object has no live body yet.
 */
export function applyTransform(object: SceneObject): void {
  const handle = usePhysicsStore.getState().bodies.get(object.id)
  if (!handle) return

  const { translation, rotation } = rapierTransformFor(object)
  handle.rigidBody.setTranslation(translation, true)
  handle.rigidBody.setRotation(rotation, true)
}

/** D3's per-object snapshot shape: position/rotation/linear+angular velocity, keyed by object id. */
export interface BodySnapshot {
  position: [number, number, number]
  rotation: [number, number, number, number]
  linvel: [number, number, number]
  angvel: [number, number, number]
}

/**
 * D3: captures every live body's full kinematic state — the automatic
 * snapshot taken the instant Play is pressed. `M4.1` extends this same
 * shape with joint state without redesigning it (per M3.4's own scope
 * note); nothing here needs to change for that.
 */
export function snapshotBodies(): Record<string, BodySnapshot> {
  const snapshot: Record<string, BodySnapshot> = {}
  for (const [id, handle] of usePhysicsStore.getState().bodies) {
    const t = handle.rigidBody.translation()
    const r = handle.rigidBody.rotation()
    const lv = handle.rigidBody.linvel()
    const av = handle.rigidBody.angvel()
    snapshot[id] = {
      position: [t.x, t.y, t.z],
      rotation: [r.x, r.y, r.z, r.w],
      linvel: [lv.x, lv.y, lv.z],
      angvel: [av.x, av.y, av.z],
    }
  }
  return snapshot
}

/** D3: restores every live body to a previously-captured snapshot (Reset). Ignores ids with no live body. */
export function restoreBodies(snapshot: Record<string, BodySnapshot>): void {
  const bodies = usePhysicsStore.getState().bodies
  for (const [id, s] of Object.entries(snapshot)) {
    const handle = bodies.get(id)
    if (!handle) continue
    const [px, py, pz] = s.position
    const [rx, ry, rz, rw] = s.rotation
    const [lx, ly, lz] = s.linvel
    const [ax, ay, az] = s.angvel
    handle.rigidBody.setTranslation({ x: px, y: py, z: pz }, true)
    handle.rigidBody.setRotation({ x: rx, y: ry, z: rz, w: rw }, true)
    handle.rigidBody.setLinvel({ x: lx, y: ly, z: lz }, true)
    handle.rigidBody.setAngvel({ x: ax, y: ay, z: az }, true)
  }
}

/**
 * Keeps the physics world in sync with `sceneStore.objects` — the scene
 * store is the single source of truth (scene-engine skill); this is a
 * passive observer, exactly like `SceneObjects.tsx`'s render sync, never
 * the other way around. Call once, after `initPhysics()` resolves.
 */
export function startPhysicsSync(): () => void {
  return useSceneStore.subscribe((state, prevState) => {
    const world = usePhysicsStore.getState().world
    if (!world) return

    if (state.objects !== prevState.objects) {
      const bodies = new Map(usePhysicsStore.getState().bodies)
      const currentIds = new Set(state.objects.map((o) => o.id))

      for (const [id, handle] of bodies) {
        if (!currentIds.has(id)) {
          world.removeRigidBody(handle.rigidBody)
          bodies.delete(id)
        }
      }
      for (const object of state.objects) {
        if (!bodies.has(object.id)) {
          bodies.set(object.id, createBody(world, object))
        }
      }

      usePhysicsStore.setState({ bodies })
    }

    // M4.1: `updateJoint`'s axis/limits/motor edits have no other bridge
    // to physics yet (no historyStore wrapper exists until M4.3) — this
    // passive diff is the only thing that reacts to them, matching
    // `objects`' own add/remove diff above but also handling per-id
    // property changes (an existing joint's array *reference* changes on
    // any `updateJoint` call, since `sceneStore` always replaces the
    // whole array immutably).
    if (state.joints !== prevState.joints) {
      const currentIds = new Set(state.joints.map((j) => j.id))
      for (const [id] of usePhysicsStore.getState().joints) {
        if (!currentIds.has(id)) removeJoint(id)
      }
      for (const joint of state.joints) {
        const existing = usePhysicsStore.getState().joints.get(joint.id)
        if (!existing) {
          addJoint(joint)
          continue
        }
        const prevJoint = prevState.joints.find((j) => j.id === joint.id)
        if (prevJoint && prevJoint !== joint) {
          applyJointProps(joint.id, joint)
        }
      }
    }
  })
}
