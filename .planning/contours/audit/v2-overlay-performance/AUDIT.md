# V2 Overlay Performance Audit — `audit/v2-overlay-performance`

**Branch:** `main`  
**Base:** `origin/main @ 41abd4862ca667e900f4ee43547352a41b8ea7d0`  
**Stage URL:** `http://clearvestnic.ru:5177`  
**Audited at:** 2026-06-30T17:40Z  
**Run by:** Agent executor, ProcessMap discipline

## Source/runtime truth

```
pwd: /opt/processmap-test
HEAD: 41abd4862ca667e900f4ee43547352a41b8ea7d0
origin/main: 41abd4862ca667e900f4ee43547352a41b8ea7d0
branch: main
status: clean except untracked audit contour and temp files
```

Stage `/version` at audit start:

```json
{"commit":"41abd486","buildTime":"2026-06-30T11:50:23Z","containerId":"5c3082dda8e1","branch":"main","env":"stage"}
```

## Problem

**User observation:** When "Показывать все V2-оверлеи свойств" is enabled, dragging/scrolling/panning the canvas causes FPS to drop below 10.

**Code evidence:**

- V2 overlays are **imperative DOM** managed by `frontend/src/features/process/bpmn/stage/overlay/overlayLifecycleManager.js`, not React components. `React.memo` does not apply.
- `overlayLifecycleManager.mount()` iterates **every shape/flow element** from the bpmn-js `elementRegistry` and creates a `.fpc-overlay-v2-host` node for each matching element. There is **no viewport culling**.
- The global "show all V2 overlays" flag is consumed via a ref (`enabledRef`) inside the lifecycle manager, but the actual remount is gated by a signature comparison in `frontend/src/components/process/BpmnStage.jsx:4601-4617`. The signature is derived from `extractOverlaysFromBpmn(inst, v2OverlaysEnabled)`. If the extracted list happens to be identical between `v2OverlaysEnabled=false` and `true`, the effect short-circuits and the overlays are never mounted.
- A pan/zoom performance patch exists at `frontend/src/features/process/bpmn/stage/patches/patchOverlayPanPerf.js`. It skips the expensive O(n) `_updateOverlaysVisibilty()` pass while the viewbox is changing, **unless** the user has enabled "Оверлеи остаются видимыми при перемещении/зуме". In that mode the patch keeps the overlay root visible and the per-overlay visibility/scale pass runs on every frame.
- `frontend/src/components/ProcessStage.jsx:6810-6818` exposes the "show overlays during pan" toggle in the top toolbar. Its state is persisted per-browser via `readOverlayPanVisibility()` / `writeOverlayPanVisibility()`.

## Measurements

Automated benchmark: `scripts/e2e/audit_v2_overlay_performance.mjs`

- Generated a 200-element BPMN diagram (alternating tasks with/without Camunda properties so the V2 toggle reliably triggers a remount).
- Enabled V2 overlays and forced "show overlays during pan/zoom".
- Measured `requestAnimationFrame` deltas during continuous pan, task drag, and wheel zoom.

Results (`fps_measurements.json`):

| Scenario | Avg FPS | Min FPS | Max frame delta (ms) |
|----------|--------:|--------:|---------------------:|
| Pan — overlays OFF (baseline) | 58.0 | 20.0 | 50 |
| Pan — V2 ON | 55.6 | **8.6** | 117 |
| Drag task — V2 ON | 56.2 | **5.5** | 183 |
| Scroll zoom — V2 ON | 59.8 | 30.0 | 33 |
| Pan — V2 expanded | 53.4 | **12.0** | 83 |
| Drag task — V2 expanded | 58.6 | **8.6** | 117 |
| Scroll zoom — V2 expanded | 60.0 | 59.5 | 17 |

**Interpretation:**

- Pan and drag drop to **5–9 FPS** with 200 V2 property overlays visible.
- Scroll zoom is less affected because the wheel events in the test did not keep the viewbox continuously changing; in a real continuous zoom the same O(n) cost applies.
- The regression is caused by the number of overlay DOM nodes, not by React render cost.

## Root causes

1. **No viewport culling:** every matching element gets a permanent overlay node regardless of whether it is on screen.
2. **Expensive per-frame overlay pass:** when "show overlays during pan/zoom" is on, diagram-js updates visibility/position/scale for all 200+ overlay nodes each animation frame.
3. **No DOM reuse / diff:** `mount()` calls `clear()` then re-adds all overlays, even when only the global expanded flag changed.
4. **Signature-based remount misses toggle:** `BpmnStage.jsx:4606-4607` compares `JSON.stringify(extractOverlaysFromBpmn(inst, v2OverlaysEnabled))`. For diagrams where the extracted overlay list is the same in both states, enabling the toggle does not remount overlays (observed during script debugging with all tasks carrying properties). This is a secondary correctness issue that masks the primary performance issue.

## Evidence files

- `frontend/src/features/process/bpmn/stage/overlay/overlayLifecycleManager.js` — V2 overlay DOM creation and mount loop
- `frontend/src/components/process/BpmnStage.jsx:4601-4617` — signature-based remount effect
- `frontend/src/features/process/bpmn/stage/patches/patchOverlayPanPerf.js` — pan/zoom performance patch
- `frontend/src/components/ProcessStage.jsx:6810-6818` — "show overlays during pan/zoom" toolbar toggle
- `frontend/src/features/process/bpmn/stage/state/useV2OverlayState.js` — V2 overlay state refs
- `scripts/e2e/audit_v2_overlay_performance.mjs` — automated FPS benchmark
- `.planning/contours/audit/v2-overlay-performance/fps_measurements.json` — measurement data

## Fix direction (Phase 2 — awaiting approval)

1. Add **viewport culling** in `overlayLifecycleManager.mount()`: skip overlay creation for elements whose bounding box is outside the current canvas viewport.
2. **Diff** the overlay list instead of clear-all/re-add-all; only insert/remove hosts that actually changed.
3. When only `v2OverlaysExpanded` toggles, update CSS classes on existing hosts instead of rebuilding DOM.
4. Fix the signature comparison in `BpmnStage.jsx` so that `v2OverlaysEnabled` changes always trigger a remount (include the flag in the signature or call `mountFromBpmn` directly on toggle).
5. Consider throttling the overlay visibility update pass during pan/zoom even when "show overlays during pan" is enabled, or keep the root visible but batch per-overlay updates via `requestAnimationFrame`.
