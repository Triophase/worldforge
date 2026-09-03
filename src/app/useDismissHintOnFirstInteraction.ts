import { useEffect } from 'react'
import { useOnboardingStore } from '../state/firstTimeStore'

/**
 * §18: the one-time hint is "dismissed on first interaction with any
 * control (not only Play)". A single capture-phase listener on `window`
 * catches this regardless of which control is used — camera orbit
 * (drei's `OrbitControls` attaches its own listeners directly to the
 * canvas; a capture-phase `window` listener still fires first, since
 * capture goes top-down) included. `click` is listened for too, purely
 * so `fireEvent.click(...)`-based tests (this codebase's dominant test
 * style) can exercise dismissal without simulating a full pointer-event
 * sequence.
 */
export function useDismissHintOnFirstInteraction() {
  useEffect(() => {
    function handleInteraction() {
      useOnboardingStore.getState().dismissHint()
    }

    const options = { capture: true, once: true }
    window.addEventListener('pointerdown', handleInteraction, options)
    window.addEventListener('keydown', handleInteraction, options)
    window.addEventListener('click', handleInteraction, options)

    return () => {
      window.removeEventListener('pointerdown', handleInteraction, options)
      window.removeEventListener('keydown', handleInteraction, options)
      window.removeEventListener('click', handleInteraction, options)
    }
  }, [])
}
