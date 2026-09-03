import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Button } from './Button'
import { Tooltip } from './Tooltip'
import styles from './IconButton.module.css'

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Required: every icon-only button must be reachable by an accessible name (spec §29). */
  label: string
  icon: ReactNode
  /**
   * `M8.2`: an optional keyboard-shortcut hint (e.g. `"Space"`),
   * appended to the *tooltip* text only — `"Play (Space)"`. Never
   * changes `aria-label`, which stays exactly `label`; the accessible
   * name and the tooltip's visible text are deliberately decoupled so
   * adding a shortcut hint can't shift what a screen reader announces
   * or break a test asserting on the plain action name.
   */
  shortcut?: string
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, shortcut, className, ...rest },
  ref,
) {
  const classes = [styles.iconButton, className].filter(Boolean).join(' ')
  const tooltipLabel = shortcut ? `${label} (${shortcut})` : label
  return (
    <Tooltip label={tooltipLabel}>
      <Button ref={ref} aria-label={label} className={classes} {...rest}>
        {icon}
      </Button>
    </Tooltip>
  )
})
