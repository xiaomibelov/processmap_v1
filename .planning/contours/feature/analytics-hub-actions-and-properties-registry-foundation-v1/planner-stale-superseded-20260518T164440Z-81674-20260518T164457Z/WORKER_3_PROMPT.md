# Agent 3 / Worker prompt

Contour: `feature/analytics-hub-actions-and-properties-registry-foundation-v1`  
Run ID: `20260518T150609Z-73248`  
Role: Agent 3 / Worker, independent UX/source-truth/backlog lane

Write all reports in Russian.

## Read first

- `.planning/contours/feature/analytics-hub-actions-and-properties-registry-foundation-v1/PLAN.md`
- `.planning/contours/feature/analytics-hub-actions-and-properties-registry-foundation-v1/RAG_PREFLIGHT_PLANNER.md`
- `.planning/contours/feature/analytics-hub-actions-and-properties-registry-foundation-v1/RAG_PREFLIGHT_REVIEWER.md`
- `.planning/contours/feature/analytics-hub-actions-and-properties-registry-foundation-v1/ANALYTICS_RESTORE_REQUIREMENTS.md`
- `.planning/contours/feature/analytics-hub-actions-and-properties-registry-foundation-v1/PROPERTIES_REGISTRY_FOUNDATION_PLAN.md`
- `.planning/contours/feature/analytics-hub-actions-and-properties-registry-foundation-v1/RAG_BACKLOG_NOTES.md`
- `.planning/contours/feature/analytics-hub-actions-and-properties-registry-foundation-v1/STATE.json`

## Independent scope

This lane is specification, UX/source-truth and backlog preparation. Do not write product code.

Tasks:

- Define acceptance criteria for restored `Аналитика`.
- Define boundary rules:
  - Analytics Hub;
  - Actions Registry inner page;
  - Properties Registry foundation;
  - Dashboard placeholder;
  - Export inside concrete registries only.
- Inspect source/runtime/docs for actual existing property sources.
- Classify property registry data as:
  - confirmed current source;
  - hypothesis;
  - future backend/API requirement.
- Create RAG backlog note for future auto-indexing/nightly indexing.
- Prepare Agent 4 runtime review checklist.
- Write reports in Russian.
- Create `WORKER_3_DONE`.

## Property categories to investigate

Mark a category as confirmed only with source/runtime evidence:

- BPMN element properties.
- Overlay/property tags visible on diagram.
- Product/process attributes.
- Process step metadata.
- DoD/quality properties.
- Lane/role/location/equipment/product-related properties.

## RAG backlog scope

Backlog-only:

- admin RAG auto-indexing;
- nightly indexing schedule;
- indexing new Project Atlas files;
- detecting unindexed docs;
- future link/file ingestion.

No implementation in this contour:

- no scheduler;
- no indexer changes;
- no RAG runtime/API/UI;
- no link/file ingestion implementation.

## Required outputs

- `WORKER_3_REPORT.md`
- `ANALYTICS_RESTORE_ACCEPTANCE_CRITERIA.md`
- `REGISTRY_BOUNDARY_RULES.md`
- `PROPERTIES_SOURCE_TRUTH_REVIEW.md`
- `PROPERTIES_CONFIRMED_VS_HYPOTHESIS.md`
- `RAG_AUTO_INDEXING_BACKLOG_NOTE.md`
- `AGENT4_REVIEW_CHECKLIST.md`
- `WORKER_3_DONE`
- `READY_FOR_MERGE_PART_2`

If blocked, create `EXEC_PART_2_BLOCKED.md` and do not create done/merge markers.
