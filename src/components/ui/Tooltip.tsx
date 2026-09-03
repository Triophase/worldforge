import { cloneElement, isValidElement, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import styles from './Tooltip.module.css'

interface TooltipProps {
  label: string
  delayMs?: number
  children: ReactElement
}

/** Wraps a single trigger element and shows `label` on hover/focus, after `delayMs`. */
export function Tooltip({ label, delayMs = 300, children }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const show = () => {
    timer.current = setTimeout(() => setVisible(true), delayMs)
  }
  const hide = () => {
    clearTimeout(timer.current)
    setVisible(false)
  }

  if (!isValidElement(children)) {
    return children
  }

  const childProps = children.props as Record<string, unknown>
  // Note: oxlint's react/refs rule flags this as a ref-during-render read.
  // It's a false positive — `timer.current` is only read/written inside
  // these event-handler callback bodies below, never while rendering.
  const trigger = cloneElement(children as ReactElement<Record<string, unknown>>, {
    onMouseEnter: (e: React.MouseEvent) => {
      ;(childProps.onMouseEnter as ((e: React.MouseEvent) => void) | undefined)?.(e)
      show()
    },
    onMouseLeave: (e: React.MouseEvent) => {
      ;(childProps.onMouseLeave as ((e: React.MouseEvent) => void) | undefined)?.(e)
      hide()
    },
    onFocus: (e: React.FocusEvent) => {
      ;(childProps.onFocus as ((e: React.FocusEvent) => void) | undefined)?.(e)
      show()
    },
    onBlur: (e: React.FocusEvent) => {
      ;(childProps.onBlur as ((e: React.FocusEvent) => void) | undefined)?.(e)
      hide()
    },
  })

  return (
    <span className={styles.wrapper}>
      {trigger}
      {visible && (
        <span role="tooltip" className={styles.tooltip}>
          {label}
        </span>
      )}
    </span>
  )
}
