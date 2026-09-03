import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import styles from './Button.module.css'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement>

/**
 * `forwardRef` (`M8.5`) — additive, no existing call site passes a
 * `ref` today, but `M8.4`'s drawer close needs to programmatically
 * return focus to whichever toolbar trigger opened it (§29's keyboard
 * walkthrough), which is only possible if the underlying `<button>`
 * DOM node is reachable from outside.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, disabled, children, ...rest },
  ref,
) {
  const classes = [styles.button, className].filter(Boolean).join(' ')
  return (
    <button ref={ref} type="button" className={classes} disabled={disabled} {...rest}>
      {children}
    </button>
  )
})
