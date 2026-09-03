import ReactThreeTestRenderer from '@react-three/test-renderer'
import { describe, expect, it } from 'vitest'
import { SelectionOutline } from './SelectionOutline'

function outerGroup(renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>) {
  return renderer.scene.children[0].instance as unknown as {
    visible: boolean
    scale: { x: number }
  }
}

describe('SelectionOutline', () => {
  it('is invisible when not selected', async () => {
    const renderer = await ReactThreeTestRenderer.create(<SelectionOutline selected={false} />)
    expect(outerGroup(renderer).visible).toBe(false)
    await renderer.unmount()
  })

  it('is visible at full scale immediately when already selected on mount', async () => {
    const renderer = await ReactThreeTestRenderer.create(<SelectionOutline selected={true} />)
    const group = outerGroup(renderer)
    expect(group.visible).toBe(true)
    expect(group.scale.x).toBeCloseTo(1)
    await renderer.unmount()
  })

  it('eases in over time (not an instant snap) when selection turns on after mount', async () => {
    const renderer = await ReactThreeTestRenderer.create(<SelectionOutline selected={false} />)
    await renderer.update(<SelectionOutline selected={true} />)
    await renderer.advanceFrames(3, 1 / 60) // partway through the 200ms fade

    let group = outerGroup(renderer)
    expect(group.visible).toBe(true)
    expect(group.scale.x).toBeGreaterThan(0)
    expect(group.scale.x).toBeLessThan(1)

    await renderer.advanceFrames(60, 1 / 60) // finish it
    group = outerGroup(renderer)
    expect(group.scale.x).toBeCloseTo(1)
    await renderer.unmount()
  })

  it('fades out (scale shrinks) and becomes invisible when selection turns off', async () => {
    const renderer = await ReactThreeTestRenderer.create(<SelectionOutline selected={true} />)
    await renderer.update(<SelectionOutline selected={false} />)
    await renderer.advanceFrames(60, 1 / 60) // let the fade-out fully complete

    const group = outerGroup(renderer)
    expect(group.visible).toBe(false)
    expect(group.scale.x).toBeCloseTo(0)
    await renderer.unmount()
  })
})
