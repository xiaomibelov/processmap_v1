# DECOMPOSITION_REPORT — feature/diagram-analytics-layer-selection-lite-decomposition-first-v1

**Run ID**: `20260515T125319Z-23963`  
**Executor**: Agent 2 / Executor  
**Date**: 2026-05-15

---

## Phase 1: Behavior-Preserving Extraction

### 1.1 Selection Focus Decor Module

| Item | Detail |
|------|--------|
| **Source** | `frontend/src/components/process/BpmnStage.jsx` lines 2029–2143 |
| **Target** | `frontend/src/features/process/bpmn/stage/decor/selectionFocusDecor.js` |
| **Functions extracted** | `clearSelectionFocusDecor`, `markFocusDecor`, `applySelectionFocusDecor`, `setSelectedDecor` |
| **Wrapper kept in BpmnStage** | `clearSelectedDecor(inst, kind)` — updated to call extracted `clearSelectionFocusDecor` and also `clearAnalyticsHighlight` |

**Behavior preservation:**
- Same DOM output for same input: `canvas.addMarker(eid, "fpcElementSelected")` and focus decorators (`fpcFocusNeighbor`, `fpcFocusEdgePrimary`, `fpcFocusDim`) are applied identically.
- Same ref mutation patterns: `selectedMarkerStateRef.current[kind]` and `focusMarkerStateRef.current[kind]` updated in the same order.
- BpmnStage imports and delegates via thin wrappers:
  - `setSelectedDecor(inst, kind, elementId)` → `runSetSelectedDecor(inst, kind, elementId, { selectedMarkerStateRef, focusMarkerStateRef })`

### 1.2 Selection Emission Module

| Item | Detail |
|------|--------|
| **Source** | `frontend/src/components/process/BpmnStage.jsx` lines 3236–3291 |
| **Target** | `frontend/src/features/process/bpmn/stage/interaction/elementSelectionEmitter.js` |
| **Functions extracted** | `emitElementSelectionChange`, `emitElementSelection` |
| **Dependencies injected** | `isSelectableElement`, `readableBpmnText`, `readLaneNameForElement`, `getAiQuestionsForElement`, `aiQuestionStats`, `getElementNoteCount` |

**Behavior preservation:**
- Same callback payloads to `onElementSelectionChangeRef`.
- Same `traceSelectionContinuity` calls preserved (moved into the extracted module).
- BpmnStage wraps:
  - `emitElementSelectionChange(payload)` → `runEmitElementSelectionChange(payload, { onElementSelectionChangeRef, selectedMarkerStateRef })`
  - `emitElementSelection(el, source, extra)` → `runEmitElementSelection(el, source, extra, deps)`

### 1.3 Extraction Validation

| Check | Result |
|-------|--------|
| `npm run build` | ✅ Pass (27–30 s) |
| Relevant unit tests | ✅ 19 pass, 3 pre-existing failures (unchanged from baseline) |
| Playwright baseline (before click) | ✅ Total DOM 8,025, SVG 2,392 — exact match to audit baseline |
| Playwright after extraction (before Phase 2) | ✅ Total DOM 11,449, SVG 5,604 — matches pre-extraction editor selection baseline |

**Pre-existing test failures documented:**
- `BpmnStage.selection-continuity.test.mjs`: 3 failures related to `finishImportSelectionGuard` source-regex assertions (already failing on original code).
- Updated `BpmnStage.readable-label-source.test.mjs` to check the extracted `elementSelectionEmitter.js` for `readableBpmnText` usage.

---

## Files Changed in Phase 1

1. **New**: `frontend/src/features/process/bpmn/stage/decor/selectionFocusDecor.js`
2. **New**: `frontend/src/features/process/bpmn/stage/interaction/elementSelectionEmitter.js`
3. **Modified**: `frontend/src/components/process/BpmnStage.jsx` — extracted function definitions replaced with imports + wrappers
4. **Modified**: `frontend/src/components/process/BpmnStage.readable-label-source.test.mjs` — updated to verify extracted module still uses `readableBpmnText`
