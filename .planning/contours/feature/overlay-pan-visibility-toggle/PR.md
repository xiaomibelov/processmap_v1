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

- [ ] `npm run build` passes.
- [ ] Toggle visible and clickable.
- [ ] On: overlays visible during pan.
- [ ] Off: overlays hidden during pan.
- [ ] State persists after reload.

## Screenshots / video

Pending deployment to `http://clearvestnic.ru:5177`.

## No merge without explicit approve
