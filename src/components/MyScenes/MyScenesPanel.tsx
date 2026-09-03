import { X } from 'lucide-react'
import { useState } from 'react'
import { openSavedScene } from '../../state/draftStore'
import { usePersistenceStore } from '../../state/persistenceStore'
import { Button, IconButton, Panel } from '../ui'
import { EmptyStateActions } from '../Viewport/EmptyStateActions'
import styles from './MyScenesPanel.module.css'

interface RowError {
  id: string
  action: 'open' | 'delete'
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString()
}

/**
 * §26/D33's My Scenes panel — a modal overlay (blocks the rest of the
 * app while open, so an Open/Delete row action never needs its own
 * separate D4 guard: `Toolbar`'s "Load" button already ran
 * `confirmDiscard` before this ever opens, and nothing else can dirty
 * the draft while a modal is up). Name + last-updated time only, no
 * thumbnail/preview of any kind (D33) — resist adding one later.
 */
export function MyScenesPanel() {
  const isOpen = usePersistenceStore((s) => s.myScenesOpen)
  const scenes = usePersistenceStore((s) => s.myScenes)
  const status = usePersistenceStore((s) => s.listStatus)
  const close = usePersistenceStore((s) => s.closeMyScenesPanel)
  const openMyScenesPanel = usePersistenceStore((s) => s.openMyScenesPanel)
  const deleteScene = usePersistenceStore((s) => s.deleteScene)
  const [rowError, setRowError] = useState<RowError | null>(null)

  if (!isOpen) return null

  async function handleOpen(id: string) {
    setRowError(null)
    const ok = await openSavedScene(id)
    if (ok) close()
    else setRowError({ id, action: 'open' }) // D15: leaves whatever was already loaded untouched — this panel just reports the failure.
  }

  async function handleDelete(id: string) {
    setRowError(null)
    const ok = await deleteScene(id)
    if (!ok) setRowError({ id, action: 'delete' })
  }

  return (
    <div className={styles.backdrop} onClick={close}>
      <Panel
        className={styles.panel}
        role="dialog"
        aria-label="My Scenes"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 className={styles.title}>My Scenes</h2>
          <IconButton label="Close" icon={<X size={16} aria-hidden />} onClick={close} />
        </div>

        {status === 'loading' && <p className={styles.status}>Loading…</p>}
        {status === 'error' && (
          <div className={styles.status} role="alert">
            <p>Couldn't reach the server to load your scenes.</p>
            <Button onClick={openMyScenesPanel}>Retry</Button>
          </div>
        )}

        {status !== 'loading' && status !== 'error' && scenes !== null && scenes.length === 0 && (
          <div className={styles.empty}>
            <p className={styles.status}>You haven't saved any scenes yet.</p>
            <EmptyStateActions onAction={close} />
          </div>
        )}

        {status !== 'loading' && status !== 'error' && scenes !== null && scenes.length > 0 && (
          <ul className={styles.list}>
            {scenes.map((scene) => (
              <li key={scene.id} className={styles.row}>
                <div className={styles.rowInfo}>
                  <span className={styles.rowName}>{scene.name}</span>
                  <span className={styles.rowTimestamp}>{formatTimestamp(scene.updatedAt)}</span>
                  {rowError?.id === scene.id && (
                    <span className={styles.rowError} role="alert">
                      Couldn't {rowError.action === 'open' ? 'open' : 'delete'} this scene — try again.
                    </span>
                  )}
                </div>
                <div className={styles.rowActions}>
                  <Button onClick={() => handleOpen(scene.id)}>Open</Button>
                  <Button onClick={() => handleDelete(scene.id)}>Delete</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  )
}
