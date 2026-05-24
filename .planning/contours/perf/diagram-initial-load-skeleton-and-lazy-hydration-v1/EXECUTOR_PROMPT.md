# Agent 2 / Executor Prompt

## Identity
- **Contour**: `perf/diagram-initial-load-skeleton-and-lazy-hydration-v1`
- **Run ID**: `20260515T173112Z-38823`
- **Role**: Agent 2 / Executor
- **Scope**: Frontend-only bounded performance changes. No backend. No package changes. No BPMN XML mutation. No Product Actions / RAG / AG-UI changes.

## Pre-Execution Checklist

Before writing product code:
1. Read `PLAN.md` in this contour directory.
2. Read `RUNTIME_NAVIGATION.md`.
3. Read `RUNTIME_PROOF_CHECKLIST.md`.
4. Read `STATE.json`.
5. Read previous audit reports:
   - `.planning/contours/audit/diagram-post-optimization-runtime-profile-v1/POST_OPTIMIZATION_PROFILE_REPORT.md`
   - `.planning/contours/audit/diagram-post-optimization-runtime-profile-v1/NEXT_CONTOUR_DECISION_MATRIX.md`

## Source Map Before Code

Confirm the critical vs non-critical load path:

**Critical (blocks canvas first paint)**:
- `ProcessStage.jsx` — shell rendering, tab container
- `BpmnStage.jsx` — viewer/modeler init, `diagramReady` state
- `useProcessTabs.js` — tab switch orchestration
- `buildProcessDiagramOverlayLayersProps.js` — prop building

**Non-critical (can defer)**:
- `useBpmnSettledDecorFanout.js` — notes, stepTime, robotMeta, properties fanouts
- `NotesPanel.jsx` — property panel heavy computation
- `useDiagramElementMetaModel.js` — derived meta maps
- `useDiagramDodQualityModel.js` — DOD/quality maps
- `useQualityDerivation.js` — quality hints
- `useCoverageDerivation.js` — coverage matrix
- `ProcessPanels.jsx` — attention panel
- `ElementSettingsControls.jsx` — sidebar settings
- Playback adapters/controllers

**God-file risk**:
- `ProcessStage.jsx` (6,626 lines)
- `BpmnStage.jsx` (5,765 lines)

If you touch either, you MUST extract first. See Decomposition Rules below.

## Baseline Before Code

Run these scenarios and record in `PERFORMANCE_BEFORE_AFTER.md` ("Before" section):

### Scenario A — Cold Open to Diagram
1. Open runtime at `http://clearvestnic.ru:5180`.
2. Authenticate via `localStorage.setItem('fpc_auth_access_token', ...)` if needed.
3. Navigate to session `wewe` (`4c515d1c6e`).
4. Ensure Diagram tab is active.
5. Measure:
   - `performance.now()` at navigation start.
   - Time to `.djs-container` visible.
   - Time to `[data-testid="diagram-ready"]` present.
   - DOM count at ready.
   - SVG count at ready.
6. Record: `document.querySelectorAll('*').length`, `document.querySelectorAll('svg *').length`.

### Scenario B — Warm Tab Switch to Diagram
1. Open session `wewe` with Diagram active.
2. Switch to Analysis tab.
3. Switch back to Diagram.
4. Measure:
   - Click time.
   - Time to first visual feedback.
   - Time to canvas visible.
   - Time to `diagram-ready`.
5. Repeat 3 times. Record min/max/median.

### Scenario C — XML ↔ Diagram
1. With Diagram active, switch to XML.
2. Switch back to Diagram.
3. Measure same as Scenario B.

### Scenario D — Network/Mutation Safety
1. Open browser DevTools Network.
2. Filter:
   - `method:PUT path:/bpmn`
   - `method:PATCH path:/sessions`
   - `path:/bpmn/versions?limit=1`
3. Verify:
   - 0 PUT `/bpmn` from load/tab switch.
   - 0 PATCH `/sessions` from load/tab switch.
   - `versions?limit=1` ≤ 5 background polls.

### Browser Snippets
```js
// DOM / SVG counts
document.querySelectorAll('*').length
document.querySelectorAll('svg *').length
document.querySelectorAll('.djs-container').length
document.querySelectorAll('.fpcPropertyOverlay').length
document.querySelectorAll('.fpcAnalyticsSelected').length
```

## Decomposition Rules (Mandatory)

If you modify `ProcessStage.jsx` or `BpmnStage.jsx`:

1. **Extract FIRST**:
   - `features/process/bpmn/stage/load/DiagramSkeleton.jsx`
   - `features/process/bpmn/stage/load/useDiagramStagedHydration.js`
   - `features/process/bpmn/stage/load/useDeferredDecorFanout.js`
   - `features/process/stage/orchestration/useStableDiagramTabBoundary.js` (if needed)
2. Make behavior-preserving extraction.
3. Run build + tests.
4. Document in `DECOMPOSITION_REPORT.md`.

**Forbidden**:
- Adding new lazy/hydration logic directly inside ProcessStage/BpmnStage without extraction.
- Increasing god-file line counts.
- Broad refactor.
- Rewriting session editor.

## Implementation Phases

### Phase 1: Extraction (if needed)
Extract modules listed above. Build + tests must pass.

### Phase 2: Skeleton
- Create `DiagramSkeleton.jsx`.
- Render inside BpmnStage when `!diagramReady`.
- Use CSS-only animation (pulse). No new dependencies.
- Hide cleanly when ready.

### Phase 3: Deferred Decor Hydration
- In extracted hook or BpmnStage:
  - Immediate: selection focus fanout.
  - Deferred: notes, stepTime, robotMeta, properties overlays.
- Use `requestIdleCallback` with `setTimeout(fn, 0)` fallback.
- Track `deferredHydrationStage` state.

### Phase 4: Render Boundary / Memo
- In ProcessStage:
  - Memoize the Diagram tab content subtree.
  - Stabilize props to BpmnStage.
  - Ensure tab switch does not trigger full NotesPanel re-computation unless data changed.

### Phase 5: Property Panel Boundary (optional, if time)
- Wrap NotesPanel in memo boundary.
- Use `useDeferredValue` for heavy computations if safe.

## Validation

After implementation:
1. `npm run build` must pass.
2. Run relevant tests. Document pre-existing failures.
3. Re-run Scenarios A–D. Record "After" section in `PERFORMANCE_BEFORE_AFTER.md`.
4. Verify:
   - Skeleton visible during load.
   - Canvas visible earlier than before.
   - Pan/zoom works after canvas first paint.
   - Selection works.
   - Property panel works after hydration.
   - Overlays appear after deferred hydration.
   - 0 PUT/PATCH regressions.
   - No new console errors.

## Deliverables

Create in this contour directory:
- `EXEC_REPORT.md`
- `DECOMPOSITION_REPORT.md` (if extraction happened)
- `LOAD_PATH_SOURCE_MAP.md`
- `PERFORMANCE_BEFORE_AFTER.md`
- `IMPLEMENTATION_NOTES.md`
- `READY_FOR_REVIEW`

If blocked: create `EXEC_BLOCKED.md`, no `READY_FOR_REVIEW`.

## Constraints

- No backend changes.
- No `package.json` / `package-lock.json` changes.
- No BPMN XML mutation logic changes.
- No Product Actions / RAG / AG-UI changes.
- No `.env` changes.
- No secrets in reports.
- No commit/push/PR/deploy.
