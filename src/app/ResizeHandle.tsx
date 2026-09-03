import styles from './ResizeHandle.module.css'

interface ResizeHandleProps {
  label: string
  onMouseDown: (e: React.MouseEvent) => void
}

export function ResizeHandle({ label, onMouseDown }: ResizeHandleProps) {
  return (
    <div
      className={styles.handle}
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
    />
  )
}
