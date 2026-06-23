# PR: Overlay Pan Visibility Toggle

**Branch:** `feature/overlay-pan-visibility-toggle`  
**Base:** `new-origin/main`  
**Deploy:** pending explicit approve  

## Summary

Adds a toolbar toggle that lets users keep BPMN overlays visible while panning/zooming. Default behavior remains performance-oriented (overlays hidden during pan). State persists in `localStorage`.

## Changes

- `patchOverlayPanPerf.js`: pan-visibility-aware patching of `_updateOverlaysVisibility` / `show` / `hide`; `_updateRoot` no longer paused.
- `wireBpmnStageRuntimeEvents.js`: safety-net `_updateRoot` in `restoreUpdates`.
- `BpmnStage.jsx`: sync prop into patch module.
- `ProcessStage.jsx`: state + localStorage wiring.
- `useStableProcessDiagramOverlayLayersProps.js`, `buildProcessDiagramOverlayLayersProps.js`: pass prop through to `BpmnStage`.
- `buildDiagramControlsSections.js`, `ProcessStageDiagramControls.jsx`: toolbar UI.

## Verification

- [x] `npm run build` passes (local + deploy container).
- [x] Deployed to `http://clearvestnic.ru:5177` (`a808e48a`).
- [x] Toggle visible and clickable.
- [x] On: overlays visible during pan.
- [x] Off: overlays hidden during pan.
- [x] State persists after reload.

## Screenshots / video

See `VERIFICATION_OVERLAY_PAN_TOGGLE.md` and artifacts:
- `overlay_pan_initial.png`
- `overlay_pan_on.png`
- `overlay_pan_on_during_pan.png`
- `overlay_pan_off_during_pan.png`
- `overlay_pan_persist_on.png`
- `overlay_pan_toggle_demo.webm`

## No merge without explicit approve
