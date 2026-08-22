# Runtime Performance Evidence

**Contour:** `fix/canvas-viewport-culling-v1`  
**Date:** 2026-05-28  
**Tester:** Worker agent (Playwright + automated JS evaluation)  
**Session:** `9a8030f136` (large diagram, 231 registry elements: 122 shapes + 108 connections + labels)  
**Browser:** Chromium headless (Playwright MCP)  
**Build:** `index-*.js` production bundle, copied to gateway container

---

## A. Performance Metrics

### A1 — FPS during pan (large diagram)

| Condition | FPS | Max frame time | Status |
|-----------|-----|----------------|--------|
| Baseline (x=0) | 70 | 19 ms | ✅ |
| Panned off-screen (x=5000) | 73 | 18 ms | ✅ |

**Target:** FPS ≥ 45, long tasks ≤ 50 ms  
**Result:** Both conditions met with comfortable margin.

### A2 — SVG node count during pan (large diagram)

| Condition | SVG nodes | Status |
|-----------|-----------|--------|
| Baseline (x=0, scale=1) | 513 | — |
| Panned off-screen (x=5000) | **5** | ✅ |
| Restored to origin | 513 | ✅ |

**Target:** SVG ≤ 1500 during pan  
**Result:** Culling reduces SVG nodes by ~99% when viewport is far off-diagram.

### A3 — Memory stability (5 pan cycles)

| Metric | Value | Status |
|--------|-------|--------|
| Heap before cycles | 60 MB | — |
| Heap after 5 cycles | 65 MB | — |
| Delta | **+5 MB (+8.3%)** | ✅ |

**Target:** ±10% after 5 pan cycles  
**Result:** Well within tolerance. No DOM leak detected.

---

## B. Functionality Metrics

### B1 — Zoom 0.1

- SVG nodes: 1912
- No console errors
- Diagram renders correctly at low zoom

### B2 — Zoom 2.0

- SVG nodes: 358
- No console errors
- Diagram renders correctly at high zoom

### B3 — Selection at origin

- Selected start event successfully
- Selection marker applied

### B4 — Selection after pan off-screen

- Selection preserved (1 element remains selected)
- No console errors

### B5 — Selection after pan back

- Selection restored and marker re-applied
- `selectionRestored: true`

### B6 — Overlay decorators (implicit)

- `isGfxInDom` guards prevent overlay creation on culled elements
- Overlays reappear when elements scroll back into view

---

## C. Culling Engine Verification

### C1 — Detach count

- At x=5000: **219 elements detached** (of 231 total)
- 12 elements remain visible (near viewport edge)

### C2 — Reattach count

- After pan back to x=0: **0 detached, all 219 reattached**
- SVG node count restores to 513

### C3 — Zoom simplification

- At zoom < 0.2: non-rect SVG children hidden
- At zoom 0.2–0.5: only rect elements shown
- At zoom ≥ 0.5: all children restored

---

## D. Bug Fix Summary

**Root cause:** `scheduleCull()` scheduled a single RAF callback with `frameSkip` throttling. If the scheduled callback landed on a skipped frame, `runCulling()` never executed.

**Fix:** Removed `frameSkip` logic from `scheduleCull()`. Each RAF callback now unconditionally runs `runCulling()`.

**File changed:** `frontend/src/features/process/bpmn/stage/viewport/cullBpmnViewport.js`

---

## E. Evidence Artifacts

- Console logs: `[CULL] modeler detached=219 attached=0 total=219 scale=1`
- Playwright session: `page-2026-05-28T15-06-08-638Z.yml` (snapshot)
- Build artifacts: `dist/assets/index-*.js` (gateway container)
