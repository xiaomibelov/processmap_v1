# RAG Preflight Planner

- run_id: `20260520T224346Z-55320`
- contour: `feature/process-analysis-session-backend-view-model-contract-v1`
- generated_by: `processmap-agent-pane.sh`
- generated_at: `2026-05-20T22:44:30Z`
- command: `node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "feature/process-analysis-session-backend-view-model-contract-v1" --area "ProcessMap planning context feature/process-analysis-session-backend-view-model-contract-v1" --format md --top-k 5`

# ProcessMap Agent RAG Preflight

## Input
- **role**: planner
- **contour**: feature/process-analysis-session-backend-view-model-contract-v1
- **area/query**: ProcessMap planning context feature/process-analysis-session-backend-view-model-contract-v1
- **generated_at**: 2026-05-20T22:44:25.117Z

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

### #1 — Phased roadmap
- **score**: 44.342
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/architecture/process-analysis-and-registries-backend-view-model-master-plan-v1/PLAN.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, recent_14d, category_role
- **snippet**:
```
| Phase | Objective | Suggested contour | |---|---|---| | 0 | Approve this master plan. | `architecture/*process*-*analysis*-and-registries-*backend*-*view*-*model*-master-plan-*v1*` | | 1 | Consolidate Product Actions Registry *backend* *view* *model*. | `*feature*/product-actions-registry-*backend*-*contract*-fields-*v1*` (выполнено/выполняется) | | 2 | Consolidate *Process* Properties Registry *backend* *view* *model*. | `*feature*/*process*-properties-registry-*backend*-*contract*-*v1*` (текущая ветка) | | 3 | Extract shared registry *view* *model* utilities. | `*feature*/registry-shared-*view*-*model*-infrastructure-*v1*` | | 4 | Frontend thin
```

### #2 — Source
- **score**: 38.542
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/architecture/process-analysis-and-registries-backend-view-model-master-plan-v1/INDEX.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, recent_14d, category_role
- **snippet**:
```
```text /opt/**process*map*-test/.*planning*/contours/architecture/*process*-*analysis*-and-registries-*backend*-*view*-*model*-master-plan-*v1* ```
```

### #3 — Agent 3 / Worker Prompt — Frontend Thin-Client Readiness Lane
- **score**: 36.791
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/product-actions-registry-backend-view-model-hardening-v1/WORKER_3_PROMPT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, recent_14d, category_role
- **snippet**:
```
You are Agent 3 / Worker for **Process*Map*. Contour: *feature*/product-actions-registry-*backend*-*view*-*model*-hardening-*v1* Run ID: 20260519T110751Z-24254 Task: Inspect frontend Product Actions Registry usage and produce a grounded thin-client readiness report. Do not wait for Agent 2. Do not validate Agent 2. Do not implement product code. Read first: - .*planning*/contours/*feature*/product-actions-registry-*backend*-*view*-*model*-hardening-*v1*/PLAN.md - .*planning*/contours/*feature*/product-actions-registry-*backend*-*view*-*model*-hardening-*v1*/RAG_PREFLIGHT_PLANNER.md - .*planning*/contours/*feature*/product-actions-regi
```

### #4 — Master plan: Process analysis and registries backend view model
- **score**: 36.299
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/architecture/process-analysis-and-registries-backend-view-model-master-plan-v1/PLAN.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d, category_role
- **snippet**:
```
## Master plan: *Process* *analysis* and registries *backend* *view* *model*
Контур: `architecture/*process*-*analysis*-and-registries-*backend*-*view*-*model*-master-plan-*v1*` Run ID: `20260520T221413Z-51872` Статус: `READY_FOR_EXECUTION`
```

### #5 — Agent 2 / Worker Prompt — Backend Source/Contract Lane
- **score**: 35.975
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/product-actions-registry-backend-view-model-hardening-v1/WORKER_2_PROMPT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d, category_role
- **snippet**:
```
## Agent 2 / Worker Prompt — *Backend* Source/*Contract* Lane
You are Agent 2 / Worker for **Process*Map*. Contour: *feature*/product-actions-registry-*backend*-*view*-*model*-hardening-*v1* Run ID: 20260519T110751Z-24254 Task: Inspect the current *backend* Product Actions Registry source and produce a grounded *backend* *contract* hardening report. Do not implement product code. Read first: - .*planning*/contours/*feature*/product-actions-registry-*backend*-*view*-*model*-hardening-*v1*/PLAN.md - .*planning*/contours/*feature*/product-actions-registry-*backend*-*view*-*model*-hardening-*v1*/RAG_PREFLIGHT_PLANNER.md - .*planning*/contours/fea…
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
node tools/rag/pm-rag-search.mjs "ProcessMap planning context feature/process-analysis-session-backend-view-model-contract-v1" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "ProcessMap planning context feature/process-analysis-session-backend-view-model-contract-v1" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "feature/process-analysis-session-backend-view-model-contract-v1" --area "ProcessMap planning context feature/process-analysis-session-backend-view-model-contract-v1" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
