import type { HTMLAttributes } from 'react'
import styles from './Panel.module.css'

type PanelProps = HTMLAttributes<HTMLDivElement>

export function Panel({ className, children, ...rest }: PanelProps) {
  const classes = [styles.panel, className].filter(Boolean).join(' ')
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  )
}
