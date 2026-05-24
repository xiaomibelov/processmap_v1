# EXECUTOR_PROMPT.md

## Identity
- **Role**: Agent 2 / Executor
- **Contour**: `fix/diagram-visible-version-and-large-canvas-lag-v1`
- **Run ID**: `20260515T203759Z-49386`
- **Scope**: P0 visible runtime version marker + material large Diagram canvas lag reduction on `clearvestnic.ru:5180`

## Pre-flight (do first)
1. Read `PLAN.md`, `STATE.json`, `RUNTIME_NAVIGATION.md`, `RUNTIME_PROOF_CHECKLIST.md`.
2. Capture source/runtime truth:
   - `git branch --show-current`
   - `git rev-parse HEAD`
   - `git status -sb`
   - `curl -s "http://clearvestnic.ru:5180/build-info.json?cb=$(date +%s)"`
3. Do NOT start implementation until baseline is captured.

## Part A — Baseline Large Canvas (before code changes)

### Scenario A: visible version check
1. Open `http://clearvestnic.ru:5180/?cb=<timestamp>` fresh browser context.
2. Verify what version text is visible in UI. Record exact text.
3. Verify `/build-info.json`.
4. Verify `window.__PROCESSMAP_BUILD_INFO__`.

### Scenario B: large Diagram overlays OFF
1. Navigate to known large session (`wewe / Описание процессов Долгопрудный`).
2. Ensure overlays OFF (`.fpcPropertyOverlay = 0`).
3. Record:
   - `document.querySelectorAll('*').length`
   - `document.querySelectorAll('svg *').length`
   - `document.querySelectorAll('.djs-container').length`
   - `document.querySelectorAll('.fpcPropertyOverlay').length`
   - `document.querySelectorAll('.djs-overlay').length`
   - `document.querySelectorAll('.fpcFocusDim').length`
   - `document.querySelectorAll('.fpcAnalyticsSelected').length`
   - `document.querySelectorAll('.djs-bendpoint').length`
   - `document.querySelectorAll('.djs-segment-dragger').length`

### Scenario C: pan/zoom
1. Perform 10 pan/zoom cycles.
2. Record smoothness, DOM/SVG deltas, any long pauses.

### Scenario D: selection
1. Select 10 elements in analytics/view mode.
2. Record DOM/SVG deltas, property panel latency, `.fpcAnalyticsSelected` count.

### Scenario E: tab switch
1. Analysis → Diagram → XML → Diagram.
2. Measure time to usable canvas.
3. Check `.djs-container` count stays at 1.
4. Check for skeleton flashes.

### Scenario F: Modeler/Viewer truth
1. Determine: is current default Diagram using Modeler or Viewer?
2. If Modeler, which editing modules are active?
3. Can view mode safely instantiate Viewer?
4. How is edit mode triggered?
5. What breaks if using Viewer for view mode?

Record all baseline data in `LARGE_CANVAS_BASELINE.md`.

## Part B — Implement Visible Version

1. Modify `frontend/src/components/AppShell.jsx`:
   - Integrate build metadata (`PROCESSMAP_BUILD_INFO.shaShort`, `timestamp`, `contourId`) into the **existing visible version area** (near `Версия {appVersionInfo.currentVersion}`).
   - Make it obvious but unobtrusive. Example:
     ```
     Версия v1.0.126 · a9a9d9c · 2026-05-15 19:50
     ```
   - Keep the existing host/branch visibility gate or expand it.
   - The old tiny bottom-right badge can be removed or kept as fallback.
2. Update `scripts/generate-build-info.mjs` if needed to record current contour id.
3. Rebuild frontend:
   - `cd frontend && npm run build`
4. Verify `frontend/dist/build-info.json` has correct data.
5. If gateway does not pick up new dist automatically, restart it:
   - `docker compose restart gateway` (in test runtime compose).
6. Verify 5180:
   - `curl -s "http://clearvestnic.ru:5180/build-info.json?cb=$(date +%s)"`
   - Fresh browser: visible marker must be obvious.
7. Document in `VISIBLE_VERSION_PROOF.md`.

## Part C — Implement Canvas Lag Fix

**Choose based on baseline evidence.**

### Option C1 — Viewer-first default (strongest candidate)
If baseline shows default view uses Modeler:
1. In `BpmnStage.jsx`, change the default view/analytics path to use `viewerRef.current` (NavigatedViewer) instead of `modelerRef.current`.
2. Ensure analytics selection-lite still works:
   - `addMarker`/`removeMarker` on Viewer.
   - `fpcAnalyticsSelected` class applied.
3. Ensure property panel receives selected element.
4. Ensure pan/zoom works (NavigatedViewer has zoom scroll).
5. Do NOT instantiate Modeler until explicit edit mode is activated.
6. Ensure edit mode trigger still works and switches to Modeler when needed.
7. Document in `VIEWER_FIRST_DESIGN.md`.

### Option C2 — Tab shell stabilization
If tab switch dominates latency:
1. Investigate `useProcessTabs.js` and `ProcessStage.jsx`.
2. Prevent unnecessary BPMN flush / interview projection recompute on tab switch.
3. Keep Diagram mounted via CSS visibility if it currently unmounts.
4. Document exact bottleneck.

### Option C3 — Import dedupe
If importXML repeats:
1. Key by `sessionId + bpmn_xml_version`.
2. Avoid destroy/recreate unless XML actually changed.
3. `bpmnRenderRuntimeLifecycle.js` already has token cancellation — verify it's working.

### Option C4 — Rollback culprit
If a specific recent change worsened canvas:
1. Identify the precise culprit from git diff.
2. Revert only that change.
3. Document rationale.

## Part D — Validate After Fix

1. **Rebuild and restart 5180 if needed.**
2. **Fresh browser context** (`?cb=<timestamp>`):
   - Verify visible version marker.
   - Verify build-info.json and window marker.
3. **Large no-overlays canvas**:
   - Record DOM/SVG counts.
   - Pan/zoom — record smoothness.
   - Selection — verify selection-lite, property panel.
   - Tab switch — verify no full reload, `.djs-container` stays at 1.
4. **Network**:
   - 0 PUT `/bpmn` from view interactions.
   - 0 PATCH `/sessions` from view interactions.
   - No versions spam.
5. **Build/tests**:
   - `npm run build` passes.
   - Existing tests still pass (document any failures).

## Required Output Files

Create these files in the contour directory:

1. `EXEC_REPORT.md` — summary of what was done, what was proven.
2. `VISIBLE_VERSION_PROOF.md` — curl proof, browser proof, screenshot description.
3. `LARGE_CANVAS_BASELINE.md` — before/after DOM counts, timings.
4. `CANVAS_LAG_ROOT_CAUSE.md` — what was identified as the root cause.
5. `RUNTIME_BEFORE_AFTER.md` — objective measurements before and after.
6. `IMPLEMENTATION_NOTES.md` — what files changed, why, decomposition notes.
7. `VIEWER_FIRST_DESIGN.md` — if viewer-first was implemented.
8. `READY_FOR_REVIEW` — touch this file when complete.

If blocked:
- Create `EXEC_BLOCKED.md` with exact reason.
- Do NOT create `READY_FOR_REVIEW`.

## Hard Rules
- No backend/schema/storage changes.
- No BPMN XML mutation.
- No Product Actions/RAG/AG-UI changes.
- No commit/push/PR.
- No stage/prod deploy.
- No secrets in output files.
- If touching `BpmnStage.jsx` or `ProcessStage.jsx`, keep changes bounded and safe.
