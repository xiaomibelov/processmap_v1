# Agent 2 / Executor Prompt

## Identity
- Contour: `fix/diagram-real-drag-performance-and-engine-decomposition-v1`
- Run ID: `20260515T223804Z-56109`
- Role: Agent 2 / Executor
- Scope: P0 real mouse drag performance fix, version marker relocation, Diagram interaction decomposition, and engine evaluation for large no-overlays BPMN canvas on 5180.

## Pre-flight
1. Read `PLAN.md`, `RUNTIME_NAVIGATION.md`, `RUNTIME_PROOF_CHECKLIST.md`, `STATE.json`.
2. Read latest contour reports:
   - `.planning/contours/fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1/EXEC_REPORT.md`
   - `.planning/contours/fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1/REVIEW_REPORT.md`
   - `.planning/contours/fix/diagram-visible-version-and-large-canvas-lag-v1/REVIEW_REPORT.md`
   - `.planning/contours/fix/diagram-5180-version-proof-and-canvas-lag-regression-v1/REVIEW_REPORT.md`
   - `.planning/contours/audit/diagram-post-optimization-runtime-profile-v1/REVIEW_REPORT.md`

## Source / Runtime Truth (must record)
```bash
cd /opt/processmap-test
pwd && whoami && hostname && date -Is
git status -sb
git branch --show-current
git rev-parse HEAD
git rev-parse origin/main
git diff --name-only
git diff --stat
```

Also capture:
- `curl -s http://clearvestnic.ru:5180/build-info.json?cb=$(date +%s)`
- Served JS/CSS asset names from `curl -s http://clearvestnic.ru:5180/?cb=$(date +%s) | grep -o "assets/[^\"' ]*\.(js|css)"`
- `docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep processmap_test`

## Part A — Version Marker Relocation

### A1 Remove canvas overlay badge
- In `frontend/src/components/process/BpmnStage.jsx`, find and remove:
  ```jsx
  <div style={{ position: "absolute", top: 8, left: 8, zIndex: 101 }}>
    <DiagramRuntimeVersionBadge buildInfo={PROCESSMAP_BUILD_INFO} />
  </div>
  ```
- Remove unused `DiagramRuntimeVersionBadge` import if it becomes unused.
- Keep `PROCESSMAP_BUILD_INFO` import if still needed for `window.__PROCESSMAP_BUILD_INFO__` or other uses.

### A2 Extend AppShell footer
- In `frontend/src/components/AppShell.jsx`, locate the `footerHint` div (~line 350).
- Ensure the footer already shows: `Версия v1.0.126 · shaShort · date`.
- Append contour/build id when on `fix/*` branch or `clearvestnic.ru:5180`.
- Example target string:
  `Версия v1.0.126 · a9a9d9c · 16.05.2026 01:08 · fix/diagram-real-drag-performance-and-engine-decomposition-v1`
- Do not place any version text inside canvas viewport.

### A3 Rebuild / Restart
```bash
cd /opt/processmap-test/frontend && npm run build
# must complete with 0 errors
docker restart processmap_test-gateway-1
```
- Verify served `build-info.json` has updated timestamp and contourId.
- Verify served JS asset hash changed (proves fresh build).

### A4 Proof
- Screenshot of 5180 showing footer version line.
- Screenshot proving no top-left canvas badge.
- `window.__PROCESSMAP_BUILD_INFO__` verification.
- Write `VERSION_MARKER_RELOCATION_PROOF.md`.

## Part B — Real Drag Baseline (before fix)

### B1 Setup
- Use Playwright fresh browser context.
- URL: `http://clearvestnic.ru:5180/?cb=<timestamp>`
- Navigate to project `b1c8a56b6e`, session `wewe` (or other large diagram).
- Ensure Diagram tab active, overlays off:
  ```js
  document.querySelectorAll('.fpcPropertyOverlay').length === 0
  ```
- Record DOM/SVG baseline counts (see RUNTIME_NAVIGATION.md snippets).

### B2 Canvas pan baseline
```js
// Playwright pseudo-code
await page.mouse.move(x, y);
await page.mouse.down();
await page.mouse.move(x + 200, y, { steps: 20 });
await page.mouse.move(x + 400, y + 100, { steps: 20 });
await page.mouse.up();
```
- Record:
  - Total drag duration (ms).
  - Visible smoothness (honest subjective note).
  - SVG transform/viewbox changed.
  - Long pauses or freezes.
  - DOM/SVG delta after drag.
  - JS errors in console.
  - Network requests during drag.

### B3 Element drag baseline
- If view mode prevents element drag, document that as expected behavior.
- To test edit-mode drag: click "Редактировать BPMN" button, wait for Modeler init (may be ~15s on large diagram), then drag a task element with steps.
- Record same metrics as B2.
- Check whether PUT `/bpmn` or PATCH `/sessions` fires automatically during or immediately after drag.
- Use disposable test session if drag mutates local model.

### B4 Side-effect audit during drag
During canvas pan or element drag, check whether any of these fire repeatedly:
- React state updates (add dev-only counters if needed).
- `selection.changed` event count.
- `canvas.viewbox.changed` event count.
- `commandStack.changed` event count.
- Decor fanout runs.
- Property panel updates.
- Session patch/save.
- `versions?limit=1` spam.

Write `REAL_DRAG_BASELINE.md`.

## Part C — Source Forensic & Decomposition

### C1 Map pointer/drag stack
- Read `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`.
- Document all `eventBus.on(...)` handlers related to drag, selection, viewport.
- Identify handlers that call `setState` or React updates.
- Identify handlers that trigger decor fanout.

### C2 Map decor fanout during drag
- Read `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js`.
- Determine if it runs on `selection.changed` or `canvas.viewbox.changed`.
- Determine if it can be suppressed during `dragInProgress`.

### C3 Map selection sync during drag
- Trace `syncAiQuestionPanelWithSelection` in `BpmnStage.jsx`.
- Determine if it fires on every `selection.changed` during drag.
- Determine if it can be coalesced or suppressed during drag.

### C4 Map parent shell churn
- Check `useProcessTabs.js` and `ProcessStage.jsx` for state updates that could re-render during drag.
- Check if `selectedElementContext` or derived state changes on every pointermove.

### C5 Decomposition (if BpmnStage touched for drag)
If drag fix requires changing BpmnStage.jsx, extract modules BEFORE modifying behavior:
- `frontend/src/features/process/bpmn/stage/interaction/diagramPointerInteractionController.js`
- `frontend/src/features/process/bpmn/stage/interaction/diagramViewPanController.js`
- `frontend/src/features/process/bpmn/stage/interaction/diagramElementDragController.js`
- `frontend/src/features/process/bpmn/stage/interaction/diagramInteractionPerfMonitor.js`
- Keep existing behavior unless explicitly changed; extraction comes first.

Write `DRAG_LAG_ROOT_CAUSE.md` and `DECOMPOSITION_REPORT.md` (if extraction happened).

## Part D — Bounded Drag Performance Fix

Based on forensic evidence, choose from:

**Option B — Suppress React updates during drag/pan**
- Use refs for `dragInProgress`, `lastViewbox`.
- Batch/coalesce viewport updates with RAF.
- No `setState` per pointermove unless necessary.

**Option C — Disable analytics selection/focus updates during active drag**
- In `wireBpmnStageRuntimeEvents.js`, guard `selection.changed` handler with `!dragInProgress`.
- Selection update should happen on `pointerup` or `click`, not during drag.

**Option D — Pause non-critical decor/derived fanout during drag**
- In `useBpmnSettledDecorFanout.js`, skip fanout while `dragInProgress`.
- Resume after drag end.

**Option E — Fix view vs edit interaction mode**
- Ensure view mode does not start edit drag on element pointerdown.
- Edit mode element drag allowed but no autosave until explicit save.

Do NOT apply all options blindly. Apply only those supported by baseline evidence.

## Part E — Engine Evaluation

Create `ENGINE_EVALUATION.md`:
- Evaluate bpmn-js, GoJS, yFiles, JointJS+, React Flow, custom canvas.
- Document licensing, BPMN XML compatibility, migration cost, large-graph performance evidence.
- Decision: continue bpmn-js optimization OR recommend research/prototype contour.
- If recommend prototype, suggest contour ID:
  - `research/diagram-engine-evaluation-large-bpmn-v1`
  - or `prototype/diagram-gojs-or-yfiles-large-flow-spike-v1`

No library install in this contour.

## Part F — After Fix Validation

Repeat B2, B3, B4 after drag fix and compare:
- Drag duration before vs after.
- Event counts before vs after.
- DOM/SVG stability.
- Console errors.
- Network safety (0 PUT/PATCH from view interactions).

Write `RUNTIME_BEFORE_AFTER.md`.

## Part G — Reports

Create these files in the contour directory:
1. `EXEC_REPORT.md` — summary of all work.
2. `VERSION_MARKER_RELOCATION_PROOF.md` — before/after screenshots, build info proof.
3. `REAL_DRAG_BASELINE.md` — baseline measurements.
4. `DRAG_LAG_ROOT_CAUSE.md` — what causes lag.
5. `RUNTIME_BEFORE_AFTER.md` — comparison.
6. `DECOMPOSITION_REPORT.md` — if extraction happened.
7. `ENGINE_EVALUATION.md` — engine evaluation.
8. `IMPLEMENTATION_NOTES.md` — any caveats, known issues.
9. `READY_FOR_REVIEW` — marker file.

If blocked, write `EXEC_BLOCKED.md` and do NOT create `READY_FOR_REVIEW`.

## Hard Rules
- No backend/schema/storage changes unless EXEC_BLOCKED first and explicitly justified.
- No BPMN XML mutation from view interactions.
- No Product Actions / RAG / AG-UI changes.
- No stage/prod deploy.
- No PR/merge/push.
- No secrets in reports.
- Build must pass (`npm run build` 0 errors).
