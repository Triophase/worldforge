import { BoxGeometry, Mesh, MeshStandardMaterial, PerspectiveCamera } from 'three'
import { describe, expect, it } from 'vitest'
// Side-effect import: populates the registry.
import './index'
import { getBottomOffsetY, getUploadedBottomOffsetY, raycastGroundPlane } from './placement'

function mockDomElement(rect: Partial<DOMRect>): HTMLElement {
  const el = document.createElement('div')
  el.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, ...rect }) as DOMRect
  return el
}

describe('getBottomOffsetY', () => {
  it("places a cube (half-extent 0.5) so its bottom sits at Y=0", () => {
    expect(getBottomOffsetY('primitive:cube')).toBeCloseTo(0.5)
  })

  it("places a sphere (radius 0.5) so its bottom sits at Y=0", () => {
    expect(getBottomOffsetY('primitive:sphere')).toBeCloseTo(0.5)
  })

  it('returns 0 for an unregistered key rather than throwing', () => {
    expect(getBottomOffsetY('nonexistent:key')).toBe(0)
  })
})

describe('getUploadedBottomOffsetY (M5.7)', () => {
  it('a 2-unit-tall box centered at the origin needs a +1 offset', () => {
    const mesh = new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial())
    expect(getUploadedBottomOffsetY(mesh, 1)).toBeCloseTo(1)
  })

  it('scales the offset by unitScale, since the placed instance is scaled uniformly', () => {
    const mesh = new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial())
    expect(getUploadedBottomOffsetY(mesh, 2)).toBeCloseTo(2)
  })

  it('an object already resting on Y=0 (min.y === 0) needs no offset', () => {
    const mesh = new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial())
    mesh.position.set(0, 1, 0) // min.y now 0, max.y now 2
    mesh.updateMatrixWorld()
    expect(getUploadedBottomOffsetY(mesh, 1)).toBeCloseTo(0)
  })
})

describe('raycastGroundPlane', () => {
  it('hits the Y=0 plane when the camera looks straight down at the center of the element', () => {
    const camera = new PerspectiveCamera(50, 800 / 600, 0.1, 1000)
    camera.position.set(0, 10, 0)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()

    const domElement = mockDomElement({})
    const hit = raycastGroundPlane(camera, domElement, 400, 300) // element center

    expect(hit).not.toBeNull()
    expect(hit!.x).toBeCloseTo(0, 1)
    expect(hit!.z).toBeCloseTo(0, 1)
  })

  it('returns null when the point is outside the element bounds', () => {
    const camera = new PerspectiveCamera(50, 800 / 600, 0.1, 1000)
    camera.position.set(0, 10, 0)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld()

    const domElement = mockDomElement({})
    const hit = raycastGroundPlane(camera, domElement, 900, 300) // past `right: 800`

    expect(hit).toBeNull()
  })

  it('returns null when the ray never crosses the plane (looking straight up, away from it)', () => {
    const camera = new PerspectiveCamera(50, 800 / 600, 0.1, 1000)
    camera.position.set(0, 10, 0)
    camera.lookAt(0, 20, 0) // looking up and away from the Y=0 plane
    camera.updateMatrixWorld()

    const domElement = mockDomElement({})
    const hit = raycastGroundPlane(camera, domElement, 400, 300)

    expect(hit).toBeNull()
  })
})
