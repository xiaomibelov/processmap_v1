# ProcessMap Agent RAG Preflight

## Input
- **role**: planner
- **contour**: feature/analytics-overview-explorer
- **area/query**: analytics overview explorer / analytics dashboard overview KPI projects sessions
- **generated_at**: 2026-06-27T06:59:45.391Z

## Structured Facts

### Agent Rules
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)
- [critical] No PR, merge, or deploy without explicit user command (FORBIDDEN: Create PR, merge, push, or deploy without explicit user request) (REQUIRED: Wait for explicit user approval before git push, PR creation, or deploy)
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)

### Contour Facts
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-source-registry-and-index-policy-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-bm25-manifest-search-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-coverage-and-validation-hardening-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-real-drag-performance-and-engine-decomposition-v1: formal=REVIEW_PASS, user_visible=not_solved, accepted=false
- fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Bottlenecks
- [Diagram] Diagram drag lag remained after multiple performance contours. → next: perf/process-stage-baseline-jank-v1
- [Frontend] React bundle consumes ~95% CPU during diagram drag interactions. → next: fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1
- [RAG] BM25 lexical search initially achieved only 3/7 on validation queries. → next: feature/processmap-agent-rag-agent-preflight-integration-v1
- [RAG] Structured facts registry exists but is not yet integrated into agent preflight workflow. → next: feature/processmap-agent-rag-agent-preflight-integration-v1

## Supporting Documents

### #1 — Workspace dashboard
- **score**: 35.220
- **path**: `/opt/processmap-test/.planning/contours/audit/analytics-backend-driven/DATA_FLOW.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *analytics*-backend-driven] ## Workspace *dashboard*
``` Frontend Workspace*Analytics**Dashboard* → GET /api/workspaces/{id}/*analytics* Backend project_*analytics*.py → SELECT *projects* for workspace → For each project: _*sessions*_for_project(limit=500) → Deduplicate by session id, cap at 500 → _aggregate_*sessions*() → return {workspace_id, *projects*_count, *sessions*_count, total_actions, avg_duration_min, recent_*sessions*: [...20]} → *dashboard*Model.normalizeWorkspace*Analytics*Cards() renders 4 cards. ```
```

### #2 — Project dashboard
- **score**: 33.755
- **path**: `/opt/processmap-test/.planning/contours/audit/analytics-backend-driven/DATA_FLOW.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *analytics*-backend-driven] ## Project *dashboard*
``` Frontend Project*Analytics**Dashboard* → GET /api/*projects*/{id}/*analytics* Backend project_*analytics*.py → _legacy_main authz helpers → _*sessions*_for_project(): SELECT id FROM *sessions* WHERE project_id = ? LIMIT 500 → storage.load(id) for each session → _aggregate_*sessions*(): compute or read *analytics*, sum/avg metrics → return {project_id, *sessions*_count, total_actions, avg_duration_min, total_critical_questions, *sessions*: [...]} → *dashboard*Model.normalizeProject*Analytics*Cards() renders 4 cards. ```
```

### #3 — Answers from the audit
- **score**: 32.745
- **path**: `/opt/processmap-test/.planning/contours/feature/analytics-backend-driven-v1/INPUT_SUMMARY.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d
- **snippet**:
```
[contour: *analytics*-backend-driven-v1] | Question | Answer from audit | |---|---| | **Working scope switcher?** | Product Actions Registry is the reference implementation. It uses `POST /api/analysis/product-actions/registry/query` with `scope = workspace \| project \| session` and has internal scope buttons. | | **Missing scope switcher?** | Properties Registry and *Dashboard*s have no scope switcher; scope is derived from props or not exposed at all. | | **Existing endpoints** | `POST /api/analysis/product-actions/registry/query`<br>`GET /api/*sessions*/{id}/analysis/view-model`<br>`POST /api/an…
```

### #4 — Phase 2 — Overview tab
- **score**: 31.460
- **path**: `/opt/processmap-test/.planning/contours/feature/analytics-dashboard-redesign/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *analytics*-*dashboard*-redesign] ## Phase 2 — *Overview* tab
- Redesign `*Dashboard*MetricCard.jsx`: accept `icon`, `tone`, `unit`, mini sparkline. - Update `*Analytics*Page.jsx` *Overview* grid: 8 metrics with icons & tones. - Map tones: actions=success, duration=default, critical path=warning, handoffs=accent, open=default, critical=danger, *sessions*/*projects*=default.
```

### #5 — Answers from the audit
- **score**: 29.745
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/analytics-backend-driven-v1/INPUT_SUMMARY.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, recent_14d
- **snippet**:
```
| Question | Answer from audit | |---|---| | **Working scope switcher?** | Product Actions Registry is the reference implementation. It uses `POST /api/analysis/product-actions/registry/query` with `scope = workspace \| project \| session` and has internal scope buttons. | | **Missing scope switcher?** | Properties Registry and *Dashboard*s have no scope switcher; scope is derived from props or not exposed at all. | | **Existing endpoints** | `POST /api/analysis/product-actions/registry/query`<br>`GET /api/*sessions*/{id}/analysis/view-model`<br>`POST /api/analysis/properties/registry/query`<br>`G
```

### #6 — 1.2 Frontend domains
- **score**: 29.536
- **path**: `/srv/obsidian/project-atlas/ProcessMap/Architecture/MICROSERVICE_AUDIT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: recent_14d
- **snippet**:
```
| # | Domain | Key folders | Key hooks / stores | API namespaces used | |---|--------|-------------|--------------------|---------------------| | 1 | **auth** | `features/auth` | `AuthProvider`, `useAuth` | `auth`, `invite` | | 2 | **workspace / *explorer*** | `features/*explorer*`, `components/workspace` | `useWorkspace*Explorer*Controller`, `work3TreeState` | `workspaces`, `folders`, `*explorer*`, `*projects*` | | 3 | ***projects*** | `features/*projects*` | `use*Projects*`, `ProjectWizardModal` | `*projects*` | | 4 | ***sessions*** | `features/*sessions*`, `components/stages/NoSession.jsx` | `use*SessionS*tore`, `
```

### #7 — Phase 2 — Overview tab
- **score**: 28.460
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/analytics-dashboard-redesign/PLAN.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
## Phase 2 — *Overview* tab
- Redesign `*Dashboard*MetricCard.jsx`: accept `icon`, `tone`, `unit`, mini sparkline. - Update `*Analytics*Page.jsx` *Overview* grid: 8 metrics with icons & tones. - Map tones: actions=success, duration=default, critical path=warning, handoffs=accent, open=default, critical=danger, *sessions*/*projects*=default.
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
node tools/rag/pm-rag-search.mjs "analytics overview explorer" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "analytics overview explorer" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "feature/analytics-overview-explorer" --area "analytics overview explorer" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
