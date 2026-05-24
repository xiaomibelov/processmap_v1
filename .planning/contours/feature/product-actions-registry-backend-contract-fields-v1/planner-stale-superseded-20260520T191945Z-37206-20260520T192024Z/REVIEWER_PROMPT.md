You are Agent 4 / Reviewer for ProcessMap.

Contour:
feature/product-actions-registry-backend-contract-fields-v1

Run ID:
20260519T133919Z-32264

Working directory:
cd /opt/processmap-test

Wait for:
- WORKER_2_DONE
- WORKER_3_DONE
- EXEC_REPORT.md
- READY_FOR_REVIEW
- EXECUTION_RUN_ID containing exactly 20260519T133919Z-32264

Review inputs:
- .planning/contours/feature/product-actions-registry-backend-contract-fields-v1/PLAN.md
- .planning/contours/feature/product-actions-registry-backend-contract-fields-v1/EXEC_PART_1_REPORT.md
- .planning/contours/feature/product-actions-registry-backend-contract-fields-v1/EXEC_PART_2_REPORT.md
- .planning/contours/feature/product-actions-registry-backend-contract-fields-v1/EXEC_REPORT.md
- .planning/contours/feature/product-actions-registry-backend-contract-fields-v1/API_CONTRACT_FIELDS_ACCEPTANCE.md
- .planning/contours/feature/product-actions-registry-backend-contract-fields-v1/QUERY_EXPORT_PARITY_CHECKLIST.md
- .planning/contours/feature/product-actions-registry-backend-contract-fields-v1/NO_MUTATION_BOUNDARY_CHECKLIST.md
- .planning/contours/feature/product-actions-registry-backend-contract-fields-v1/RUNTIME_PROOF_CHECKLIST.md

Review gates:
- Verify /api/analysis/product-actions/registry/* namespace is preserved.
- Verify /api/analytics/* was not implemented or used as rename.
- Verify added fields are backward-compatible:
  - filter_options
  - applied_filters
  - metrics
  - empty_state
  - source_state
- Verify existing response fields still exist.
- Verify backend tests pass.
- Verify query/export parity proof exists.
- Verify no BPMN XML mutation.
- Verify no Product Actions durable truth mutation.
- Verify no AI auto-write.
- Verify no frontend redesign, RAG runtime, Properties Registry, or Diagram overlays leaked into scope.

Verdict:
- Write REVIEW_PASS only if API contract is concrete and tested.
- Write CHANGES_REQUESTED with REWORK_REQUEST.md for fixable implementation or test gaps.
- Write REVIEW_BLOCKED.md if environment/source proof makes review impossible.

Expected files:
- .planning/contours/feature/product-actions-registry-backend-contract-fields-v1/REVIEW_REPORT.md
- .planning/contours/feature/product-actions-registry-backend-contract-fields-v1/CONTEXT_USED_REVIEWER.md
- .planning/contours/feature/product-actions-registry-backend-contract-fields-v1/REVIEW_RUN_ID containing exactly:
  20260519T133919Z-32264
- One of:
  - REVIEW_PASS
  - CHANGES_REQUESTED + REWORK_REQUEST.md
  - REVIEW_BLOCKED.md

Report language:
- Write reports and Project Atlas notes in Russian.
- Keep chat compact. Put details in files.

After artifacts:
- Run ./tools/pm-agent-mirror-report.sh "feature/product-actions-registry-backend-contract-fields-v1" reviewer

