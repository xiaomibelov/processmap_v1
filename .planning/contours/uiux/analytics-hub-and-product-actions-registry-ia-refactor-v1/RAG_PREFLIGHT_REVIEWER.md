# ProcessMap Agent RAG Preflight

## Input
- **role**: reviewer
- **contour**: uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1
- **area/query**: ProcessMap runtime review context
- **generated_at**: 2026-05-17T20:30:41.608Z

## Structured Facts

### Agent Rules
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)

### User Rejections
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Formal REVIEW_PASS did not correspond to user-visible drag lag resolution. → Investigate React bundle cost rather than only event handler batching; establish real drag baseline with profiler.
- [high] fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: Formal REVIEW_PASS focused on review process and version ledger, not on actual drag performance fix. → Decompose the engine and address React re-render cost during drag; do not approve based on synthetic tests only.
- [high] fix/diagram-real-drag-performance-and-engine-decomposition-v1: Formal REVIEW_PASS was granted but user later reported remaining issues with large-canvas lag and version marker overlay. → Relocate version marker off canvas and implement viewer-first design for large canvases.
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Reviewer tested synthetic zoom/click instead of real mouse drag. → All diagram performance reviews must include real mouse drag test with profiler or frame-time evidence.
- [medium] fix/diagram-real-drag-performance-and-engine-decomposition-v1: Version marker was placed on the BPMN canvas, interfering with diagram interaction. → Move version marker to a non-canvas UI element (e.g., header bar, badge, footer).

### Contour Facts
- perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-source-registry-and-index-policy-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Decisions
- RAG is a read-only suggestion and context layer. (All agents, all contours, all RAG usage)
- RAG must not auto-mutate any file. (All RAG tooling, all agent preflight integrations)
- RAG must not write or mutate BPMN XML. (All RAG contours, all agent contexts)

### Validation Facts
- What are the latest rules for Diagram REVIEW_PASS? → PASS (7/7 PASS on full manifest with improved ranking)
- How should Agent 3 review Diagram performance contours? → PASS (7/7 PASS on full manifest with improved ranking)
- What is current ProcessMap test runtime? → PASS (7/7 PASS on full manifest with improved ranking)

## Supporting Documents

### #1 — Top Results
- **score**: 24.249
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_SEARCH_VALIDATION_RESULTS.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d, category_role
- **snippet**:
```
[contour: *processmap*-agent-rag-bm25-manifest-search-v1] - **#1** `/opt/*processmap*-test/.planning/contours/perf/diagram-svg-css-repaint-reduction-v1/*RUNTIME*_PROOF_CHECKLIST.md` — score 19.373 > - [x] GSD discipline recorded - [x] Previous *Diagram* *performance* *contours* **review**ed - [x] Source/*runtime* truth ca… - **#2** `/opt/*processmap*-test/.planning/contours/tooling/*processmap*-agent3-ui-*review*-skill-binding-v1/EXEC_REPORT.md` — score 18.991 > 1. *Agent* 2 completes implementation and writes `EXEC_REPORT.md`. 2. *Agent* 3 reads the skill + binding, then opens th… - **#3** `/opt/*processmap*-t…
```

### #2 — Agent 2 Execution Plan
- **score**: 22.519
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d, category_role
- **snippet**:
```
[contour: *processmap*-agent-rag-source-registry-and-index-policy-v1] Agent 2 must: 1. Read PLAN.md, *RUNTIME*_NAVIGATION.md, *RUNTIME*_PROOF_CHECKLIST.md, STATE.json. 2. Read previous architecture reports for *context*. 3. Confirm source/*runtime* truth (pwd, branch, HEAD, git status). 4. Implement: - `tools/rag/*processmap*-rag-sources.json` - `docs/rag/*PROCESSMAP*_RAG_INDEXING_POLICY.md` - `tools/rag/*processmap*-rag-metadata-schema.json` - `tools/rag/*processmap*-rag-classifier-rules.json` - `tools/rag/pm-rag-scan-secrets.mjs` - `tools/rag/pm-rag-build-manifest.mjs` - `tools/rag/pm-rag-validate-policy.mjs`…
```

### #3 — Low-Priority (review before including)
- **score**: 21.933
- **path**: `/opt/processmap-test/.planning/contours/tooling/project-atlas-server-docs-import-and-triage-v1/RAG_SOURCE_CANDIDATES.md`
- **source/category**: planning-contours / contour
- **why_matched**: path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: project-atlas-server-docs-import-and-triage-v1] ## Low-Priority (*review* before including)
9. `*ProcessMap*/Backlog/EPICS/Closed/` — closed epics (historical *context*) 10. `*ProcessMap*/Evidence/` — test evidence (may be too granular)
```

### #4 — Agent 3 — Reviewer Prompt for UI/Runtime Contours
- **score**: 21.470
- **path**: `/opt/processmap-test/.planning/contours/tooling/processmap-agent3-ui-review-skill-binding-v1/REVIEWER_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: *processmap*-agent3-ui-*review*-skill-binding-v1] ## Agent 3 — *Review*er Prompt for UI/*Runtime* Contours
> **Invocation *context*:** Agent 3 (*Review*er) receives this prompt when a UI/*runtime* contour is ready for *review*. ---
```

### #5 — Inputs to Read
- **score**: 21.154
- **path**: `/opt/processmap-test/.planning/contours/audit/diagram-post-optimization-runtime-profile-v1/REVIEWER_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d, category_role
- **snippet**:
```
[contour: diagram-post-optimization-*runtime*-profile-v1] 1. `PLAN.md` 2. `EXECUTOR_PROMPT.md` 3. `*RUNTIME*_NAVIGATION.md` 4. `*RUNTIME*_PROOF_CHECKLIST.md` 5. `STATE.json` 6. Agent 2 outputs: - `EXEC_REPORT.md` - `POST_OPTIMIZATION_PROFILE_REPORT.md` - `*RUNTIME*_EVIDENCE.md` - `SOURCE_MAP.md` - `RESIDUAL_BOTTLENECKS.md` - `NEXT_CONTOUR_DECISION_MATRIX.md` - `READY_FOR_*REVIEW*` 7. Evidence files in `evidence/` 8. Previous *review* reports from the 10 completed contours (for regression *context*)
```

### #6 — Project Atlas (Obsidian vault)
- **score**: 20.414
- **path**: `/opt/processmap-test/.planning/contours/tooling/processmap-agent3-ui-review-skill-binding-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d, category_role
- **snippet**:
```
[contour: *processmap*-agent3-ui-*review*-skill-binding-v1] 1. `/srv/obsidian/project-atlas/*ProcessMap*/Prompts/*PROCESSMAP*_AGENT3_UI_*REVIEW*_SKILL.md` - *Review*er rubric for *ProcessMap* UI/*runtime* *review*. 2. `/srv/obsidian/project-atlas/*ProcessMap*/Prompts/*PROCESSMAP*_AGENT3_PLAYWRIGHT_*REVIEW*_BINDING.md` - Binding between Agent 3 and Playwright MCP.
```

### #7 — B. Browser Runtime Review (Playwright Fresh Context)
- **score**: 20.308
- **path**: `/opt/processmap-test/.planning/contours/fix/diagram-5180-version-proof-and-canvas-lag-regression-v1/REVIEW_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: diagram-5180-version-proof-and-canvas-lag-regression-v1] ## B. Browser *Runtime* *Review* (Playwright Fresh *Context*)
- Navigated to `http://clearvestnic.ru:5180/?cb=1778874300` - `window.__*PROCESSMAP*_BUILD_INFO__` verified: - `sha`: `a9a9d9c5f468d9da63415306da6d34dcd605aa0d` ✅ - `timestamp`: `2026-05-15T20:03:56.411Z` ✅ - `contourId`: `fix/diagram-5180-version-proof-and-canvas-lag-regression-v1` ✅ - UI badge visible: `a9a9d9c | 2026-05-15T20:03:56.411Z` ✅ - Auth present (admin user, workspace and project loaded) ✅ - Opened session: `wewe` in `Описание процессов Долгопрудный` ✅
```

### #8 — B. Browser Runtime Review (Playwright Fresh Context)
- **score**: 19.894
- **path**: `/opt/processmap-test/.planning/contours/fix/diagram-5180-version-proof-and-canvas-lag-regression-v1/REVIEWER_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: diagram-5180-version-proof-and-canvas-lag-regression-v1] ## B. Browser *Runtime* *Review* (Playwright Fresh *Context*)
1. Open fresh browser *context*. 2. Navigate to `http://clearvestnic.ru:5180/?cb=<timestamp>`. 3. Verify `window.__*PROCESSMAP*_BUILD_INFO__` exists and shows: - `sha` or `shaShort` matching source HEAD. - `timestamp` within reasonable window of build/deploy. - `contourId` matching this contour. 4. Take screenshot of UI marker if visible. 5. Authenticate (token injection or dev bypass). 6. Open Diagram session (`wewe` / `Описание процессов Долгопрудный` known baseline).
```

### #9 — Reviewer GSD Discipline
- **score**: 19.862
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/REVIEW_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d, category_role
- **snippet**:
```
[contour: *processmap*-agent-rag-source-registry-and-index-policy-v1] ## *Review*er GSD Discipline
| Check | Result | |-------|--------| | `command -v gsd` | `/opt/*processmap*-test/bin/gsd` (found) | | `command -v gsd-sdk` | `/opt/*processmap*-test/bin/gsd-sdk` (found) | | `*PROCESSMAP*_GSD_WRAPPER_FOUND` | Yes | | `CODEX_GSD_TOOLS_FOUND` | Yes | | **Mode** | `GSD_*PROCESSMAP*_WRAPPER_*REVIEW*` | **Source/*runtime* truth at *review* time:** - `pwd`: `/opt/*processmap*-test` - `git branch`: `fix/lockfile-sync-test` - `HEAD`: `a9a9d9c5f468d9da63415306da6d34dcd605aa0d` - `origin/main`: `d805e1c64c1107b9e3fe6854e031…
```

### #10 — Agent 3 Review Plan
- **score**: 19.838
- **path**: `/opt/processmap-test/.planning/contours/fix/diagram-5180-version-proof-and-canvas-lag-regression-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: diagram-5180-version-proof-and-canvas-lag-regression-v1] ## Agent 3 *Review* Plan
1. Read all reports and PLAN.md. 2. Verify source HEAD. 3. Verify build marker exists in source (generated file or build script). 4. Verify marker from 5180 via `curl`. 5. Open fresh browser *context* (Playwright). 6. Navigate to cache-busted 5180 URL. 7. Verify `window.__*PROCESSMAP*_BUILD_INFO__` or UI marker. 8. Open Diagram session. 9. Check no repeated load cycles. 10. Check tab switch. 11. Check pan/zoom. 12. Check selection/property panel. 13. Check network PUT/PATCH/versions. 14. Check console errors.…
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
- ⚠️ User rejection ur-fix-real-drag-engine overrides formal REVIEW_PASS for fix/diagram-real-drag-performance-and-engine-decomposition-v1: Formal REVIEW_PASS was granted but user later reported remaining issues with large-canvas lag and version marker overlay.
- ⚠️ User rejection ur-synthetic-zoom-not-drag overrides formal REVIEW_PASS for perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Reviewer tested synthetic zoom/click instead of real mouse drag.
- ⚠️ User rejection ur-version-marker-on-canvas overrides formal REVIEW_PASS for fix/diagram-real-drag-performance-and-engine-decomposition-v1: Version marker was placed on the BPMN canvas, interfering with diagram interaction.
- ⚠️ No runtime facts matched query — runtime proof may be missing.
- ⚠️ REMINDER: Do not print secrets. Preflight output may contain paths but not credentials.

## Suggested Next Queries
- ```bash
node tools/rag/pm-rag-search.mjs "ProcessMap runtime review context" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "ProcessMap runtime review context" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role reviewer --contour "uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1" --area "ProcessMap runtime review context" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
