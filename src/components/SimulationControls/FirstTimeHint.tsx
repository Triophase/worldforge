import { useOnboardingStore } from '../../state/firstTimeStore'
import styles from './FirstTimeHint.module.css'

/**
 * §18: shown once, ever, per browser — dismissed on the very first
 * interaction with any control (`app/useDismissHintOnFirstInteraction.ts`,
 * wired once at the app root, not by this component). Purely a display
 * of `firstTimeStore`'s `showHint` — no dismiss logic lives here.
 */
export function FirstTimeHint() {
  const showHint = useOnboardingStore((s) => s.showHint)
  if (!showHint) return null

  return <span className={styles.hint}>Press Play to start the simulation.</span>
}
