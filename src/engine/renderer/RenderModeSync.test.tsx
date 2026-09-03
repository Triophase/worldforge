import ReactThreeTestRenderer from '@react-three/test-renderer'
import { beforeEach, describe, expect, it } from 'vitest'
import { useRenderModeStore } from '../../state/renderModeStore'
import { RenderModeSync } from './RenderModeSync'

function Scene() {
  return (
    <>
      <RenderModeSync />
      <mesh name="standard-mesh">
        <boxGeometry />
        <meshBasicMaterial />
      </mesh>
      <mesh name="shader-mesh">
        <planeGeometry />
        <shaderMaterial />
      </mesh>
    </>
  )
}

describe('RenderModeSync', () => {
  beforeEach(() => {
    useRenderModeStore.setState({ mode: 'solid' })
  })

  it('is a single global mode, not scoped to any object', () => {
    // The store itself has one `mode` field, no per-object keying —
    // structural proof there's nowhere to attach a per-object override.
    expect(useRenderModeStore.getState()).toHaveProperty('mode')
    expect(Object.keys(useRenderModeStore.getState())).not.toContain('objectModes')
  })

  it('setting wireframe mode sets every standard mesh material to wireframe', async () => {
    const renderer = await ReactThreeTestRenderer.create(<Scene />)
    useRenderModeStore.getState().toggleMode()
    await renderer.advanceFrames(1, 1 / 60)

    const standard = renderer.scene.findByProps({ name: 'standard-mesh' })
    const material = (standard.instance as unknown as { material: { wireframe: boolean } }).material
    expect(material.wireframe).toBe(true)

    await renderer.unmount()
  })

  it('setting solid mode restores normal shaded rendering', async () => {
    const renderer = await ReactThreeTestRenderer.create(<Scene />)
    useRenderModeStore.getState().toggleMode() // -> wireframe
    await renderer.advanceFrames(1, 1 / 60)
    useRenderModeStore.getState().toggleMode() // -> solid
    await renderer.advanceFrames(1, 1 / 60)

    const standard = renderer.scene.findByProps({ name: 'standard-mesh' })
    const material = (standard.instance as unknown as { material: { wireframe: boolean } }).material
    expect(material.wireframe).toBe(false)

    await renderer.unmount()
  })

  it('never applies wireframe to a custom-shader mesh (e.g. Grid chrome)', async () => {
    const renderer = await ReactThreeTestRenderer.create(<Scene />)
    useRenderModeStore.getState().toggleMode()
    await renderer.advanceFrames(1, 1 / 60)

    const shaderMesh = renderer.scene.findByProps({ name: 'shader-mesh' })
    const material = (shaderMesh.instance as unknown as { material: { wireframe: boolean } }).material
    expect(material.wireframe).toBe(false)

    await renderer.unmount()
  })

  it('a mesh added after wireframe mode is already active picks it up with no extra wiring', async () => {
    useRenderModeStore.setState({ mode: 'wireframe' })
    const renderer = await ReactThreeTestRenderer.create(<Scene />)
    await renderer.advanceFrames(1, 1 / 60) // RenderModeSync's very first frame

    const standard = renderer.scene.findByProps({ name: 'standard-mesh' })
    const material = (standard.instance as unknown as { material: { wireframe: boolean } }).material
    expect(material.wireframe).toBe(true)

    await renderer.unmount()
  })
})
