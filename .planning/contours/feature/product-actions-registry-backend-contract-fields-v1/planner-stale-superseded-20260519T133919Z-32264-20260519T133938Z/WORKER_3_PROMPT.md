You are Agent 3 / Worker — independent contract/test readiness lane for ProcessMap.

Contour:
feature/product-actions-registry-backend-contract-fields-v1

Run ID:
20260519T123355Z-63290

Working directory:
cd /opt/processmap-test

Do not wait for Worker 2.
Do not validate Worker 2 implementation.
Do not merge or create READY_FOR_REVIEW during the part 2 step.

Read:
- .planning/contours/feature/product-actions-registry-backend-contract-fields-v1/PLAN.md
- .planning/contours/feature/product-actions-registry-backend-contract-fields-v1/RAG_PREFLIGHT_PLANNER.md
- .planning/contours/feature/product-actions-registry-backend-contract-fields-v1/OBSIDIAN_CONTEXT_USED.md
- .planning/contours/feature/product-actions-registry-backend-contract-fields-v1/GSD_CONTEXT_USED.md
- .planning/contours/feature/product-actions-registry-backend-contract-fields-v1/API_CONTRACT_FIELDS_ACCEPTANCE.md
- .planning/contours/feature/product-actions-registry-backend-contract-fields-v1/QUERY_EXPORT_PARITY_CHECKLIST.md
- .planning/contours/feature/product-actions-registry-backend-contract-fields-v1/RUNTIME_PROOF_CHECKLIST.md

Independent scope:
- Inspect current frontend API consumers and expectations:
  - frontend/src/lib/apiRoutes.js
  - frontend/src/lib/api.js
  - frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx
  - frontend/src/features/process/analysis/productActionsRegistryModel.js
- Define expected response contract and compatibility rules for:
  - filter_options
  - applied_filters
  - metrics
  - empty_state
  - source_state
- Define query/export parity checklist.
- Define Agent 4 API/runtime review checklist.
- Do not modify product code unless strictly needed for a test-readiness artifact; this lane should normally be planning/reporting only.

Important source truth:
- Current endpoint namespace is /api/analysis/product-actions/registry/*.
- Do not propose /api/analytics/* as current endpoint.
- /api/analytics/* remains a future migration target only.

Expected files:
- .planning/contours/feature/product-actions-registry-backend-contract-fields-v1/EXEC_PART_2_REPORT.md
- .planning/contours/feature/product-actions-registry-backend-contract-fields-v1/CONTEXT_USED_EXECUTOR_PART_2.md
- .planning/contours/feature/product-actions-registry-backend-contract-fields-v1/READY_FOR_MERGE_PART_2
- .planning/contours/feature/product-actions-registry-backend-contract-fields-v1/WORKER_3_DONE
- .planning/contours/feature/product-actions-registry-backend-contract-fields-v1/EXECUTION_PART_2_RUN_ID containing exactly:
  20260519T123355Z-63290

If blocked:
- Write .planning/contours/feature/product-actions-registry-backend-contract-fields-v1/EXEC_PART_2_BLOCKED.md.
- Do not create the legacy global EXEC_BLOCKED.md for part-specific failures.

Report language:
- Write reports and Project Atlas notes in Russian.
- Keep chat compact. Put details in files.

After artifacts:
- Run ./tools/pm-agent-mirror-report.sh "feature/product-actions-registry-backend-contract-fields-v1" executor

