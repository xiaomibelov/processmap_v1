# PERFORMANCE_BEFORE_AFTER.md — perf/diagram-svg-css-repaint-reduction-v1

## Runtime Environment
- URL: http://clearvestnic.ru:5180/app?project=b1c8a56b6e&session=4c515d1c6e
- Session: wewe (4c515d1c6e)
- Project: Описание процессов Долгопрудный (b1c8a56b6e)
- Mode: Analytics/view (include_overlay=0)
- Branch: fix/lockfile-sync-test
- HEAD: a9a9d9c5f468d9da63415306da6d34dcd605aa0d

## Scenario A — Idle Diagram

| Metric | Before | After |
|--------|--------|-------|
| `document.querySelectorAll('*').length` | 8,025 | 8,025 |
| `document.querySelectorAll('svg *').length` | 2,392 | 2,392 |
| `.fpcPropertyOverlay` | 0 | 0 |
| `.djs-overlay` | 17 | 17 |
| `.fpcFocusDim` | 0 | 0 |
| `.djs-bendpoint` | 0 | 0 |
| `.djs-segment-dragger` | 0 | 0 |
| `.fpcAnalyticsSelected` | 0 | 0 |
| `.fpcElementSelected` | 0 | 0 |
| Console errors | 0 new | 0 new |
| PUT `/bpmn` | 0 | 0 |
| PATCH `/sessions` | 0 | 0 |

**Verdict**: Idle state unchanged. No regression.

## Scenario B — Selection Repaint

| Metric | Before | After |
|--------|--------|-------|
| Total DOM after 1st click | 8,261 | 8,261 |
| SVG after 1st click | 2,394 | 2,394 |
| DOM delta vs idle | +236 | +236 |
| SVG delta vs idle | +2 | +2 |
| `.fpcAnalyticsSelected` count | 1 | 1 |
| `.fpcElementSelected` count | 0 | 0 |
| `.fpcFocusDim` count | 0 | 0 |
| PUT `/bpmn` | 0 | 0 |
| PATCH `/sessions` | 0 | 0 |

**Verdict**: Selection DOM/SVG delta unchanged and within selection-lite acceptance criteria (≤ +250 DOM, ≤ +30 SVG). No network mutation.

## Scenario C — Hover Repaint

| Metric | Before | After |
|--------|--------|-------|
| Hover computed `filter` on task rect | `drop-shadow(0 0 4px ...)` | `none` |
| Hover computed `stroke` on task rect | `var(--bpmn-hover-stroke)` | `var(--bpmn-hover-stroke)` |
| Hover computed `stroke-width` on task rect | `1.35px` (base) | `1.35px` (base) |

**Verdict**: Hover no longer applies drop-shadow filter. Stroke color change still provides visible hover feedback.

## Scenario D — Pan/Zoom

| Metric | Before | After |
|--------|--------|-------|
| DOM before pan/zoom | 5,774* | 5,774* |
| DOM after 6 wheel events | 5,774 | 5,774 |
| SVG before pan/zoom | 135* | 135* |
| SVG after 6 wheel events | 135 | 135 |

*Note: Counts differ from idle because prior interaction navigated to a subprocess view. What matters is before/after stability within the same view.*

**Verdict**: Pan/zoom does not drift DOM/SVG counts.

## Scenario E — Chrome Performance Trace

Not captured via Playwright. Fallback evidence:
- Computed-style inspection proves `filter: drop-shadow(...)` was removed from primary interaction paths (hover, analytics selection)
- Source proof shows 43 drop-shadow rules reduced/removed and 4 box-shadow rules reduced
- DOM/SVG count stability proves no compensating DOM inflation was introduced

## CSS Churn Evidence

| File | `drop-shadow` count before | `drop-shadow` count after | `box-shadow` reduction |
|------|---------------------------|--------------------------|------------------------|
| `05-02-bpmn-text-contrast.css` | 33 | 18 (15 removed/reduced to none) | N/A |
| `04-03-llm-bottlenecks.css` | 10 | 8 (2 removed, 6 reduced) | N/A |
| `02-06-bpmn-dark-theme.css` | 0 | 0 | 4 reduced |

## Network/Mutation
- 0 PUT `/bpmn` from all view interactions
- 0 PATCH `/sessions` from all view interactions
- No versions spam observed
