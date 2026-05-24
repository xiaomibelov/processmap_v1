# Runtime Proof Checklist

## Pre-implementation

- [x] GSD discipline recorded
- [x] Previous performance audits reviewed
- [x] Source/runtime truth captured
- [x] God-file risk identified
- [x] Decomposition-first plan defined
- [x] Selection/focus/decor source map captured
- [x] Baseline selection DOM/SVG delta captured
- [x] fpcFocusDim count captured
- [x] bpmn-js selection handles/draggers counted

## Phase 1 — Extraction (Agent 2)

- [ ] Behavior-preserving extraction completed
- [ ] Extraction tested before feature logic
- [ ] Build passes after extraction
- [ ] Playwright counts match pre-extraction baseline
- [ ] DECOMPOSITION_REPORT.md written

## Phase 2 — Selection-Lite MVP (Agent 2)

- [ ] Analytics layer / selection-lite implemented
- [ ] Analysis/view selection works
- [ ] Edit mode still works
- [ ] DOM/SVG selection delta improved or limitation documented
- [ ] fpcFocusDim mass update reduced/disabled in analysis mode or limitation documented
- [ ] No PUT/PATCH from view interactions
- [ ] No versions spam regression
- [ ] Overlay culling not regressed
- [ ] Decor-off guard not regressed
- [ ] Build/tests pass or pre-existing failures documented
- [ ] PERFORMANCE_BEFORE_AFTER.md written
- [ ] SELECTION_LITE_DESIGN.md written
- [ ] IMPLEMENTATION_NOTES.md written
- [ ] EXEC_REPORT.md written
- [ ] READY_FOR_REVIEW created

## Agent 3 Review

- [ ] Agent 3 Playwright review required
- [ ] Source review completed
- [ ] Runtime scenarios A–E passed
- [ ] No backend changes
- [ ] No BPMN XML mutation
- [ ] No Product Actions/RAG/AG-UI changes
- [ ] No commit/push/PR/deploy performed by agents
- [ ] Either REVIEW_PASS or CHANGES_REQUESTED issued

## Scope Locks

- [ ] No backend changes
- [ ] No package changes unless explicitly approved
- [ ] No BPMN XML mutation from analysis/view interactions
- [ ] No Product Actions/RAG/AG-UI changes
- [ ] No commit/push/PR/deploy
