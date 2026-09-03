import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { describe, expect, it } from 'vitest'
import { ViewportChrome } from './ViewportChrome'

const dir = dirname(fileURLToPath(import.meta.url))

function ctorNames(renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>) {
  return renderer.scene.allChildren.map(
    (c) => (c.instance as unknown as { constructor: { name: string } })?.constructor?.name,
  )
}

describe('ViewportChrome', () => {
  it('renders a grid, axes, an origin marker, and an orientation gizmo unconditionally', async () => {
    const renderer = await ReactThreeTestRenderer.create(<ViewportChrome />)
    const names = ctorNames(renderer)

    expect(names).toContain('AxesHelper')
    expect(names.filter((n) => n === 'Mesh').length).toBeGreaterThanOrEqual(1) // origin marker (+ Grid's mesh)
    await renderer.unmount()
  })

  it('renders without throwing with the orientation gizmo present', async () => {
    const renderer = await ReactThreeTestRenderer.create(<ViewportChrome />, {
      width: 800,
      height: 600,
    })
    await renderer.unmount()
  })

  it('declares GizmoHelper/GizmoViewport for the orientation gizmo', () => {
    // @react-three/test-renderer's resolved instance tree does not surface
    // GizmoHelper's content at all — it renders into a separate portalled
    // scene, invisible to renderer.scene/toTree() (confirmed empirically,
    // even with an explicit non-zero canvas size passed to `create()`), and
    // reflecting on the raw React element tree is unreliable across
    // forwardRef/memo-wrapped components. Checked against the source
    // directly instead — cruder, but reliable, and honest about what it
    // actually confirms: declared and imported, not that it renders
    // correctly on screen.
    const source = readFileSync(join(dir, 'ViewportChrome.tsx'), 'utf-8')
    expect(source).toMatch(/import\s*\{[^}]*GizmoHelper[^}]*\}\s*from\s*'@react-three\/drei'/)
    expect(source).toMatch(/<GizmoHelper[\s>]/)
    expect(source).toMatch(/<GizmoViewport\s*\/>/)
  })

  it('none of the four helpers carries a scene-object-shaped id/name/transform record', async () => {
    const renderer = await ReactThreeTestRenderer.create(<ViewportChrome />)
    for (const child of renderer.scene.allChildren) {
      expect(child.props).not.toHaveProperty('id')
      expect(child.props).not.toHaveProperty('assetRef')
    }
    await renderer.unmount()
  })
})
