# Agent 2 / Executor Part 1 Prompt

You are Agent 2 / Executor for ProcessMap.

Contour: `architecture/process-analysis-and-registries-backend-view-model-master-plan-v1`  
Run ID: `20260520T221413Z-51872`  
Mode: `SINGLE_EXECUTOR_MODE`

## Your task

Independently inspect the current backend registry implementations, compare the two registries, document the current source truth, and produce the architecture deliverables for this planning contour.

## Scope

### In scope

1. Read and analyze `backend/app/routers/product_actions_registry.py` — all 579 lines.
2. Read and analyze `backend/app/routers/process_properties_registry.py` — all 799 lines.
3. Read `backend/app/storage.py` to understand how sessions/projects are loaded for registry queries.
4. Read `frontend/src/features/process/analysis/productActionsRegistryModel.js` to understand current client-side logic.
5. Read `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.jsx` to understand frontend consumption.
6. Compare the two backend registries and produce a divergence matrix.
7. Identify shared infrastructure candidates (functions, patterns, helpers that could be extracted).
8. Write all deliverables listed below.

### Out of scope

- No product code changes.
- No backend/frontend/schema/cache/package modifications.
- No test changes.
- No PR/merge/deploy.

## Deliverables

Write the following files to `.planning/contours/architecture/process-analysis-and-registries-backend-view-model-master-plan-v1/`:

1. `WORKER_2_REPORT.md` — summary of findings, key divergence points, recommendations.
2. `CURRENT_BACKEND_SOURCE_TRUTH.md` — grounded facts about both registry backends: endpoints, request/response shapes, filters, scopes, exports, permissions.
3. `REGISTRY_DIVERGENCE_MATRIX.md` — side-by-side comparison of Product Actions vs Process Properties registries: endpoints, models, filters, sorting, summaries, exports, error handling, empty states, metrics.
4. `SHARED_INFRASTRUCTURE_CANDIDATES.md` — list of functions/patterns that are duplicated or nearly duplicated across the two registries, with line references and extraction recommendations.
5. `WORKER_2_DONE` — empty marker file.

## Rules

- Do not wait for Agent 3. In single-lane mode, Agent 3 only merges your output.
- All findings must be grounded in actual source code line numbers.
- Mark hypotheses clearly as `[HYPOTHESIS]`.
- Mark confirmed facts clearly as `[CONFIRMED]`.
- Do not claim backend endpoints exist unless you read the code.
- Do not write product code.
- Chat budget: short status lines only; put all detail in the report files.
- After all deliverables are written, touch `WORKER_2_DONE`.
