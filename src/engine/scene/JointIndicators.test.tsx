import RAPIER from '@dimforge/rapier3d-compat'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadScene as loadPhysicsScene, usePhysicsStore } from '../physics/physicsStore'
import { useSceneStore } from '../../state/sceneStore'
import { JointIndicators } from './JointIndicators'

const CUBE = { kind: 'builtin' as const, key: 'primitive:cube' }

function setDynamic(id: string) {
  useSceneStore.setState({
    objects: useSceneStore
      .getState()
      .objects.map((o) => (o.id === id ? { ...o, physics: { ...o.physics, bodyType: 'dynamic' as const } } : o)),
  })
}

describe('JointIndicators (§14, M4.4)', () => {
  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [] })
  })

  it('a Revolute joint renders exactly one ring (torus) indicator', async () => {
    const a = useSceneStore.getState().addObject(CUBE, 'A', { position: [0, 0, 0] })
    const b = useSceneStore.getState().addObject(CUBE, 'B', { position: [2, 0, 0] })
    useSceneStore.getState().createJoint(a.id, b.id, 'revolute')
    loadPhysicsScene(useSceneStore.getState().objects, useSceneStore.getState().joints)

    const renderer = await ReactThreeTestRenderer.create(<JointIndicators />)
    await renderer.advanceFrames(1, 1 / 60)

    expect(renderer.scene.findAllByType('Mesh').length).toBe(1)
    const mesh = renderer.scene.findByType('Mesh')
    expect((mesh.instance as unknown as { geometry: { type: string } }).geometry.type).toBe('TorusGeometry')
    await renderer.unmount()
  })

  it('a Prismatic joint renders exactly one segment (cylinder) indicator', async () => {
    const a = useSceneStore.getState().addObject(CUBE, 'A', { position: [0, 0, 0] })
    const b = useSceneStore.getState().addObject(CUBE, 'B', { position: [2, 0, 0] })
    useSceneStore.getState().createJoint(a.id, b.id, 'prismatic')
    loadPhysicsScene(useSceneStore.getState().objects, useSceneStore.getState().joints)

    const renderer = await ReactThreeTestRenderer.create(<JointIndicators />)
    await renderer.advanceFrames(1, 1 / 60)

    const mesh = renderer.scene.findByType('Mesh')
    expect((mesh.instance as unknown as { geometry: { type: string } }).geometry.type).toBe('CylinderGeometry')
    await renderer.unmount()
  })

  it('a Fixed joint renders no indicator at all', async () => {
    const a = useSceneStore.getState().addObject(CUBE, 'A', { position: [0, 0, 0] })
    const b = useSceneStore.getState().addObject(CUBE, 'B', { position: [2, 0, 0] })
    useSceneStore.getState().createJoint(a.id, b.id, 'fixed')
    loadPhysicsScene(useSceneStore.getState().objects, useSceneStore.getState().joints)

    const renderer = await ReactThreeTestRenderer.create(<JointIndicators />)
    await renderer.advanceFrames(1, 1 / 60)

    expect(renderer.scene.findAllByType('Mesh')).toHaveLength(0)
    await renderer.unmount()
  })

  it("a Revolute indicator sits at the joint's anchor, the midpoint between the two bodies", async () => {
    const a = useSceneStore.getState().addObject(CUBE, 'A', { position: [0, 0, 0] })
    const b = useSceneStore.getState().addObject(CUBE, 'B', { position: [4, 0, 0] })
    useSceneStore.getState().createJoint(a.id, b.id, 'revolute')
    loadPhysicsScene(useSceneStore.getState().objects, useSceneStore.getState().joints)

    const renderer = await ReactThreeTestRenderer.create(<JointIndicators />)
    await renderer.advanceFrames(1, 1 / 60)

    const group = renderer.scene.findByType('Group')
    const pos = (group.instance as unknown as { position: { x: number; y: number; z: number } }).position
    expect(pos.x).toBeCloseTo(2)
    expect(pos.y).toBeCloseTo(0)
    expect(pos.z).toBeCloseTo(0)
    await renderer.unmount()
  })

  it('the indicator tracks a body that has moved (e.g. via a gizmo drag or physics), without the stored anchor changing', async () => {
    const a = useSceneStore.getState().addObject(CUBE, 'A', { position: [0, 0, 0] })
    const b = useSceneStore.getState().addObject(CUBE, 'B', { position: [4, 0, 0] })
    setDynamic(a.id)
    setDynamic(b.id)
    const joint = useSceneStore.getState().createJoint(a.id, b.id, 'revolute')!
    loadPhysicsScene(useSceneStore.getState().objects, useSceneStore.getState().joints)

    const renderer = await ReactThreeTestRenderer.create(<JointIndicators />)
    await renderer.advanceFrames(1, 1 / 60)

    // Simulate object A being dragged far away.
    usePhysicsStore.getState().bodies.get(a.id)!.rigidBody.setTranslation({ x: 100, y: 0, z: 0 }, true)
    await renderer.advanceFrames(1, 1 / 60)

    const group = renderer.scene.findByType('Group')
    const pos = (group.instance as unknown as { position: { x: number } }).position
    expect(pos.x).toBeGreaterThan(2) // shifted toward A's new position
    expect(useSceneStore.getState().joints[0].anchor).toEqual(joint.anchor) // stored anchor untouched (D23)
    await renderer.unmount()
  })

  it('deleting a joint removes its indicator immediately', async () => {
    const a = useSceneStore.getState().addObject(CUBE, 'A', { position: [0, 0, 0] })
    const b = useSceneStore.getState().addObject(CUBE, 'B', { position: [2, 0, 0] })
    const joint = useSceneStore.getState().createJoint(a.id, b.id, 'revolute')!
    loadPhysicsScene(useSceneStore.getState().objects, useSceneStore.getState().joints)

    const renderer = await ReactThreeTestRenderer.create(<JointIndicators />)
    await renderer.advanceFrames(1, 1 / 60)
    expect(renderer.scene.findAllByType('Mesh')).toHaveLength(1)

    useSceneStore.getState().deleteJoint(joint.id)
    await renderer.update(<JointIndicators />)

    expect(renderer.scene.findAllByType('Mesh')).toHaveLength(0)
    await renderer.unmount()
  })

  it('the indicator mesh never intercepts raycasts (never selectable)', async () => {
    const a = useSceneStore.getState().addObject(CUBE, 'A', { position: [0, 0, 0] })
    const b = useSceneStore.getState().addObject(CUBE, 'B', { position: [2, 0, 0] })
    useSceneStore.getState().createJoint(a.id, b.id, 'revolute')
    loadPhysicsScene(useSceneStore.getState().objects, useSceneStore.getState().joints)

    const renderer = await ReactThreeTestRenderer.create(<JointIndicators />)
    await renderer.advanceFrames(1, 1 / 60)

    const mesh = renderer.scene.findByType('Mesh')
    const intersects: unknown[] = []
    ;(mesh.instance as unknown as { raycast: (r: unknown, i: unknown[]) => void }).raycast(null, intersects)
    expect(intersects).toHaveLength(0)
    await renderer.unmount()
  })
})
