# Viewport Culling Spec

## Objective
Reduce rendered SVG node count during pan by hiding or detaching off-screen bpmn-js shapes and connections.

## Algorithm

### 1. Viewbox → Model Coordinates
```js
const canvas = inst.get('canvas');
const vb = canvas.viewbox();
const scale = vb.scale || 1;
const bufferModel = BUFFER_PX / Math.max(scale, 0.001);

const viewport = {
  left: vb.x - bufferModel,
  top: vb.y - bufferModel,
  right: vb.x + vb.width + bufferModel,
  bottom: vb.y + vb.height + bufferModel
};
```

### 2. Element Bounds
- **Shape**: `{ x: el.x, y: el.y, width: el.width, height: el.height }`
- **Connection**: min/max of `el.waypoints` array
- **Label**: treat as shape if it has independent bounds

### 3. Intersection Test
```js
function intersects(bounds, viewport) {
  return !(
    bounds.x + bounds.width < viewport.left ||
    bounds.x > viewport.right ||
    bounds.y + bounds.height < viewport.top ||
    bounds.y > viewport.bottom
  );
}
```

### 4. Visibility Toggle
**Primary approach (detach/reattach):**
- Off-screen + currently in DOM → `gfx.remove()`, store in `detachedMap.set(el.id, gfx)`.
- On-screen + currently detached → lookup `detachedMap.get(el.id)`, append to correct layer, delete from map.
- On-screen + already in DOM → no-op.

**Fallback approach (if detach breaks bpmn-js):**
- Off-screen → `gfx.style.display = 'none'`.
- On-screen → `gfx.style.display = ''`.
- **Measurement adjustment**: if fallback used, report "visible SVG nodes" (excluding `display:none`) instead of total SVG nodes.

### 5. Connection Handling
- Connections use waypoint bounding box for intersection.
- If any waypoint is inside viewport OR bounding box intersects → visible.
- Do NOT clip connection paths; render full connection to avoid broken visuals.

### 6. Buffer Zone
- `BUFFER_PX = 200` (screen pixels).
- Convert to model pixels: `bufferModel = BUFFER_PX / scale`.
- Prevents flicker during fast pan.

### 7. Performance
- Iterate `elementRegistry.getAll()` once per viewbox change.
- Expected complexity: O(n) where n = 428 elements (trivial).
- Avoid DOM queries inside loop; use cached `gfx` references from `elementRegistry.getGraphics(element)`.

## Files to Modify
- `frontend/src/components/process/BpmnStage.jsx` — add `cullViewport(inst, mode)` function
- Optional: `frontend/src/features/process/bpmn/stage/viewport/cullBpmnViewport.js` — pure utility

## Verification
- Pan to empty area on large diagram → SVG nodes must drop materially (target ≤ 1500).
- Pan back → SVG nodes restore to ~full count.
- No console errors.
- No broken connections.
