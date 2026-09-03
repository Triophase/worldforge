import { useFileUpload } from '../AssetLibrary/useFileUpload'
import { BOUNCING_BALL_DEMO } from '../../demos/bouncingBall'
import { FALLING_BOX_DEMO } from '../../demos/fallingBox'
import { ROTATING_WHEEL_DEMO } from '../../demos/rotatingWheel'
import { confirmDiscard, loadDemoScene } from '../../state/draftStore'
import { Button } from '../ui'
import styles from './EmptyState.module.css'

/** idea.md §24's fixed three-shortcut layout — the other two demos (Robotic Arm, Slider, `M4.6`) are File-menu-only, not part of this slot count. */
const DEMO_SHORTCUTS = [
  { label: 'Falling Box', scene: FALLING_BOX_DEMO },
  { label: 'Bouncing Ball', scene: BOUNCING_BALL_DEMO },
  { label: 'Rotating Wheel', scene: ROTATING_WHEEL_DEMO },
]

/**
 * The "+ Add Asset / Upload CAD / try a demo" action row — factored out
 * of `EmptyState.tsx` (`M3.7`) so `M6.5`'s My Scenes empty state can
 * reuse the exact same shortcuts verbatim (its own Scope text: "the
 * same Add Asset/Upload/Demo shortcuts as §23's empty state"), rather
 * than a second hand-copied implementation. `onAction` is optional —
 * the viewport's own `EmptyState` has nothing to do after a shortcut
 * fires, but a caller hosting this inside a modal (My Scenes) needs to
 * close itself once the draft it was listing scenes for has just been
 * replaced.
 */
export function EmptyStateActions({ onAction }: { onAction?: () => void } = {}) {
  const upload = useFileUpload()

  function handleAddAsset() {
    document.getElementById('asset-library-search')?.focus()
    onAction?.()
  }

  function handleDemo(scene: (typeof DEMO_SHORTCUTS)[number]['scene']) {
    confirmDiscard(() => loadDemoScene(scene))
    onAction?.()
  }

  return (
    <>
      <div className={styles.actions}>
        <Button onClick={handleAddAsset}>+ Add Asset</Button>
        <input ref={upload.inputRef} type="file" accept={upload.accept} onChange={upload.onChange} hidden aria-hidden />
        <Button onClick={upload.trigger}>Upload CAD</Button>
      </div>
      <div className={styles.demos}>
        <span className={styles.demosLabel}>Or try a demo:</span>
        {DEMO_SHORTCUTS.map(({ label, scene }) => (
          <Button key={label} onClick={() => handleDemo(scene)}>
            {label}
          </Button>
        ))}
      </div>
    </>
  )
}
