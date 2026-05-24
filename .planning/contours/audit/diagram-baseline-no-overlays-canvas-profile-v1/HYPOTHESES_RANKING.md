# HYPOTHESES_RANKING — audit/diagram-baseline-no-overlays-canvas-profile-v1

## H1 — Pure bpmn-js/SVG cost is high enough to lag

| | Assessment |
|---|---|
| **Evidence for** | Baseline SVG has 2,392 nodes before any interaction. Editor mode adds palette, breadcrumbs, overlays. |
| **Evidence against** | Pan/zoom is smooth with 0 DOM change. The lag is specifically tied to **selection**, not baseline rendering. |
| **Confidence** | **Medium** |
| **Supporting scenario** | Mode 4 baseline: total 8025, SVG 2392 |
| **Conclusion** | Baseline bpmn-js cost exists but is not the primary lag source. Selection inflation (+3186 SVG nodes) is the dominant cost. |

---

## H2 — Decor pipeline remains active when overlays visually off

| | Assessment |
|---|---|
| **Evidence for** | Source: `useBpmnSettledDecorFanout.js` Properties effect fires unconditionally on `readySignal`/`view` changes. `runSettledPropertiesFanout` always calls `applyPropertiesOverlayDecor`. |
| **Evidence against** | `applyPropertiesOverlayDecor` exits early (line 1633) with no DOM creation when overlays are off. Cost is limited to function call + ref reads. |
| **Confidence** | **High** |
| **Supporting scenario** | Scenario G — source map of fanout deps and early-exit path |
| **Conclusion** | Confirmed: pipeline **is** active, but the active path is cheap (early exit). The real cost is the **selection decor** (`fpcFocusDim`), not the overlay decor pipeline. |

---

## H3 — Derived property/decor maps rebuild too often

| | Assessment |
|---|---|
| **Evidence for** | `useBpmnSettledDecorFanout` uses `notesSig` (useMemo) and `readySignal` (useMemo with primitives). Maps inside `decorManager.js` are rebuilt when overlays ARE active. |
| **Evidence against** | No runtime evidence of frequent map rebuild when overlays are off. `readySignal` is stable (primitive instance keys). No derived maps are built on pan/zoom. |
| **Confidence** | **Low** |
| **Supporting scenario** | Source map only — no runtime DOM churn from map rebuild observed |
| **Conclusion** | Unlikely to be the primary bottleneck. `readySignal` stabilization from previous contour works. |

---

## H4 — React parent render churn (ProcessStage/BpmnStage)

| | Assessment |
|---|---|
| **Evidence for** | `ProcessStage.jsx` has 70+ state values. `useProcessStageLocalState` spreads 4 sub-hook objects. `BpmnStage.jsx` has 14 ref-sync effects. `useProcessStageShellController` useMemo has 18 deps. |
| **Evidence against** | Runtime DOM counts are stable during pan/zoom/hover. React churn would cause more frequent re-renders, but the only visible symptom is selection inflation. |
| **Confidence** | **Medium-High** |
| **Supporting scenario** | Source map of prop deps and effect arrays |
| **Conclusion** | React churn **exists** and contributes to overall sluggishness, but it is not the dominant cause of the perceived "canvas lag". The SVG node inflation on selection is a larger, more direct cost. |

---

## H5 — CSS/SVG repaint cost dominates

| | Assessment |
|---|---|
| **Evidence for** | Selection adds 3,186 SVG nodes (+133%). `fpcFocusDim` CSS applies `opacity: 0.34` to ~250 elements. bpmn-js adds 916 bendpoint handles. All of this requires layout, style recalc, and paint. |
| **Evidence against** | No direct paint profiling available (Chrome trace not captured). Cannot quantify paint vs scripting split. |
| **Confidence** | **High** |
| **Supporting scenario** | Scenario C — selection DOM counts; Scenario H — inferred from node counts |
| **Conclusion** | **Most likely primary bottleneck**. The combination of bpmn-js modeler bendpoints + ProcessMap focus dimming creates a massive paint/layout surface on every selection. |

---

## H6 — Selection/hover triggers heavy recalculation

| | Assessment |
|---|---|
| **Evidence for** | Selection: +3,186 SVG nodes, +3,198 total DOM nodes. Hover: 0 DOM change. `applySelectionFocusDecor` iterates all selectable elements. |
| **Evidence against** | Hover does NOT trigger recalculation or DOM change. The cost is specifically **selection**, not hover. |
| **Confidence** | **High (for selection)** / **High (rejected for hover)** |
| **Supporting scenario** | Scenario C — selection; Scenario D — hover |
| **Conclusion** | **Confirmed**: Selection is the heaviest interaction by far. Hover is cheap. The cost is driven by bpmn-js modeler handles + `fpcFocusDim` application. |

---

## H7 — Tab visible/hidden CSS toggle still runs hidden pipeline

| | Assessment |
|---|---|
| **Evidence for** | `useBpmnSettledDecorFanout` effects depend on `view`. When `view` changes to "xml", the effects might still fire before cleanup. |
| **Evidence against** | Tab switch to XML and back shows **cleanup** of selection DOM (returns to baseline). No monotonic DOM growth. No network mutations. |
| **Confidence** | **Medium (rejected as primary cause)** |
| **Supporting scenario** | Scenario E — tab return |
| **Conclusion** | Hidden pipeline does not cause unbounded growth or persistent lag. Tab switch is safe. Minor effect firing on `view` change is acceptable. |

---

## H8 — Test runtime factor amplifies lag

| | Assessment |
|---|---|
| **Evidence for** | Playwright runs in a controlled environment. Server is on the same host (`clearvestnic.ru`). No network latency. |
| **Evidence against** | No evidence of server-side amplification. API responds in <100ms. No CPU spikes observed. |
| **Confidence** | **Low** |
| **Supporting scenario** | General runtime health checks |
| **Conclusion** | Rejected. Runtime is healthy. |

---

## H9 — Large diagram scale exceeds bpmn-js comfort zone

| | Assessment |
|---|---|
| **Evidence for** | Session `wewe` has 276 `data-element-id` elements. This is moderately large. |
| **Evidence against** | 276 elements is well within bpmn-js's documented capacity (thousands of elements). Baseline rendering is smooth. The issue is selection, not scale. |
| **Confidence** | **Low** |
| **Supporting scenario** | Mode 5 — element count |
| **Conclusion** | Rejected. Scale is not the issue; selection behavior on the existing scale is. |

---

## H10 — Recent guard layers add small overhead

| | Assessment |
|---|---|
| **Evidence for** | 4-layer guard exists (event suppression, staging respect, scheduler filter, hash guards). Each event passes through multiple checks. |
| **Evidence against** | Guards are cheap (regex tests, string comparisons, hash checks). No runtime slowdown attributable to guards. Network mutations are 0. |
| **Confidence** | **Low** |
| **Supporting scenario** | Source review of guard layers |
| **Conclusion** | Rejected. Guard overhead is negligible. |

---

## Final Ranking (by confidence and impact)

| Rank | Hypothesis | Confidence | Primary Evidence |
|------|-----------|------------|------------------|
| 1 | **H5 — CSS/SVG repaint cost dominates** | **High** | Selection adds 3,186 SVG nodes; `fpcFocusDim` applies opacity to ~250 elements |
| 2 | **H6 — Selection triggers heavy recalculation** | **High** | +3,198 total DOM nodes on selection; `applySelectionFocusDecor` is O(n) |
| 3 | **H2 — Decor pipeline active when overlays off** | **High** | Source: `runSettledPropertiesFanout` always calls `applyPropertiesOverlayDecor` |
| 4 | **H4 — React parent render churn** | **Medium-High** | Source: 70+ state values, 14 ref-sync effects, object spread in local state |
| 5 | **H1 — Pure bpmn-js/SVG cost** | **Medium** | Baseline 2,392 SVG nodes, but pan/zoom is smooth |
| 6 | **H7 — Tab hidden pipeline** | **Medium** | Minor effect firing on `view` change; no runtime regression |
| 7 | **H3 — Derived maps rebuild** | **Low** | `readySignal` is stable; no runtime evidence of rebuild churn |
| 8 | **H10 — Guard layers overhead** | **Low** | Guards are cheap; no observable slowdown |
| 9 | **H9 — Large diagram scale** | **Low** | 276 elements is moderate; issue is selection, not scale |
| 10 | **H8 — Test runtime factor** | **Low** | Runtime is healthy; no server-side amplification |
