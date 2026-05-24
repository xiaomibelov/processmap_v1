# NEXT_CONTOUR_DECISION_MATRIX.md — audit/diagram-post-optimization-runtime-profile-v1

## Decision Options

| # | Option | Trigger Condition | Evidence Supporting | Evidence Rejecting | Expected Impact | Risk | Rough Scope | Priority |
|---|--------|-------------------|---------------------|--------------------|-----------------|------|-------------|----------|
| 1 | `perf/diagram-initial-load-skeleton-and-lazy-hydration-v1` | Initial Diagram/session open is dominant bottleneck (>2s to canvas) | **SUPPORTING**: Scenario A shows 6,540 ms to `diagram-ready`. This is >3× the 2s threshold. BpmnStage.jsx viewer+modeler dual init is the likely cause. | **REJECTING**: None. Initial load has always been heavy and was never directly optimized. | Faster first paint; deferred non-critical work (decor, panel) after canvas ready | Medium | Add skeleton, lazy hydrate decor/panel after canvas ready | **High** |
| 2 | `perf/diagram-edit-mode-lazy-enable-v1` | Analytics mode fast but edit mode remains heavy | **SUPPORTING**: Scenario E accidental trigger showed +3,217 DOM / +3,214 SVG inflation, confirming edit path is heavy. Prior audit confirmed +3,400 DOM delta in edit mode. | **REJECTING**: This run could not intentionally enter edit mode (button not accessible via Playwright). Edit mode heaviness is inferred, not directly measured here. | Keep view mode default; enable editor affordances only on explicit edit | Medium | Wire explicit edit toggle; defer modeler init | Medium |
| 3 | `perf/diagram-property-panel-render-boundary-v1` | Property panel update after selection is dominant | **SUPPORTING**: Scenario H panel open/update latency ~799 ms average. NotesPanel.jsx is 3,286 lines with massive useMemo/useEffect surface. | **REJECTING**: Panel measurement was contaminated by Scenario E pan/zoom anomaly (DOM 11,242). Clean-state panel latency unknown. Also, selection click did not register in this run, so panel→selection comparison is impossible. | Memoize/memo-boundary panel children; reduce recalculation | Low-Medium | Add React.memo / boundary around panel sections | Medium |
| 4 | `perf/diagram-large-model-progressive-rendering-v1` | Large diagram size dominates; small diagram is fine | **SUPPORTING**: None. | **REJECTING**: Only one session tested. No small/large comparison. Session `wewe` (~276 elements) is the only data point. | Render visible viewport first; virtualize off-screen elements | High | Viewport-aware SVG rendering; complex | Low |
| 5 | `research/diagram-readonly-lightweight-viewer-mode-v1` | bpmn-js Modeler baseline remains heavy even in view mode | **SUPPORTING**: `bpmnLayerEditor` is `block` on initial load even in analytics mode. Modeler chunk (`Modeler-X-yuAGEr.js`) is still downloaded. | **REJECTING**: Baseline DOM/SVG with overlays OFF is clean (8,025 / 2,392). View mode is not proven heavy once loaded. | Split viewer-only vs editor modes more strictly | Medium | Use NavigatedViewer only by default; modeler on demand | Medium |
| 6 | `research/diagram-alternative-renderer-canvas-webgl-fit-v1` | Evidence shows bpmn-js/SVG cannot meet target | **SUPPORTING**: None. | **REJECTING**: No evidence SVG cannot meet target. All prior contours achieved objective improvements. Initial load is slow due to init, not rendering engine. | Future-proof rendering | Very High | Research only; no implementation | **Explicitly Rejected** |
| 7 | `audit/processmap-test-runtime-vs-stage-performance-v1` | Test runtime/server/browser appears to be bottleneck | **SUPPORTING**: Playwright synthetic events behave differently from real user input (e.g., pan/zoom anomaly, selection non-registration). Subjective lag may have environment component. | **REJECTING**: 6.5s initial load and 4–6s tab switch are too large and consistent to be purely environment-specific. | Isolate environment factor | Low | Compare stage vs test runtime metrics | Medium |
| 8 | `STOP_DIAGRAM_PERF_MOVE_TO_PRODUCT_WORK` | Metrics acceptable; subjective lag cannot be reproduced enough | **SUPPORTING**: Baseline DOM/SVG is stable. Network is clean. No PUT/PATCH spam. Analytics selection (prior audits) is +238 DOM. | **REJECTING**: 6.5s initial load is not acceptable. 4–6s tab switch is not acceptable. Subjective lag has objective correlates. | Redirect effort to Product Actions / registry / other surfaces | Low | None; document findings and close perf series | Low |

## Final Recommendation

### Primary Next Contour
**`perf/diagram-initial-load-skeleton-and-lazy-hydration-v1`** (Option 1)

**Rationale**:
- Scenario A provides the strongest, most unambiguous evidence: 6,540 ms to `diagram-ready`.
- This is >3× the 2s threshold defined in PLAN.md.
- Initial load was never directly targeted by any of the 10 prior performance contours.
- The fix is well-scoped: add a skeleton state, defer non-critical work (decor pipeline, property panel hydration, derived model computation) until after canvas is visible.
- Risk is medium and manageable.

### Backup Next Contour
**`perf/diagram-property-panel-render-boundary-v1`** (Option 3)

**Rationale**:
- Scenario H measured ~799 ms panel open latency, which is slow.
- `NotesPanel.jsx` at 3,286 lines is a known high-surface component.
- If initial load optimization does not fully resolve subjective lag, the property panel is the next most likely culprit.
- Scope is low-medium risk (React.memo / boundary additions).

### Explicitly Rejected Option
**`research/diagram-alternative-renderer-canvas-webgl-fit-v1`** (Option 6)

**Rationale**:
- Zero evidence that bpmn-js/SVG cannot meet performance targets.
- All 10 prior contours achieved measurable objective improvements using the existing SVG renderer.
- The bottleneck is initialization and React churn, not the rendering engine.
- Risk is "Very High" for research-only work with no implementation path.
- This option should only be reconsidered if ALL other options are exhausted and evidence specifically points to SVG rendering limits.
