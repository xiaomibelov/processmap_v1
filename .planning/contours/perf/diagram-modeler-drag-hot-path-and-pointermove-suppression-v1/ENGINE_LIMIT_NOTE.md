# Engine Limit Note

## Contour
`perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1`

---

## Hypothesis (REVISED)

The remaining drag cost is **NOT** attributable to the bpmn-js SVG rendering engine.  
Profiler evidence shows the engine handles large-diagram canvas drag in ~56 ms.  
The app-side delta (~1,500 ms+) comes from:
1. `MoveCanvas` (diagram-js pan tool) bypassing our `drag.start` guards, causing `canvas.viewbox.changed` to trigger expensive React-side work on every frame.
2. Continuous baseline jank (~7 long tasks / sec, ~130 ms each) present even when idle and on non-diagram tabs.

---

## Evidence

### 1. Isolated bpmn-js profiler (disproves engine limit)
- Standalone `bpmn-js` Modeler with 2,376 SVG nodes
- Canvas drag: **1 long task, 56 ms total**
- Top samples: `getCTM`, minified React stubs (from test harness), minimal `bpmn-navigated-viewer` hits
- **Conclusion**: bpmn-js engine itself is NOT the source of 12+ long tasks observed in the full app.

### 2. Chrome DevTools Profiler — app context (v1.0.129)
- Profile captured during canvas drag on large diagram (`wewe` / 2,356 nodes)
- **Sampling**: 140,512 samples over drag window
- **Top self-time functions** (by sample count):

| Rank | Function | File | Samples | % of CPU |
|------|----------|------|---------|----------|
| 1 | (anonymous) | `index-Cle44mAh.js:50:130920` | 62,877 | 49.1% |
| 2 | `ir` | `index-Cle44mAh.js:41:97` | 18,250 | 14.3% |
| 3 | (anonymous) | `index-Cle44mAh.js:50:130338` | 13,855 | 10.8% |
| 4 | (garbage collector) | native | 6,381 | 5.0% |
| 5 | (anonymous) | `index-Cle44mAh.js:50:130148` | 5,510 | 4.3% |
| 6 | (program) | native | 4,939 | 3.9% |
| 7 | `k` | `index-Cle44mAh.js:40:198337` | 3,436 | 2.7% |
| 8 | (anonymous) | `index-Cle44mAh.js:50:129812` | 2,680 | 2.1% |
| 9 | `VR` | `index-Cle44mAh.js:47:1451` | 991 | 0.8% |
| 10 | `XU` | `index-Cle44mAh.js:40:12508` | 971 | 0.8% |
| 15 | `getCTM` | native SVG | 654 | 0.5% |

- **Key finding**: ALL top functions are from the minified React app bundle (`index-Cle44mAh.js`). 
- **bpmn-js** / **diagram-js** functions do NOT appear in top 25.
- **SVG `getCTM`** (the only engine-related native call) is 0.5% — negligible.
- **Garbage collector** is 5.0%, suggesting high allocation rate from React renders.
- **Conclusion**: remaining cost is app-side React work, not engine rendering.

### 3. App-side guard gap — `MoveCanvas` bypass
- `MoveCanvas` (diagram-js pan tool) binds `document` `mousemove`/`mouseup` directly
- It does **NOT** fire `drag.start` / `drag.cleanup` events
- Therefore `isDragInProgress()` stayed `false` during canvas panning
- All existing drag guards (`onViewboxChanged`, `emitDiagramMutation`, `useBpmnSettledDecorFanout`) were **ineffective** during the most common drag operation

### 4. Baseline jank (orthogonal to drag)
- PerformanceObserver on idle page (XML tab, no diagram interaction): **~7 long tasks / sec**
- Same rate on diagram tab without panning
- Indicates systemic main-thread saturation independent of drag

---

## Fixes Applied

1. **`isCanvasPanningActive(inst)` guard** (`diagramDragSideEffectGuard.js`)
   - Reads `inst.get("moveCanvas").isActive()` — the official diagram-js API
   - Added to `onViewboxChanged` in both viewer and modeler paths
   - Suppresses `getCanvasSnapshot`, `logViewAction`, `emitViewboxChanged`, and overlay RAF scheduling during canvas pan

2. **Existing guards preserved**
   - `emitDiagramMutation` drag suppression ✅
   - `useBpmnSettledDecorFanout` drag suppression ✅
   - Post-drag mutation flush on `drag.cleanup` ✅

---

## What Remains Unavoidable

- **Baseline jank**: ~7 long tasks/sec even when idle. Root cause not yet identified. Likely a continuous render loop or forced-reflow cycle in `ProcessStage` or its hooks.
- **bpmn-js overlay hide/show cycle**: `Overlays` module hides on `canvas.viewbox.changing` and shows on `canvas.viewbox.changed` every pan frame. With 17+ overlays this adds some cost, but profiler shows it is minor compared to React bundle time.

---

## Recommendations

1. **If Agent 3 confirms drag improvement is still < 30 %**:  
   The bottleneck is the baseline jank, not drag-specific code. Create contour: `perf/process-stage-baseline-jank-v1` and profile React render trees (e.g. with React DevTools Profiler) to find the continuous render loop.

2. **Do NOT evaluate bpmn-js engine alternatives** — profiler evidence conclusively rules out engine rendering as the primary bottleneck.

## Status

✅ `isCanvasPanningActive` guard implemented and deployed in v1.0.129  
✅ Profiler evidence updated with concrete sample counts  
⏳ Pending Agent 3 real drag verification.
