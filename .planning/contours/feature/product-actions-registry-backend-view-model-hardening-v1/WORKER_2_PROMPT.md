# Agent 2 / Worker Prompt — Backend Source/Contract Lane

You are Agent 2 / Worker for ProcessMap.

Contour:
feature/product-actions-registry-backend-view-model-hardening-v1

Run ID:
20260519T110751Z-24254

Task:
Inspect the current backend Product Actions Registry source and produce a grounded backend contract hardening report. Do not implement product code.

Read first:
- .planning/contours/feature/product-actions-registry-backend-view-model-hardening-v1/PLAN.md
- .planning/contours/feature/product-actions-registry-backend-view-model-hardening-v1/RAG_PREFLIGHT_PLANNER.md
- .planning/contours/feature/product-actions-registry-backend-view-model-hardening-v1/BACKEND_ENDPOINT_SOURCE_MAP_CHECKLIST.md
- backend/app/routers/product_actions_registry.py
- backend/app/storage.py
- backend/tests/test_product_actions_registry_api.py
- frontend/src/lib/apiRoutes.js
- frontend/src/lib/api.js

Scope:
- inspect backend registry routes, services/storage and tests;
- document existing endpoint contracts;
- identify gaps in summary, filters, sources/session metadata, pagination, export behavior and errors;
- propose minimal backend hardening changes;
- keep current endpoint namespace: /api/analysis/product-actions/registry/*;
- write all reports in Russian.

Strict non-goals:
- no product code implementation;
- no frontend redesign;
- no Properties Registry implementation;
- no Diagram overlays implementation;
- no schema migration unless source proves it is already required;
- no package install;
- no merge/PR/deploy;
- no fake data;
- no endpoint rename to /api/analytics/*;
- no BPMN XML mutation;
- no durable Product Actions mutation;
- no AI auto-write;
- no RAG runtime changes.

Required output files:
- .planning/contours/feature/product-actions-registry-backend-view-model-hardening-v1/WORKER_2_REPORT.md
- .planning/contours/feature/product-actions-registry-backend-view-model-hardening-v1/CONTEXT_USED_EXECUTOR_PART_1.md
- .planning/contours/feature/product-actions-registry-backend-view-model-hardening-v1/READY_FOR_MERGE_PART_1
- .planning/contours/feature/product-actions-registry-backend-view-model-hardening-v1/EXECUTION_PART_1_RUN_ID containing exactly:
  20260519T110751Z-24254
- .planning/contours/feature/product-actions-registry-backend-view-model-hardening-v1/WORKER_2_DONE

If blocked:
- create .planning/contours/feature/product-actions-registry-backend-view-model-hardening-v1/EXEC_PART_1_BLOCKED.md
- do not create WORKER_2_DONE.

Report structure in Russian:
- source files inspected;
- current endpoints and request/response map;
- backend gap list;
- minimal implementation plan;
- tests to add/update;
- non-goal compliance;
- explicit statement that no product code was changed.

