import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from './Button'
import { useDismissableMenu } from './useDismissableMenu'
import styles from './Dropdown.module.css'

interface DropdownProps {
  trigger: ReactNode
  children?: ReactNode
}

/** Opens on trigger click; closes on outside click or Escape (`useDismissableMenu`, shared with `M8.1`'s context menu). */
export function Dropdown({ trigger, children }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useDismissableMenu(open, () => setOpen(false), rootRef)

  return (
    <div className={styles.dropdown} ref={rootRef}>
      <Button aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {trigger}
      </Button>
      {open && (
        <div className={styles.menu} role="menu">
          {children}
        </div>
      )}
    </div>
  )
}
