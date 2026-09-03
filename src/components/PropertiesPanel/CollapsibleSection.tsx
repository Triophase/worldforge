import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import styles from './PropertiesPanel.module.css'

/**
 * §19 calls the Transform/Physics/Joint sections "three collapsible
 * sections," but no earlier task (`M2.6`, `M3.2`, `M4.3`) actually built
 * a toggle — each shipped its section as a plain, always-expanded block
 * (`.ai/decisions.md`'s `M8.3` entry). Built here as this task's own
 * prerequisite, since its own acceptance criteria ("expanding or
 * collapsing... animates") are otherwise untestable with nothing to
 * expand or collapse. Local, per-instance state (default expanded) —
 * §19 never describes persisting collapse state across a selection
 * change, so each mount simply starts open. The collapse itself uses a
 * CSS grid-rows transition on `var(--transition-fast)` (200ms, within
 * §22's 150-250ms range) — no JS height measurement needed, and reusing
 * the one shared duration token is what keeps this feeling identical to
 * every other transition in the app (§22's "one consistent easing
 * curve" requirement, satisfied by construction).
 */
export function CollapsibleSection({ title, children }: { title: string; children: ReactNode }) {
  const [open, setOpen] = useState(true)

  return (
    <section className={styles.section} aria-label={title}>
      <button
        type="button"
        className={styles.sectionHeader}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <h3 className={styles.sectionTitle}>{title}</h3>
        <ChevronDown
          size={14}
          aria-hidden
          className={open ? styles.chevron : `${styles.chevron} ${styles.chevronCollapsed}`}
        />
      </button>
      <div className={open ? styles.sectionBody : `${styles.sectionBody} ${styles.sectionBodyCollapsed}`}>
        <div className={styles.sectionBodyInner}>{children}</div>
      </div>
    </section>
  )
}
