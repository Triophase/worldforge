# AGENT.md — <project> as it currently exists

**This is the main agent file.** It is read on every invocation once the build
starts, and it is the one file guaranteed to be in context. Keep it **curated and
bounded**: it describes the application *as it exists now*, updated **in place**,
never appended to. Every line costs tokens on every run.

While the specification is being written, this file is a skeleton. It fills in as
the build proceeds — the first task that establishes a convention records it
here, and every task after that inherits it.

> **What goes here vs. what goes in the spec.** The specification under `.ai/specs/`
> is the **contract**: what was agreed, frozen, never edited to unblock anyone.
> This file is the **current state**: what is actually built, and the conventions
> that hold in the code today. When they disagree, that disagreement is a fact
> worth recording in `.ai/decisions.md` — not something to paper over here.

---

## Stack

Frontend: Vite 8 + React 19 + TypeScript, at the repo root. State: Zustand.
Icons: `lucide-react`. Lint: `oxlint` (`npm run lint`). Tests: Vitest 4 +
React Testing Library + jsdom (`npm test`) — **Vitest must stay on a 4.x+
release**; 3.x is incompatible with Vite 8's plugin types and breaks
`tsc -b` (see `.ai/memory/M0.1.md`). `vite.config.ts` imports
`defineConfig` from `vitest/config`, not `vite`, so the `test` field
type-checks.

3D: Three.js, `@react-three/fiber`, `@react-three/drei`. Testing 3D content
uses `@react-three/test-renderer` (headless, no WebGL needed) for scene
content, and regular RTL + a WebGL mock (`vitest-webgl-canvas-mock`) +
a `ResizeObserver` stub (both wired in `src/test/setup.ts`) for anything
that needs a real `<Canvas>` mounted. See `.ai/memory/M1.1.md` for why
both are needed and how to use each. **Caveat:** `@react-three/test-renderer`
cannot see content a drei component portals into a separate scene/root
(confirmed with `GizmoHelper` — see `.ai/memory/M1.2.md`); fall back to a
source-text check on the component file in that case, not raw React
element-tree reflection (unreliable across `forwardRef`-wrapped
components). **jsdom's `File`/`Blob` polyfill has no working
`.arrayBuffer()`/`.text()`** (`M5.2`, confirmed empirically — both are
`undefined`, and even Node's own global `Response` can't read a jsdom
`File` either) — read file content via `FileReader` instead (its older
API jsdom implements correctly, and it works identically in real
browsers, so this isn't a test-only shim).

Physics: `@dimforge/rapier3d-compat` (M3.1) — the base64-WASM-embedded
"compat" build, not plain `@dimforge/rapier3d`, chosen so Vite needs zero
special WASM bundler config; confirmed working under both Vitest and
Vite's dev-server transform with no plugin. Grows the production bundle
substantially (WASM is inlined) — expected, not a regression.

Backend (`M6.1`): Node.js/TypeScript + Express + `pg`, in `server/` — a
sibling of `src/`, its own `package.json`/`node_modules`/`tsconfig.json`,
never bundled by the Vite build (spec §32). Tests: Vitest (`npm test`
inside `server/`), run against a real local Postgres per D36 — never a
mock; `server/docker-compose.yml` is the one dev/test Postgres instance.
No endpoints beyond `/health` yet — `M6.2` onward builds real routes.

## Conventions

- Design-system primitives (`Panel`, `Button`, `IconButton`, `Tooltip`,
  `Dropdown`) live in `src/components/ui/` and are imported from its
  barrel (`./components/ui`), not individual files. Build new UI on these,
  don't style one-off.
- Theme tokens (`src/components/ui/theme.css`) are the only place a
  transition duration is a literal `ms` value — every component references
  `var(--transition-fast)`. Keep it that way; a hardcoded duration
  elsewhere breaks the "150-250ms, one place to check" property
  `M0.2`'s test suite relies on.
- RTL cleanup is wired once, globally, in `src/test/setup.ts`
  (`afterEach(() => cleanup())`). Don't add a second one per test file.
- Vitest tests import `describe`/`it`/`expect` explicitly from `'vitest'`
  — `test.globals` is off. Follow that pattern in new test files.
- **Drag interactions use `mousedown`/`mousemove`/`mouseup`, not
  `PointerEvent`.** `PointerEvent`'s `clientX` didn't drive state
  correctly under this project's jsdom version when tested (`M0.3`) — not
  root-caused, just confirmed broken and worked around. Any future
  drag-based UI (`M2.6`'s transform gizmo, in particular) should default
  to mouse events too unless someone first confirms in isolation that
  pointer events now work under test.
- Long-lived event-listener pairs (add on drag-start, remove on
  drag-end) are built as a fresh matched `function` pair per gesture
  (see `useResizablePanels.ts`'s `startDragging`), not as two separate
  `useCallback`s where one removes-itself-by-name — the latter trips
  oxlint's `react/immutability` rule on the self-reference.

## Architecture as built

`src/` layout (spec §32): `app/`, `components/{Viewport,Toolbar,
AssetLibrary,SceneTree,PropertiesPanel,SimulationControls,Timeline}/`,
`engine/{renderer,physics,joints,simulation,scene}/`, `loaders/
{GLTFLoader,STLLoader,OBJLoader,AssetLoader}/`, `assets/{primitives,
mechanical,assemblies}/`, `state/`, `utils/`. Plus `components/ui/`
(design-system primitives, `M0.2`).

`App.tsx` now just renders `app/AppShell.tsx` — the real five-region
layout (Toolbar, AssetLibraryPanel, ViewportRegion, PropertiesPanel,
TransportBar), each a separate component, none with real content yet.
Assets/Properties panel widths are resizable (drag handles use **mouse**
events, not pointer events — see `.ai/memory/M0.3.md`, jsdom issue) with a
viewport-width floor (`app/panelSizing.ts`'s `clampPanelWidth`). Toolbar's
File/Edit/View `Dropdown`s are open/closeable but empty — later tasks add
`children` to them, not a new menu mechanism. Every toolbar/transport
control is `disabled` pending `M3.4`/`M3.5`.

`engine/renderer/` now has `SceneContent.tsx` (lights/OrbitControls/
`ViewportChrome`/`CameraRig` — testable in isolation, see Testing),
`SceneCanvas.tsx` (the `<Canvas>` wrapper — mounted by `ViewportRegion`),
`ViewportChrome.tsx` (grid/axes/origin marker/orientation gizmo, D34 —
never a scene object, never store-driven), and `CameraRig.tsx` (both
camera objects — perspective + orthographic, always both mounted, one
`makeDefault` — plus the eased preset-transition animation, `M1.3`). A
component that itself renders `<Canvas>` must never be handed to
`@react-three/test-renderer` — put scene content in a separate,
`<Canvas>`-free component instead.

`state/cameraViewStore.ts` and `state/renderModeStore.ts` bridge DOM UI
(Toolbar's View menu) with components inside the Canvas
(`CameraRig`/`RenderModeSync`) — the pattern for any future "trigger a
Canvas-side effect from outside the Canvas" need. `RenderModeSync`
(`engine/renderer/`) applies the global solid/wireframe toggle to every
mesh in the scene, every frame — any future mesh (M2.2, M5) needs zero
wireframe-specific code to respect it, as long as it uses a standard
material; only `ShaderMaterial`/`RawShaderMaterial` meshes (e.g. drei's
`<Grid>`) are excluded.

**R3F animation timing:** always accumulate elapsed time from `useFrame`'s
own `delta` parameter, never from `state.clock.elapsedTime` —
`@react-three/test-renderer`'s `advanceFrames()` does not advance the
underlying `THREE.Clock`, only `delta` is real under test. Also: read any
store value that a `useFrame` callback needs via
`store.getState().field` inside the callback, not via the reactive
`useStore(s => s.field)` hook captured in the closure — `advanceFrames()`
invokes the frame subscriber directly without first triggering a React
re-render, so a hook-captured value can be stale by exactly one store
update. Full story: `.ai/memory/M1.3.md`.

`state/sceneStore.ts` is the scene data store (objects, selection —
D22's per-object schema) — M2.2 onward builds visible features on it.
Its `window.__sceneStore` dev-only debug hook is wired in via a
side-effect import in `main.tsx`; a module that's meant to be reachable
before its first real UI consumer needs the same treatment, or it's
silently absent from the bundle despite existing on disk and passing its
own tests (see `.ai/memory/M2.1.md`).

`assets/` now holds the built-in shape registry: `assets/registry.ts`
(types + lookup/cache functions), `assets/primitives/` (5 basic shapes),
`assets/mechanical/` (6 mechanical components). **Always import from the
`assets/index.ts` barrel, never `assets/registry.ts` directly** — the
barrel is what side-effect-imports the definition modules and actually
populates the registry; importing the registry module alone gets you an
empty one with no error. `engine/scene/SceneObjects.tsx` is the renderer
that turns `sceneStore.objects` into meshes.

**A built-in asset's `defaultRotation` (only Ramp is non-identity) is
composed with the object's `transform.rotation` at render time — never
baked into the geometry's vertices.** This was a deliberate call, not an
oversight (see `.ai/memory/M2.2.md`): baking it into geometry would leave
the collider descriptor (matching the *untilted* geometry) visually
disagreeing with the *tilted* mesh once M3.1 builds a physics body from
that same descriptor. **M3.1 must apply the identical composition**
(`objectRotation.multiply(defaultRotation)`) when setting a Rapier body's
rotation, or Ramp's visual and physical orientation will diverge.

Also: R3F's `quaternion` prop needs a plain `[x,y,z,w]` array
(`.toArray()`), never a `THREE.Quaternion` instance directly — the latter
throws ("Cannot assign to read only property") since `Object3D.quaternion`
has no setter.

`AssetLibraryPanel.tsx` (real grid, replacing M0.3's placeholder) drives
scene population via click-to-add and drag-to-place. Placement math
(`assets/placement.ts`) is the one shared implementation of "where does
this object's Y sit" and "where on the ground plane was this dropped" —
route any future asset-insertion feature through it rather than
re-deriving it.

**A third store-bridge pattern now exists** (`state/viewportBridgeStore.ts`
+ `engine/renderer/ViewportBridgeSync.tsx`): Canvas→DOM, the reverse
direction of `cameraViewStore`/`renderModeStore` (DOM→Canvas). Use it for
anything DOM-side that needs to know "what is the camera looking at right
now" — it can be `null` before the Canvas mounts, and every consumer must
handle that.

**The asset drag-to-place drop handler lives on `AppShell`'s root div,
not on `ViewportRegion`** — §11 requires a drop outside the viewport to
still add the object at the origin, which only works if something catches
drops app-wide.

**Three.js math APIs generally want their own typed objects, not
duck-typed plain ones** — `Raycaster.setFromCamera()` needs a real
`Vector2`, not `{x, y}` (join the earlier `quaternion` prop lesson from
`M2.2`). **`npm test` passing does not mean the build passes** — Vitest's
transform strips TypeScript types without checking them; only `tsc -b`
(part of `npm run build`) catches a type error like this. Always run both.

Viewport object picking/selection (`M2.5`) is wired into `SceneObjects.tsx`
(`onClick` per mesh, `stopPropagation()`'d) and `SceneCanvas.tsx`
(`onPointerMissed` → `clearSelection`, R3F's built-in "hit nothing"
signal for §9's empty-space click). Selection highlight is
`engine/scene/SelectionOutline.tsx` — see the testing note below before
touching it.

`components/SceneTree/SceneHierarchyPanel.tsx` is a flat, reactive list
of scene objects (D19: no nesting until M4.1's joints). **Layout note:**
`idea.md`'s wireframe never reserves space for the Hierarchy — it's
stacked above `PropertiesPanel` in the right-hand column
(`AppShell.module.css`'s `.hierarchySlot`/`.propertiesSlot`), not a
separate column. Selected-row highlighting uses a fill class *and* a
separate leading-indicator element — never rely on background color
alone anywhere state is shown (§9/§29's rule, already established for
`Button`/selection elsewhere).

**Testing a Zustand store mutated directly via `.getState().action()`
*after* a component has rendered needs `act()` wrapping** (from
`@testing-library/react`) — otherwise the DOM may not reflect the change
by the time an assertion runs. Mutations *before* the initial `render()`
don't need it. And `act(() => fn())`'s return value is **not** `fn()`'s
return value — capture what you need via an outer-scoped variable
assigned inside the callback, not via `act()`'s own result.

**Never trigger a React state update (`useState`'s setter) from inside a
`useFrame` callback.** `@react-three/test-renderer`'s `advanceFrames()`
(unlike its `update()`/`fireEvent()`) invokes frame subscribers with no
`act()` wrapping, so a `setState` call from inside `useFrame` isn't
reliably observed by a subsequent assertion — confirmed the hard way in
`M2.5` (`SelectionOutline`'s original mount/unmount-via-`useState` design
never actually unmounted under test). **Use plain mutable `Object3D`
properties instead** (`.visible`, `.scale`, `.position`, etc., set
directly on a ref every frame) for anything animated per-frame — this is
also just the more idiomatic imperative-animation pattern, matching
`CameraRig` (M1.3), and sidesteps the whole class of bug regardless of
which testing tool is involved.

`@react-three/test-renderer`'s `findByType('X')` throws if more than one
instance of type `X` exists anywhere in the tree — including one nested
*inside* another (e.g. drei's `<Outlines>` renders its own internal
`<group>`, so a component that wraps it in its own `<group>` has two).
Use `renderer.scene.children[0]` (or a specific parent's `.children`) to
target the outer one precisely, rather than a type search.

**Transform gizmo & Properties Transform section (`M2.6`)**:
`state/gizmoModeStore.ts` (`'select'|'translate'|'rotate'|'scale'`, D24)
and `state/gizmoDragStore.ts` (Canvas→DOM live-drag bridge, same shape as
`viewportBridgeStore`) are pure UI/session state, never scene-graph state.
`sceneStore.ts` gained `updateTransform(id, partial)` — the one path any
future transform-editing feature (`M2.8` snapping, `M2.9` undo) should
commit through. `SceneObjects.tsx`'s `SceneObjectMesh` conditionally
renders drei's `<TransformControls>`; **pass it the mesh's `ref` object
itself (`object={meshRef as RefObject<Mesh>}`), never `meshRef.current`**
— drei attaches inside a `useLayoutEffect`, so the ref form sidesteps both
an oxlint "ref access during render" warning and any question of whether
`.current` is populated yet on the render where `selected` first becomes
true. drei's `TransformControls` **auto-disables `OrbitControls` during a
drag already** (via `state.controls` + a `dragging-changed` listener,
given `OrbitControls` has `makeDefault`) — do not add manual
enable/disable wiring for this. `utils/eulerQuaternion.ts` is D21's
**only** quaternion↔Euler-degrees conversion boundary — used by both the
gizmo's rotate mode (via `SceneObjects.tsx`'s
`compose`/`decomposeMeshQuaternion`, needed so gizmo-rotating the tilted
Ramp asset commits its own rotation delta, not the tilt-inclusive mesh
quaternion) and `PropertiesPanel.tsx`'s Rotation fields. Any future
Euler-facing UI must convert here, not add a second conversion site.
`PropertiesPanel/NumberField.tsx` commits on blur/Enter only (§19); it
resyncs its displayed value from a live external prop **during render**
(comparing against a `lastValue` state), not via `useEffect` — oxlint's
`react(set-state-in-effect)` flags the effect form, and the render-time
form is React's own documented idiom for this. `GizmoModeToolbar.tsx`
(floating overlay in `ViewportRegion`, now `position: relative`) and
the global keyboard shortcut (`app/useGlobalShortcuts.ts`, `M8.2` —
originally its own small `useGizmoModeShortcuts.ts`, since folded into
that one shared handler alongside every other D24 binding) are the two
ways to change `gizmoModeStore`'s mode — idea.md §30's keyboard/on-screen
parity.

**Testing a mesh after selection is no longer safe via
`findByType('Mesh')`** — mounting a `TransformControls` gizmo adds dozens
of `Mesh`-typed helper nodes to the scene graph (three-stdlib draws all
three modes' handles, visibility-toggled internally). The actual
scene-object mesh now carries `name="scene-object-mesh"`; find it via
`renderer.scene.findByProps({ name: 'scene-object-mesh' })` instead.
Also: `@react-three/test-renderer`'s `.find(predicate)` **throws** if
nothing matches (via an internal `expectOne`) — unlike `findAllByType`.
Asserting "nothing of this kind is mounted" needs `.findAll(predicate)[0]`
(possibly `undefined`), not `.find(predicate)`. A gizmo drag is simulated
in tests by locating the raw three-stdlib `TransformControls` instance
(`node.instance?.constructor?.name === 'TransformControls'`, the same
pattern `M1.1` established for `OrbitControls`) and calling
`.dispatchEvent({ type: 'objectChange' })` / `{ type: 'mouseUp' }`
directly, after mutating the attached mesh's `position`/`quaternion`/
`scale` in place — there is no way to drive a real pointer-drag through
jsdom's headless canvas.

**Multi-select, Duplicate/Delete/Rename (`M2.7`)**: `sceneStore.select(id,
mode?)` takes an optional third `SelectMode` (`'replace'|'add'|'toggle'`,
default `'replace'`); `setSelection(ids)` sets it outright (used by
Duplicate). `utils/selectionModifiers.ts`'s `selectModeFromEvent` is the
**one** place §9's Shift-adds/Ctrl-toggles rule is encoded — both
`SceneObjects.tsx`'s mesh click and `SceneHierarchyPanel.tsx`'s row click
call it on the native event and forward the result to `select`. **A
selected mesh's outline now reflects plain membership in `selectedIds`,
not "is the sole selection"** — every object in a multi-selection shows
an outline; only the gizmo (a separate, mesh-local `isSoleSelection`
subscription in `SceneObjects.tsx`) is restricted to a lone selection.
(An earlier `M2.5` memory note guessed the opposite for multi-select
outlines — it was wrong; `M2.7`'s actual task spec is authoritative, and
the `M2.5`-era test asserting no-outline-on-multi-select was corrected
alongside this task. Memory files are working notes, not a substitute
for reading a later task's real spec.) `utils/useCommitOnBlur.ts` is now
the shared "commit on blur/Enter, resync from an external value during
render, Escape reverts without committing" hook — used by the Hierarchy's
double-click-to-rename row and the Properties panel header's Name field;
`NumberField` (`M2.6`) has the same logic inline for numeric values —
kept separate since it also handles parsing/formatting a number, not just
free text. **Escape-to-revert
must never call `.blur()` programmatically to close the field** — doing
so re-enters the same synchronous event-handler stack's `onBlur` with a
stale (pre-revert) `draft` closure, committing the very text Escape was
meant to discard; reset state directly instead. `PropertiesPanel.tsx`'s
header now branches three ways (none/one/many selected) — Duplicate loops
`duplicateObject` once per `selectedIds` entry and selects the results;
Delete loops `removeObject` once per id, then clears the selection —
matching state-architecture's "loop the existing per-id action, don't add
a new bulk store method" guidance.

**Snapping (`M2.8`)**: `state/snappingStore.ts` is a small editing-
preference store — **its field names deliberately match D22's
`simulation.snapping` schema exactly** (`moveEnabled`, `moveSnap`,
`rotationEnabled`, `rotationSnapDeg`), so a later Save/Export task can
spread it straight into the scene JSON with no renaming. `utils/snap.ts`'s
`snapToIncrement` is a pure rounding function; `SceneObjects.tsx`'s
`snapTransform` calls it **only from `handleDragEnd`, never from the
live-preview `handleObjectChange` path** — §20 requires snapping to
affect only the committed value, not the in-progress display, and it must
never touch the Properties panel's direct numeric-field entry at all
(regression-tested). Reading `useSnappingStore.getState()` at commit time
is safe/idiomatic here since it's a discrete event handler, not a
per-frame `useFrame` callback (contrast the M1.3 stale-closure gotcha
below, which is specifically about `useFrame`). **`components/ui/
NumberField` (moved here from `components/PropertiesPanel/`, prop renamed
`axisLabel`→`label`) is now the shared "labeled number input, commit on
blur/Enter" component** — `SnappingControls.tsx`'s increment fields and
`PropertiesPanel.tsx`'s Transform fields both use it; import it from the
`ui` barrel for any future numeric field with the same discipline (the
Physics panel, `M3.2`, is the next likely consumer). `ViewportRegion.tsx`
now wraps `GizmoModeToolbar` and `SnappingControls` in a `.overlayStack`
div that owns the `position: absolute` placement — neither child
component positions itself anymore.

**Undo/redo (`M2.9`)**: `state/historyStore.ts` holds `undoStack`/
`redoStack` of tagged `HistoryEntry` unions and exports five `recorded*`
wrapper functions (`recordedAddObject`, `recordedDuplicateObjects`,
`recordedRemoveObjects`, `recordedRenameObject`,
`recordedUpdateTransform`). **Every UI call site that edits the scene
must call the matching `recorded*` wrapper, never `sceneStore`'s raw
action directly** — `sceneStore`'s own actions still exist and are what
the wrappers call through to, but a new editing feature that calls
`useSceneStore.getState().addObject(...)` (etc.) directly from a
component bypasses undo entirely. `recordedDuplicateObjects`/
`recordedRemoveObjects` take the **whole selection's id array in one
call** and push exactly one entry — that's what makes an M2.7 batch
Duplicate/Delete a single undo step; `sceneStore` itself still has no
bulk methods (state-architecture's "loop the per-id action" guidance is
unchanged, just wrapped one level up). A **diff-the-store-on-subscribe**
design was considered and rejected — it can't produce one entry for a
batch operation, since `sceneStore.duplicateObject`/`removeObject` are
still called once per id in a loop, which would fire the diff subscriber
N times. **Any future undoable action (`M3.2` Physics edits, `M4`'s
joint create/delete/property-edit) should add a new `HistoryEntry`
variant + `recorded*` wrapper here, following the same pattern** — read
the "before" value, call the raw mutation, push one entry — not a second
history mechanism. `recordedRemoveObjects` restores a batch delete by
reinserting each object at its **original, pre-removal index**, spliced
back in **ascending index order** — this is the only ordering that
reconstructs the original array correctly regardless of which subset was
removed. Rename/transform undo/redo call the raw `renameObject`/
`updateTransform` actions directly (not the `recorded*` wrappers), so
undoing never itself pushes a new history entry. `clearHistory()` exists
for `M6.5`/`M7.2` to call later; nothing in M2 calls it. Selection
(`select`/`clearSelection`/`setSelection`) has no `recorded*` wrapper and
never will — D25 excludes it permanently. `Toolbar.tsx`'s Edit menu now
has Undo/Redo buttons, each `disabled` per stack emptiness.

**Local draft autosave / dirty tracking / New Scene (`M2.10`, D4)**:
`sceneStore.ts` gained `isDirty: boolean` and `resetDraft()`. **`isDirty`
is set directly inside each mutating action's own `set()` call**
(`addObject`/`removeObject`/`renameObject`/`duplicateObject`/
`updateTransform`) — **not** via `historyStore`'s `recorded*` wrapper
layer, unlike everything else that touches those actions. This is
deliberate: undo/redo call the raw actions directly (bypassing
`recorded*` to avoid re-recording history), so marking dirty at the raw
level is what makes an undo/redo correctly re-dirty the draft — the
autosave must persist the *post-undo* state, or a refresh right after an
undo would restore the wrong (pre-undo) content. **Any future mutating
action must set `isDirty` the same way** (in its own `set()`, not a
wrapper). `state/draftStore.ts` is the orchestration layer:
`serializeDraft()` (D22 JSON shape, restricted to what M2 has data for —
`id`/`createdAt`/`updatedAt`/`assets` omitted entirely, matching D22's
own "absent for a not-yet-saved local draft" note), `restoreDraftOnStartup()`
(reads `localStorage` via raw `setState`, never `addObject`, so restoring
never marks the fresh draft dirty or pushes undo history — call this
before the first render), `startAutosave()` (subscribes to `sceneStore`,
debounces ~1s while `isDirty`, writes to `localStorage` — never itself
clears `isDirty`), `newScene()` (`resetDraft()` + `historyStore
.clearHistory()` + clears the local storage slot), and `confirmDiscard
(proceed)` (the reusable "unsaved changes?" guard). **`M3.6`/`M6.5`/`M7.2`
must call `newScene()`/`confirmDiscard()` rather than reimplementing
their steps** — a Load/Import/demo-switch should wrap its own
draft-replacing logic in `confirmDiscard(() => { ... })`, not call
`newScene()` directly (which specifically means "replace with nothing").
`main.tsx` calls `restoreDraftOnStartup()` then `startAutosave()` before
`createRoot(...).render(...)`. `app/useUnsavedChangesWarning.ts` wires a
`beforeunload` listener once in `AppShell.tsx`. `Toolbar.tsx`'s File menu
now has a New Scene button wired to `confirmDiscard(newScene)`.

**Rapier physics world (`M3.1`)**: `engine/physics/physicsStore.ts` is a
Zustand store owning `{ world: RAPIER.World | null, bodies: Map<id,
{rigidBody, collider}> }`, plus `initPhysics()` (async WASM init +
first `loadScene`), `loadScene(objects)` (§13: disposes the previous
world via `World.free()`, builds one fresh world — the reusable "scene
changed" entry point for `M3.6`/Load/Import later), and
`startPhysicsSync()` (subscribes to `sceneStore`, diffs `objects` by id
to add/remove bodies). **Physics is a passive observer of `sceneStore`,
exactly like `SceneObjects.tsx`'s render — no UI call site is aware
physics exists.** `utils/assetRotation.ts` now holds
`composeMeshQuaternion`/`decomposeMeshQuaternion` (moved out of
`SceneObjects.tsx`, M2.6's original home) since `physicsStore.ts`'s body
rotation must use the identical composition, per M2.2's registry
comment — both read from the one function, so Ramp's tilt can't
visually/physically disagree. Colliders are scaled by `transform.scale`;
a non-uniform X/Z scale on a round shape (sphere/cylinder/cone/capsule)
only affects the radius via the X component — a documented, currently
unreachable simplification since no built-in produces that today.
`main.tsx` calls `initPhysics().then(startPhysicsSync)` **without**
awaiting it before render — WASM init is genuinely async and must not
block first paint. **No stepping happens yet** — bodies exist and can be
queried/stepped manually (as `physicsStore.test.ts` does), but nothing
calls `world.step()` from the running app until `M3.4`.

**Physics properties panel (`M3.2`)**: `sceneStore.updatePhysics(id,
partial)` mirrors `updateTransform`'s shape. `physicsStore
.applyPhysicsProps(id, physics)` live-updates an *existing* body in
place (Body Type via `RigidBody.setBodyType()`, Mass/Friction/
Restitution via the collider's setters, Gravity via `setGravityScale`)
— **required** because `startPhysicsSync`'s add/remove-only diff (M3.1)
never reacts to a field changing on an already-tracked id, only to
objects entering/leaving the array. `historyStore.ts`'s `'physics'`
entry type is the one exception to "undo/redo call the raw action
directly" — it also explicitly calls `applyPhysicsProps` after
`sceneStore.updatePhysics`, both forward and reverse, since physics
(unlike transform) has no other sync path back to the live body.
`recordedUpdatePhysics(id, partial)` is the one commit path — the
`M8.1` "Add Physics" context-menu shorthand (D29) should call it with
`{ bodyType: 'dynamic', ...DEFAULT_PHYSICS-shaped values }` rather than
inventing a second mechanism. `PropertiesPanel.tsx`'s Physics section
clamps Mass to a `0.01` minimum, Friction to a `0` minimum, and
Restitution to `[0, 1]` **at the commit call site**, not inside
`NumberField` — exact thresholds are this task's own free choice, spec
only requires "rejected or clamped." **Importing `physicsStore` from
`historyStore` measurably slowed the whole test suite** (every test
file that imports `historyStore` now transitively loads Rapier's WASM
at import time, even tests that never touch physics) — not a
correctness issue, flagged in `.ai/memory/M3.2.md` in case it ever needs
addressing (lazy-load `physicsStore` instead of a static import).

**Render/physics sync (`M3.3`)**: `SceneObjects.tsx`'s `SceneObjectMesh`
now has a `useFrame` that, whenever a live Rapier body exists for the
object, imperatively sets `mesh.position`/`mesh.quaternion` from the
body's current `translation()`/`rotation()` every frame — no easing, no
interpolation (§22), and this **must stay unconditional, called before
any early `return null` in the component** (oxlint's
`react-hooks(rules-of-hooks)` errors otherwise; caught once already).
The declarative `position=`/`quaternion=` JSX props are unchanged and
still there, purely as the pre-physics-ready fallback — once a body
exists, `useFrame` overwrites them every browser frame with no visible
fight. **The sync is skipped for exactly the one mesh currently under
an active gizmo drag** (`gizmoDragStore.liveTransform !== null` *and*
sole-selected, both read fresh via `.getState()` inside the callback) —
otherwise it would fight `TransformControls`'s own imperative mutation
mid-drag. `physicsStore.applyTransform(object)` is the write-back half:
**any transform commit must go through `recordedUpdateTransform`**,
which calls it (plus both `'transform'` cases in `historyStore`'s
undo/redo) — bypassing it leaves the mesh visually frozen at the
pre-edit physics position on the very next frame, since nothing ever
told the live body about the new pose (§13: "only one source of ground
truth per frame"). Scale is never synced from/to physics — Rapier has
no per-body scale concept, and a Scale edit still doesn't live-resize
the collider (a known gap from `M3.1`, unchanged, not this task's scope).

**Play/Pause/Reset transport, D3 snapshot, D2 edit lock (`M3.4`)**:
`state/simulationStore.ts` is the `idle → playing ⇄ paused → idle` state
machine (§16). `play()` snapshots (via `physicsStore.snapshotBodies()`)
only when leaving `idle` — resuming from `paused` never re-snapshots.
`reset()` restores via `physicsStore.restoreBodies()` and returns to
`idle`. **`isEditLocked()` (`phase !== 'idle'`) is the one shared D2
guard** — it locks both `playing` and `paused`, not `playing` alone; see
`.ai/decisions.md`'s `M3.4` entry for why this reads D2 more broadly than
its own literal sentence (avoids editing committing against `sceneStore`'s
stale pre-Play transform while paused). Every future scene-mutating
action (`M4`'s joint create/delete/edit) must add the same `if
(isEditLocked()) return` guard to its own wrapper — this task put the
check inside `historyStore.ts`'s six `recorded*` functions plus
`undo`/`redo`, not scattered per UI call site, so nothing else needed to
change. `recordedAddObject` can now return `undefined` (refused) — check
before using the result. `engine/simulation/SimulationStepper.tsx` is
**the only place `world.step()` is ever called** (once, in
`SceneContent.tsx` — never per-mesh). `engine/simulation/PlaybackSync.tsx`
writes the sole-selected object's live position/rotation into a new
`state/playbackBridgeStore.ts` (Canvas→DOM bridge, same pattern as
`viewportBridgeStore`/`gizmoDragStore`) whenever `phase !== 'idle'` —
`sceneStore`'s own transform is never touched by stepping, so this is the
Properties panel's only way to show the object's real current pose while
not idle; `PropertiesPanel.tsx` reads `livePlaybackTransform ??
liveTransform ?? object.transform` and passes `disabled={isLocked}` to
every field. `SceneObjects.tsx`'s gizmo is hidden entirely (not just
refused on commit) while `phase !== 'idle'`. **Two identically-labeled
"Play"/"Reset" buttons exist in the DOM** — `Toolbar.tsx`'s own
(deliberately untouched, still hardcoded `disabled`, likely an M0.3-era
placeholder) and `TransportBar.tsx`'s real ones — any test asserting on
them by accessible name must scope to `within(footer)` to avoid ambiguity.

**Speed control + timeline (`M3.5`)**: `simulationStore.ts` gained
`speed` (`SIMULATION_SPEEDS = [0.25, 0.5, 1, 2] as const`, default `1`;
D22's `simulation.speed`, real now in `draftStore.ts`'s serialize/
restore — no longer a hardcoded placeholder) and `elapsed` (seconds of
**simulated**, not wall-clock, time — scales with speed; accumulated
only by `SimulationStepper`, zeroed by `reset()`). §16: speed scales the
Rapier **timestep** (`SimulationStepper.tsx` sets `world.timestep =
BASE_TIMESTEP * speed` immediately before every `world.step()`), never
the render/`useFrame` rate — reading `speed` fresh via `.getState()`
each frame is what makes a mid-`playing` speed change take effect on the
very next step with no Pause required. Speed buttons in
`TransportBar.tsx` are **deliberately never `disabled` by `phase`** —
the one transport control D2's edit lock doesn't cover; getting this
backwards would make the task's own headline behavior unreachable.
**`components/Timeline/Timeline.tsx` is the elapsed-time display** — a
plain `<span>` (D30: no click/drag handlers of any kind, so its
non-interactivity is structural, not a guarded no-op), formatting
`simulationStore.elapsed` as `"04.32s"`. `TransportBar.tsx` renders
`<Timeline />` rather than owning that formatting itself — the spec's
own file layout (§32) names `Timeline/` as a dedicated component folder
(empty since `M0.1`), and building the display inline would have left it
unfulfilled; **check whether a task's UI belongs in an already-empty
spec-named folder before calling the task done** — `engine/joints/` and
`loaders/` are the remaining empty ones (`M4`/`M5` onward), worth the
same check when their time comes.

**Falling Box demo + demo-loading mechanism (`M3.6`)**: `draftStore.ts`'s
draft-JSON interface is now **exported as `SceneJSON`** — one scene-JSON
shape for both the local draft and demo data, not two. `draftStore
.loadDemoScene(scene: SceneJSON)` replaces the current draft wholesale
(D26): assigns each object a **fresh `crypto.randomUUID()` id** (never
the demo JSON's own human-readable placeholder ids — `src/demos/
fallingBox.ts`'s `"ground"`/`"platform"`/`"box"` are never actually
written to `sceneStore`), restores `snappingStore`/`simulationStore
.speed`, resets `simulationStore` to a clean `idle` state regardless of
prior phase, clears undo history, calls `physicsStore.loadScene(objects)`
directly (§13's full teardown+rebuild — **not** `startPhysicsSync`'s
incremental diff, which is for ordinary add/remove/duplicate only, per
`M3.1`'s own memory), and **writes through to `localStorage`
immediately** rather than waiting for the `isDirty`-gated autosave (a
demo load never marks `isDirty`, so it can't rely on that path — this is
the one place `draftStore.ts` writes to `localStorage` outside the
debounced autosave subscriber). `src/demos/` (not named in spec §32,
this task's own free choice) is now the established "one file per
hand-authored `SceneJSON` demo" pattern — `M4.6`'s remaining four demos
(Bouncing Ball, Rotating Wheel, Robotic Arm, Slider) should each get
their own file here and an entry in `Toolbar.tsx`'s `DEMOS` array, no
other changes needed. **Every demo menu entry wraps `loadDemoScene` in
`confirmDiscard`** — matching `New Scene`'s own pattern and the spec's
explicit "subject to the same unsaved-changes warning" wording for demo
switches; the task file's "warning not built here" scope note means the
mechanism didn't need building *in this task* (it already existed from
`M2.10`), not that call sites should skip using it.

**Empty state + temporary first-time experience (`M3.7`, `M3`'s last
task)**: `components/Viewport/EmptyState.tsx` (§23) overlays the
viewport whenever `sceneStore.objects.length === 0`, offering "+ Add
Asset" (focuses the Assets panel's search input, now `id=
"asset-library-search"`), a disabled "Upload CAD" placeholder (`M5`),
and three demo shortcuts — only Falling Box is wired (through
`confirmDiscard`), Bouncing Ball/Rotating Wheel stay disabled until
`M4.6`. The overlay uses `pointer-events: none` on its container and
`auto` on its children so camera orbit/pan/zoom still reaches the
canvas through the empty space, matching the edit-lock's own
"navigation always works" rule. `state/firstTimeStore.ts`'s
`initFirstTimeExperienceIfNeeded()` is a **temporary** stand-in for D18
device identity (`M6.2`'s real job) — a throwaway `localStorage` flag,
distinct from D4's dirty-tracking draft — that loads Falling Box and
(on a genuine first visit only) shows a one-line hint
(`SimulationControls/FirstTimeHint.tsx`, driven by
`useOnboardingStore`) dismissed by the first interaction anywhere
(`app/useDismissHintOnFirstInteraction.ts`, capture-phase
`pointerdown`/`keydown`/`click` on `window`). It **only fires when the
scene is already empty** after `restoreDraftOnStartup()` — never
overrides a real restored draft. **`main.tsx` calls it inside
`initPhysics().then(...)`, before `startPhysicsSync()`** — it
transitively calls `loadDemoScene()`, which needs a live Rapier world;
calling it earlier throws. `M6.9` replaces this whole mechanism with
real D14 resume-last-active-scene logic.

**Mechanical joints, engine + store foundation (`M4.1`, no UI yet)**:
`sceneStore.ts` gained `joints: JointEntity[]` (D22's schema exactly)
plus `createJoint`/`deleteJoint`/`updateJoint` and two standalone §14
validators (`isSelfJoint`, `hasJointBetween`) exported for `M4.2`'s
Object B picker to filter with directly. `createJoint` computes D23's
anchor (midpoint of A/B's `transform.position`, a one-time snapshot)
and §15's default axis itself. `engine/physics/jointMath.ts` (new, pure,
no Rapier import — plain-Vitest-testable) holds the one world↔body-local
conversion site for joint anchors/axes, the joint-specific analogue of
`assetRotation.ts`'s composition pattern. `physicsStore.ts`'s
`PhysicsJointHandle` freezes each joint's local anchors and both bodies'
creation-time rotations **at creation, never recomputed** — this is what
lets `applyJointProps` (a full remove+recreate, since Rapier has no live
setter for axis or for toggling limits-enabled) rebuild a joint after an
axis/limits/motor edit without ever shifting its physical attachment
point, no matter how far the bodies have since moved under simulation.
`startPhysicsSync`'s passive diff (unchanged in spirit from `M3.1`) now
also adds/removes joints by id and calls `applyJointProps` whenever an
already-tracked joint's array reference changes — **the only bridge
from `updateJoint` to live physics at this point in the build**, since
no `historyStore` wrapper exists for joints yet (`M4.2`/`M4.3`'s job).
D3's Play-press snapshot is now two sibling fields on `simulationStore`
— `snapshot` (bodies, unchanged) and `jointMotorSnapshot` (new, read
straight from `sceneStore.joints`, since Rapier's joint objects expose
no "current motor target" getter). `reset()` restores it by writing the
snapshotted `motor` back into `sceneStore.joints` — deliberately unlike
`restoreBodies`, which writes straight into Rapier — relying on the
passive sync above to mirror the revert into physics, the same path a
live `M4.3` motor edit during Play would take; it only replaces a
joint's array entry (and marks `isDirty`) when its motor actually
differs from the snapshot, so a Reset with zero live-edited joints never
touches `sceneStore.joints` at all. `draftStore.ts`'s `SceneJSON.joints`
is now real (was a hardcoded `[]`) and `loadDemoScene` remaps every
joint's `objectA`/`objectB` through the same placeholder-id→fresh-UUID
map built for objects, so a joint-bearing demo (`M4.6`) can't end up
with dangling references. `SceneHierarchyPanel.tsx` nests each joint
under its `objectA`'s row (D19: display-only, never a transform parent)
as a plain, non-interactive `<div>` — selection/editing starts at `M4.3`.

**Joint creation UX (`M4.2`)**: `components/PropertiesPanel/
JointCreationFlow.tsx` is §15's flow, mounted in `PropertiesPanel.tsx`'s
single-object view — its own local wizard state (never `sceneStore`
until Create), progressive disclosure (Object B picker waits for Type;
Axis/Limits/Motor waits for both Type-is-Revolute/Prismatic *and*
Object B). Reuses `M4.1`'s exported `hasJointBetween`/`isSelfJoint`
directly for the Object B picker's exclusion filter — no second
validation implementation. `historyStore.ts`'s new `'jointCreate'` entry
+ `recordedCreateJoint` is the one path any future joint-creating UI
(`M4.7`'s Robot Arm assembly, `M8.1`'s context menu) should call — like
every `recorded*` wrapper it's the D2 guard and the D25 undo entry in
one place. **It never calls a `physicsStore` function directly** (unlike
`recordedUpdateTransform`/`recordedUpdatePhysics`) — `M4.1`'s passive
`startPhysicsSync` diff already reacts to `sceneStore.joints` changing,
so a plain `useSceneStore.setState` splice on undo/redo is enough;
physics reacts on its own. `M4.3`'s persistent Joint properties section
is a deliberately separate component from `JointCreationFlow` — nothing
here is meant to be reused between "create" and "edit after creation"
beyond the shared `JointEntity` types.

**Joint properties panel + joint selection (`M4.3`)**: `sceneStore.ts`
gained `selectedJointId: string | null` + `selectJoint(jointId)` — a
**new selection kind mutually exclusive with `selectedIds`** (selecting
a joint clears `selectedIds`, and vice versa via `select`/
`setSelection`/`clearSelection`). This alone makes the viewport's gizmo
disappear for a joint selection with zero changes to `SceneObjects.tsx`
— its `showGizmo` check already keys off `selectedIds.length === 1`.
`components/PropertiesPanel/JointPropertiesSection.tsx` is the one
shared field-renderer for §19's Joint section (Type read-only, Axis/
Limits/Motor/Speed for non-Fixed types), used both auto-shown (a single
selected object that's the endpoint of exactly one joint, alongside
Transform/Physics) and as the panel's sole content (a joint's own
Hierarchy row directly selected — now a real `<button>` calling
`selectJoint`, not the non-interactive placeholder `M4.1` shipped).
`historyStore.ts`'s `recordedUpdateJoint` (new `'jointUpdate'` entry,
whole-object before/after like `'transform'`/`'physics'`) is every
field's commit path **except** Motor Speed while `playing`. D2's one
named exception is implemented by calling `sceneStore.updateJoint`
directly instead of the recorded wrapper (mirroring `TransportBar
.tsx`'s Speed buttons, `M3.5`'s precedent for a D2-lock-exempt control),
which is also *why* that edit is un-undoable (D25) — there's no history
entry pushed in the first place, not a special-cased guard. `M4.1`'s
already-built passive physics sync is what pushes the live value into
Rapier; no new physics-side code was needed here.

**Joint viewport indicators (`M4.4`)**: `engine/scene/JointIndicators
.tsx` (mounted in `SceneContent.tsx` after `<SceneObjects />`) renders a
thin torus at a Revolute joint's anchor, a thin cylinder along a
Prismatic joint's axis, and nothing for Fixed. Both re-derive the
joint's **current** world anchor/axis every frame from `M4.1`'s already-
frozen `PhysicsJointHandle` local geometry plus the two connected
bodies' *live* pose, via two new `jointMath.ts` helpers
(`localPointToWorld`/`localVectorToWorld`, the exact inverses of `M4.1`'s
`worldPointToLocal`/`worldVectorToLocal`) — no new store state anywhere.
The anchor is the midpoint of both bodies' transformed local-anchor
points (so a gizmo-dragged single body while `idle` shifts the
indicator partway, converging once `playing` re-enforces the
constraint); the axis is derived from Object A's side only (the same
asymmetric simplification `M4.1`'s prismatic local axis already made —
Rapier has no unambiguous shared world axis once A/B disagree). Both
indicator meshes set `raycast={neverRaycast}` (a no-op — R3F's standard
"never a hit target" idiom) so they can never be clicked/selected,
matching §14. Nothing here is ever written to `sceneStore` or the scene
JSON (D22) — every value is derived, read fresh each frame.

**Joint cascade rules on delete/duplicate (`M4.5`, D5)**:
`recordedRemoveObjects`/`recordedDuplicateObjects` (`historyStore.ts`)
now own the entire D5 cascade — `sceneStore.removeObject`/
`duplicateObject` themselves still touch only `objects`, never
`joints` (that boundary was `M4.1`'s deliberate scope choice, unchanged
here). Deleting a joint endpoint deletes the joint too, as the **same**
single undo step as the object delete (§9) — the `'remove'`
`HistoryEntry` variant gained a `joints` field alongside `entries` for
exactly this. Duplicating a selection containing **both** endpoints of
a joint calls `sceneStore.createJoint` itself (reusing its own D23
anchor computation, never a hand-copied one) to connect only the two
new copies; a selection with only one endpoint never cascades that
joint. Any future object-deleting/duplicating action **must** go
through these two wrappers, never `sceneStore`'s raw actions directly —
skipping them now means silently dangling/missing joints, not just
skipped undo.

**Four more demo scenes (`M4.6`)**: `src/demos/` now has
`rotatingWheel.ts`/`roboticArm.ts`/`slider.ts`/`bouncingBall.ts`
alongside `M3.6`'s `fallingBox.ts` — all five ship bundled (§17).
`Toolbar.tsx`'s `DEMOS` array lists all five (the one surface where
every demo coexists); `EmptyState.tsx`'s `DEMO_SHORTCUTS` keeps idea.md
§24's own fixed **three**-slot layout, with its two `scene: null`
placeholders now filled in (Robotic Arm/Slider are File-menu-only,
never part of that slot count). **`roboticArm.ts`'s object/joint
composition is a documented judgment call**: D20 names four objects
(Base, Arm Segment 1, Arm Segment 2, End Effector) plus "two revolute
joints" but never says which pairs connect — a naive serial chain needs
three. The reading used here: `Base` –[J1]– `Arm Segment 1` –[J2]–
`Arm Segment 2`, with `End Effector` positioned at the tip but **not**
a joint endpoint (kept `static`, never a free-falling unconnected
body). `M4.7`'s live assembly-insertion action must reuse this exact
composition, not derive a second one.

**Robot Arm Assembly library asset (`M4.7`, `M4`'s last task)**:
`assets/assemblies.ts`'s `ROBOT_ARM_ASSEMBLY` is the one V1 Assembly
(D20) — not a `BuiltinAssetDefinition` (it inserts multiple objects/
joints, never a single mesh), so it has its own tiny registry, with
`parts` authored relative to Base and reusing `M4.6`'s demo's exact
layout (kept in sync manually, no shared source of truth — a
deliberate choice). `historyStore.ts`'s
`recordedInsertRobotArmAssembly(origin)` adds four D29-default (static)
objects and creates two motor-off Revolute joints via the existing
`addObject`/`createJoint` actions, pushing **one** `'add'` entry —
`M4.5`'s cascade work already extended that entry shape with a `joints`
field, so no new `HistoryEntry` variant was needed here. Each joint's
anchor is computed fresh by `createJoint` itself (D23), never
hand-derived. `AssetLibraryPanel.tsx`'s "Assemblies" category (empty
since `M2.3`) now shows this one card, rendered outside the generic
built-in `cards` list; `useAssetDrop.ts`'s drop handler branches on the
assembly's key **before** the `getBuiltinAsset` lookup (which would
silently no-op on an assembly key). Any future second Assembly should
follow this same `AssemblyPart[]`/`AssemblyJointSpec[]` shape and its
own `recordedInsert*Assembly` wrapper, not a new insertion primitive.

**Custom asset upload begins (`M5.1`)**: `loaders/AssetLoader/
AssetLoader.ts` — this is §32's own empty spec-named folder, used for
its intended purpose rather than parallel structure elsewhere (the
`M3.5`-established check) — holds `handleFileSelected(file, parse =
parseUploadedFile)`, the **one** shared upload entry point both "+
Upload Asset" (Assets panel) and "Upload CAD" (empty state) call. D11's
25MB cap is enforced before `parse` (a stub `M5.2`-`M5.4` fill in) ever
runs; `parse` is a parameter, not a bare module call, specifically so
tests can inject a spy without depending on unreliable module-export
spy interception. `state/uploadedAssetsStore.ts` is session-scoped
only (never `localStorage`/server) — `M5.2` onward populates `uploads`,
`M5.6` owns the real error UI beyond this task's placeholder
`lastUploadError` flag, `M5.7` renders `uploads` as the "Uploaded"
library category. `components/AssetLibrary/useFileUpload.ts` is the
shared hook — each caller still renders its **own** hidden `<input
type="file">` (a native picker needs a same-call-stack `.click()` from
a real gesture), so the "one implementation" is `handleFileSelected`
itself, not a single shared DOM node.

**GLB/GLTF loader + metadata (`M5.2`)**: `loaders/AssetLoader/types.ts`
is the format-agnostic contract every loader implements —
`FormatLoader = (file: File) => Promise<ParsedAsset>`, plus
`AssetLoadError` (a typed `Error` with `reason: 'corrupt' |
'unsupported'`, never an uncaught exception) — `M5.3`/`M5.4` implement
this same shape without modifying it. `loaders/AssetLoader/
measureObject.ts` is the one shared bounding-box/mesh-count computation
every format loader reuses. `loaders/GLTFLoader/GLTFLoader.ts`'s
`loadGLTF` wraps Three's own `GLTFLoader` with an **empty resource
path** — this is what makes an unresolvable external texture/`.bin`
reference in a `.gltf` degrade gracefully (idea.md §26) for free, via
Three's existing `LoadingManager` tolerance, not anything built here.
`AssetLoader.ts`'s `parseUploadedFile` now really dispatches: `.glb`/
`.gltf` → `loadGLTF`, everything else → a typed `'unsupported'`
rejection until `M5.3`/`M5.4` land. `uploadedAssetsStore
.UploadedAssetRecord` now extends the loader's own `ParsedAsset` (was a
placeholder `{id, fileName}`); `setUploadError` also takes a `reason`
(`AssetLoadErrorReason | 'oversized'`) so `M5.6`'s error UI can branch
on it directly rather than parsing the message string.

**STL/OBJ loaders (`M5.3`)**: `loaders/AssetLoader/readFile.ts` now
holds the shared `FileReader`-based read helpers (moved out of `M5.2`'s
`GLTFLoader.ts`, its original single consumer). `loaders/STLLoader/
STLLoader.ts`'s `loadSTL` wraps `THREE.STLLoader.parse()` (synchronous,
**throws directly** on malformed input — confirmed empirically, no
callback) in `try`/`catch`; `loaders/OBJLoader/OBJLoader.ts`'s `loadOBJ`
wraps `THREE.OBJLoader.parse()` (also synchronous, but **confirmed it
does not throw** on garbage text — its parser just warns and skips
unrecognized lines, silently producing an empty `Group`), so `loadOBJ`
itself treats a zero-mesh result as the `'corrupt'` rejection instead.
Both converge on `M5.2`'s same `AssetLoadError` shape either way.
`AssetLoader.ts`'s dispatch is now a `FORMAT_LOADERS` lookup table
(`glb`/`gltf`/`stl`/`obj` → their loaders, `fbx` still `'unsupported'`)
— `M5.4` only needs to add one more entry to it.

**FBX cut (`M5.4`, `.ai/decisions.md`)**: FBX support was evaluated and
**dropped**, per §12's explicit "cutting it is acceptable" allowance —
Three.js ships no `FBXExporter` (reader only), so there was no way to
generate a guaranteed-valid test fixture the way `M5.2`/`M5.3` did for
every other format, and hand-authoring one from the FBX spec is
disproportionate to a fourth, "supported" (not "first-class") format.
`AssetLoader.ts`'s `UPLOAD_ACCEPT` no longer lists `.fbx`;
`AssetFormat`/`detectFormat` still recognize it so a file forced
through anyway gets an accurate typed `'unsupported'` rejection, not a
crash — `FORMAT_LOADERS` simply has no `fbx` entry, so no dispatch code
changed. **This cut is final for the rest of `M5`** — `M5.5`-`M5.7`
should treat GLB/GLTF/STL/OBJ as the complete supported-format set.

**Unit-scale + collision-shape generation (`M5.5`)**: `uploadedAssetsStore
.UploadedAssetRecord` gained `unitScale` (default `1`) + `setUnitScale` —
a value captured **once per upload**, not per placement; every instance
later placed from the same upload reads this same value. `engine/
physics/collectGeometryData.ts` flattens a parsed upload's entire
`Object3D` subtree (commonly several meshes) into one combined,
pre-scaled vertex/index buffer in the root's own local frame — the one
place any future collider/geometry work on an uploaded mesh should read
from, not a second traversal. `physicsStore.ts`'s `colliderDescFor` now
dispatches on `assetRef.kind`: built-ins keep their exact hand-authored
shape (`colliderDescForBuiltin`, unchanged logic); an uploaded object
gets a convex hull (`dynamic`/`kinematic`) or a full trimesh (`static`)
via `colliderDescForUploaded`, degrading to a bounding-box cuboid if
`convexHull()` returns `null` (degenerate geometry) or the upload
record is missing. `applyPhysicsProps` (M3.2's live Body-Type path) now
removes+rebuilds an uploaded object's collider on every Body Type
change (Rapier can't change an existing collider's shape in place) —
skipped entirely for built-ins, whose collider shape never depends on
body type. `rapierTransformFor` no longer assumes a registry
`defaultRotation` exists — an uploaded object composes with identity
instead, per D27's explicit no-up-axis-correction rule.
`historyStore.ts`'s `recordedPlaceUploadedAsset(uploadId, position?)`
places one instance via the ordinary `recordedAddObject` path (reusing
its own undo/naming-collision handling) — `M5.7`'s real click/drag
library-card UI should call this directly rather than reimplementing
placement; it only still needs to add the real unit-scale `<input>` and
the bottom-face-at-Y=0 position computation, both explicitly out of
this task's own scope.

**Upload error handling + progress state (`M5.6`)**:
`AssetLoader.ts`'s `uploadErrorMessage(reason, fileName)` is the **one**
place a rejection reason becomes final, display-ready copy (§26) — every
call site (the size-cap check, every loader's `.catch()`) routes through
it; no raw `Error.message` is ever stored or rendered. `uploadedAssetsStore`
gained `progress: number | null` (`0` → `66` → `null`, coarse
stage-based checkpoints per §24 — never a real byte-level readout, no
loader exposes one for an in-memory `File`); `setUploadError` always
resets it to `null`, so an error and a progress value are never both
live at once. `components/AssetLibrary/UploadStatus.tsx` (mounted once
in `AssetLibraryPanel.tsx`, just under "+ Upload Asset") is the sole
renderer of both states — a determinate progress bar
(`role="progressbar"`, real `aria-valuenow`) or an error panel
(`role="alert"`, a per-reason icon alongside the text per §29's "not
color alone" rule) with a "Try Another File" button wired to the same
`useFileUpload` hook's `trigger`, reusing the one hidden `<input>`
rather than a second file-picker mechanism. **Fixed a real, previously
untested bug while building this task's own "unsupported extension via
forced 'all files' selection" test**: `detectFormat`'s fallback used to
silently return `'gltf'` for any unrecognized extension instead of
routing to the `'unsupported'` rejection — harmless only as long as
nothing ever exercised that path; it now returns `null`, which
`parseUploadedFile` treats identically to a recognized-but-cut format
like `.fbx`.

**"Uploaded" asset library category (`M5.7`, M5's last task)**:
`AssetLibraryPanel.tsx`'s "Uploaded" category (and "All", mirroring the
Robot Arm Assembly's own precedent) now renders a real card per
`uploadedAssetsStore.uploads` entry; click-to-add and
`useAssetDrop.ts`'s new third branch (tried after the assembly-key and
builtin-key checks) both place through `recordedPlaceUploadedAsset`
(`M5.5`) with a position from the new `assets/placement.ts`'s
`getUploadedBottomOffsetY(object, unitScale)` — the upload equivalent of
`getBottomOffsetY(key)`, measuring the parsed `Object3D` directly (no
shared registry geometry exists for an upload) and scaling by
`unitScale` since an uploaded instance's initial scale isn't always
`[1,1,1]` the way a built-in's is. **A placed uploaded object is now
actually visible in the viewport** — the gap every M5.1-M5.6 memory file
flagged as still open. `engine/scene/UploadedObjectMesh.tsx` is a new
component, deliberately separate from `SceneObjects.tsx`'s
`SceneObjectMesh` (an upload's parsed content is an arbitrary, often
multi-mesh `Object3D` subtree, which doesn't fit
`SceneObjectMesh`'s one-shared-`BufferGeometry` assumption);
`SceneObjects()` dispatches between the two by `object.assetRef.kind`.
`UploadedObjectMesh` wraps a **clone** of the upload's stored `Object3D`
(`record.object.clone(true)` — the store's own object is shared across
every placed instance, and an `Object3D` can only have one parent) in a
`<group name="scene-object-mesh">`, reusing the exact same interaction
contract as the built-in path (click-select, gizmo, D2 lock, §20
snapping — duplicated locally rather than shared, since the two
components don't otherwise share a module — D3/M3.3 physics sync).
Rotation is set directly with no `composeMeshQuaternion` step, matching
D27's no-tilt rule for uploads (`M5.5`). **Selection outline reuses
`SelectionOutline` unmodified** via an invisible proxy `<mesh>` sized to
a `Box3` computed from the cloned subtree (exact, not the stored
width/height/depth-only metadata) — drei's `<Outlines>` needs its
immediate parent to be a `Mesh` with `.geometry`, which an arbitrary
multi-mesh upload doesn't have at the group level, so the proxy gives it
one rather than building per-mesh outlining. **Uploaded assets remain
strictly session-scoped** (D10/`M6.10` builds real persistence later) —
confirmed by test, no `localStorage` or other client-only persistence
was added. Found and worked around (not fixed — out of scope, predates
this task) a real gap in `M2.3`'s `AppShell.dragdrop.test.tsx`: every
camera there looks straight down at the origin, so its tests can't
distinguish a successful raycast hit from a fallen-back-to-origin one;
`AppShell`'s real mounted `<Canvas>` reports a zero-size `domElement`
under jsdom, so a manually-seeded test camera gets clobbered by
`ViewportBridgeSync` before a synchronous drop event fires. New
`useAssetDrop.test.ts` (the hook had no direct unit tests before) covers
the real hit-point path at the hook level instead.

**Backend scaffold (`M6.1`, start of `M6`)**: `server/` is a separate
npm project (own `package.json`/`tsconfig.json`/`node_modules`), never
touched by the frontend's Vite build (spec §32, confirmed: `npm run
build` at the repo root is unaffected by `server/`'s presence).
`server/src/db.ts` owns the one shared `pg.Pool`, built from
`DATABASE_URL` alone. **`pool.on('error', ...)` is required** — `pg.Pool`
emits an `'error'` event on the pool itself when an idle, already-
connected client is dropped by the server (e.g. Postgres stopping), and
with no listener Node's default behavior is to throw and crash the whole
process; found this the hard way by actually stopping the dev
`docker-compose` Postgres mid-session (the task's own verification loop,
step 4), not via the automated suite — an automated test pointed at a
port nothing listens on only exercises "never connected," not "was
connected, then dropped," and only the second needs this handler.
`server/src/app.ts`'s `createApp(pool?)` takes an optional `Pool`
(defaulting to the shared one) purely so `app.test.ts`'s "Postgres
unreachable" case can inject a second **real** `pg.Pool` pointed at a
dead port — D36 forbids mocking the persistence layer, even for a test
of the route's own error-handling control flow, so this is real
dependency injection, not a stub. `server/src/migrate.ts`'s
`runMigrations()` (hand-written SQL under `server/migrations/`, tracked
in a `schema_migrations` table, transactional per-file) is reused by
both the `npm run migrate` CLI entry point and the test suite's own
`beforeAll` — no separate test-schema-setup path. `scenes`
(`device_id`/`name`/`document` JSONB holding D22's scene JSON/
timestamps) and `assets` (`device_id`/`filename`/`format`/`file_size`/
`storage_key`/timestamp) are structure-only at this point — no
`users`/`sessions` table anywhere (D1). `server/docker-compose.yml` is
the one dev/test Postgres instance (D36's own "docker-compose for
dev/test" wording). **This sandbox's Docker access needed a one-time
`sudo usermod -aG docker dev` from the user** (no passwordless sudo, no
existing `docker` group membership) — every `docker`/`docker-compose`
invocation in this task's own session used `sg docker -c "..."` to
activate the new group without a full re-login; a normal terminal opened
after that group change needs no such wrapper.

**Device identity (`M6.2`)**: `src/utils/deviceIdentity.ts`'s
`getDeviceId()` (D18) is a plain function, not a store — infrastructure,
deliberately outside `sceneStore`/any Zustand store, since nothing needs
to react to it changing (it never does, after the first call).
`src/utils/apiClient.ts`'s `apiFetch(path, init?)` is now the **one**
shared entry point for every future backend call — attaches
`X-Device-Id` automatically via a `Headers` merge (never clobbers
caller headers), prefixes `import.meta.env.VITE_API_BASE_URL`
(`http://localhost:3001` fallback). **`M6.3` onward must call this, not
a bare `fetch()`** — bypassing it silently omits the one header every
protected backend route requires. `server/src/middleware/
deviceIdentity.ts`'s `requireDeviceId` is the backend half — 400s with a
typed JSON error on a missing or non-UUID `X-Device-Id`, otherwise sets
`req.deviceId` (typed via `server/src/types/express.d.ts`'s
`express-serve-static-core` augmentation) and calls `next()`. **`GET
/_debug/device-id`** in `server/src/app.ts` is a **placeholder route**
(explicitly commented as such) mounting `requireDeviceId` purely so this
task's own tests/verification loop have something real to hit before
`M6.3`'s actual scene routes exist — **`M6.3` should delete it** once a
real protected route is mounted, not build around it. Also fixed: the
root `vite.config.ts`'s Vitest config now excludes `server/**` — without
it, the default include glob picked up `server/dist/*.test.js` (the
backend's own compiled build output) and tried to run it under the
frontend's jsdom environment, failing on a missing `DATABASE_URL`;
`server/` has its own separate `vitest.config.ts`/`npm test`, so this is
the correct boundary between the two suites, not a workaround.

**Scene CRUD endpoints (`M6.3`)**: `server/migrations/
0002_scenes_soft_delete.sql` adds `scenes.deleted_at` — D17 requires
"deleted" and "never existed" be distinguishable on a later fetch, which
a hard row delete can't express. `server/src/routes/scenes.ts`'s
`createScenesRouter(pool)` (mounted at `/scenes`, `requireDeviceId`
applied to the whole router) keeps `name`/`device_id`/timestamps as
dedicated columns and stores everything else the client sends
(`schemaVersion`/`objects`/`joints`/`simulation`) in `document` JSONB —
`toDocument()`/`toSceneResponse()` are the one strip/reassemble pair,
no second place constructs a scene response. **D8 in one sentence: `GET`
never checks ownership (only `isOwner` in the body differs); `PUT`/
`DELETE` both 403 a non-owner before touching the row.** `findScene()`'s
three-way return (`SceneRow | null | 'not-found'`) is D17's real/
soft-deleted/never-existed distinction as actual code, not just a status
code choice — `null` → `410 {status:'deleted'}`, `'not-found'` → plain
`404` (a malformed non-UUID `:id` is caught and mapped to the same
`'not-found'`, never a raw DB error). `app.ts` gained a trailing 4-arg
Express error handler — Express 5 auto-forwards a rejected async
route-handler promise there, turning any unexpected failure into a JSON
`500` instead of Express's default HTML page. `M6.2`'s `/_debug/
device-id` placeholder is gone; `/scenes` is what it was standing in
for. **`M6.5` must call these through `M6.2`'s `apiFetch`**, branching
on `410` (D17's "this scene was deleted" state) vs `404` (bad link) vs
`403` on a write (D8's non-owner sandbox) — none of that branching logic
exists yet, this task only built the endpoints. D9's fork needs no
separate endpoint — it's `POST /scenes` called with the current
in-editor state; D13's share link needs no separate endpoint either — a
scene's `id` (from `POST`'s response) already **is** the link address.
Also fixed: `server/vitest.config.ts` itself had the same dist-pollution
gap `M6.2` fixed on the frontend side — `npm run build` inside `server/`
populates `server/dist/*.test.js`, which would double-count every
backend test without its own `dist/**` exclude.

**Uploaded-asset server-side storage (`M6.4`)**:
`server/migrations/0003_assets_blob_storage.sql` adds `assets.data
BYTEA` — the file's bytes live directly in the row (D6a's "backed by
the same database" latitude), not a separate object-storage service;
`storage_key` (M6.1's placeholder) is now nullable and unused by this
choice, kept for a possible future migration. `server/src/routes/
assets.ts`'s `createAssetsRouter(pool)` (`/assets`): `POST /`
(`requireDeviceId` + `multer` memory storage, `limits.fileSize` = 25MB)
enforces D11's two caps with **distinct `reason` strings** —
`'file-too-large'` (multer's own `LIMIT_FILE_SIZE`, caught in the
route's callback) vs `'device-cap-exceeded'` (a fresh `SELECT
COALESCE(SUM(file_size),0)` per upload, never a separately-maintained
counter that could drift). **`GET /:id` has no `requireDeviceId` at
all** — D10 requires any device opening a shared link to fetch the
asset it references, regardless of uploader; this is the one
intentionally-ungated read in the whole API. No `DELETE` route exists
anywhere (D12: indefinite retention, no cascade/expiry). **`M6.10`
is the first real consumer** — it should `POST` each of a scene's
session-only (`M5`) uploads here on Save, using the returned id as the
`assetRef.key` D22 already expects.

**Frontend Save/Load wiring (`M6.5`, first real frontend↔backend
consumer)**: D31's inline toolbar scene-rename didn't exist despite this
task's own file assuming it did (`.ai/decisions.md`'s `M6.5` entry) — now
minimally real: `sceneStore.ts` gained `name`/`renameScene` (exported
`DEFAULT_SCENE_NAME`), `components/Toolbar/SceneNameEditor.tsx` is the
click-to-edit control (reuses `useCommitOnBlur`; its Escape handling
needs an explicit `if (e.key === 'Escape') setEditing(false)` wrapper
around the hook's own `onKeyDown`, since the component's local `editing`
boolean and the hook's internal one are different state — caught by this
task's own test, not left as a latent bug). `state/persistenceStore.ts`
(new) owns `sceneId`/`isOwner`/`saveStatus`/`myScenesOpen`/`myScenes`/
`listStatus` plus `save`/`fetchScene`/`openMyScenesPanel`/
`closeMyScenesPanel`/`deleteScene`/`resetSaveState`. **It has zero
dependency on `draftStore.ts`** — `save(document)` takes an
already-serialized `SceneJSON` as a parameter instead of importing
`serializeDraft` itself, which is what lets `draftStore.ts` safely
import `persistenceStore` (to reset `sceneId`/`isOwner` in `newScene`/
`loadDemoScene`) without the two modules forming an import cycle — get
this direction backwards in a future task and they will cycle.
`draftStore.ts`'s new `openSavedScene(id)` is Load's actual draft
replacement — structurally identical to `loadDemoScene` except **object/
joint ids are kept exactly as fetched, never regenerated** (this is the
same scene being reopened; a later Save must `PUT` the same rows, unlike
a demo's placeholder ids, which must never collide across loads).
`Toolbar.tsx`'s Save button computes `canOverwrite = sceneId !== null &&
isOwner` for D8/D9's "Save" vs. "Save as new scene" relabeling; its
"Load" button wraps `openMyScenesPanel` in `confirmDiscard` — **this is
the one D4 guard point, not a second one per row** — safe because
`components/MyScenes/MyScenesPanel.tsx` is a modal (blocks the rest of
the app while open), so `isDirty` cannot change between the guard and a
row's Open click. **Delete deliberately never wraps `confirmDiscard`** —
that guard is specifically about discarding the *current in-editor
draft*, and deleting a different, already-saved scene doesn't touch
`sceneStore` at all; an earlier pass at this task mistakenly wrapped it
before removing it. `components/Viewport/EmptyStateActions.tsx` (new)
factors the "+ Add Asset / Upload CAD / try a demo" row out of
`EmptyState.tsx` verbatim (with an optional `onAction` callback) so
`MyScenesPanel`'s own empty state reuses it exactly, per this task's own
"the same shortcuts as §23's empty state" wording — not a second
hand-copied implementation. No interactive browser check was possible
this session (no browser tool connected); verified via component tests
exercising real `fetch` calls against a mocked network layer, plus
`curl`-confirmed CORS preflight (`OPTIONS /scenes` → `204` with the
right `Access-Control-Allow-Headers`) against the live backend from the
frontend dev server's actual origin.

**Shareable links (`M6.6`)**: no routing library — `/scene/:id` is the
only URL pattern this app ever needs, so `src/utils/shareLink.ts`'s
`parseShareLinkId(pathname)` (a plain regex) is the whole "router."
`persistenceStore.ts`'s `fetchScene` **contract changed** from `M6.5`'s
`SavedScene | null` to a real discriminated `FetchSceneResult`
(`ok`/`deleted`/`not-found`/`error`, derived from the response's HTTP
status — `410` vs `404` — never the body) — D17 needs deleted and
not-found to render as genuinely different states, which the old
collapsed-`null` shortcut couldn't express; `M6.5`'s `openSavedScene`
was updated to match. `draftStore.ts`'s scene-replacement logic is now
a shared private `applySavedScene(scene)`, used by both `openSavedScene`
and the new `openSharedScene(id)` (the latter drives
`persistenceStore.linkOpenStatus` instead of a boolean). `main.tsx`'s
post-`initPhysics()` branch: a `/scene/:id` URL calls
`confirmDiscard(() => openSharedScene(id))` **instead of**
`initFirstTimeExperienceIfNeeded()` — an explicit link always wins over
the empty-scene demo check; the D4 guard here is a no-op today
(`isDirty` is always `false` right after `restoreDraftOnStartup()`) but
kept for consistency with every other `confirmDiscard`-guarded
scene-replacing action. `Toolbar.tsx`'s non-owner banner
(`role="status"`) needed **no new state** — `sceneId !== null &&
!isOwner` is exactly `M6.5`'s existing fields — and D9's fork needed
**zero new code**, since `M6.5`'s `save()` already routes that same
condition to `POST`. **D8's "fully interactive sandbox" needed zero new
code anywhere else** — confirmed by grep, nothing outside the
persistence-specific files references `isOwner` at all, so camera/
selection/gizmo/joints were never gated on ownership to begin with.
`components/MyScenes/ShareLinkStatusOverlay.tsx` (new) shows the
deleted/not-found/error message, reusing `MyScenesPanel`'s own modal
CSS rather than a third visual treatment; dismissing resets the URL to
`/` via `history.replaceState`. **Any future deployment/hosting setup
must configure an SPA fallback** (serve `index.html` for `/scene/:id`)
— Vite's dev server already does this for free, confirmed live; a
production static host needs the equivalent rule explicitly, not yet
documented anywhere (`## Deployment` is still empty).

**Sharing UI (`M6.7`, last of the M6.5-M6.7 "persistence becomes
visible" trio)**: `components/Toolbar/SharePopover.tsx` is a **bespoke**
small popover, not a reuse of `components/ui/Dropdown` — `Dropdown`
always wraps its `trigger` in its own plain `<Button>`, which can't host
an icon-only `IconButton` (accessible label + tooltip + focus ring,
§29) without nesting two `<button>` elements; it copies `Dropdown`'s own
outside-click/Escape-close `useEffect` pattern rather than modifying
that shared component. **Enabled purely on `sceneId !== null` —
deliberately not gated on `isOwner`**, since D32 never restricts
sharing to owners. Builds the URL client-side as
`${window.location.origin}/scene/${sceneId}` (the inverse of `M6.6`'s
`parseShareLinkId`) — no new backend call. `navigator.clipboard
.writeText` is called from **exactly one place**, this popover's own
Copy button — confirmed by a regression test that `persistenceStore
.save()` alone never touches the clipboard (D32's explicit "Save and
copy are separate actions"). **Testing the "Copied" label's `setTimeout`
revert needs `act(() => vi.advanceTimersByTime(...))`**, not a bare
call — otherwise the `setState` inside the timer callback doesn't flush
into the DOM before the next assertion; no prior test in this codebase
exercised a timer-driven `setState` revert before this task.

**Backend-down resilience (`M6.8`)**: `utils/apiClient.ts`'s `apiFetch`
binds every request to `AbortSignal.timeout(10_000)` — a stopped
backend fails `fetch()` almost instantly (~7ms, confirmed live) for
free, so this specifically covers a backend that accepts a connection
and then never responds, D15's "never blocks the editor" applied to
that one remaining case. `persistenceStore.ts`'s `saveStatus` gained
`'forbidden'` (D8's `403`) as a case **distinct from** `'error'`
(connectivity failure) — never relabel one as the other. `lastSaveDocument`
+ `retrySave()` resubmit the exact last document verbatim;
`dismissSaveError()` clears the error without discarding it. `deleteScene()`
now returns `Promise<boolean>` (was `void`) so callers can detect
failure. **Every failure path is proven to leave `sceneStore` untouched**
— `save()`'s `catch` only ever calls `set()` on `persistenceStore`
itself. `MyScenesPanel.tsx`'s row-level Open/Delete errors are **local
component state** (`rowError`), not global store state — ephemeral,
panel-scoped feedback that doesn't need to outlive the panel.
`ShareLinkStatusOverlay.tsx`'s Retry only appears for `'error'`, never
for `'deleted'`/`'not-found'` (real, stable outcomes retrying can't
change). **Reconfirmed by grep** (same check `M6.6` first ran) that the
core editing loop still references none of `isOwner`/`usePersistenceStore`/
`apiFetch` anywhere outside the eight files M6.5-M6.8 collectively
touch — the "backend-down never blocks core editing" acceptance
criterion is true by construction, not an added exemption.

**Resume last-active-scene (`M6.9`)**: `src/utils/lastActiveScene.ts`
(new) is a plain `localStorage` pointer, D43's own "last-**opened**, not
last-updated" pointer — written at exactly four points: `persistenceStore
.save()` on every successful save (covers both first-save and fork, one
write site for both), `draftStore.openSavedScene` (My Scenes Open,
always — every such scene is already owned) always, and `openSharedScene`
(a `/scene/:id` link) **only when `scene.isOwner`** — a non-owner's visit
must never become what this device resumes to next time. Never cleared
by `newScene()`/`loadDemoScene()` — there's no "clear" trigger named
anywhere, only overwrite-on-the-four-events. `draftStore.tryResumeLastActiveScene()`
reads the pointer, fetches it, and on `status:'ok'` replaces the draft via
the same private `applySavedScene` helper `openSavedScene`/`openSharedScene`
already share (ids kept as-is); every other `FetchSceneResult` (deleted/
not-found/error) collapses to one `false` — D14 treats "can't resolve"
uniformly, no special network-failure case. **Doesn't itself check for an
existing local draft** — that precedence lives in `main.tsx`, which now
runs: `/scene/:id` (D13, always wins) → local draft already restored (do
nothing) → `tryResumeLastActiveScene()` → if `false`, `initFirstTimeExperienceIfNeeded()`
unchanged. **`initFirstTimeExperienceIfNeeded()` itself needed zero logic
changes** — its own `hasSeenBefore()` check already means a *returning*
device whose last-active scene got deleted lands here too but correctly
skips the one-time hint, so "zero scenes ever saved" and "last-active
scene deleted" fall into the same bucket for free. **Avoided a real
circular-import risk**: the resume-vs-first-time decision deliberately
stays in `main.tsx` rather than moving into `draftStore.ts`, since
`firstTimeStore.ts` already imports `loadDemoScene` from `draftStore.ts`
— `draftStore.ts` importing `firstTimeStore.ts` back would cycle.

**Wire uploaded-asset persistence (`M6.10`, `M6`'s last task)**:
`UploadedAssetRecord` (`uploadedAssetsStore.ts`) gained `file: File` (the
raw bytes it was parsed from — never previously retained, needed to
re-`POST` without re-prompting) and `serverAssetId: string | null`;
`cacheResolvedAsset(assetId, parsed, file)` adds a record **keyed by the
server asset id itself**. `state/persistUploadedAssets.ts`'s
`persistUploadedAssetsForSave(document)` is the save-time step:
`POST`s each not-yet-`serverAssetId`'d uploaded object's bytes to
`M6.4`'s `/assets`, remaps `assetRef.key` to the returned id in a **new**
document (the live store records are only ever given a `serverAssetId`,
never rewritten in place), and aborts with a specific D11 cap message on
the first failed upload — never a partially-saved scene. `persistenceStore
.save()` calls this **before** its `/scenes` write and sends the remapped
document; a new `saveErrorMessage` field carries the specific cap text
into `SaveErrorBanner` (falling back to the existing generic D15 message
when unset). The other half — rendering a persisted upload in a session
that never itself parsed it (any device after `M6.6`'s share link, or the
owner after a reload, since `uploadedAssetsStore` never survives either)
— is `loaders/AssetLoader/resolveRemoteAsset.ts`'s
`ensureRemoteAssetResolved(assetId)`: fetches `GET /assets/:id` (D10,
ungated), re-parses via the same `FORMAT_LOADERS` table a fresh upload
uses (now exported from `AssetLoader.ts`), and caches the result so
`UploadedObjectMesh`'s and `physicsStore`'s existing `uploads.find(u =>
u.id === key)` lookups resolve it with zero new code on their end.
`UploadedObjectMesh` calls it from a `useEffect` whenever its own lookup
comes back empty; `physicsStore.colliderDescForUploaded` does the same
fire-and-forget in its pre-existing "no record" fallback branch, though
that specific body creation still gets the placeholder-cuboid collider
either way — physics body creation is synchronous, the fetch isn't; only
a *later* rebuild (e.g. a Body Type change) can pick up real geometry
this way, a known and accepted gap since the task's own acceptance
criteria are about viewport rendering, not first-load physics fidelity.
**A `File` built from a fetched `Response`'s `.blob()` reads back as its
own `"[object Blob]"` string under jsdom's `FileReader`** (a cross-realm
Blob/File interop gap, the same family as `M5.2`'s `.arrayBuffer()`/
`.text()` finding, hit from the opposite direction) — fixed by reading
`response.arrayBuffer()` instead, which works identically in real
browsers.

**Export Scene (`M7.1`, start of `M7`)**: `state/exportScene.ts` is the
whole feature — `buildExportDocument()` calls `serializeDraft()` (the
same serializer `M6.5`'s Save uses, so Export always reflects **current
in-editor state**, never a last-saved snapshot, per §27) and adds D22's
export-only `assets` array; **one `uploadedAssetsStore.uploads` lookup
by id covers both** a session-fresh upload (`M5`) and an
already-`M6.10`-resolved server asset (that store is keyed by the server
id once resolved) — only a never-touched-this-session server asset falls
through to a direct `GET /assets/:id` (`M6.4`) for raw bytes, no full
re-parse needed since Export only wants bytes, not a mesh. Aborts on the
first failed fetch, never producing a partial file. `id` is included
only when `persistenceStore.sceneId` is set; `createdAt`/`updatedAt` are
**never** included — this client doesn't cache the server's timestamps
anywhere, and D22 defines them as server-set values, so a client-
computed "now" would misrepresent the schema rather than honor it.
`useExportStore` (`status`/`errorMessage`/`exportScene(download?)`/
`dismissError()`) takes `download` as a parameter (default the real
`utils/downloadFile.ts#downloadTextFile`) purely for spy-testability —
the same DI pattern `AssetLoader.ts`'s `handleFileSelected(file, parse?)`
already established. `downloadTextFile` (new, generic — not
Export-specific) is the one shared `Blob` → `URL.createObjectURL` → a
hidden `<a download>` click → `revokeObjectURL` primitive; any future
download feature should reuse it. `loaders/AssetLoader/readFile.ts`
gained `readAsBase64` (via `FileReader.readAsDataURL`, stripped to the
part after the first comma) alongside its existing `readAsArrayBuffer`/
`readAsText` — same established convention. `Toolbar.tsx`'s File menu
has an unconditionally-available "Export Scene" entry (§27: no save-state
gating) plus a new `ExportErrorBanner.tsx` (mounted alongside
`SaveErrorBanner`, reusing its CSS classes — visually identical
retryable-inline-error banner) for the one failure mode Export has: a
server asset fetch that couldn't complete.

**Import from file (`M7.2`, `M7`'s last task)**: `state/importValidation.ts`
(pure, no store imports) holds `validateImportedScene(raw)` — §27's
order exactly (required top-level fields → `schemaVersion` supported →
every uploaded object resolves within `assets`), returning the first
failure only; `ImportedSceneJSON` is a **type alias for `M7.1`'s own
`ExportSceneJSON`**, one shape not two. A dangling asset reference and
every other structural problem share one generic message; only a
`schemaVersion` newer than supported gets its own D22-mandated wording.
`loaders/AssetLoader/importedAssets.ts`'s `decodeAndRegisterImportedAssets`
reverses `M7.1`'s base64 embedding and registers each entry via `M6.10`'s
`cacheResolvedAsset` — no new registration mechanism; an unparseable
entry is skipped, not fatal, matching `M5.7`'s existing degrade path.
`draftStore.ts`'s `loadDemoScene` is now a thin wrapper over two shared
private helpers, `regenerateIds`/`applyFreshDraft`, extracted so the new
exported `importScene(scene)` (decode assets → regenerate ids → apply)
reuses the exact same tail — behavior-preserving, `loadDemoScene`'s own
test suite passed unchanged after the split. **`scene.id` is never read**
by `importScene` — `applyFreshDraft`'s unconditional `resetSaveState()`
call is the entire "imported scene is always Save-as-new, never an
overwrite" (D9) mechanism. `state/importStore.ts`'s `useImportStore
.importFile(file)` reads/parses/validates **before** ever prompting, then
gates the actual replace behind `confirmDiscard` — since `confirmDiscard`'s
callback runs synchronously (`window.confirm` blocks), the store captures
the user's decision via a boolean flag set inside that callback,
letting `importFile` `await importScene(...)` afterward rather than
firing it off detached; this is a new idiom in the codebase (every prior
`confirmDiscard` call site was fire-and-forget since none needed to await
anything past it). `Toolbar.tsx`'s File menu gained "Import Scene" + its
own hidden `<input accept=".json">` (each caller owns its own hidden
input, `M5.1`'s established convention) and a new `ImportErrorBanner.tsx`
— same visual shape as `SaveErrorBanner`/`ExportErrorBanner` but with no
Retry button, since a rejected file has nothing to retry against.

**Context menu (`M8.1`, start of `M8`)**: `components/ui/useDismissableMenu.ts`
factors `Dropdown.tsx`'s outside-click/`Escape` close behavior out of
that component so the new right-click menu could reuse it verbatim.
Three tiny "request" stores exist purely so a right-click action can
trigger a UI affordance owned by a sibling component: `state/
contextMenuStore.ts` (`open`/`x`/`y`/`openMenu`/`closeMenu` — never
holds *which* object, the menu reads `sceneStore.selectedIds` live),
`state/renameRequestStore.ts` (**replaces** `SceneHierarchyPanel`'s
former local `editingId` state outright — double-click and the context
menu's Rename item both call `requestRename`), and `state/
jointCreationRequestStore.ts` (**replaces** `JointCreationFlow`'s
former local `open` state outright — its own trigger button and the
context menu's Add Joint item both call `requestJointCreation`). Both
swaps are behavior-preserving refactors, not new mechanisms.
`components/ContextMenu/ObjectContextMenu.tsx` (mounted once,
`AppShell.tsx`) is the §21 seven-item menu — every item calls the exact
same action its on-screen equivalent already calls (no new business
logic), `selectedIds.length > 1` shows only Duplicate/Delete (§9), and
the component itself never checks D2's play-lock — every right-click
handler that would open it already refuses to while the simulation
isn't `idle`, so the menu simply never appears. Right-click wiring is
three symmetric entry points, all doing the identical select-first (only
if not already selected — a multi-selected member stays multi) →
`openMenu(clientX, clientY)` sequence: `SceneObjects.tsx`'s
`SceneObjectMesh` and `UploadedObjectMesh.tsx` (`onContextMenu` on the
mesh/group, calling **both** `e.stopPropagation()` — R3F level — **and**
`e.nativeEvent.stopPropagation()` — native DOM level, since the whole
`<canvas>` is one element and its contextmenu event would otherwise
bubble to `ViewportRegion`'s own wrapper regardless of R3F's internal
raycast routing), `SceneHierarchyPanel.tsx`'s `HierarchyRow`, and
`ViewportRegion.tsx`'s wrapper (D40: reached only on genuinely empty
space — `preventDefault()` + `clearSelection()`, no menu, mirroring
`SceneCanvas.tsx`'s existing `onPointerMissed` left-click case exactly).
**Gotcha for any future `@react-three/test-renderer` test involving a
non-`click` R3F event**: `fireEvent(el, eventName, data)` builds the
prop name by capitalizing `eventName`'s first letter
(`` `on${eventName[0].toUpperCase()}...` ``) — `'contextmenu'` looks for
`onContextmenu` (lowercase `m`), never matching a real `onContextMenu`
prop; the event name passed to `fireEvent` must match the prop's own
casing (`'contextMenu'`), not the native DOM event's lowercase name.

**Global keyboard shortcuts + tooltip/focus pass (`M8.2`)**: `app/
useGlobalShortcuts.ts` **replaces** `useGizmoModeShortcuts.ts` outright
— one `window` `keydown` listener for D24's entire set (Q/W/E/R,
Delete/Backspace, Ctrl/Cmd+D, Ctrl/Cmd+Z/Shift+Z, Space, Escape, F), each
routed to the exact action its on-screen control already calls, with
zero new gating logic (every action already refuses itself via its own
existing precondition). `Escape`'s "close an open menu, or else
deselect" priority needs no menu-specific logic at all: `state/
dismissableMenuStore.ts` is a plain open-count that `useDismissableMenu`
(`M8.1`) increments/decrements automatically for every `Dropdown`/
`ObjectContextMenu` instance — the global handler just skips deselecting
when the count is nonzero, since the menu's own listener independently
closes it on the same keypress. `F` (frame camera on selection, new)
generalized `CameraRig.tsx`'s preset-only `PresetAnimation` into
`CameraAnimation`, which also interpolates the orbit target (a no-op
for an ordinary preset, since `targetStart === targetEnd` there) —
`cameraViewStore.ts`'s new `frameRequest`/`requestFrame(position)` is
the same one-shot-signal shape as `presetRequest`, sharing its
`nextRequestId` counter safely. A frame move preserves the camera's
*current* offset from the target (direction and distance both), so
framing an object recenters the view without spinning to a canonical
angle; the shortcut handler supplies the target position from
`sceneStore`'s static transform or `playbackBridgeStore.liveTransform`
when set (not idle), mirroring `PropertiesPanel`'s own live-transform
precedent. **Tooltip shortcut hints never rename `aria-label`**:
`IconButton` gained an optional `shortcut` prop that only changes the
*tooltip's* text (`"Play (Space)"`) — the accessible name stays exactly
`label`, since coupling the two would have broken every existing
`getByRole(..., {name: 'Play'})` assertion. A plain-`Button` control
(Duplicate/Delete/Undo/Redo) is instead wrapped directly in `Tooltip` —
same non-goal, the button's own text content is its accessible name,
untouched. `utils/platform.ts`'s `modifierKeyLabel()` produces "Ctrl" or
"Cmd" for this text. Visible focus rings needed **no new CSS** — every
shortcut-bearing control already renders through `Button`/`IconButton`,
which already had a `:focus-visible` rule from `M0.2`.

**Motion/animation pass (`M8.3`)**: §19's "three collapsible sections"
were never actually built collapsible by `M2.6`/`M3.2`/`M4.3` (see
`.ai/decisions.md`'s `M8.3` entry) — `components/PropertiesPanel/
CollapsibleSection.tsx` (new, small, generic) is the toggle itself,
built here as this task's own prerequisite since its acceptance criteria
had nothing to animate without it. Local per-instance `open` state
(default expanded, no persistence across a selection change), a real
`<button>` header with `aria-expanded`, collapse via a CSS
`grid-template-rows: 1fr → 0fr` transition on `var(--transition-fast)` —
no JS height measurement. `PropertiesPanel.tsx`'s Transform/Physics
sections and `JointPropertiesSection.tsx`'s own section both now render
through it, field content unchanged. `TransportBar.module.css`'s new
`.playPauseButton` gives whichever of Play/Pause is currently enabled an
accent highlight (transitioning on the same token) — a second, more
deliberate cue layered on top of `Button`'s own pre-existing `:disabled`
opacity fade. **Audit finding**: `ObjectContextMenu.module.css` (`M8.1`,
built without `design-system`) had no open transition at all — fixed
with the identical `animation: open var(--transition-fast)` +
`@keyframes open` `Dropdown`/`SharePopover` already use (CSS Modules
scope `@keyframes` per-file, so each has its own copy, matching existing
precedent). Every other named surface was already compliant.
`components/ui/motionAudit.test.ts` (new, permanent) recursively scans
every `.module.css` under `src/` (excluding `theme.css`) and fails on
any hardcoded `\d+ms` — the enforced half of the "one place to check"
property; `CameraRig.tsx`'s `TRANSITION_MS`/`SelectionOutline.tsx`'s
`FADE_MS` (both in-Canvas, imperative, already 200ms) are a deliberately
separate, unflagged category — a `useFrame` loop can't read a CSS custom
property without extra runtime coupling. Zero motion was added inside
the Canvas — `M3.3`'s render/physics sync is untouched, confirmed by its
own unmodified test suite still passing.

**Responsive drawer behavior (`M8.4`)**: `app/panelSizing.ts`'s new
`DRAWER_BREAKPOINT = ASSETS_MIN + VIEWPORT_MIN + PROPERTIES_MIN` (900px)
is where Assets/Properties switch from inline to overlay-drawer mode —
derived from the three regions' own existing minimums, not a separately
tuned number. `app/useIsNarrowViewport.ts` is a live `resize`-reactive
hook (not mount-time only). `state/drawerStore.ts` holds `assetsOpen`/
`propertiesOpen`, both default `false` per §28's "never auto-opens"
rule. **`AppShell.tsx`'s core choice**: `AssetLibraryPanel`/
`SceneHierarchyPanel`/`PropertiesPanel` stay continuously mounted at the
same JSX position in both modes — only the wrapping `<div>`'s class/
style/`aria-hidden` change — so a breakpoint crossing never unmounts/
remounts them (which would lose their own internal state, e.g. Assets'
search text). The drawer wrapper is `position: fixed` (never a flex
participant, so it structurally cannot affect `ViewportRegion`'s
width), closed via `opacity: 0; pointer-events: none; transform:
translateX(±100%)` rather than `display: none` so there's something to
animate on `var(--transition-fast)`. Each drawer's ref feeds straight
into `useDismissableMenu` (`M8.1`/`M8.2`) for outside-click/`Escape`
dismissal — the same mechanism every `Dropdown`/the context menu
already use, which also means an open drawer registers into
`dismissableMenuStore`'s count for free, so the global `Escape`
shortcut's menu-close-before-deselect priority already covers it with
no new integration code. `Toolbar.tsx`'s View menu content is now a
`viewMenu` JSX variable, nested one level deeper inside a "More"
`Dropdown` at narrow width instead of duplicated — the one lower-
priority item group this task collapses (free choice, §28 doesn't
enumerate which). Two new `IconButton` drawer triggers appear in the
toolbar only when narrow.

**Full accessibility pass (`M8.5`, `M8`'s last task)**: icon-only
control audit found **zero gaps** — every icon-only button app-wide
already goes through `IconButton` (`M0.2`), which structurally
guarantees an `aria-label` and a `Tooltip`. Contrast audit (D41, WCAG
2.1 AA) found **one real failure**: `--color-border` measured only
~1.1-1.4:1 against the panel backgrounds it borders, far short of the
3:1 UI-boundary minimum — raised to `#767680` (now 3.10-4.32:1).
`components/ui/contrastAudit.test.ts` (new, permanent) computes real
WCAG contrast ratios from `theme.css`'s own tokens and asserts every
text/icon-on-background pairing meets its threshold going forward, not
a one-time manual check. "Not color alone" audit found and fixed two
real gaps — `GizmoModeToolbar`'s and `TransportBar`'s speed buttons'
active/pressed state was signaled by a background-color swap alone (no
icon or shape difference); fixed with an inset `outline` on the gizmo
buttons and `font-weight: 700` on the speed buttons, both layered on
top of the existing color cue, not replacing it. Every other stateful
indicator app-wide was already compliant. Keyboard walkthrough found
one real gap: opening a narrow-width drawer (`M8.4`) didn't move focus
into it, and closing it didn't return focus anywhere — fixed with the
standard accessible-drawer pattern (drawer wrapper gets `tabIndex={-1}`
+ self-focus on open; the toolbar trigger gets a ref + self-refocus on
close), which required converting `Button`/`IconButton` to
`forwardRef` (additive, non-breaking). **A real, previously-latent bug
was found and fixed along the way**: `SharePopover.tsx` (`M6.7`) had
its own independent `Escape`/outside-click listener predating `M8.1`'s
`useDismissableMenu`/`dismissableMenuStore` mechanism, so it was never
registered in the shared open-count — pressing `Escape` to close the
Share popover also fell through to `M8.2`'s global shortcut handler
and incorrectly cleared the current selection at the same time,
violating D24's own "menu-close takes priority, never also deselects"
rule. Fixed by migrating `SharePopover` onto `useDismissableMenu`,
identical to every `Dropdown`/`ObjectContextMenu`.

**Root README (`M9.1`, start of `M9`)**: no root `README.md` existed
before this task (only `server/README.md`, from `M6.1`) — `README.md`
now documents the one linear path §35/D6 requires (clone → frontend
install/dev/build/lint/test → backend install/`.env`/docker-compose/
migrate/dev/test), with every script in both `package.json`s mentioned
verbatim and every mentioned script confirmed to exist. Verified for
real against a fresh local clone (no configured remote in this
sandbox), not just read for plausibility — every documented command
run end to end, including a live frontend↔backend connectivity check
through the frontend's own default base URL.

## Testing

`npm test` (Vitest, jsdom environment). Component tests use React Testing
Library — `render()` + `screen.getByRole`/`getByText`, not snapshot
testing. `src/App.test.tsx` is the pattern to follow. `server/npm test`
(Vitest, node environment, separate `server/vitest.config.ts`) runs
against a real local Postgres — `docker-compose up -d` inside `server/`
first, never a mock (D36).

## Deployment

<!-- How it is built, shipped and run. -->

## Where the build has reached

**M0, M1, and M2 all done** (`M2.1`-`M2.10`: scene store, built-in
shapes/colliders/renderer, asset library UI, scene hierarchy, viewport
selection, transform gizmo + Properties Transform section, multi-select +
Duplicate/Delete/Rename, snapping, undo/redo, local draft autosave/dirty
tracking/New Scene). BUILD.md's "stop and review after each milestone"
applies here, but **the decomposition's own gate milestone is `M3`**
(physics & the core simulate loop), not M2 — **`M3` is now fully done**
(`M3.1`-`M3.7`: Rapier world integration; Physics properties panel live-
bound to bodies, undoable; render/physics sync each frame; Play/Pause/
Reset transport with D3 snapshot/restore and D2 edit lock; simulation
speed control + timeline display; Falling Box demo + demo-loading
mechanism; empty state + temporary first-time experience) — "open the
app, place an object, press Play, watch it fall and land" now works end
to end, at a choice of four speeds, with a live elapsed-time readout, a
File-menu-invocable hand-authored Ground/Platform/Box demo, and an
empty-scene state that offers the same demo plus an Add Asset shortcut
to a first-time visitor. The `M3` gate was reviewed and the build
continued into `M4` (mechanical joints). **`M4` is now fully done**
(`M4.1`-`M4.7`: Fixed/Revolute/Prismatic joints with real Rapier
constraints; D3 snapshot/restore covering joint motor state; a full UI
creation flow with undo/redo; a persistent Joint properties section
with individual joint selection and D2's Motor-Speed-only play-lock
exception; viewport ring/segment indicators that track live joint
transforms; D5's delete/duplicate cascade rules; all five bundled demo
scenes; and the Robot Arm Assembly library asset) — a user can create,
edit, visually see, and correctly delete/duplicate any joint type
entirely through the UI, load any of five demos, and insert a
pre-jointed Robot Arm into an existing scene from the Asset Library.
The build continued into `M5` (custom asset upload). **`M5` is now fully
done** (`M5.1`-`M5.7`: upload UI + client-side 25MB size pre-check;
GLB/GLTF parsing + bounding-box/mesh-count metadata; STL and OBJ
loaders; FBX evaluated and cut per §12's allowance; unit-scale + D28
collision-shape generation; final error-message/progress-bar UI for all
three upload failure modes; a real "Uploaded" library category with
click/drag placement and full viewport rendering) — a
`.glb`/`.gltf`/`.stl`/`.obj` file under the cap now parses into a real
`Object3D` with correct metadata, degrading gracefully on missing
texture/material data and rejecting corrupt input with a typed error
shown as plain-language copy (never a raw exception) alongside a "Try
Another File" recovery action; a successfully parsed upload appears as
a card in the Asset Library, placeable by click or drag exactly like a
built-in, gets the correct D28 collider for its body type (regenerated
live if Body Type changes), its captured unit-scale as initial Scale
with no up-axis correction, and is now fully visible/selectable/
transformable in the viewport. GLB/GLTF/STL/OBJ is the final
supported-format set for this app — `.fbx` is a permanent, recorded
cut, not a temporary gap. The build continued into `M6` (backend &
persistence). **`M6` is now fully done** (`M6.1`-`M6.10`
(backend scaffold: a runnable Express + Postgres API in `server/`,
migrations creating `scenes`/`assets`, a `/health` check that returns a
clean `503` — not a crash — when Postgres is unreachable; device
identity: `X-Device-Id` generated/persisted client-side and validated
server-side, D18's entire ownership mechanism, with no session/cookie
anywhere; scene CRUD: create/save/list/get/delete against real Postgres,
D8's owner-vs-non-owner split, D17's soft-delete distinguishable from
"never existed"; uploaded-asset storage: files stored as Postgres
`bytea`, D11's per-file/per-device caps enforced server-side with
distinct error reasons, reads open to any device per D10; frontend
Save/Load wiring: a user can Save (first-save/fork vs. overwrite per
D8/D9), browse My Scenes, Open, and Delete, all against the real
backend; shareable links: opening `/scene/:id` loads the full editor,
fully interactive for a non-owner short of overwriting Save, D9's fork
always available and never mutates the original, D17's deleted/
not-found states visibly distinct; Sharing UI: a toolbar Share icon
opens a popover with the scene's link and a Copy button, enabled once
the scene has a server id regardless of ownership; backend-down
resilience: every backend call is bounded and fails to a dismissable,
retryable inline error rather than hanging or losing the draft, D8's
`403` shown distinctly from a generic connectivity failure, core
editing confirmed to make zero backend calls; resume last-active-scene:
a returning device with a resolvable last-opened scene lands back in it
automatically on direct load, D43's local-draft-takes-precedence order
respected, a deleted/unresolvable pointer falling back cleanly to the
first-time experience; wiring uploaded-asset persistence: a Save now
uploads any not-yet-persisted custom model referenced by the scene to
`M6.4`'s storage and rewrites the scene JSON to point at the real server
asset id, never re-uploading an already-persisted one, failing the whole
Save with a named-cap message rather than saving a dangling reference,
and a persisted custom model renders correctly for any session that
opens the scene afterward — a different device via a share link, or the
same device after a reload — via a fetch-and-reparse path that plugs
into the exact same lookup every existing consumer already used) — the
sharing loop (M6.6 receive, M6.7 send) is complete end to end, every
persistence-touching action degrades gracefully with the backend down, a
returning visitor's own scene is exactly where they left off, and a
custom uploaded model now survives a Save and is visible to anyone who
opens that scene, closing the last gap `M5`'s client-only upload
handling left open. The build continued into `M7` (file-based export/
import). **`M7.1` done** (Export Scene: a File-menu action, available
regardless of save state, downloads the current in-editor draft as a
self-contained `.json` — D22's schema plus an `assets` array embedding
every referenced uploaded model's bytes as base64, resolved from
whichever place actually holds them and fetched from the server when
needed, failing with a retryable inline error rather than downloading a
partial file). **`M7` is now fully done** (`M7.1`-`M7.2`: Import reads a
user-picked `.json` back in — validating it against §27's exact rules
before ever touching the draft or asking about unsaved changes, then
replacing the draft exactly as opening a demo scene would, with any
embedded uploaded models reconstituted into the session's asset library
and the physics world rebuilt from scratch; a rejected file (bad JSON,
missing fields, a newer `schemaVersion`, a dangling asset reference)
leaves the current draft completely untouched) — a scene exported from
this app now round-trips back in losslessly, including any custom
uploaded model it referenced, and an imported scene is always treated as
a fresh, unowned draft regardless of what id the file itself carries.
The build continued into `M8` (polish pass). **`M8.1` done** (context
menu: right-clicking a selected object in the viewport or Scene
Hierarchy opens the exact §21 seven-item menu — Move, Rotate, Duplicate,
Rename, Add Physics, Add Joint, Delete — with every item wired to its
already-existing real action; right-clicking an unselected object
selects it first; a multi-selection shows only Duplicate/Delete;
right-clicking genuinely empty space opens no menu and deselects (D40);
the whole menu is unreachable while the simulation is playing (D2)).
**`M8.2` done** (every D24 keyboard shortcut now works from anywhere in
the app — Q/W/E/R gizmo mode, Delete/Backspace, Ctrl/Cmd+D, Ctrl/Cmd+Z/
Shift+Z, Space, Escape (menu-close-takes-priority-over-deselect), and a
newly-built `F` that eases the camera to frame the sole selected object
— all routed to already-existing actions with no new gating logic,
never firing while a text field has focus; Duplicate/Delete/Undo/Redo/
Play/Pause each show their shortcut in their tooltip without changing
their accessible name; every one of those controls already had a
visible focus ring from `M0.2`'s primitives). **`M8.3` done** (panel
expand/collapse — newly built, since §19's "collapsible sections" had
never actually been made collapsible — plus transport Play/Pause, now
both animate within 150-250ms; a real inconsistency found and fixed
(the context menu had no open transition at all); every other named
surface confirmed already compliant; a new permanent test enforces no
`.module.css` file anywhere hardcodes its own transition duration going
forward; zero motion added inside the Canvas). **`M8.4` done** (below a
900px breakpoint, Assets/Properties become closed-by-default overlay
drawers reachable via toolbar icons, never compressing the viewport;
the toolbar collapses the View menu behind a "More" trigger; the layout
switches live as the window resizes, with the panels themselves never
unmounting so their internal state survives the switch; drawer open/
close animates within 150-250ms). **`M8.5` done, `M8` (polish pass)
now fully done** (full accessibility pass: icon-only control audit
clean app-wide with nothing to fix; one real WCAG AA contrast failure
found and fixed (`--color-border`) with a permanent automated check
added; two real "color alone" gaps found and fixed (gizmo-mode and
speed-button active states); one real keyboard-focus gap found and
fixed (narrow-width drawers now move focus in on open and return it on
close); one real latent bug found and fixed along the way (the Share
popover's own independent Escape handling could incorrectly also
clear the current selection, now unified onto the same shared
dismissal mechanism every other menu uses)). The build continued into
`M9` (acceptance & delivery). **`M9.1` done** (root `README.md` written
and verified for real against a fresh local clone — every documented
frontend and backend command run end to end, including a live
frontend↔backend connectivity check — with zero fixes needed to either
the README or any `package.json` script).
**`M9.2` done** (full `idea.md` §34/§36 acceptance checklist, run
against the real running frontend+backend): 41 of 46 items confirmed —
2 via real live `curl` round trips against the real backend/Postgres
(Save/Load, including D8 ownership, D13 share-link-is-scene-id, D17
soft-delete-vs-never-existed, and a separate asset upload/download/
oversized-rejection cycle), 1 via direct source inspection (D1's "no
login UI"), 38 by citing the exact currently-passing automated test
that exercises that behavior (761 frontend + 24 backend tests, all
green — several running Rapier's real WASM physics engine, not a mock,
so gravity/collision/joint behavior is computationally, not just
logically, verified). **No browser tool was available this session**
(true since `M6.5`) to literally click through the UI as the task's own
spec demands — raised to the user via `AskUserQuestion` rather than
faked; the user chose a best-effort substitute (see `.ai/decisions.md`'s
`M9.2` entry). The 5 items that genuinely cannot be substituted for
(rendered-frame/pointer-interaction/first-time-user judgment: "Modern
UI loads correctly," "3D viewport works," "Grid and axes work"'s visual
half, "Camera orbit/pan/zoom work," and the §36 end-to-end scenario) are
recorded as `UNVERIFIED`, never a guessed PASS, in
`.ai/memory/M9.2-acceptance-run.md`. **Zero genuine defects were
found** — nothing was filed as a bug fix. `M9.3` (new, small) exists
solely to close the 5-item verification gap once a browser tool is
available; it is the only remaining task in the entire decomposition.
Task-level status: `.ai/manifest.md`.

---

## Working notes

<!-- One file per developer, imported here. An agent file is a staging area:
     past ~80 lines its settled content moves up into the sections above and the
     file is emptied.

     @.ai/agents/AGENT-<NS>.md -->
