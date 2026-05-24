# IMPLEMENTATION_NOTES.md

## Deviations from Plan

### 1. `useDiagramDerivedModel` not called directly in ProcessStage
**Plan**: Call `useDiagramDerivedModel` in ProcessStage to replace all inline useMemos.  
**Deviation**: ProcessStage calls `useDiagramElementMetaModel` early (line ~2857) and `useDiagramDodQualityModel` late (line ~3717) separately.  
**Reason**: `useDiagramDodQualityModel` needs `coverageRowsAll`, `coverageById`, etc. from `useCoverageDerivation` (line ~3724 in original). These inputs are not available at the early point where `useDiagramElementMetaModel` must run. React hooks must execute in the same order on every render, so `useDiagramDerivedModel` cannot be called once with late inputs while its `elementMetaModel` outputs are needed early.  
**Mitigation**: `useDiagramDerivedModel` still exists as an orchestrator and could be used by future consumers. ProcessStage uses the sub-hooks directly.

### 2. `pathHighlightHints` moved to `useDiagramDodQualityModel`
**Plan**: `pathHighlightHints` was not explicitly listed under `useDiagramDodQualityModel`.  
**Deviation**: Included in `useDiagramDodQualityModel` because `diagramHints` (which WAS listed) depends on it. Keeping `pathHighlightHints` inline would require passing it as a parameter, which is equivalent to moving it.  
**Mitigation**: Behavior preserved exactly.

### 3. Attention items (`qualityNodeTitleById`, `coverageNodeMetaById`, `qualityReasonsByNode`, `attentionItemsRaw`, `attentionFilterKinds`, `attentionItems`) kept inline
**Plan**: Lines ~3782-4180 suggested moving all logic in that range.  
**Deviation**: Only the explicitly listed DOD/quality items were extracted. The attention panel logic is logically separate and was left in ProcessStage.  
**Mitigation**: These useMemos depend on `coverageRowsAll` and `coverageById` which are already stable references from `useCoverageDerivation`. They are not a known bottleneck.

### 4. Playwright baseline blocked by auth
**Plan**: Capture before/after DOM/SVG metrics via Playwright.  
**Deviation**: Runtime requires authentication. Headless Playwright could not log in.  
**Mitigation**: Documented in `PERFORMANCE_BEFORE_AFTER.md`. Code-level stability proof provided as proxy.

### 5. `interviewDecorSignature` computed in ProcessStage, not inside `useDiagramDerivedModel`
**Plan**: Pass `interviewDecorModel` from `useDiagramDerivedModel`.  
**Deviation**: Computed directly in ProcessStage using `buildInterviewDecorSignature` with stable primitive deps.  
**Reason**: `useDiagramDerivedModel` is not called in ProcessStage (see deviation #1). Passing `isInterviewMode` and `diagramMode` to the sub-hooks would expand their interfaces.  
**Mitigation**: The signature is stable and passed to BpmnStage. BpmnStage falls back to internal computation if prop is absent.

## Files Changed

### New files
- `frontend/src/features/process/bpmn/stage/derived/diagramDerivedModelHash.js`
- `frontend/src/features/process/bpmn/stage/derived/useDiagramElementMetaModel.js`
- `frontend/src/features/process/bpmn/stage/derived/useDiagramDodQualityModel.js`
- `frontend/src/features/process/bpmn/stage/derived/useDiagramDerivedModel.js`
- `frontend/src/features/process/bpmn/stage/derived/buildInterviewDecorSignature.js`
- `frontend/src/features/process/bpmn/stage/derived/diagramDerivedModelHash.test.mjs`

### Modified files
- `frontend/src/components/ProcessStage.jsx`
- `frontend/src/components/process/BpmnStage.jsx`
- `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js`
- `frontend/src/features/process/stage/orchestration/buildProcessDiagramOverlayLayersProps.js`
- `frontend/src/features/process/stage/orchestration/useStableProcessDiagramOverlayLayersProps.js`

## Rework Round 1 — interviewDecorSignature stable dependency fix

### Issue
Agent 3 found that BpmnStage `interviewDecorSignature` useMemo still included raw `draft` sub-properties in its dependency array even though `interviewDecorSignatureProp` was passed from ProcessStage.

### Fix
Changed the dependency array from a flat list to a **conditional array**:
- When `interviewDecorSignatureProp != null`: `[interviewDecorSignatureProp]` only
- When prop is absent: full fallback dependency array with all `draft` sub-properties

This is the minimal bounded fix. No other files touched.

### Why conditional and not just removing draft deps entirely
`interviewDecorSignatureProp` defaults to `null` in BpmnStage props. In theory it is always passed by current ProcessStage, but BpmnStage might be used from other call sites in the future. The fallback preserves backward compatibility without requiring broad changes to all callers.

## Preserved Fixes

- Overlay culling (`propertiesOverlayDidClearRef` guard) — preserved ✅
- Versions dedupe (`bpmnVersionsListRequestRef` + `bpmnVersionsActiveSessionRef`) — preserved ✅
- Non-edit PUT guard (`queueDiagramMutation` with `diagramMode` check) — preserved ✅
- Decor-off guard (`isInterviewDecorModeOn` + `overlaysOff` check) — preserved ✅
- Selection-lite (`fpcAnalyticsSelected` marker with minimal DOM) — preserved ✅
