import ReactThreeTestRenderer from '@react-three/test-renderer'
import { describe, expect, it } from 'vitest'
import { SceneContent } from './SceneContent'

describe('SceneContent', () => {
  it('has exactly one perspective camera', async () => {
    const renderer = await ReactThreeTestRenderer.create(<SceneContent />)
    const cameras = renderer.scene.findAllByType('PerspectiveCamera')
    expect(cameras).toHaveLength(1)
    expect(cameras[0].instance).toMatchObject({ isPerspectiveCamera: true })
    await renderer.unmount()
  })

  it('has an ambient light and exactly one directional light', async () => {
    const renderer = await ReactThreeTestRenderer.create(<SceneContent />)
    expect(renderer.scene.findAllByType('AmbientLight')).toHaveLength(1)
    expect(renderer.scene.findAllByType('DirectionalLight')).toHaveLength(1)
    await renderer.unmount()
  })

  it('configures OrbitControls so left orbits, right and middle pan, per spec §8', async () => {
    const renderer = await ReactThreeTestRenderer.create(<SceneContent />)
    // drei's <OrbitControls> renders via <primitive>, so it has no friendly
    // `.type` in the test tree — found by instance constructor name instead.
    const controls = renderer.scene.find(
      (node) => (node.instance as unknown as { constructor: { name: string } })?.constructor?.name ===
        'OrbitControls',
    )
    const instance = controls.instance as unknown as {
      mouseButtons: { LEFT: number; MIDDLE: number; RIGHT: number }
      enableZoom: boolean
    }
    expect(instance.mouseButtons.LEFT).toBe(0) // THREE.MOUSE.ROTATE
    expect(instance.mouseButtons.MIDDLE).toBe(2) // THREE.MOUSE.PAN
    expect(instance.mouseButtons.RIGHT).toBe(2) // THREE.MOUSE.PAN
    expect(instance.enableZoom).not.toBe(false)
    await renderer.unmount()
  })
})
