# EXECUTOR_PROMPT — Agent 2 / Executor

Contour ID: `perf/diagram-eventbus-listener-and-raf-coalescing-v1`
Run ID: `20260515T102714Z-14849`

---

## Scope

Frontend-only bounded event/render performance changes in Diagram/BPMN.
No backend changes. No package installs. No BPMN XML mutation. No durable truth mutation.
Preserve previous passes:
- overlay viewport-culling
- versions head-check dedupe
- non-edit PUT/PATCH guard

## Before You Write Code

1. Read:
   - `PLAN.md`
   - `RUNTIME_NAVIGATION.md`
   - `RUNTIME_PROOF_CHECKLIST.md`
   - `STATE.json`
   - Previous contour review reports (optional context).

2. Baseline runtime before any code changes:
   - Open http://clearvestnic.ru:5180, session `wewe`.
   - Record DOM counts: `document.querySelectorAll('*').length`, `.djs-overlay`, `.fpcPropertyOverlay`.
   - Run Scenario B (pan/zoom burst) and record counts.
   - Run Scenario C (selection burst) and note behavior.
   - Run Scenario E (tab return) and note behavior.
   - Check Network tab for `PUT /bpmn`, `PATCH /sessions`, `versions?limit=1`.
   - Optionally enable debug flags:
     ```js
     window.__FPC_DEBUG_SETTLED_FANOUT__ = true;
     window.__FPC_DEBUG_IMMEDIATE_FANOUT__ = true;
     ```
     Record any `[SETTLED_FANOUT_PERF]` / `[IMMEDIATE_FANOUT_PERF]` logs.
   - Save baseline notes to `evidence/baseline-event-notes.md`.

## Implementation Tasks

### Task 1 — RAF Coalescing for Viewbox Overlay Refresh

**Target**: `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`

The `canvas.viewbox.changed` handler currently calls `applyPropertiesOverlayDecorForZoomChange` directly on every event.

Implement RAF coalescing:
- Add a `rafRef` (or WeakMap) to track pending RAF per instance.
- In the `canvas.viewbox.changed` handler (both viewer and modeler):
  - Cancel any pending RAF for this instance.
  - Schedule a new RAF.
  - Inside the RAF callback: call `applyPropertiesOverlayDecorForZoomChange(inst, mode)`.
- Ensure the RAF token is cancelled on listener cleanup.

Reference pattern: `frontend/src/features/process/stage/controllers/useBpmnViewportSource.js` (lines 119–126, 277–302).

### Task 2 — EventBus Listener Cleanup / Idempotency

**Target**: `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`

Current state: `bindViewerStageEvents` and `bindModelerStageEvents` register many `eventBus.on` listeners but do not unregister them. Only the native `contextmenu` listener has cleanup via `canvas.destroy`.

Requirements:
- Refactor `bindViewerStageEvents` to return a `cleanup()` function.
- Inside cleanup: call `eventBus.off(eventName, handler)` for every listener registered in that call.
- Do the same for `bindModelerStageEvents`.
- Use stable handler references (define handlers as named functions in closure or use refs) so `eventBus.off` removes the exact listener.
- In `BpmnStage.jsx`, wire cleanup:
  - Before calling `bindViewerStageEvents` on a new instance, call the previous cleanup if any.
  - Before calling `bindModelerStageEvents` on a new instance, call the previous cleanup if any.
  - In the component unmount / destroy path, call both cleanups.

### Task 3 — Stabilize `readySignal` in `useBpmnSettledDecorFanout`

**Target**: `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js`

Current state (lines 77–80):
```js
const readySignal = [
  viewerRef.current ? 1 : 0,
  modelerRef.current || modelerRuntimeRef.current?.getInstance?.() ? 1 : 0,
].join(":");
```

This is computed on every render and changes string identity, triggering all 5 `useEffect` fanout hooks.

Requirements:
- Wrap `readySignal` in `useMemo` so it only recomputes when the actual instance presence changes.
- Because refs don't trigger re-renders, consider passing an explicit `instanceKey` or `instanceVersion` prop from `BpmnStage.jsx` that changes only when a new instance is created.
- Alternative: derive `readySignal` from stable primitives already in props (e.g., a boolean `modelerReady` and `viewerReady` derived from instance meta refs in BpmnStage).
- Ensure fanouts still fire correctly on initial load and after tab return.

### Task 4 — Validation

After implementing:

1. **Build**:
   ```bash
   cd /opt/processmap-test/frontend && npm run build
   ```
   Must pass with no errors.

2. **Unit tests**:
   Run existing tests for modified files. Do not break existing tests.
   ```bash
   cd /opt/processmap-test/frontend && node --test \
     src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.test.mjs \
     src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.context-menu-owner.test.mjs
   ```

3. **Runtime before/after**:
   - Re-run Scenarios A–F.
   - Record DOM counts, console, network.
   - Compare with baseline.
   - If debug flags were used, compare perf log frequency.

4. **Specific checks**:
   - Pan/zoom: overlays align, counts stable.
   - Selection: no mutations, responsive.
   - Tab switch: no duplicate overlays, counts stable.
   - XML → Diagram: overlays rehydrate correctly (or document pre-existing behavior if unchanged).
   - Network: 0 PUT/PATCH from non-save interactions.

## Forbidden Actions

- Do not change backend code.
- Do not change `package.json` or lock files.
- Do not mutate BPMN XML semantics.
- Do not remove property overlays.
- Do not change Product Actions / RAG / AG-UI.
- Do not change viewport-culling logic in `decorManager.js` or `overlayLayoutModel.js`.
- Do not change versions head-check or non-edit PUT guard logic.
- Do not commit, push, PR, or deploy.

## Deliverables

Create in the contour directory:

1. `EXEC_REPORT.md` — what was done, files changed, runtime results.
2. `PERFORMANCE_BEFORE_AFTER.md` — quantitative or qualitative before/after comparison.
3. `IMPLEMENTATION_NOTES.md` — technical details of changes, risks, trade-offs.
4. `READY_FOR_REVIEW` — empty marker file.

If blocked:
- Create `EXEC_BLOCKED.md` describing the blocker.
- Do NOT create `READY_FOR_REVIEW`.

## Final Checklist Before READY_FOR_REVIEW

- [ ] Build passes.
- [ ] No new test failures.
- [ ] Runtime scenarios A–F completed.
- [ ] Network mutation safety confirmed.
- [ ] Overlay counts stable.
- [ ] No duplicate overlays.
- [ ] Listener cleanup source-reviewed.
- [ ] RAF coalescing source-reviewed.
- [ ] `readySignal` stabilization source-reviewed.
- [ ] Previous fixes not regressed.
