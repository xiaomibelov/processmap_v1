# Implementation Notes

## Contour
`perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1`

---

## Architectural Decisions

### 1. Decor Fanout Suppression via Ref (not State)
**Decision**: Pass `dragInProgressRef` (a ref object) to `useBpmnSettledDecorFanout` rather than a React state boolean.
**Rationale**: 
- Using state would cause the hook to re-render when drag starts/ends, which is exactly the kind of React churn we're trying to avoid during drag.
- A ref is read synchronously inside `useEffect` without triggering re-renders.
- The ref is already managed by `bindContextMenuRuntimeEvents` in `wireBpmnStageRuntimeEvents.js`.

### 2. Mutation Deferral (pendingDragMutationRef)
**Decision**: In `emitDiagramMutation`, suppress the mutation during drag and set a pending flag. Flush on `drag.cleanup`.
**Rationale**:
- `emitDiagramMutation` is the single chokepoint where all diagram mutations pass through.
- It already has `suppressEmitDiagramMutationRef` for programmatic suppression; adding drag suppression follows the same pattern.
- Deferring rather than dropping ensures legitimate edits are not lost.
- One post-drag mutation is sufficient — continuous `commandStack.changed` events during drag represent a single user gesture.

### 3. No Changes to useDiagramMutationLifecycle.js
**Decision**: Keep the autosave queue hook unchanged; suppress at the emission point instead.
**Rationale**:
- `useDiagramMutationLifecycle.js` is already correctly filtering empty `commandStack.changed` and init-like sources.
- Adding drag awareness to this hook would require passing drag state through multiple component layers (ProcessStage → BpmnStage → hook), increasing coupling.
- Suppressing at `emitDiagramMutation` is more bounded and explicit.

### 4. Decomposition-First Observed
**Decision**: No new files extracted; changes kept within existing bounded modules.
**Rationale**:
- `diagramDragSideEffectGuard.js` already exists and provides `isDragInProgress`.
- `diagramPointerMoveCoalescer.js` already exists for RAF batching.
- The new logic (pending mutation ref) is state that naturally belongs in `BpmnStage.jsx` (the owner of `emitDiagramMutation`).
- The hook `useBpmnSettledDecorFanout` is already a bounded module; adding one prop is minimal.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Post-drag decor refresh delayed | Low | Low | `readySignal` will re-fire on next dependency change after drag ends |
| Pending mutation lost if drag.cleanup doesn't fire | Very low | Medium | `pendingDragMutationRef` is only set during drag; bpmn-js guarantees `drag.cleanup` |
| bpmn-js engine still dominates cost | Medium | High | Document with evidence; recommend engine prototype contour |

---

## Files Modified

1. `frontend/src/config/appVersion.js` — version bump to v1.0.128
2. `scripts/generate-build-info.mjs` — contourId fallback update
3. `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js` — drag guard in 5 useEffects
4. `frontend/src/components/process/BpmnStage.jsx` — `pendingDragMutationRef`, drag guard in `emitDiagramMutation`, pass `dragInProgressRef` to hook
5. `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` — accept `pendingDragMutationRef` and `emitDiagramMutation`, flush on `drag.cleanup`
