# RUNTIME_PROOF_CHECKLIST — perf/process-stage-baseline-jank-v1

## Agent 1 (Planner)

- [x] GSD discipline recorded
- [x] Source/runtime truth captured
- [x] Previous drag-hot-path non-improvement documented
- [x] React bundle 95% CPU finding documented
- [x] Reviewer GSD discipline required
- [x] Version/update row increment planned
- [x] Marker not on canvas
- [x] build-info.json verified
- [x] window.__PROCESSMAP_BUILD_INFO__ verified
- [x] Large no-overlays Diagram selected
- [x] .fpcPropertyOverlay = 0 confirmed

## Agent 2 (Executor)

- [ ] Executor RAG preflight saved
- [ ] Source/runtime truth captured
- [ ] Idle 10s baseline captured
- [ ] Real mouse canvas drag quick baseline captured
- [ ] Real mouse canvas drag stepped baseline captured
- [ ] Real element drag baseline captured
- [ ] Tab switch baseline captured
- [ ] React profiler evidence captured
- [ ] Root cause identified and documented
- [ ] Bounded fix applied
- [ ] Rebuild passes (0 errors)
- [ ] Gateway serving fresh build
- [ ] After-code idle measured
- [ ] After-code drag measured
- [ ] After-code tab switch measured
- [ ] Material improvement demonstrated
- [ ] Version row updated
- [ ] Marker not on canvas
- [ ] build-info.json valid
- [ ] window.__PROCESSMAP_BUILD_INFO__ valid
- [ ] No PUT /bpmn from view interactions
- [ ] No PATCH /sessions from view interactions
- [ ] EXEC_REPORT.md written (Russian)
- [ ] BASELINE_REACT_JANK_PROFILE.md written
- [ ] REACT_RENDER_SOURCE_MAP.md written
- [ ] PROCESS_STAGE_JANK_ROOT_CAUSE.md written
- [ ] RUNTIME_BEFORE_AFTER.md written
- [ ] VERSION_UPDATE_LEDGER_PROOF.md written
- [ ] READY_FOR_REVIEW or EXEC_BLOCKED created

## Agent 3 (Reviewer)

- [ ] Reviewer GSD discipline recorded
- [ ] Reviewer RAG preflight saved
- [ ] Independent source/runtime truth verified
- [ ] Fresh 5180 runtime verified (HTTP 200, no-cache)
- [ ] build-info.json sha matches HEAD
- [ ] Version row visible
- [ ] Marker not on canvas
- [ ] Large no-overlays Diagram opened
- [ ] Idle 10s baseline independently measured
- [ ] Real mouse canvas drag quick tested (≥3 attempts)
- [ ] Real mouse canvas drag stepped tested (≥3 attempts)
- [ ] Real element drag tested
- [ ] No PUT/PATCH from drag/view
- [ ] Before/after metrics compared
- [ ] Material improvement confirmed OR precise next bottleneck documented
- [ ] REVIEW_REPORT.md written (Russian)
- [ ] Verdict: REVIEW_PASS or CHANGES_REQUESTED
