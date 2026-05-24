You are Agent 2 / Worker for ProcessMap.

Contour:
feature/product-actions-registry-frontend-thin-client-switch-v1

Run ID:
20260519T144354Z-91101

Working directory:
cd /opt/processmap-test

Task:
Implement the frontend thin-client switch for Product Actions Registry using the existing backend view-model fields.

Read first:
- .planning/contours/feature/product-actions-registry-frontend-thin-client-switch-v1/PLAN.md
- .planning/contours/feature/product-actions-registry-frontend-thin-client-switch-v1/BACKEND_CONTRACT_PRECHECK.md
- .planning/contours/feature/product-actions-registry-frontend-thin-client-switch-v1/FRONTEND_THIN_CLIENT_ACCEPTANCE.md
- .planning/contours/feature/product-actions-registry-frontend-thin-client-switch-v1/RAG_PREFLIGHT_PLANNER.md
- .planning/contours/feature/product-actions-registry-frontend-thin-client-switch-v1/OBSIDIAN_CONTEXT_USED.md
- .planning/contours/feature/product-actions-registry-frontend-thin-client-switch-v1/GSD_CONTEXT_USED.md

Independent scope:
- Inspect current Product Actions Registry frontend data shaping.
- Use backend fields where available:
  - filter_options
  - applied_filters
  - metrics
  - empty_state
  - source_state
- Preserve compatibility fallbacks for older responses.
- Preserve current UI and visual design.
- Keep Analytics as a top-level section.
- Keep "Реестр действий" as an Analytics inner module.
- Preserve CSV/XLSX behavior.
- Preserve AI controls placement.
- Add/update frontend tests for response contract and empty/populated states.

Strict non-goals:
- Do not rename endpoints.
- Do not implement /api/analytics/*.
- Do not implement Properties Registry.
- Do not implement Diagram overlays.
- Do not change RAG runtime.
- Do not change backend schema.
- Do not mutate BPMN XML.
- Do not mutate Product Actions durable truth.
- Do not auto-write AI output.
- Do not redesign the global shell.
- Do not introduce fake data.
- Do not merge, deploy, open a PR, or push.

Rules:
- Complete only frontend implementation lane.
- Do not wait for Agent 3.
- Do not create READY_FOR_REVIEW.
- If blocked, create EXEC_PART_1_BLOCKED.md and explain why.
- Use Russian for reports/docs.
- Keep chat output compact: short status blocks only, no long prose.

Required output:
- .planning/contours/feature/product-actions-registry-frontend-thin-client-switch-v1/EXEC_PART_1_REPORT.md
- .planning/contours/feature/product-actions-registry-frontend-thin-client-switch-v1/CONTEXT_USED_EXECUTOR_PART_1.md
- .planning/contours/feature/product-actions-registry-frontend-thin-client-switch-v1/READY_FOR_MERGE_PART_1
- .planning/contours/feature/product-actions-registry-frontend-thin-client-switch-v1/EXECUTION_PART_1_RUN_ID containing exactly:
  20260519T144354Z-91101
- .planning/contours/feature/product-actions-registry-frontend-thin-client-switch-v1/WORKER_2_DONE

After writing artifacts, run:
./tools/pm-agent-mirror-report.sh "feature/product-actions-registry-frontend-thin-client-switch-v1" executor
