# ProcessMap Agent RAG Preflight

## Input
- **role**: reviewer
- **contour**: perf/process-stage-baseline-jank-v1
- **area/query**: Diagram performance review rules React baseline jank real drag fresh 5180 proof user rejection override
- **generated_at**: 2026-05-16T21:09:53.869Z

## Structured Facts

### Agent Rules
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)

### User Rejections
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Formal REVIEW_PASS did not correspond to user-visible drag lag resolution. → Investigate React bundle cost rather than only event handler batching; establish real drag baseline with profiler.
- [high] fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: Formal REVIEW_PASS focused on review process and version ledger, not on actual drag performance fix. → Decompose the engine and address React re-render cost during drag; do not approve based on synthetic tests only.
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Reviewer tested synthetic zoom/click instead of real mouse drag. → All diagram performance reviews must include real mouse drag test with profiler or frame-time evidence.
- [medium] fix/diagram-real-drag-performance-and-engine-decomposition-v1: Version marker was placed on the BPMN canvas, interfering with diagram interaction. → Move version marker to a non-canvas UI element (e.g., header bar, badge, footer).
- [high] fix/diagram-real-drag-performance-and-engine-decomposition-v1: Formal REVIEW_PASS was granted but user later reported remaining issues with large-canvas lag and version marker overlay. → Relocate version marker off canvas and implement viewer-first design for large canvases.

### Contour Facts
- fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-real-drag-performance-and-engine-decomposition-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-visible-version-and-large-canvas-lag-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- feature/processmap-agent-rag-source-registry-and-index-policy-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Decisions
- Version/update row should increment visibly. (Save, deploy, and version contours)

### Bottlenecks
- [Diagram] Diagram drag lag remained after multiple performance contours. → next: perf/process-stage-baseline-jank-v1

### Validation Facts
- What are the latest rules for Diagram REVIEW_PASS? → PASS (7/7 PASS on full manifest with improved ranking)
- How should Agent 3 review Diagram performance contours? → PASS (7/7 PASS on full manifest with improved ranking)
- What are current Diagram lag bottlenecks? → PASS (7/7 PASS on full manifest with improved ranking)

## Supporting Documents

### #1 — User Rejection of Previous REVIEW_PASS
- **score**: 49.426
- **path**: `/opt/processmap-test/.planning/contours/fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: *diagram*-*drag*-lag-gsd-*review*-version-ledger-rework-v1] ## *User* *Rejection* of Previous *REVIEW*_PASS
Previous contour: `fix/*diagram*-*real*-*drag*-*performance*-and-engine-decomposition-v1` - Received `*REVIEW*_PASS` from Agent 3 at `2026-05-15T23:12Z` - ***User* explicitly rejects this *REVIEW*_PASS.**
```

### #2 — Query 1: Diagram REVIEW_PASS Rules
- **score**: 49.170
- **path**: `/opt/processmap-test/.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/VALIDATION_QUERIES.md`
- **source/category**: planning-contours / contour
- **why_matched**: heading_match, recent_14d, category_role
- **snippet**:
```
[contour: processmap-agent-rag-knowledge-layer-bootstrap-plan-v1] ## Query 1: *Diagram* *REVIEW*_PASS *Rules*
**Query:** "What are the latest *rules* for *Diagram* *REVIEW*_PASS?" **Expected Answer:** - GSD *review*er discipline is mandatory - *Real* *drag* (not synthetic) is required for *diagram* perf contours - Version *proof* (build-info badge) is required - No source-only pass — must have *user*-visible/runtime *proof* - Acceptance criteria must be explicitly verified **Sources That Should Be Retrieved:** - `fix/*diagram*-*drag*-lag-gsd-*review*-version-ledger-rework-v1/*REVIEW*ER_GSD_GATE_REPORT.md` - `fix/*diagram*-*real*-d…
```

### #3 — RUNTIME_PROOF_CHECKLIST
- **score**: 47.705
- **path**: `/opt/processmap-test/.planning/contours/perf/process-stage-baseline-jank-v1/RUNTIME_PROOF_CHECKLIST.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: process-stage-*baseline*-*jank*-v1] ## RUNTIME_*PROOF*_CHECKLIST
- [ ] Agent 1 GSD discipline recorded - [ ] source/runtime truth captured - [ ] previous *drag*-hot-path non-improvement documented - [ ] *React* bundle 95% CPU finding documented - [ ] *Review*er GSD discipline required - [ ] version/update row increment planned - [ ] marker not on canvas - [ ] build-info.json verified - [ ] window.__PROCESSMAP_BUILD_INFO__ verified - [ ] large no-overlays *Diagram* selected - [ ] .fpcPropertyOverlay = 0 confirmed - [ ] idle 10s *baseline* captured - [ ] *real* mouse canvas *drag* quick *baseline* captured …
```

### #4 — User Rejection of Previous REVIEW_PASS
- **score**: 47.426
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1/PLAN.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d, canonical_truth, category_role
- **snippet**:
```
## *User* *Rejection* of Previous *REVIEW*_PASS
Previous contour: `fix/*diagram*-*real*-*drag*-*performance*-and-engine-decomposition-v1` - Received `*REVIEW*_PASS` from Agent 3 at `2026-05-15T23:12Z` - ***User* explicitly rejects this *REVIEW*_PASS.**
```

### #5 — processmap-rag-validation-queries.json
- **score**: 47.021
- **path**: `/opt/processmap-test/tools/rag/processmap-rag-validation-queries.json`
- **source/category**: tools-src / code
- **why_matched**: recent_14d, canonical_truth
- **snippet**:
```
{ "version": "1.0.0", "project": "ProcessMap", "description": "Validation queries for BM25 search index. Each query has expected terms and path patterns.", "queries": [ { "id": "q1-*diagram*-*review*-pass-*rules*", "query": "What are the latest *rules* for *Diagram* *REVIEW*_PASS?", "expected_terms": ["gsd", "*review*er", "discipline", "*real*", "*drag*", "version", "*proof*", "source", "pass"], "expected_path_patterns": ["**REVIEW*_PASS*", "**diagram**", "*AGENTS.md", "*.planning/contours/*"], "expected_answer_summary": "GSD *review*er discipline *rules* for *Diagram* contours: *real* *drag* testing, version *proof*, no source-
```

### #6 — Validation Query Plan
- **score**: 46.825
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: recent_14d, category_role
- **snippet**:
```
[contour: processmap-agent-rag-bm25-manifest-search-v1] **Fixture path:** `tools/rag/processmap-rag-validation-queries.json` Queries (7 from architecture contour + optional bonus): 1. ***Diagram* *REVIEW*_PASS *Rules*** - Query: `"What are the latest *rules* for *Diagram* *REVIEW*_PASS?"` - Expected terms: `GSD *review*er discipline`, `*real* *drag*`, `version *proof*`, `no source-only pass` - Expected paths: recent *Diagram* *drag*/*jank* contour reports, architecture RAG plan, AGENTS.md 2. **Perf Contour History — *Drag* Hot Path** - Query: `"What happened in perf/*diagram*-modeler-*drag*-hot-path-and-pointermove-suppressi…
```

### #7 — Validation Query Plan
- **score**: 46.825
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/processmap-agent-rag-bm25-manifest-search-v1/PLAN.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: recent_14d, canonical_truth, category_role
- **snippet**:
```
**Fixture path:** `tools/rag/processmap-rag-validation-queries.json` Queries (7 from architecture contour + optional bonus): 1. ***Diagram* *REVIEW*_PASS *Rules*** - Query: `"What are the latest *rules* for *Diagram* *REVIEW*_PASS?"` - Expected terms: `GSD *review*er discipline`, `*real* *drag*`, `version *proof*`, `no source-only pass` - Expected paths: recent *Diagram* *drag*/*jank* contour reports, architecture RAG plan, AGENTS.md 2. **Perf Contour History — *Drag* Hot Path** - Query: `"What happened in perf/*diagram*-modeler-*drag*-hot-path-and-pointermove-suppression-v1?"` - Expected terms: `v1.0.129`, `metrics did not 
```

### #8 — RUNTIME_PROOF_CHECKLIST
- **score**: 45.705
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/perf/process-stage-baseline-jank-v1/RUNTIME_PROOF_CHECKLIST.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d, canonical_truth, category_role
- **snippet**:
```
## RUNTIME_*PROOF*_CHECKLIST
- [ ] Agent 1 GSD discipline recorded - [ ] source/runtime truth captured - [ ] previous *drag*-hot-path non-improvement documented - [ ] *React* bundle 95% CPU finding documented - [ ] *Review*er GSD discipline required - [ ] version/update row increment planned - [ ] marker not on canvas - [ ] build-info.json verified - [ ] window.__PROCESSMAP_BUILD_INFO__ verified - [ ] large no-overlays *Diagram* selected - [ ] .fpcPropertyOverlay = 0 confirmed - [ ] idle 10s *baseline* captured - [ ] *real* mouse canvas *drag* quick *baseline* captured - [ ] *real* mouse canvas *drag* stepped basel…
```

### #9 — Fixture Updates
- **score**: 45.416
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: recent_14d, category_role
- **snippet**:
```
[contour: processmap-agent-rag-coverage-and-validation-hardening-v1] Update `tools/rag/processmap-rag-validation-queries.json`: 1. **Add `query_type`** to each query: - `contour_lookup` (q1, q2, q3, q7) - `policy_lookup` (q4, q5) - `runtime_lookup` (q6) - `*review*_*rules*` (q1, q7) - `current_bottleneck` (q3) 2. **Refine expected_terms** to be more precise and less generic: - q1: add `*diagram*`, `*review*er`, `discipline`, `*real*`, `*drag*`, `version`, `*proof*`, `source`, `pass` - q2: add `v1.0.129`, `*react*`, `bundle`, `95`, `bpmn`, `0.5`, `*baseline*`, `*jank*` - q3: add `*react*`, `*baseline*`, `*jank*`, `proce…
```

### #10 — Fixture Updates
- **score**: 45.416
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/PLAN.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: recent_14d, canonical_truth, category_role
- **snippet**:
```
Update `tools/rag/processmap-rag-validation-queries.json`: 1. **Add `query_type`** to each query: - `contour_lookup` (q1, q2, q3, q7) - `policy_lookup` (q4, q5) - `runtime_lookup` (q6) - `*review*_*rules*` (q1, q7) - `current_bottleneck` (q3) 2. **Refine expected_terms** to be more precise and less generic: - q1: add `*diagram*`, `*review*er`, `discipline`, `*real*`, `*drag*`, `version`, `*proof*`, `source`, `pass` - q2: add `v1.0.129`, `*react*`, `bundle`, `95`, `bpmn`, `0.5`, `*baseline*`, `*jank*` - q3: add `*react*`, `*baseline*`, `*jank*`, `processstage`, `app`, `shell`, `unresolved` - q4: add `secrets`, `auto`, `
```

## Required Gates
- [ ] Reviewer GSD discipline section present in REVIEW_REPORT.md
- [ ] Fresh runtime proof collected (5180/8088)
- [ ] Exact user scenario reproduced
- [ ] Before/after evidence collected
- [ ] User rejection override checked
- [ ] No REVIEW_PASS if user-visible scenario still fails
- [ ] Product runtime unchanged without scope

## Warnings
- ⚠️ User rejection ur-perf-drag-hot-path overrides formal REVIEW_PASS for perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Formal REVIEW_PASS did not correspond to user-visible drag lag resolution.
- ⚠️ User rejection ur-fix-drag-ledger-rework overrides formal REVIEW_PASS for fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: Formal REVIEW_PASS focused on review process and version ledger, not on actual drag performance fix.
- ⚠️ User rejection ur-synthetic-zoom-not-drag overrides formal REVIEW_PASS for perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Reviewer tested synthetic zoom/click instead of real mouse drag.
- ⚠️ User rejection ur-version-marker-on-canvas overrides formal REVIEW_PASS for fix/diagram-real-drag-performance-and-engine-decomposition-v1: Version marker was placed on the BPMN canvas, interfering with diagram interaction.
- ⚠️ User rejection ur-fix-real-drag-engine overrides formal REVIEW_PASS for fix/diagram-real-drag-performance-and-engine-decomposition-v1: Formal REVIEW_PASS was granted but user later reported remaining issues with large-canvas lag and version marker overlay.
- ⚠️ No runtime facts matched query — runtime proof may be missing.
- ⚠️ REMINDER: Do not print secrets. Preflight output may contain paths but not credentials.

## Suggested Next Queries
- ```bash
node tools/rag/pm-rag-search.mjs "perf/process-stage-baseline-jank-v1" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "perf/process-stage-baseline-jank-v1" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role reviewer --contour "perf/process-stage-baseline-jank-v1" --area "scope" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
