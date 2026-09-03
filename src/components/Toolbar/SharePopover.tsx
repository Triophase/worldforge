import { Check, Copy, Share2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { usePersistenceStore } from '../../state/persistenceStore'
import { Button, IconButton } from '../ui'
import { useDismissableMenu } from '../ui/useDismissableMenu'
import styles from './SharePopover.module.css'

/** §22's own 150-250ms eased range covers the toggle transition; the "Copied" confirmation itself reverts after a plain, slightly longer pause so it's actually readable. */
const COPIED_RESET_MS = 1500

/**
 * D32/D13: the Share icon surfaces the scene's already-existing `id`
 * (from `M6.5`'s first Save) as a `/scene/:id` URL — no new link is
 * created, no backend call happens here at all. **Enabled once the
 * scene has a server id, regardless of ownership** — a non-owner
 * viewing someone else's shared scene can still re-share that same
 * link (D32 doesn't restrict this to owners; only overwriting Save is
 * owner-gated, per `M6.6`). Deliberately a bespoke small popover rather
 * than reusing `Dropdown` — `Dropdown` always wraps its `trigger` in its
 * own plain `<Button>`, which can't cleanly host an icon-only
 * `IconButton` (accessible label + tooltip + focus ring, §29) without
 * nesting two `<button>` elements. Outside-click/`Escape` dismissal now
 * goes through the same shared `useDismissableMenu` hook every
 * `Dropdown` and `M8.1`'s context menu use (`M8.5` fix — this popover
 * predated that shared mechanism and had its own independent Escape
 * listener, which meant pressing Escape to close it also fell through
 * to `M8.2`'s global shortcut handler and incorrectly cleared the
 * current selection too, since this popover was never registered in
 * `dismissableMenuStore`'s open count).
 */
export function SharePopover() {
  const sceneId = usePersistenceStore((s) => s.sceneId)
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useDismissableMenu(open, () => setOpen(false), rootRef)

  if (!sceneId) {
    return <IconButton label="Share" icon={<Share2 size={16} aria-hidden />} disabled />
  }

  const url = `${window.location.origin}/scene/${sceneId}`

  function handleCopy() {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), COPIED_RESET_MS)
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <IconButton
        label="Share"
        icon={<Share2 size={16} aria-hidden />}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div className={styles.popover} role="dialog" aria-label="Share this scene">
          <input className={styles.linkInput} readOnly value={url} onFocus={(e) => e.currentTarget.select()} aria-label="Shareable link" />
          <Button onClick={handleCopy} className={styles.copyButton}>
            {copied ? (
              <>
                <Check size={14} aria-hidden /> Copied
              </>
            ) : (
              <>
                <Copy size={14} aria-hidden /> Copy
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
