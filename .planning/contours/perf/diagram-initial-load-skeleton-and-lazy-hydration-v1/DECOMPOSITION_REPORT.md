# DECOMPOSITION_REPORT.md

## God Files Touched

- `frontend/src/components/process/BpmnStage.jsx` (5,765 lines)
- `frontend/src/components/ProcessStage.jsx` (6,626 lines) — indirect (memo boundary only)
- `frontend/src/features/process/stage/ui/ProcessStageDiagramControls.jsx` (1,780 lines) — wrapped in `React.memo`

## Extracted Modules

### 1. `frontend/src/features/process/bpmn/stage/load/DiagramSkeleton.jsx`
- **Purpose**: Render a CSS-only skeleton placeholder when `!diagramReady`
- **Lines**: ~25
- **Dependencies**: None (pure React + CSS)
- **Integration**: Rendered inside BpmnStage's `.bpmnStack` when `diagramReady === false`
- **Tested**: Verified via Playwright runtime — skeleton visible at ~900ms, hidden at ~1800ms

### 2. `frontend/src/features/process/bpmn/stage/load/useDiagramStagedHydration.js`
- **Purpose**: Track hydration stages: `loading` → `canvas_ready` → `decor_loading` → `fully_ready`
- **Lines**: ~50
- **Dependencies**: React hooks only
- **Integration**: Called in BpmnStage.jsx; callbacks passed to `useDeferredDecorFanout`
- **Tested**: State transitions verified via runtime console observation

### 3. `frontend/src/features/process/bpmn/stage/load/useDeferredDecorFanout.js`
- **Purpose**: Wrap `useBpmnSettledDecorFanout` so non-critical fanouts are scheduled via `requestIdleCallback` (with `setTimeout` fallback)
- **Lines**: ~150
- **Dependencies**: `useBpmnSettledDecorFanout`, React hooks
- **Integration**: Replaces direct `useBpmnSettledDecorFanout` call in BpmnStage.jsx
- **Deferred fanouts**: notes, stepTime, robotMeta, properties
- **Immediate fanout**: selection (required for interaction)
- **Tested**: Build passes; runtime shows deferred overlays appear after canvas ready

### 4. `ProcessStageDiagramControls` memoization
- **Purpose**: Reduce re-render churn when ProcessStage re-renders on tab switch
- **Change**: `export default React.memo(ProcessStageDiagramControls)`
- **Impact**: Shallow-prop comparison prevents re-render when `view` object is unchanged

## Decomposition Rules Followed

- Behavior-preserving extraction first
- Build + tests pass after each extraction
- No god-file line count increase
- No broad refactor
