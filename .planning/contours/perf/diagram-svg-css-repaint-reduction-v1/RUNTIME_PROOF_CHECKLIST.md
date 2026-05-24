# RUNTIME_PROOF_CHECKLIST.md — perf/diagram-svg-css-repaint-reduction-v1

## Pre-execution (Agent 1)

- [x] GSD discipline recorded
- [x] Previous Diagram performance contours reviewed
- [x] Source/runtime truth captured
- [x] SVG/CSS repaint source map captured

## Execution (Agent 2)

- [ ] Baseline selection/hover/pan/zoom captured
- [ ] Heavy selectors/effects identified
- [ ] Broad class toggles identified
- [ ] Bounded repaint reduction implemented
- [ ] selection-lite preserved
- [ ] derived maps/render boundary preserved
- [ ] property/details panel remains working
- [ ] overlay culling preserved
- [ ] versions dedupe preserved
- [ ] non-edit PUT guard preserved
- [ ] decor-off guard preserved
- [ ] no PUT/PATCH from view interactions
- [ ] no backend changes
- [ ] no BPMN XML mutation
- [ ] no Product Actions/RAG/AG-UI changes
- [ ] build/tests run

## Review (Agent 3)

- [ ] Agent 3 Playwright review required
- [ ] before/after performance proof required
- [ ] REVIEW_PASS or CHANGES_REQUESTED issued
- [ ] If CHANGES_REQUESTED, rework loop executed
- [ ] If REVIEW_PASS, review report written
