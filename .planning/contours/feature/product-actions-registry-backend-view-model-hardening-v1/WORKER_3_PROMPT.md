# Agent 3 / Worker Prompt — Frontend Thin-Client Readiness Lane

You are Agent 3 / Worker for ProcessMap.

Contour:
feature/product-actions-registry-backend-view-model-hardening-v1

Run ID:
20260519T110751Z-24254

Task:
Inspect frontend Product Actions Registry usage and produce a grounded thin-client readiness report. Do not wait for Agent 2. Do not validate Agent 2. Do not implement product code.

Read first:
- .planning/contours/feature/product-actions-registry-backend-view-model-hardening-v1/PLAN.md
- .planning/contours/feature/product-actions-registry-backend-view-model-hardening-v1/RAG_PREFLIGHT_PLANNER.md
- .planning/contours/feature/product-actions-registry-backend-view-model-hardening-v1/FRONTEND_THIN_CLIENT_GAP_CHECKLIST.md
- frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx
- frontend/src/features/process/analysis/productActionsRegistryModel.js
- frontend/src/components/process/analysis/registry/*
- frontend/src/lib/api.js
- frontend/src/lib/apiRoutes.js

Scope:
- inspect frontend registry usage of backend data;
- identify computations still happening on frontend;
- define target thin-client backend contract;
- prepare Agent 4 review checklist;
- keep reports in Russian;
- do not wait for Worker 2 reports or markers.

Strict non-goals:
- no product code implementation;
- no frontend redesign;
- no Properties Registry implementation;
- no Diagram overlays implementation;
- no package install;
- no merge/PR/deploy;
- no endpoint rename to /api/analytics/*;
- no BPMN XML mutation;
- no durable Product Actions mutation;
- no AI auto-write;
- no RAG runtime changes.

Required output files:
- .planning/contours/feature/product-actions-registry-backend-view-model-hardening-v1/WORKER_3_REPORT.md
- .planning/contours/feature/product-actions-registry-backend-view-model-hardening-v1/CONTEXT_USED_EXECUTOR_PART_2.md
- .planning/contours/feature/product-actions-registry-backend-view-model-hardening-v1/READY_FOR_MERGE_PART_2
- .planning/contours/feature/product-actions-registry-backend-view-model-hardening-v1/EXECUTION_PART_2_RUN_ID containing exactly:
  20260519T110751Z-24254
- .planning/contours/feature/product-actions-registry-backend-view-model-hardening-v1/WORKER_3_DONE

If blocked:
- create .planning/contours/feature/product-actions-registry-backend-view-model-hardening-v1/EXEC_PART_2_BLOCKED.md
- do not create WORKER_3_DONE.

Report structure in Russian:
- frontend files inspected;
- current backend-data usage map;
- computations still in frontend;
- thin-client target contract;
- compatibility risks;
- Agent 4 review checklist;
- explicit statement that no product code was changed.

