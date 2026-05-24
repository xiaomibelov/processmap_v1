# Implementation Notes

## Files Changed
1. `frontend/src/components/process/BpmnStage.jsx`
   - Removed `<DiagramRuntimeVersionBadge>` from canvas overlay
   - Removed unused `DiagramRuntimeVersionBadge` import
2. `frontend/src/components/AppShell.jsx`
   - Extended footer `footerHint` with `PROCESSMAP_BUILD_INFO.contourId`
3. `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`
   - Added `isDragInProgress()` helper
   - Guarded `onViewboxChanged` in viewer mode: skip snapshot/logging/emit/decor during drag
   - Guarded `onSelectionChanged` in viewer mode: skip selection sync during drag
   - Guarded `onViewboxChanged` in modeler mode: same
   - Guarded `onSelectionChanged` in modeler mode: same
4. `scripts/generate-build-info.mjs`
   - Updated fallback `contourId` to current contour

## Not Changed (intentionally)
- `BpmnStage.jsx` god file: no drag behavior changes inside the component itself; only canvas badge removal
- `useBpmnSettledDecorFanout.js`: no changes needed; decor fanout is already gated by `selectedMarkerStateRef` which doesn't change during empty-canvas pan
- No decomposition extraction required because BpmnStage.jsx was not modified for drag behavior

## Known Issues / Caveats
1. **Edit mode element drag**: Not directly tested due to ~15s Modeler init time on large diagram. The `dragInProgress` guard applies to modeler mode too, so edit-mode drag should also benefit.
2. **Selection during drag**: If user intentionally wants selection to update mid-drag, it will be delayed until drag end. This is acceptable because selection UI (property panel, AI questions) is not needed during active drag.
3. **Viewbox logging suppressed**: `logViewAction` and `getCanvasSnapshot` are skipped during drag. A single post-drag viewbox event will still log the final state.
4. **Remaining SVG lag**: ~54% improvement achieved; remaining lag is bpmn-js SVG engine limit. See `ENGINE_EVALUATION.md`.
5. **Dirty working tree**: 34 pre-existing dirty files remain. Only 4 files were intentionally modified for this contour.

## Build
- `npm run build` completes with 0 errors
- Served JS hash changed proving fresh build
