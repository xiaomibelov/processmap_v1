# ProcessMap Agent RAG Preflight

## Input
- **role**: reviewer
- **contour**: tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1
- **area/query**: review rules local launcher 4-agent same CID dry-run no product runtime
- **generated_at**: 2026-05-17T00:59:16.822Z

## Structured Facts

### Agent Rules
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)
- [critical] No PR, merge, or deploy without explicit user command (FORBIDDEN: Create PR, merge, push, or deploy without explicit user request) (REQUIRED: Wait for explicit user approval before git push, PR creation, or deploy)

### User Rejections
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Formal REVIEW_PASS did not correspond to user-visible drag lag resolution. → Investigate React bundle cost rather than only event handler batching; establish real drag baseline with profiler.
- [high] fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: Formal REVIEW_PASS focused on review process and version ledger, not on actual drag performance fix. → Decompose the engine and address React re-render cost during drag; do not approve based on synthetic tests only.
- [high] fix/diagram-real-drag-performance-and-engine-decomposition-v1: Formal REVIEW_PASS was granted but user later reported remaining issues with large-canvas lag and version marker overlay. → Relocate version marker off canvas and implement viewer-first design for large canvases.
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Reviewer tested synthetic zoom/click instead of real mouse drag. → All diagram performance reviews must include real mouse drag test with profiler or frame-time evidence.
- [medium] fix/diagram-real-drag-performance-and-engine-decomposition-v1: Version marker was placed on the BPMN canvas, interfering with diagram interaction. → Move version marker to a non-canvas UI element (e.g., header bar, badge, footer).

### Contour Facts
- feature/processmap-agent-rag-source-registry-and-index-policy-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Decisions
- RAG is a read-only suggestion and context layer. (All agents, all contours, all RAG usage)

### Bottlenecks
- [Frontend] React bundle consumes ~95% CPU during diagram drag interactions. → next: fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1

### Validation Facts
- What are the latest rules for Diagram REVIEW_PASS? → PASS (7/7 PASS on full manifest with improved ranking)
- How should Agent 3 review Diagram performance contours? → PASS (7/7 PASS on full manifest with improved ranking)

## Supporting Documents

### #1 — Agent 3 Review Gates (to be checked by Agent 3)
- **score**: 35.077
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RUNTIME_PROOF_CHECKLIST.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: processmap-*agent*-rag-bm25-manifest-search-v1] ## *Agent* 3 *Review* Gates (to be checked by *Agent* 3)
- [ ] *Review*er GSD discipline recorded - [ ] All *Agent* 2 reports read - [ ] Changed files inspected - [ ] Validation commands *run* independently - [ ] Manual searches *run* (3+ queries) - [ ] Search results verified specific - [ ] Excluded paths verified absent - [ ] *No* secret values printed - [ ] *No* *product* *run*time files changed - [ ] *No* embeddings/vector DB/package install - [ ] *REVIEW*_REPORT.md created - [ ] Verdict: *REVIEW*_PASS or CHANGES_REQUESTED
```

### #2 — Agent 2 Execution Plan
- **score**: 34.236
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: processmap-*agent*-rag-source-registry-and-index-policy-v1] ## *Agent* 2 Execution Plan
*Agent* 2 must: 1. Read PLAN.md, *RUN*TIME_NAVIGATION.md, *RUN*TIME_PROOF_CHECKLIST.md, STATE.json. 2. Read previous architecture reports for context. 3. Confirm source/*run*time truth (pwd, branch, HEAD, git status). 4. Implement: - `tools/rag/processmap-rag-sources.json` - `docs/rag/PROCESSMAP_RAG_INDEXING_POLICY.md` - `tools/rag/processmap-rag-metadata-schema.json` - `tools/rag/processmap-rag-classifier-*rules*.json` - `tools/rag/pm-rag-scan-secrets.mjs` - `tools/rag/pm-rag-build-manifest.mjs` - `tools/rag/p…
```

### #3 — Agent 3 Review Gates (to be checked by Agent 3)
- **score**: 33.985
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/RUNTIME_PROOF_CHECKLIST.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: processmap-*agent*-rag-coverage-and-validation-hardening-v1] ## *Agent* 3 *Review* Gates (to be checked by *Agent* 3)
- [ ] *Review*er GSD discipline recorded - [ ] All *Agent* 2 reports read - [ ] Changed files inspected - [ ] Validation commands *run* independently - [ ] Manual searches *run* (at least 5 queries) - [ ] Search results verified specific - [ ] Validation pass count computed and consistent - [ ] Source-balanced coverage verified - [ ] Excluded paths verified absent - [ ] *No* secret values printed - [ ] *No* *product* *run*time files changed - [ ] *No* embeddings/vector DB/package install - [ ]…
```

### #4 — Review Gates
- **score**: 33.922
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/REVIEW_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: processmap-*agent*-rag-bm25-manifest-search-v1] ## *Review* Gates
- [x] *Review*er GSD discipline recorded - [x] All *Agent* 2 reports read - [x] Changed files inspected - [x] Validation commands *run* independently - [x] Manual searches *run* (5 queries) - [x] Search results verified specific - [x] Excluded paths verified absent - [x] *No* secret values printed - [x] *No* *product* *run*time files changed - [x] *No* embeddings/vector DB/package install - [x] *REVIEW*_REPORT.md created - [x] Verdict: *REVIEW*_PASS
```

### #5 — pm-agent-mirror-report.sh
- **score**: 33.265
- **path**: `/opt/processmap-test/tools/pm-agent-mirror-report.sh`
- **source/category**: tools-src / code
- **why_matched**: path_match, heading_match, recent_14d, canonical_truth
- **snippet**:
```
## pm-*agent*-mirror-report.sh
#!/usr/bin/env bash set -euo pipefail ROOT="/opt/processmap-test" VAULT="/srv/obsidian/project-atlas" *CID*="${1:?Usage: pm-*agent*-mirror-report.sh <contour-id> [stage]}" STAGE="${2:-manual}" SRC="$ROOT/.planning/contours/$*CID*" DEST="$VAULT/ProcessMap/*Agent*Reports/$*CID*" cd "$ROOT" if [ ! -d "$SRC" ]; then echo "MIRROR_SKIPPED: contour dir missing: $SRC" exit 0 fi if [ ! -d "$VAULT" ]; then echo "MIRROR_SKIPPED: Obsidian vault missing: $VAULT" exit 0 fi mkdir -p "$DEST" copied=0 copy_if_exists() { *local* name="$1" if [ -f "$SRC/$name" ]; then cp -p "$SRC/$name" "$DEST/$…
```

### #6 — Agent 3 Review Gates (to be checked by Agent 3)
- **score**: 33.077
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/processmap-agent-rag-bm25-manifest-search-v1/RUNTIME_PROOF_CHECKLIST.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d, canonical_truth, category_role
- **snippet**:
```
## *Agent* 3 *Review* Gates (to be checked by *Agent* 3)
- [ ] *Review*er GSD discipline recorded - [ ] All *Agent* 2 reports read - [ ] Changed files inspected - [ ] Validation commands *run* independently - [ ] Manual searches *run* (3+ queries) - [ ] Search results verified specific - [ ] Excluded paths verified absent - [ ] *No* secret values printed - [ ] *No* *product* *run*time files changed - [ ] *No* embeddings/vector DB/package install - [ ] *REVIEW*_REPORT.md created - [ ] Verdict: *REVIEW*_PASS or CHANGES_REQUESTED
```

### #7 — 5. What it does NOT change
- **score**: 33.046
- **path**: `/opt/processmap-test/.planning/contours/tooling/processmap-agent3-ui-review-skill-binding-v1/EXEC_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d, category_role
- **snippet**:
```
[contour: processmap-*agent*3-ui-*review*-skill-binding-v1] ## 5. What it does *NO*T change
- *Agent* 2 (Executor) does *no*t *run* Playwright as an implementation step. - *Agent* 1 (Planner) does *no*t include Playwright *review* in execution plans. - *No* *product* code, frontend, or backend files were modified. - *No* CI/CD, deployment, or *run*time configuration changed. - *No* secrets or `.env` files touched.
```

### #8 — Agent 2 Execution Plan
- **score**: 32.236
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/processmap-agent-rag-source-registry-and-index-policy-v1/PLAN.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d, canonical_truth, category_role
- **snippet**:
```
## *Agent* 2 Execution Plan
*Agent* 2 must: 1. Read PLAN.md, *RUN*TIME_NAVIGATION.md, *RUN*TIME_PROOF_CHECKLIST.md, STATE.json. 2. Read previous architecture reports for context. 3. Confirm source/*run*time truth (pwd, branch, HEAD, git status). 4. Implement: - `tools/rag/processmap-rag-sources.json` - `docs/rag/PROCESSMAP_RAG_INDEXING_POLICY.md` - `tools/rag/processmap-rag-metadata-schema.json` - `tools/rag/processmap-rag-classifier-*rules*.json` - `tools/rag/pm-rag-scan-secrets.mjs` - `tools/rag/pm-rag-build-manifest.mjs` - `tools/rag/pm-rag-validate-policy.mjs` 5. *Run* validation commands; capture outpu…
```

### #9 — Agent 3 Review Gates (to be checked by Agent 3)
- **score**: 31.985
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/processmap-agent-rag-coverage-and-validation-hardening-v1/RUNTIME_PROOF_CHECKLIST.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d, canonical_truth, category_role
- **snippet**:
```
## *Agent* 3 *Review* Gates (to be checked by *Agent* 3)
- [ ] *Review*er GSD discipline recorded - [ ] All *Agent* 2 reports read - [ ] Changed files inspected - [ ] Validation commands *run* independently - [ ] Manual searches *run* (at least 5 queries) - [ ] Search results verified specific - [ ] Validation pass count computed and consistent - [ ] Source-balanced coverage verified - [ ] Excluded paths verified absent - [ ] *No* secret values printed - [ ] *No* *product* *run*time files changed - [ ] *No* embeddings/vector DB/package install - [ ] *REVIEW*_REPORT.md created - [ ] Verdict: *REVIEW*_PASS or CHANGES_REQUE…
```

### #10 — Review Gates
- **score**: 31.922
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/processmap-agent-rag-bm25-manifest-search-v1/REVIEW_REPORT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d, canonical_truth, category_role
- **snippet**:
```
## *Review* Gates
- [x] *Review*er GSD discipline recorded - [x] All *Agent* 2 reports read - [x] Changed files inspected - [x] Validation commands *run* independently - [x] Manual searches *run* (5 queries) - [x] Search results verified specific - [x] Excluded paths verified absent - [x] *No* secret values printed - [x] *No* *product* *run*time files changed - [x] *No* embeddings/vector DB/package install - [x] *REVIEW*_REPORT.md created - [x] Verdict: *REVIEW*_PASS
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
node tools/rag/pm-rag-search.mjs "tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role reviewer --contour "tooling/processmap-local-launcher-4-agent-apply-and-smoke-v1" --area "scope" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
