# ProcessMap Agent RAG Preflight

## Input
- **role**: planner
- **contour**: perf/process-stage-baseline-jank-v1
- **area/query**: Diagram performance React baseline jank ProcessStage App shell drag lag
- **generated_at**: 2026-05-16T20:02:26.747Z

## Structured Facts

### Agent Rules
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)

### User Rejections
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Formal REVIEW_PASS did not correspond to user-visible drag lag resolution. → Investigate React bundle cost rather than only event handler batching; establish real drag baseline with profiler.
- [high] fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: Formal REVIEW_PASS focused on review process and version ledger, not on actual drag performance fix. → Decompose the engine and address React re-render cost during drag; do not approve based on synthetic tests only.
- [high] fix/diagram-real-drag-performance-and-engine-decomposition-v1: Formal REVIEW_PASS was granted but user later reported remaining issues with large-canvas lag and version marker overlay. → Relocate version marker off canvas and implement viewer-first design for large canvases.
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Reviewer tested synthetic zoom/click instead of real mouse drag. → All diagram performance reviews must include real mouse drag test with profiler or frame-time evidence.
- [medium] fix/diagram-real-drag-performance-and-engine-decomposition-v1: Version marker was placed on the BPMN canvas, interfering with diagram interaction. → Move version marker to a non-canvas UI element (e.g., header bar, badge, footer).

### Contour Facts
- perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-real-drag-performance-and-engine-decomposition-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-visible-version-and-large-canvas-lag-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Decisions
- Version/update row should increment visibly. (Save, deploy, and version contours)
- Version marker must not overlay the BPMN canvas. (All diagram/UI contours)
- Large god files require decomposition-first before adding new logic. (All backend and frontend code changes)

### Bottlenecks
- [Diagram] Diagram drag lag remained after multiple performance contours. → next: perf/process-stage-baseline-jank-v1
- [Frontend] React bundle consumes ~95% CPU during diagram drag interactions. → next: fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1

### Validation Facts
- What are current Diagram lag bottlenecks? → PASS (7/7 PASS on full manifest with improved ranking)
- What happened in perf diagram modeler drag hot path pointermove suppression? → PASS (7/7 PASS on full manifest with improved ranking)
- How should Agent 3 review Diagram performance contours? → PASS (7/7 PASS on full manifest with improved ranking)

## Supporting Documents

### #1 — Query 3: Current Diagram Lag Bottlenecks
- **score**: 52.696
- **path**: `/opt/processmap-test/.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/VALIDATION_QUERIES.md`
- **source/category**: planning-contours / contour
- **why_matched**: heading_match, recent_14d
- **snippet**:
```
[contour: processmap-agent-rag-knowledge-layer-bootstrap-plan-v1] ## Query 3: Current *Diagram* *Lag* Bottlenecks
**Query:** "What are current *Diagram* *lag* bottlenecks?" **Expected Answer:** - *React* *baseline* *jank* (*ProcessStage* / *App* *shell* render cost) - Not bpmn-js engine based on profiler evidence - *Drag* *lag* remains unresolved (real *drag* hot path) - Decor overlays contribute when enabled - Large canvas *lag* observed on big *diagram*s **Sources That Should Be Retrieved:** - `perf/process-stage-*baseline*-*jank*-v1/*BASELINE*_*REACT*_*JANK*_PROFILE.md` - `perf/*diagram*-modeler-*drag*-hot-path-and-pointermove-suppre…
```

### #2 — Contour Goal
- **score**: 42.600
- **path**: `/opt/processmap-test/.planning/contours/perf/process-stage-baseline-jank-v1/EXEC_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d
- **snippet**:
```
[contour: process-stage-*baseline*-*jank*-v1] Reduce systemic *React* *baseline* *jank* in *ProcessStage*/*App**Shell* affecting *Diagram* *drag* responsiveness.
```

### #3 — Contour Goal
- **score**: 39.600
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/perf/process-stage-baseline-jank-v1/EXEC_REPORT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, recent_14d
- **snippet**:
```
Reduce systemic *React* *baseline* *jank* in *ProcessStage*/*App**Shell* affecting *Diagram* *drag* responsiveness.
```

### #4 — H6: React/session shell triggers unrelated updates
- **score**: 39.256
- **path**: `/opt/processmap-test/.planning/contours/audit/diagram-post-optimization-runtime-profile-v1/RESIDUAL_BOTTLENECKS.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *diagram*-post-optimization-runtime-profile-v1] ## H6: *React*/session *shell* triggers unrelated updates
- **Evidence**: Scenario B tab switch measured 4–6 seconds per cycle (Analysis↔*Diagram* and XML↔*Diagram*). DOM remained stable at 8,025, so no remount, but the time to visible is high. - **Conclusion**: `*ProcessStage*.jsx` + `*App*.jsx` *shell* churn is a measurable contributor to perceived *lag* on tab switch. - **Likely subsystem**: `*ProcessStage*.jsx` state orchestration, `use*ProcessStage*LocalState`, header/sidebar re-renders.
```

### #5 — Validation Query Plan
- **score**: 39.156
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/PLAN.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: recent_14d
- **snippet**:
```
Agent 2 must prepare test queries and expected answers. Minimum set: 1. **"What are the latest rules for *Diagram* REVIEW_PASS?"** Expected: GSD reviewer discipline; real *drag* required; version proof required; no source-only pass. 2. **"What h*app*ened in perf/*diagram*-modeler-*drag*-hot-path-and-pointermove-suppression-v1?"** Expected: v1.0.129; metrics no improvement; *React* bundle 95%; next perf/process-stage-*baseline*-*jank*-v1. 3. **"What are current *Diagram* *lag* bottlenecks?"** Expected: *React* *baseline* *jank*; *ProcessStage*/*App* *shell*; not bpmn-js engine based on profiler; *drag* still unresolved. 4. **"W
```

### #6 — Validation Query Plan
- **score**: 39.156
- **path**: `/opt/processmap-test/.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: recent_14d
- **snippet**:
```
[contour: processmap-agent-rag-knowledge-layer-bootstrap-plan-v1] Agent 2 must prepare test queries and expected answers. Minimum set: 1. **"What are the latest rules for *Diagram* REVIEW_PASS?"** Expected: GSD reviewer discipline; real *drag* required; version proof required; no source-only pass. 2. **"What h*app*ened in perf/*diagram*-modeler-*drag*-hot-path-and-pointermove-suppression-v1?"** Expected: v1.0.129; metrics no improvement; *React* bundle 95%; next perf/process-stage-*baseline*-*jank*-v1. 3. **"What are current *Diagram* *lag* bottlenecks?"** Expected: *React* *baseline* *jank*; *ProcessStage*/*App* *shell*; no…
```

### #7 — Hypotheses
- **score**: 38.104
- **path**: `/opt/processmap-test/.planning/contours/perf/process-stage-baseline-jank-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d
- **snippet**:
```
[contour: process-stage-*baseline*-*jank*-v1] Agent 2 must rank with evidence: **H1. *ProcessStage* re-renders continuously and *drag*s *Diagram* with it.** - Evidence: render counters / profiler. **H2. useProcessTabs or interview projection causes *baseline* long tasks.** - Evidence: profiler names / function stacks. **H3. Polling/auth/presence/version requests trigger expensive *React* *shell* rerender.** - Evidence: network correlated with commits/long tasks. **H4. Property panel or selected-element sync re-renders during *drag*.** - Evidence: counters/profiler. **H5. Toolbar/discussions/search/focus control…
```

### #8 — STATE
- **score**: 38.088
- **path**: `/opt/processmap-test/.planning/contours/perf/process-stage-baseline-jank-v1/STATE.json`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d
- **snippet**:
```
[contour: process-stage-*baseline*-*jank*-v1] { "contour_id": "perf/process-stage-*baseline*-*jank*-v1", "status": "READY_FOR_EXECUTION", "role": "Agent 1 / Planner", "scope": "P0 frontend *performance* contour for systemic *React* *baseline* *jank* in *ProcessStage*/*App* *shell* affecting *Diagram* *drag*, with version ledger update and strict GSD runtime review on 5180", "gsd_required": true, "reviewer_gsd_required": true, "decomposition_first_required": true, "agent1_product_code_changes_allowed": false, "agent2_frontend_version_update_ledger_allowed": true, "agent2_frontend_*react*_*jank*_fix_allowed": true, "agent2_f…
```

### #9 — q3-current-diagram-lag ✅ PASS
- **score**: 36.957
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/VALIDATION_QUERY_RESULTS.md`
- **source/category**: planning-contours / contour
- **why_matched**: heading_match, recent_14d
- **snippet**:
```
[contour: processmap-agent-rag-bm25-manifest-search-v1] ## q3-current-*diagram*-*lag* ✅ PASS
**Query:** "What are current *Diagram* *lag* bottlenecks?" - **Terms found:** 4/7 (57%) - **Paths matched:** 2/4 (50%) - **Status:** PASS - **Notes:** Good matches on *React*, *baseline*, *jank*, *diagram* terms. Expected path patterns like *BASELINE*_*REACT*_*JANK*_PROFILE were partially found.
```

### #10 — Handoff / Next Contour
- **score**: 36.579
- **path**: `/opt/processmap-test/.planning/contours/perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1/REVIEW_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d
- **snippet**:
```
[contour: *diagram*-modeler-*drag*-hot-path-and-pointermove-suppression-v1] - **User-visible *drag* *lag* remains** due to systemic *baseline* *jank*. - **Recommended next contour**: `perf/process-stage-*baseline*-*jank*-v1` - **Scope of next contour**: Profile *React* render trees (*React* DevTools Profiler) to identify the continuous render/forced-reflow loop causing ~7 long tasks/sec even when idle. ---
```

## Required Gates
- [ ] GSD discipline recorded
- [ ] Source/runtime truth captured
- [ ] Bounded scope defined in PLAN.md
- [ ] Acceptance criteria defined
- [ ] User rejection facts reviewed
- [ ] No product code written by Agent 1
- [ ] No merge/deploy/PR without explicit approval

## Warnings
- ⚠️ User rejection ur-perf-drag-hot-path overrides formal REVIEW_PASS for perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Formal REVIEW_PASS did not correspond to user-visible drag lag resolution.
- ⚠️ User rejection ur-fix-drag-ledger-rework overrides formal REVIEW_PASS for fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: Formal REVIEW_PASS focused on review process and version ledger, not on actual drag performance fix.
- ⚠️ User rejection ur-fix-real-drag-engine overrides formal REVIEW_PASS for fix/diagram-real-drag-performance-and-engine-decomposition-v1: Formal REVIEW_PASS was granted but user later reported remaining issues with large-canvas lag and version marker overlay.
- ⚠️ User rejection ur-synthetic-zoom-not-drag overrides formal REVIEW_PASS for perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Reviewer tested synthetic zoom/click instead of real mouse drag.
- ⚠️ User rejection ur-version-marker-on-canvas overrides formal REVIEW_PASS for fix/diagram-real-drag-performance-and-engine-decomposition-v1: Version marker was placed on the BPMN canvas, interfering with diagram interaction.
- ⚠️ No runtime facts matched query — runtime proof may be missing.
- ⚠️ REMINDER: Do not print secrets. Preflight output may contain paths but not credentials.

## Suggested Next Queries
- ```bash
node tools/rag/pm-rag-search.mjs "Diagram performance React baseline jank ProcessStage App shell drag lag" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "Diagram performance React baseline jank ProcessStage App shell drag lag" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "perf/process-stage-baseline-jank-v1" --area "Diagram performance React baseline jank ProcessStage App shell drag lag" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
