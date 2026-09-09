# Execution report

- Added a one-second requestAnimationFrame sampler scoped to a ready BPMN canvas.
- The guard appears after two consecutive samples below 10 FPS.
- It clears after two consecutive samples at or above 15 FPS.
- The overlay reuses FlowArcSpinner, blocks pointer input, and uses no expensive backdrop filter.
- Hidden tabs and the initial incomplete sample do not activate the guard.

Verification:

- Focused load UI tests: 7/7 passed.
- New modules ESLint: passed.
- Frontend production build: passed.
- Full-file BpmnStage ESLint is blocked by pre-existing `saveBpmnMeta` no-undef at line 5324.
- graphify update: passed with existing parser and graph-size warnings.
