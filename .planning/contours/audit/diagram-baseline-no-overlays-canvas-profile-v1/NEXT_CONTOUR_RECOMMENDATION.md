# NEXT_CONTOUR_RECOMMENDATION — audit/diagram-baseline-no-overlays-canvas-profile-v1

## Decision Matrix

| Next Contour | When to choose | Evidence needed | Risk | Expected impact |
|-------------|----------------|-----------------|------|-----------------|
| `perf/diagram-property-map-memoization-v1` | Heavy derived maps likely | Source map shows frequent rebuilds | Low | Medium |
| `fix/diagram-decor-pipeline-disable-when-overlays-off-v1` | Decor pipeline runs with overlays off | Console/source proof of redundant calls | Low | Medium-High |
| `perf/diagram-react-render-boundary-stabilization-v1` | React churn significant | Source map shows unstable props/deps | Low-Medium | Medium |
| `perf/diagram-svg-css-repaint-reduction-v1` | Browser paint/layout dominates | Trace or DOM evidence | Medium | Medium |
| `perf/diagram-readonly-lightweight-viewer-mode-v1` | Pure bpmn-js cost high | Mode 4 shows high lag even without decor | Medium | High |
| `research/diagram-alternative-renderer-canvas-webgl-fit-v1` | SVG cannot handle target diagrams | All cheaper fixes insufficient | High | High |

---

## Primary Recommendation

### `fix/diagram-decor-pipeline-disable-when-overlays-off-v1`

**Justification**:
1. **Direct source evidence**: `useBpmnSettledDecorFanout.js` Properties effect (lines 153–168) fires unconditionally. `runSettledPropertiesFanout` (`postStagingFanout.js` lines 224–239) always calls `applyPropertiesOverlayDecor`.
2. **Direct source evidence**: `applyPropertiesOverlayDecor` (`decorManager.js` lines 1561–1635) checks `propertiesOverlayAlwaysEnabledRef` and exits early, but the function invocation + ref reads + `clearPropertiesOverlayDecor` call still happen on every `readySignal` change and every tab switch.
3. **Easy fix**: Add a lightweight guard at the top of `runSettledPropertiesFanout` that skips the entire fanout when `propertiesOverlayAlwaysEnabled` is false AND no selected preview exists. This avoids function call overhead and effect scheduling.
4. **Low risk**: The fix is purely additive (early return). No existing overlay behavior changes when overlays ARE on.
5. **Medium-High impact**: Eliminates redundant fanout calls on every tab switch and every instance creation. This reduces scripting overhead and React effect churn.

**Expected change**:
- File: `frontend/src/features/process/bpmn/stage/fanout/postStagingFanout.js`
- Add early return in `runSettledPropertiesFanout` when overlays are off
- Optionally add early return in `useBpmnSettledDecorFanout.js` Properties effect

**Acceptance criteria**:
- `applyPropertiesOverlayDecor` is NOT called when `propertiesOverlayAlwaysEnabled === false` and no preview is selected
- Tab switch produces 0 Properties fanout calls
- No regression when overlays ARE on

---

## Backup Recommendation

### `perf/diagram-svg-css-repaint-reduction-v1`

**Justification**:
1. **Direct runtime evidence**: Selection causes +3,186 SVG nodes (+133%) and adds `fpcFocusDim` class to ~250 elements.
2. **The dominant bottleneck is paint/layout**: Even if we eliminate decor pipeline overhead, selection still triggers bpmn-js modeler handles + ProcessMap focus dimming.
3. **Medium risk**: Requires understanding bpmn-js internal rendering + ProcessMap CSS. May need to optimize `fpcFocusDim` application (e.g., use `will-change`, batch class additions, or use a single overlay layer instead of per-element classes).

**Expected changes**:
- `BpmnStage.jsx`: Optimize `applySelectionFocusDecor` to batch marker additions or use a CSS custom property on a parent container instead of per-element classes
- `frontend/src/styles/app/05/05-02-bpmn-text-contrast.css`: Review `fpcFocusDim` selectors for specificity and paint cost
- Consider using `canvas.addMarker` batch API or a single overlay rect instead of dimming every element

**Acceptance criteria**:
- Selection DOM inflation reduced by >30%
- Subjective selection latency improved
- No visual regression in focus dimming behavior

---

## Why NOT the other options

| Option | Why not primary |
|--------|----------------|
| `perf/diagram-property-map-memoization-v1` | `readySignal` is already memoized with primitives. No runtime evidence of map rebuild churn. |
| `perf/diagram-react-render-boundary-stabilization-v1` | React churn exists but is secondary to the SVG paint cost. Fixing React first would not address the +3,186 node selection inflation. |
| `perf/diagram-readonly-lightweight-viewer-mode-v1` | The session is already in a relatively lightweight state. The issue is editor-mode bendpoints + focus dimming, not viewer vs modeler. |
| `research/diagram-alternative-renderer-canvas-webgl-fit-v1` | No evidence that SVG cannot handle 276 elements. Baseline pan/zoom is smooth. This would be massive over-engineering. |

---

## Recommended sequence

1. **`fix/diagram-decor-pipeline-disable-when-overlays-off-v1`** (primary) — quick win, low risk, reduces redundant work
2. **`perf/diagram-svg-css-repaint-reduction-v1`** (backup) — tackle the real bottleneck if (1) provides insufficient subjective improvement
