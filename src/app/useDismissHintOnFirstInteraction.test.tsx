import { fireEvent, render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useOnboardingStore } from '../state/firstTimeStore'
import { useDismissHintOnFirstInteraction } from './useDismissHintOnFirstInteraction'

function Host() {
  useDismissHintOnFirstInteraction()
  return <button type="button">Some control</button>
}

describe('useDismissHintOnFirstInteraction (§18, M3.7)', () => {
  beforeEach(() => {
    useOnboardingStore.setState({ showHint: true })
  })

  it('dismisses the hint on a click anywhere, not only Play', () => {
    render(<Host />)
    fireEvent.click(document.body)
    expect(useOnboardingStore.getState().showHint).toBe(false)
  })

  it('dismisses on a keydown', () => {
    render(<Host />)
    fireEvent.keyDown(document.body, { key: 'a' })
    expect(useOnboardingStore.getState().showHint).toBe(false)
  })

  it('dismisses on a pointerdown (e.g. starting a camera-orbit drag)', () => {
    render(<Host />)
    fireEvent.pointerDown(document.body)
    expect(useOnboardingStore.getState().showHint).toBe(false)
  })

  it('does not reappear once dismissed, even after further interaction', () => {
    render(<Host />)
    fireEvent.click(document.body)
    expect(useOnboardingStore.getState().showHint).toBe(false)

    useOnboardingStore.setState({ showHint: true }) // something else re-enabled it (shouldn't happen, but confirm no re-listen)
    fireEvent.click(document.body)
    // The `once: true` listeners already fired and removed themselves —
    // a further click has no listener left to act on it.
    expect(useOnboardingStore.getState().showHint).toBe(true)
  })
})
