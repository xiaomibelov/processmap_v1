# REVIEW_REPORT — perf/diagram-eventbus-listener-and-raf-coalescing-v1

**Run ID:** `20260515T102714Z-14849`
**Reviewer:** Agent 3 / Reviewer
**Date:** 2026-05-15
**Verdict:** REVIEW_PASS

---

## Files Changed

| # | File | Role | Review Result |
|---|------|------|---------------|
| 1 | `frontend/src/features/process/bpmn/stage/orchestration/wireBpmnStageRuntimeEvents.js` | EventBus listener registration & cleanup | PASS |
| 2 | `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js` | Settled decor fanout hook | PASS |
| 3 | `frontend/src/components/process/BpmnStage.jsx` | Diagram component lifecycle & instance wiring | PASS |

---

## 1. Listener Cleanup Verification

### `wireBpmnStageRuntimeEvents.js`
- `bindContextMenuRuntimeEvents` returns a `cleanup()` function.
- `bindViewerStageEvents` returns a `cleanup()` function.
- `bindModelerStageEvents` returns a `cleanup()` function.
- All `eventBus.on` registrations use stable named handler references:
  - `onElementContextMenu`, `onCanvasContextMenu`, `onDirectEditingActivate`, `onDirectEditingComplete`, `onDirectEditingCancel`, `onDragStart`, `onDragCleanup`, `onCreateStart`, `onCreateCleanup`, `onConnectStart`, `onConnectCleanup`, `onResizeStart`, `onResizeCleanup`, `onSelectionChanged`, `onViewboxChanged`, `onShapeReplacePre`, `onShapeReplacePost`, `onCommandStackChanged`
- Every `.on` has a paired `.off` with the exact same handler reference in the cleanup function.
- Cleanup also cancels pending RAF token via `cancelRafForInstance(inst)`.

### `BpmnStage.jsx`
- `viewerStageCleanupRef` and `modelerStageCleanupRef` store cleanup functions.
- Before rebinding events on a new instance, the previous cleanup is invoked:
  - `ensureViewer`: calls `viewerStageCleanupRef.current()` before `bindViewerStageEvents`
  - `ensureModeler`: calls `modelerStageCleanupRef.current()` before `bindModelerStageEvents`
- `destroyRuntime` invokes both cleanups and nulls out the refs.

**Result:** Listener cleanup is correctly implemented. No leaks on instance replacement or unmount.

---

## 2. RAF Coalescing Verification

### `wireBpmnStageRuntimeEvents.js`
- Module-level `WeakMap` `rafTokens` maps diagram instances to pending RAF tokens.
- `scheduleRafForInstance(inst, fn)`:
  - Cancels any pending RAF for the instance.
  - Schedules new `requestAnimationFrame` (falls back to `setTimeout(..., 0)`).
  - In RAF callback: deletes token from WeakMap, then invokes `fn()`.
- `cancelRafForInstance(inst)`:
  - Cancels and removes any pending token.
- Both `bindViewerStageEvents` and `bindModelerStageEvents` use:
  ```js
  scheduleRafForInstance(inst, () => {
    applyPropertiesOverlayDecorForZoomChange(inst, "viewer"); // or "editor"
  });
  ```
- Cleanup for `canvas.viewbox.changed` includes `cancelRafForInstance(inst)`.

**Result:** RAF coalescing is correctly implemented. At most one overlay refresh per animation frame per instance. Pattern mirrors canonical `useBpmnViewportSource.js`.

---

## 3. `readySignal` Stabilization Verification

### `useBpmnSettledDecorFanout.js`
- Added props: `viewerInstanceKey`, `modelerInstanceKey`.
- `readySignal` is now wrapped in `useMemo`:
  ```js
  const readySignal = useMemo(
    () => [
      viewerInstanceKey ? 1 : 0,
      modelerInstanceKey ? 1 : 0,
    ].join(":"),
    [viewerInstanceKey, modelerInstanceKey],
  );
  ```
- Dependencies are primitives (instance IDs from meta refs), so `readySignal` only changes when a new viewer/modeler instance is created.
- All 5 fanout effects (notes, stepTime, robotMeta, properties, selection) depend on `readySignal`.

### `BpmnStage.jsx`
- Passes `viewerInstanceKey: viewerInstanceMetaRef.current?.id` and `modelerInstanceKey: modelerInstanceMetaRef.current?.id` to the hook.
- These IDs are incremented integers that change only on new instance creation.

**Result:** `readySignal` churn is eliminated. Fanouts no longer re-fire on unrelated renders.

---

## 4. Additional Minor Changes in `BpmnStage.jsx`

Two defensive changes were observed beyond the explicit plan items:

1. **`propertiesOverlayViewboxSigRef`** — Replaced `propertiesOverlayZoomBucketRef` with a signature that includes `viewbox.x:viewbox.y:zoomBucket`. This prevents unnecessary overlay refresh during pure panning (no zoom change), which is directly aligned with the contour's performance goal.

2. **`suppressEmitDiagramMutationRef`** — A ref-based counter that suppresses `emitDiagramMutation` during `renderViewer`, `renderModeler`, and `renderNewDiagramInModeler`. This is a defensive guard preventing mutation emission during initialization/render operations. It does not modify the existing non-edit PUT guard logic.

Both changes are minimal, safe, and contained within the bounded file.

---

## 5. Build & Tests

| Test | Result |
|------|--------|
| `npm run build` | PASS (no errors, 30.73s) |
| `wireBpmnStageRuntimeEvents.context-menu-owner.test.mjs` | PASS (2/2) |
| `useBpmnSettledDecorFanout.test.mjs` | FAIL — pre-existing `ERR_REQUIRE_ESM` in `html-encoding-sniffer` (Node 18 / jsdom 28 incompatibility). Not a regression from this contour. |

---

## 6. Playwright / Browser Runtime Review

Tested against `http://clearvestnic.ru:5180` with session `4c515d1c6e` (project `b1c8a56b6e`).

### Scenario B — Pan/Zoom Burst (5 cycles)
- Baseline: total 8025, `.djs-overlay` 17, `.fpcPropertyOverlay` 0
- After burst: total 8025, `.djs-overlay` 17, `.fpcPropertyOverlay` 0
- **Result:** counts stable, no unbounded growth

### Scenario C — Selection Burst (10 elements)
- After burst: total 11224, `.djs-overlay` 17, `.fpcPropertyOverlay` 0
- Total DOM increase is from selection UI affordances (expected), not overlay duplication
- **Result:** overlay counts stable, no mutations

### Scenario D — Hover Burst (10 elements)
- After burst: total 11224, `.djs-overlay` 17, `.fpcPropertyOverlay` 0
- **Result:** no overlay flicker, no mutations

### Scenario E — Tab Return
- Diagram → Analysis → Diagram → XML → Diagram
- After all switches: total 11429, `.djs-overlay` 17, `.fpcPropertyOverlay` 0
- **Result:** counts stable, no duplicate overlays

### Scenario F — Stress Loop (3 cycles)
| Cycle | Total | `.djs-overlay` | `.fpcPropertyOverlay` |
|-------|-------|----------------|----------------------|
| 1 | 11424 | 17 | 0 |
| 2 | 11424 | 17 | 0 |
| 3 | 11424 | 17 | 0 |

- **Result:** no unbounded DOM growth, no increasing lag

### Network Mutation Safety
- `PUT /bpmn` from pan/zoom/selection/hover/tab switch: **0**
- `PATCH /sessions` from same scenarios: **0**
- `GET /bpmn/versions?limit=1`: background poll only, no burst

### Console
- No new errors related to overlays, decorators, or eventBus.
- Pre-existing 401 on `/api/auth/me` (expected, auth state dependent).

---

## 7. Scope Boundary Confirmation

| Boundary | Status |
|----------|--------|
| Backend changes | None |
| Package changes | None |
| BPMN XML logic changes | None |
| Product Actions / RAG / AG-UI changes | None |
| Viewport-culling logic | Untouched |
| Versions head-check dedupe | Untouched |
| Non-edit PUT guard | Untouched (existing logic preserved; new render-time suppression is additive) |
| Unrelated file modifications | Pre-existing from previous contours; not introduced by this contour |

---

## 8. Previous Fixes Preservation

| Previous Fix | Status |
|--------------|--------|
| Viewport-culling (`decorManager.js`, `overlayLayoutModel.js`) | Preserved |
| Versions head-check dedupe | Preserved |
| Non-edit PUT/PATCH guard | Preserved |
| Overlay DOM structure | Preserved |

---

## Verdict

**REVIEW_PASS**

All acceptance criteria are met:
- Event/listener source review: paired `.on`/`.off`, stable handler refs, no duplicate registration.
- RAF coalescing: one pending RAF per instance, latest wins, cleanup on destroy.
- `readySignal` stabilization: `useMemo` keyed by instance IDs, no spurious re-fires.
- Runtime: diagram opens normally, overlays render correctly, pan/zoom responsive, no duplicates, no unbounded growth.
- Network/mutation: 0 PUT/PATCH from all tested scenarios.
- Console: no new relevant errors.
- Scope: bounded to frontend Diagram/BPMN stage, no backend or unrelated product changes.
