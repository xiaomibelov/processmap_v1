# ProcessMap Agent RAG Preflight

## Input
- **role**: executor
- **contour**: uiux/product-actions-registry-noise-cleanup-single-container-v1
- **area/query**: product actions registry inner page UX cleanup
- **generated_at**: 2026-05-18T17:02:52.210Z

## Structured Facts

### Runtime Facts
- **server_host**: clearvestnic.ru (test, high)
- **repo_root**: /opt/processmap-test (test, high)
- **frontend_url**: http://clearvestnic.ru:5180 (test, high)
- **api_health_url**: http://clearvestnic.ru:8088/health (test, high)
- **project_atlas_server_path**: /srv/obsidian/project-atlas (test, high)
- **project_atlas_local_path**: /Users/mac/Documents/Obsidian/ProjectAtlas (local, medium)
- **active_contour_root**: /opt/processmap-test/.planning/contours/<CID> (test, high)
- **current_git_branch**: fix/lockfile-sync-test (test, high)
- **origin_main_head**: d805e1c64c1107b9e3fe6854e031694bf741b187 (test, high)

### Agent Rules
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)

### Contour Facts
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-source-registry-and-index-policy-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-coverage-and-validation-hardening-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Decisions
- RAG is a read-only suggestion and context layer. (All agents, all contours, all RAG usage)
- Product Actions durable truth source is interview.analysis.product_actions[]. (Product feature contours, roadmap planning)
- Product Actions must not be written into BPMN XML. (All backend/API work involving Product Actions and BPMN)
- RAG must not auto-mutate any file. (All RAG tooling, all agent preflight integrations)
- RAG must not write or mutate BPMN XML. (All RAG contours, all agent contexts)

## Supporting Documents

### #1 — uiux/product-actions-registry-workspace-ux-redesign-v1
- **score**: 36.622
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *product*-*actions*-*registry*-workspace-*ux*-redesign-v1] ## ui*ux*/*product*-*actions*-*registry*-workspace-*ux*-redesign-v1
> **Role:** Agent 1 / Planner > **Scope:** Frontend UI/*UX* planning for *product* *actions* *registry* workspace analytics screen > **Contour:** `ui*ux*/*product*-*actions*-*registry*-workspace-*ux*-redesign-v1` > **Date:** 2026-05-14 > **Status:** READY_FOR_EXECUTION ---
```

### #2 — Executor Report — uiux/product-actions-registry-workspace-ux-redesign-v1
- **score**: 34.755
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/EXEC_REPORT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *product*-*actions*-*registry*-workspace-*ux*-redesign-v1] ## Executor Report — ui*ux*/*product*-*actions*-*registry*-workspace-*ux*-redesign-v1
> **Contour:** `ui*ux*/*product*-*actions*-*registry*-workspace-*ux*-redesign-v1` > **Role:** Agent 2 / Executor > **Execution Run ID:** `20260514T160603Z-49874` > **Date:** 2026-05-14 ---
```

### #3 — Your mission
- **score**: 34.529
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/EXECUTOR_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d
- **snippet**:
```
[contour: *product*-*actions*-*registry*-workspace-*ux*-redesign-v1] Redesign the UI/*UX* of the ProcessMap ***product* *actions* *registry*** screen so it feels like a professional workspace-level analytics *registry*, not a temporary debug *page*. ---
```

### #4 — Runtime Navigation — Product Actions Registry
- **score**: 34.341
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/RUNTIME_NAVIGATION.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *product*-*actions*-*registry*-workspace-*ux*-redesign-v1] ## Runtime Navigation — *Product* *Actions* *Registry*
> **Contour:** `ui*ux*/*product*-*actions*-*registry*-workspace-*ux*-redesign-v1` > **Purpose:** How to reach and inspect the target surface at runtime. ---
```

### #5 — uiux/product-actions-registry-workspace-ux-redesign-v1
- **score**: 33.622
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/uiux/product-actions-registry-workspace-ux-redesign-v1/PLAN.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match, heading_match, recent_14d
- **snippet**:
```
## ui*ux*/*product*-*actions*-*registry*-workspace-*ux*-redesign-v1
> **Role:** Agent 1 / Planner > **Scope:** Frontend UI/*UX* planning for *product* *actions* *registry* workspace analytics screen > **Contour:** `ui*ux*/*product*-*actions*-*registry*-workspace-*ux*-redesign-v1` > **Date:** 2026-05-14 > **Status:** READY_FOR_EXECUTION ---
```

### #6 — uiux/product-actions-registry-ia-layout-rework-v2
- **score**: 33.231
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-ia-layout-rework-v2/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *product*-*actions*-*registry*-ia-layout-rework-v2] ## ui*ux*/*product*-*actions*-*registry*-ia-layout-rework-v2
> **Role:** Agent 1 / Planner > **Scope:** Frontend UI/*UX* information architecture rework for *Product* *Actions* *Registry* screen > **Contour:** `ui*ux*/*product*-*actions*-*registry*-ia-layout-rework-v2` > **Date:** 2026-05-14 > **Run ID:** `20260514T194022Z-72528` > **Status:** READY_FOR_EXECUTION ---
```

### #7 — Runtime Proof Checklist — Agent 3
- **score**: 32.527
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/RUNTIME_PROOF_CHECKLIST.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d
- **snippet**:
```
[contour: *product*-*actions*-*registry*-workspace-*ux*-redesign-v1] > **Contour:** `ui*ux*/*product*-*actions*-*registry*-workspace-*ux*-redesign-v1` > **Target surface:** *Product* *actions* *registry* / workspace analytics screen > **URL:** `http://clearvestnic.ru:5180/app?surface=*product*-*actions*-*registry*` ---
```

### #8 — REVIEWER_PROMPT — uiux/product-actions-registry-ia-layout-rework-v2
- **score**: 32.403
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-ia-layout-rework-v2/REVIEWER_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *product*-*actions*-*registry*-ia-layout-rework-v2] ## REVIEWER_PROMPT — ui*ux*/*product*-*actions*-*registry*-ia-layout-rework-v2
> **Role:** Agent 3 / Reviewer > **Contour:** `ui*ux*/*product*-*actions*-*registry*-ia-layout-rework-v2` > **Scope:** Playwright-based UI/*UX* review of *Product* *Actions* *Registry* screen ---
```

### #9 — Agent 3 — Reviewer Prompt
- **score**: 31.839
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-workspace-ux-redesign-v1/REVIEWER_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, recent_14d
- **snippet**:
```
[contour: *product*-*actions*-*registry*-workspace-*ux*-redesign-v1] > **Contour:** `ui*ux*/*product*-*actions*-*registry*-workspace-*ux*-redesign-v1` > **Scope:** UI/*UX* review of *product* *actions* *registry* screen > **Role:** Agent 3 / Reviewer ---
```

### #10 — EXECUTOR_PROMPT — uiux/product-actions-registry-ia-layout-rework-v2
- **score**: 31.802
- **path**: `/opt/processmap-test/.planning/contours/uiux/product-actions-registry-ia-layout-rework-v2/EXECUTOR_PROMPT.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match, recent_14d
- **snippet**:
```
[contour: *product*-*actions*-*registry*-ia-layout-rework-v2] ## EXECUTOR_PROMPT — ui*ux*/*product*-*actions*-*registry*-ia-layout-rework-v2
> **Role:** Agent 2 / Executor > **Contour:** `ui*ux*/*product*-*actions*-*registry*-ia-layout-rework-v2` > **Run ID:** `20260514T194022Z-72528` > **Scope:** Frontend UI/*UX* information architecture rework for *Product* *Actions* *Registry* screen ---
```

## Required Gates
- [ ] Source/runtime truth confirmed before implementation
- [ ] Bounded contour scope respected
- [ ] No product runtime changes unless explicitly allowed
- [ ] No secrets printed in output
- [ ] No auto-mutation of BPMN XML or Product Actions
- [ ] RAG read-only boundary respected
- [ ] Runtime evidence collected for Agent 3

## Warnings
- ⚠️ REMINDER: Do not print secrets. Preflight output may contain paths but not credentials.

## Suggested Next Queries
- ```bash
node tools/rag/pm-rag-search.mjs "product actions registry inner page UX cleanup" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "product actions registry inner page UX cleanup" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role executor --contour "uiux/product-actions-registry-noise-cleanup-single-container-v1" --area "product actions registry inner page UX cleanup" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
