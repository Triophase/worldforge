import { Boxes, Play, RotateCcw, SlidersHorizontal } from 'lucide-react'
import type { ChangeEvent } from 'react'
import { useEffect, useRef } from 'react'
import { useIsNarrowViewport } from '../../app/useIsNarrowViewport'
import type { CameraPreset } from '../../state/cameraViewStore'
import { useCameraViewStore } from '../../state/cameraViewStore'
import { confirmDiscard, loadDemoScene, newScene, serializeDraft } from '../../state/draftStore'
import type { SceneJSON } from '../../state/draftStore'
import { useDrawerStore } from '../../state/drawerStore'
import { useExportStore } from '../../state/exportScene'
import { useHistoryStore } from '../../state/historyStore'
import { useImportStore } from '../../state/importStore'
import { usePersistenceStore } from '../../state/persistenceStore'
import { useRenderModeStore } from '../../state/renderModeStore'
import { Button, Dropdown, IconButton, Tooltip } from '../../components/ui'
import { BOUNCING_BALL_DEMO } from '../../demos/bouncingBall'
import { FALLING_BOX_DEMO } from '../../demos/fallingBox'
import { ROBOTIC_ARM_DEMO } from '../../demos/roboticArm'
import { ROTATING_WHEEL_DEMO } from '../../demos/rotatingWheel'
import { SLIDER_DEMO } from '../../demos/slider'
import { ExportErrorBanner } from './ExportErrorBanner'
import { ImportErrorBanner } from './ImportErrorBanner'
import { SaveErrorBanner } from './SaveErrorBanner'
import { SceneNameEditor } from './SceneNameEditor'
import { SharePopover } from './SharePopover'
import { modifierKeyLabel } from '../../utils/platform'
import styles from './Toolbar.module.css'

const PRESETS: { preset: CameraPreset; label: string }[] = [
  { preset: 'front', label: 'Front' },
  { preset: 'back', label: 'Back' },
  { preset: 'left', label: 'Left' },
  { preset: 'right', label: 'Right' },
  { preset: 'top', label: 'Top' },
  { preset: 'bottom', label: 'Bottom' },
  { preset: 'isometric', label: 'Isometric' },
]

/** §17: all five demos, side by side (`M4.6`'s task — the File menu is the one surface where every demo coexists; the empty state's own 3-slot layout, §24, only ever wanted a subset). */
const DEMOS: { scene: SceneJSON; label: string }[] = [
  { scene: FALLING_BOX_DEMO, label: 'Falling Box' },
  { scene: BOUNCING_BALL_DEMO, label: 'Bouncing Ball' },
  { scene: ROTATING_WHEEL_DEMO, label: 'Rotating Wheel' },
  { scene: ROBOTIC_ARM_DEMO, label: 'Robotic Arm' },
  { scene: SLIDER_DEMO, label: 'Slider' },
]

/**
 * The top toolbar (idea.md §3). File's New Scene (M2.10) and demo entries
 * (M3.6) both guard through `confirmDiscard` before replacing the draft
 * — a demo load is exactly as draft-discarding as New Scene, per D26's
 * own "subject to the same unsaved-changes warning" wording. Save (D8/D9
 * relabeling) and Load (`M6.5`, opens `MyScenesPanel`, gated by the same
 * `confirmDiscard`) are real as of `M6.5`; Export (`M7.1`) downloads the
 * current in-editor state as a self-contained `.json` (§27), available
 * regardless of save state; Import (`M7.2`) reads a picked `.json` back
 * in as a fresh, unowned draft (D26/D9), gated by the same `confirmDiscard`
 * as a demo switch — but only once the file itself has validated (§27:
 * a rejected file must never even ask). Edit's Undo/Redo (M2.9) drive `historyStore`,
 * disabled per stack emptiness. View's camera-preset/projection-toggle
 * entries are M1.3's content; the solid/wireframe entry is M1.4's.
 * Play/Reset stay disabled pending M3.4 wiring these specific
 * (Toolbar-local) buttons — see `AGENT.md`'s note on the separate
 * `TransportBar` pair that *is* wired.
 */
export function Toolbar() {
  const projection = useCameraViewStore((s) => s.projection)
  const requestPreset = useCameraViewStore((s) => s.requestPreset)
  const toggleProjection = useCameraViewStore((s) => s.toggleProjection)
  const renderMode = useRenderModeStore((s) => s.mode)
  const toggleRenderMode = useRenderModeStore((s) => s.toggleMode)
  const canUndo = useHistoryStore((s) => s.undoStack.length > 0)
  const canRedo = useHistoryStore((s) => s.redoStack.length > 0)
  const undo = useHistoryStore((s) => s.undo)
  const redo = useHistoryStore((s) => s.redo)
  const sceneId = usePersistenceStore((s) => s.sceneId)
  const isOwner = usePersistenceStore((s) => s.isOwner)
  const saveStatus = usePersistenceStore((s) => s.saveStatus)
  const save = usePersistenceStore((s) => s.save)
  const openMyScenesPanel = usePersistenceStore((s) => s.openMyScenesPanel)
  const exportStatus = useExportStore((s) => s.status)
  const exportScene = useExportStore((s) => s.exportScene)
  const importStatus = useImportStore((s) => s.status)
  const importFile = useImportStore((s) => s.importFile)
  const importInputRef = useRef<HTMLInputElement>(null)
  const isNarrow = useIsNarrowViewport()
  const assetsDrawerOpen = useDrawerStore((s) => s.assetsOpen)
  const toggleAssetsDrawer = useDrawerStore((s) => s.toggleAssets)
  const propertiesDrawerOpen = useDrawerStore((s) => s.propertiesOpen)
  const togglePropertiesDrawer = useDrawerStore((s) => s.toggleProperties)
  const assetsTriggerRef = useRef<HTMLButtonElement>(null)
  const propertiesTriggerRef = useRef<HTMLButtonElement>(null)
  const wasAssetsOpen = useRef(assetsDrawerOpen)
  const wasPropertiesOpen = useRef(propertiesDrawerOpen)

  // `M8.5`/§29's keyboard walkthrough: closing a drawer (Escape, or the
  // trigger toggled again) must return focus somewhere sensible, not
  // leave it stranded on a now-hidden child inside the closed drawer.
  // The trigger that opened it is the natural target — the same pattern
  // any accessible modal/drawer implementation uses.
  useEffect(() => {
    if (wasAssetsOpen.current && !assetsDrawerOpen) assetsTriggerRef.current?.focus()
    wasAssetsOpen.current = assetsDrawerOpen
  }, [assetsDrawerOpen])
  useEffect(() => {
    if (wasPropertiesOpen.current && !propertiesDrawerOpen) propertiesTriggerRef.current?.focus()
    wasPropertiesOpen.current = propertiesDrawerOpen
  }, [propertiesDrawerOpen])

  // D8/D9: "Save" only once the draft has a server id it's the current
  // owner of; otherwise this same button forks/first-saves via `POST`.
  const canOverwrite = sceneId !== null && isOwner
  const saveLabel = saveStatus === 'saving' ? 'Saving…' : canOverwrite ? 'Save' : 'Save as new scene'
  // D8: a scene with a server id this device doesn't own — opened via
  // someone else's link (`M6.6`). The sandbox itself stays fully
  // interactive; this banner is the one visible sign anything's
  // different, alongside the Save button's own relabeling above.
  const isNonOwnerSandbox = sceneId !== null && !isOwner

  function handleNewScene() {
    confirmDiscard(newScene)
  }

  function handleLoadDemo(scene: SceneJSON) {
    confirmDiscard(() => loadDemoScene(scene))
  }

  function handleSave() {
    save(serializeDraft())
  }

  function handleLoad() {
    confirmDiscard(openMyScenesPanel)
  }

  function handleExport() {
    exportScene()
  }

  function handleImportClick() {
    importInputRef.current?.click()
  }

  function handleImportFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) importFile(file)
    e.target.value = '' // lets the same file be re-picked later (matches useFileUpload's own convention)
  }

  // Extracted so `M8.4`'s narrow-width layout can nest the exact same
  // `Dropdown` one level deeper (behind a "More" trigger) instead of
  // duplicating its items.
  const viewMenu = (
    <Dropdown trigger="View">
      <div className={styles.viewMenu}>
        {PRESETS.map(({ preset, label }) => (
          <Button key={preset} className={styles.menuItem} onClick={() => requestPreset(preset)}>
            {label}
          </Button>
        ))}
        <Button className={styles.menuItem} onClick={toggleProjection}>
          {projection === 'perspective' ? 'Switch to Orthographic' : 'Switch to Perspective'}
        </Button>
        <Button className={styles.menuItem} onClick={toggleRenderMode}>
          {renderMode === 'solid' ? 'Wireframe' : 'Solid'}
        </Button>
      </div>
    </Dropdown>
  )

  return (
    <header className={styles.toolbar}>
      <span className={styles.title}>Worldforge</span>
      <SceneNameEditor />
      {isNonOwnerSandbox && (
        <span className={styles.nonOwnerBanner} role="status">
          Viewing someone else's scene — use "Save as new scene" to keep changes
        </span>
      )}
      <SaveErrorBanner />
      <ExportErrorBanner />
      <ImportErrorBanner />

      <nav className={styles.menus}>
        <Dropdown trigger="File">
          <div className={styles.viewMenu}>
            <Button className={styles.menuItem} onClick={handleNewScene}>
              New Scene
            </Button>
            <Button className={styles.menuItem} onClick={handleSave} disabled={saveStatus === 'saving'}>
              {saveLabel}
            </Button>
            <Button className={styles.menuItem} onClick={handleLoad}>
              Load
            </Button>
            <Button className={styles.menuItem} onClick={handleExport} disabled={exportStatus === 'exporting'}>
              {exportStatus === 'exporting' ? 'Exporting…' : 'Export Scene'}
            </Button>
            <Button className={styles.menuItem} onClick={handleImportClick} disabled={importStatus === 'importing'}>
              {importStatus === 'importing' ? 'Importing…' : 'Import Scene'}
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              onChange={handleImportFileChange}
              hidden
              aria-hidden
            />
            {DEMOS.map(({ scene, label }) => (
              <Button key={label} className={styles.menuItem} onClick={() => handleLoadDemo(scene)}>
                {label}
              </Button>
            ))}
          </div>
        </Dropdown>
        <Dropdown trigger="Edit">
          <div className={styles.viewMenu}>
            <Tooltip label={`Undo (${modifierKeyLabel()}+Z)`}>
              <Button className={styles.menuItem} onClick={undo} disabled={!canUndo}>
                Undo
              </Button>
            </Tooltip>
            <Tooltip label={`Redo (${modifierKeyLabel()}+Shift+Z)`}>
              <Button className={styles.menuItem} onClick={redo} disabled={!canRedo}>
                Redo
              </Button>
            </Tooltip>
          </div>
        </Dropdown>
        {isNarrow ? (
          // §28: at a narrow width, the View menu moves behind one extra
          // "More" click rather than sitting directly in the toolbar —
          // the one lower-priority item group this task collapses (a
          // free implementation choice; §28 doesn't enumerate which).
          // Still the exact same `Dropdown`, same items, fully functional.
          <Dropdown trigger="More">
            <div className={styles.viewMenu}>{viewMenu}</div>
          </Dropdown>
        ) : (
          viewMenu
        )}
      </nav>

      {isNarrow && (
        <div className={styles.drawerTriggers}>
          <IconButton
            ref={assetsTriggerRef}
            label="Assets"
            icon={<Boxes size={16} aria-hidden />}
            aria-expanded={assetsDrawerOpen}
            onClick={toggleAssetsDrawer}
          />
          <IconButton
            ref={propertiesTriggerRef}
            label="Properties"
            icon={<SlidersHorizontal size={16} aria-hidden />}
            aria-expanded={propertiesDrawerOpen}
            onClick={togglePropertiesDrawer}
          />
        </div>
      )}

      <div className={styles.transport}>
        <SharePopover />
        <IconButton label="Play" icon={<Play size={16} aria-hidden />} disabled />
        <IconButton label="Reset" icon={<RotateCcw size={16} aria-hidden />} disabled />
      </div>
    </header>
  )
}
