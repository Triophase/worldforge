import { describe, expect, it } from 'vitest'
import { AssetLoadError } from '../AssetLoader/types'
import { loadOBJ } from './OBJLoader'

const SINGLE_GROUP_OBJ = `
o Cube
v 0 0 0
v 2 0 0
v 2 3 0
v 0 3 0
v 0 0 4
v 2 0 4
v 2 3 4
v 0 3 4
f 1 2 3 4
f 5 6 7 8
`

const MULTI_GROUP_OBJ = `
o CubeA
v 0 0 0
v 1 0 0
v 1 1 0
f 1 2 3
o CubeB
v 2 0 0
v 3 0 0
v 3 1 0
f 4 5 6
o CubeC
v 4 0 0
v 5 0 0
v 5 1 0
f 7 8 9
`

describe('loadOBJ (§14, M5.3)', () => {
  it('parses a valid single-group OBJ (no .mtl) with a default material, not treated as an error', async () => {
    const file = new File([SINGLE_GROUP_OBJ], 'cube.obj', { type: 'model/obj' })

    const result = await loadOBJ(file)

    expect(result.meshCount).toBe(1)
    expect(result.format).toBe('obj')
    expect(result.filename).toBe('cube.obj')
    expect(result.fileSize).toBe(file.size)
  })

  it('reports meshCount matching the number of distinct groups in a multi-group OBJ', async () => {
    const file = new File([MULTI_GROUP_OBJ], 'triple.obj', { type: 'model/obj' })

    const result = await loadOBJ(file)

    expect(result.meshCount).toBe(3)
  })

  it('a bounding box reflects the actual parsed geometry extents', async () => {
    const file = new File([SINGLE_GROUP_OBJ], 'cube.obj', { type: 'model/obj' })

    const result = await loadOBJ(file)

    expect(result.boundingBox.width).toBeCloseTo(2, 1)
    expect(result.boundingBox.height).toBeCloseTo(3, 1)
    expect(result.boundingBox.depth).toBeCloseTo(4, 1)
  })

  it('garbage text that OBJLoader silently skips (no recognizable geometry) rejects as corrupt', async () => {
    const corrupt = new File(['this is not valid obj data \x00\x01 @#$%^&*('], 'corrupt.obj', {
      type: 'model/obj',
    })

    await expect(loadOBJ(corrupt)).rejects.toBeInstanceOf(AssetLoadError)
    await expect(loadOBJ(corrupt)).rejects.toMatchObject({ reason: 'corrupt' })
  })
})
