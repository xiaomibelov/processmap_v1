# IMPLEMENTATION_NOTES.md

## Contour
- **ID**: `fix/diagram-canvas-reload-loop-and-lag-regression-v1`
- **Run ID**: `20260515T184558Z-42906`

## Files Changed

### Modified

1. **`frontend/src/components/process/BpmnStage.jsx`**
   - **Lines changed**: ~40 lines (net reduction)
   - **What changed**:
     - Replaced import `useDeferredDecorFanout` with `useBpmnSettledDecorFanout`
     - Removed import `useDiagramStagedHydration`
     - Kept import `DiagramSkeleton`
     - Removed `useDiagramStagedHydration()` call and destructuring of `deferredHydrationStage`, `markCanvasReady`, `markDecorLoading`, `markFullyReady`
     - Replaced `useDeferredDecorFanout({...})` call with direct `useBpmnSettledDecorFanout({...})` call
     - Added `syncAiQuestionPanelWithSelection` to fanout props (was missing in previous contour's deferred wrapper)
     - Removed `onCanvasReady`, `onDecorLoading`, `onFullyReady` callback props
     - Kept `DiagramSkeleton` rendering conditional on `!diagramReady`

### Not Changed (kept intact)

- `frontend/src/features/process/bpmn/stage/load/DiagramSkeleton.jsx` — kept, still rendered when `!diagramReady`
- `frontend/src/features/process/bpmn/stage/load/useDiagramStagedHydration.js` — file exists but no longer used in BpmnStage
- `frontend/src/features/process/bpmn/stage/load/useDeferredDecorFanout.js` — file exists but no longer used in BpmnStage
- `frontend/src/styles/legacy/legacy_bpmn.css` — skeleton CSS kept
- `frontend/src/components/ProcessStage.jsx` — no changes
- `frontend/src/features/process/hooks/useProcessTabs.js` — no changes

## Rationale

The previous contour (`perf/diagram-initial-load-skeleton-and-lazy-hydration-v1`) introduced staged hydration and deferred decor fanout to reduce perceived load time and main-thread blocking. However:

1. `useDiagramStagedHydration` caused 3+ wasteful re-renders of `BpmnStage` because its state was set but never consumed.
2. `useDeferredDecorFanout` added idle-callback scheduling complexity that created a "pop-in" perception and potentially cancelled pending work when instance keys changed.
3. The deferred wrapper accidentally dropped `syncAiQuestionPanelWithSelection` from the fanout props.

The fix reverts to the direct `useBpmnSettledDecorFanout` call (which already had stable primitive-key dependencies and memoization from earlier contours) while keeping the skeleton UI for genuine `!diagramReady` states.

This is the minimal bounded change: one file, two import swaps, one hook replacement, one prop restored.

## Verification

- `npm run build`: ✅ passes (27.67s)
- `useBpmnSettledDecorFanout.test.mjs`: ✅ 2/2 pass
- Full test suite: 1929 pass, 24 fail (pre-existing failures unrelated to this change)
- Runtime Playwright: ✅ cold open, tab switch, XML↔Diagram, pan/zoom, selection all functional
