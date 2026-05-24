# Decomposition Report

## Contour
`perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1`

---

## Decision: No New Modules Extracted

This contour reuses existing bounded modules rather than creating new ones:

### Reused Modules

1. **`diagramDragSideEffectGuard.js`** (existing)
   - Provides `isDragInProgress()` and `createDragSideEffectGuardRef()`
   - Used in `BpmnStage.jsx` (imported) and `wireBpmnStageRuntimeEvents.js` (imported)
   - No changes needed.

2. **`diagramPointerMoveCoalescer.js`** (existing)
   - Provides `scheduleRafForInstance()` and `cancelRafForInstance()`
   - Already used for post-viewbox decor updates.
   - No changes needed; post-drag decor updates are naturally coalesced by existing RAF scheduling in `onViewboxChanged`.

3. **`useBpmnSettledDecorFanout.js`** (existing, modified)
   - Added `dragInProgressRef` prop.
   - Each of the 5 `useEffect` blocks now early-returns if drag is active.
   - This is a bounded change to an existing decomposition module — no new file created.

### Why No New Module

The `pendingDragMutationRef` pattern is state that is:
- Created in `BpmnStage.jsx` (the component that owns `emitDiagramMutation`)
- Passed to `wireBpmnStageRuntimeEvents.js` (the module that owns `drag.cleanup`)
- Consumed in `bindContextMenuRuntimeEvents` (the function that handles drag lifecycle)

Extracting this into a separate module would add indirection without reducing coupling, since the ref must be shared between `emitDiagramMutation` (BpmnStage) and `drag.cleanup` (wire events). The ref lives naturally in BpmnStage's closure and is passed down as a prop.

### Bounded Change Summary

| File | Change Type | Lines Added |
|------|-------------|-------------|
| `useBpmnSettledDecorFanout.js` | Prop + guards | ~6 |
| `BpmnStage.jsx` | Ref + guard + prop pass | ~15 |
| `wireBpmnStageRuntimeEvents.js` | Props + flush logic | ~10 |

All changes are within the existing `frontend/src/features/process/bpmn/stage/interaction/` and `orchestration/` bounded directories.
