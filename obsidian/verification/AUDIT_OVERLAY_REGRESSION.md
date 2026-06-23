# AUDIT: Overlay Regression & Monolith Decomposition

**Branch:** `fix/canvas-navigation-stability` (PR #399)  
**Stand:** `http://clearvestnic.ru:5177`  
**Audit mode:** read-only, no code changes, no commits, no deploy  
**Date:** 2026-06-22  

---

## 1. Overlay regression — root cause

### 1.1 Symptom

Overlays (`ingredient`, `equipment`, `doc`, `container` and other BPMN decors) appear **detached from their elements**, scattered across the canvas, and pan/zoom feels laggy.

### 1.2 Primary regression source

| Commit (hypothesis) | File | What changed |
|---|---|---|
| `465afedd` perf(bpmn): Option C jitter mitigation — resize guard, throttle viewport emit, overlay batching | `frontend/src/features/process/bpmn/stage/patches/patchOverlayPanPerf.js` | Patches `Overlays._updateRoot`, `_updateOverlaysVisibilty`, `show`, `hide` with a pause toggle |
| same | `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` | Sets `__fpcOverlayUpdatesPaused = true` on `canvas.viewbox.changing` and debounces `restoreUpdates` |

### 1.3 Why overlays drift

`diagram-js` normally keeps overlays in sync with the canvas via two update paths:

1. `_updateRoot(viewbox)` — cheap O(1) transform of the **single overlay root container** (`matrix(...)`). Runs on every `canvas.viewbox.changing` frame.
2. `_updateOverlaysVisibilty(viewbox)` — expensive O(n) pass over every overlay node to recompute visibility/scale. Runs on `canvas.viewbox.changed`.

The Option C patch pauses **both** paths while the user is panning/zooming:

```js
// patchOverlayPanPerf.js ~L54-68
_updateRoot: createPatchedToggle("_updateRoot"),
show:       createPatchedToggle("show"),
hide:       createPatchedToggle("hide"),
```

`wireBpmnStageRuntimeEvents.js` sets `paused = true` at priority **900** (before diagram-js’s default handler at priority **1000**), so `_updateRoot` is skipped **during the whole gesture**.

The debounced `restoreUpdates` (150 ms after motion stops) only does:

```js
setOverlaysUpdatePaused(overlays, false);
overlays.show();
overlays._updateOverlaysVisibilty(overlays._canvas.viewbox());
```

It **never calls `_updateRoot(viewbox)`**. Therefore the overlay root transform remains at the value from **before** the pan/zoom, and every overlay appears offset by exactly that delta.

### 1.4 Why soft return / viewport restore is affected

`BpmnStage.jsx` soft-return path (`L5953-5972`) re-imports cached XML into the existing runtime and then restores the viewport:

```js
// BpmnStage.jsx ~L6185-6186
canvas.viewbox(preRenderSnapshot.viewbox);
canvas.zoom(preRenderSnapshot.zoom);
```

Both calls fire `canvas.viewbox.changing` synchronously. Because the pause flag is already set before diagram-js’s handler, `_updateRoot` is skipped. The 150 ms restore then also omits `_updateRoot`, so overlays are mounted against a stale root matrix immediately after returning from a subprocess.

### 1.5 Why it lags

The overlay layer is frozen for the entire gesture. Even though the expensive O(n) pass is deferred (which was the goal), the cheap O(1) root transform is also frozen, so overlays stop moving with the canvas until the missing update is added.

### 1.6 Files / lines responsible

| File | Lines | Role |
|---|---|---|
| `frontend/src/features/process/bpmn/stage/patches/patchOverlayPanPerf.js` | 37–68 | Wraps `_updateRoot` with pause toggle |
| `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` | 42–77, restoreUpdates 48–63 | Sets pause flag and debounces restore without `_updateRoot` |
| `frontend/src/components/process/BpmnStage.jsx` | 5953–5972, 6173–6195 | Soft return + viewport restore triggers the stale-matrix path |

### 1.7 Recommended fix direction (informational only)

1. **Do NOT pause `_updateRoot`**. Keep the pause toggle only for `_updateOverlaysVisibilty`, `show`, `hide` — these are the actual expensive/flickering paths.
2. Add `overlays._updateRoot(overlays._canvas.viewbox())` inside `restoreUpdates` as a safety net.
3. For viewport restore, ensure the overlay root is refreshed immediately after `canvas.viewbox()` / `canvas.zoom()` (e.g. by calling `_updateRoot` directly or by emitting a synthetic `viewbox.changed`).

---

## 2. Overlay lifecycle — who creates / clears what

### 2.1 Overlay creators

| Overlay family | File | Function | Positioning |
|---|---|---|---|
| Lightweight V2 (`ingredient`, `equipment`, `doc`, `container`, generic props) | `BpmnStage.jsx` | `mountLightweightOverlays` (L4646, add at L4729) | `position: { top: -20, left: 0 }` for shapes; sequence-flow midpoint math |
| Properties card/table (`fpc-properties`) | `decorManager.js` | `applyPropertiesOverlayDecor` (L1719, add at L1920) | `buildOverlayGeometry` + `scale: false` |
| Interview / AI / DoD / Notes badge stacks | `decorManager.js` | `applyInterviewDecor` (L584, add at L785/L792/L858) | `{ top: -18, left/right: ... }` |
| User notes / documentation badge | `decorManager.js` | `applyUserNotesDecor` (L920, add at L1143) | `{ top: -18, left/right: 2 }` |
| Subprocess discussion badge | `decorManager.js` | `applySubprocessDiscussionDecor` (L1188, add at L1264) | `{ top: -8, right: -8 }` |
| Step-time badge | `decorManager.js` | `applyStepTimeDecor` (L1292, add at L1359) | bottom-right |
| Robot-meta badge | `decorManager.js` | `applyRobotMetaDecor` (L1403, add at L1467) | top-left |
| Bottleneck tag | `BpmnStage.jsx` | `applyBottleneckDecor` (L4767, add at L4802) | `{ top: -14, right: -14 }` |
| Subprocess focus highlight | `bpmnRenderRuntimeLifecycle.js` | `renderViewerDiagram` (add at L121) | full-bleed halo |
| AI question panel | `aiQuestionPanelAdapter.js` | `openAiQuestionPanel` (add at L237) | right of element |
| Playback flash pills / ghosts | `playbackAdapter.js` | `flashBadgeOnInstance` etc. (L475/L721/L827) | top/right offsets |

All positioning is **element-relative through `overlays.add(elementId, { position: {...}, html })`.** bpmn-js places the overlay container at the element bounding box and applies the pixel offset. Several overlays use additional CSS transforms (e.g. `translate(-50%, ...)` or `translateX(-100%)`) for center/right-edge alignment.

### 2.2 Clearing lifecycle

| Event | What happens |
|---|---|
| `importXML` / `runtime.load` | bpmn-js **does not** auto-clear overlays. Each render path re-applies decors; every `apply*Decor` clears its previous state first; `mountLightweightOverlays` clears V2 overlays before re-mounting. |
| Normal session switch | `destroyRuntime()` clears all decor families, destroys instances, empties DOM containers. |
| Soft return (cached XML) | `destroyRuntime()` is **skipped**; cached XML is re-imported into the existing instance and decor is re-applied on top. |
| Component unmount | `destroyRuntime()` runs. |
| Viewbox/zoom change | Debounced `applyPropertiesOverlayDecorForZoomChange` rebuilds property-card geometry. |

No duplicate overlay accumulation was found in the audit paths, but the stale root transform makes existing overlays look duplicated/offset.

---

## 3. Overlay performance

### 3.1 Counts in `frontend/src/features/process/bpmn/`

| Method | Production occurrences |
|---|---|
| `overlays.add` | **14** (8 in `decorManager.js`, 3 in `playbackAdapter.js`, 1 in `bpmnRenderRuntimeLifecycle.js`, 1 in `aiQuestionPanelAdapter.js`) |
| `overlays.show` | **1** (`wireBpmnStageRuntimeEvents.js:54`) |
| `overlays.hide` | **0** (diagram-js internal) |
| `overlays._updateRoot` | **1** (patched in `patchOverlayPanPerf.js`; no direct production call) |

### 3.2 Typical diagram load

For a ~200-element diagram with property overlays always enabled, `applyPropertiesOverlayDecor` can create **~197 extension overlays**. With interview, notes, step-time, robot-meta and playback layers active, total overlays can reach **250–400**.

### 3.3 Why pan/zoom was slow before Option C

`_updateRoot` + `_updateOverlaysVisibilty` together touched hundreds of overlay DOM nodes every frame, causing forced reflows and FPS drops to ~5. Option C correctly identified `_updateOverlaysVisibilty` as the expensive path, but incorrectly also froze `_updateRoot`.

---

## 4. Monolith decomposition audit

### 4.1 File scale

| File | Lines | Exported roles |
|---|---|---|
| `frontend/src/components/process/BpmnStage.jsx` | **6,569** | `BpmnStage` forwardRef component + ~75 module-level helpers |
| `frontend/src/features/process/bpmn/stage/orchestration/bpmnRenderRuntimeLifecycle.js` | **490** | `renderViewerDiagram`, `renderModelerDiagram`, `renderNewDiagramInModelerRuntime` |

### 4.2 Responsibility groups inside `BpmnStage.jsx`

| Group | Approx. lines | Examples |
|---|---|---|
| A. Overlay DOM & lightweight overlays | ~500 | `createPropertyCard`, `createV2Overlay`, `mountLightweightOverlays` |
| B. Viewport / zoom / canvas metrics | ~700 | `getCanvasSnapshot`, `probeCanvas`, `safeFit`, `ensureCanvasVisibleAndFit` |
| C. Normalization / data parsing | ~400 | `normalizeStepTimeUnit`, `validateBpmnXmlText` |
| D. Logging / tracing | ~200 | `logBpmnTrace`, `publishE2ESaveProbe` |
| E. BPMN XML / identity / seeding | ~400 | `safeBpmnId`, `seedFromActors` |
| F. Component state & wiring | ~1,200 | `createBpmnWiring`, `ensureBpmnCoordinator`, `useDiagramLoadStateMachine` |
| G. Save / persist lifecycle | ~1,200 | `persistXmlSnapshot`, `saveLocalFromModeler` |
| H. Selection & focus decoration | ~400 | `applySelectionFocusDecor`, `selectedMarkerStateRef` |
| I. Search helpers | ~250 | `setSearchHighlightsOnInstance` |
| J. Meta sync (robot / camunda / notes / AI) | ~800 | `syncRobotMetaToModeler`, `hydrateCamundaExtensionsFromImportedBpmn` |
| K. Decor application | ~600 | `applyTaskTypeDecor`, `applyInterviewDecor`, etc. |
| L. Playback / flash / focus overlays | ~300 | `applyPlaybackFrameOnInstance`, `flashNode` |
| M. Context menu / adapters | ~500 | `executeDiagramContextAction`, `aiQuestionPanelAdapter` |
| N. Instance lifecycle & events | ~900 | `ensureViewer`, `destroyRuntime`, `loadFromBackend`, `renderViewer` |
| O. Viewport recovery | ~150 | `recoverByReimport`, `recoverByHardReset` |
| P. Imperative API | ~150 | `createImperativeApiCtx`, `useImperativeHandle` |
| Q. JSX / render | ~150 | `XmlView`, diagram layer markup |

### 4.3 `bpmnRenderRuntimeLifecycle.js` responsibilities

- `renderViewerDiagram` — import XML, fit viewport, probe canvas, focus element, emit snapshot, apply decors.
- `renderModelerDiagram` — import deduplication, runtime init, `runtime.load()`, hydration, canvas resize, fit/probe, snapshot, decors.
- `renderNewDiagramInModelerRuntime` — blank diagram creation, fit/probe, decors.

The file already acts as a thin orchestrator but still mixes import, viewport, and decor concerns.

---

## 5. Decomposition options

| Variant | What is extracted | Target directory | Risk | Win |
|---|---|---|---|---|
| **A. Conservative** | V2 / lightweight overlay DOM + mount/clear logic from `BpmnStage.jsx` | `features/process/bpmn/stage/overlays/` | Low | Isolates overlay bugs; ~500 lines removed from BpmnStage |
| **B. Moderate** | Conservative + viewport/zoom/snapshot/recovery logic from `BpmnStage.jsx` | `features/process/bpmn/stage/overlays/` + `features/process/bpmn/stage/viewport/` | Medium | BpmnStage shrinks by ~1,200 lines; viewport logic becomes reusable and testable |
| **C. Aggressive** | Split `BpmnStage.jsx` into focused hooks and small JSX components (`BpmnStageLoader`, `BpmnStageOverlays`, `BpmnStageViewport`, etc.) | `components/process/bpmn/` + `features/process/bpmn/stage/hooks/` | High | Full monolith break, but massive refactor risk and hook-order sensitivity |

### 5.1 Recommended starting point

For the current branch, **Variant B (Moderate)** is the safest high-value move:

1. Extract overlay DOM + manager (Conservative).
2. Extract viewport controller + layout metrics (Moderate).
3. Keep `BpmnStage.jsx` as the single component during this refactor so navigation-stability behavior can be verified without changing React hook ordering.

The aggressive hook split should be done in a separate dedicated refactor branch after this one stabilizes.

---

## 6. Concrete overlay manager extraction plan

Create directory `frontend/src/features/process/bpmn/stage/overlays/`:

```
features/process/bpmn/stage/overlays/
├── bpmnOverlayManager.js        // add/remove/clear lightweight overlays, coordination
├── bpmnOverlayDom.js            // createPropertyCard, createV2Overlay, computeSequenceFlowMidpoint
├── bpmnOverlayTooltip.js        // tooltip listeners, card hover expand/collapse
└── bpmnOverlayConstants.js      // CARD_IDLE_MAX_PROPS, V2_OVERLAY_IDLE_MAX_PROPS, etc.
```

### 6.1 Required interface

```js
// bpmnOverlayManager.js
export function createBpmnOverlayManager({
  getV2Enabled,
  getV2Expanded,
  installTooltip,
  getMeasurementContainer,
}) {
  return {
    mount(inst, kind, overlayList),   // replaces mountLightweightOverlays
    clear(inst, kind),                // replaces clearLightweightOverlays
    dispose(),                        // removes global listeners
    getOverlayCount(inst),            // for debugging / profiler
  };
}
```

### 6.2 Positioning contract

- All lightweight overlays continue to use `overlays.add(elementId, { position: {...}, html })`.
- Sequence-flow badges continue to compute midpoint relative to the element origin and place the host via inline `top/left` styles.
- CSS transforms that center/right-align overlays remain in existing stylesheets; do not duplicate them inside the manager.

### 6.3 Lifecycle contract

- `clear(inst, kind)` must run before `mount(inst, kind, ...)`.
- `dispose()` must remove any document-level tooltip/card listeners.
- The manager must not depend on React state; it operates on refs and bpmn-js instances.

---

## 7. Open questions for product / tech lead

1. **Fix scope:** Should the overlay regression fix be done inside `fix/canvas-navigation-stability` (single commit) or in a new contour/branch `fix/bpmn-overlay-regression`?
2. **Decomposition starting point:** Begin with Conservative (overlay manager only) or Moderate (overlay manager + viewport controller)?
3. **Lag mitigation:** If root cause is Option C throttling, do we roll back the `_updateRoot` pause entirely, or switch to selective throttling (pause only `_updateOverlaysVisibilty`, keep `_updateRoot` per-frame)?

**No code changes, commits, or deploys were performed during this audit.**
