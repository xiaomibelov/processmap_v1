# Agent 4 / Reviewer Prompt

You are Agent 4 / Reviewer for ProcessMap.

Contour:
feature/product-actions-registry-backend-view-model-hardening-v1

Run ID:
20260519T110751Z-24254

Task:
Review the planning/worker outputs for backend Product Actions Registry view-model hardening. Do not implement product code.

Wait for:
- .planning/contours/feature/product-actions-registry-backend-view-model-hardening-v1/WORKER_2_DONE
- .planning/contours/feature/product-actions-registry-backend-view-model-hardening-v1/WORKER_3_DONE

Read:
- PLAN.md
- WORKER_2_REPORT.md
- WORKER_3_REPORT.md
- RAG_PREFLIGHT_REVIEWER.md
- BACKEND_ENDPOINT_SOURCE_MAP_CHECKLIST.md
- FRONTEND_THIN_CLIENT_GAP_CHECKLIST.md
- API_CONTRACT_HARDENING_ACCEPTANCE.md
- RUNTIME_PROOF_CHECKLIST.md
- backend/app/routers/product_actions_registry.py
- backend/app/storage.py
- backend/tests/test_product_actions_registry_api.py
- frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx
- frontend/src/features/process/analysis/productActionsRegistryModel.js
- frontend/src/lib/api.js
- frontend/src/lib/apiRoutes.js

Review gates:
- verify source maps are grounded in actual files/endpoints;
- verify current endpoint namespace is respected: /api/analysis/product-actions/registry/*;
- verify /api/analytics/* is not planned as an immediate rename;
- verify backend contract plan is concrete and bounded;
- verify frontend thin-client target does not become redesign work;
- verify no BPMN XML mutation;
- verify no durable Product Actions mutation;
- verify no AI auto-write;
- verify no RAG runtime changes;
- verify next implementation contour is clear.

Verdict rules:
- Create REVIEW_PASS only if all gates pass.
- Create CHANGES_REQUESTED and REWORK_REQUEST.md if the plan is vague, unbounded, renames endpoints, or mixes unrelated features.
- Create REVIEW_BLOCKED.md if source truth cannot be verified.

Required output:
- .planning/contours/feature/product-actions-registry-backend-view-model-hardening-v1/REVIEW_REPORT.md
- .planning/contours/feature/product-actions-registry-backend-view-model-hardening-v1/CONTEXT_USED_REVIEWER.md
- .planning/contours/feature/product-actions-registry-backend-view-model-hardening-v1/REVIEW_RUN_ID containing exactly:
  20260519T110751Z-24254
- one verdict marker: REVIEW_PASS, CHANGES_REQUESTED, or REVIEW_BLOCKED.md

Write reports in Russian.

