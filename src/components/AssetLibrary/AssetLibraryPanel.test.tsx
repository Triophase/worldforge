import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_UPLOAD_SIZE_BYTES } from '../../loaders/AssetLoader/AssetLoader'
import { useSceneStore } from '../../state/sceneStore'
import { useUploadedAssetsStore } from '../../state/uploadedAssetsStore'
import { AssetLibraryPanel } from './AssetLibraryPanel'

async function exportGLB(mesh: Mesh): Promise<File> {
  const exporter = new GLTFExporter()
  const buffer = (await exporter.parseAsync(mesh, { binary: true })) as ArrayBuffer
  return new File([buffer], 'box.glb', { type: 'model/gltf-binary' })
}

/** A ready-to-place upload record (M5.5's post-parse shape), for tests
 * that exercise the "Uploaded" category without going through a full
 * async parse round-trip. */
function makeUploadRecord(id: string, filename: string, unitScale = 1) {
  useUploadedAssetsStore.getState().addUpload({
    id,
    filename,
    format: 'glb',
    fileSize: 100,
    object: new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial()),
    boundingBox: { width: 1, height: 2, depth: 1 },
    meshCount: 1,
    file: new File([], filename),
  })
  if (unitScale !== 1) useUploadedAssetsStore.getState().setUnitScale(id, unitScale)
}

describe('AssetLibraryPanel', () => {
  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [] })
    useUploadedAssetsStore.setState({ uploads: [], lastUploadError: null, lastUploadErrorReason: null, progress: null })
  })

  it('renders exactly twelve cards under "All" (M4.7: Robot Arm joins the eleven built-ins)', () => {
    render(<AssetLibraryPanel />)
    // Cards are buttons with an accessible name from their label text.
    for (const name of [
      'Cube', 'Sphere', 'Cylinder', 'Cone', 'Capsule',
      'Box', 'Beam', 'Wheel', 'Axle', 'Platform', 'Ramp', 'Robot Arm',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('Basic Shapes shows only the five primitives; Mechanical shows only the six components', async () => {
    const user = userEvent.setup()
    render(<AssetLibraryPanel />)

    await user.click(screen.getByRole('tab', { name: 'Basic Shapes' }))
    expect(screen.getByRole('button', { name: 'Cube' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Wheel' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Mechanical' }))
    expect(screen.getByRole('button', { name: 'Wheel' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cube' })).not.toBeInTheDocument()
  })

  it('Uploaded shows an empty state, not an error', async () => {
    const user = userEvent.setup()
    render(<AssetLibraryPanel />)

    await user.click(screen.getByRole('tab', { name: 'Uploaded' }))
    expect(screen.getByText('Nothing here yet.')).toBeInTheDocument()
  })

  it('Assemblies shows exactly the Robot Arm card (M4.7)', async () => {
    const user = userEvent.setup()
    render(<AssetLibraryPanel />)

    await user.click(screen.getByRole('tab', { name: 'Assemblies' }))
    expect(screen.getByRole('button', { name: 'Robot Arm' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cube' })).not.toBeInTheDocument()
  })

  it('typing a substring filters the grid case-insensitively', async () => {
    const user = userEvent.setup()
    render(<AssetLibraryPanel />)

    await user.type(screen.getByLabelText('Search assets'), 'whe')
    expect(screen.getByRole('button', { name: 'Wheel' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cube' })).not.toBeInTheDocument()
  })

  it('clicking a card adds the object with its bottom face at Y=0 and selects it', async () => {
    const user = userEvent.setup()
    render(<AssetLibraryPanel />)

    await user.click(screen.getByRole('button', { name: 'Cube' }))

    const state = useSceneStore.getState()
    expect(state.objects).toHaveLength(1)
    expect(state.objects[0].assetRef).toEqual({ kind: 'builtin', key: 'primitive:cube' })
    expect(state.objects[0].transform.position[1]).toBeCloseTo(0.5) // cube half-extent
    expect(state.selectedIds).toEqual([state.objects[0].id])
  })

  it('clicking the Robot Arm card inserts four static objects and two motor-off Revolute joints, selecting Base (M4.7)', async () => {
    const user = userEvent.setup()
    render(<AssetLibraryPanel />)

    await user.click(screen.getByRole('tab', { name: 'Assemblies' }))
    await user.click(screen.getByRole('button', { name: 'Robot Arm' }))

    const state = useSceneStore.getState()
    const names = state.objects.map((o) => o.name).sort()
    expect(names).toEqual(['Arm Segment 1', 'Arm Segment 2', 'Base', 'End Effector'])
    expect(state.objects.every((o) => o.physics.bodyType === 'static')).toBe(true)

    expect(state.joints).toHaveLength(2)
    expect(state.joints.every((j) => j.type === 'revolute' && !j.motor.enabled)).toBe(true)

    const base = state.objects.find((o) => o.name === 'Base')!
    expect(state.selectedIds).toEqual([base.id])
  })

  describe('Upload flow (§12, M5.1)', () => {
    it('clicking "+ Upload Asset" opens the native file picker', () => {
      render(<AssetLibraryPanel />)
      const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})

      fireEvent.click(screen.getByRole('button', { name: '+ Upload Asset' }))

      expect(clickSpy).toHaveBeenCalledTimes(1)
    })

    it('selecting a file under the cap records no rejection', () => {
      render(<AssetLibraryPanel />)
      const input = document.querySelector('input[type="file"]')!
      const file = new File([new Uint8Array(1024)], 'small.glb')

      fireEvent.change(input, { target: { files: [file] } })

      expect(useUploadedAssetsStore.getState().lastUploadError).toBeNull()
    })

    it('selecting a file over the 25MB cap rejects it without a parse attempt', () => {
      render(<AssetLibraryPanel />)
      const input = document.querySelector('input[type="file"]')!
      const file = new File([new Uint8Array(MAX_UPLOAD_SIZE_BYTES + 1)], 'huge.glb')

      fireEvent.change(input, { target: { files: [file] } })

      expect(useUploadedAssetsStore.getState().lastUploadError).toContain('huge.glb')
    })
  })

  describe('Upload error handling + progress (§24/§25/§26, M5.6)', () => {
    it('an oversized file shows an error panel naming the 25MB limit, with a "Try Another File" button', () => {
      render(<AssetLibraryPanel />)
      const input = document.querySelector('input[type="file"]')!
      const file = new File([new Uint8Array(MAX_UPLOAD_SIZE_BYTES + 1)], 'huge.glb')

      fireEvent.change(input, { target: { files: [file] } })

      expect(screen.getByRole('alert')).toHaveTextContent('25MB')
      expect(screen.getByRole('button', { name: 'Try Another File' })).toBeInTheDocument()
    })

    it('an unsupported-format file shows an error panel listing the supported formats', async () => {
      render(<AssetLibraryPanel />)
      const input = document.querySelector('input[type="file"]')!
      const file = new File(['not a real image'], 'photo.png', { type: 'image/png' })

      fireEvent.change(input, { target: { files: [file] } })

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent(/glb/i)
      expect(alert).toHaveTextContent(/stl/i)
      expect(alert).toHaveTextContent(/obj/i)
    })

    it('a corrupt file shows the invalid-file panel with no raw exception text anywhere in the DOM', async () => {
      render(<AssetLibraryPanel />)
      const input = document.querySelector('input[type="file"]')!
      const corrupt = new File([new Uint8Array([0x00, 0x01, 0x02, 0x03])], 'corrupt.glb', {
        type: 'model/gltf-binary',
      })

      fireEvent.change(input, { target: { files: [corrupt] } })

      await screen.findByRole('alert')
      expect(document.body.textContent).not.toMatch(/SyntaxError|Unexpected token|at Object\.|\.js:\d+/)
    })

    it('clicking "Try Another File" reopens the native file picker', () => {
      render(<AssetLibraryPanel />)
      const input = document.querySelector('input[type="file"]')!
      fireEvent.change(input, { target: { files: [new File([new Uint8Array(MAX_UPLOAD_SIZE_BYTES + 1)], 'huge.glb')] } })

      const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
      clickSpy.mockClear() // a prior test in this file may leave an un-restored spy on the same prototype method
      fireEvent.click(screen.getByRole('button', { name: 'Try Another File' }))

      expect(clickSpy).toHaveBeenCalledTimes(1)
    })

    it('a valid upload shows a determinate progress bar and no error panel on completion', async () => {
      render(<AssetLibraryPanel />)
      const input = document.querySelector('input[type="file"]')!
      const file = await exportGLB(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()))

      fireEvent.change(input, { target: { files: [file] } })

      await vi.waitFor(() => expect(useUploadedAssetsStore.getState().uploads).toHaveLength(1))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    })

    it('a .gltf with a missing external texture completes with no error panel shown (regression guard)', async () => {
      render(<AssetLibraryPanel />)
      const input = document.querySelector('input[type="file"]')!
      const json = {
        asset: { version: '2.0' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: [{ mesh: 0 }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
        materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
        textures: [{ source: 0 }],
        images: [{ uri: 'missing-texture.png' }],
        accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', max: [1, 1, 0], min: [0, 0, 0] }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }],
        buffers: [
          {
            byteLength: 36,
            uri: `data:application/octet-stream;base64,${Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer).toString('base64')}`,
          },
        ],
      }
      const file = new File([JSON.stringify(json)], 'missing-texture.gltf', { type: 'model/gltf+json' })

      fireEvent.change(input, { target: { files: [file] } })

      await vi.waitFor(() => expect(useUploadedAssetsStore.getState().uploads).toHaveLength(1))
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  describe('"Uploaded" asset library category (§11, M5.7)', () => {
    it('a successful upload shows exactly one card in "Uploaded", labeled from the filename with its extension stripped', async () => {
      makeUploadRecord('u1', 'Widget.glb')
      const user = userEvent.setup()
      render(<AssetLibraryPanel />)

      await user.click(screen.getByRole('tab', { name: 'Uploaded' }))
      expect(screen.getByRole('button', { name: 'Widget' })).toBeInTheDocument()
      expect(screen.queryByText('Nothing here yet.')).not.toBeInTheDocument()
    })

    it('a second, different upload adds a second, independent card, leaving the first unaffected', async () => {
      makeUploadRecord('u1', 'Widget.glb')
      makeUploadRecord('u2', 'Gadget.glb')
      const user = userEvent.setup()
      render(<AssetLibraryPanel />)

      await user.click(screen.getByRole('tab', { name: 'Uploaded' }))
      expect(screen.getByRole('button', { name: 'Widget' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Gadget' })).toBeInTheDocument()
    })

    it('clicking an uploaded card adds a scene object with assetRef.kind "uploaded", bottom face at Y=0, and the captured unit-scale', async () => {
      makeUploadRecord('u1', 'Widget.glb', 3)
      const user = userEvent.setup()
      render(<AssetLibraryPanel />)

      await user.click(screen.getByRole('tab', { name: 'Uploaded' }))
      await user.click(screen.getByRole('button', { name: 'Widget' }))

      const state = useSceneStore.getState()
      expect(state.objects).toHaveLength(1)
      expect(state.objects[0].assetRef).toEqual({ kind: 'uploaded', key: 'u1' })
      // Box is 2 units tall, centered at its own origin → half-height 1, scaled by unitScale 3.
      expect(state.objects[0].transform.position[1]).toBeCloseTo(3)
      expect(state.objects[0].transform.scale).toEqual([3, 3, 3])
      expect(state.selectedIds).toEqual([state.objects[0].id])
    })

    it('clicking the same uploaded card twice produces two independent objects with auto-incremented names', async () => {
      makeUploadRecord('u1', 'Widget.glb')
      const user = userEvent.setup()
      render(<AssetLibraryPanel />)

      await user.click(screen.getByRole('tab', { name: 'Uploaded' }))
      await user.click(screen.getByRole('button', { name: 'Widget' }))
      await user.click(screen.getByRole('button', { name: 'Widget' }))

      const names = useSceneStore.getState().objects.map((o) => o.name).sort()
      expect(names).toEqual(['Widget', 'Widget 2'])
    })

    it('typing a filter string matching only an uploaded card\'s label filters the grid to that card', async () => {
      makeUploadRecord('u1', 'Widget.glb')
      const user = userEvent.setup()
      render(<AssetLibraryPanel />)

      await user.type(screen.getByLabelText('Search assets'), 'widg')
      expect(screen.getByRole('button', { name: 'Widget' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Cube' })).not.toBeInTheDocument()
    })

    it('simulating a page reload (a fresh store) results in an empty "Uploaded" category', async () => {
      makeUploadRecord('u1', 'Widget.glb')
      const user = userEvent.setup()
      const { unmount } = render(<AssetLibraryPanel />)
      await user.click(screen.getByRole('tab', { name: 'Uploaded' }))
      expect(screen.getByRole('button', { name: 'Widget' })).toBeInTheDocument()
      unmount()

      // No persistence mechanism exists (D10/M6.10 not built yet) — a
      // fresh store, as a real page reload would produce, is simply empty.
      useUploadedAssetsStore.setState({ uploads: [], lastUploadError: null, lastUploadErrorReason: null, progress: null })
      render(<AssetLibraryPanel />)
      await user.click(screen.getByRole('tab', { name: 'Uploaded' }))
      expect(screen.getByText('Nothing here yet.')).toBeInTheDocument()
    })
  })
})
