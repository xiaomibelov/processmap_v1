# Drag Hot Path Root Cause

## Contour
`perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1`

---

## Root Cause 1: Decor Fanout Runs During Drag

**Location**: `useBpmnSettledDecorFanout.js`

**Problem**: The hook contains 5 `useEffect` blocks that run decor fanouts (notes, stepTime, robotMeta, properties, selection). During drag, if any dependency changes (e.g., `readySignal`, `view`, `notesSig`), these fanouts execute synchronously and mutate SVG overlays. On large diagrams with 2,100+ SVG nodes, this creates long tasks during every drag frame.

**Fix**: Added `dragInProgressRef` prop to the hook. Each `useEffect` now early-returns if `dragInProgressRef.current` is true, suppressing all decor fanouts during active drag.

**Status**: ✅ Fixed in this contour.

---

## Root Cause 2: Mutation/Autosave Staging Fires During Element Drag

**Location**: `BpmnStage.jsx` → `emitDiagramMutation` → `bpmnWiring.js` → `useDiagramMutationLifecycle.js`

**Problem**: During element drag, bpmn-js Modeler fires `commandStack.changed` on every position update. This flows through:
1. `createBpmnCoordinator.onRuntimeChange` (bpmnWiring.js)
2. `emitDiagramMutation` (BpmnStage.jsx)
3. `queueDiagramMutation` (useDiagramMutationLifecycle.js)
4. `scheduleDiagramAutosave` → potential PATCH/PUT

While `wireBpmnStageRuntimeEvents.js`'s `onCommandStackChanged` was already guarded by `isDragInProgress`, the coordinator's `onRuntimeChange` path was NOT guarded, so autosave could still be scheduled continuously during drag.

**Fix**: 
1. In `emitDiagramMutation` (BpmnStage.jsx): added `isDragInProgress(contextMenuInteractionRef)` check. If drag is active, set `pendingDragMutationRef.current = true` and suppress the mutation.
2. In `bindContextMenuRuntimeEvents` (wireBpmnStageRuntimeEvents.js): on `drag.cleanup`, if `pendingDragMutationRef.current` is true, emit one post-drag `diagram.change` mutation and clear the flag.

**Status**: ✅ Fixed in this contour.

---

## Root Cause 3: bpmn-js SVG Engine Limits (Hypothesis)

**Location**: bpmn-js internal SVG rendering

**Hypothesis**: Even with all React-side guards suppressed, bpmn-js SVG coordinate updates during continuous drag on 7,700-node diagrams may still produce long tasks.

**Test**: Agent 3 must verify real drag performance. If material lag remains after all app-side guards, this hypothesis is confirmed.

**Status**: ⏳ Pending Agent 3 verification.

---

## Summary

| Root Cause | Fix Applied | Contour |
|-----------|-------------|---------|
| Decor fanout runs during drag | `dragInProgressRef` guard in `useBpmnSettledDecorFanout` | **This** |
| Autosave/mutation staging during drag | `pendingDragMutationRef` + post-drag flush in `emitDiagramMutation` / `bindContextMenuRuntimeEvents` | **This** |
| bpmn-js SVG engine limits | Hypothesis, needs Agent 3 verification | ⏳ |
