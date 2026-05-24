# ProcessMap Agent RAG Preflight

## Input
- **role**: reviewer
- **contour**: tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1
- **area/query**: tooling launcher review rules same contour id agent scripts no product runtime changes no secrets
- **generated_at**: 2026-05-16T19:33:12.190Z

## Structured Facts

### Agent Rules
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)

### User Rejections
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Formal REVIEW_PASS did not correspond to user-visible drag lag resolution. → Investigate React bundle cost rather than only event handler batching; establish real drag baseline with profiler.
- [high] fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: Formal REVIEW_PASS focused on review process and version ledger, not on actual drag performance fix. → Decompose the engine and address React re-render cost during drag; do not approve based on synthetic tests only.
- [high] fix/diagram-real-drag-performance-and-engine-decomposition-v1: Formal REVIEW_PASS was granted but user later reported remaining issues with large-canvas lag and version marker overlay. → Relocate version marker off canvas and implement viewer-first design for large canvases.
- [critical] perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: Reviewer tested synthetic zoom/click instead of real mouse drag. → All diagram performance reviews must include real mouse drag test with profiler or frame-time evidence.
- [medium] fix/diagram-real-drag-performance-and-engine-decomposition-v1: Version marker was placed on the BPMN canvas, interfering with diagram interaction. → Move version marker to a non-canvas UI element (e.g., header bar, badge, footer).

### Contour Facts
- feature/processmap-agent-rag-source-registry-and-index-policy-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-bm25-manifest-search-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-coverage-and-validation-hardening-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false

### Decisions
- RAG must not auto-mutate any file. (All RAG tooling, all agent preflight integrations)
- RAG is a read-only suggestion and context layer. (All agents, all contours, all RAG usage)

### Validation Facts
- What are the latest rules for Diagram REVIEW_PASS? → PASS (7/7 PASS on full manifest with improved ranking)

## Supporting Documents

### #1 — 8. Product Code Impact Review
- **score**: 43.604
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/REVIEWER_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[*contour*: processmap-*agent*-rag-source-registry-and-index-policy-v1] ## 8. *Product* Code Impact *Review*
- [ ] *No* frontend *runtime* files changed (except possibly *tooling*-only *scripts*). - [ ] *No* backend API files changed. - [ ] *No* `package.json`, `requirements.txt`, or lockfile *changes*. - [ ] *No* `.env` files modified.
```

### #2 — STATE
- **score**: 43.291
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/STATE.json`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d, category_role
- **snippet**:
```
[*contour*: processmap-*agent*-rag-source-registry-and-index-policy-v1] { "*contour*_*id*": "feature/processmap-*agent*-rag-source-registry-and-index-policy-v1", "status": "READY_FOR_EXECUTION", "role": "*Agent* 1 / Planner", "scope": "implementation of read-only ProcessMap *Agent* RAG source registry, indexing policy, *secrets* scanner, classifier *rules*, metadata schema, and sample manifest *tooling*", "gsd_required": true, "*review*er_gsd_required": true, "previous_architecture_*contour*": "architecture/processmap-*agent*-rag-k*no*wledge-layer-bootstrap-plan-v1", "*agent*1_*product*_code_*changes*_allowed": false, "*agent*2_…
```

### #3 — Option 4 — Wire Codex-local `gsd-tools.cjs` into Agent Scripts
- **score**: 41.950
- **path**: `/opt/processmap-test/.planning/contours/tooling/gsd-availability-root-cause-diagnostic-v1/REPAIR_OPTIONS.md`
- **source/category**: planning-contours / contour
- **why_matched**: path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[*contour*: gsd-availability-root-cause-diag*no*stic-v1] ## Option 4 — Wire Codex-local `gsd-tools.cjs` into *Agent* *Scripts*
What *changes*: update ProcessMap *agent* *launcher* *scripts* to detect `/root/.codex/get-shit-done/bin/gsd-tools.cjs`, run safe GSD queries through `*no*de`, and pass the detected GSD mode/tool path into *Agent* 1's prompt. Pros: - *No* package install required. - Uses the GSD *tooling* that actually exists on the server. - Can keep repair scoped to *tooling* *scripts*. Cons: - Requires defining a small adapter contract because `gsd-tools.cjs` is *no*t the *same* command as broken `gsd-sdk` symlink…
```

### #4 — Option 4 — Wire Codex-local `gsd-tools.cjs` into Agent Scripts
- **score**: 41.950
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/tooling/gsd-availability-root-cause-diagnostic-v1/REPAIR_OPTIONS.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d, canonical_truth, category_role
- **snippet**:
```
## Option 4 — Wire Codex-local `gsd-tools.cjs` into *Agent* *Scripts*
What *changes*: update ProcessMap *agent* *launcher* *scripts* to detect `/root/.codex/get-shit-done/bin/gsd-tools.cjs`, run safe GSD queries through `*no*de`, and pass the detected GSD mode/tool path into *Agent* 1's prompt. Pros: - *No* package install required. - Uses the GSD *tooling* that actually exists on the server. - Can keep repair scoped to *tooling* *scripts*. Cons: - Requires defining a small adapter contract because `gsd-tools.cjs` is *no*t the *same* command as broken `gsd-sdk` symlink. - Kimi still will *no*t automatically k*no*w Codex skil…
```

### #5 — Hard Rules
- **score**: 41.683
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/EXECUTOR_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[*contour*: processmap-*agent*-rag-source-registry-and-index-policy-v1] ## Hard *Rules*
- ***No* *product* *runtime* *changes***: Do *no*t modify frontend/src files that affect UI behavior. Do *no*t modify backend app code that affects API behavior. - ***No* package install**: Do *no*t run `npm install`, `pip install`, or equivalent. Use only built-ins. - ***No* embeddings/vector DB**: Do *no*t generate embeddings or start a vector database. - ***No* *secrets* printed**: Scanner reports must show path+rule+severity only. Never log secret values. - ***No* auto-mutation**: *Scripts* are read-only. *No* file writes outs*id*e *contour* …
```

### #6 — 8. Product Code Impact Review
- **score**: 41.604
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/processmap-agent-rag-source-registry-and-index-policy-v1/REVIEWER_PROMPT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d, canonical_truth, category_role
- **snippet**:
```
## 8. *Product* Code Impact *Review*
- [ ] *No* frontend *runtime* files changed (except possibly *tooling*-only *scripts*). - [ ] *No* backend API files changed. - [ ] *No* `package.json`, `requirements.txt`, or lockfile *changes*. - [ ] *No* `.env` files modified.
```

### #7 — Agent 2 Execution Plan
- **score**: 41.233
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[*contour*: processmap-*agent*-rag-source-registry-and-index-policy-v1] ## *Agent* 2 Execution Plan
*Agent* 2 must: 1. Read PLAN.md, *RUNTIME*_NAVIGATION.md, *RUNTIME*_PROOF_CHECKLIST.md, STATE.json. 2. Read previous architecture reports for context. 3. Confirm source/*runtime* truth (pwd, branch, HEAD, git status). 4. Implement: - `tools/rag/processmap-rag-sources.json` - `docs/rag/PROCESSMAP_RAG_INDEXING_POLICY.md` - `tools/rag/processmap-rag-metadata-schema.json` - `tools/rag/processmap-rag-classifier-*rules*.json` - `tools/rag/pm-rag-scan-*secrets*.mjs` - `tools/rag/pm-rag-build-manifest.mjs` - `tools/rag/p…
```

### #8 — RUNTIME_PROOF_CHECKLIST — feature/processmap-agent-rag-source-registry-and-index-policy-v1
- **score**: 41.218
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/RUNTIME_PROOF_CHECKLIST.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[*contour*: processmap-*agent*-rag-source-registry-and-index-policy-v1] ## *RUNTIME*_PROOF_CHECKLIST — feature/processmap-*agent*-rag-source-registry-and-index-policy-v1
- [ ] *Agent* 1 GSD discipline recorded - [ ] Previous architecture *contour* *review*ed (*REVIEW*_PASS) - [ ] Source/*runtime* truth captured (pwd, branch, HEAD, origin/main, health checks) - [ ] Source registry scope defined (8 roots, concrete paths) - [ ] Index policy scope defined (include/exclude/*secrets*/AI drafts/deprecated/raw logs) - [ ] *Secrets* scanner scope defined (path + content patterns, *no* value printing) - [ ] Metadata schema sco…
```

### #9 — Verdict
- **score**: 41.102
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/REVIEW_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d, category_role
- **snippet**:
```
[*contour*: processmap-*agent*-rag-source-registry-and-index-policy-v1] ***REVIEW*_PASS** All acceptance criteria are met. The *contour* delivers the foundational *tooling* and policy layer for the ProcessMap *Agent* RAG k*no*wledge layer with *no* *product* code *changes*, *no* package installations, and *no* *secrets* exposed. The mi*no*r `--path` single-file handling limitation does *no*t materially impact the primary registry-based workflow and can be addressed in a future *contour*. Next step: proceed to *Contour* 2 (BM25 search module integration) or address the mi*no*r scanner enhancement if prioritized.
```

### #10 — RUNTIME_PROOF_CHECKLIST — architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1
- **score**: 40.418
- **path**: `/opt/processmap-test/.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/RUNTIME_PROOF_CHECKLIST.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[*contour*: processmap-*agent*-rag-k*no*wledge-layer-bootstrap-plan-v1] ## *RUNTIME*_PROOF_CHECKLIST — architecture/processmap-*agent*-rag-k*no*wledge-layer-bootstrap-plan-v1
- [x] *Agent* 1 GSD discipline recorded - [x] source/*runtime* truth captured - [x] Project Atlas inventory planned - [x] *contour* reports inventory planned - [x] docs inventory planned - [x] code source inventory planned - [x] exclusions/*secrets* policy defined - [x] read-only RAG boundary defined - [x] chunking/metadata strategy defined - [x] *Agent* 1 integration defined - [x] *Agent* 2 integration defined - [x] *Agent* 3 integration defined …
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
node tools/rag/pm-rag-search.mjs "tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role reviewer --contour "tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1" --area "scope" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
