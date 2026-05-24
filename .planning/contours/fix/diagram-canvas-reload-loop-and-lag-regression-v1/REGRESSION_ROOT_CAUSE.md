# REGRESSION_ROOT_CAUSE.md

## Contour
- **ID**: `fix/diagram-canvas-reload-loop-and-lag-regression-v1`
- **Run ID**: `20260515T184558Z-42906`

## Confirmed Hypothesis

**H1. Skeleton/staged hydration introduced repeated ready-state resets and wasteful re-renders — CONFIRMED**

### Evidence

1. **`useDiagramStagedHydration` causes 3+ wasteful BpmnStage re-renders**
   - Hook state transitions: `loading` → `canvas_ready` → `decor_loading` → `fully_ready`
   - Each transition calls `setHydrationStage(...)`, which triggers a BpmnStage re-render
   - BUT `deferredHydrationStage` (the returned state) is **never consumed** in `BpmnStage.jsx`
   - These 3+ re-renders happen during initial load for zero visual benefit

2. **`useDeferredDecorFanout` adds scheduling overhead and callback complexity**
   - Replaced direct `useBpmnSettledDecorFanout` call with a wrapper that:
     - Creates new wrapper functions on every render (14 deferred callbacks)
     - Uses `useEffect` with `[viewerInstanceKey, modelerInstanceKey]` deps
     - Schedules `onFullyReady` via `scheduleIdle(..., 500)` heuristic
     - Cleans up and re-schedules idle callbacks when instance keys change
   - The `stageRef.current` logic prevents re-fire for truthy→truthy key changes, but the cleanup still cancels pending deferred work
   - Most importantly: the deferred wrapper **omitted `syncAiQuestionPanelWithSelection`** prop that the original direct call included

3. **Perceived "reload loop" feeling**
   - The skeleton appears when `!diagramReady` (pre-existing behavior)
   - `useDiagramStagedHydration` state changes cause extra re-renders that may coincide with `diagramReady` transitions
   - Deferred fanout causes decorations to "pop in" after canvas is visible, creating a staged-load perception
   - Extra renders + deferred scheduling = janky main thread = worse pan/zoom/interaction

### Why this is the culprit (not other hypotheses)

- **H2 (useProcessTabs)**: Tab switch latency is pre-existing on the branch. The `useProcessTabs.js` flush logic was already slow (~2.2–3.5s) before this contour. Not caused by the skeleton/hydration contour.
- **H3 (BpmnStage key/props)**: `ProcessDiagramOverlayLayers` is `memo()`'d and `reloadKey` changes are rare (only on `generateProcess`). No evidence of remount loops.
- **H4 (repeated importXML)**: `ensureViewer`/`ensureModeler` guard against duplicate creation. No evidence of multiple inits for same session.
- **H5 (deferred fanout delays)**: Confirmed as a contributing factor to perceived lag, but secondary to the wasteful re-renders.
- **H6 (ProcessStage parent re-renders)**: No specific prop churn identified beyond the known `reloadKey` issue.
- **H7 (auth/presence polling)**: No correlation found between `/presence` and re-render times.
- **H8 (dirty working tree)**: The skeleton contour's changes are clearly bounded and identifiable. The dirty tree contains other changes, but they don't explain the new reload-loop symptom.

## Root Cause Summary

The `perf/diagram-initial-load-skeleton-and-lazy-hydration-v1` contour introduced two hooks (`useDiagramStagedHydration` and `useDeferredDecorFanout`) into `BpmnStage.jsx` that:
1. Added 3+ unnecessary full-component re-renders during initial load
2. Added idle-callback scheduling overhead for non-critical fanouts
3. Created a "staged reload" perception where decorations pop in after canvas visibility
4. Omitted a required prop (`syncAiQuestionPanelWithSelection`) from the fanout call

The skeleton UI itself (`DiagramSkeleton`) is not the problem — it provides useful visual feedback. The problem is the state-machine and deferred-scheduling machinery that was wrapped around it.
