# ProcessMap Agent RAG Preflight

## Input
- **role**: executor
- **contour**: perf/process-stage-baseline-jank-v1
- **area/query**: Diagram React baseline jank ProcessStage BpmnStage implementation
- **generated_at**: 2026-05-16T20:30:56.028Z

## Structured Facts

### Agent Rules
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)

### User Rejections
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Formal REVIEW_PASS did not correspond to user-visible drag lag resolution. → Investigate React bundle cost rather than only event handler batching; establish real drag baseline with profiler.
- [high] fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: Formal REVIEW_PASS focused on review process and version ledger, not on actual drag performance fix. → Decompose the engine and address React re-render cost during drag; do not approve based on synthetic tests only.
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Reviewer tested synthetic zoom/click instead of real mouse drag. → All diagram performance reviews must include real mouse drag test with profiler or frame-time evidence.

### Contour Facts
- fix/diagram-visible-version-and-large-canvas-lag-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-real-drag-performance-and-engine-decomposition-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Decisions
- Version marker must not overlay the BPMN canvas. (All diagram/UI contours)
- Version/update row should increment visibly. (Save, deploy, and version contours)
- Large god files require decomposition-first before adding new logic. (All backend and frontend code changes)
- For TO-BE format, follow only the user-provided document; no invented terms unless marked hypothesis. (All TO-BE modeling and process design contours)

### Bottlenecks
- [Diagram] Diagram drag lag remained after multiple performance contours. → next: perf/process-stage-baseline-jank-v1
- [Frontend] React bundle consumes ~95% CPU during diagram drag interactions. → next: fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1

### Validation Facts
- What are current Diagram lag bottlenecks? → PASS (7/7 PASS on full manifest with improved ranking)
- What are the latest rules for Diagram REVIEW_PASS? → PASS (7/7 PASS on full manifest with improved ranking)
- What happened in perf diagram modeler drag hot path pointermove suppression? → PASS (7/7 PASS on full manifest with improved ranking)
- How should Agent 3 review Diagram performance contours? → PASS (7/7 PASS on full manifest with improved ranking)

## Supporting Documents

### #1 — Contour Goal
- **score**: 36.919
- **path**: `/opt/processmap-test/.planning/contours/perf/process-stage-baseline-jank-v1/EXEC_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d
- **snippet**:
```
[contour: process-stage-*baseline*-*jank*-v1] Reduce systemic *React* *baseline* *jank* in *ProcessStage*/AppShell affecting *Diagram* drag responsiveness.
```

### #2 — Contour Goal
- **score**: 33.919
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/perf/process-stage-baseline-jank-v1/EXEC_REPORT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, recent_14d
- **snippet**:
```
Reduce systemic *React* *baseline* *jank* in *ProcessStage*/AppShell affecting *Diagram* drag responsiveness.
```

### #3 — React Baseline Jank Problem
- **score**: 33.543
- **path**: `/opt/processmap-test/.planning/contours/perf/process-stage-baseline-jank-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: process-stage-*baseline*-*jank*-v1] ## *React* *Baseline* *Jank* Problem
**Primary hypothesis**: *ProcessStage*, AppShell, and their hooks create a continuous render/forced-reflow loop that saturates the main thread, making drag interactions sluggish regardless of drag-specific optimizations. **Evidence**: 1. Idle *baseline* on XML tab (no *diagram* interaction): ~7 long tasks/sec. 2. Same rate on *Diagram* tab without panning. 3. Profiler shows *React* bundle dominates CPU during drag. 4. No bpmn-js functions in top 25 profiler samples. **Suspected sources** (to be confirmed by Agent 2): - *ProcessStage*…
```

### #4 — Query 3: Current Diagram Lag Bottlenecks
- **score**: 32.775
- **path**: `/opt/processmap-test/.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/VALIDATION_QUERIES.md`
- **source/category**: planning-contours / contour
- **why_matched**: heading_match, recent_14d
- **snippet**:
```
[contour: processmap-agent-rag-knowledge-layer-bootstrap-plan-v1] ## Query 3: Current *Diagram* Lag Bottlenecks
**Query:** "What are current *Diagram* lag bottlenecks?" **Expected Answer:** - *React* *baseline* *jank* (*ProcessStage* / App shell render cost) - Not bpmn-js engine based on profiler evidence - Drag lag remains unresolved (real drag hot path) - Decor overlays contribute when enabled - Large canvas lag observed on big *diagram*s **Sources That Should Be Retrieved:** - `perf/process-stage-*baseline*-*jank*-v1/*BASELINE*_*REACT*_*JANK*_PROFILE.md` - `perf/*diagram*-modeler-drag-hot-path-and-pointermove-suppre…
```

### #5 — Executor Prompt -- perf/process-stage-baseline-jank-v1
- **score**: 30.701
- **path**: `/opt/processmap-test/.planning/contours/perf/process-stage-baseline-jank-v1/EXECUTOR_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: process-stage-*baseline*-*jank*-v1] ## Executor Prompt -- perf/process-stage-*baseline*-*jank*-v1
**Role**: Agent 2 / Executor **Contour**: perf/process-stage-*baseline*-*jank*-v1 **Scope**: P0 frontend performance contour for systemic *React* *baseline* *jank*
```

### #6 — React Baseline Jank Problem
- **score**: 30.543
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/perf/process-stage-baseline-jank-v1/PLAN.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
## *React* *Baseline* *Jank* Problem
**Primary hypothesis**: *ProcessStage*, AppShell, and their hooks create a continuous render/forced-reflow loop that saturates the main thread, making drag interactions sluggish regardless of drag-specific optimizations. **Evidence**: 1. Idle *baseline* on XML tab (no *diagram* interaction): ~7 long tasks/sec. 2. Same rate on *Diagram* tab without panning. 3. Profiler shows *React* bundle dominates CPU during drag. 4. No bpmn-js functions in top 25 profiler samples. **Suspected sources** (to be confirmed by Agent 2): - *ProcessStage* continuous re-renders from polling, state…
```

### #7 — q3-current-diagram-lag ✅ PASS
- **score**: 29.874
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/VALIDATION_QUERY_RESULTS.md`
- **source/category**: planning-contours / contour
- **why_matched**: heading_match, recent_14d
- **snippet**:
```
[contour: processmap-agent-rag-bm25-manifest-search-v1] ## q3-current-*diagram*-lag ✅ PASS
**Query:** "What are current *Diagram* lag bottlenecks?" - **Terms found:** 4/7 (57%) - **Paths matched:** 2/4 (50%) - **Status:** PASS - **Notes:** Good matches on *React*, *baseline*, *jank*, *diagram* terms. Expected path patterns like *BASELINE*_*REACT*_*JANK*_PROFILE were partially found.
```

### #8 — Read List
- **score**: 29.557
- **path**: `/opt/processmap-test/.planning/contours/perf/process-stage-baseline-jank-v1/REVIEWER_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d
- **snippet**:
```
[contour: process-stage-*baseline*-*jank*-v1] 1. PLAN.md 2. EXEC_REPORT.md 3. VERSION_UPDATE_LEDGER_PROOF.md 4. *BASELINE*_*REACT*_*JANK*_PROFILE.md 5. *REACT*_RENDER_SOURCE_MAP.md 6. PROCESS_STAGE_*JANK*_ROOT_CAUSE.md 7. RUNTIME_BEFORE_AFTER.md 8. *IMPLEMENTATION*_NOTES.md 9. DECOMPOSITION_REPORT.md (if exists) 10. NEXT_BOTTLENECK_DECISION.md (if exists) 11. RUNTIME_PROOF_CHECKLIST.md
```

### #9 — Scenario B -- Idle Baseline Jank
- **score**: 29.085
- **path**: `/opt/processmap-test/.planning/contours/perf/process-stage-baseline-jank-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: process-stage-*baseline*-*jank*-v1] ## Scenario B -- Idle *Baseline* *Jank*
1. Open large *Diagram* (`wewe / Описание процессов Долгопрудный`). 2. Overlays off: `window.fpcPropertyOverlay = 0`. 3. Do nothing for 10 seconds. 4. Measure long tasks per second, *React* commits if feasible, network requests, console errors.
```

### #10 — Hypotheses
- **score**: 28.733
- **path**: `/opt/processmap-test/.planning/contours/perf/process-stage-baseline-jank-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d
- **snippet**:
```
[contour: process-stage-*baseline*-*jank*-v1] Agent 2 must rank with evidence: **H1. *ProcessStage* re-renders continuously and drags *Diagram* with it.** - Evidence: render counters / profiler. **H2. useProcessTabs or interview projection causes *baseline* long tasks.** - Evidence: profiler names / function stacks. **H3. Polling/auth/presence/version requests trigger expensive *React* shell rerender.** - Evidence: network correlated with commits/long tasks. **H4. Property panel or selected-element sync re-renders during drag.** - Evidence: counters/profiler. **H5. Toolbar/discussions/search/focus control…
```

## Required Gates
- [ ] Source/runtime truth confirmed before implementation
- [ ] Bounded contour scope respected
- [ ] No product runtime changes unless explicitly allowed
- [ ] No secrets printed in output
- [ ] No auto-mutation of BPMN XML or Product Actions
- [ ] RAG read-only boundary respected
- [ ] Runtime evidence collected for Agent 3

## Warnings
- ⚠️ User rejection ur-perf-drag-hot-path overrides formal REVIEW_PASS for perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Formal REVIEW_PASS did not correspond to user-visible drag lag resolution.
- ⚠️ User rejection ur-fix-drag-ledger-rework overrides formal REVIEW_PASS for fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: Formal REVIEW_PASS focused on review process and version ledger, not on actual drag performance fix.
- ⚠️ User rejection ur-synthetic-zoom-not-drag overrides formal REVIEW_PASS for perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Reviewer tested synthetic zoom/click instead of real mouse drag.
- ⚠️ No runtime facts matched query — runtime proof may be missing.
- ⚠️ REMINDER: Do not print secrets. Preflight output may contain paths but not credentials.

## Suggested Next Queries
- ```bash
node tools/rag/pm-rag-search.mjs "Diagram React baseline jank ProcessStage BpmnStage implementation" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "Diagram React baseline jank ProcessStage BpmnStage implementation" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role executor --contour "perf/process-stage-baseline-jank-v1" --area "Diagram React baseline jank ProcessStage BpmnStage implementation" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
