import { AlertTriangle, FileWarning, Loader2, MinusCircle } from 'lucide-react'
import type { AssetLoadErrorReason } from '../../loaders/AssetLoader/types'
import { useUploadedAssetsStore } from '../../state/uploadedAssetsStore'
import { Button } from '../ui'
import styles from './UploadStatus.module.css'

/** §29: every error state carries its own icon, never color alone. */
const ERROR_ICONS: Record<AssetLoadErrorReason | 'oversized', typeof AlertTriangle> = {
  oversized: MinusCircle,
  unsupported: FileWarning,
  corrupt: AlertTriangle,
}

/**
 * M5.6: the upload flow's progress/error presentation — mounted once in
 * `AssetLibraryPanel`, reading `uploadedAssetsStore`'s `progress`/
 * `lastUploadError` fields directly (both already final, display-ready
 * values by the time they land here; `AssetLoader.ts`'s `uploadErrorMessage`
 * is the one place a raw loader exception gets mapped away, never this
 * component). Renders nothing while idle (`progress === null` and no
 * error) — an inline panel within the Assets flow, never a blocking modal
 * (§8), so the viewport and rest of the UI stay usable throughout.
 */
export function UploadStatus({ onRetry }: { onRetry: () => void }) {
  const progress = useUploadedAssetsStore((s) => s.progress)
  const error = useUploadedAssetsStore((s) => s.lastUploadError)
  const reason = useUploadedAssetsStore((s) => s.lastUploadErrorReason)

  if (error && reason) {
    const Icon = ERROR_ICONS[reason]
    return (
      <div className={styles.errorPanel} role="alert">
        <Icon size={18} aria-hidden className={styles.errorIcon} />
        <p className={styles.errorMessage}>{error}</p>
        <Button onClick={onRetry}>Try Another File</Button>
      </div>
    )
  }

  if (progress !== null) {
    return (
      <div className={styles.progressPanel}>
        <Loader2 size={16} aria-hidden className={styles.progressIcon} />
        <div
          className={styles.progressTrack}
          role="progressbar"
          aria-label="Uploading"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>
        <span className={styles.progressLabel}>{progress}%</span>
      </div>
    )
  }

  return null
}
