import { BoxGeometry, Mesh, MeshStandardMaterial } from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useUploadedAssetsStore } from '../../state/uploadedAssetsStore'
import { handleFileSelected, MAX_UPLOAD_SIZE_BYTES, UPLOAD_ACCEPT, uploadErrorMessage } from './AssetLoader'

function fileOfSize(bytes: number, name = 'model.glb'): File {
  return new File([new Uint8Array(bytes)], name, { type: 'model/gltf-binary' })
}

describe('AssetLoader (D11, M5.1)', () => {
  beforeEach(() => {
    useUploadedAssetsStore.setState({ uploads: [], lastUploadError: null, lastUploadErrorReason: null, progress: null })
  })

  it('a file under the 25MB cap invokes the parse handoff exactly once', () => {
    const parse = vi.fn()
    handleFileSelected(fileOfSize(10 * 1024 * 1024), parse)

    expect(parse).toHaveBeenCalledTimes(1)
    expect(useUploadedAssetsStore.getState().lastUploadError).toBeNull()
  })

  it('a file exactly at the 25MB cap is accepted (strictly over rejects, D11)', () => {
    const parse = vi.fn()
    handleFileSelected(fileOfSize(MAX_UPLOAD_SIZE_BYTES), parse)

    expect(parse).toHaveBeenCalledTimes(1)
    expect(useUploadedAssetsStore.getState().lastUploadError).toBeNull()
  })

  it('a file over the cap never invokes the parse handoff and records a rejection', () => {
    const parse = vi.fn()
    handleFileSelected(fileOfSize(MAX_UPLOAD_SIZE_BYTES + 1, 'huge.glb'), parse)

    expect(parse).not.toHaveBeenCalled()
    expect(useUploadedAssetsStore.getState().lastUploadError).toContain('huge.glb')
  })

  it('a subsequent accepted upload clears a prior rejection', () => {
    handleFileSelected(fileOfSize(MAX_UPLOAD_SIZE_BYTES + 1), vi.fn())
    expect(useUploadedAssetsStore.getState().lastUploadError).not.toBeNull()

    handleFileSelected(fileOfSize(1024), vi.fn())
    expect(useUploadedAssetsStore.getState().lastUploadError).toBeNull()
  })

  it('the uploaded-assets store starts as an empty array', () => {
    expect(useUploadedAssetsStore.getState().uploads).toEqual([])
  })

  describe('real dispatch by extension (M5.2/M5.3)', () => {
    it('.stl files route to the real STL loader and populate uploads', async () => {
      const view = new STLExporter().parse(new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial()), {
        binary: true,
      })
      handleFileSelected(new File([view], 'box.stl'))

      await vi.waitFor(() => expect(useUploadedAssetsStore.getState().uploads).toHaveLength(1))
      expect(useUploadedAssetsStore.getState().uploads[0].format).toBe('stl')
    })

    it('.obj files route to the real OBJ loader and populate uploads', async () => {
      handleFileSelected(new File(['o Cube\nv 0 0 0\nv 1 0 0\nv 1 1 0\nf 1 2 3\n'], 'tri.obj'))

      await vi.waitFor(() => expect(useUploadedAssetsStore.getState().uploads).toHaveLength(1))
      expect(useUploadedAssetsStore.getState().uploads[0].format).toBe('obj')
    })

    it('.fbx forced through anyway rejects as unsupported (M5.4: FBX cut, .ai/decisions.md)', async () => {
      handleFileSelected(new File(['fake fbx data'], 'model.fbx'))

      await vi.waitFor(() => expect(useUploadedAssetsStore.getState().lastUploadErrorReason).toBe('unsupported'))
      expect(useUploadedAssetsStore.getState().lastUploadError).toContain('model.fbx')
      expect(useUploadedAssetsStore.getState().uploads).toEqual([])
    })
  })

  describe('FBX cut (§12 allowance, M5.4)', () => {
    it('the upload picker no longer offers .fbx as a selectable type', () => {
      expect(UPLOAD_ACCEPT).not.toContain('fbx')
      expect(UPLOAD_ACCEPT).toBe('.glb,.gltf,.stl,.obj')
    })
  })

  describe('error message mapping (§25/§26, M5.6)', () => {
    it('oversized names the 25MB limit', () => {
      expect(uploadErrorMessage('oversized', 'huge.glb')).toContain('25MB')
      expect(uploadErrorMessage('oversized', 'huge.glb')).toContain('huge.glb')
    })

    it('unsupported lists the currently supported formats', () => {
      const message = uploadErrorMessage('unsupported', 'model.fbx')
      expect(message).toContain('glb')
      expect(message).toContain('gltf')
      expect(message).toContain('stl')
      expect(message).toContain('obj')
    })

    it('corrupt states the model could not be read, without any parser-internal detail', () => {
      expect(uploadErrorMessage('corrupt', 'bad.glb')).toMatch(/couldn't be read|could not be (read|loaded)/)
    })
  })

  describe('progress state (§24, M5.6)', () => {
    it('a corrupt file rejects with the mapped "corrupt" message, never the raw parser exception', async () => {
      const corrupt = new File([new Uint8Array([0x00, 0x01, 0x02, 0x03])], 'corrupt.glb', {
        type: 'model/gltf-binary',
      })
      handleFileSelected(corrupt)

      await vi.waitFor(() => expect(useUploadedAssetsStore.getState().lastUploadErrorReason).toBe('corrupt'))
      const message = useUploadedAssetsStore.getState().lastUploadError!
      expect(message).toContain('corrupt.glb')
      expect(message).not.toMatch(/SyntaxError|Unexpected token|stack|at Object\./)
      expect(useUploadedAssetsStore.getState().progress).toBeNull()
    })

    it('progress is set while a valid upload parses and cleared back to null on completion', async () => {
      handleFileSelected(new File(['o Cube\nv 0 0 0\nv 1 0 0\nv 1 1 0\nf 1 2 3\n'], 'tri.obj'))

      await vi.waitFor(() => expect(useUploadedAssetsStore.getState().uploads).toHaveLength(1))
      expect(useUploadedAssetsStore.getState().progress).toBeNull()
    })

    it('an oversized rejection clears progress back to null', () => {
      handleFileSelected(new File([new Uint8Array(MAX_UPLOAD_SIZE_BYTES + 1)], 'huge.glb'))
      expect(useUploadedAssetsStore.getState().progress).toBeNull()
    })
  })
})
