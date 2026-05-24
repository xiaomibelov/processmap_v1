# Agent 2 / Executor Prompt

## Identity
- Contour: `fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1`
- Run ID: `20260515T231647Z-58762`
- Role: Agent 2 / Executor
- Scope: P0 rework for unresolved real Diagram drag lag, mandatory Reviewer GSD discipline, visible version/update ledger, read-only/default mode correction, and interaction decomposition on 5180.

## Pre-flight
1. Read `PLAN.md`, `RUNTIME_NAVIGATION.md`, `RUNTIME_PROOF_CHECKLIST.md`, `STATE.json`.
2. Read latest contour reports:
   - `.planning/contours/fix/diagram-real-drag-performance-and-engine-decomposition-v1/EXEC_REPORT.md`
   - `.planning/contours/fix/diagram-real-drag-performance-and-engine-decomposition-v1/REVIEW_REPORT.md`
   - `.planning/contours/fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1/REVIEW_REPORT.md`
   - `.planning/contours/fix/diagram-visible-version-and-large-canvas-lag-v1/REVIEW_REPORT.md`
   - `.planning/contours/fix/diagram-5180-version-proof-and-canvas-lag-regression-v1/REVIEW_REPORT.md`

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
- Served JS/CSS asset names from `curl -s http://clearvestnic.ru:5180/?cb=$(date +%s) | grep -o "assets/[^"' ]*\.(js|css)"`
- `docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep processmap_test`

## Part A — Reviewer/Test GSD Discipline

### A1 Update reviewer templates
- Edit `.planning/templates/agent3-ui-runtime-review-template.md`:
  - Add section "## 0. Reviewer GSD Discipline — Mandatory" at the TOP.
  - Include: GSD availability check, source/runtime truth, exact user scenario reproduction, before/after evidence.
- Edit `.planning/templates/agent3-ui-runtime-proof-checklist.md`:
  - Add under "Pre-review":
    - [ ] GSD availability checked
    - [ ] Source/runtime truth recorded
    - [ ] Exact user scenario identified before testing
  - Add under "Finalization":
    - [ ] Reviewer GSD discipline section present in REVIEW_REPORT.md
    - [ ] REVIEW_PASS forbidden if user-visible scenario still materially fails
- Edit `tools/pm-agent3-reviewer-watch.sh`:
  - In the generated prompt, add after line 35:
    ```
    ## Reviewer GSD Discipline — Mandatory
    Before any verdict, run:
    - GSD availability check
    - Source/runtime truth capture
    - Exact user scenario reproduction
    - Before/after evidence
    Record all in REVIEW_REPORT.md under "Reviewer GSD Discipline".
    REVIEW_PASS is FORBIDDEN if user-visible scenario still materially fails.
    ```

### A2 Create bounded reviewer guidance
If templates lack a dedicated GSD section, create:
`.planning/templates/REVIEWER_GSD_DISCIPLINE.md`

### A3 Proof
- Screenshot or file diff of template changes.
- Write `REVIEWER_GSD_GATE_REPORT.md`.

## Part B — Version / Update Ledger

### B1 Increment visible version
- Edit `frontend/src/config/appVersion.js`:
  - Change `currentVersion: "v1.0.126"` to `"v1.0.127"`.
  - Add new changelog entry at index 0 (newest first):
    ```js
    {
      version: "v1.0.127",
      changes: [
        "Добавлена Reviewer GSD-дисциплина: review обязан проверять реальный drag и runtime truth.",
        "Исправлена версионность: обновления теперь добавляют новую строку в журнал изменений.",
        "Переработана производительность drag диаграммы: убраны side-effects во время pointermove.",
        "Убран read-only по умолчанию: редактирование диаграммы стало доступно без дополнительного переключателя.",
      ],
    }
    ```

### B2 Update build-info generator
- Edit `scripts/generate-build-info.mjs`:
  - Change hardcoded fallback `contourId` to `fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1`.
  - Or read from `process.env.PROCESSMAP_CONTOUR_ID` with this as fallback.

### B3 Rebuild / Restart
```bash
cd /opt/processmap-test/frontend && npm run build
# must complete with 0 errors
docker restart processmap_test-gateway-1
```
- Verify served `build-info.json` has updated timestamp and contourId.
- Verify served JS asset hash changed (proves fresh build).

### B4 Proof
- Screenshot of 5180 showing footer version line with `v1.0.127`.
- `window.__PROCESSMAP_BUILD_INFO__` verification.
- Write `VERSION_UPDATE_LEDGER_PROOF.md`.

## Part C — Read-only / Edit Mode Fix

### C1 Source-map current default
- Read `frontend/src/components/process/BpmnStage.jsx`:
  - Find where `NavigatedViewer` is default vs `Modeler`.
  - Find `forceEditorMode` default state.
  - Find `readOnly` config.
- Read `frontend/src/features/process/bpmn/stage/interaction/diagramAnalyticsMode.js`:
  - Understand `enterDiagramEditMode` logic.

### C2 Choose safe option
**Option A — Modeler as default** (preferred):
- Change default to Modeler.
- Ensure `readOnly: false` or remove `readOnly` from default config.
- Element drag becomes possible immediately.
- Monitor initial load time. If >20s regression on large diagram, fallback to Option C.

**Option C — Obvious edit toggle** (fallback if A causes load regression):
- Keep NavigatedViewer default.
- Make "Редактировать BPMN" button much more prominent (floating action button near canvas, not hidden).
- Ensure one-click entry to edit mode.
- Document the path clearly.

### C3 Implement chosen option
- Make minimal, safe changes.
- Do NOT bloat BpmnStage.jsx — extract to `diagramEditModeBoundary.js` if needed.

### C4 Proof
- Screenshot showing edit mode accessible.
- Playwright test: element drag works in intended workflow.
- Write `READ_ONLY_REMOVAL_OR_EDIT_MODE_REPORT.md`.

## Part D — Real Drag Baseline (before fix)

### D1 Setup
- Use Playwright fresh browser context.
- URL: `http://clearvestnic.ru:5180/?cb=<timestamp>`
- Navigate to large Diagram session (`wewe / Описание процессов Долгопрудный`).
- Ensure Diagram tab active, overlays off:
  ```js
  document.querySelectorAll('.fpcPropertyOverlay').length === 0
  ```
- Record DOM/SVG baseline counts.

### D2 Canvas pan baseline
```js
await page.mouse.move(x, y);
await page.mouse.down();
await page.mouse.move(x + 200, y, { steps: 20 });
await page.mouse.move(x + 400, y + 100, { steps: 20 });
await page.mouse.up();
```
- Also test quick natural drag without steps.
- Record: duration, long tasks, subjective smoothness, transform change, DOM/SVG delta, console errors, network.

### D3 Element drag baseline
- In edit mode (default or after explicit toggle).
- Pick BPMN task.
- `mouse.down` → `mouse.move` with steps → `mouse.up`.
- Record same metrics.
- Check whether PUT `/bpmn` or PATCH `/sessions` fires automatically.

### D4 Side-effect audit during drag
During drag, check whether any of these fire repeatedly:
- React state updates (inject dev counters if needed).
- `selection.changed` event count.
- `canvas.viewbox.changed` event count.
- `commandStack.changed` event count.
- Decor fanout runs.
- Property panel updates.
- Session patch/save.
- `versions?limit=1` spam.

Write `REAL_DRAG_BASELINE.md`.

## Part E — Source Forensic & Decomposition

### E1 Map pointer/drag stack
- Read `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`.
- Document all `eventBus.on(...)` handlers related to drag, selection, viewport.
- Identify handlers that call `setState` or React updates.
- Identify handlers that trigger decor fanout.
- The previous contour added `isDragInProgress` guard. Check if it covers ALL heavy handlers.

### E2 Map decor fanout during drag
- Read `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js`.
- Determine if it runs on `selection.changed` or `canvas.viewbox.changed`.
- Determine if it can be suppressed during `dragInProgress`.

### E3 Map selection sync during drag
- Trace `syncAiQuestionPanelWithSelection` in `BpmnStage.jsx`.
- Determine if it fires on every `selection.changed` during drag.
- Determine if it can be coalesced or suppressed during drag.

### E4 Map parent shell churn
- Check `useProcessTabs.js` and `ProcessStage.jsx` for state updates that could re-render during drag.
- Check if `selectedElementContext` or derived state changes on every pointermove.

### E5 Decomposition (if BpmnStage touched)
If drag fix requires changing BpmnStage.jsx, extract modules BEFORE modifying behavior:
- `frontend/src/features/process/bpmn/stage/interaction/diagramDragSideEffectGuard.js`
- `frontend/src/features/process/bpmn/stage/interaction/diagramPointerMoveCoalescer.js`
- `frontend/src/features/process/bpmn/stage/interaction/diagramEditModeBoundary.js`

Write `DRAG_LAG_ROOT_CAUSE.md` and `DECOMPOSITION_REPORT.md` (if extraction happened).

## Part F — Bounded Drag Performance Fix

Based on forensic evidence, choose from:

**Option E — Strengthen dragInProgress guard**
- Extend guard to MORE handlers in `wireBpmnStageRuntimeEvents.js`.
- Cover `selection.changed`, `canvas.viewbox.changed`, and any new handlers found in forensic.

**Option F — Extract drag side-effect guard**
- Move dragInProgress logic to dedicated module.
- Make it testable and bounded.

**Option G — RAF coalescing for pointermove**
- Use refs + requestAnimationFrame for UI-only updates.
- Avoid React render per pointer event.

**Option H — Suppress decor/selection/panel during drag**
- Skip `syncAiQuestionPanelWithSelection` during drag.
- Skip decor fanout during drag.
- Skip property panel updates during drag.
- Resume on mouseup.

Do NOT apply all options blindly. Apply only those supported by baseline evidence.

## Part G — Engine Evaluation Update

Create `ENGINE_EVALUATION_UPDATE.md`:
- Evaluate bpmn-js, GoJS, yFiles, JointJS+, React Flow, custom canvas.
- Document licensing, BPMN XML compatibility, migration cost, large-graph performance evidence.
- Decision: continue bpmn-js optimization OR recommend research/prototype contour.
- If recommend prototype, suggest contour ID:
  - `research/diagram-engine-evaluation-large-bpmn-v1`
  - or `prototype/diagram-gojs-or-yfiles-large-flow-spike-v1`

No library install in this contour.

## Part H — After Fix Validation

Repeat D2, D3, D4 after drag fix and compare:
- Drag duration before vs after.
- Event counts before vs after.
- DOM/SVG stability.
- Console errors.
- Network safety (0 PUT/PATCH from view interactions).

Threshold:
- Reduce long task count by at least 50% vs baseline for same scenario.
- Reduce total drag duration materially.
- No multi-second stall.
- Element drag usable.
- If metrics noisy, run 3 attempts and report median.

Write `RUNTIME_BEFORE_AFTER.md`.

## Part I — Reports

Create these files in the contour directory:
1. `EXEC_REPORT.md` — summary of all work.
2. `REVIEWER_GSD_GATE_REPORT.md` — reviewer GSD discipline implementation proof.
3. `VERSION_UPDATE_LEDGER_PROOF.md` — version bump proof.
4. `READ_ONLY_REMOVAL_OR_EDIT_MODE_REPORT.md` — edit mode changes.
5. `REAL_DRAG_BASELINE.md` — baseline measurements.
6. `DRAG_LAG_ROOT_CAUSE.md` — what causes lag.
7. `RUNTIME_BEFORE_AFTER.md` — comparison.
8. `DECOMPOSITION_REPORT.md` — if extraction happened.
9. `ENGINE_EVALUATION_UPDATE.md` — engine evaluation.
10. `IMPLEMENTATION_NOTES.md` — any caveats, known issues.
11. `READY_FOR_REVIEW` — marker file.

If blocked, write `EXEC_BLOCKED.md` and do NOT create `READY_FOR_REVIEW`.

## Hard Rules
- No backend/schema/storage changes unless EXEC_BLOCKED first and explicitly justified.
- No BPMN XML mutation from view interactions.
- No Product Actions / RAG / AG-UI changes.
- No stage/prod deploy.
- No PR/merge/push.
- No secrets in reports.
- Build must pass (`npm run build` 0 errors).
- If Modeler default causes >20s initial load regression on large diagram, fallback to Option C (obvious edit toggle).
