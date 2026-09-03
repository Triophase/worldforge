import { useEffect, useRef } from 'react'
import { AssetLibraryPanel } from '../components/AssetLibrary/AssetLibraryPanel'
import { useAssetDrop } from '../components/AssetLibrary/useAssetDrop'
import { ObjectContextMenu } from '../components/ContextMenu/ObjectContextMenu'
import { MyScenesPanel } from '../components/MyScenes/MyScenesPanel'
import { ShareLinkStatusOverlay } from '../components/MyScenes/ShareLinkStatusOverlay'
import { PropertiesPanel } from '../components/PropertiesPanel/PropertiesPanel'
import { SceneHierarchyPanel } from '../components/SceneTree/SceneHierarchyPanel'
import { TransportBar } from '../components/SimulationControls/TransportBar'
import { Toolbar } from '../components/Toolbar/Toolbar'
import { useDismissableMenu } from '../components/ui/useDismissableMenu'
import { ViewportRegion } from '../components/Viewport/ViewportRegion'
import { useDrawerStore } from '../state/drawerStore'
import { ResizeHandle } from './ResizeHandle'
import styles from './AppShell.module.css'
import { useDismissHintOnFirstInteraction } from './useDismissHintOnFirstInteraction'
import { useGlobalShortcuts } from './useGlobalShortcuts'
import { useIsNarrowViewport } from './useIsNarrowViewport'
import { useResizablePanels } from './useResizablePanels'
import { useUnsavedChangesWarning } from './useUnsavedChangesWarning'

/**
 * The full app layout (idea.md §3): toolbar / assets+viewport+
 * (hierarchy+properties) / transport bar. `idea.md`'s own wireframe
 * doesn't reserve a distinct region for the Scene Hierarchy (§8) — M2.4
 * places it stacked above Properties in the right-hand column, since
 * both are about the object that's currently selected/in the scene,
 * distinct from Assets (what could be *added*).
 *
 * Asset drag-to-place (M2.3) is handled at this top level, not scoped to
 * the viewport's own DOM element — a drop anywhere in the app (including
 * over the Properties panel) must still add the object, per §11's stated
 * fallback-to-origin-placement behavior.
 *
 * `M8.4`/§28: below `DRAWER_BREAKPOINT`, the Assets/Properties containers
 * switch from inline (resizable, viewport-compressing) to fixed-position
 * overlay drawers — but `AssetLibraryPanel`/`SceneHierarchyPanel`/
 * `PropertiesPanel` themselves stay **continuously mounted** at the same
 * JSX position either way; only the wrapping `<div>`'s class/style
 * changes. This is deliberate, not incidental: conditionally rendering a
 * *different* wrapper element per mode would unmount/remount those
 * components on every breakpoint crossing, losing their own internal
 * state (e.g. the Assets panel's search text) — state-architecture's own
 * "internal state survives the switch" requirement is satisfied by
 * construction this way, not by anything reactive.
 */
export function AppShell() {
  const { assetsWidth, propertiesWidth, startAssetsDrag, startPropertiesDrag } =
    useResizablePanels()
  const { onDragOver, onDrop } = useAssetDrop()
  const isNarrow = useIsNarrowViewport()
  const assetsOpen = useDrawerStore((s) => s.assetsOpen)
  const closeAssetsDrawer = useDrawerStore((s) => s.closeAssets)
  const propertiesOpen = useDrawerStore((s) => s.propertiesOpen)
  const closePropertiesDrawer = useDrawerStore((s) => s.closeProperties)
  const assetsRef = useRef<HTMLDivElement>(null)
  const propertiesRef = useRef<HTMLDivElement>(null)
  useGlobalShortcuts()
  useUnsavedChangesWarning()
  useDismissHintOnFirstInteraction()

  // Outside-click/Escape-to-close (§28's verification loop names both as
  // acceptable) — the exact same dismissal mechanism `M8.1`'s context
  // menu and every toolbar `Dropdown` already use, reused rather than
  // reimplemented. A no-op whenever not narrow or already closed.
  useDismissableMenu(isNarrow && assetsOpen, closeAssetsDrawer, assetsRef)
  useDismissableMenu(isNarrow && propertiesOpen, closePropertiesDrawer, propertiesRef)

  // `M8.5`/§29's keyboard walkthrough: opening a drawer must move focus
  // into it — the drawer wrapper itself (`tabIndex={-1}` below) is the
  // focus target, a standard accessible-drawer/dialog pattern, so a
  // screen reader announces entering the region and the very next `Tab`
  // reaches the panel's own first control.
  useEffect(() => {
    if (isNarrow && assetsOpen) assetsRef.current?.focus()
  }, [isNarrow, assetsOpen])
  useEffect(() => {
    if (isNarrow && propertiesOpen) propertiesRef.current?.focus()
  }, [isNarrow, propertiesOpen])

  const assetsClassName = isNarrow
    ? `${styles.drawer} ${styles.assetsDrawer}${assetsOpen ? ` ${styles.drawerOpen}` : ''}`
    : styles.assets
  const propertiesClassName = isNarrow
    ? `${styles.drawer} ${styles.propertiesDrawer}${propertiesOpen ? ` ${styles.drawerOpen}` : ''}`
    : styles.properties

  return (
    <div className={styles.shell} onDragOver={onDragOver} onDrop={onDrop}>
      <Toolbar />

      <div className={styles.body}>
        <div
          ref={assetsRef}
          className={assetsClassName}
          style={!isNarrow ? { width: assetsWidth } : undefined}
          aria-hidden={isNarrow && !assetsOpen}
          tabIndex={isNarrow ? -1 : undefined}
        >
          <AssetLibraryPanel />
        </div>
        {!isNarrow && <ResizeHandle label="Resize assets panel" onMouseDown={startAssetsDrag} />}

        <ViewportRegion />

        {!isNarrow && <ResizeHandle label="Resize properties panel" onMouseDown={startPropertiesDrag} />}
        <div
          ref={propertiesRef}
          className={propertiesClassName}
          style={!isNarrow ? { width: propertiesWidth } : undefined}
          aria-hidden={isNarrow && !propertiesOpen}
          tabIndex={isNarrow ? -1 : undefined}
        >
          <div className={styles.hierarchySlot}>
            <SceneHierarchyPanel />
          </div>
          <div className={styles.propertiesSlot}>
            <PropertiesPanel />
          </div>
        </div>
      </div>

      <TransportBar />
      <MyScenesPanel />
      <ShareLinkStatusOverlay />
      <ObjectContextMenu />
    </div>
  )
}
