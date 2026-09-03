import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './components/ui/theme.css'
import './index.css'
// Side-effect import: registers window.__sceneStore in dev builds (M2.1).
// Nothing renders from this store yet — M2.2 onward does — but its debug
// hook must be reachable before any UI exists to drive it.
import './state/sceneStore'
import {
  confirmDiscard,
  openSharedScene,
  restoreDraftOnStartup,
  startAutosave,
  tryResumeLastActiveScene,
} from './state/draftStore'
import { useSceneStore } from './state/sceneStore'
import { initFirstTimeExperienceIfNeeded } from './state/firstTimeStore'
import { initPhysics, startPhysicsSync } from './engine/physics/physicsStore'
import { parseShareLinkId } from './utils/shareLink'
import App from './App.tsx'

// D4/M2.10: restore before the first render, so a refresh never shows an
// empty scene that then "pops in" a moment later.
restoreDraftOnStartup()
startAutosave()

// M3.1: WASM init is async and shouldn't block the first render. §18/M3.7's
// first-time-experience check, M6.6's share-link open, and M6.9's
// resume-last-active-scene all call loadPhysicsScene() (via
// loadDemoScene()/openSharedScene()/tryResumeLastActiveScene()), which
// needs a live Rapier world — must run after initPhysics() resolves,
// never before, or it would throw on an uninitialized RAPIER. This means
// a genuinely empty/first-ever load (or a share-link open, or a resume)
// briefly shows whatever restoreDraftOnStartup() left in place until
// WASM finishes, then the real content pops in — an accepted trade-off
// of the same "don't block first paint" call M3.1 made.
initPhysics().then(async () => {
  // D13: a `/scene/:id` URL always takes priority over everything below
  // — the user explicitly navigated to this specific scene.
  const sharedId = parseShareLinkId(window.location.pathname)
  if (sharedId) {
    // D4: same guard `loadDemoScene`/`openSavedScene` callers already
    // use — a no-op at this exact cold-boot point today (`isDirty` is
    // always false immediately after `restoreDraftOnStartup()`), kept
    // for consistency and because a future in-app link-open entry point
    // (none exists yet) must not reinvent this.
    confirmDiscard(() => openSharedScene(sharedId))
  } else if (useSceneStore.getState().objects.length === 0) {
    // D43/M6.9: nothing for `restoreDraftOnStartup()` to have restored
    // — try resuming `lastActiveSceneId` before falling back to §18's
    // first-time experience. A local draft that *was* restored (the
    // `else` this branch skips) always wins over both, per D43's own
    // precedence order — no server fetch happens in that case at all.
    const resumed = await tryResumeLastActiveScene()
    if (!resumed) initFirstTimeExperienceIfNeeded()
  }
  startPhysicsSync()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
