import { openSharedScene } from '../../state/draftStore'
import { usePersistenceStore } from '../../state/persistenceStore'
import { parseShareLinkId } from '../../utils/shareLink'
import { Button, Panel } from '../ui'
import styles from './MyScenesPanel.module.css'

const MESSAGES: Record<'deleted' | 'not-found' | 'error', string> = {
  deleted: 'This scene was deleted by its owner and is no longer available.',
  'not-found': "This link doesn't point to a real scene.",
  error: "Couldn't reach the server to open this link.",
}

/**
 * D17: a `/scene/:id` link that resolves to "deleted" or "never existed"
 * must show an explicit, visibly distinct message for each — never a
 * blank screen, a crash, or one generic error (`M6.6`'s own acceptance
 * criteria). Reuses `MyScenesPanel`'s modal backdrop/panel styling
 * rather than a third visual treatment for "a full-page status
 * message." Dismissing clears `linkOpenStatus` back to `'idle'` and
 * drops the `/scene/:id` path from the URL (via `history.replaceState`)
 * so a reload lands on the ordinary app instead of re-triggering the
 * same failed open.
 */
export function ShareLinkStatusOverlay() {
  const status = usePersistenceStore((s) => s.linkOpenStatus)

  if (status !== 'deleted' && status !== 'not-found' && status !== 'error') return null

  function dismiss() {
    usePersistenceStore.setState({ linkOpenStatus: 'idle' })
    window.history.replaceState(null, '', '/')
  }

  function retry() {
    // D15: `'error'` (unlike `'deleted'`/`'not-found'`) is a
    // connectivity failure, not a real outcome — re-attempting the same
    // id is meaningful, re-derived from the URL since dismiss is the
    // only thing that ever clears it.
    const id = parseShareLinkId(window.location.pathname)
    if (id) openSharedScene(id)
  }

  return (
    <div className={styles.backdrop}>
      <Panel className={styles.panel} role="alertdialog" aria-label="Link unavailable">
        <p className={styles.status}>{MESSAGES[status]}</p>
        <div className={styles.rowActions}>
          {status === 'error' && <Button onClick={retry}>Retry</Button>}
          <Button onClick={dismiss}>Start a New Scene</Button>
        </div>
      </Panel>
    </div>
  )
}
