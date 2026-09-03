import type { KeyboardEvent } from 'react'
import { useState } from 'react'
import styles from './NumberField.module.css'

interface NumberFieldProps {
  label: string
  value: number
  onCommit: (value: number) => void
  /** D2: a read-only live display while the simulation isn't idle — the input still tracks `value`, but never commits. */
  disabled?: boolean
}

/**
 * §19: commits on blur/Enter, never per keystroke. While the field isn't
 * focused, its displayed text tracks `value` live (so a gizmo drag or a
 * store change updates it); while focused, the user's own typing is never
 * clobbered by those live updates until they commit or blur away. Resync
 * happens during render (comparing against the last-seen `value`), not in
 * an effect — an extra render pass isn't needed just to derive this.
 */
export function NumberField({ label, value, onCommit, disabled }: NumberFieldProps) {
  const [draft, setDraft] = useState(() => formatValue(value))
  const [editing, setEditing] = useState(false)
  const [lastValue, setLastValue] = useState(value)

  if (!editing && value !== lastValue) {
    setLastValue(value)
    setDraft(formatValue(value))
  }

  function commit() {
    const parsed = Number.parseFloat(draft)
    if (Number.isFinite(parsed)) {
      onCommit(parsed)
    } else {
      setDraft(formatValue(value))
    }
    setEditing(false)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') e.currentTarget.blur()
  }

  return (
    <label className={styles.field}>
      <span className={styles.axisLabel}>{label}</span>
      <input
        type="number"
        className={styles.input}
        value={draft}
        disabled={disabled}
        onFocus={() => setEditing(true)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKeyDown}
      />
    </label>
  )
}

function formatValue(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 1000) / 1000) : '0'
}
