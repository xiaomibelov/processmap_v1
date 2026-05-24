# ProcessMap Agent RAG Preflight — Planner

## Input
- **role**: planner
- **contour**: fix/diagram-bpmn-task-typography-and-overlay-label-density-v1
- **area/query**: Diagram BPMN task typography font weight label density property chips visual clutter CSS theme interaction mode
- **generated_at**: 2026-05-16T23:37:56.563Z

## Structured Facts

### Agent Rules
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)

### User Rejections
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Formal REVIEW_PASS did not correspond to user-visible drag lag resolution. → Investigate React bundle cost rather than only event handler batching; establish real drag baseline with profiler.
- [medium] fix/diagram-real-drag-performance-and-engine-decomposition-v1: Version marker was placed on the BPMN canvas, interfering with diagram interaction. → Move version marker to a non-canvas UI element (e.g., header bar, badge, footer).
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Reviewer tested synthetic zoom/click instead of real mouse drag. → All diagram performance reviews must include real mouse drag test with profiler or frame-time evidence.

### Contour Facts
- perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-visible-version-and-large-canvas-lag-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-coverage-and-validation-hardening-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-real-drag-performance-and-engine-decomposition-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Decisions
- Product Actions must not be written into BPMN XML. (All backend/API work involving Product Actions and BPMN)
- Version marker must not overlay the BPMN canvas. (All diagram/UI contours)
- RAG must not write or mutate BPMN XML. (All RAG contours, all agent contexts)
- For TO-BE format, follow only the user-provided document; no invented terms unless marked hypothesis. (All TO-BE modeling and process design contours)
- Version/update row should increment visibly. (Save, deploy, and version contours)

### Bottlenecks
- [Frontend] React bundle consumes ~95% CPU during diagram drag interactions. → next: fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1
- [Diagram] Diagram drag lag remained after multiple performance contours. → next: perf/process-stage-baseline-jank-v1

### Validation Facts
- What happened in perf diagram modeler drag hot path pointermove suppression? → PASS (7/7 PASS on full manifest with improved ranking)

## Supporting Documents

### #1 — Primary path — Option C: Simplify CSS effects
- **score**: 34.187
- **path**: `/opt/processmap-test/.planning/contours/perf/diagram-svg-css-repaint-reduction-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **snippet**:
```
Audit 05-02-bpmn-text-contrast.css for rules that apply to selected/hover/flash states.
Replace or reduce filter: drop-shadow(...) with cheaper visual feedback.
Reduce stroke-width !important values for highlight states.
Remove or reduce box-shadow on overlay elements in 02-06-bpmn-dark-theme.css.
Ensure .fpcAnalyticsSelected CSS is minimal.
```

### #2 — Summary — CSS Churn Evidence
- **path**: `/opt/processmap-test/.planning/contours/perf/diagram-svg-css-repaint-reduction-v1/REPAINT_SOURCE_MAP.md`
- **snippet**:
```
33 drop-shadow rules reduced or removed in 05-02-bpmn-text-contrast.css
10 drop-shadow rules reduced or removed in 04-03-llm-bottlenecks.css
4 box-shadow rules reduced in 02-06-bpmn-dark-theme.css
Primary interaction paths no longer trigger drop-shadow filters on most SVG elements
```

### #3 — CSS class batching (property overlays)
- **path**: `/opt/processmap-test/.planning/contours/perf/diagram-property-overlays-viewport-culling-v1/IMPLEMENTATION_NOTES.md`
- **snippet**:
```
applyPropertiesOverlayContainerStyle() sets 8+ inline CSS custom properties per overlay.
Replacing some with predefined zoom-bucket CSS classes would reduce style recalculation cost.
Risk of visual regression if bucketing is not carefully tuned.
```

## How RAG Changed This Plan
- Confirmed that previous performance contours already removed most drop-shadow filters.
- Reinforced that this contour must NOT reintroduce heavy filters or shadows.
- Highlighted that property overlay CSS uses high font-weight (700) and dense inline styles — this supports including chip density check as secondary concern.
- Validated that version marker must stay off canvas and version row must increment.
- Reminded that real drag test is required for any performance-related review, even though this is primarily a visual contour.
