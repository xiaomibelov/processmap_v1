# Pointermove Side Effects Report

## Contour
`perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1`

---

## Side Effects Suppressed During Drag

### 1. Decor Fanout (5 layers)
- **Files**: `useBpmnSettledDecorFanout.js`
- **Effects**: Notes, StepTime, RobotMeta, Properties, Selection fanouts
- **Before**: All 5 useEffects fired when dependencies changed during drag
- **After**: Early-return if `dragInProgressRef.current === true`
- **Risk**: Low — one post-drag refresh scheduled via `readySignal` re-fire after drag ends

### 2. Autosave/Mutation Staging
- **Files**: `BpmnStage.jsx` → `useDiagramMutationLifecycle.js`
- **Before**: `commandStack.changed` during element drag → `emitDiagramMutation` → `queueDiagramMutation` → `scheduleDiagramAutosave`
- **After**: `emitDiagramMutation` checks `isDragInProgress()`, sets `pendingDragMutationRef.current = true`, and returns. On `drag.cleanup`, one mutation is emitted.
- **Risk**: Low — legitimate edit is preserved, just deferred to drag end

### 3. Selection/AI/Property Sync
- **Files**: `wireBpmnStageRuntimeEvents.js`
- **Before**: `selection.changed` and `canvas.viewbox.changed` handlers called `syncAiQuestionPanelWithSelection`, `setSelectedDecor`, etc.
- **After**: Already guarded by `isDragInProgress` from previous contour. Verified still in place.
- **Risk**: Very low

### 4. commandStack Decor Fanout
- **Files**: `wireBpmnStageRuntimeEvents.js` → `bindModelerStageEvents`
- **Before**: `onCommandStackChanged` called `runImmediateEditorFanout` during drag
- **After**: Already guarded by `isDragInProgress` from previous contour. Verified still in place.
- **Risk**: Very low

---

## Side Effects That Remain (Unavoidable)

### bpmn-js Engine Work
- SVG viewport transforms during canvas pan
- Shape position updates during element drag
- These are internal to bpmn-js and cannot be suppressed without engine replacement

### RAF Coalescing
- `diagramPointerMoveCoalescer.js` still schedules RAF for post-drag decor updates
- This is intentional — batches work rather than suppressing it entirely

---

## Verification

| Check | Expected | Actual |
|-------|----------|--------|
| `useBpmnSettledDecorFanout` drag guard | All 5 effects early-return | ✅ Implemented |
| `emitDiagramMutation` drag guard | Suppress mutation, set pending | ✅ Implemented |
| `drag.cleanup` post-drag flush | Emit one mutation if pending | ✅ Implemented |
| `wireBpmnStageRuntimeEvents` existing guards | Still in place | ✅ Verified |
| Network PUT/PATCH during drag | 0 | ⏳ Agent 3 verify |
| Console errors | 0 | ⏳ Agent 3 verify |
