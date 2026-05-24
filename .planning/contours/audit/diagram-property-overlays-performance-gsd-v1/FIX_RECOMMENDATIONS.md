# Fix Recommendations

## P0 — Minimal Safe Fix (highest impact, zero architecture change)

### P0.1 — Debounce or throttle the BPMN versions head-check

| | |
|---|---|
| **File** | `frontend/src/components/ProcessStage.jsx` |
| **Function** | `refreshSnapshotVersions()` around line 4320 |
| **Problem** | `apiGetBpmnVersions(sid, { limit: 1 })` is called 20+ times in minutes from multiple effect triggers. |
| **Fix** | Add a 2–5 second debounce/throttle to `refreshSnapshotVersions` calls when `updateList=false && trackHeadStatus=true`. Use a simple `setTimeout` guard in `bpmnVersionsListRequestRef`. |
| **Expected impact** | Reduces versions endpoint load by ~80–90%. |
| **Risk** | Very low. Head-check is speculative; slight delay is acceptable. |

### P0.2 — Skip versions head-check when history modal is closed and no save is in-flight

| | |
|---|---|
| **File** | `frontend/src/components/ProcessStage.jsx` |
| **Function** | `refreshSnapshotVersions()` callers |
| **Problem** | Versions head-check fires on tab switch, selection change, and other unrelated events even when `bpmnVersionsOpenRef.current === false`. |
| **Fix** | At each call site, guard with `if (!bpmnVersionsOpenRef.current && !saveInFlightRef.current) return;` before calling `refreshSnapshotVersions()`. |
| **Expected impact** | Eliminates speculative versions fetches entirely when user is not viewing history. |
| **Risk** | Low. May slightly delay the "new version available" indicator, but the indicator is not critical path. |

---

## P1 — Performance Cleanup (targeted cleanup of leaks, duplicates, unnecessary fetches)

### P1.1 — Virtualize or cap property overlay rendering

| | |
|---|---|
| **File** | `frontend/src/features/process/bpmn/stage/decor/decorManager.js` |
| **Function** | `applyPropertiesOverlayDecor()` |
| **Problem** | When `alwaysEnabled=true`, the function iterates **all** diagram elements (line 1609–1628) and creates an overlay for every element with properties. On large diagrams this is O(n) with heavy DOM creation. |
| **Fix** | Only render overlays for elements visible in the current viewport. Use `canvas.viewbox()` to compute visible bounds, then filter `registry.getAll()` to elements whose `gfx` bounding box intersects the viewport. |
| **Expected impact** | Reduces overlay DOM from O(all elements) to O(visible elements). For large diagrams, could cut overlay count by 50–80%. |
| **Risk** | Medium. Requires correct coordinate-space math for viewport intersection. Must handle zoom correctly. |

### P1.2 — Batch overlay style updates

| | |
|---|---|
| **File** | `frontend/src/features/process/bpmn/stage/decor/decorManager.js` |
| **Function** | `applyPropertiesOverlayContainerStyle()` |
| **Problem** | Sets 8+ inline styles individually per overlay container. For 180 overlays, that's 1,440+ style mutations. |
| **Fix** | Use CSS classes for common geometry buckets instead of per-overlay inline styles. Pre-define 5–10 zoom-bucket classes (e.g., `.fpcPropertyOverlay--zoom-s`, `--zoom-m`, `--zoom-l`) and apply the class instead of inline width/font-size. Keep only truly dynamic values (width) as inline. |
| **Expected impact** | Reduces style recalculation cost during overlay updates. |
| **Risk** | Low. CSS-only change, no logic change. |

### P1.3 — Coalesce `applyPropertiesOverlayDecor` triggers

| | |
|---|---|
| **File** | `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js` |
| **Function** | Properties fanout `useEffect` (line 146–161) |
| **Problem** | The effect fires on any change to `propertiesOverlayAlwaysEnabled`, `propertiesOverlayAlwaysPreviewByElementId`, `selectedPropertiesOverlayPreview`, `readySignal`, or `view`. Rapid state changes (e.g., selection change + zoom) can queue multiple overlay updates in a single frame. |
| **Fix** | Use a `requestAnimationFrame` coalescing queue: instead of calling `applyPropertiesOverlayDecor` immediately, schedule one RAF callback and dedupe additional calls within the same frame. |
| **Expected impact** | Prevents multiple overlay rebuilds in a single frame. |
| **Risk** | Low. RAF scheduling is standard for visual updates. |

### P1.4 — Stabilize `readySignal` in `useBpmnSettledDecorFanout`

| | |
|---|---|
| **File** | `frontend/src/features/process/bpmn/stage/orchestration/useBpmnSettledDecorFanout.js` |
| **Function** | `readySignal` (line 77–80) |
| **Problem** | `readySignal` is a string recomputed on every render: `` `${viewerRef.current ? 1 : 0}:${modelerRef.current ? 1 : 0}` ``. Even though the value is stable, string creation every render is unnecessary. |
| **Fix** | Replace with a ref-based boolean check inside the effect, or memoize with `useMemo`. Better: remove `readySignal` from effect deps and instead check `if (!viewerRef.current) return;` inside the effect body. |
| **Expected impact** | Eliminates one source of effect re-fires. |
| **Risk** | Very low. Behaviorally equivalent. |

---

## P2 — Architecture Improvement (structural improvements for future contour)

### P2.1 — Move overlay rendering to a canvas/WebGL layer

| | |
|---|---|
| **Problem** | DOM-based overlays are fundamentally expensive at scale. 180+ overlay containers with table layouts create massive layout surface. |
| **Fix** | Render property overlays on the SVG canvas using bpmn-js's native text/label rendering, or overlay a single positioned `<canvas>` element for all property text. |
| **Expected impact** | Removes 1,000+ DOM nodes, eliminates CSS layout cost, enables GPU-accelerated pan/zoom. |
| **Risk** | High. Requires significant bpmn-js integration work and testing across browsers. |

### P2.2 — Virtualized overlay DOM with recycling

| | |
|---|---|
| **Problem** | `rebuildPropertiesOverlayTable()` destroys and recreates all row DOM on every content change. |
| **Fix** | Implement a virtual DOM diff or reuse row elements by key. Maintain a pool of `fpcPropertyRow` elements and update textContent instead of rebuilding from scratch. |
| **Expected impact** | Reduces DOM mutation cost during overlay updates by ~70%. |
| **Risk** | Medium. Needs careful keying and cleanup. |

### P2.3 — Extract versions head-check to a background worker or service

| | |
|---|---|
| **Problem** | Polling for versions competes with the main thread. |
| **Fix** | Move the versions head-check to a Web Worker or use the Page Visibility API to pause polling when the tab is hidden. |
| **Expected impact** | Reduces main thread network I/O during active diagram editing. |
| **Risk** | Medium. Worker serialization overhead for small requests may not be worth it. |

### P2.4 — Overlay content lazy-loading

| | |
|---|---|
| **Problem** | `buildPropertiesOverlayPreview` and `finalizeExtensionStateWithDictionary` run synchronously on the main thread for every element. |
| **Fix** | Compute overlay content lazily (on hover or after a delay) for elements not in the immediate viewport. Cache results in a WeakMap keyed by element businessObject. |
| **Expected impact** | Reduces initial overlay render time for large diagrams. |
| **Risk** | Low–medium. UX change: overlays may appear with a slight delay. |
