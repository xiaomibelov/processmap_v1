# ProcessMap Agent RAG Preflight

## Input
- **role**: planner
- **contour**: feature/product-actions-registry-backend-view-model-hardening-v1
- **area/query**: backend product actions registry contract planning
- **generated_at**: 2026-05-19T11:18:48.717Z

## Structured Facts

### Runtime Facts
- **server_host**: clearvestnic.ru (test, high)
- **repo_root**: /opt/processmap-test (test, high)
- **frontend_url**: http://clearvestnic.ru:5180 (test, high)
- **api_health_url**: http://clearvestnic.ru:8088/health (test, high)

### Agent Rules
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)

### Contour Facts
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-source-registry-and-index-policy-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-coverage-and-validation-hardening-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Decisions
- RAG is a read-only suggestion and context layer. (All agents, all contours, all RAG usage)
- Product Actions durable truth source is interview.analysis.product_actions[]. (Product feature contours, roadmap planning)
- Product Actions must not be written into BPMN XML. (All backend/API work involving Product Actions and BPMN)
- RAG must not auto-mutate any file. (All RAG tooling, all agent preflight integrations)
- AI drafts are not canonical source truth. (All agents, all contour reports, all Project Atlas docs)
- Version/update row should increment visibly. (Save, deploy, and version contours)
- Large god files require decomposition-first before adding new logic. (All backend and frontend code changes)

### Bottlenecks
- [Frontend] React bundle consumes ~95% CPU during diagram drag interactions. → next: fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1
- [RAG] Structured facts registry exists but is not yet integrated into agent preflight workflow. → next: feature/processmap-agent-rag-agent-preflight-integration-v1

## Supporting Documents

### #1 — uiux/product-actions-registry-workspace-ux-redesign-v1
- **score**: 32.601
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: *product*-*actions*-*registry*-workspace-ux-redesign-v1] ## uiux/*product*-*actions*-*registry*-workspace-ux-redesign-v1
> **Role:** Agent 1 / Planner > **Scope:** Frontend UI/UX *planning* for *product* *actions* *registry* workspace analytics screen > **Contour:** `uiux/*product*-*actions*-*registry*-workspace-ux-redesign-v1` > **Date:** 2026-05-14 > **Status:** READY_FOR_EXECUTION ---
```

### #2 — uiux/product-actions-registry-workspace-ux-redesign-v1
- **score**: 30.101
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/uiux/product-actions-registry-workspace-ux-redesign-v1/PLAN.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d, category_role
- **snippet**:
```
## uiux/*product*-*actions*-*registry*-workspace-ux-redesign-v1
> **Role:** Agent 1 / Planner > **Scope:** Frontend UI/UX *planning* for *product* *actions* *registry* workspace analytics screen > **Contour:** `uiux/*product*-*actions*-*registry*-workspace-ux-redesign-v1` > **Date:** 2026-05-14 > **Status:** READY_FOR_EXECUTION ---
```

### #3 — Evidence
- **score**: 30.007
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-ia-layout-rework-v2/REVIEW_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d, category_role
- **snippet**:
```
[contour: *product*-*actions*-*registry*-ia-layout-rework-v2] | # | Evidence | Path | |---|----------|------| | 1 | Dark theme full-page screenshot | `.*planning*/contours/uiux/*product*-*actions*-*registry*-ia-layout-rework-v2/review-screenshot-dark.png` | | 2 | Light theme full-page screenshot | `.*planning*/contours/uiux/*product*-*actions*-*registry*-ia-layout-rework-v2/review-screenshot-light.png` | ---
```

### #4 — G. Product Actions Draft/Durable Contract
- **score**: 28.599
- **path**: `/opt/processmap-test/.planning/contours/research/product-actions-ai-ag-ui-protocol-fit-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: *product*-*actions*-ai-ag-ui-protocol-fit-v1] ## G. *Product* *Actions* Draft/Durable *Contract*
- Propose candidate event/state *contract* - Draft state: `interview.analysis.*product*_action_suggestions_draft` or existing equivalent - Durable state: `interview.analysis.*product*_*actions*[]` - AI stream must NOT write durable accepted *actions* - Apply/Accept requires explicit user action - *Product* *Actions* save must NOT write BPMN XML - Batch run may save draft suggestions, not accepted *actions*
```

### #5 — Backend Areas Reviewed
- **score**: 28.490
- **path**: `/srv/obsidian/project-atlas/ProcessMap/Architecture/AG-UI Protocol Fit for ProcessMap.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: heading_match, recent_14d, category_role
- **snippet**:
```
## *Backend* Areas Reviewed
- `*backend*/app/routers/*product*_*actions*_ai.py` — suggest, batch-suggest, bulk-suggest endpoints - `*backend*/app/routers/*product*_*actions*_*registry*.py` — *registry* query/export - `*backend*/app/routers/rag.py` — RAG search, index endpoints - `*backend*/app/routers/admin.py` — AI modules, prompts, execution log, provider settings - `*backend*/app/ai/execution_log.py` — AI execution log storage and rate limits - `*backend*/app/ai/*product*_*actions*_suggest.py` — DeepSeek prompt and response normalization - `*backend*/app/ai/prompt_*registry*.py` — Prompt versioning and activation - `*backend*…
```

### #6 — Evidence
- **score**: 27.507
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/uiux/product-actions-registry-ia-layout-rework-v2/REVIEW_REPORT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, recent_14d, category_role
- **snippet**:
```
| # | Evidence | Path | |---|----------|------| | 1 | Dark theme full-page screenshot | `.*planning*/contours/uiux/*product*-*actions*-*registry*-ia-layout-rework-v2/review-screenshot-dark.png` | | 2 | Light theme full-page screenshot | `.*planning*/contours/uiux/*product*-*actions*-*registry*-ia-layout-rework-v2/review-screenshot-light.png` | ---
```

### #7 — STATE
- **score**: 27.378
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-ia-layout-rework-v2/STATE.json`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d, category_role
- **snippet**:
```
[contour: *product*-*actions*-*registry*-ia-layout-rework-v2] { "contour_id": "uiux/*product*-*actions*-*registry*-ia-layout-rework-v2", "status": "READY_FOR_EXECUTION", "role": "Agent 1 / Planner", "scope": "frontend UI/UX information architecture rework for *Product* *Actions* *Registry* screen", "gsd_required": true, "gsd_mode": "GSD_PROCESSMAP_WRAPPER_*PLANNING*", "agent1_*product*_code_changes_allowed": false, "agent2_frontend_ui_changes_allowed": true, "*backend*_changes_allowed": false, "bpmn_xml_mutation_allowed": false, "durable_truth_mutation_allowed": false, "ag_ui_integration_allowed": false, "rag_changes…
```

### #8 — uiux/product-actions-registry-ia-layout-rework-v2
- **score**: 26.886
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-ia-layout-rework-v2/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: *product*-*actions*-*registry*-ia-layout-rework-v2] ## uiux/*product*-*actions*-*registry*-ia-layout-rework-v2
> **Role:** Agent 1 / Planner > **Scope:** Frontend UI/UX information architecture rework for *Product* *Actions* *Registry* screen > **Contour:** `uiux/*product*-*actions*-*registry*-ia-layout-rework-v2` > **Date:** 2026-05-14 > **Run ID:** `20260514T194022Z-72528` > **Status:** READY_FOR_EXECUTION ---
```

### #9 — Runtime Navigation — Product Actions Registry
- **score**: 26.815
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/RUNTIME_NAVIGATION.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: *product*-*actions*-*registry*-workspace-ux-redesign-v1] ## Runtime Navigation — *Product* *Actions* *Registry*
> **Contour:** `uiux/*product*-*actions*-*registry*-workspace-ux-redesign-v1` > **Purpose:** How to reach and inspect the target surface at runtime. ---
```

### #10 — Endpoint contract
- **score**: 26.706
- **path**: `/opt/processmap-test/PROCESSMAP/HANDOFF/2026-05-07 - feature product actions export csv xlsx v1.md`
- **source/category**: handoff-notes / docs
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
## Endpoint *contract*
| Method | Endpoint | Response | | --- | --- | --- | | POST | `/api/analysis/*product*-*actions*/*registry*/export.csv` | `text/csv; charset=utf-8` with attachment filename | | POST | `/api/analysis/*product*-*actions*/*registry*/export.xlsx` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` with attachment filename | Request reuses *registry* query shape: - `scope` - `workspace_id` - `project_id` - `session_id` - selected `session_ids` - `filters` - `limit` - `offset` Supported filter families follow the *registry* UI/API: - `*product*_groups` - `*product*s` - `action_typ…
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
node tools/rag/pm-rag-search.mjs "backend product actions registry contract planning" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "backend product actions registry contract planning" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "feature/product-actions-registry-backend-view-model-hardening-v1" --area "backend product actions registry contract planning" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
# Run ID: `20260519T110751Z-24254`
