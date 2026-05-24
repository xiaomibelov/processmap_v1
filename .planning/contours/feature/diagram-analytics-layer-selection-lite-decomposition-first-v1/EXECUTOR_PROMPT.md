# Agent 2 / Executor Prompt

## Contour

`feature/diagram-analytics-layer-selection-lite-decomposition-first-v1`

## Your Role

You are Agent 2 / Executor. You implement the bounded decomposition-first plan.

## Must Read Before Coding

1. `PLAN.md` (this contour)
2. `RUNTIME_NAVIGATION.md`
3. `RUNTIME_PROOF_CHECKLIST.md`
4. `STATE.json`
5. Previous audit reports:
   - `.planning/contours/audit/diagram-baseline-no-overlays-canvas-profile-v1/REVIEW_REPORT.md`
   - `.planning/contours/audit/diagram-baseline-no-overlays-canvas-profile-v1/BASELINE_PROFILE_REPORT.md`
   - `.planning/contours/fix/diagram-decor-pipeline-disable-when-overlays-off-v1/REVIEW_REPORT.md`

## Hard Rules

- **NO product code changes** until Phase 1 extraction is complete and proven.
- **NO backend changes**.
- **NO package changes** unless explicitly justified and approved.
- **NO BPMN XML mutation** from analysis/view interactions.
- **NO PUT/PATCH** triggered by view-mode selection/hover/pan/zoom.
- **NO commit/push/PR/deploy**.
- Preserve previous passes:
  - overlay culling;
  - versions dedupe;
  - non-edit mutation guard;
  - RAF coalescing;
  - decor-off guard.

## Two-Phase Implementation

### Phase 1: Behavior-Preserving Extraction

Extract bounded modules BEFORE adding any new behavior.

#### 1.1 Extract Selection Focus Decor

**From:** `frontend/src/components/process/BpmnStage.jsx` lines 2030-2143
**To:** `frontend/src/features/process/bpmn/stage/decor/selectionFocusDecor.js`

Functions:
- `clearSelectionFocusDecor(inst, kind, focusMarkerStateRef)`
- `markFocusDecor(canvas, kind, elementId, className)`
- `applySelectionFocusDecor(inst, kind, selectedEl, focusMarkerStateRef)`
- `setSelectedDecor(inst, kind, elementId, { selectedMarkerStateRef, focusMarkerStateRef })`

Requirements:
- Same signatures (or as close as possible).
- Same DOM output for same input.
- Same ref mutation patterns.
- BpmnStage imports and delegates to these functions.
- Add unit tests if project convention requires.

#### 1.2 Extract Selection Emission Logic

**From:** `frontend/src/components/process/BpmnStage.jsx` lines 3236-3282
**To:** `frontend/src/features/process/bpmn/stage/interaction/elementSelectionEmitter.js`

Functions:
- `emitElementSelectionChange(payload, { onElementSelectionChangeRef, selectedMarkerStateRef })`
- `emitElementSelection(el, source, extra, { onElementSelectionChangeRef })`

Requirements:
- Same callback payloads.
- Same `traceSelectionContinuity` calls preserved.
- BpmnStage imports and delegates.

#### 1.3 Validate Extraction

- Run build: `cd /opt/processmap-test/frontend && npm run build`
- Run relevant tests.
- Playwright runtime check: DOM/SVG counts must match pre-extraction baseline exactly.
- Document in `DECOMPOSITION_REPORT.md`.

### Phase 2: Selection-Lite / Analytics Layer MVP

#### 2.1 Create Analytics Mode Controller

**New:** `frontend/src/features/process/bpmn/stage/interaction/diagramAnalyticsMode.js`

```js
// Suggested API (adapt to project conventions)
export function createAnalyticsModeRef(initial = "analytics") {
  return { current: initial };
}
export function isDiagramAnalyticsMode(modeRef) {
  return String(modeRef?.current || "") === "analytics";
}
export function isDiagramEditMode(modeRef) {
  return String(modeRef?.current || "") === "edit";
}
export function shouldUseEditorSelection(modeRef) {
  return isDiagramEditMode(modeRef);
}
```

#### 2.2 Create Analytics Selection State

**New:** `frontend/src/features/process/bpmn/stage/interaction/diagramAnalyticsSelection.js`

```js
// Suggested API
export function createAnalyticsSelectionState() {
  return {
    selectedIdRef: { current: "" },
    hoveredIdRef: { current: "" },
  };
}
export function setAnalyticsSelected(state, elementId) {
  state.selectedIdRef.current = String(elementId || "").trim();
}
export function clearAnalyticsSelected(state) {
  state.selectedIdRef.current = "";
}
export function getAnalyticsSelectedId(state) {
  return state.selectedIdRef.current;
}
```

Requirements:
- No BPMN mutation.
- No commandStack.
- No canvas.addMarker mass updates.

#### 2.3 Create Lightweight Highlight

**New:** `frontend/src/features/process/bpmn/stage/analytics/applyAnalyticsSelectionHighlight.js`

```js
// Suggested API
export function applyAnalyticsHighlight(inst, kind, elementId, { selectedMarkerStateRef }) {
  // Add single lightweight marker to selected element only
  // Do NOT iterate all elements
}
export function clearAnalyticsHighlight(inst, kind, { selectedMarkerStateRef }) {
  // Remove lightweight marker
}
```

Requirements:
- Uses `canvas.addMarker(id, "fpcAnalyticsSelected")` or similar single class.
- Does NOT call `applySelectionFocusDecor`.
- Does NOT create bendpoints/draggers.
- CSS rule can be added to existing stylesheet or inline.

#### 2.4 Integrate into Event Wiring

**Evaluate at source level:**

1. Read `wireBpmnStageRuntimeEvents.js` thoroughly.
2. Determine: can `selection.changed` be intercepted or suppressed for analytics mode?
3. Options:
   - **Option A:** Use `eventBus.on("element.click", ...)` for analytics mode, and suppress `selection.changed` side effects.
   - **Option B:** Let `selection.changed` fire but replace `setSelectedDecor` call with analytics selection in analytics mode.
   - **Option C:** If suppression is unsafe, keep `selection.changed` but skip `applySelectionFocusDecor` in analytics mode.

Agent 2 must choose the SAFEST option based on source analysis.

#### 2.5 Connect to BpmnStage

- Add `analyticsModeRef` to BpmnStage (default `"analytics"`).
- Pass `analyticsModeRef` to event wiring functions.
- In analytics mode:
  - Click → analytics selection → lightweight highlight → `emitElementSelection` (so property panel works).
  - Skip `applySelectionFocusDecor` (no mass dimming).
- In edit mode:
  - Keep existing behavior exactly.

#### 2.6 Mode Toggle

- Do NOT add a new user-facing mode switch unless absolutely required.
- Internal MVP default: analytics mode is ON for normal diagram tab.
- Edit mode: activated by existing explicit edit actions (context menu "Редактировать", sidebar edit buttons, etc.).
- If existing actions already mutate BPMN, they naturally imply edit mode.

## Source Map Deep Dive Commands

Run these to understand internals before deciding strategy:

```bash
cd /opt/processmap-test/frontend/src
# bpmn-js selection internals
grep -R "get('selection')" -n components/process/BpmnStage.jsx | head -20
grep -R "select\(" -n features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js | head -20
# modeler config options
grep -R "new Viewer\|new Modeler\|BpmnModeler\|NavigatedViewer" -n components/process/BpmnStage.jsx | head -20
# How does bpmn-js create bendpoints?
grep -R "djs-bendpoint\|djs-segment-dragger\|djs-resizer" -n . | head -20
```

## Runtime Validation Scenarios

### Scenario A — Baseline Before Code
1. Open Diagram.
2. Ensure overlays off.
3. Count baseline DOM/SVG.
4. Click one BPMN task.
5. Count after selection.
6. Record `fpcFocusDim` count.
7. Record bpmn-js selection handles/draggers count.

### Scenario B — After Extraction Only
1. Run build/tests.
2. Same counts as Scenario A expected.
3. Document extraction proof.

### Scenario C — After Selection-Lite
1. Open Diagram in analysis/view mode.
2. Click same BPMN task.
3. Count DOM/SVG delta.
4. Count `fpcFocusDim`.
5. Count selection handles/draggers.
6. Verify selected element details still work.

### Scenario D — Edit Mode Safety
1. Enter explicit edit mode if available.
2. Verify selection/edit affordances still available.
3. Do not perform destructive save unless safe test path exists.

### Scenario E — Tab/Network Safety
1. Analysis ↔ Diagram.
2. XML ↔ Diagram.
3. Pan/zoom/hover/select.
4. Verify no PUT/PATCH and no versions spam.

## Deliverables

Create these files in the contour directory:

1. `EXEC_REPORT.md` — summary, what was done, blockers, evidence.
2. `DECOMPOSITION_REPORT.md` — what extracted, old path, new path, behavior proof.
3. `SELECTION_LITE_DESIGN.md` — chosen strategy (A/B/C/D), why, how it works.
4. `PERFORMANCE_BEFORE_AFTER.md` — DOM/SVG counts, fpcFocusDim, handles/draggers.
5. `IMPLEMENTATION_NOTES.md` — files changed, risks, rollback instructions.
6. `READY_FOR_REVIEW` — marker file when complete.

If blocked:
- `EXEC_BLOCKED.md` — reason, attempted workarounds, recommendation.

## Final Check Before READY_FOR_REVIEW

- [ ] Build passes.
- [ ] Tests pass (or pre-existing failures documented).
- [ ] Playwright runtime proof complete.
- [ ] DOM/SVG counts documented.
- [ ] No PUT/PATCH from view interactions.
- [ ] No versions spam regression.
- [ ] Edit mode still works.
- [ ] Property panel still works.
- [ ] No backend changes.
- [ ] No package changes.
- [ ] No unrelated file changes.
