import { AlertTriangle, X } from 'lucide-react'
import { useExportStore } from '../../state/exportScene'
import { Button, IconButton } from '../ui'
import styles from './Toolbar.module.css'

/**
 * `M7.1`/§25/D15: Export never mutates the draft or the server — a
 * failed asset fetch (the only network step Export ever makes) just
 * leaves `useExportStore` in `'error'`, exactly the retryable-inline-
 * error shape `SaveErrorBanner` (`M6.8`) already established. A second,
 * separate banner rather than folding into `SaveErrorBanner` — the two
 * failures are unrelated operations (Export never touches `saveStatus`,
 * Save never touches this store) and showing both at once must stay
 * possible.
 */
export function ExportErrorBanner() {
  const status = useExportStore((s) => s.status)
  const errorMessage = useExportStore((s) => s.errorMessage)
  const exportScene = useExportStore((s) => s.exportScene)
  const dismissError = useExportStore((s) => s.dismissError)

  if (status !== 'error') return null

  return (
    <div className={styles.saveError} role="alert">
      <AlertTriangle size={16} aria-hidden />
      <span>{errorMessage}</span>
      <Button onClick={() => exportScene()} className={styles.saveErrorRetry}>
        Retry
      </Button>
      <IconButton label="Dismiss" icon={<X size={14} aria-hidden />} onClick={dismissError} />
    </div>
  )
}
