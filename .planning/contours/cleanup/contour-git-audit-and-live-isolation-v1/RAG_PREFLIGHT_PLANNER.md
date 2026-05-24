# RAG Preflight Planner

- run_id: `1779547711398-fzk2d9`
- contour: `cleanup/contour-git-audit-and-live-isolation-v1`
- generated_by: `processmap-agent-pane.sh`
- generated_at: `2026-05-23T14:48:53Z`
- command: `node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "cleanup/contour-git-audit-and-live-isolation-v1" --area "ProcessMap planning context cleanup/contour-git-audit-and-live-isolation-v1" --format md --top-k 5`

# ProcessMap Agent RAG Preflight

## Input
- **role**: planner
- **contour**: cleanup/contour-git-audit-and-live-isolation-v1
- **area/query**: ProcessMap planning context cleanup/contour-git-audit-and-live-isolation-v1
- **generated_at**: 2026-05-23T14:48:47.852Z

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

### #1 — Input
- **score**: 59.005
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/cleanup/contour-git-audit-and-live-isolation-v1/RAG_PREFLIGHT_PLANNER.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, recent_14d, category_role
- **snippet**:
```
- **role**: planner - ***contour***: *cleanup*/*contour*-*git*-*audit*-and-*live*-*isolation*-*v1* - **area/query**: *ProcessMap* *planning* *context* *cleanup*/*contour*-*git*-*audit*-and-*live*-*isolation*-*v1* - **generated_at**: 2026-05-23T14:45:56.825Z
```

### #2 — Suggested Next Queries
- **score**: 56.485
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/cleanup/contour-git-audit-and-live-isolation-v1/RAG_PREFLIGHT_PLANNER.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, recent_14d, category_role
- **snippet**:
```
- ```bash node tools/rag/pm-rag-search.mjs "*ProcessMap* *planning* *context* *cleanup*/*contour*-*git*-*audit*-and-*live*-*isolation*-*v1*" --top-k 5 ``` - ```bash node tools/rag/pm-rag-search-facts.mjs "*ProcessMap* *planning* *context* *cleanup*/*contour*-*git*-*audit*-and-*live*-*isolation*-*v1*" --top-k 8 --json ``` - ```bash node tools/rag/pm-rag-agent-preflight.mjs --role planner --*contour* "*cleanup*/*contour*-*git*-*audit*-and-*live*-*isolation*-*v1*" --area "*ProcessMap* *planning* *context* *cleanup*/*contour*-*git*-*audit*-and-*live*-*isolation*-*v1*" --format md ``` - ```bash node tools/rag/pm-rag-validate-facts.mjs ``` - ```bash node tools/rag/pm-rag-ru
```

### #3 — RAG Preflight Planner
- **score**: 56.019
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/cleanup/contour-git-audit-and-live-isolation-v1/RAG_PREFLIGHT_PLANNER.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, recent_14d, category_role
- **snippet**:
```
- run_id: `20260523T144543Z-80091` - *contour*: `*cleanup*/*contour*-*git*-*audit*-and-*live*-*isolation*-*v1*` - generated_by: `*processmap*-agent-pane.sh` - generated_at: `2026-05-23T14:46:02Z` - command: `node tools/rag/pm-rag-agent-preflight.mjs --role planner --*contour* "*cleanup*/*contour*-*git*-*audit*-and-*live*-*isolation*-*v1*" --area "*ProcessMap* *planning* *context* *cleanup*/*contour*-*git*-*audit*-and-*live*-*isolation*-*v1*" --format md --top-k 5`
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
node tools/rag/pm-rag-search.mjs "ProcessMap planning context cleanup/contour-git-audit-and-live-isolation-v1" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "ProcessMap planning context cleanup/contour-git-audit-and-live-isolation-v1" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "cleanup/contour-git-audit-and-live-isolation-v1" --area "ProcessMap planning context cleanup/contour-git-audit-and-live-isolation-v1" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
