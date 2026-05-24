# IMPLEMENTATION_NOTES — feature/diagram-analytics-layer-selection-lite-decomposition-first-v1

**Run ID**: `20260515T125319Z-23963`  
**Executor**: Agent 2 / Executor  
**Date**: 2026-05-15

---

## Files Created

### Phase 1: Extraction

1. `frontend/src/features/process/bpmn/stage/decor/selectionFocusDecor.js`
   - Exports: `clearSelectionFocusDecor`, `markFocusDecor`, `applySelectionFocusDecor`, `setSelectedDecor`
   - Self-contained: defines local `asArray`, `isSelectableElement`, `isConnectionElement`, `isContainerElement`

2. `frontend/src/features/process/bpmn/stage/interaction/elementSelectionEmitter.js`
   - Exports: `emitElementSelectionChange`, `emitElementSelection`
   - Includes `traceSelectionContinuity` and `shouldTraceSelectionContinuity` locally (behavior-preserving)
   - `emitElementSelection` accepts a `deps` bag for injected helpers

### Phase 2: Analytics Layer

3. `frontend/src/features/process/bpmn/stage/interaction/diagramAnalyticsMode.js`
   - Exports: `createAnalyticsModeRef`, `isDiagramAnalyticsMode`, `isDiagramEditMode`, `shouldUseEditorSelection`, `enterDiagramEditMode`, `enterDiagramAnalyticsMode`

4. `frontend/src/features/process/bpmn/stage/interaction/diagramAnalyticsSelection.js`
   - Exports: `createAnalyticsSelectionState`, `setAnalyticsSelected`, `clearAnalyticsSelected`, `getAnalyticsSelectedId`, `setAnalyticsHovered`, `clearAnalyticsHovered`, `getAnalyticsHoveredId`

5. `frontend/src/features/process/bpmn/stage/analytics/applyAnalyticsSelectionHighlight.js`
   - Exports: `applyAnalyticsHighlight`, `clearAnalyticsHighlight`
   - Uses marker class `fpcAnalyticsSelected`

---

## Files Modified (This Contour Only)

| File | Change |
|------|--------|
| `frontend/src/components/process/BpmnStage.jsx` | Added imports for extracted + analytics modules; added `analyticsModeRef` and `analyticsSelectedMarkerStateRef`; updated `clearSelectedDecor` to clear analytics highlight; passed analytics refs to `bindViewerStageEvents` and `bindModelerStageEvents`; added analytics mode helpers to `createImperativeApiCtx` |
| `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` | Imported analytics helpers; added `analyticsModeRef` and `analyticsSelectedMarkerStateRef` to `bindViewerStageEvents` and `bindModelerStageEvents`; branched `onSelectionChanged` for analytics vs edit mode; added auto-switch listeners (`directEditing.activate`, `drag.start`, `create.start`, `connect.start`, `resize.start`) in `bindModelerStageEvents` |
| `frontend/src/features/process/bpmn/stage/imperative/bpmnStageImperativeApi.js` | Added `enterDiagramEditMode`, `enterDiagramAnalyticsMode`, `isDiagramAnalyticsMode` to imperative API |
| `frontend/src/styles/app/05/05-02-bpmn-text-contrast.css` | Added `.fpcAnalyticsSelected` CSS rules (shape stroke, glow, connection stroke) mirroring `.fpcElementSelected` |
| `frontend/src/components/process/BpmnStage.readable-label-source.test.mjs` | Updated to verify `readableBpmnText` usage in extracted `elementSelectionEmitter.js` |

---

## Risks

| Risk | Status | Mitigation |
|------|--------|------------|
| bpmn-js modeler selection cannot be fully suppressed | Accepted | We don't suppress it; we only replace ProcessMap's visual feedback. Editor handles still appear in edit mode. |
| Property panel stops receiving selection events | Mitigated | `emitElementSelection` is called identically in both modes. Runtime verified. |
| Edit mode accidentally disabled | Mitigated | Auto-switch on explicit editing gestures + imperative API. Runtime verified. |
| NavigatedViewer lifecycle temptation | Out of scope | Documented as future contour in `SELECTION_LITE_DESIGN.md`. |
| CSS class name collision | Mitigated | `fpcAnalyticsSelected` is distinct from `fpcElementSelected`. |

---

## Rollback Instructions

If rollback is needed:

1. Revert `frontend/src/components/process/BpmnStage.jsx` to pre-contour version.
2. Revert `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`.
3. Revert `frontend/src/features/process/bpmn/stage/imperative/bpmnStageImperativeApi.js`.
4. Revert `frontend/src/styles/app/05/05-02-bpmn-text-contrast.css`.
5. Revert `frontend/src/components/process/BpmnStage.readable-label-source.test.mjs`.
6. Delete new files:
   - `frontend/src/features/process/bpmn/stage/decor/selectionFocusDecor.js`
   - `frontend/src/features/process/bpmn/stage/interaction/elementSelectionEmitter.js`
   - `frontend/src/features/process/bpmn/stage/interaction/diagramAnalyticsMode.js`
   - `frontend/src/features/process/bpmn/stage/interaction/diagramAnalyticsSelection.js`
   - `frontend/src/features/process/bpmn/stage/analytics/applyAnalyticsSelectionHighlight.js`

No backend changes, no package changes, no DB migration required.
