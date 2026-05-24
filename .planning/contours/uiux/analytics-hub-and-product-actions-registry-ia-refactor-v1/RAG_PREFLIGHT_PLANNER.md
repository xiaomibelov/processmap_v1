# ProcessMap Agent RAG Preflight

## Input
- **role**: planner
- **contour**: uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1
- **area/query**: ProcessMap planning context
- **generated_at**: 2026-05-17T20:30:41.595Z

## Structured Facts

### Agent Rules
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)

### Contour Facts
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-source-registry-and-index-policy-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-bm25-manifest-search-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-coverage-and-validation-hardening-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-real-drag-performance-and-engine-decomposition-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false

### Decisions
- RAG is a read-only suggestion and context layer. (All agents, all contours, all RAG usage)
- RAG must not auto-mutate any file. (All RAG tooling, all agent preflight integrations)

### Bottlenecks
- [Diagram] Diagram drag lag remained after multiple performance contours. → next: perf/process-stage-baseline-jank-v1
- [Frontend] React bundle consumes ~95% CPU during diagram drag interactions. → next: fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1
- [RAG] BM25 lexical search initially achieved only 3/7 on validation queries. → next: feature/processmap-agent-rag-agent-preflight-integration-v1
- [RAG] Structured facts registry exists but is not yet integrated into agent preflight workflow. → next: feature/processmap-agent-rag-agent-preflight-integration-v1

## Supporting Documents

### #1 — B. Planning Contours
- **score**: 20.790
- **path**: `/opt/processmap-test/.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/SOURCE_INVENTORY.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: *processmap*-agent-rag-knowledge-layer-bootstrap-plan-v1] ## B. *Planning* Contours
Root: `/opt/*processmap*-test/.*planning*/contours` **Summary:** 40 contours across 8 categories.
```

### #2 — Top Results
- **score**: 20.395
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_SEARCH_VALIDATION_RESULTS.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d, category_role
- **snippet**:
```
[contour: *processmap*-agent-rag-bm25-manifest-search-v1] - **#1** `/opt/*processmap*-test/.*planning*/contours/perf/diagram-svg-css-repaint-reduction-v1/RUNTIME_PROOF_CHECKLIST.md` — score 19.373 > - [x] GSD discipline recorded - [x] Previous *Diagram* *performance* *contours* *review*ed - [x] Source/runtime truth ca… - **#2** `/opt/*processmap*-test/.*planning*/contours/tooling/*processmap*-agent3-ui-review-skill-binding-v1/EXEC_REPORT.md` — score 18.991 > 1. *Agent* 2 completes implementation and writes `EXEC_REPORT.md`. 2. *Agent* 3 reads the skill + binding, then opens th… - **#3** `/opt/*processmap*-t…
```

### #3 — architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1
- **score**: 20.107
- **path**: `/opt/processmap-test/.planning/contours/architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: *processmap*-agent-rag-knowledge-layer-bootstrap-plan-v1] ## architecture/*processmap*-agent-rag-knowledge-layer-bootstrap-plan-v1
*ProcessMap* Agent RAG / Knowledge Layer — Architecture and *Planning* Contour ---
```

### #4 — chunk-0075490b943e84ca
- **score**: 19.632
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_SEARCH_INDEX_SAMPLE.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d, category_role
- **snippet**:
```
[contour: *processmap*-agent-rag-bm25-manifest-search-v1] - **Path:** `/opt/*processmap*-test/.*planning*/contours/fix/diagram-visible-version-and-large-canvas-lag-v1/REVIEWER_PROMPT.md` - **Title:** Review Section A — Visible Version - **Category:** contour | **Class:** prompt_template - **Tokens:** 78 - **Snippet:** 1. Open **fresh browser *context*** on `http://clearvestnic.ru:5180/?cb=<timestamp>`. 2. Locate the visible version marker…
```

### #5 — Repo planning templates
- **score**: 19.325
- **path**: `/opt/processmap-test/.planning/contours/tooling/processmap-agent3-ui-review-skill-binding-v1/EXEC_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: *processmap*-agent3-ui-review-skill-binding-v1] ## Repo *planning* templates
| # | Path | Status | |---|------|--------| | 3 | `/opt/*processmap*-test/.*planning*/templates/agent3-ui-runtime-review-template.md` | Created | | 4 | `/opt/*processmap*-test/.*planning*/templates/agent3-ui-runtime-proof-checklist.md` | Created |
```

### #6 — chunk-012347891ef3c14e
- **score**: 19.012
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/RAG_SEARCH_INDEX_SAMPLE.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d, category_role
- **snippet**:
```
[contour: *processmap*-agent-rag-bm25-manifest-search-v1] - **Path:** `/opt/*processmap*-test/.*planning*/contours/tooling/project-atlas-sync-and-rag-bootstrap-v1/REVIEWER_PROMPT.md` - **Title:** 1. Local/Server Sync Verification - **Category:** contour | **Class:** prompt_template - **Tokens:** 27 - **Snippet:** - [ ] Syncthing is installed and running on both local Mac and server - [ ] Devices are paired and connected - [ ] Folde… --- **Read-only boundary:** This index is for retrieval *context* only. No auto-mutation.
```

### #7 — Repo planning templates
- **score**: 19.010
- **path**: `/opt/processmap-test/.planning/contours/tooling/processmap-agent3-ui-review-skill-binding-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: *processmap*-agent3-ui-review-skill-binding-v1] ## Repo *planning* templates
3. `/opt/*processmap*-test/.*planning*/templates/agent3-ui-runtime-review-template.md` - Reusable template for future Agent 3 reviews. 4. `/opt/*processmap*-test/.*planning*/templates/agent3-ui-runtime-proof-checklist.md` - Checklist for Agent 3 runtime proof steps.
```

### #8 — Output
- **score**: 18.736
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-source-registry-and-index-policy-v1/VALIDATION_RESULTS.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d, category_role
- **snippet**:
```
[contour: *processmap*-agent-rag-source-registry-and-index-policy-v1] ``` Manifest built: JSON: /opt/*processmap*-test/.*planning*/contours/feature/*processmap*-agent-rag-source-registry-and-index-policy-v1/RAG_MANIFEST_SAMPLE.json MD: /opt/*processmap*-test/.*planning*/contours/feature/*processmap*-agent-rag-source-registry-and-index-policy-v1/RAG_MANIFEST_SAMPLE.md Files: 200 ``` ---
```

### #9 — Planning Contours
- **score**: 18.678
- **path**: `/srv/obsidian/project-atlas/ProcessMap/RAG/INDEX_SOURCES_DRAFT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d, category_role
- **snippet**:
```
## *Planning* Contours
```yaml - path: /opt/*processmap*-test/.*planning*/contours/*/PLAN.md category: contour rule: include truth_level: canonical priority: critical chunking: by_heading - path: /opt/*processmap*-test/.*planning*/contours/*/EXEC_REPORT.md category: contour rule: include truth_level: evidence priority: critical chunking: by_heading - path: /opt/*processmap*-test/.*planning*/contours/*/REVIEW_REPORT.md category: contour rule: include truth_level: evidence priority: critical chunking: by_heading - path: /opt/*processmap*-test/.*planning*/contours/*/REWORK_REQUEST.md category: contour rule: includ…
```

### #10 — Verification Commands
- **score**: 18.651
- **path**: `/opt/processmap-test/.planning/contours/feature/processmap-agent-rag-bm25-manifest-search-v1/SECRETS_AND_EXCLUSIONS_RECHECK.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d, category_role
- **snippet**:
```
[contour: *processmap*-agent-rag-bm25-manifest-search-v1] ```bash grep -E '"path".*\.env' .*planning*/contours/feature/*processmap*-agent-rag-bm25-manifest-search-v1/RAG_MANIFEST_SAMPLE.json || echo "PASS: no .env" grep -E '"path".*\.pem' .*planning*/contours/feature/*processmap*-agent-rag-bm25-manifest-search-v1/RAG_MANIFEST_SAMPLE.json || echo "PASS: no .pem" grep -E '"path".*node_modules' .*planning*/contours/feature/*processmap*-agent-rag-bm25-manifest-search-v1/RAG_MANIFEST_SAMPLE.json || echo "PASS: no node_modules" grep -E '"path".*frontend/dist' .*planning*/contours/feature/*processmap*-agent-rag-bm25-m…
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
- ⚠️ No runtime facts matched query — runtime proof may be missing.
- ⚠️ REMINDER: Do not print secrets. Preflight output may contain paths but not credentials.

## Suggested Next Queries
- ```bash
node tools/rag/pm-rag-search.mjs "ProcessMap planning context" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "ProcessMap planning context" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "uiux/analytics-hub-and-product-actions-registry-ia-refactor-v1" --area "ProcessMap planning context" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
