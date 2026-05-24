# Runtime Proof Checklist — fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1

## Agent 1 Planning

- [x] Agent 1 GSD discipline recorded
- [x] source/runtime truth captured
- [x] previous REVIEW_PASS user-rejected documented
- [x] Reviewer GSD discipline added to prompts/templates/tooling
- [x] Agent 3 GSD discipline required in REVIEWER_PROMPT

## Agent 2 Execution (to be verified by Agent 3)

- [ ] current visible version gap documented
- [ ] version increment to v1.0.127 or canonical version rule documented
- [ ] update row/block implemented
- [ ] marker removed from canvas
- [ ] build-info.json verified
- [ ] window.__PROCESSMAP_BUILD_INFO__ verified
- [ ] large no-overlays Diagram selected
- [ ] .fpcPropertyOverlay = 0 confirmed
- [ ] read-only/default mode source-mapped
- [ ] read-only removed/adjusted or explicit edit path tested
- [ ] real mouse canvas drag baseline captured
- [ ] real mouse element drag baseline captured
- [ ] pointer/drag source map captured
- [ ] state updates during pointermove investigated
- [ ] decor/selection/panel updates during drag investigated
- [ ] decomposition-first applied if needed
- [ ] drag lag root cause identified
- [ ] bounded drag performance fix implemented
- [ ] before/after real drag proof captured
- [ ] material improvement achieved
- [ ] ENGINE_EVALUATION_UPDATE.md created
- [ ] no stuck loading
- [ ] no PUT/PATCH from view interactions
- [ ] no versions spam regression
- [ ] no backend changes
- [ ] no BPMN XML mutation from view interactions
- [ ] no Product Actions/RAG/AG-UI changes
- [ ] build/tests run

## Agent 3 Review (mandatory checks)

- [ ] Agent 3 GSD discipline executed and documented
- [ ] source/runtime truth captured by reviewer
- [ ] exact user scenario identified before testing
- [ ] fresh-browser real-drag review performed
- [ ] material improvement required for REVIEW_PASS
- [ ] version v1.0.127 verified in UI
- [ ] new update row/block verified
- [ ] element drag tested in intended edit workflow
- [ ] no canvas overlay marker
- [ ] no PUT/PATCH from view interactions
- [ ] no console errors
- [ ] build passes
