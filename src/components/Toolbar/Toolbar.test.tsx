import RAPIER from '@dimforge/rapier3d-compat'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCameraViewStore } from '../../state/cameraViewStore'
import { recordedAddObject, useHistoryStore } from '../../state/historyStore'
import { usePersistenceStore } from '../../state/persistenceStore'
import { useRenderModeStore } from '../../state/renderModeStore'
import { useSceneStore } from '../../state/sceneStore'
import { useExportStore } from '../../state/exportScene'
import { useImportStore } from '../../state/importStore'
import { Toolbar } from './Toolbar'

describe('Toolbar — View menu (M1.3, M1.4)', () => {
  beforeEach(() => {
    useCameraViewStore.setState({ projection: 'perspective', presetRequest: null })
    useRenderModeStore.setState({ mode: 'solid' })
  })

  it('lists all seven camera presets plus the projection toggle', () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'View' }))

    for (const label of ['Front', 'Back', 'Left', 'Right', 'Top', 'Bottom', 'Isometric']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Switch to Orthographic' })).toBeInTheDocument()
  })

  it('clicking a preset requests it on the camera view store', () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    fireEvent.click(screen.getByRole('button', { name: 'Isometric' }))

    expect(useCameraViewStore.getState().presetRequest?.preset).toBe('isometric')
  })

  it('clicking the projection toggle flips projection and relabels itself', () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Orthographic' }))

    expect(useCameraViewStore.getState().projection).toBe('orthographic')
    expect(screen.getByRole('button', { name: 'Switch to Perspective' })).toBeInTheDocument()
  })

  it('clicking the render-mode entry toggles solid/wireframe and relabels itself', () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    fireEvent.click(screen.getByRole('button', { name: 'Wireframe' }))

    expect(useRenderModeStore.getState().mode).toBe('wireframe')
    expect(screen.getByRole('button', { name: 'Solid' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Solid' }))
    expect(useRenderModeStore.getState().mode).toBe('solid')
  })
})

const CUBE = { kind: 'builtin' as const, key: 'primitive:cube' }

describe('Toolbar — Edit menu (M2.9)', () => {
  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [] })
    useHistoryStore.setState({ undoStack: [], redoStack: [] })
  })

  it('Undo and Redo are disabled when both stacks are empty', () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled()
  })

  it('Undo enables after an action and reverses it; Redo then enables and reapplies it', () => {
    recordedAddObject(CUBE, 'Cube')
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(useSceneStore.getState().objects).toHaveLength(0)

    expect(screen.getByRole('button', { name: 'Redo' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    expect(useSceneStore.getState().objects).toHaveLength(1)
  })

  it('M8.2: Undo and Redo each show their D24 shortcut in their tooltip', async () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))

    fireEvent.focus(screen.getByRole('button', { name: 'Undo' }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/Undo \((Ctrl|Cmd)\+Z\)/)

    fireEvent.blur(screen.getByRole('button', { name: 'Undo' }))
    fireEvent.focus(screen.getByRole('button', { name: 'Redo' }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/Redo \((Ctrl|Cmd)\+Shift\+Z\)/)
  })
})

describe('Toolbar — File menu / New Scene (M2.10)', () => {
  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [], isDirty: false })
    useHistoryStore.setState({ undoStack: [], redoStack: [] })
    vi.restoreAllMocks()
  })

  it('New Scene clears the draft immediately with no prompt when nothing is unsaved', () => {
    const confirmSpy = vi.spyOn(window, 'confirm')

    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    fireEvent.click(screen.getByRole('button', { name: 'New Scene' }))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(useSceneStore.getState().objects).toEqual([])
  })

  it('New Scene prompts and clears the draft when confirmed', () => {
    recordedAddObject(CUBE, 'Cube')
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    fireEvent.click(screen.getByRole('button', { name: 'New Scene' }))

    expect(useSceneStore.getState().objects).toEqual([])
    expect(useHistoryStore.getState().undoStack).toEqual([])
  })

  it('New Scene leaves the draft untouched when the prompt is cancelled', () => {
    recordedAddObject(CUBE, 'Cube')
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    fireEvent.click(screen.getByRole('button', { name: 'New Scene' }))

    expect(useSceneStore.getState().objects).toHaveLength(1)
  })
})

describe('Toolbar — File menu / demo loading (D26, M3.6)', () => {
  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [], isDirty: false })
    useHistoryStore.setState({ undoStack: [], redoStack: [] })
    vi.restoreAllMocks()
  })

  it('lists Falling Box in the File menu', () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    expect(screen.getByRole('button', { name: 'Falling Box' })).toBeInTheDocument()
  })

  it('lists all five demos side by side (M4.6)', () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))

    for (const label of ['Falling Box', 'Bouncing Ball', 'Rotating Wheel', 'Robotic Arm', 'Slider']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('Robotic Arm loads its Base/Arm Segment/End Effector composition with two revolute joints', () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    fireEvent.click(screen.getByRole('button', { name: 'Robotic Arm' }))

    expect(useSceneStore.getState().objects.map((o) => o.name).sort()).toEqual([
      'Arm Segment 1',
      'Arm Segment 2',
      'Base',
      'End Effector',
      'Ground',
    ])
    expect(useSceneStore.getState().joints).toHaveLength(2)
    expect(useSceneStore.getState().joints.every((j) => j.type === 'revolute')).toBe(true)
  })

  it('Slider loads a Rail/Block pair connected by a Prismatic joint', () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    fireEvent.click(screen.getByRole('button', { name: 'Slider' }))

    expect(useSceneStore.getState().objects.map((o) => o.name).sort()).toEqual(['Block', 'Rail'])
    expect(useSceneStore.getState().joints).toHaveLength(1)
    expect(useSceneStore.getState().joints[0].type).toBe('prismatic')
  })

  it('loads it immediately with no prompt when nothing is unsaved', () => {
    const confirmSpy = vi.spyOn(window, 'confirm')

    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    fireEvent.click(screen.getByRole('button', { name: 'Falling Box' }))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(useSceneStore.getState().objects.map((o) => o.name).sort()).toEqual(['Box', 'Ground', 'Platform'])
  })

  it('prompts and replaces the draft when confirmed', () => {
    recordedAddObject(CUBE, 'Cube')
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    fireEvent.click(screen.getByRole('button', { name: 'Falling Box' }))

    expect(useSceneStore.getState().objects.map((o) => o.name).sort()).toEqual(['Box', 'Ground', 'Platform'])
  })

  it('leaves the draft untouched when the prompt is cancelled', () => {
    recordedAddObject(CUBE, 'Cube')
    vi.spyOn(window, 'confirm').mockReturnValue(false)

    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    fireEvent.click(screen.getByRole('button', { name: 'Falling Box' }))

    expect(useSceneStore.getState().objects).toHaveLength(1)
    expect(useSceneStore.getState().objects[0].name).toBe('Cube')
  })
})

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Toolbar — File menu / Save + Load (D8/D9, M6.5)', () => {
  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [], isDirty: false })
    usePersistenceStore.setState({
      sceneId: null,
      isOwner: false,
      saveStatus: 'idle',
      lastSaveDocument: null,
      myScenesOpen: false,
      myScenes: null,
      listStatus: 'idle',
    })
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reads "Save as new scene" for a never-saved draft', () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    expect(screen.getByRole('button', { name: 'Save as new scene' })).toBeInTheDocument()
  })

  it('clicking it POSTs, then the button relabels to "Save" once the draft has a server id', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 's1', isOwner: true, name: 'Untitled Scene' }, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save as new scene' }))

    // M6.10: `save()` now awaits an upload-check step (a no-op microtask
    // hop for a scene with no uploaded assets) before its first `fetch`
    // call, so this can no longer be asserted synchronously post-click.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [, init] = fetchMock.mock.calls[0]!
    expect(init.method).toBe('POST')
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument())
  })

  it('reads "Save" (and PUTs) for a draft already owned by this device', async () => {
    usePersistenceStore.setState({ sceneId: 's1', isOwner: true })
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 's1', isOwner: true, name: 'Untitled Scene' }))
    vi.stubGlobal('fetch', fetchMock)

    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toMatch(/\/scenes\/s1$/)
    expect(init.method).toBe('PUT')
  })

  it('Load opens My Scenes immediately with no prompt when nothing is unsaved', () => {
    const confirmSpy = vi.spyOn(window, 'confirm')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))

    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    fireEvent.click(screen.getByRole('button', { name: 'Load' }))

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(usePersistenceStore.getState().myScenesOpen).toBe(true)
  })

  it('Load prompts before opening My Scenes when there are unsaved changes (D4)', () => {
    recordedAddObject(CUBE, 'Cube')
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse([])))

    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    fireEvent.click(screen.getByRole('button', { name: 'Load' }))

    expect(window.confirm).toHaveBeenCalled()
    expect(usePersistenceStore.getState().myScenesOpen).toBe(false)
  })
})

describe('Toolbar — non-owner sandbox (D8, M6.6)', () => {
  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [], isDirty: false })
    usePersistenceStore.setState({
      sceneId: null,
      isOwner: false,
      saveStatus: 'idle',
      myScenesOpen: false,
      myScenes: null,
      listStatus: 'idle',
      linkOpenStatus: 'idle',
    })
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows no banner and reads "Save as new scene" for a brand-new draft (sceneId null)', () => {
    render(<Toolbar />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('shows the non-owner banner when a server scene is loaded but not owned by this device', () => {
    usePersistenceStore.setState({ sceneId: 's1', isOwner: false })
    render(<Toolbar />)
    expect(screen.getByRole('status')).toHaveTextContent(/someone else's scene/i)
  })

  it('shows no banner for an owned scene', () => {
    usePersistenceStore.setState({ sceneId: 's1', isOwner: true })
    render(<Toolbar />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('the fork action from a non-owned scene POSTs — never PUTs the original scene\'s id', async () => {
    usePersistenceStore.setState({ sceneId: 'original-id', isOwner: false })
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 'new-forked-id', isOwner: true, name: 'Untitled Scene' }, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save as new scene' }))

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]!
    expect(init.method).toBe('POST')
    expect(String(url)).not.toMatch(/original-id/)
  })
})

describe('Toolbar — Export Scene (M7.1, §27)', () => {
  beforeEach(() => {
    useExportStore.setState({ status: 'idle', errorMessage: null })
  })

  it('is available in the File menu regardless of save state', () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))

    expect(screen.getByRole('button', { name: 'Export Scene' })).toBeInTheDocument()
  })

  it('clicking it calls exportScene(), and relabels to "Exporting…" while in flight', async () => {
    const exportSpy = vi.fn().mockResolvedValue(undefined)
    useExportStore.setState({ exportScene: exportSpy })

    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    fireEvent.click(screen.getByRole('button', { name: 'Export Scene' }))

    expect(exportSpy).toHaveBeenCalledTimes(1)

    useExportStore.setState({ status: 'exporting' })
    expect(await screen.findByRole('button', { name: 'Exporting…' })).toBeInTheDocument()
  })
})

describe('Toolbar — Import Scene (M7.2, §27)', () => {
  beforeEach(() => {
    useImportStore.setState({ status: 'idle', errorMessage: null })
  })

  it('is available in the File menu, with a hidden file input restricted to .json', () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))

    expect(screen.getByRole('button', { name: 'Import Scene' })).toBeInTheDocument()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input.accept).toBe('.json')
  })

  it('clicking the Import Scene button opens the file picker (clicks the hidden input)', () => {
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const clickSpy = vi.spyOn(input, 'click')

    fireEvent.click(screen.getByRole('button', { name: 'Import Scene' }))

    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('picking a file calls importFile(), and relabels to "Importing…" while in flight', async () => {
    const importSpy = vi.fn().mockResolvedValue(undefined)
    useImportStore.setState({ importFile: importSpy })
    render(<Toolbar />)
    fireEvent.click(screen.getByRole('button', { name: 'File' }))
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['{}'], 'scene.json', { type: 'application/json' })

    fireEvent.change(input, { target: { files: [file] } })

    expect(importSpy).toHaveBeenCalledWith(file)

    useImportStore.setState({ status: 'importing' })
    expect(await screen.findByRole('button', { name: 'Importing…' })).toBeInTheDocument()
  })
})

describe('Toolbar — narrow-width overflow menu (M8.4, §28)', () => {
  function setWindowWidth(width: number) {
    Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
  }

  afterEach(() => {
    setWindowWidth(1024)
  })

  it('at desktop width, View is a direct top-level menu, with no "More" menu present', () => {
    setWindowWidth(1024)
    render(<Toolbar />)

    expect(screen.getByRole('button', { name: 'View' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument()
  })

  it('below the breakpoint, View moves behind a "More" menu, remaining fully functional', () => {
    setWindowWidth(700)
    useCameraViewStore.setState({ projection: 'perspective', presetRequest: null, frameRequest: null })
    render(<Toolbar />)

    expect(screen.queryByRole('button', { name: 'View' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'More' }))

    const viewTrigger = screen.getByRole('button', { name: 'View' })
    expect(viewTrigger).toBeInTheDocument()
    fireEvent.click(viewTrigger)
    fireEvent.click(screen.getByRole('button', { name: 'Isometric' }))

    expect(useCameraViewStore.getState().presetRequest?.preset).toBe('isometric')
  })
})
