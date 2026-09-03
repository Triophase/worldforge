import {
  Box,
  Bot,
  Circle,
  Cone,
  Cylinder,
  Disc,
  FileBox,
  MoveHorizontal,
  Package,
  Pill,
  RectangleHorizontal,
  Ruler,
  TriangleRight,
} from 'lucide-react'
import type { DragEvent } from 'react'
import { useMemo, useState } from 'react'
import { listBuiltinAssets } from '../../assets'
import { ROBOT_ARM_ASSEMBLY } from '../../assets/assemblies'
import { getBottomOffsetY, getUploadedBottomOffsetY } from '../../assets/placement'
import { Button, Panel } from '../../components/ui'
import { recordedAddObject, recordedInsertRobotArmAssembly, recordedPlaceUploadedAsset } from '../../state/historyStore'
import { useSceneStore } from '../../state/sceneStore'
import { useUploadedAssetsStore } from '../../state/uploadedAssetsStore'
import { useFileUpload } from './useFileUpload'
import { UploadStatus } from './UploadStatus'
import styles from './AssetLibraryPanel.module.css'

const CATEGORIES = ['All', 'Basic Shapes', 'Mechanical', 'Assemblies', 'Uploaded'] as const
type Category = (typeof CATEGORIES)[number]

/** Minimal icon glyph per key — not a live 3D thumbnail (D33's reasoning applies here too). */
const ICONS: Record<string, typeof Box> = {
  'primitive:cube': Box,
  'primitive:sphere': Circle,
  'primitive:cylinder': Cylinder,
  'primitive:cone': Cone,
  'primitive:capsule': Pill,
  'mechanical:box': Package,
  'mechanical:beam': Ruler,
  'mechanical:wheel': Disc,
  'mechanical:axle': MoveHorizontal,
  'mechanical:platform': RectangleHorizontal,
  'mechanical:ramp': TriangleRight,
}

/** Drag payload MIME type carrying the asset's registry key (M2.3's drag-to-place). */
export const ASSET_DRAG_MIME = 'application/x-cad-simulator-asset-key'

/**
 * The Assets panel (idea.md §10): searchable, category-filterable grid of
 * every M2.2 built-in. Click-to-add and drag-to-place both call the same
 * placement math (`assets/placement.ts`) that `ViewportRegion`'s drop
 * handler also uses for the ground-plane-raycast case. The search input's
 * `id="asset-library-search"` is `EmptyState.tsx`'s (M3.7) "+ Add Asset"
 * focus target — the panel itself is always visible (no collapsed state
 * to expand), so "open/focus the Asset Library" means moving DOM focus
 * here.
 */
export function AssetLibraryPanel() {
  const [category, setCategory] = useState<Category>('All')
  const [search, setSearch] = useState('')
  const select = useSceneStore((s) => s.select)
  const uploads = useUploadedAssetsStore((s) => s.uploads)
  const upload = useFileUpload()

  const query = search.trim().toLowerCase()

  const cards = useMemo(() => {
    if (category === 'Assemblies' || category === 'Uploaded') return []

    const all = listBuiltinAssets()
    const byCategory =
      category === 'Basic Shapes'
        ? all.filter((d) => d.category === 'primitive')
        : category === 'Mechanical'
          ? all.filter((d) => d.category === 'mechanical')
          : all

    return query ? byCategory.filter((d) => d.displayName.toLowerCase().includes(query)) : byCategory
  }, [category, query])

  // D20/M4.7: the one Assembly, shown in its own category and in "All" —
  // never in the generic `cards` list above, since it inserts multiple
  // objects/joints, not a single `BuiltinAssetDefinition`.
  const showAssemblyCard =
    (category === 'All' || category === 'Assemblies') &&
    (!query || ROBOT_ARM_ASSEMBLY.displayName.toLowerCase().includes(query))

  // M5.7: every successfully parsed upload, shown in both "All" (matching
  // the Assembly's own precedent above) and its own category — §10's
  // "asset type name" for an upload is its source filename, extension
  // stripped.
  const uploadCards = useMemo(() => {
    if (category !== 'All' && category !== 'Uploaded') return []
    const withLabel = uploads.map((u) => ({ id: u.id, label: u.filename.replace(/\.[^./]+$/, '') }))
    return query ? withLabel.filter((u) => u.label.toLowerCase().includes(query)) : withLabel
  }, [category, query, uploads])

  function handleClickAdd(key: string, displayName: string) {
    const y = getBottomOffsetY(key)
    const object = recordedAddObject({ kind: 'builtin', key }, displayName, { position: [0, y, 0] })
    if (object) select(object.id) // D2: refused (returns undefined) while the simulation isn't idle.
  }

  function handleClickAddAssembly() {
    const objects = recordedInsertRobotArmAssembly([0, 0, 0])
    if (objects) select(objects[0].id) // Base — D2: refused (returns undefined) while the simulation isn't idle.
  }

  function handleClickAddUpload(uploadId: string) {
    const record = useUploadedAssetsStore.getState().uploads.find((u) => u.id === uploadId)
    if (!record) return
    const y = getUploadedBottomOffsetY(record.object, record.unitScale)
    const object = recordedPlaceUploadedAsset(uploadId, [0, y, 0])
    if (object) select(object.id) // D2: refused (returns undefined) while the simulation isn't idle.
  }

  function handleDragStart(e: DragEvent<HTMLButtonElement>, key: string) {
    e.dataTransfer.setData(ASSET_DRAG_MIME, key)
    e.dataTransfer.effectAllowed = 'copy'
  }

  const isEmptyCategory =
    (category === 'Assemblies' && !showAssemblyCard) || (category === 'Uploaded' && uploadCards.length === 0)

  return (
    <Panel className={styles.panel} role="region" aria-label="Assets">
      <input
        id="asset-library-search"
        className={styles.search}
        type="search"
        placeholder="Search assets..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search assets"
      />

      <input
        ref={upload.inputRef}
        type="file"
        accept={upload.accept}
        onChange={upload.onChange}
        hidden
        aria-hidden
      />
      <Button onClick={upload.trigger} className={styles.uploadButton}>
        + Upload Asset
      </Button>

      <UploadStatus onRetry={upload.trigger} />

      <div className={styles.categories} role="tablist">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={category === c}
            className={category === c ? styles.categoryActive : styles.category}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {isEmptyCategory ? (
        <p className={styles.empty}>Nothing here yet.</p>
      ) : (
        <div className={styles.grid}>
          {showAssemblyCard && (
            <button
              type="button"
              className={styles.card}
              draggable
              onDragStart={(e) => handleDragStart(e, ROBOT_ARM_ASSEMBLY.key)}
              onClick={handleClickAddAssembly}
            >
              <Bot size={28} aria-hidden />
              <span className={styles.cardLabel}>{ROBOT_ARM_ASSEMBLY.displayName}</span>
            </button>
          )}
          {cards.map((definition) => {
            const Icon = ICONS[definition.key] ?? Box
            return (
              <button
                key={definition.key}
                type="button"
                className={styles.card}
                draggable
                onDragStart={(e) => handleDragStart(e, definition.key)}
                onClick={() => handleClickAdd(definition.key, definition.displayName)}
              >
                <Icon size={28} aria-hidden />
                <span className={styles.cardLabel}>{definition.displayName}</span>
              </button>
            )
          })}
          {uploadCards.map((upload) => (
            <button
              key={upload.id}
              type="button"
              className={styles.card}
              draggable
              onDragStart={(e) => handleDragStart(e, upload.id)}
              onClick={() => handleClickAddUpload(upload.id)}
            >
              <FileBox size={28} aria-hidden />
              <span className={styles.cardLabel}>{upload.label}</span>
            </button>
          ))}
        </div>
      )}
    </Panel>
  )
}
