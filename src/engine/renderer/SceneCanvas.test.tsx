import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SceneCanvas } from './SceneCanvas'

const dir = dirname(fileURLToPath(import.meta.url))

describe('SceneCanvas', () => {
  it('mounts without throwing', () => {
    expect(() => render(<SceneCanvas />)).not.toThrow()
  })

  it("wires the Canvas's onPointerMissed to clearSelection — R3F's own \"no object hit\" signal for §9's empty-space click", () => {
    // Real pointer-raycast hit-testing against a jsdom canvas (0×0, no
    // WebGL layout) isn't meaningfully simulatable here — same limitation
    // noted for GizmoHelper in M1.2's memory. Confirmed via source instead:
    // honest about what it verifies (wired, not "clicking empty space
    // visibly deselects in a real browser").
    const source = readFileSync(join(dir, 'SceneCanvas.tsx'), 'utf-8')
    expect(source).toMatch(/onPointerMissed=\{?\(\)\s*=>\s*clearSelection\(\)/)
  })
})
