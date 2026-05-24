# EXECUTOR_PROMPT.md

## Identity
- **Contour**: `fix/diagram-canvas-reload-loop-and-lag-regression-v1`
- **Run ID**: `20260515T184558Z-42906`
- **Role**: Agent 2 / Executor
- **Scope**: Frontend-only bounded regression fix. No backend. No package changes. No BPMN XML mutation. No Product Actions / RAG / AG-UI changes.

## Forbidden
- Do NOT write backend code.
- Do NOT modify `.env` or secrets.
- Do NOT mutate BPMN XML semantics.
- Do NOT touch Product Actions, registry, AG-UI, RAG.
- Do NOT do broad refactor outside contour.
- Do NOT commit/push/PR/deploy.
- Do NOT leave noisy production logs.

## Read First
1. `PLAN.md`
2. `RUNTIME_NAVIGATION.md`
3. `RUNTIME_PROOF_CHECKLIST.md`
4. `STATE.json`
5. Latest contour reports in `.planning/contours/perf/diagram-initial-load-skeleton-and-lazy-hydration-v1/`

## Phase 1 — Baseline Reproduction (before code changes)

Reproduce multi-load symptom and collect evidence:

### Scenario A — Cold Open
- Fresh browser context.
- Open runtime.
- Open session with Diagram.
- Record:
  - skeleton visible count / duration
  - canvas disappear/reappear count
  - `diagramReady` toggle count (via DOM testid or console)
  - `.bpmnCanvas` container count
  - network requests
  - console logs/errors
  - DOM/SVG counts at idle

### Scenario B — Warm Tab Switch
- Analysis → Diagram → Analysis → Diagram.
- XML → Diagram.
- Record:
  - time to visual feedback
  - remount vs CSS show/hide
  - skeleton flashes
  - DOM/SVG delta
  - network/mutations

### Scenario C — Pan/Zoom
- Wait stable.
- Pan/zoom 5 cycles.
- Record lag, DOM/SVG changes, overlay counts.

### Scenario D — Selection
- Select 5 elements.
- Record DOM/SVG delta, property panel response, lag.

### Instrumentation (temporary, dev-only)
If needed to prove counts, add temporary gated counters:
- BpmnStage render count (ref increment at top of component)
- BpmnStage mount/unmount (useEffect with empty deps / cleanup)
- `setDiagramReady` transitions (wrap setter, log prev→next)
- `importXML` / `new Viewer` / `new Modeler` counts
- `useDeferredDecorFanout` effect runs
- `useProcessTabs` `setTabWithReason` calls

Use `window.__pmDiagramDebug` or `console.count`. Remove before final.

## Phase 2 — Source Forensic

Inspect these areas and document findings in `REGRESSION_ROOT_CAUSE.md`:

1. **useDiagramStagedHydration + useDeferredDecorFanout**
   - Does `stageRef.current = "loading"` in `useDeferredDecorFanout` effect fire repeatedly?
   - Do `viewerInstanceKey` / `modelerInstanceKey` change after initial load?
   - Does `onCanvasReady` / `onFullyReady` callback cause parent re-render?

2. **BpmnStage lifecycle**
   - `setDiagramReady(false)` on `[sessionId, reloadKey]` — does `reloadKey` change unexpectedly?
   - `updateRuntimeStatus` → `setDiagramReady((prev) => prev === nextReady ? prev : nextReady)` — is `nextReady` flapping?
   - `destroyRuntime` vs `renderNewDiagramInModeler` — are they called in a loop?

3. **useProcessTabs**
   - `schedulePendingTabReplay` — is it firing when it shouldn't?
   - `flushBpmnTab` — does it trigger save→pending→replay cycles?
   - `visibleProbeCycleRef` effect — does `ensureVisible` cause churn?

4. **Keys / Props**
   - `ProcessDiagramOverlayLayers` memoization — cache hit or miss?
   - `bpmnStageProps` object identity — which prop changes?
   - Does BpmnStage remount? (check React DevTools or DOM node identity)

5. **Recent changes**
   - `git diff d805e1c..HEAD -- frontend/src/components/process/BpmnStage.jsx` — what changed?
   - `git diff d805e1c..HEAD -- frontend/src/features/process/hooks/useProcessTabs.js` — what changed?
   - `git diff d805e1c..HEAD -- frontend/src/components/ProcessStage.jsx` — what changed?

## Phase 3 — Implement Bounded Fix

Choose based on evidence from Phase 2. Options from PLAN.md:

- **Option A**: Revert/disable staged skeleton/lazy hydration if culprit.
- **Option B**: Stabilize `diagramReady` / hydration state.
- **Option C**: Fix `useProcessTabs` remount/regression.
- **Option D**: Prevent repeated importXML / modeler init.
- **Option E**: Memoize specific parent props if proven churn.
- **Option F**: Isolate and revert culprit file from dirty tree.

### Implementation Rules
- Make MINIMAL changes.
- One fix at a time; validate before stacking.
- If a change does not improve runtime, revert it.
- Do not preserve a bad feature because it passed review.

## Phase 4 — Validate

### Build / Tests
- `npm run build` must pass.
- Existing unit tests must pass (or pre-existing failures documented).

### Runtime Scenarios (repeat A–D)
- Compare before/after timings.
- Compare mount/init/import counts.
- Confirm no repeated skeleton/canvas reload cycles.
- Confirm pan/zoom is usable.
- Confirm selection-lite works.
- Confirm property panel works.

### Network / Safety
- 0 PUT `/bpmn` from view interactions.
- 0 PATCH `/sessions` from view interactions.
- No versions spam.
- No console errors.

## Phase 5 — Reports

Create these files in the contour directory:

1. `EXEC_REPORT.md` — what was done, what was fixed, build/test status, runtime evidence.
2. `REGRESSION_ROOT_CAUSE.md` — which hypothesis was confirmed, root cause, evidence.
3. `RUNTIME_BEFORE_AFTER.md` — concrete before/after timings and counts.
4. `IMPLEMENTATION_NOTES.md` — files changed, lines changed, rationale.
5. `READY_FOR_REVIEW` — marker file when all gates pass.

If blocked:
- `EXEC_BLOCKED.md` — reason, evidence, next steps.
- Do NOT create `READY_FOR_REVIEW`.
