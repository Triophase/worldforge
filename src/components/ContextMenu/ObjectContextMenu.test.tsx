import RAPIER from '@dimforge/rapier3d-compat'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { useContextMenuStore } from '../../state/contextMenuStore'
import { useGizmoModeStore } from '../../state/gizmoModeStore'
import { useJointCreationRequestStore } from '../../state/jointCreationRequestStore'
import { useRenameRequestStore } from '../../state/renameRequestStore'
import { useSceneStore } from '../../state/sceneStore'
import { useSimulationStore } from '../../state/simulationStore'
import { ObjectContextMenu } from './ObjectContextMenu'

const CUBE = { kind: 'builtin' as const, key: 'primitive:cube' }

const ITEM_ORDER = ['Move', 'Rotate', 'Duplicate', 'Rename', 'Add Physics', 'Add Joint', 'Delete']

describe('ObjectContextMenu (M8.1, §21)', () => {
  beforeAll(async () => {
    await RAPIER.init()
  })

  beforeEach(() => {
    useSceneStore.setState({ objects: [], joints: [], selectedJointId: null, selectedIds: [] })
    useContextMenuStore.setState({ open: false, x: 0, y: 0 })
    useGizmoModeStore.setState({ mode: 'translate' })
    useSimulationStore.setState({ phase: 'idle', snapshot: null })
    useRenameRequestStore.setState({ requestedId: null })
    useJointCreationRequestStore.setState({ requestedObjectAId: null })
  })

  it('renders nothing while closed', () => {
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
    useSceneStore.getState().select(obj.id)
    expect(render(<ObjectContextMenu />).container).toBeEmptyDOMElement()
  })

  it('renders nothing while open but nothing is selected (defensive)', () => {
    useContextMenuStore.getState().openMenu(10, 20)
    expect(render(<ObjectContextMenu />).container).toBeEmptyDOMElement()
  })

  it('shows exactly the seven §21 items, in order, for a single selection', () => {
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
    useSceneStore.getState().select(obj.id)
    useContextMenuStore.getState().openMenu(10, 20)

    render(<ObjectContextMenu />)
    const items = screen.getAllByRole('menuitem').map((el) => el.textContent)
    expect(items).toEqual(ITEM_ORDER)
  })

  it('positions the menu at the stored x/y', () => {
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
    useSceneStore.getState().select(obj.id)
    useContextMenuStore.getState().openMenu(123, 456)

    render(<ObjectContextMenu />)
    const menu = screen.getByRole('menu')
    expect(menu.style.left).toBe('123px')
    expect(menu.style.top).toBe('456px')
  })

  it('shows only Duplicate and Delete for a multi-object selection (§9)', () => {
    const a = useSceneStore.getState().addObject(CUBE, 'A')
    const b = useSceneStore.getState().addObject(CUBE, 'B')
    useSceneStore.getState().setSelection([a.id, b.id])
    useContextMenuStore.getState().openMenu(10, 20)

    render(<ObjectContextMenu />)
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual(['Duplicate', 'Delete'])
  })

  it('clicking Move sets the gizmo mode to translate and closes the menu', () => {
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
    useSceneStore.getState().select(obj.id)
    useContextMenuStore.getState().openMenu(10, 20)
    useGizmoModeStore.setState({ mode: 'rotate' })

    render(<ObjectContextMenu />)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move' }))

    expect(useGizmoModeStore.getState().mode).toBe('translate')
    expect(useContextMenuStore.getState().open).toBe(false)
  })

  it('clicking Rotate sets the gizmo mode to rotate', () => {
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
    useSceneStore.getState().select(obj.id)
    useContextMenuStore.getState().openMenu(10, 20)

    render(<ObjectContextMenu />)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rotate' }))

    expect(useGizmoModeStore.getState().mode).toBe('rotate')
  })

  it('clicking Duplicate invokes the same recorded action Ctrl/Cmd+D would', () => {
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
    useSceneStore.getState().select(obj.id)
    useContextMenuStore.getState().openMenu(10, 20)

    render(<ObjectContextMenu />)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }))

    expect(useSceneStore.getState().objects).toHaveLength(2)
  })

  it('clicking Rename requests rename for the sole selected object', () => {
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
    useSceneStore.getState().select(obj.id)
    useContextMenuStore.getState().openMenu(10, 20)

    render(<ObjectContextMenu />)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))

    expect(useRenameRequestStore.getState().requestedId).toBe(obj.id)
  })

  it('clicking Add Physics switches Body Type to Dynamic with D29 defaults', () => {
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
    useSceneStore.getState().select(obj.id)
    useContextMenuStore.getState().openMenu(10, 20)

    render(<ObjectContextMenu />)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add Physics' }))

    const updated = useSceneStore.getState().objects.find((o) => o.id === obj.id)!
    expect(updated.physics).toMatchObject({ bodyType: 'dynamic', mass: 1, friction: 0.5, restitution: 0.2, gravity: true })
  })

  it('clicking Add Joint requests the joint-creation flow with this object as Object A', () => {
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
    useSceneStore.getState().select(obj.id)
    useContextMenuStore.getState().openMenu(10, 20)

    render(<ObjectContextMenu />)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add Joint' }))

    expect(useJointCreationRequestStore.getState().requestedObjectAId).toBe(obj.id)
  })

  it('clicking Delete removes the object', () => {
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
    useSceneStore.getState().select(obj.id)
    useContextMenuStore.getState().openMenu(10, 20)

    render(<ObjectContextMenu />)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))

    expect(useSceneStore.getState().objects).toHaveLength(0)
  })

  it('pressing Escape closes the menu without performing any action', () => {
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
    useSceneStore.getState().select(obj.id)
    useContextMenuStore.getState().openMenu(10, 20)

    render(<ObjectContextMenu />)
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(useContextMenuStore.getState().open).toBe(false)
    expect(useSceneStore.getState().objects).toHaveLength(1)
  })

  it('an outside click closes the menu', () => {
    const obj = useSceneStore.getState().addObject(CUBE, 'Cube')
    useSceneStore.getState().select(obj.id)
    useContextMenuStore.getState().openMenu(10, 20)

    render(<ObjectContextMenu />)
    fireEvent.mouseDown(document.body)

    expect(useContextMenuStore.getState().open).toBe(false)
  })
})
