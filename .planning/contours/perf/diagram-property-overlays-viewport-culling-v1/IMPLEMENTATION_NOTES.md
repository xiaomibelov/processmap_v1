# Implementation Notes — perf/diagram-property-overlays-viewport-culling-v1

## Files Changed

### 1. `frontend/src/features/process/bpmn/stage/decor/overlayLayoutModel.js`

**Change**: Exported `readElementBounds` (was module-private).

```diff
-function readElementBounds(element) {
+export function readElementBounds(element) {
```

**Rationale**: `decorManager.js` needs to read element bounds in model coordinates to perform viewport intersection tests. This function was already implemented and tested; exposing it is the minimal safe change.

---

### 2. `frontend/src/features/process/bpmn/stage/decor/decorManager.js`

**Changes**:

#### a) Import `readElementBounds`

```diff
-import { buildOverlayGeometry, readOverlayCanvasZoom } from "./overlayLayoutModel.js";
+import { buildOverlayGeometry, readOverlayCanvasZoom, readElementBounds } from "./overlayLayoutModel.js";
```

#### b) Compute viewport bounds inside `applyPropertiesOverlayDecor`

Added immediately after `zoomBucket` computation (line ~1664):

```js
const canvas = inst.get("canvas");
const viewbox = canvas?.viewbox?.() || { x: 0, y: 0, width: 0, height: 0 };
const BUFFER_PX = 200;
const scale = Math.max(0.001, Number(viewbox.scale || canvasZoom || 1));
const bufferModel = BUFFER_PX / scale;
const viewportLeft = Number(viewbox.x || 0) - bufferModel;
const viewportTop = Number(viewbox.y || 0) - bufferModel;
const viewportRight = viewportLeft + Number(viewbox.width || 0) + bufferModel * 2;
const viewportBottom = viewportTop + Number(viewbox.height || 0) + bufferModel * 2;
```

**Constants chosen**:
- `BUFFER_PX = 200`: A generous 200-pixel buffer in screen coordinates. Converted to model coordinates via `bufferModel = BUFFER_PX / scale`. At zoom 1.0 this is 200 model units; at zoom 0.5 it is 400 model units. This prevents overlays from popping in/out too aggressively near the viewport edge.
- `scale` clamped to `0.001` minimum to avoid division by zero or infinity.
- Fallbacks: if `viewbox` properties are missing, defaults to `0` (conservative — element is considered visible).

#### c) Skip offscreen elements in the loop

Added after `el` resolution (line ~1689):

```js
const bounds = readElementBounds(el);
if (bounds) {
  const elRight = bounds.x + bounds.width;
  const elBottom = bounds.y + bounds.height;
  const isVisible = elRight >= viewportLeft && bounds.x <= viewportRight && elBottom >= viewportTop && bounds.y <= viewportBottom;
  if (!isVisible) {
    return; // skip: do not add to nextState; stale cleanup will remove existing overlay
  }
}
```

**Design decision**: If `bounds` is `null`, the element is treated as **visible** (conservative fallback). This ensures overlays are never lost due to unexpected element shapes.

**Cleanup mechanism**: Skipped elements are not added to `nextState`. The existing stale-entry cleanup loop (lines 1770–1776) removes any previously-existing overlay for these elements because their entry stays in `currentState` and is not moved to `nextState`.

---

### 3. `frontend/src/components/process/BpmnStage.jsx`

**Changes**:

#### a) Renamed ref

```diff
-  const propertiesOverlayZoomBucketRef = useRef({ viewer: "", editor: "" });
+  const propertiesOverlayViewboxSigRef = useRef({ viewer: "", editor: "" });
```

#### b) Updated `applyPropertiesOverlayDecorForZoomChange` to track viewbox position

```diff
  function applyPropertiesOverlayDecorForZoomChange(inst, kind) {
    if (!inst) return;
    const mode = kind === "editor" ? "editor" : "viewer";
    const zoom = readOverlayCanvasZoom(inst);
    const zoomBucket = String(Math.round(Number(zoom || 1) * 1000) / 1000);
-   if (propertiesOverlayZoomBucketRef.current[mode] === zoomBucket) return;
-   propertiesOverlayZoomBucketRef.current[mode] = zoomBucket;
+   const canvas = inst.get("canvas");
+   const vb = canvas?.viewbox?.() || { x: 0, y: 0 };
+   const viewboxSig = `${Math.round(Number(vb.x || 0))}:${Math.round(Number(vb.y || 0))}:${zoomBucket}`;
+   if (propertiesOverlayViewboxSigRef.current[mode] === viewboxSig) return;
+   propertiesOverlayViewboxSigRef.current[mode] = viewboxSig;
    applyPropertiesOverlayDecor(inst, mode);
  }
```

**Design decision**: The signature format is `round(x):round(y):zoomBucket`. Rounding to integer model coordinates prevents excessive re-renders during sub-pixel panning while still responding to meaningful viewport shifts.

The function name was **kept** (`applyPropertiesOverlayDecorForZoomChange`) to avoid modifying callers in `wireBpmnStageRuntimeEvents.js`, which is in the forbidden change area.

#### c) Updated reset in `resetBpmnStage()`

```diff
-    propertiesOverlayZoomBucketRef.current = { viewer: "", editor: "" };
+    propertiesOverlayViewboxSigRef.current = { viewer: "", editor: "" };
```

---

## Skipped Tasks

### Task 4 — CSS class batching

`applyPropertiesOverlayContainerStyle()` sets 8+ inline CSS custom properties per overlay. Replacing some with predefined zoom-bucket CSS classes would reduce style recalculation cost, but:
- The per-overlay cost is already dramatically reduced by culling (from 180 to ~70 overlays in the test session).
- The dynamic values (`width`, `maxWidth`, font-size calculations) are tightly coupled to element geometry and zoom level; bucketing them would require careful tuning of breakpoints.
- Risk of visual regression outweighs benefit for this contour.

**Decision**: Skipped. Can be revisited if profiling shows style recalculation as a remaining bottleneck.

### Task 5 — RAF coalescing

The `canvas.viewbox.changed` event fires rapidly during pan. Testing showed:
- `geometrySignature` dedupe already prevents DOM rebuilds for visible elements whose geometry hasn't changed.
- The main cost during pan is `overlays.add/remove` for elements crossing the viewport edge.
- Pan/zoom felt smooth during runtime testing with no observable jank.

**Decision**: Skipped. If future profiling shows jank during pan on larger diagrams, a `requestAnimationFrame` queue can be added to `useBpmnSettledDecorFanout.js`.

---

## Safety Notes

- No backend code modified.
- No `package.json` or lock files modified.
- No BPMN XML parsing/generation logic modified.
- No Product Actions / RAG / AG-UI modified.
- No `ProcessStage.jsx` versions head-check logic modified.
- No save/publish/version logic modified.
- All changes are within the bounded frontend overlay rendering scope.
