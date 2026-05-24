# Agent 2 / Executor Prompt

## Contour
- **ID**: `fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1`
- **Run ID**: `20260515T213952Z-52794`
- **Branch**: `fix/lockfile-sync-test`
- **Scope**: P0 decomposition-first fix for Diagram stuck loading state, canvas lifecycle readiness, visible runtime version marker, and usable BPMN canvas on clearvestnic.ru:5180

## Pre-Flight Checklist

1. Read `PLAN.md` in this directory.
2. Read `RUNTIME_NAVIGATION.md`.
3. Read `RUNTIME_PROOF_CHECKLIST.md`.
4. Read `STATE.json`.
5. Read latest contour reports:
   - `.planning/contours/fix/diagram-visible-version-and-large-canvas-lag-v1/EXEC_REPORT.md`
   - `.planning/contours/fix/diagram-visible-version-and-large-canvas-lag-v1/REVIEW_REPORT.md`
   - `.planning/contours/fix/diagram-canvas-reload-loop-and-lag-regression-v1/REVIEW_REPORT.md`
   - `.planning/contours/perf/diagram-initial-load-skeleton-and-lazy-hydration-v1/REVIEW_REPORT.md`

## Source / Runtime Truth (Mandatory First Step)

Run and record:
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

Runtime:
```bash
curl -s "http://clearvestnic.ru:5180/build-info.json?cb=$(date +%s)"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep processmap_test
echo "Local dist assets:" && find frontend/dist -maxdepth 3 -type f | sort | tail -30
```

## Reproduce Stuck Loading (Before Any Code Change)

### Scenario A — Fresh Browser
1. Open fresh browser context (Playwright or manual).
2. Navigate to `http://clearvestnic.ru:5180/?cb=<timestamp>`.
3. Authenticate.
4. Open session with Diagram (e.g. `wewe` / `Описание процессов Долгопрудный` if available).
5. Click Diagram tab.
6. Wait 10 seconds.
7. Screenshot.
8. Record: is "Загрузка диаграммы…" still visible?
9. Record DOM counters:
   ```js
   document.body.innerText.includes('Загрузка диаграммы')
   document.querySelectorAll('.djs-container').length
   document.querySelectorAll('svg').length
   document.querySelectorAll('.diagramSkeleton').length
   window.__PROCESSMAP_BUILD_INFO__
   ```

### Scenario B — Warm Tab Switch
1. From Analysis tab → Diagram. Wait 10s. Record.
2. From XML tab → Diagram. Wait 10s. Record.

### Scenario C — Cold Open
1. Hard refresh with cache bust.
2. Wait 20s. Record.

Document all findings in `STUCK_LOADING_ROOT_CAUSE.md`.

## Source Forensic (BpmnStage.jsx Ready-State Wiring)

Read `frontend/src/components/process/BpmnStage.jsx` and answer:

1. **Where is `setDiagramReady` called?** List every call site with line number and surrounding context.
2. **When `view === "diagram"` (Viewer path), what callback fires after `importXML` succeeds?** Does that callback call `setDiagramReady(true)`?
3. **When `view === "editor"` (Modeler path), what callback fires after `importXML` succeeds?** Does that callback call `setDiagramReady(true)`?
4. **What sets `viewerReadyRef.current = true`?** Is there a `bindViewerStageEvents` handler that sets it? Does it also call `setDiagramReady`?
5. **What sets `modelerReadyRef.current = true`?** Is there a `bindModelerStageEvents` handler? Does it also call `setDiagramReady`?
6. **Does `useDiagramStagedHydration` (staged hydration) integrate with `diagramReady`?** If yes, how? If no, is it dead code?
7. **Does `useDeferredDecorFanout` block or delay the ready signal?**
8. **Is there any path where `setDiagramReady(false)` is called after Viewer import succeeds, causing a race?**

Record findings in `STUCK_LOADING_ROOT_CAUSE.md`.

## Decomposition Phase

### Module 1: useDiagramLoadStateMachine
Create `frontend/src/features/process/bpmn/stage/load/useDiagramLoadStateMachine.js`:
```js
// States: idle | initializing | importing | canvas-ready | hydrating-secondary | ready | error | timeout
// Inputs: sessionId, view ("diagram" | "editor" | "xml"), xmlHash, importResult
// Outputs: { loadState, isCanvasVisible, isSkeletonVisible, isError, errorReason, lastTransitionAt, transition }
```
- Use `useReducer` or `useState` with explicit transitions.
- No boolean soup.
- Timeout: 10s warm, 20s cold (configurable).
- Integrate with both Viewer and Modeler import callbacks.

### Module 2: useBpmnCanvasLifecycle
Create `frontend/src/features/process/bpmn/stage/load/useBpmnCanvasLifecycle.js`:
- Encapsulate `ensureViewer`, `ensureModeler`, `importXml`, `destroy`.
- Return `{ getInstance, importXml, destroy, lifecycleState }`.
- Ensure single creation per container key.
- Publish events consumed by state machine.

### Module 3: DiagramLoadBoundary
Create `frontend/src/features/process/bpmn/stage/load/DiagramLoadBoundary.jsx`:
- Props: `{ loadState, errorReason, onRetry, children }`
- Render skeleton ONLY for `initializing | importing` within timeout.
- Render error panel for `error | timeout`.
- Render children (canvas container) for `canvas-ready | ready | error | timeout`.
- Never unmount canvas after first `canvas-ready`.

### Module 4: DiagramRuntimeVersionBadge
Create `frontend/src/features/process/stage/ui/DiagramRuntimeVersionBadge.jsx`:
- Show: `v1.0.126 · a9a9d9c · 15.05.2026 · <contourId>`
- Place in `ProcessStageHeader` or `TopBar` when Diagram tab active.
- Must be visible during loading.

### Build Info Fix
Update `scripts/generate-build-info.mjs`:
- Source `contourId` from `PROCESSMAP_CONTOUR_ID` env var.
- Ensure it writes the current contour ID, not a stale one.

## Fix Phase

1. **Wire Viewer import success to state machine.**
   - In BpmnStage render effect (Viewer path), after `renderViewer(resolvedXml)` resolves, call state machine `transition("import_success")`.
   - If `importXML` fails, call `transition("import_error", { reason })`.

2. **Wire Modeler import success similarly.**

3. **Eliminate endless loading.**
   - If state machine reaches `timeout`, show `DiagramRuntimeErrorPanel` with:
     - Runtime version info
     - Current state
     - Last error
     - Retry button
   - Do NOT keep skeleton visible.

4. **Ensure visible version marker.**
   - Add `DiagramRuntimeVersionBadge` to top toolbar/header area.
   - Verify it appears in the same screenshot as the Diagram tab.

5. **Stabilize tab switch.**
   - Verify BpmnStage does not remount on tab switch (check React `key` prop).
   - Verify `destroyRuntime()` is not called spuriously.

6. **Revert viewer-first only if necessary.**
   - If H1/H4 are confirmed and wiring Viewer ready is impossible without massive BpmnStage surgery, revert to Modeler-default for `view === "diagram"`.
   - Document decision in `IMPLEMENTATION_NOTES.md`.

## Validation

### Build
```bash
cd /opt/processmap-test/frontend
npm run build
```
- Must succeed with 0 errors.
- Must produce `frontend/dist/assets/index-*.js` and `frontend/dist/build-info.json`.
- `build-info.json` must have `contourId: "fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1"`.

### Runtime Deploy
```bash
docker restart processmap_test-gateway-1
```

### Browser Proof
1. Fresh context → `http://clearvestnic.ru:5180/?cb=<timestamp>`.
2. Open Diagram tab.
3. Screenshot showing:
   - Diagram canvas rendered (or error panel with retry)
   - Version badge visible in top/header
4. Record timings.
5. Tab switch tests (Analysis ↔ Diagram, XML ↔ Diagram).
6. Pan/zoom test.
7. Selection test.
8. Network filter: 0 PUT `/bpmn`, 0 PATCH `/sessions` from view interactions.

### DOM Counters (After Fix)
```js
document.querySelectorAll('.djs-container').length  // should be 1
document.querySelectorAll('.diagramSkeleton').length  // should be 0
document.querySelectorAll('.djs-bendpoint').length   // should be 0 in view mode
document.querySelectorAll('.djs-segment-dragger').length // should be 0 in view mode
window.__PROCESSMAP_BUILD_INFO__
window.__PM_DIAGRAM_RUNTIME__ // if added
```

## Required Output Files

Create in contour directory:
1. `EXEC_REPORT.md` — summary, files changed, build/deploy proof
2. `DECOMPOSITION_REPORT.md` — new modules, responsibilities, interfaces
3. `LOADING_STATE_MACHINE_REPORT.md` — states, transitions, timeout behavior
4. `RUNTIME_VERSION_VISIBLE_PROOF.md` — screenshot + build-info proof
5. `STUCK_LOADING_ROOT_CAUSE.md` — forensic findings, root cause
6. `RUNTIME_BEFORE_AFTER.md` — metrics comparison
7. `IMPLEMENTATION_NOTES.md` — decisions, trade-offs, revert rationale
8. `READY_FOR_REVIEW` — empty marker file

If blocked, create `EXEC_BLOCKED.md` and do NOT create `READY_FOR_REVIEW`.

## Constraints

- Do NOT modify backend/schema/storage.
- Do NOT mutate BPMN XML.
- Do NOT change Product Actions / RAG / AG-UI.
- Do NOT deploy to stage/prod.
- Do NOT create PR/push/commit.
- Do NOT expose secrets.
- Do NOT add console.log spam.
- Bounded to Diagram loading lifecycle + version marker.
