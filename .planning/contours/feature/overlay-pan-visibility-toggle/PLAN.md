# PLAN: Overlay Pan Visibility Toggle

## Goal

Add a user-facing toggle that controls whether BPMN overlays (ingredient, equipment, doc, container, drilldown, etc.) remain visible while panning/zooming the canvas.

## Default behavior

- Toggle is **off** by default.
- When off: overlays are hidden during pan/zoom; expensive `_updateOverlaysVisibility` is throttled.
- When on: overlays stay visible and update on every pan/zoom frame.

## State & persistence

- State lives in `ProcessStage` as `showOverlaysDuringPan` (`useState`).
- Initial value is read from `localStorage.getItem("processmap_overlay_pan_visible")`.
- Changes are persisted back to `localStorage` via `useEffect`.
- The value is passed to `BpmnStage` as a prop and synced into the overlay patch module via `setShowOverlaysDuringPan`.

## Files changed

1. `frontend/src/features/process/bpmn/stage/patches/patchOverlayPanPerf.js`
   - Add module-level `showOverlaysDuringPan` flag + `setShowOverlaysDuringPan`/`getShowOverlaysDuringPan`.
   - `createPatchedUpdate`: skip `_updateOverlaysVisibility` while paused only when flag is `false`.
   - `createPatchedToggle`: suppress `show`/`hide` while paused only when flag is `true`.
   - Stop patching `_updateRoot` (cheap O(1) transform, must run every frame).

2. `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js`
   - `restoreUpdates` calls `overlays._updateRoot()` as a safety net after unpausing.

3. `frontend/src/components/process/BpmnStage.jsx`
   - Accept `showOverlaysDuringPan` prop.
   - Sync prop value into the patch module on mount and on change.

4. `frontend/src/components/ProcessStage.jsx`
   - Add `showOverlaysDuringPan` state + localStorage read/write.
   - Pass value to `useStableProcessDiagramOverlayLayersProps` and `buildDiagramControlsView`.

5. `frontend/src/features/process/stage/orchestration/useStableProcessDiagramOverlayLayersProps.js`
   - Include `showOverlaysDuringPan` in `BPMN_INPUT_KEYS`.

6. `frontend/src/features/process/stage/orchestration/buildProcessDiagramOverlayLayersProps.js`
   - Accept `showOverlaysDuringPan` and forward it in `bpmnStageProps`.

7. `frontend/src/features/process/stage/orchestration/buildDiagramControlsSections.js`
   - Add `showOverlaysDuringPan` and `setShowOverlaysDuringPan` to `TOPBAR_KEYS`.

8. `frontend/src/features/process/stage/ui/ProcessStageDiagramControls.jsx`
   - Destructure new values from `topbarSection`.
   - Render eye-icon toggle button next to "Слои".

## No deploy/merge without explicit approve

Build will be verified locally; deployment to `http://clearvestnic.ru:5177` requires separate approval.
