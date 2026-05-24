# Agent 2 Executor Prompt — perf/diagram-svg-css-repaint-reduction-v1

## Identity
You are Agent 2 / Executor for ProcessMap.

## Scope
Frontend-only bounded repaint/style optimization for Diagram/BPMN SVG and CSS.

## Contour
perf/diagram-svg-css-repaint-reduction-v1

## Run ID
20260515T160840Z-33357

## Working Directory
/opt/processmap-test

## Must Read Before Code
1. `/opt/processmap-test/.planning/contours/perf/diagram-svg-css-repaint-reduction-v1/PLAN.md`
2. `/opt/processmap-test/.planning/contours/perf/diagram-svg-css-repaint-reduction-v1/RUNTIME_NAVIGATION.md`
3. `/opt/processmap-test/.planning/contours/perf/diagram-svg-css-repaint-reduction-v1/RUNTIME_PROOF_CHECKLIST.md`
4. `/opt/processmap-test/.planning/contours/perf/diagram-svg-css-repaint-reduction-v1/STATE.json`
5. Previous review reports (if available):
   - `.planning/contours/feature/diagram-analytics-layer-selection-lite-decomposition-first-v1/REVIEW_REPORT.md`
   - `.planning/contours/perf/diagram-derived-maps-and-render-boundary-v1/REVIEW_REPORT.md`
   - `.planning/contours/audit/diagram-baseline-no-overlays-canvas-profile-v1/REVIEW_REPORT.md`

## Source-map Before Code

Identify exact repaint-heavy styles:

1. Open `frontend/src/styles/app/05/05-02-bpmn-text-contrast.css`.
   - List every rule that contains `filter: drop-shadow`.
   - List every rule that contains `stroke-width` with `!important`.
   - List every rule that contains `box-shadow` or `transition`.
   - Determine which of these apply to selected, hover, or highlight states.
   - Determine which are triggered by `.fpcAnalyticsSelected`.
   - Determine which are triggered by bpmn-js internal `.selected` / `.hover`.

2. Open `frontend/src/styles/app/02/02-06-bpmn-dark-theme.css`.
   - Identify `box-shadow` on `djs-overlay`, `djs-outline`, context pads.

3. Open `frontend/src/styles/app/04/04-03-llm-bottlenecks.css`.
   - Identify `drop-shadow` / `box-shadow` on diagram-quality / jump indicators.

4. Open `frontend/src/styles/tailwind.css`.
   - Identify any expensive rules under `.dark .bpmnCanvas .djs-outline`.

5. Inspect `frontend/src/features/process/bpmn/stage/analytics/applyAnalyticsSelectionHighlight.js`.
   - Confirm it only adds one marker class.
   - Verify there is no `.fpcAnalyticsSelected` CSS elsewhere that adds expensive effects.

6. Inspect `frontend/src/features/process/bpmn/stage/decor/selectionFocusDecor.js`.
   - Document the edit-mode `fpcFocusDim` mass-toggle path.
   - Confirm it is NOT used in analytics mode.

## Baseline Before Code

Run all scenarios from PLAN.md Runtime Baseline Plan:

- **Scenario A** — Idle Diagram: record DOM/SVG/overlay counts.
- **Scenario B** — Selection Repaint: record DOM/SVG delta for 10 clicks.
- **Scenario C** — Hover Repaint: record flicker/lag, inspect computed styles.
- **Scenario D** — Pan/Zoom: record stability.
- **Scenario E** — Chrome performance trace if feasible.

For each scenario, record:
- Exact counts.
- Network silence (0 PUT `/bpmn`, 0 PATCH `/sessions`).
- Console state.

Document baseline in `PERFORMANCE_BEFORE_AFTER.md`.

## Implementation Rules

1. **Decomposition-first**: If you need to modify `BpmnStage.jsx` or `ProcessStage.jsx`, extract a bounded module FIRST. Do not bloat god-files. For CSS-only changes, editing existing `.css` files is acceptable.
2. **No backend changes**.
3. **No package changes**.
4. **No BPMN XML mutation**.
5. **No Product Actions / RAG / AG-UI changes**.
6. **Preserve all previous fixes**: overlay culling, versions dedupe, non-edit PUT guard, decor-off guard, derived maps, selection-lite.
7. **Prefer simple visual states**: stroke color, outline, fill — instead of drop-shadow, box-shadow, blur filters.
8. **Do not remove readability**: base contrast rules must remain.
9. **Do not add dependencies**.
10. **Do not add permanent debug logs**.

## Expected Implementation Areas

Primary:
- `frontend/src/styles/app/05/05-02-bpmn-text-contrast.css` — reduce `filter: drop-shadow`, `stroke-width`, `box-shadow`, `transition` for selected/hover/flash states.
- `frontend/src/styles/app/02/02-06-bpmn-dark-theme.css` — reduce `box-shadow` on overlays/outlines.
- `frontend/src/styles/app/04/04-03-llm-bottlenecks.css` — reduce `drop-shadow` on diagram indicators.

Secondary (only if source proof requires):
- `frontend/src/features/process/bpmn/stage/decor/selectionFocusDecor.js` — optimize edit-mode mass dimming.

## Validation Requirements

1. Run `npm run build` (or equivalent) and confirm build passes.
2. Run tests and confirm no new failures.
3. Playwright runtime validation:
   - Open `http://clearvestnic.ru:5180`
   - Authenticate via localStorage token if needed.
   - Navigate to Diagram tab (analytics mode, `include_overlay=0`).
   - Repeat Scenarios A–D.
   - Compare before/after counts.
   - Confirm no regression in selection, hover, pan, zoom, property panel.
4. Verify no PUT/PATCH from view interactions.
5. Verify no `fpcFocusDim` mass return in analytics mode.
6. Verify no `djs-bendpoint` / `djs-segment-dragger` in analytics mode.

## Deliverables

Write these files into the contour directory:

- `EXEC_REPORT.md` — summary, what was changed, why, scope confirmation.
- `REPAINT_SOURCE_MAP.md` — detailed map of repaint-heavy selectors before and after.
- `PERFORMANCE_BEFORE_AFTER.md` — Scenario A–D metrics, before vs after.
- `IMPLEMENTATION_NOTES.md` — file-by-file change list, rationale, rollback notes.
- `READY_FOR_REVIEW` — empty marker file.
- If decomposition occurred: `DECOMPOSITION_REPORT.md`.
- If blocked: `EXEC_BLOCKED.md` and do NOT create `READY_FOR_REVIEW`.

## Block Conditions

Stop and write `EXEC_BLOCKED.md` if:
- CSS changes would require modifying BpmnStage/ProcessStage and safe extraction is impossible.
- Runtime is unreachable or baseline cannot be captured.
- Any previous fix is found to be regressed and cannot be preserved.
- The source map shows the repaint cost is NOT in CSS but in an unforeseen layer (e.g., bpmn-js internal forced synchronous layout).

## Final Check Before READY_FOR_REVIEW

- [ ] Build passes.
- [ ] Tests pass (or pre-existing failures only).
- [ ] Baseline recorded.
- [ ] After-metrics recorded.
- [ ] No backend/package/BPMN XML changes.
- [ ] No god-file bloat.
- [ ] Previous fixes preserved.
- [ ] `PERFORMANCE_BEFORE_AFTER.md` shows improvement or at minimum no regression + source proof of reduced CSS churn.
