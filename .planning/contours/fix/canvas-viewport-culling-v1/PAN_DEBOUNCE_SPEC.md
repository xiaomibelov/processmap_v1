# Pan Debounce Spec

## Objective
Throttle expensive culling recomputation during fast pan without throttling the visual canvas transform.

## Behavior
- bpmn-js native pan updates the viewport `<g transform="...">` via CSS transform on every pointermove.
- This is already GPU-accelerated and must NOT be debounced.
- Our culling recomputation (iterating 428 elements, intersection math, DOM attach/detach) CAN be throttled.

## Implementation

### RAF Frame Skip
```js
let rafId = null;
let frameCounter = 0;
const CULLING_FRAME_SKIP = 2; // execute every 3rd frame

function onViewboxChanged() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    frameCounter++;
    if (frameCounter % (CULLING_FRAME_SKIP + 1) === 0) {
      runViewportCulling();
    }
    rafId = null;
  });
}
```

### Fast Pan Detection (optional)
- Track `viewbox.x`/`y` delta between frames.
- If delta > `FAST_PAN_THRESHOLD_PX` (e.g., 50 px in screen coords), increase `CULLING_FRAME_SKIP` to 3.
- If delta < threshold, decrease to 1 or 0.

### Overlay Reposition Debounce
- Custom overlays (property badges, selection handles) reposition on viewbox change.
- Debounce overlay repositioning by 50–100 ms during continuous pan.
- Use existing `geometrySignature` dedupe where possible.

## Verification
- Fast pan must feel smooth (no visual stutter from culling).
- FPS must not drop below 45 during fast pan on large diagram.
- After pan stops, culling must catch up within 1 frame.
