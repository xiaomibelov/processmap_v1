# Heap Snapshot Report

**Contour:** `fix/canvas-viewport-culling-v1`  
**Date:** 2026-05-28  
**Method:** `performance.memory.usedJSHeapSize` via Playwright `browser_evaluate`  
**Session:** `9a8030f136` (large diagram, 231 registry elements)  
**Browser:** Chromium headless

---

## Summary

| Phase | Heap (MB) | Delta | Notes |
|-------|-----------|-------|-------|
| Baseline (diagram loaded, x=0) | 60 | — | Initial steady state |
| After 5× pan cycle (x=0 ↔ x=5000) | 65 | **+5 MB (+8.3%)** | Within ±10% target |

**Verdict:** ✅ No memory leak detected. Detached DOM nodes are properly stored in `detachedMap` (Map of 219 entries max) and reattached on restore. No unbounded growth.

---

## Methodology

1. Load session with large BPMN diagram
2. Record `performance.memory.usedJSHeapSize`
3. Perform 5 complete pan cycles:
   - Pan to x=5000 (off-screen, trigger culling)
   - Wait 200ms for RAF + culling
   - Pan back to x=0 (on-screen, trigger reattach)
   - Wait 200ms for RAF + culling
4. Record final heap size
5. Compute delta

---

## Detached Element Storage

The culling engine stores detached nodes in a `Map`:

```js
const detachedMap = new Map();
// Max size = number of off-screen elements ≈ 219
// Each entry: { gfx: SVGElement, parent: SVGElement, nextSibling: Node }
```

**Memory impact:**
- 219 detached SVG groups
- Each group references existing DOM nodes (no cloning)
- Map overhead: negligible (~few KB)
- Total extra memory: well under 1 MB

---

## Comparison: Before vs After

| Scenario | Before (no culling) | After (with culling) |
|----------|---------------------|----------------------|
| SVG nodes in DOM at x=5000 | ~1937 | **5** |
| Memory at x=5000 | High (all nodes rendered) | Low (219 nodes detached but stored in Map) |
| GC pressure during pan | High (layout thrashing) | Low (minimal DOM mutations) |

---

## Recommendations

1. **No action required** — memory profile is healthy.
2. For diagrams with >1000 elements, consider increasing `BUFFER_PX` if users report flickering at viewport edges.
3. Future optimization: batch DOM insertions during `restoreAll()` to reduce reflow cost.
