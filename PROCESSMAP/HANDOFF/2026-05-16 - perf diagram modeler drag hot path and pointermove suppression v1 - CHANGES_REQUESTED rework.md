# Handoff: perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1

## Date
2026-05-16

## Contour Status
CHANGES_REQUESTED → rework completed, awaiting Agent 3 re-review

## What Agent 3 Requested
1. **Chrome DevTools Performance profile evidence** attributing remaining cost to bpmn-js engine, OR
2. **Find additional app-side hot path and fix it**

## Evidence Gathered

### 1. Isolated bpmn-js profiler (disproves engine limit)
- Created standalone `bpmn-drag-test-modeler.html` loading 2,376 SVG nodes
- Canvas drag: **1 long task, 56 ms total**
- Top samples: `getCTM`, React test-harness stubs, minimal bpmn-js hits
- **Conclusion**: bpmn-js engine is NOT the bottleneck

### 2. Chrome DevTools Profiler — app context (v1.0.129, concrete data)
- Profile captured via CDP `Profiler.start/stop` during canvas drag on `wewe` session (2,356 nodes)
- **140,512 samples** at 100 μs interval
- **Top 25 self-time functions**:

| Rank | Function | File | Samples | % |
|------|----------|------|---------|---|
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

- **Key finding**: ALL top functions are from the minified React app bundle. **No bpmn-js / diagram-js functions in top 25.**
- **SVG `getCTM`** (only engine-related call) = 0.5% — negligible.
- **Conclusion**: remaining cost is app-side React work, not engine rendering.
- Full evidence: `.planning/contours/perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/PROFILER_EVIDENCE.md`

### 3. Baseline jank discovery (orthogonal to drag)
- PerformanceObserver on idle page: **~7 long tasks / sec, ~130 ms each**
- Same rate on XML tab (no diagram interaction)
- Indicates systemic main-thread saturation independent of drag
- Root cause NOT yet identified — likely a continuous render/forced-reflow cycle in `ProcessStage` or its hooks

### 4. Critical guard gap found and fixed
- `MoveCanvas` (diagram-js pan tool) binds `document` `mousemove`/`mouseup` directly
- It does **NOT** fire `drag.start` / `drag.cleanup` events
- Therefore `isDragInProgress()` stayed `false` during canvas panning
- All existing drag guards were **ineffective** during the most common drag operation

## Fixes Applied in v1.0.129

### File: `diagramDragSideEffectGuard.js` (new)
- Added `isCanvasPanningActive(inst)` helper
- Reads `inst.get("moveCanvas").isActive()` — official diagram-js API

### File: `wireBpmnStageRuntimeEvents.js`
- Imported `isCanvasPanningActive`
- Added `|| isCanvasPanningActive(inst)` guard to `onViewboxChanged` in **both** viewer and modeler paths
- Suppresses during pan: `getCanvasSnapshot`, `logViewAction`, `emitViewboxChanged`, overlay RAF scheduling

### File: `ENGINE_LIMIT_NOTE.md`
- Revised hypothesis: bpmn-js is ruled out by profiler evidence
- Documents baseline jank as separate systemic issue
- Recommends new contour `perf/process-stage-baseline-jank-v1` if further optimization needed

### File: `PROFILER_EVIDENCE.md` (new)
- Raw CDP profiler output with sample counts and interpretation

### Version bump
- `v1.0.128` → `v1.0.129`
- Changelog entry in Russian

## Build & Deploy Proof
- Branch: `fix/lockfile-sync-test`
- HEAD: `a9a9d9c` (build-info timestamp 2026-05-16T10:16:30Z)
- JS asset: `index-Cle44mAh.js`
- Build: 0 errors, ~28 s
- Gateway restarted successfully

## What Remains
- **Agent 3 re-review** required
- If drag improvement still < 30 %: the bottleneck is the baseline jank, not drag-specific code
- Baseline jank requires its own contour with React DevTools Profiler investigation

## Risks / Limitations
- `isCanvasPanningActive` relies on `moveCanvas.isActive()`, an internal-ish API. If diagram-js changes this in a future version, the guard will silently fail (falls back to `false`, safe behavior).
- Baseline jank root cause not yet identified; contour scope was bounded to drag hot path only.
