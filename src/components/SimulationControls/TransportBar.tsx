import { Pause, Play, RotateCcw } from 'lucide-react'
import { Timeline } from '../../components/Timeline/Timeline'
import { Button, IconButton } from '../../components/ui'
import { SIMULATION_SPEEDS, useSimulationStore } from '../../state/simulationStore'
import { FirstTimeHint } from './FirstTimeHint'
import styles from './TransportBar.module.css'

/**
 * Bottom transport bar (idea.md §16/§17). Play/Pause/Reset (M3.4) drive
 * `simulationStore`'s `idle → playing ⇄ paused → idle` state machine.
 * Speed (M3.5) is **never** gated on `phase` — D2's edit lock doesn't
 * cover it, and changing it mid-`playing` taking effect immediately
 * (§16) is the whole point. `Timeline` (`components/Timeline/`, per
 * spec §32's file layout) owns the elapsed-time display itself.
 * `FirstTimeHint` (`M3.7`, §18) renders nothing once dismissed or
 * outside a first-ever visit.
 */
export function TransportBar() {
  const phase = useSimulationStore((s) => s.phase)
  const play = useSimulationStore((s) => s.play)
  const pause = useSimulationStore((s) => s.pause)
  const reset = useSimulationStore((s) => s.reset)
  const speed = useSimulationStore((s) => s.speed)
  const setSpeed = useSimulationStore((s) => s.setSpeed)

  return (
    <footer className={styles.bar}>
      <div className={styles.transport}>
        <IconButton
          label="Play"
          shortcut="Space"
          className={styles.playPauseButton}
          icon={<Play size={16} aria-hidden />}
          onClick={play}
          disabled={phase === 'playing'}
        />
        <IconButton
          label="Pause"
          shortcut="Space"
          className={styles.playPauseButton}
          icon={<Pause size={16} aria-hidden />}
          onClick={pause}
          disabled={phase !== 'playing'}
        />
        <IconButton
          label="Reset"
          icon={<RotateCcw size={16} aria-hidden />}
          onClick={reset}
          disabled={phase === 'idle'}
        />
      </div>

      <Timeline />
      <FirstTimeHint />

      <div className={styles.speeds}>
        {SIMULATION_SPEEDS.map((value) => (
          <Button
            key={value}
            aria-pressed={speed === value}
            className={styles.speedButton}
            onClick={() => setSpeed(value)}
          >
            {value}x
          </Button>
        ))}
      </div>
    </footer>
  )
}
