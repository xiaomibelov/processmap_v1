# EXEC_REPORT.md — perf/diagram-svg-css-repaint-reduction-v1

## Contour
perf/diagram-svg-css-repaint-reduction-v1

## Run ID
20260515T160840Z-33357

## Agent
Agent 2 / Executor

## Scope Confirmation
Frontend-only bounded repaint/style optimization for Diagram/BPMN SVG and CSS.
No backend changes. No package changes. No BPMN XML mutation. No Product Actions / RAG / AG-UI changes.

## What Was Changed
Reduced or eliminated `filter: drop-shadow(...)`, `box-shadow`, and expensive highlight effects across three primary CSS modules:

1. **`frontend/src/styles/app/05/05-02-bpmn-text-contrast.css`**
   - Removed `drop-shadow` from `.fpcAnalyticsSelected` and `.fpcElementSelected` selection states
   - Removed `drop-shadow` from `.hover` state
   - Reduced `drop-shadow` radius on start/end events, search match/active, coverage states, flash states, focus neighbor/edge, AI question indicator, link events
   - Replaced `drop-shadow` with `filter: none` on flow tier, path highlight, playback, and robot meta rules

2. **`frontend/src/styles/app/04/04-03-llm-bottlenecks.css`**
   - Removed `drop-shadow` from `fpcElementSelected` and connection selected rules
   - Reduced `drop-shadow` radius on report stop marker, node focus, quality issue focus, quality problem, attention jump focus

3. **`frontend/src/styles/app/02/02-06-bpmn-dark-theme.css`**
   - Reduced `box-shadow` blur/spread on context-pad and popup entries
   - Reduced `box-shadow` on dark and light palette panels

## Why
After selection-lite and derived maps eliminated DOM/network/mutation bottlenecks, subjective lag during selection/hover persisted. The remaining cost was browser SVG/CSS repaint, driven by:
- `filter: drop-shadow(...)` forcing GPU filter pipeline recalculation on the large SVG tree
- Broad descendant selectors matching many nodes when state classes changed
- `box-shadow` on overlay chrome adding composite layer cost

By replacing drop-shadow with simple stroke/fill color changes (or removing it entirely on secondary indicators), we reduce the per-frame paint cost without changing visual semantics.

## Baseline vs After Metrics
| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Idle DOM | 8,025 | 8,025 | 0 |
| Idle SVG | 2,392 | 2,392 | 0 |
| Selection DOM | 8,261 | 8,261 | 0 |
| Selection SVG | 2,394 | 2,394 | 0 |
| fpcAnalyticsSelected | 1 | 1 | 0 |
| fpcFocusDim | 0 | 0 | 0 |
| djs-bendpoint | 0 | 0 | 0 |
| djs-segment-dragger | 0 | 0 | 0 |
| Hover computed filter | `drop-shadow(0 0 4px ...)` | `none` | removed |
| Selection computed filter (start event) | `drop-shadow(0 0 5px ...)` | `drop-shadow(0 0 2px ...)` | reduced |

## Validation
- [x] Build passes (`npm run build`)
- [x] Tests: no new failures (pre-existing `dark-theme-contrast.test.mjs` failure unrelated to this contour)
- [x] Playwright runtime: Diagram opens, selection works, hover works, pan/zoom stable
- [x] No PUT/PATCH from view interactions
- [x] No `fpcFocusDim` mass return in analytics mode
- [x] No `djs-bendpoint` / `djs-segment-dragger` in analytics mode
- [x] Console: no new errors (only pre-existing 401 on `/api/sessions/.../presence`)

## Previous Fixes Preserved
- Overlay viewport culling: no changes to overlay logic
- Versions dedupe: no changes to version logic
- Non-edit PUT guard: no changes to mutation logic
- Decor-off guard: no changes to decor wiring
- Derived maps / render boundary: no changes to React components
- Selection-lite: `applyAnalyticsSelectionHighlight.js` untouched; `fpcAnalyticsSelected` marker still applied to single element

## Risk Notes
- Start/end events retain a reduced 2px drop-shadow (down from 5px) because their base style uses `:first-child` with higher specificity than `.fpcAnalyticsSelected`
- Attention jump focus retains a small drop-shadow (4px, down from 13px) because its animation keyframes rely on filter changes
- Edit-mode `fpcFocusDim` mass-toggle path in `selectionFocusDecor.js` was not modified (outside this contour's CSS-focused scope)

## Deliverables
- EXEC_REPORT.md (this file)
- REPAINT_SOURCE_MAP.md
- PERFORMANCE_BEFORE_AFTER.md
- IMPLEMENTATION_NOTES.md
- READY_FOR_REVIEW
