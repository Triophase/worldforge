import { create } from 'zustand'
import { FALLING_BOX_DEMO } from '../demos/fallingBox'
import { loadDemoScene } from './draftStore'
import { useSceneStore } from './sceneStore'

const SEEN_BEFORE_KEY = 'cad-simulator:seen-before'

interface OnboardingState {
  /** "Press Play to start the simulation." — shown once, ever, per browser. */
  showHint: boolean
  dismissHint: () => void
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  showHint: false,
  dismissHint: () => set({ showHint: false }),
}))

function hasSeenBefore(): boolean {
  return localStorage.getItem(SEEN_BEFORE_KEY) !== null
}

function markSeen(): void {
  localStorage.setItem(SEEN_BEFORE_KEY, '1')
}

/**
 * §18/D26 — `M6.9`'s own fallback, not a temporary stand-in anymore
 * (this file's earlier "temporary, M6.9 supersedes this wholesale"
 * framing is now out of date: `M6.9` calls this exact function
 * unmodified, as the final step after both D43's local-draft check and
 * a `tryResumeLastActiveScene()` attempt have already come up empty —
 * see `main.tsx`). Call once at app startup, **after**
 * `draftStore.restoreDraftOnStartup()` — this only acts if that found
 * nothing to restore (`sceneStore.objects` is still empty), so an
 * already-in-progress real local draft (D4) is never overridden by
 * re-loading the demo. On a genuinely first-ever visit (the "seen
 * before" flag absent — a throwaway local boolean, **not** D18's real
 * device identity), marks the flag, loads Falling Box, and shows the
 * one-time hint. On a later visit that still lands here (no local
 * draft, no resolvable `lastActiveSceneId` — e.g. it was deleted, or
 * this device has simply never saved anything), loads Falling Box again
 * without the hint.
 */
export function initFirstTimeExperienceIfNeeded(): void {
  if (useSceneStore.getState().objects.length > 0) return

  const firstVisit = !hasSeenBefore()
  if (firstVisit) markSeen()

  loadDemoScene(FALLING_BOX_DEMO)
  if (firstVisit) useOnboardingStore.setState({ showHint: true })
}
