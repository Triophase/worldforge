import { useState } from 'react'
import { useSceneStore } from '../../state/sceneStore'
import { useCommitOnBlur } from '../../utils/useCommitOnBlur'
import styles from './Toolbar.module.css'

/**
 * D31: the scene name, edited inline in the toolbar (click to edit,
 * Google-Docs-style) — `M6.5`'s own minimal build of this, since no
 * earlier task built it despite `M6.5`'s task file assuming it exists
 * (see `.ai/decisions.md`'s `M6.5` entry). Reuses `useCommitOnBlur`, the
 * same commit-on-blur/Enter/Escape-reverts contract as the Hierarchy row
 * rename and Properties header Name field (`M2.7`) — not a new pattern.
 */
export function SceneNameEditor() {
  const name = useSceneStore((s) => s.name)
  const renameScene = useSceneStore((s) => s.renameScene)
  const [editing, setEditing] = useState(false)
  const field = useCommitOnBlur(name, renameScene)

  if (editing) {
    return (
      <input
        className={styles.sceneNameInput}
        autoFocus
        aria-label="Scene name"
        value={field.draft}
        onChange={field.onChange}
        onBlur={() => {
          field.onBlur()
          setEditing(false)
        }}
        onKeyDown={(e) => {
          field.onKeyDown(e)
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )
  }

  return (
    <button type="button" className={styles.sceneName} onClick={() => setEditing(true)} aria-label="Rename scene">
      {name}
    </button>
  )
}
