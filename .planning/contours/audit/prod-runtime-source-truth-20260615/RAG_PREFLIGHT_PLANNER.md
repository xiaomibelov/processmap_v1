# ProcessMap Agent RAG Preflight

## Input
- **role**: planner
- **contour**: audit/prod-runtime-source-truth-20260615
- **area/query**: ProcessMap runtime source truth deploy / prod server error git truth deploy
- **generated_at**: 2026-06-15T16:27:37.819Z

## Structured Facts

### Runtime Facts
- **server_host**: clearvestnic.ru (test, high)
- **project_atlas_server_path**: /srv/obsidian/project-atlas (test, high)
- **current_git_branch**: fix/lockfile-sync-test (test, high)
- **repo_root**: /opt/processmap-test (test, high)
- **frontend_url**: http://clearvestnic.ru:5180 (test, high)
- **api_health_url**: http://clearvestnic.ru:8088/health (test, high)

### Agent Rules
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] No PR, merge, or deploy without explicit user command (FORBIDDEN: Create PR, merge, push, or deploy without explicit user request) (REQUIRED: Wait for explicit user approval before git push, PR creation, or deploy)
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)

### Contour Facts
- perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false

### Decisions
- AI drafts are not canonical source truth. (All agents, all contour reports, all Project Atlas docs)
- Product Actions durable truth source is interview.analysis.product_actions[]. (Product feature contours, roadmap planning)
- RAG must not write or mutate BPMN XML. (All RAG contours, all agent contexts)
- Product Actions must not be written into BPMN XML. (All backend/API work involving Product Actions and BPMN)
- Version/update row should increment visibly. (Save, deploy, and version contours)

### Bottlenecks
- [Frontend] React bundle consumes ~95% CPU during diagram drag interactions. → next: fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1

## Supporting Documents

### #1 — 2. Source/runtime truth (fixed at planning time)
- **score**: 37.008
- **path**: `/opt/processmap-test/.planning/contours/premium-urgent-task-analytics-ui-ux-addi-mqdketwb/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: PLAN.md] ## 2. *Source*/*runtime* *truth* (fixed at planning time)
- Working directory: `/opt/*processmap*-test` - Current branch: `feature/analytics-nav-ux-fix` (legacy contour — do NOT reuse) - Remote: `origin *git*@*git*hub.com:xiaomibelov/*processmap*_v1.*git*` - Gateway build *source*: `/root/*processmap*_v1` (must receive synced frontend changes before *deploy*) - Frontend path: `/opt/*processmap*-test/frontend` - Analytics feature root: `/opt/*processmap*-test/frontend/src/features/analytics/` - Existing dashboards: `SessionAnalyticsDashboard.jsx`, `ProjectAnalyticsDashboard.jsx`, `WorkspaceAnalyticsDa…
```

### #2 — 2. Source/runtime truth (fixed at planning time)
- **score**: 36.508
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/premium-urgent-task-analytics-ui-ux-addi-mqdketwb/PLAN.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
## 2. *Source*/*runtime* *truth* (fixed at planning time)
- Working directory: `/opt/*processmap*-test` - Current branch: `feature/analytics-nav-ux-fix` (legacy contour — do NOT reuse) - Remote: `origin *git*@*git*hub.com:xiaomibelov/*processmap*_v1.*git*` - Gateway build *source*: `/root/*processmap*_v1` (must receive synced frontend changes before *deploy*) - Frontend path: `/opt/*processmap*-test/frontend` - Analytics feature root: `/opt/*processmap*-test/frontend/src/features/analytics/` - Existing dashboards: `SessionAnalyticsDashboard.jsx`, `ProjectAnalyticsDashboard.jsx`, `WorkspaceAnalyticsDashboard.jsx` - Exis…
```

### #3 — 2. Source Truth
- **score**: 34.943
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/workflow/pr-stage-manual-merge-only-v1/PLAN.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_30d
- **snippet**:
```
## 2. *Source* *Truth*
| Plane | Fact | |---|---| | Code | Branch `uiux/registry-ui-spec-implementation-v1`, HEAD `5affb5ff0abce2735df1c34fe369a39fe9c354e3` | | Workflow files | `.*git*hub/workflows/*deploy*-stage.yml` (auto-*deploy* on push), `.*git*hub/workflows/*deploy*-stage-ref.yml` (manual ref dispatch), `.*git*hub/workflows/*deploy*-*prod*.yml` (manual dispatch) | | Policy | `AGENTS.md` release flow: `branch -> push -> PR -> user approval -> merge -> auto *deploy* to stage -> verify -> manual *prod* *deploy*` | | *Runtime* | Not applicable; this is a *Git*Hub Actions workflow change | ---
```

### #4 — Source/runtime truth
- **score**: 34.523
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/architecture/analytics-and-diagram-overlays-server-side-view-model-v1/REVIEW_REPORT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_30d
- **snippet**:
```
## *Source*/*runtime* *truth*
| Check | Evidence | |---|---| | Launcher workspace | `/opt/*processmap*-test`; branch `fix/lockfile-sync-test`; dirty and not used as *source* *truth* | | Review workspace | `/Users/mac/PycharmProjects/*processmap*_canonical_main` | | Remote | `origin *git*@*git*hub.com:xiaomibelov/*processmap*_v1.*git*` | | Fetch | PASS | | Branch | `architecture/analytics-and-diagram-overlays-*server*-side-view-model-v1` | | HEAD | `b3d361a3a8f816cac084740455b604f3aba759cc` | | origin/main | `d805e1c64c1107b9e3fe6854e031694bf741b187` | | Status | clean, ahead of `origin/main` by 2 | | Diff cached | em…
```

### #5 — Out of Scope (Explicit Non-Goals)
- **score**: 31.423
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/processmap-agent-rag-source-registry-and-index-policy-v1/PLAN.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match
- **snippet**:
```
- Full RAG search *server*. - Vector database or embeddings. - Package installation. - *Prod*uct *runtime* UI changes. - Backend API changes. - Auto-mutation of any kind. - BPMN XML mutation. - *Prod*uct Actions auto-apply. - Indexing secrets. - Treating AI drafts as canonical *truth*. - MCP repair. - Stage/*prod* *deploy*. - Commit/push/PR. ---
```

### #6 — Source Truth - Server
- **score**: 30.654
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/tooling/processmap-agents-launcher-logic-and-dependencies-audit-v1/PLAN.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_30d
- **snippet**:
```
## *Source* *Truth* - *Server*
*Server* *source* *truth* command was run from `/opt/*processmap*-test`. Observed: - Branch: `fix/lockfile-sync-test`. - HEAD: `a9a9d9c5f468d9da63415306da6d34dcd605aa0d`. - `origin/main`: `d805e1c64c1107b9e3fe6854e031694bf741b187`. - Worktree has unrelated modified *prod*uct *runtime* files under `frontend/src` and `frontend/vite.config.js`; Agent 2 must not touch them. - *Server* agent scripts exist and are executable: - `tools/pm-agent1-planner.sh` - `tools/pm-agent2-executor-watch.sh` - `tools/pm-agent3-reviewer-watch.sh` - `tools/pm-agent-status.sh` - `tools/pm-agent-reset-stale…
```

### #7 — Non-Goals
- **score**: 30.634
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/processmap-agent-rag-source-registry-and-index-policy-v1/PLAN.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match
- **snippet**:
```
- No full RAG search *server* yet. - No vector database. - No embeddings. - No package installation. - No *prod*uct *runtime* UI changes. - No backend API changes. - No auto-mutation. - No BPMN XML mutation. - No *Prod*uct Actions auto-apply. - No indexing secrets. - No treating AI drafts as *truth*. - No MCP repair. - No stage/*prod* *deploy*. - No PR/merge/push. ---
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
- ⚠️ REMINDER: Do not print secrets. Preflight output may contain paths but not credentials.

## Suggested Next Queries
- ```bash
node tools/rag/pm-rag-search.mjs "ProcessMap runtime source truth deploy" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "ProcessMap runtime source truth deploy" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "audit/prod-runtime-source-truth-20260615" --area "ProcessMap runtime source truth deploy" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
