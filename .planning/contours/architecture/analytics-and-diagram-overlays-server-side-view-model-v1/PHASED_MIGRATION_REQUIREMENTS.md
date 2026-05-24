# Phased migration requirements

Run ID: `20260519T090224Z-17699`

## Required phases

### Phase 0 — source-truth and architecture approval
- Objective: approve backend view-model architecture and source map.
- Scope: docs, API drafts, worker reports.
- Non-goals: implementation.
- Validation: Agent 4 `REVIEW_PASS`.
- Risk: dirty/non-canonical workspace must not become product truth.
- Suggested contour: `architecture/analytics-and-diagram-overlays-server-side-view-model-v1`.

### Phase 1 — backend Product Actions Registry read API
- Objective: stabilize backend-owned Product Actions read model.
- Scope: backend router/service/tests.
- Non-goals: frontend redesign, durable Product Actions mutation.
- Likely areas: `backend/app/routers/product_actions_registry.py`, `backend/app/storage.py`, tests.
- Validation: scope/auth/filter/pagination/export tests.
- Risk: endpoint compatibility with existing POST routes.
- Suggested contour: `feature/backend-analytics-actions-view-model-api-v1`.

### Phase 2 — frontend switches Product Actions Registry to backend API
- Objective: remove frontend row/filter/summary computation as primary path.
- Scope: registry page client integration and thin rendering.
- Non-goals: AI bulk apply redesign.
- Likely areas: `ProductActionsRegistryPanel.jsx`, `productActionsRegistryModel.js`, `apiRoutes.js`, `api.js`.
- Validation: UI tests plus network proof.
- Risk: fallback paths keep heavy computation alive.
- Suggested contour: `feature/frontend-actions-registry-thin-client-v1`.

### Phase 3 — backend Properties Registry source extraction/API
- Objective: expose confirmed properties source as read-only backend view-model.
- Scope: `bpmn_meta.camunda_extensions_by_element_id` first.
- Non-goals: fake properties, schema migration.
- Likely areas: backend analytics router/service/storage reads.
- Validation: rows/summary/filters/sources tests.
- Risk: workspace/project aggregation without confirmed source boundaries.
- Suggested contour: `feature/backend-analytics-properties-view-model-api-v1`.

### Phase 4 — frontend Properties Registry page uses backend API
- Objective: make Properties Registry thin-client.
- Scope: replace frontend row shaping with server rows.
- Non-goals: visual redesign beyond necessary states.
- Likely areas: `ProcessPropertiesRegistryPage.jsx`, `api.js`, `apiRoutes.js`.
- Validation: session/project/workspace states, no fake data.
- Risk: empty states must remain honest.
- Suggested contour: `feature/frontend-properties-registry-thin-client-v1`.

### Phase 5 — backend diagram overlay view-model API
- Objective: prepare read-only overlay view-model server-side.
- Scope: source extraction and overlay data contracts.
- Non-goals: renderer implementation, BPMN XML mutation.
- Likely areas: backend analytics/diagram services.
- Validation: source/version/read-only contract tests.
- Risk: backend may lack reliable viewport geometry for culling.
- Suggested contour: `feature/backend-diagram-overlay-view-model-api-v1`.

### Phase 6 — frontend thin overlay renderer / viewport-aware rendering
- Objective: reduce DOM/SVG/bpmn-js overlay cost.
- Scope: viewport culling, zoom thresholds, detail-on-demand.
- Non-goals: backend API changes unless already approved.
- Likely areas: `decorManager.js`, `BpmnStage.jsx`, overlay viewport controllers.
- Validation: overlay counts, drag/pan/zoom proof, no mutation network calls.
- Risk: hidden overlay state desync.
- Suggested contour: `perf/frontend-diagram-overlay-thin-renderer-v1`.

### Phase 7 — exports and optional cache/materialized summaries
- Objective: complete export path and evaluate cache/materialization.
- Scope: server exports and optional summary materialization.
- Non-goals: cache before invalidation semantics are proven.
- Likely areas: backend analytics services and tests.
- Validation: export parity and invalidation tests.
- Risk: stale analytics.
- Suggested contour: `feature/analytics-exports-and-optional-materialized-summaries-v1`.

### Phase 8 — future RAG/AI-assisted analytics
- Objective: backlog read-only suggestions/index freshness.
- Scope: backlog docs only until approved.
- Non-goals: RAG auto-indexer implementation, AI auto-write.
- Likely areas: RAG policy/docs, future contour only.
- Validation: RAG remains read-only.
- Risk: accidental AI/write coupling.
- Suggested contour: `backlog/rag-ai-assisted-analytics-readonly-v1`.
