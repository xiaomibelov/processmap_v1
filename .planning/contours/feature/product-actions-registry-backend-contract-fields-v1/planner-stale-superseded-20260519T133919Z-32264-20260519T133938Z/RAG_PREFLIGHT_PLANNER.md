# Run ID: `20260519T123355Z-63290`

# ProcessMap Agent RAG Preflight

## Input
- **role**: planner
- **contour**: feature/product-actions-registry-backend-contract-fields-v1
- **area/query**: product actions registry backend contract fields implementation planning
- **generated_at**: 2026-05-19T12:34:28.754Z

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

### #2 — Non-goals
- **score**: 30.693
- **path**: `/opt/processmap-test/.planning/contours/research/product-actions-ai-ag-ui-protocol-fit-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d, category_role
- **snippet**:
```
[contour: *product*-*actions*-ai-ag-ui-protocol-fit-v1] 1. **NO *implementation* of AG-UI in *product* code** 2. **NO UI redesign** — that belongs to `uiux/*product*-*actions*-*registry*-workspace-ux-redesign-v1` 3. **NO *Product* *Actions* *backend* *implementation*** — that belongs to a future `feature/*product*-*actions*-ai-server-batch-orchestrator-v1` 4. **NO RAG bootstrap or index building** — that belongs to `tooling/project-atlas-sync-and-rag-bootstrap-v1` 5. **NO MCP repair** — that belongs to `tooling/mcp-servers-inventory-and-repair-v1` 6. **NO auto-apply of AI suggestions** 7. **NO BPMN XML mutation** 8. **…
```

### #3 — uiux/product-actions-registry-workspace-ux-redesign-v1
- **score**: 30.101
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/uiux/product-actions-registry-workspace-ux-redesign-v1/PLAN.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d, category_role
- **snippet**:
```
## uiux/*product*-*actions*-*registry*-workspace-ux-redesign-v1
> **Role:** Agent 1 / Planner > **Scope:** Frontend UI/UX *planning* for *product* *actions* *registry* workspace analytics screen > **Contour:** `uiux/*product*-*actions*-*registry*-workspace-ux-redesign-v1` > **Date:** 2026-05-14 > **Status:** READY_FOR_EXECUTION ---
```

### #4 — Evidence
- **score**: 30.007
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-ia-layout-rework-v2/REVIEW_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d, category_role
- **snippet**:
```
[contour: *product*-*actions*-*registry*-ia-layout-rework-v2] | # | Evidence | Path | |---|----------|------| | 1 | Dark theme full-page screenshot | `.*planning*/contours/uiux/*product*-*actions*-*registry*-ia-layout-rework-v2/review-screenshot-dark.png` | | 2 | Light theme full-page screenshot | `.*planning*/contours/uiux/*product*-*actions*-*registry*-ia-layout-rework-v2/review-screenshot-light.png` | ---
```

### #5 — 6. Product Actions Draft/Durable Contract
- **score**: 29.849
- **path**: `/opt/processmap-test/.planning/contours/research/product-actions-ai-ag-ui-protocol-fit-v1/EXECUTOR_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d, category_role
- **snippet**:
```
[contour: *product*-*actions*-ai-ag-ui-protocol-fit-v1] ## 6. *Product* *Actions* Draft/Durable *Contract*
Propose candidate event/state *contract*: - Draft state location - Durable accepted state location - Event list (see PLAN.md for minimum events) - For each event: purpose, payload *fields*, durable or ephemeral, safe to log yes/no, UI behavior
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
node tools/rag/pm-rag-search.mjs "product actions registry backend contract fields implementation planning" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "product actions registry backend contract fields implementation planning" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role planner --contour "feature/product-actions-registry-backend-contract-fields-v1" --area "product actions registry backend contract fields implementation planning" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
