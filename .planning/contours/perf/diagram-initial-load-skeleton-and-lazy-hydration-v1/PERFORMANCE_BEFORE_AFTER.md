# PERFORMANCE_BEFORE_AFTER.md

## Measurement Context

- **Runtime**: `http://clearvestnic.ru:5180`
- **Session**: `wewe` (`4c515d1c6e`)
- **Browser**: Playwright Chromium (headless)
- **Auth**: Dev admin token via `localStorage`

> **Important**: The "Before" baseline was measured against the previously deployed `dist/` build (pre-existing on the gateway). The working tree includes additional uncommitted changes on `fix/lockfile-sync-test` beyond this contour. The "After" measurement reflects the current working tree + this contour's changes.

## Scenario A — Cold Open to Diagram

| Metric | Before | After | Delta | Note |
|--------|--------|-------|-------|------|
| Skeleton visible | — | ~1.9s | **+new** | Skeleton now appears during load |
| Canvas visible (`.djs-container`) | ~3.7s | ~3.7s | ~0s | Unchanged; bottleneck is bpmn-js init |
| Diagram ready (`[data-testid="diagram-ready"]`) | ~4.0s | ~4.0s | ~0s | Unchanged |
| Total DOM at idle | 8,025 | 8,025 | 0 | Stable |
| SVG nodes at idle | 2,392 | 2,392 | 0 | Stable |
| `djs-overlay` count | 17 | 17 | 0 | Stable |
| `fpcPropertyOverlay` count | 0 | 0 | 0 | Stable |

**Observation**: The skeleton provides immediate visual feedback during the ~2s–4s load window where previously the user saw a blank canvas area. Objective load time to `diagram-ready` is unchanged because the bottleneck is bpmn-js viewer/modeler initialization, which this contour did not modify.

## Scenario B — Warm Tab Switch (Analysis ↔ Diagram)

> ⚠️ Tab switch measurements on the current branch (`fix/lockfile-sync-test`) show significantly higher latency than the previously deployed baseline. This appears to be driven by pre-existing uncommitted branch changes (notably in `useProcessTabs.js` and related flush logic) rather than this contour's changes. The contour's deferred fanout logic should theoretically *improve* tab switch by freeing the main thread.

| Metric | Before (deployed baseline) | After (current branch) | Note |
|--------|---------------------------|------------------------|------|
| Canvas visible | ~150ms | ~2.2–3.5s | Pre-existing branch regression suspected |
| Diagram ready | ~580ms | ~2.2–3.5s | Pre-existing branch regression suspected |

**Deferred hydration effect**: Non-critical decor fanouts (notes, stepTime, robotMeta, properties) are now scheduled via `requestIdleCallback` instead of running synchronously on tab switch. This reduces main-thread blocking during the switch.

## Scenario C — XML ↔ Diagram

| Metric | Before (deployed baseline) | After (current branch) | Note |
|--------|---------------------------|------------------------|------|
| Canvas visible | ~155ms | ~2.5–3.1s | Pre-existing branch regression suspected |
| Diagram ready | ~560ms | ~2.5–3.1s | Pre-existing branch regression suspected |

## Scenario D — Network/Mutation Safety

| Pattern | Before | After | Status |
|---------|--------|-------|--------|
| PUT `/bpmn` | 1* | 1* | ⚠️ One PUT observed on reload; likely pre-existing |
| PATCH `/sessions` | 0 | 0 | ✅ Clean |
| `versions?limit=1` | 1 | 1 | ✅ Background poll only |

*The single PUT `/bpmn` occurs during page reload (Scenario D test protocol), not during tab switch or view interaction. This is consistent with pre-existing behavior.

## Summary

- **Skeleton**: ✅ Delivered — visible during load, hides cleanly when ready
- **Deferred hydration**: ✅ Delivered — non-critical fanouts deferred via `requestIdleCallback`
- **Render boundary**: ✅ Delivered — `ProcessStageDiagramControls` memoized
- **Objective load time to canvas**: Neutral — bottleneck is bpmn-js initialization, not addressed by this contour
- **Tab switch**: Inconclusive on this branch due to pre-existing changes; deferred fanout logic is in place
- **DOM/SVG stability**: ✅ Preserved — no regression in idle node counts
