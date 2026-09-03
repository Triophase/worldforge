import { useSimulationStore } from '../../state/simulationStore'
import styles from './Timeline.module.css'

function formatElapsed(seconds: number): string {
  const [whole, fraction] = seconds.toFixed(2).split('.')
  return `${whole.padStart(2, '0')}.${fraction}s`
}

/**
 * D30/idea.md §17: a non-interactive display of elapsed *simulated* time
 * since the current Play started (`simulationStore.elapsed`, accumulated
 * by `SimulationStepper` — scaled by the selected speed, M3.5). A plain
 * `<span>` with no click/drag handlers of any kind, so the "clicking or
 * dragging has no effect" rule is structural, not a guarded no-op. No
 * fixed end time or cap; frozen while `paused` and reset to `0s` on
 * Reset are both just consequences of reading `elapsed` as-is — this
 * component has no logic of its own beyond formatting.
 */
export function Timeline() {
  const elapsed = useSimulationStore((s) => s.elapsed)
  return <span className={styles.time}>{formatElapsed(elapsed)}</span>
}
