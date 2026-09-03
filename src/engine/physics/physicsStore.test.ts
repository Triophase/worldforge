import RAPIER from '@dimforge/rapier3d-compat'
import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSceneStore } from '../../state/sceneStore'
import { useUploadedAssetsStore } from '../../state/uploadedAssetsStore'
import {
  addJoint,
  applyJointProps,
  applyPhysicsProps,
  applyTransform,
  initPhysics,
  loadScene,
  removeJoint,
  restoreBodies,
  snapshotBodies,
  startPhysicsSync,
  usePhysicsStore,
} from './physicsStore'

const CUBE = { kind: 'builtin' as const, key: 'primitive:cube' }
const SPHERE = { kind: 'builtin' as const, key: 'primitive:sphere' }
const CYLINDER = { kind: 'builtin' as const, key: 'primitive:cylinder' }
const RAMP = { kind: 'builtin' as const, key: 'mechanical:ramp' }

/** A minimal, real parsed-upload record (D28's collider generation reads its `object`/`boundingBox`). */
function seedUpload(id = 'upload-1') {
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
  const record = {
    id,
    filename: 'Widget.glb',
    format: 'glb' as const,
    fileSize: 1024,
    object: mesh,
    boundingBox: { width: 1, height: 1, depth: 1 },
    meshCount: 1,
    unitScale: 1,
    file: new File([], 'Widget.glb'),
    serverAssetId: null,
  }
  useUploadedAssetsStore.setState((s) => ({ uploads: [...s.uploads, record] }))
  return record
}

describe('physicsStore (M3.1)', () => {
  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [], isDirty: false })
    useUploadedAssetsStore.setState({ uploads: [], lastUploadError: null, lastUploadErrorReason: null })
    loadScene([])
    // M6.10: a missing upload record now also fires a background
    // GET /assets/:id resolve attempt — stubbed to reject so no test
    // here makes a real network call.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('adding an object to the scene store results in exactly one Rapier rigid body for its id', () => {
    const stop = startPhysicsSync()
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube')

    expect(usePhysicsStore.getState().bodies.has(obj.id)).toBe(true)
    expect(usePhysicsStore.getState().bodies.size).toBe(1)
    stop()
  })

  it("a new object's body type is Fixed (Rapier's static) when physics.bodyType is 'static' (D29 default)", () => {
    const stop = startPhysicsSync()
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube')

    const body = usePhysicsStore.getState().bodies.get(obj.id)!.rigidBody
    expect(body.bodyType()).toBe(RAPIER.RigidBodyType.Fixed)
    stop()
  })

  it("a hand-authored object with physics.bodyType 'dynamic' before world construction gets a Rapier Dynamic body", () => {
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
    useSceneStore.setState({
      objects: useSceneStore.getState().objects.map((o) =>
        o.id === obj.id ? { ...o, physics: { ...o.physics, bodyType: 'dynamic' as const } } : o,
      ),
    })

    loadScene(useSceneStore.getState().objects)

    const body = usePhysicsStore.getState().bodies.get(obj.id)!.rigidBody
    expect(body.bodyType()).toBe(RAPIER.RigidBodyType.Dynamic)
  })

  it('a dynamic body with gravity true falls; gravity false stays at zero velocity, after 10 manual steps', () => {
    // Distinct positions — overlapping colliders would otherwise impart
    // their own contact-resolution velocity, confounding the assertion.
    const withGravity = useSceneStore.getState().addObject(CUBE, 'Falls', { position: [0, 10, 0] })
    const withoutGravity = useSceneStore.getState().addObject(CUBE, 'Floats', { position: [10, 10, 0] })
    useSceneStore.setState({
      objects: useSceneStore.getState().objects.map((o) => ({
        ...o,
        physics: { ...o.physics, bodyType: 'dynamic' as const, gravity: o.id === withGravity.id },
      })),
    })
    loadScene(useSceneStore.getState().objects)

    const world = usePhysicsStore.getState().world!
    for (let i = 0; i < 10; i++) world.step()

    const fallingVel = usePhysicsStore.getState().bodies.get(withGravity.id)!.rigidBody.linvel()
    const floatingVel = usePhysicsStore.getState().bodies.get(withoutGravity.id)!.rigidBody.linvel()

    expect(fallingVel.y).toBeLessThan(0)
    expect(floatingVel.y).toBe(0)
  })

  it("removing an object from the scene store removes its rigid body; the world's body count decreases by one", () => {
    const stop = startPhysicsSync()
    const a = useSceneStore.getState().addObject(CUBE, 'A')
    useSceneStore.getState().addObject(CUBE, 'B')
    expect(usePhysicsStore.getState().world!.bodies.len()).toBe(2)

    useSceneStore.getState().removeObject(a.id)

    expect(usePhysicsStore.getState().bodies.has(a.id)).toBe(false)
    expect(usePhysicsStore.getState().world!.bodies.len()).toBe(1)
    stop()
  })

  it('duplicating an object creates an independent new body, not a shared reference', () => {
    const stop = startPhysicsSync()
    const original = useSceneStore.getState().addObject(CUBE, 'Cube')
    const duplicate = useSceneStore.getState().duplicateObject(original.id)!

    const originalHandle = usePhysicsStore.getState().bodies.get(original.id)!
    const duplicateHandle = usePhysicsStore.getState().bodies.get(duplicate.id)!
    expect(duplicateHandle.rigidBody).not.toBe(originalHandle.rigidBody)

    useSceneStore.getState().removeObject(original.id)

    expect(usePhysicsStore.getState().bodies.has(original.id)).toBe(false)
    expect(usePhysicsStore.getState().bodies.has(duplicate.id)).toBe(true)
    stop()
  })

  it('loading a second scene disposes the first scene world and constructs a fresh one with only the new objects', () => {
    const a = useSceneStore.getState().addObject(CUBE, 'A')
    loadScene(useSceneStore.getState().objects)
    expect(usePhysicsStore.getState().bodies.has(a.id)).toBe(true)

    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [] })
    const b = useSceneStore.getState().addObject(SPHERE, 'B')

    loadScene(useSceneStore.getState().objects)

    expect(usePhysicsStore.getState().bodies.has(a.id)).toBe(false)
    expect(usePhysicsStore.getState().bodies.has(b.id)).toBe(true)
    expect(usePhysicsStore.getState().world!.bodies.len()).toBe(1)
  })

  it('each built-in shape gets its exact collider type — a cube gets a cuboid, a sphere gets a ball', () => {
    const cube = useSceneStore.getState().addObject(CUBE, 'Cube')
    const sphere = useSceneStore.getState().addObject(SPHERE, 'Sphere')
    const cylinder = useSceneStore.getState().addObject(CYLINDER, 'Cylinder')
    loadScene(useSceneStore.getState().objects)

    const bodies = usePhysicsStore.getState().bodies
    expect(bodies.get(cube.id)!.collider.shape.type).toBe(RAPIER.ShapeType.Cuboid)
    expect(bodies.get(sphere.id)!.collider.shape.type).toBe(RAPIER.ShapeType.Ball)
    expect(bodies.get(cylinder.id)!.collider.shape.type).toBe(RAPIER.ShapeType.Cylinder)
  })

  it('does not crash creating a body for every built-in shape', () => {
    for (const asset of [CUBE, SPHERE, CYLINDER, RAMP]) {
      useSceneStore.getState().addObject(asset, 'Object')
    }
    expect(() => loadScene(useSceneStore.getState().objects)).not.toThrow()
    expect(usePhysicsStore.getState().bodies.size).toBe(4)
  })

  it("initPhysics builds the world from whatever is already in sceneStore (e.g. a restored draft)", async () => {
    useSceneStore.getState().addObject(CUBE, 'Restored')
    await initPhysics()

    expect(usePhysicsStore.getState().bodies.size).toBe(1)
  })

  describe('applyPhysicsProps (M3.2)', () => {
    it("changes an existing body's type in place (e.g. Static to Dynamic)", () => {
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      loadScene(useSceneStore.getState().objects)

      const body = usePhysicsStore.getState().bodies.get(obj.id)!.rigidBody
      expect(body.bodyType()).toBe(RAPIER.RigidBodyType.Fixed)

      applyPhysicsProps(obj.id, { ...obj.physics, bodyType: 'dynamic' })

      expect(body.bodyType()).toBe(RAPIER.RigidBodyType.Dynamic)
    })

    it('updates mass, friction, and restitution on the existing collider', () => {
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      loadScene(useSceneStore.getState().objects)

      applyPhysicsProps(obj.id, { ...obj.physics, mass: 5, friction: 0.9, restitution: 0.7 })

      const collider = usePhysicsStore.getState().bodies.get(obj.id)!.collider
      expect(collider.mass()).toBeCloseTo(5)
      expect(collider.friction()).toBeCloseTo(0.9)
      expect(collider.restitution()).toBeCloseTo(0.7)
    })

    it('toggling gravity off on an existing dynamic body stops it from falling under manual steps', () => {
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube', { position: [0, 10, 0] })
      useSceneStore.setState({
        objects: useSceneStore.getState().objects.map((o) => ({
          ...o,
          physics: { ...o.physics, bodyType: 'dynamic' as const },
        })),
      })
      loadScene(useSceneStore.getState().objects)

      applyPhysicsProps(obj.id, { ...useSceneStore.getState().objects[0].physics, gravity: false })

      const world = usePhysicsStore.getState().world!
      for (let i = 0; i < 10; i++) world.step()

      const vel = usePhysicsStore.getState().bodies.get(obj.id)!.rigidBody.linvel()
      expect(vel.y).toBe(0)
    })

    it('is a no-op for an id with no live body', () => {
      expect(() =>
        applyPhysicsProps('missing-id', {
          bodyType: 'dynamic',
          mass: 1,
          friction: 0.5,
          restitution: 0.2,
          gravity: true,
        }),
      ).not.toThrow()
    })
  })

  describe('applyTransform (M3.3)', () => {
    it("writes an idle transform edit straight into the body's translation/rotation", () => {
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      loadScene(useSceneStore.getState().objects)

      const edited = { ...obj, transform: { ...obj.transform, position: [3, 4, 5] as [number, number, number] } }
      applyTransform(edited)

      const translation = usePhysicsStore.getState().bodies.get(obj.id)!.rigidBody.translation()
      expect(translation).toEqual({ x: 3, y: 4, z: 5 })
    })

    it("applies the composed (defaultRotation-tilted) quaternion for a tilted asset, matching the mesh", () => {
      const obj = useSceneStore.getState().addObject(RAMP, 'Ramp')
      loadScene(useSceneStore.getState().objects)

      applyTransform(obj)

      const rotation = usePhysicsStore.getState().bodies.get(obj.id)!.rigidBody.rotation()
      expect(rotation.w).not.toBeCloseTo(1) // identity would be (0,0,0,1) — Ramp's tilt must be present
    })

    it('is a no-op for an object with no live body', () => {
      const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
      expect(() => applyTransform(obj)).not.toThrow()
    })
  })

  describe('snapshotBodies / restoreBodies (D3, M3.4)', () => {
    it('captures every live body’s position, rotation, linear, and angular velocity', () => {
      const a = useSceneStore.getState().addObject(CUBE, 'A', { position: [1, 2, 3] })
      useSceneStore.setState({
        objects: useSceneStore.getState().objects.map((o) => ({ ...o, physics: { ...o.physics, bodyType: 'dynamic' as const } })),
      })
      loadScene(useSceneStore.getState().objects)
      usePhysicsStore.getState().bodies.get(a.id)!.rigidBody.setLinvel({ x: 1, y: 0, z: 0 }, true)

      const snapshot = snapshotBodies()

      expect(snapshot[a.id].position).toEqual([1, 2, 3])
      expect(snapshot[a.id].linvel).toEqual([1, 0, 0])
      expect(snapshot[a.id].angvel).toEqual([0, 0, 0])
    })

    it('restores every live body to a prior snapshot exactly', () => {
      const a = useSceneStore.getState().addObject(CUBE, 'A', { position: [0, 10, 0] })
      useSceneStore.setState({
        objects: useSceneStore.getState().objects.map((o) => ({ ...o, physics: { ...o.physics, bodyType: 'dynamic' as const } })),
      })
      loadScene(useSceneStore.getState().objects)

      const snapshot = snapshotBodies()
      const world = usePhysicsStore.getState().world!
      for (let i = 0; i < 30; i++) world.step()

      const fallen = usePhysicsStore.getState().bodies.get(a.id)!.rigidBody.translation()
      expect(fallen.y).toBeLessThan(10)

      restoreBodies(snapshot)

      const restored = usePhysicsStore.getState().bodies.get(a.id)!.rigidBody.translation()
      expect(restored.y).toBeCloseTo(10)
      const restoredVel = usePhysicsStore.getState().bodies.get(a.id)!.rigidBody.linvel()
      expect(restoredVel.y).toBeCloseTo(0)
    })

    it('restoreBodies ignores an id with no live body rather than throwing', () => {
      expect(() =>
        restoreBodies({ 'missing-id': { position: [0, 0, 0], rotation: [0, 0, 0, 1], linvel: [0, 0, 0], angvel: [0, 0, 0] } }),
      ).not.toThrow()
    })
  })

  describe('joints (M4.1, §14)', () => {
    it('creating a fixed joint results in exactly one live Rapier joint bridging the two bodies', () => {
      const stop = startPhysicsSync()
      const a = useSceneStore.getState().addObject(CUBE, 'A', { position: [0, 0, 0] })
      const b = useSceneStore.getState().addObject(CUBE, 'B', { position: [2, 0, 0] })

      useSceneStore.getState().createJoint(a.id, b.id, 'fixed')

      expect(usePhysicsStore.getState().joints.size).toBe(1)
      expect(usePhysicsStore.getState().world!.impulseJoints.len()).toBe(1)
      stop()
    })

    it('a fixed joint anchored to a static body holds the dynamic body in place against gravity', () => {
      const stop = startPhysicsSync()
      const a = useSceneStore.getState().addObject(CUBE, 'A', { position: [0, 5, 0] }) // static (D29 default) — immovable anchor
      const b = useSceneStore.getState().addObject(CUBE, 'B', { position: [2, 5, 0] })
      useSceneStore.setState({
        objects: useSceneStore
          .getState()
          .objects.map((o) => (o.id === b.id ? { ...o, physics: { ...o.physics, bodyType: 'dynamic' as const } } : o)),
      })
      loadScene(useSceneStore.getState().objects, useSceneStore.getState().joints)
      useSceneStore.getState().createJoint(a.id, b.id, 'fixed')

      const world = usePhysicsStore.getState().world!
      for (let i = 0; i < 60; i++) world.step()

      const bY = usePhysicsStore.getState().bodies.get(b.id)!.rigidBody.translation().y
      expect(bY).toBeGreaterThan(4) // held near its original height by the joint — a free-falling B would be well below this
      stop()
    })

    it('a revolute joint with an enabled motor rotates the free body over successive steps', () => {
      const stop = startPhysicsSync()
      const a = useSceneStore.getState().addObject(CUBE, 'A', { position: [0, 0, 0] }) // stays static (D29 default) — the anchor
      const b = useSceneStore.getState().addObject(CUBE, 'B', { position: [2, 0, 0] })
      useSceneStore.setState({
        objects: useSceneStore
          .getState()
          .objects.map((o) =>
            o.id === b.id ? { ...o, physics: { ...o.physics, bodyType: 'dynamic' as const, gravity: false } } : o,
          ),
      })
      loadScene(useSceneStore.getState().objects, useSceneStore.getState().joints)

      useSceneStore.getState().createJoint(a.id, b.id, 'revolute', { motor: { enabled: true, speed: 3 } })

      const world = usePhysicsStore.getState().world!
      for (let i = 0; i < 30; i++) world.step()

      const rot = usePhysicsStore.getState().bodies.get(b.id)!.rigidBody.rotation()
      expect(rot.w).not.toBeCloseTo(1) // no longer identity — B has rotated around the joint's axis
      stop()
    })

    it("updateJoint's motor change propagates live to the Rapier joint via the passive sync — even while `playing` (D2's future exception, M4.3)", () => {
      const stop = startPhysicsSync()
      const a = useSceneStore.getState().addObject(CUBE, 'A', { position: [0, 0, 0] })
      const b = useSceneStore.getState().addObject(CUBE, 'B', { position: [2, 0, 0] })
      useSceneStore.setState({
        objects: useSceneStore
          .getState()
          .objects.map((o) =>
            o.id === b.id ? { ...o, physics: { ...o.physics, bodyType: 'dynamic' as const, gravity: false } } : o,
          ),
      })
      loadScene(useSceneStore.getState().objects, useSceneStore.getState().joints)
      const joint = useSceneStore.getState().createJoint(a.id, b.id, 'revolute', { motor: { enabled: false, speed: 0 } })!

      const world = usePhysicsStore.getState().world!
      for (let i = 0; i < 10; i++) world.step()
      expect(usePhysicsStore.getState().bodies.get(b.id)!.rigidBody.rotation().w).toBeCloseTo(1) // motor off — no rotation yet

      useSceneStore.getState().updateJoint(joint.id, { motor: { enabled: true, speed: 4 } })
      for (let i = 0; i < 30; i++) world.step()

      expect(usePhysicsStore.getState().bodies.get(b.id)!.rigidBody.rotation().w).not.toBeCloseTo(1)
      stop()
    })

    it('applyJointProps rebuilds the live joint without shifting the anchor — the relative offset survives further stepping', () => {
      const stop = startPhysicsSync()
      const a = useSceneStore.getState().addObject(CUBE, 'A', { position: [0, 5, 0] })
      const b = useSceneStore.getState().addObject(CUBE, 'B', { position: [2, 5, 0] })
      useSceneStore.setState({
        objects: useSceneStore.getState().objects.map((o) => ({ ...o, physics: { ...o.physics, bodyType: 'dynamic' as const } })),
      })
      loadScene(useSceneStore.getState().objects, useSceneStore.getState().joints)
      const joint = useSceneStore.getState().createJoint(a.id, b.id, 'fixed')!

      const world = usePhysicsStore.getState().world!
      for (let i = 0; i < 15; i++) world.step()
      const before = {
        a: usePhysicsStore.getState().bodies.get(a.id)!.rigidBody.translation(),
        b: usePhysicsStore.getState().bodies.get(b.id)!.rigidBody.translation(),
      }
      const offsetBefore = before.b.x - before.a.x

      applyJointProps(joint.id, joint) // no field actually changed — a pure rebuild
      for (let i = 0; i < 15; i++) world.step()

      const after = {
        a: usePhysicsStore.getState().bodies.get(a.id)!.rigidBody.translation(),
        b: usePhysicsStore.getState().bodies.get(b.id)!.rigidBody.translation(),
      }
      expect(after.b.x - after.a.x).toBeCloseTo(offsetBefore, 1)
      stop()
    })

    it('deleting a joint entity removes the Rapier joint; both bodies remain, now unconstrained', () => {
      const stop = startPhysicsSync()
      const a = useSceneStore.getState().addObject(CUBE, 'A')
      const b = useSceneStore.getState().addObject(CUBE, 'B', { position: [2, 0, 0] })
      const joint = useSceneStore.getState().createJoint(a.id, b.id, 'fixed')!
      expect(usePhysicsStore.getState().world!.impulseJoints.len()).toBe(1)

      useSceneStore.getState().deleteJoint(joint.id)

      expect(usePhysicsStore.getState().world!.impulseJoints.len()).toBe(0)
      expect(usePhysicsStore.getState().world!.bodies.len()).toBe(2)
      stop()
    })

    it('loadScene builds joints alongside bodies from an explicit list', () => {
      const a = useSceneStore.getState().addObject(CUBE, 'A')
      const b = useSceneStore.getState().addObject(CUBE, 'B', { position: [2, 0, 0] })
      const joint = useSceneStore.getState().createJoint(a.id, b.id, 'fixed')!

      loadScene(useSceneStore.getState().objects, useSceneStore.getState().joints)

      expect(usePhysicsStore.getState().joints.has(joint.id)).toBe(true)
      expect(usePhysicsStore.getState().world!.impulseJoints.len()).toBe(1)
    })

    it('addJoint is a no-op if either endpoint has no live body yet', () => {
      const a = useSceneStore.getState().addObject(CUBE, 'A')
      const b = useSceneStore.getState().addObject(CUBE, 'B')
      loadScene([]) // world exists, but neither body was ever created in it
      const joint = useSceneStore.getState().createJoint(a.id, b.id, 'fixed')!

      expect(() => addJoint(joint)).not.toThrow()
      expect(usePhysicsStore.getState().joints.size).toBe(0)
    })

    it('removeJoint is a no-op for an id with no live joint', () => {
      expect(() => removeJoint('missing-id')).not.toThrow()
    })
  })

  describe('uploaded-mesh collider generation (D28, M5.5)', () => {
    it('a static (D29 default) uploaded object gets a TriMesh collider', () => {
      const upload = seedUpload()
      const obj = useSceneStore.getState().addObject({ kind: 'uploaded', key: upload.id }, 'Widget')
      loadScene(useSceneStore.getState().objects)

      const collider = usePhysicsStore.getState().bodies.get(obj.id)!.collider
      expect(collider.shape.type).toBe(RAPIER.ShapeType.TriMesh)
    })

    it('a dynamic uploaded object gets a ConvexPolyhedron (convex hull) collider', () => {
      const upload = seedUpload()
      const obj = useSceneStore.getState().addObject({ kind: 'uploaded', key: upload.id }, 'Widget')
      useSceneStore.setState({
        objects: useSceneStore.getState().objects.map((o) => ({ ...o, physics: { ...o.physics, bodyType: 'dynamic' as const } })),
      })
      loadScene(useSceneStore.getState().objects)

      const collider = usePhysicsStore.getState().bodies.get(obj.id)!.collider
      expect(collider.shape.type).toBe(RAPIER.ShapeType.ConvexPolyhedron)
    })

    it('a kinematic uploaded object also gets a convex hull, same as dynamic', () => {
      const upload = seedUpload()
      const obj = useSceneStore.getState().addObject({ kind: 'uploaded', key: upload.id }, 'Widget')
      useSceneStore.setState({
        objects: useSceneStore.getState().objects.map((o) => ({ ...o, physics: { ...o.physics, bodyType: 'kinematic' as const } })),
      })
      loadScene(useSceneStore.getState().objects)

      const collider = usePhysicsStore.getState().bodies.get(obj.id)!.collider
      expect(collider.shape.type).toBe(RAPIER.ShapeType.ConvexPolyhedron)
    })

    it("switching Body Type from static to dynamic replaces the collider with a convex hull", () => {
      const upload = seedUpload()
      const obj = useSceneStore.getState().addObject({ kind: 'uploaded', key: upload.id }, 'Widget')
      loadScene(useSceneStore.getState().objects)
      expect(usePhysicsStore.getState().bodies.get(obj.id)!.collider.shape.type).toBe(RAPIER.ShapeType.TriMesh)

      applyPhysicsProps(obj.id, { ...obj.physics, bodyType: 'dynamic' })

      expect(usePhysicsStore.getState().bodies.get(obj.id)!.collider.shape.type).toBe(RAPIER.ShapeType.ConvexPolyhedron)
    })

    it('switching Body Type from dynamic back to static replaces the collider with a trimesh', () => {
      const upload = seedUpload()
      const obj = useSceneStore.getState().addObject({ kind: 'uploaded', key: upload.id }, 'Widget')
      useSceneStore.setState({
        objects: useSceneStore.getState().objects.map((o) => ({ ...o, physics: { ...o.physics, bodyType: 'dynamic' as const } })),
      })
      loadScene(useSceneStore.getState().objects)
      expect(usePhysicsStore.getState().bodies.get(obj.id)!.collider.shape.type).toBe(RAPIER.ShapeType.ConvexPolyhedron)

      applyPhysicsProps(obj.id, { ...useSceneStore.getState().objects[0].physics, bodyType: 'static' })

      expect(usePhysicsStore.getState().bodies.get(obj.id)!.collider.shape.type).toBe(RAPIER.ShapeType.TriMesh)
    })

    it('a built-in shape is unaffected — still gets its exact hand-authored collider regardless of body type', () => {
      const cube = useSceneStore.getState().addObject(CUBE, 'Cube')
      loadScene(useSceneStore.getState().objects)
      expect(usePhysicsStore.getState().bodies.get(cube.id)!.collider.shape.type).toBe(RAPIER.ShapeType.Cuboid)

      applyPhysicsProps(cube.id, { ...cube.physics, bodyType: 'dynamic' })

      expect(usePhysicsStore.getState().bodies.get(cube.id)!.collider.shape.type).toBe(RAPIER.ShapeType.Cuboid)
    })

    it('no up-axis correction is applied — an uploaded object keeps its native (e.g. sideways) rotation exactly (D27)', () => {
      const upload = seedUpload()
      const sidewaysRotation: [number, number, number, number] = [0, 0, 0.7071068, 0.7071068] // 90° about Z
      const obj = useSceneStore
        .getState()
        .addObject({ kind: 'uploaded', key: upload.id }, 'Widget', { rotation: sidewaysRotation })
      loadScene(useSceneStore.getState().objects)

      const bodyRotation = usePhysicsStore.getState().bodies.get(obj.id)!.rigidBody.rotation()
      expect(bodyRotation.x).toBeCloseTo(sidewaysRotation[0])
      expect(bodyRotation.y).toBeCloseTo(sidewaysRotation[1])
      expect(bodyRotation.z).toBeCloseTo(sidewaysRotation[2])
      expect(bodyRotation.w).toBeCloseTo(sidewaysRotation[3])
    })

    it('an uploaded object with no matching upload record falls back to a cuboid rather than crashing', () => {
      const obj = useSceneStore.getState().addObject({ kind: 'uploaded', key: 'nonexistent-id' }, 'Ghost')
      expect(() => loadScene(useSceneStore.getState().objects)).not.toThrow()
      expect(usePhysicsStore.getState().bodies.get(obj.id)!.collider.shape.type).toBe(RAPIER.ShapeType.Cuboid)
    })
  })
})
