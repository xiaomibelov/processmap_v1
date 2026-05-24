# Runtime Proof Checklist — perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1

## Agent 1 Planning Gates

- [x] Agent 1 GSD discipline recorded
- [x] Source/runtime truth captured
- [x] Previous partial drag improvement documented
- [x] Reviewer GSD discipline required in REVIEWER_PROMPT
- [x] Version/update row increment planned
- [x] Marker not on canvas
- [x] build-info.json verified
- [x] window.__PROCESSMAP_BUILD_INFO__ verified
- [x] Large no-overlays Diagram selected
- [x] .fpcPropertyOverlay = 0 confirmed

## Agent 2 Execution Checklist

- [ ] Real mouse canvas drag quick baseline captured (before fix)
- [ ] Real mouse canvas drag stepped baseline captured (before fix)
- [ ] Real mouse element drag baseline captured (before fix)
- [ ] Pointermove hot path source map captured
- [ ] State updates during pointermove investigated
- [ ] Selection/AI/property sync during drag investigated
- [ ] Decor/fanout during drag investigated
- [ ] Mutation/autosave staging during drag investigated
- [ ] Decomposition-first applied if needed
- [ ] Drag-time non-critical side effects suppressed/coalesced
- [ ] One bounded sync after drag end
- [ ] Version bumped to v1.0.128 or canonical next
- [ ] New update row/block added with SHA + timestamp + contour id + summary
- [ ] Build passes
- [ ] 5180 rebuilt/restarted
- [ ] Real mouse canvas drag quick/natural re-tested (after fix)
- [ ] Real mouse canvas drag stepped/stress re-tested (after fix)
- [ ] Real mouse element drag re-tested (after fix)
- [ ] Before/after real drag proof captured
- [ ] Material improvement achieved or engine limit documented
- [ ] No stuck loading
- [ ] No PUT/PATCH from view interactions
- [ ] No versions spam regression
- [ ] No backend changes
- [ ] No BPMN XML mutation from view interactions
- [ ] No Product Actions/RAG/AG-UI changes
- [ ] EXEC_REPORT.md created
- [ ] VERSION_UPDATE_LEDGER_PROOF.md created
- [ ] REAL_DRAG_HOT_PATH_BASELINE.md created
- [ ] DRAG_HOT_PATH_ROOT_CAUSE.md created
- [ ] POINTERMOVE_SIDE_EFFECTS_REPORT.md created
- [ ] RUNTIME_BEFORE_AFTER.md created
- [ ] IMPLEMENTATION_NOTES.md created
- [ ] READY_FOR_REVIEW marker created

## Agent 3 Review Gates

- [ ] Reviewer GSD discipline documented in REVIEW_REPORT.md
- [ ] Reviewer ran GSD availability/use/fallback
- [ ] Source HEAD verified
- [ ] Visible update/version row verified (v1.0.128 or canonical next)
- [ ] Marker not on canvas verified
- [ ] build-info.json verified
- [ ] window.__PROCESSMAP_BUILD_INFO__ verified
- [ ] Fresh 5180 browser context used
- [ ] Large no-overlays Diagram tested
- [ ] .fpcPropertyOverlay = 0 confirmed
- [ ] Real mouse canvas drag quick/natural tested (≥3 attempts, median recorded)
- [ ] Real mouse canvas drag stepped/stress tested (≥3 attempts if feasible)
- [ ] Real mouse element drag tested
- [ ] Before/after comparison documented
- [ ] No PUT/PATCH from drag interactions
- [ ] No console errors
- [ ] Material improvement achieved OR engine limit documented with evidence
- [ ] Build/tests verified
- [ ] REVIEW_PASS only if all strict criteria met
