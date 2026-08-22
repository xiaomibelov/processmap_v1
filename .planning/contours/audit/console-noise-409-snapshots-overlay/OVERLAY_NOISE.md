# Overlay V2 Noise Audit

**Scope:** `[FPC-OVERLAY-V2]` logs, `[OverlayPanPatch]` skipped-call log, `_updateOverlaysVisibilty` triggers, and overlay DOM node cost.

---

## Log Sources

### `[FPC-OVERLAY-V2] extension overlays found Object`

- **File:** `frontend/src/features/process/bpmn/stage/overlay/overlayLifecycleManager.js:365–367`
- **Code:**
  ```js
  // eslint-disable-next-line no-console
  console.log("[FPC-OVERLAY-V2] extension overlays found", {
    count: overlaysToRender.length,
  });
  ```
- **Guard:** none. Always logs when `useExtensionOverlays` is true.

### `[FPC-OVERLAY-V2] overlays mounted`

- **File:** `frontend/src/features/process/bpmn/stage/overlay/overlayLifecycleManager.js:438–441`
- **Code:**
  ```js
  // eslint-disable-next-line no-console
  console.log("[FPC-OVERLAY-V2] overlays mounted", {
    elements: elementOverlaysAdded,
    overlayNodes: overlayNodesAdded,
  });
  ```
- **Guard:** none.

### `[OverlayPanPatch] skipped X/Y _updateOverlaysVisibilty calls in last 5s`

- **File:** `frontend/src/features/process/bpmn/stage/patches/patchOverlayPanPerf.js:24–47`
- **Code:**
  ```js
  function createPatchedUpdate(original) {
    let skipped = 0;
    let total = 0;
    let lastLog = 0;
    return function (viewbox) {
      total += 1;
      if (this.__fpcOverlayUpdatesPaused && !showOverlaysDuringPan) {
        skipped += 1;
        const now = performance.now();
        if (now - lastLog > 5000) {
          // eslint-disable-next-line no-console
          console.debug(`[OverlayPanPatch] skipped ${skipped}/${total} _updateOverlaysVisibilty calls in last 5s`);
          skipped = 0;
          total = 0;
          lastLog = now;
        }
        return;
      }
      return original.call(this, viewbox);
    };
  }
  ```
- **Guard:** `console.debug` only; no feature/window flag.

---

## Trigger Events

| Log | Trigger | Frequency |
|-----|---------|-----------|
| `[FPC-OVERLAY-V2]` logs | `mountFromBpmn()` on initial render and when `draft?.bpmn_meta` or `v2OverlaysEnabled` changes (`BpmnStage.jsx:4567–4580`) | On load / meta change |
| `[OverlayPanPatch] skipped ...` | Pan/zoom while `__fpcOverlayUpdatesPaused` is true | At most every 5 s during continuous panning |

**Pan / zoom flow:**
1. `canvas.viewbox.changing` → `setOverlaysUpdatePaused(true)`.
2. `canvas.viewbox.changed` → schedule restore with a 150 ms trailing debounce.
3. While paused, calls to `_updateOverlaysVisibilty` are skipped and counted.
4. Every 5 s the skip count is logged.

**Selection change** does not trigger `mountFromBpmn`; it only updates selection handlers.  
**Resize** may indirectly emit viewbox events through the viewport resizer.

---

## `_updateOverlaysVisibilty` Call Graph

### Original implementation

`frontend/node_modules/diagram-js/lib/features/overlays/Overlays.js:602–609`:

```js
Overlays.prototype._updateOverlaysVisibilty = function(viewbox) {
  var self = this;
  forEach(this._overlays, function(overlay) {
    self._updateOverlayVisibilty(overlay, viewbox);
  });
};
```

### Internal callers

- `Overlays.js:623` inside `updateViewbox()` → on `canvas.viewbox.changed`.
- `Overlays.js:687` on `root.set`.
- `Overlays.js:537` inside `_addOverlay()` after each `overlays.add()`.

### Application callers

- `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js:65` — explicit call after pan settles.
- `frontend/src/features/process/bpmn/stage/profiling/panProfiler.js:326` — instrumentation wrapper.
- `frontend/src/features/process/bpmn/stage/patches/patchOverlayPanPerf.js:66,100` — prototype and instance patching.

---

## Throttle / Debounce Configuration

| Constant | Value | File |
|----------|-------|------|
| `OVERLAY_PAN_DEBOUNCE_MS` | `150` ms | `frontend/src/features/process/bpmn/stage/performance/stageRuntimePerformance.js:8` |
| `VIEWBOX_EMIT_THROTTLE_MS` | `250` ms | `frontend/src/features/process/bpmn/stage/performance/stageRuntimePerformance.js:9` |
| Patch log cadence | `5000` ms | hard-coded in `patchOverlayPanPerf.js:37` |
| diagram-js `deferUpdate` | `300` ms | `Canvas.js:269–271` (if enabled) |

`wireBpmnStageRuntimeEvents.js` installs the pan debouncer:

```js
eventBus.on("canvas.viewbox.changing", 900, () => {
  setOverlaysUpdatePaused(overlays, true);
  scheduleRestore();
});
eventBus.on("canvas.viewbox.changed", 1300, () => {
  scheduleRestore();
});
```

`scheduleRestore` is a 150 ms trailing debounce that unpauses and calls `_updateOverlaysVisibilty` once.

---

## Overlay DOM/SVG Node Count & Caching

### V2 extension overlay DOM cost

Created in `createV2Overlay()` (`overlayLifecycleManager.js:254–297`):

```js
const host = document.createElement("div");          // 1
const badge = document.createElement("div");         // +1
const footer = document.createElement("span");       // +1 (conditional)
const list = document.createElement("ul");           // +1
realProps.forEach((prop) => {
  const row = makeV2PropertyRow(prop);               // +1 li
  // each row: nameEl span + valueEl span           // +2 per property
});
```

**Per overlay host ≈ `4 + 3 × realProps.length` DOM nodes**, plus one diagram-js `.djs-overlay` wrapper and one per-element `.djs-overlays` container.

From the sidebar-overlay audit: **+656 nodes on 10 tasks** suggests ~65 DOM nodes per task/element when overlays are dense.

### Caching / recreation

- `mount()` always calls `clear(inst, kind)` first, which removes existing overlays.
- Then it re-creates each `v2Host` via `createV2Overlay()` and re-adds via `overlays.add()`.
- **This recreation happens only on mount / meta change**, not on every pan/zoom frame.
- During pan/zoom, `_updateOverlaysVisibilty` only toggles `visibility`/`transform`; nodes are reused.

---

## Feature Flag

Backend defaults (`backend/app/routers/feature_flags.py:12–17`):

```python
_DEFAULT_FLAGS = {
    "bpmn_fps_meter_enabled": "0",
    "canvas_profiler_enabled": "0",
    "lightweightOverlays": "0",
    "useBpmnExtensionOverlays": "0",
}
```

Frontend consumption (`frontend/src/components/process/BpmnStage.jsx:1241`):

```js
const useExtensionOverlays = useFeatureFlag("useBpmnExtensionOverlays");
```

Admin label: *"Hybrid Overlay V2 (white cards, anchor lines)"*.

---

## Hypotheses Status

| ID | Hypothesis | Status |
|----|------------|--------|
| H1 | Overlay logs enabled in production build | **Confirmed** for `[FPC-OVERLAY-V2]` — unconditional `console.log` |
| H2 | `_updateOverlaysVisibilty` called on every mousemove | **Refuted** — it runs on `viewbox.changed` and is skipped during pan |
| H3 | Overlay nodes recreated on every update | **Partially refuted** — recreated on mount/meta change, reused during pan/zoom |
| H4 | Throttle 5 s is too rare but log spam remains | **Refuted** — log fires at most every 5 s; the spam comes from unconditional mount logs |
