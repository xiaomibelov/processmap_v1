# perf/diagram-eventbus-listener-and-raf-coalescing-v1

Contour ID: `perf/diagram-eventbus-listener-and-raf-coalescing-v1`
Launcher Run ID: `20260515T102714Z-14849`
Planner: Agent 1 / Planner
Date: 2026-05-15

---

## GSD Discipline

- GSD availability check performed.
- Commands executed:
  - `command -v gsd` → `/opt/processmap-test/bin/gsd`
  - `command -v gsd-sdk` → `/opt/processmap-test/bin/gsd-sdk`
  - `test -x /opt/processmap-test/bin/gsd` → `PROCESSMAP_GSD_WRAPPER_FOUND`
  - `test -f /root/.codex/get-shit-done/bin/gsd-tools.cjs` → `CODEX_GSD_TOOLS_FOUND`
  - `find /root/.codex/skills -maxdepth 2 -type d -name 'gsd-*'` → 50+ skills found
- GSD mode: **GSD_PROCESSMAP_WRAPPER_PLANNING**
- Implementation: not performed
- Product files: not modified
- Contour: bounded to frontend Diagram/BPMN event/render performance only
- Agent 2 / Agent 3 gates: prepared in this plan

---

## Previous Evidence Source Truth

Four previous related contours closed with `REVIEW_PASS`:

1. `audit/diagram-property-overlays-performance-gsd-v1`
   - Confirmed overlay DOM inflation (8,025 → 10,795 nodes).
   - Confirmed `/bpmn/versions?limit=1` spam.
   - Confirmed non-edit `PUT /bpmn`.

2. `perf/diagram-property-overlays-viewport-culling-v1`
   - Reduced `.fpcPropertyOverlay` from ~180 to ~70 in default viewport.
   - Pan/zoom counts stable, no duplicates on tab switch.
   - No PUT/PATCH from pan/zoom.

3. `fix/bpmn-versions-head-check-dedupe-v1`
   - Reduced versions head-check spam ~80%.
   - Tab switch produced 0 extra `limit=1` calls.

4. `fix/diagram-non-edit-put-bpmn-guard-v1`
   - 4-layer frontend guard implemented.
   - Diagram idle / pan/zoom / selection / tab switch = 0 mutations.
   - 40/40 unit tests pass.

These fixes must not be regressed.

---

## Source / Runtime Truth

Captured at 2026-05-15T10:28:20+00:00:

- Server: `clearvestnic.ru`
- User: `root`
- Working directory: `/opt/processmap-test`
- Git branch: `fix/lockfile-sync-test`
- HEAD: `a9a9d9c5f468d9da63415306da6d34dcd605aa0d`
- origin/main: `d805e1c64c1107b9e3fe6854e031694bf741b187`
- API health: `{"ok":true,"status":"ok","redis":{"mode":"ON","state":"healthy"}}`
- Frontend serving: HTTP 200 OK
- Git status shows pre-existing modifications in frontend files from previous contours (expected and bounded).

---

## Problem Statement

After closing DOM-culling and network/mutation P0, a remaining performance layer involves:

- **EventBus listener accumulation**: `wireBpmnStageRuntimeEvents.js` registers `eventBus.on` for `canvas.viewbox.changed`, `selection.changed`, `commandStack.changed`, and interaction events. No corresponding `eventBus.off` cleanup exists for most listeners. If modeler/viewer instances are recreated, listeners may accumulate.

- **Render/fanout churn on every render**: `useBpmnSettledDecorFanout.js` constructs `readySignal` by reading refs directly on every render (lines 77–80). This creates a new string every render, triggering all five `useEffect` fanout hooks (notes, stepTime, robotMeta, properties, selection) even when instance readiness has not changed.

- **No RAF coalescing for high-frequency viewbox changes**: `canvas.viewbox.changed` handlers in `wireBpmnStageRuntimeEvents.js` (lines 287, 403) call `applyPropertiesOverlayDecorForZoomChange` directly on every event. While `applyPropertiesOverlayDecorForZoomChange` has a zoom-bucket signature guard (line 4092), the handler still fires and computes signatures on every pan/zoom frame.

- **Heavy overlay rebuild on minor events**: `decorManager.js` functions like `applyPropertiesOverlayDecor`, `applyUserNotesDecor`, and `applyInterviewDecor` iterate the full element registry and rebuild DOM overlays. When triggered repeatedly, this causes visible jank.

Goal: reduce recalculation/render burst frequency while preserving all existing behavior and previous fixes.

---

## Runtime Reproduction Plan

See `RUNTIME_NAVIGATION.md` for detailed steps.

Scenarios Agent 2 must baseline and verify:

- **A — Diagram idle with overlays**: observe 15–30s for console/network stability.
- **B — Pan/zoom burst**: 5 fast cycles, record overlay counts and responsiveness.
- **C — Selection burst**: 10 elements, confirm no mutations, note fanout frequency if debug flags enabled.
- **D — Hover burst**: 10 elements, note hover response and overlay flicker.
- **E — Tab return**: Diagram ↔ Analysis ↔ Diagram, Diagram ↔ XML ↔ Diagram.
- **F — Stress loop**: 3 cycles of pan/zoom + selection + tab switch.

Debug instrumentation available:
```js
window.__FPC_DEBUG_SETTLED_FANOUT__ = true;
window.__FPC_DEBUG_IMMEDIATE_FANOUT__ = true;
```
This logs `[SETTLED_FANOUT_PERF]` and `[IMMEDIATE_FANOUT_PERF]` timings to console without changing product code.

---

## Measurement Plan

1. **DOM counts**: `document.querySelectorAll('*').length`, `.djs-overlay`, `.fpcPropertyOverlay`.
2. **Network safety**: `PUT /bpmn`, `PATCH /sessions`, `GET /bpmn/versions?limit=1` counts.
3. **Event/render behavior**: use existing perf counters (`__FPC_SETTLED_FANOUT_PERF__`, `__FPC_IMMEDIATE_FANOUT_PERF__`) if feasible. Avoid adding permanent debug noise.
4. **Responsiveness**: subjective before/after documentation (janky vs smooth).
5. **Listener cleanup**: source-level proof (paired `.on`/`.off`, stable handler refs).

---

## Source Map

### 1. `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`
- **Functions**: `bindViewerStageEvents` (line 221), `bindModelerStageEvents` (line 314), `bindContextMenuRuntimeEvents` (line 68)
- **Role**: Registers all runtime eventBus listeners for viewer and modeler instances.
- **Issues**:
  - `eventBus.on("canvas.viewbox.changed", 1200, ...)` in both viewer (line 287) and modeler (line 403) fires on every pan/zoom and calls `applyPropertiesOverlayDecorForZoomChange` directly.
  - `eventBus.on("selection.changed", 2000, ...)` fires on every selection change.
  - `eventBus.on("commandStack.changed", 900, ...)` in modeler (line 364) triggers `runImmediateEditorFanout`.
  - Only `canvas.destroy` removes the native `contextmenu` listener (line 165). All other `eventBus.on` registrations lack corresponding `eventBus.off` cleanup.
- **Safe change area**: Add RAF coalescing wrapper around `applyPropertiesOverlayDecorForZoomChange` inside the viewbox handler. Add cleanup function return from bind*StageEvents that calls `eventBus.off` for every registered listener.
- **Forbidden area**: Do not change event semantics, priorities, or suppress legitimate events.

### 2. `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js`
- **Function**: `useBpmnSettledDecorFanout` (line 31)
- **Role**: React hook that triggers settled decor fanouts (notes, stepTime, robotMeta, properties, selection) via `useEffect`.
- **Issues**:
  - `readySignal` (lines 77–80) reads `viewerRef.current` and `modelerRef.current` directly on every render without `useMemo`. Because ref reads are not stable across renders, `readySignal` becomes a new string every time, triggering all effects that depend on it.
  - Effect dependency arrays include `readySignal`, `view`, `diagramDisplayMode`, `notesSig`, etc. The `readySignal` churn causes unnecessary fanout runs.
- **Safe change area**: Wrap `readySignal` in `useMemo` so it only changes when the boolean presence of viewer/modeler actually flips. Consider primitive equality guards for other deps.
- **Forbidden area**: Do not remove any fanout category. Do not change signature logic for notes or interview decor.

### 3. `frontend/src/components/process/BpmnStage.jsx`
- **Functions**: `applyPropertiesOverlayDecorForZoomChange` (line 4085), `ensureViewer` (line ~4450), `ensureModeler` (line ~4528)
- **Role**: Main Diagram component. Hosts decor functions and instance lifecycle.
- **Issues**:
  - `applyPropertiesOverlayDecorForZoomChange` computes a zoom-bucket + rounded viewbox signature and guards against identical values, but the function is still invoked on every `canvas.viewbox.changed` event.
  - `ensureViewer` and `ensureModeler` call `bindViewerStageEvents` / `bindModelerStageEvents` once per instance, but there is no explicit teardown of the old listeners when a new instance replaces an old one (except the `modelerDecorBoundInstanceRef` guard for modeler).
- **Safe change area**: Add RAF token ref and coalescing logic inside `applyPropertiesOverlayDecorForZoomChange` or in the event handler. Ensure listener cleanup is wired into instance destroy/unmount.
- **Forbidden area**: Do not change viewport-culling logic. Do not change `applyPropertiesOverlayDecor` data logic.

### 4. `frontend/src/features/process/bpmn/stage/decor/decorManager.js`
- **Functions**: `applyPropertiesOverlayDecor` (line ~1000+), `applyUserNotesDecor` (line 883), `applyInterviewDecor` (line 549), `clearInterviewDecor` (line 188), etc.
- **Role**: Applies and clears all overlay and marker decorations.
- **Issues**:
  - `applyPropertiesOverlayDecor` iterates visible elements, builds DOM nodes, and attaches overlays. Expensive when called frequently.
  - `applyUserNotesDecor` iterates `registry.getAll()` (O(n)).
  - `applyInterviewDecor` is signature-gated but rebuilds all interview overlays when signature changes.
- **Safe change area**: Reduce call frequency via coalescing (callers), not by changing decorator internals.
- **Forbidden area**: Do not change overlay layout math, viewport-culling, or DOM structure.

### 5. `frontend/src/features/process/bpmn/stage/fanout/postStagingFanout.js`
- **Functions**: `runSettledPropertiesFanout` (line 224), `runSettledUserNotesFanout` (line 164), `runImmediateEditorFanout` (line 138)
- **Role**: Dispatches decor apply/clear calls.
- **Issues**:
  - `runImmediateEditorFanout` applies taskType, linkEvent, happyFlow, robotMeta on every `commandStack.changed`.
  - `runSettledPropertiesFanout` applies properties overlay on active instance + clears on inactive.
- **Safe change area**: If immediate fanout proves excessive, consider debouncing inside the event handler (not inside postStagingFanout itself) to preserve existing contract.
- **Forbidden area**: Do not remove fanout categories.

### 6. `frontend/src/features/process/stage/controllers/useBpmnViewportSource.js`
- **Role**: Existing viewport matrix controller with RAF coalescing.
- **Reference pattern**: Uses `frameRef` (line 119), `pendingViewboxRef` (line 120), and a settled timer (line 126). This is the canonical RAF/debounce pattern in the codebase. Agent 2 should mirror this pattern.

---

## Root-Cause Hypotheses

| ID | Hypothesis | Confidence | Fix Candidate |
|----|-----------|------------|---------------|
| H1 | `readySignal` in `useBpmnSettledDecorFanout` is recreated every render because it reads refs directly without `useMemo`, triggering all 5 fanout effects unnecessarily. | **High** | Wrap `readySignal` in `useMemo`. |
| H2 | `canvas.viewbox.changed` handlers run on every pan/zoom frame and call `applyPropertiesOverlayDecorForZoomChange` directly with no frame coalescing. | **High** | RAF coalescing: one pending RAF per instance, latest wins. |
| H3 | `eventBus.on` listeners in `wireBpmnStageRuntimeEvents.js` are not unregistered when instances are destroyed or replaced. Only native contextmenu has cleanup. | **High** | Return cleanup function from `bind*StageEvents` that calls `eventBus.off` for every registered listener. Wire cleanup into instance destroy / component unmount. |
| H4 | `useBpmnSettledDecorFanout` effect dependencies include unstable objects/refs, causing repeated fanout execution even when data is unchanged. | **Medium** | Stabilize `readySignal` to primitive. Review other deps for object stability. |
| H5 | Selection changes trigger `setSelectedDecor` → `clearSelectedDecor` + `applySelectionFocusDecor` synchronously on every `selection.changed` event. | **Medium** | Evaluate if selection visual update can be separated from full overlay rebuild; if not, accept as bounded scope limitation. |
| H6 | `commandStack.changed` triggers `runImmediateEditorFanout` which applies 4+ decorator categories immediately on every stack change. | **Medium** | If source review shows this is excessive, add micro-debounce (0ms RAF) so multiple rapid commands coalesce into one fanout. |
| H7 | Pan/zoom burst can fire multiple `canvas.viewbox.changed` events per frame; each invokes the handler and signature computation. | **High** | RAF coalescing in handler (same as H2). |
| H8 | `applyPropertiesOverlayDecor` iterates all visible elements and rebuilds DOM overlays. Called after signature check but still on every distinct zoom bucket. | **Medium** | Reduce frequency via RAF (callers), not by changing `decorManager`. |
| H9 | `applyUserNotesDecor` iterates `registry.getAll()` O(n) on every notes fanout trigger. | **Medium** | Reduce trigger frequency via stable deps. |
| H10 | Tab return (CSS display toggle) does not unmount BpmnStage, but prop changes may re-fire effects, causing duplicate fanout. | **Medium** | Idempotent setup/teardown and stable `readySignal` prevent re-fire. |

---

## Bounded Fix Strategy

### A. RAF Coalescing for High-Frequency Refresh

Target: `canvas.viewbox.changed` handler in `wireBpmnStageRuntimeEvents.js`.

Pattern (mirror `useBpmnViewportSource.js`):
- One pending `requestAnimationFrame` token per diagram instance (viewer/modeler).
- Store token in a ref or weakmap keyed by instance.
- On `canvas.viewbox.changed`: cancel previous RAF, schedule new RAF with latest state.
- In RAF callback: call `applyPropertiesOverlayDecorForZoomChange`.
- On cleanup/unmount: cancel pending RAF.

This ensures at most one overlay refresh per animation frame, regardless of how many viewbox events fire.

### B. Listener Idempotency and Cleanup

Target: `wireBpmnStageRuntimeEvents.js`.

- Refactor `bindViewerStageEvents` and `bindModelerStageEvents` to return a `cleanup()` function.
- Inside cleanup: call `eventBus.off(eventName, handler)` for every `eventBus.on` registered.
- Use stable handler function references (define handlers as named functions or stable refs) so `.off` matches `.on`.
- In `BpmnStage.jsx`, store the cleanup function and invoke it before rebinding events on a new instance, and in the component unmount destroy path.

### C. Stabilize `readySignal`

Target: `useBpmnSettledDecorFanout.js`.

- Wrap `readySignal` construction in `useMemo` with dependency array `[]` or `[viewerRef, modelerRef, modelerRuntimeRef]` — but because refs don't change identity, an empty dep array with ref reads inside is acceptable for this signal.
- Alternative: use `useMemo(() => [viewerRef.current ? 1 : 0, modelerRef.current || modelerRuntimeRef.current?.getInstance?.() ? 1 : 0].join(":"), [viewerRef.current, modelerRef.current, modelerRuntimeRef.current])` — but React doesn't track ref mutations. Better: compute `readySignal` inside each effect where it's needed, or use a `useMemo` that re-evaluates when a stable "instance id" changes.
- Simpler safe fix: replace `readySignal` with `useMemo` that only recalculates when a manually tracked instance-key changes (e.g., instance meta id from BpmnStage).

### D. Split Heavy vs Light Updates (Bounded)

- If selection/hover currently triggers full overlay refresh via `useBpmnSettledDecorFanout`, verify whether `selection.changed` actually causes property overlay rebuild.
- From source review: `selection.changed` in `wireBpmnStageRuntimeEvents.js` calls `setSelectedDecor`, which updates selection affordance only (markers), not property overlays. Property overlays are only refreshed by `applyPropertiesOverlayDecorForZoomChange` on `canvas.viewbox.changed` and by the settled properties fanout. So selection does not currently trigger full overlay rebuild. Good.
- `commandStack.changed` triggers `runImmediateEditorFanout` (taskType, linkEvent, happyFlow, robotMeta). These are not property overlays. Keep as-is unless profiling proves otherwise.

### E. Preserve Previous Guards

- Viewport-culling in `decorManager.js` / `overlayLayoutModel.js`: untouched.
- Non-edit mutation guard layers: untouched.
- Versions head-check dedupe: untouched.

---

## Acceptance Criteria

Agent 3 should pass only if:

1. **Event/listener source review**:
   - `eventBus` listeners have cleanup (`eventBus.off` pairs).
   - Handler references are stable.
   - No duplicate registration obvious.
   - RAF coalescing or equivalent is implemented for high-frequency refresh.

2. **Runtime**:
   - Diagram opens normally.
   - Overlays render correctly.
   - Pan/zoom keeps overlays aligned.
   - No duplicate overlays.
   - No unbounded DOM growth.
   - No increasing lag after repeated cycles.

3. **Network/mutation**:
   - 0 `PUT /bpmn` from pan/zoom/selection/hover/tab switch.
   - 0 `PATCH /sessions` from same scenarios.
   - No versions head-check spam regression.

4. **Counts**:
   - Viewport-culling still works.
   - `.fpcPropertyOverlay` count remains tied to viewport.
   - Counts stable after repeated cycles.

5. **Console**:
   - No new relevant errors.

6. **Scope**:
   - No backend changes.
   - No package changes.
   - No BPMN XML mutation.
   - No Product Actions/RAG/AG-UI changes.
   - No broad Diagram rewrite.

---

## Non-goals

- Do not fix versions head-check again.
- Do not change non-edit PUT guard unless direct regression source is found.
- Do not change backend.
- Do not change storage/schema.
- Do not change BPMN XML semantics.
- Do not remove property overlays.
- Do not implement WebGL/canvas overlay rendering.
- Do not add virtualization framework.
- Do not introduce new dependencies.
- Do not redesign Diagram UI.
- Do not change Product Actions/RAG/AG-UI.
- Do not optimize all app tabs.

---

## Agent 2 Execution Plan

1. Read PLAN.md, RUNTIME_NAVIGATION.md, RUNTIME_PROOF_CHECKLIST.md, STATE.json, and previous review reports.
2. Baseline before code:
   - Record overlay counts.
   - Run pan/zoom burst, selection/hover burst, tab return.
   - Record console/network.
   - Inspect listener/effect source.
3. Implement bounded frontend fix:
   - RAF coalescing for `canvas.viewbox.changed` → `applyPropertiesOverlayDecorForZoomChange`.
   - Listener cleanup/idempotency in `wireBpmnStageRuntimeEvents.js`.
   - Stable `readySignal` in `useBpmnSettledDecorFanout.js`.
   - Preserve viewport-culling.
4. Validate:
   - Build/test.
   - Runtime before/after.
   - All scenarios A–F.
   - Network/mutation safety.
   - Overlay counts and DOM stability.
5. Create:
   - `EXEC_REPORT.md`
   - `PERFORMANCE_BEFORE_AFTER.md`
   - `IMPLEMENTATION_NOTES.md`
   - `READY_FOR_REVIEW`
6. If blocked: create `EXEC_BLOCKED.md`, no `READY_FOR_REVIEW`.

---

## Agent 3 Review Plan

1. Read PLAN.md, EXEC_REPORT.md, PERFORMANCE_BEFORE_AFTER.md, IMPLEMENTATION_NOTES.md, RUNTIME_PROOF_CHECKLIST.md.
2. Use Playwright/browser review against http://clearvestnic.ru:5180.
3. Verify:
   - Event/listener source safety (paired `.on`/`.off`).
   - RAF coalescing exists or equivalent.
   - No duplicate eventBus listener registration.
   - Pan/zoom stable, hover/selection stable, tab switch stable.
   - Overlay counts stable, no unbounded DOM growth.
   - No PUT/PATCH mutations.
   - No versions spam regression.
   - No console errors.
   - No unrelated file changes.
4. If even minor issue remains: `CHANGES_REQUESTED`, `REWORK_REQUEST.md`, no `REVIEW_PASS`.
5. If pass: `REVIEW_REPORT.md`, `REVIEW_PASS`.

---

## Risks

1. **Ref identity in eventBus cleanup**: If handler functions are defined inline inside `bind*StageEvents`, `eventBus.off` with the same function reference will not work. Handlers must be extracted as stable named functions or stored in a closure ref.
2. ** RAF timing with viewport-culling**: RAF coalescing delays overlay refresh to the next frame. If the delay causes visible misalignment during fast pan, the coalescing window may need to be adjusted or combined with the existing signature guard.
3. **ReadySignal stabilization side effects**: Changing `readySignal` from render-time computed to `useMemo` may subtly change when fanouts fire. Must verify that fanouts still fire on initial instance ready.
4. **Pre-existing working tree**: Multiple frontend files have unstaged changes from previous contours. Agent 2 must stay strictly within the bounded files and not accidentally touch unrelated diffs.

---

## Gates

- [x] Gate 1 — GSD discipline completed
- [x] Gate 2 — Previous audit/fix evidence read
- [x] Gate 3 — Source/runtime truth captured
- [x] Gate 4 — Event/render storm reproduction plan defined
- [x] Gate 5 — Source map captured
- [x] Gate 6 — Root-cause hypotheses defined
- [x] Gate 7 — Bounded RAF/event coalescing strategy defined
- [x] Gate 8 — Non-goals locked
- [x] Gate 9 — Acceptance criteria defined
- [x] Gate 10 — Agent 2 executor prompt ready
- [x] Gate 11 — Agent 3 reviewer prompt ready
- [x] Gate 12 — READY_FOR_EXECUTION marker created
