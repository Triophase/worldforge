import { Move, MousePointer2, RotateCw, Scale } from 'lucide-react'
import { IconButton } from '../../components/ui'
import type { GizmoMode } from '../../state/gizmoModeStore'
import { useGizmoModeStore } from '../../state/gizmoModeStore'
import styles from './GizmoModeToolbar.module.css'

const MODES: { mode: GizmoMode; label: string; key: string; icon: typeof Move }[] = [
  { mode: 'select', label: 'Select', key: 'Q', icon: MousePointer2 },
  { mode: 'translate', label: 'Translate', key: 'W', icon: Move },
  { mode: 'rotate', label: 'Rotate', key: 'E', icon: RotateCw },
  { mode: 'scale', label: 'Scale', key: 'R', icon: Scale },
]

/**
 * On-screen equivalent of D24's Q/W/E/R gizmo-mode shortcuts (idea.md §30:
 * everything the keyboard can do must also be reachable without it).
 * Floats over the top-left of the viewport — pure UI/session state
 * (`gizmoModeStore`), never scene-graph state.
 */
export function GizmoModeToolbar() {
  const mode = useGizmoModeStore((s) => s.mode)
  const setMode = useGizmoModeStore((s) => s.setMode)

  return (
    <div className={styles.toolbar} role="group" aria-label="Transform mode">
      {MODES.map(({ mode: m, label, key, icon: Icon }) => (
        <IconButton
          key={m}
          label={`${label} (${key})`}
          icon={<Icon size={16} aria-hidden />}
          aria-pressed={mode === m}
          className={styles.button}
          onClick={() => setMode(m)}
        />
      ))}
    </div>
  )
}
