import { AlertTriangle, X } from 'lucide-react'
import { useImportStore } from '../../state/importStore'
import { IconButton } from '../ui'
import styles from './Toolbar.module.css'

/**
 * `M7.2`/§25/§27: a rejected Import (invalid JSON, missing fields,
 * unsupported `schemaVersion`, a dangling asset reference) never touches
 * the current draft — this banner is purely the visible surface for
 * that rejection. No Retry button (unlike `SaveErrorBanner`/
 * `ExportErrorBanner`) — there is nothing to retry against; the file
 * itself is what failed, so the only useful next step is picking a
 * different one via the File menu's Import action again.
 */
export function ImportErrorBanner() {
  const status = useImportStore((s) => s.status)
  const errorMessage = useImportStore((s) => s.errorMessage)
  const dismissError = useImportStore((s) => s.dismissError)

  if (status !== 'error') return null

  return (
    <div className={styles.saveError} role="alert">
      <AlertTriangle size={16} aria-hidden />
      <span>{errorMessage}</span>
      <IconButton label="Dismiss" icon={<X size={14} aria-hidden />} onClick={dismissError} />
    </div>
  )
}
