import { AlertTriangle, Ban, X } from 'lucide-react'
import { usePersistenceStore } from '../../state/persistenceStore'
import { Button, IconButton } from '../ui'
import styles from './Toolbar.module.css'

/**
 * D15/M6.8: a failed Save never touches `sceneStore` — the draft stays
 * fully intact and editable, protected by D4's local autosave exactly
 * as if Save had never been attempted (`persistenceStore.save()`'s own
 * `catch` proves this: it only ever calls `set()` on itself). This
 * banner is purely the visible, dismissable, retryable surface for that
 * failure — §25's plain-language convention, an icon per state (§29:
 * not color alone), never a raw network error.
 */
export function SaveErrorBanner() {
  const saveStatus = usePersistenceStore((s) => s.saveStatus)
  const saveErrorMessage = usePersistenceStore((s) => s.saveErrorMessage)
  const retrySave = usePersistenceStore((s) => s.retrySave)
  const dismissSaveError = usePersistenceStore((s) => s.dismissSaveError)

  if (saveStatus !== 'error' && saveStatus !== 'forbidden') return null

  const message =
    saveStatus === 'forbidden'
      ? "You don't have permission to overwrite this scene. Use \"Save as new scene\" instead."
      : // M6.10: a named D11 cap rejection (e.g. "exceeded 200MB") reads more
        // usefully than the generic D15 connectivity message — shown verbatim
        // when `persistUploadedAssetsForSave` set one, same banner otherwise.
        (saveErrorMessage ?? "Couldn't reach the server. Your changes are still here — try again.")

  return (
    <div className={styles.saveError} role="alert">
      {saveStatus === 'forbidden' ? <Ban size={16} aria-hidden /> : <AlertTriangle size={16} aria-hidden />}
      <span>{message}</span>
      {saveStatus === 'error' && (
        <Button onClick={() => retrySave()} className={styles.saveErrorRetry}>
          Retry
        </Button>
      )}
      <IconButton label="Dismiss" icon={<X size={14} aria-hidden />} onClick={dismissSaveError} />
    </div>
  )
}
