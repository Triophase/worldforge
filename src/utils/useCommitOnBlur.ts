import type { ChangeEvent, KeyboardEvent } from 'react'
import { useState } from 'react'

interface CommitOnBlurField {
  draft: string
  onFocus: () => void
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
  onBlur: () => void
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
}

/**
 * §19/§9's shared "commit on blur/Enter, never per keystroke" pattern —
 * used by the Rename field (Properties header + Hierarchy row inline
 * edit) and `NumberField`'s text-entry sibling. Resyncs the displayed
 * draft from `value` during render (not an effect) whenever the field
 * isn't being edited, same reasoning as `NumberField`. A blank commit is
 * rejected (reverts to `value`) rather than allowing an unnamed object.
 * Escape reverts without committing.
 */
export function useCommitOnBlur(value: string, onCommit: (value: string) => void): CommitOnBlurField {
  const [draft, setDraft] = useState(value)
  const [editing, setEditing] = useState(false)
  const [lastValue, setLastValue] = useState(value)

  if (!editing && value !== lastValue) {
    setLastValue(value)
    setDraft(value)
  }

  function commit() {
    const trimmed = draft.trim()
    if (trimmed) {
      onCommit(trimmed)
    } else {
      setDraft(value)
    }
    setEditing(false)
  }

  return {
    draft,
    onFocus: () => setEditing(true),
    onChange: (e) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e) => {
      if (e.key === 'Enter') e.currentTarget.blur()
      if (e.key === 'Escape') {
        // Reset state directly rather than blurring — a programmatic
        // blur() here would synchronously re-run `onBlur`'s `commit()`
        // against this same render's (still-stale) `draft` closure,
        // committing the very text Escape is meant to discard.
        setDraft(value)
        setEditing(false)
      }
    },
  }
}
