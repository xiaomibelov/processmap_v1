# Phased migration roadmap

Run ID: `20260519T090224Z-17699`
Status: `DRAFT`

## Phase 0 — source-truth and architecture approval

Contour: `architecture/analytics-and-diagram-overlays-server-side-view-model-v1`

Objective: approve source map, draft API contracts, thin-client target and overlay rendering boundary.

Scope: documentation and review only.

Validation: Agent 4 review must verify source grounding, draft wording, mutation boundaries and backend/frontend cost split.

## Phase 1 — backend Product Actions Registry read API

Suggested contour: `feature/backend-analytics-actions-view-model-api-v1`

Objective: expose backend-owned Product Actions read model under the approved target contract or an approved compatibility variant.

Likely areas:

- `backend/app/routers/product_actions_registry.py`
- `backend/app/storage.py`
- backend tests around Product Actions registry query/export

Non-goals:

- frontend redesign;
- Product Actions durable mutation;
- BPMN XML mutation.

Validation:

- scope/auth/filter/sort/pagination tests;
- export parity tests;
- heavy payload exclusion tests.

## Phase 2 — frontend Product Actions Registry thin client

Suggested contour: `feature/frontend-actions-registry-thin-client-v1`

Objective: make Product Actions Registry consume backend rows/summaries as primary truth.

Likely areas:

- `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx`
- `frontend/src/features/process/analysis/productActionsRegistryModel.js`
- `frontend/src/lib/apiRoutes.js`
- frontend API wrappers/tests

Non-goals:

- AI bulk apply redesign;
- Analytics IA redesign.

Validation:

- UI tests for loading/error/empty/data states;
- network proof for server registry calls;
- proof fallback computation is not primary path.

## Phase 3 — backend Properties Registry extraction/API

Suggested contour: `feature/backend-analytics-properties-view-model-api-v1`

Objective: expose read-only property rows from confirmed source `bpmn_meta.camunda_extensions_by_element_id`.

Likely areas:

- backend analytics router/service;
- storage session reads;
- backend tests for property extraction.

Non-goals:

- fake property data;
- schema migration;
- workspace/project aggregation without proven source boundaries.

Validation:

- rows/summary/filters/sources tests;
- honest empty state tests;
- read-only tests.

## Phase 4 — frontend Properties Registry thin client

Suggested contour: `feature/frontend-properties-registry-thin-client-v1`

Objective: make Properties Registry render server rows and summaries.

Likely areas:

- `frontend/src/components/process/analysis/ProcessPropertiesRegistryPage.jsx`
- `frontend/src/lib/apiRoutes.js`
- frontend API wrappers/tests

Non-goals:

- visual redesign beyond necessary states;
- fake rows for project/workspace scope.

Validation:

- session-scope registry UI tests;
- empty source state tests;
- no fake data proof.

## Phase 5 — backend diagram overlay view-model API

Suggested contour: `feature/backend-diagram-overlay-view-model-api-v1`

Objective: prepare read-only overlay data server-side.

Likely areas:

- backend analytics/diagram services;
- session metadata source reads;
- backend tests for signatures/source versions.

Non-goals:

- frontend renderer implementation;
- BPMN XML mutation;
- viewport endpoint unless geometry semantics are proven.

Validation:

- response contract tests;
- source/version/signature tests;
- no mutation tests.

## Phase 6 — frontend thin overlay renderer

Suggested contour: `perf/frontend-diagram-overlay-thin-renderer-v1`

Objective: reduce DOM/SVG/bpmn-js overlay cost with viewport-aware rendering.

Likely areas:

- `frontend/src/features/process/bpmn/stage/decor/decorManager.js`
- `frontend/src/components/process/BpmnStage.jsx`
- overlay viewport controllers/orchestration

Non-goals:

- backend contract redesign unless approved;
- editing overlays.

Validation:

- overlay DOM count proof;
- real pan/zoom/drag proof;
- no mutation network calls from view interactions;
- large-diagram runtime screenshot/profile evidence.

## Phase 7 — exports and optional materialized summaries

Suggested contour: `feature/analytics-exports-and-optional-materialized-summaries-v1`

Objective: complete export parity and evaluate cache/materialization only after read API semantics are stable.

Non-goals:

- cache before invalidation semantics are proven;
- stale analytics acceptance without explicit product decision.

Validation:

- export parity tests;
- invalidation tests if materialization is introduced.

## Phase 8 — RAG/AI-assisted analytics backlog

Suggested contour: `backlog/rag-ai-assisted-analytics-readonly-v1`

Objective: evaluate RAG/nightly indexing and AI-assisted read-only suggestions as a future backlog lane.

Non-goals:

- RAG auto-indexing implementation in this contour;
- AI auto-write;
- Product Actions auto-apply;
- BPMN XML mutation.

Validation:

- RAG remains read-only;
- suggestions are clearly non-canonical until reviewed/applied through explicit product flows.

