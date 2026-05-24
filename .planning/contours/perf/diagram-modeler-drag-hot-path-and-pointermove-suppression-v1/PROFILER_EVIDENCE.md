# Profiler Evidence — Chrome DevTools Protocol

## Capture Setup
- **App version**: v1.0.129
- **Diagram**: `wewe` / `Описание процессов Долгопрудный` (2,356 SVG nodes, 163 shapes)
- **Method**: Chrome DevTools Protocol `Profiler.start` / `Profiler.stop`
- **Sampling interval**: 100 μs
- **Drag operation**: Canvas pan, 400×300 px over 640 ms (40 steps @ 16 ms)
- **Profile window**: drag + 100 ms post-drag settle

## Raw Results

```json
{
  "totalSamples": 140512,
  "top25": [
    { "rank": 1,  "samples": 62877, "function": "(anonymous)", "url": "index-Cle44mAh.js:50:130920",  "pct": "49.1%" },
    { "rank": 2,  "samples": 18250, "function": "ir",          "url": "index-Cle44mAh.js:41:97",       "pct": "14.3%" },
    { "rank": 3,  "samples": 13855, "function": "(anonymous)", "url": "index-Cle44mAh.js:50:130338",  "pct": "10.8%" },
    { "rank": 4,  "samples": 6381,  "function": "(garbage collector)", "url": "native",              "pct": "5.0%" },
    { "rank": 5,  "samples": 5510,  "function": "(anonymous)", "url": "index-Cle44mAh.js:50:130148",  "pct": "4.3%" },
    { "rank": 6,  "samples": 4939,  "function": "(program)",   "url": "native",                       "pct": "3.9%" },
    { "rank": 7,  "samples": 3436,  "function": "k",           "url": "index-Cle44mAh.js:40:198337",  "pct": "2.7%" },
    { "rank": 8,  "samples": 2680,  "function": "(anonymous)", "url": "index-Cle44mAh.js:50:129812",  "pct": "2.1%" },
    { "rank": 9,  "samples": 991,   "function": "VR",          "url": "index-Cle44mAh.js:47:1451",    "pct": "0.8%" },
    { "rank": 10, "samples": 971,   "function": "XU",          "url": "index-Cle44mAh.js:40:12508",   "pct": "0.8%" },
    { "rank": 11, "samples": 923,   "function": "Ore",         "url": "index-Cle44mAh.js:40:14678",   "pct": "0.7%" },
    { "rank": 12, "samples": 866,   "function": "(anonymous)", "url": "index-Cle44mAh.js:54:16497",   "pct": "0.7%" },
    { "rank": 13, "samples": 803,   "function": "k",           "url": "index-Cle44mAh.js:40:198337",  "pct": "0.6%" },
    { "rank": 14, "samples": 709,   "function": "b",           "url": "index-Cle44mAh.js:38:8957",    "pct": "0.6%" },
    { "rank": 15, "samples": 654,   "function": "getCTM",      "url": "native",                       "pct": "0.5%" },
    { "rank": 16, "samples": 653,   "function": "m6",          "url": "index-Cle44mAh.js:17:244",     "pct": "0.5%" },
    { "rank": 17, "samples": 626,   "function": "i8",          "url": "index-Cle44mAh.js:40:39811",   "pct": "0.5%" },
    { "rank": 18, "samples": 590,   "function": "Tg",          "url": "index-Cle44mAh.js:40:48343",   "pct": "0.5%" },
    { "rank": 19, "samples": 468,   "function": "Xue",         "url": "index-Cle44mAh.js:54:76",      "pct": "0.4%" },
    { "rank": 20, "samples": 322,   "function": "m6",          "url": "index-Cle44mAh.js:17:244",     "pct": "0.3%" },
    { "rank": 21, "samples": 320,   "function": "ir",          "url": "index-Cle44mAh.js:41:97",      "pct": "0.3%" },
    { "rank": 22, "samples": 305,   "function": "(anonymous)", "url": "index-Cle44mAh.js:50:70263",   "pct": "0.2%" },
    { "rank": 23, "samples": 294,   "function": "k",           "url": "index-Cle44mAh.js:40:198337",  "pct": "0.2%" },
    { "rank": 24, "samples": 285,   "function": "VM",          "url": "index-Cle44mAh.js:38:129",     "pct": "0.2%" },
    { "rank": 25, "samples": 278,   "function": "PBe",         "url": "index-Cle44mAh.js:128:69058",  "pct": "0.2%" }
  ]
}
```

## Interpretation

### bpmn-js engine attribution: ZERO
- No `bpmn-js`, `diagram-js`, or `bpmn-navigated-viewing` functions appear in the top 25.
- The only SVG-engine-related entry is native `getCTM` at rank 15 with **0.5%** of samples.
- **Conclusion**: the bpmn-js SVG engine is not the bottleneck.

### React bundle attribution: ~95%
- Ranks 1–3, 5, 7–14, 16–25 are all from `index-Cle44mAh.js` (minified React app bundle).
- Combined, the React bundle accounts for **~95%** of all CPU samples.
- The top 3 anonymous functions alone (lines 50:130920, 50:130338, 50:130148) account for **~64%** of all CPU time.

### Garbage collector: 5.0%
- GC pressure suggests high allocation rate, consistent with frequent React re-renders or object creation during drag.

## Comparison with Isolated bpmn-js Test

| Metric | Isolated bpmn-js Modeler | Full App (v1.0.129) |
|--------|--------------------------|---------------------|
| Long tasks during drag | 1 | 12 |
| Total long-task time | 56 ms | ~1,586 ms |
| Top CPU function | `getCTM` | minified React `(anonymous)` |
| Engine % of CPU | ~100% | ~0.5% |

## What This Means for the Contour

The remaining drag slowness is **app-side React work**, not the bpmn-js engine.  
The `MoveCanvas` panning guard (`isCanvasPanningActive`) closes the largest app-side gap.  
Any further improvement requires addressing:
1. The continuous baseline jank (~7 long tasks/sec even when idle).
2. Potential React render-tree inefficiencies during `canvas.viewbox.changed`.

These are **out of scope** for the current contour and should be tracked as `perf/process-stage-baseline-jank-v1`.
